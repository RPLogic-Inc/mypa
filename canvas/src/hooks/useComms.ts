import { useState, useCallback, useEffect, useRef } from 'react';
import { conversations, teams as teamsApi, tez as tezApi, unread } from '../services/api';
import type { Conversation, Tez, TezFull, ContextLayer, Team, UnreadCounts } from '../types';

export type CommsViewType = 'conversation' | 'team';

// ─────────────────────────────────────────────────────────────────────────────
// SSE URL construction
// ─────────────────────────────────────────────────────────────────────────────

function getSSEBaseUrl(): string {
  if (typeof window === 'undefined') return '/api';
  const host = window.location.hostname.toLowerCase();
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat';

  // Production: oc.{domain} — nginx proxies /api/* → relay :3002 (strip /api)
  // Production: app.{domain} — same nginx rewrite
  if (host === `oc.${baseDomain}` || host === `app.${baseDomain}`) {
    return '/api';
  }

  // Other subdomains under the base domain
  if (host.endsWith(`.${baseDomain}`)) {
    return `https://api.${baseDomain}/api`;
  }

  // Dev: Vite proxy rewrites /api/* → localhost:3002/*
  return '/api';
}

// Polling intervals (ms)
const POLL_INTERVAL_WITH_SSE = 60_000;   // Safety-net poll when SSE is connected
const POLL_INTERVAL_WITHOUT_SSE = 10_000; // Fast poll when SSE is down

export function useComms(token: string | null) {
  const [convList, setConvList] = useState<Conversation[]>([]);
  const [teamList, setTeamList] = useState<Team[]>([]);
  const [messages, setMessages] = useState<Tez[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts | null>(null);
  const [selected, setSelected] = useState<{ type: CommsViewType; id: string } | null>(null);
  const [contextTez, setContextTez] = useState<TezFull | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [activityItems, setActivityItems] = useState<Array<{
    id: string;
    type: string;
    text: string;
    timestamp: number;
  }>>([]);

  const pushActivity = useCallback((type: string, text: string) => {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setActivityItems(prev => [{ id, type, text, timestamp: Date.now() }, ...prev].slice(0, 20));
  }, []);

  // Refs for values that callbacks need without re-creating the callback
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await conversations.list();
      setConvList(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const res = await teamsApi.list();
      setTeamList(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const res = await unread.counts();
      setUnreadCounts(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadMessages = useCallback(async (type: CommsViewType, id: string) => {
    try {
      if (type === 'conversation') {
        const res = await conversations.messages(id);
        setMessages(res.data.reverse());
        setHasMore(res.meta.hasMore);
        conversations.markRead(id).catch(() => {});
      } else {
        const res = await tezApi.stream(id);
        setMessages(res.data.reverse());
        setHasMore(res.meta.hasMore);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!token) return;
    loadConversations();
    loadTeams();
    loadUnreadCounts();
  }, [token, loadConversations, loadTeams, loadUnreadCounts]);

  // Load messages on selection change
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    loadMessages(selected.type, selected.id);
  }, [selected, loadMessages]);

  // ───────────────────────────────────────────────────────────────────────────
  // SSE connection
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;

    // Don't open SSE if EventSource is not available (very old browsers)
    if (typeof EventSource === 'undefined') {
      setSseConnected(false);
      return;
    }

    const baseUrl = getSSEBaseUrl();
    const url = `${baseUrl}/events/subscribe?token=${encodeURIComponent(token)}`;

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    function connect() {
      es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
      };

      // Handle specific event types
      es.addEventListener('new_tez', (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data || '{}');
          pushActivity('new_tez', d.senderName ? `New tez from ${d.senderName}` : 'New tez shared');
        } catch { pushActivity('new_tez', 'New tez shared'); }
        loadConversations();
        loadUnreadCounts();
        const sel = selectedRef.current;
        if (sel) loadMessages(sel.type, sel.id);
      });

      es.addEventListener('new_message', (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data || '{}');
          pushActivity('new_message', d.senderName ? `Message from ${d.senderName}` : 'New message received');
        } catch { pushActivity('new_message', 'New message received'); }
        loadConversations();
        loadUnreadCounts();
        const sel = selectedRef.current;
        if (sel) loadMessages(sel.type, sel.id);
      });

      es.addEventListener('new_reply', (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data || '{}');
          pushActivity('new_reply', d.senderName ? `Reply from ${d.senderName}` : 'New reply in thread');
        } catch { pushActivity('new_reply', 'New reply in thread'); }
        loadConversations();
        loadUnreadCounts();
        const sel = selectedRef.current;
        if (sel) loadMessages(sel.type, sel.id);
      });

      es.addEventListener('tez_updated', () => {
        pushActivity('tez_updated', 'Tez updated');
        const sel = selectedRef.current;
        if (sel) loadMessages(sel.type, sel.id);
      });

      es.addEventListener('unread_update', () => {
        loadUnreadCounts();
      });

      es.onerror = () => {
        // EventSource auto-reconnects, but if it goes to CLOSED state we
        // need to reconnect manually.  Mark SSE as disconnected so polling
        // speeds up.
        setSseConnected(false);

        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          eventSourceRef.current = null;
          // Exponential-ish backoff: try again in 5 s
          reconnectTimeout = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (es) {
        es.close();
        eventSourceRef.current = null;
      }
      setSseConnected(false);
    };
  }, [token, loadConversations, loadUnreadCounts, loadMessages, pushActivity]);

  // ───────────────────────────────────────────────────────────────────────────
  // Polling — slower when SSE is active, faster as fallback
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      loadConversations();
      loadUnreadCounts();
      if (selected) loadMessages(selected.type, selected.id);
    }, sseConnected ? POLL_INTERVAL_WITH_SSE : POLL_INTERVAL_WITHOUT_SSE);
    return () => clearInterval(interval);
  }, [token, selected, sseConnected, loadConversations, loadUnreadCounts, loadMessages]);

  const handleSelect = useCallback((type: CommsViewType, id: string) => {
    setSelected({ type, id });
    setContextTez(null);
  }, []);

  const handleSend = useCallback(async (text: string, context?: ContextLayer[], replyToId?: string, visibility?: string) => {
    if (!selected) return;
    try {
      if (replyToId) {
        const res = await tezApi.reply(replyToId, { surfaceText: text, context });
        setMessages(prev => [...prev, res.data]);
      } else if (selected.type === 'conversation') {
        const res = await conversations.send(selected.id, { surfaceText: text, context });
        setMessages(prev => [...prev, res.data]);
      } else {
        const res = await tezApi.share({
          teamId: selected.id,
          surfaceText: text,
          context,
          visibility: (visibility as 'team' | 'dm' | 'private') || 'private',
        });
        setMessages(prev => [...prev, res.data]);
      }
      loadConversations();
    } catch (err) {
      console.error('Send failed:', err);
    }
  }, [selected, loadConversations]);

  const handleLoadMore = useCallback(async () => {
    if (!selected || messages.length === 0) return;
    const oldest = messages[0];
    try {
      if (selected.type === 'conversation') {
        const res = await conversations.messages(selected.id, oldest.createdAt);
        setMessages(prev => [...res.data.reverse(), ...prev]);
        setHasMore(res.meta.hasMore);
      } else {
        const res = await tezApi.stream(selected.id, oldest.createdAt);
        setMessages(prev => [...res.data.reverse(), ...prev]);
        setHasMore(res.meta.hasMore);
      }
    } catch { /* ignore */ }
  }, [selected, messages]);

  const handleViewContext = useCallback(async (tezId: string) => {
    try {
      const res = await tezApi.get(tezId);
      setContextTez(res.data);
    } catch { /* ignore */ }
  }, []);

  const handleUpdateTezStatus = useCallback(async (tezId: string, status: Tez['status']) => {
    try {
      await tezApi.update(tezId, { status });
      if (status !== 'active') {
        setMessages(prev => prev.filter(m => m.id !== tezId));
      }
      // Refresh lists for consistency (covers other devices + other members)
      loadConversations();
      loadUnreadCounts();
      const sel = selectedRef.current;
      if (sel) loadMessages(sel.type, sel.id);
    } catch (err) {
      console.error('Update Tez status failed:', err);
    }
  }, [loadConversations, loadUnreadCounts, loadMessages]);

  return {
    convList,
    teamList,
    messages,
    hasMore,
    unreadCounts,
    selected,
    contextTez,
    activityItems,
    sseConnected,
    setContextTez,
    handleSelect,
    handleSend,
    handleLoadMore,
    handleViewContext,
    handleUpdateTezStatus,
    loadConversations,
    loadTeams,
    loadUnreadCounts,
    setTeamList,
    setSelected,
  };
}
