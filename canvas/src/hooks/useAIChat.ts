import { useState, useCallback, useEffect, useRef } from 'react';
import { openclawChat } from '../services/api';
import { parseSSEStream } from '../lib/sseParser';
import * as storage from '../lib/chatStorage';
import { formatBytes } from '../lib/fileUtils';
import type { AIChatMessage, AIChatSession, FileAttachment, ContentPart } from '../types';

export function useAIChat() {
  const [sessions, setSessions] = useState<AIChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<AIChatSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load sessions on mount
  useEffect(() => {
    storage.listSessions().then(list => {
      setSessions(list);
      if (list.length > 0) {
        setActiveSession(list[0]);
      } else {
        const newSession = storage.createSession();
        storage.saveSession(newSession);
        setSessions([newSession]);
        setActiveSession(newSession);
      }
    });
  }, []);

  const createNewSession = useCallback(async () => {
    const newSession = storage.createSession();
    await storage.saveSession(newSession);
    setSessions(prev => [newSession, ...prev]);
    setActiveSession(newSession);
    setError(null);
  }, []);

  const switchSession = useCallback(async (id: string) => {
    const session = await storage.getSession(id);
    if (session) {
      setActiveSession(session);
      setError(null);
    }
  }, []);

  const deleteSessionById = useCallback(async (id: string) => {
    await storage.deleteSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.id === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        setActiveSession(remaining[0]);
      } else {
        const newSession = storage.createSession();
        await storage.saveSession(newSession);
        setSessions([newSession]);
        setActiveSession(newSession);
      }
    }
  }, [activeSession, sessions]);

  const sendMessage = useCallback(async (text: string, attachments?: FileAttachment[]) => {
    if (!activeSession || isStreaming) return;

    setError(null);
    const userMsg: AIChatMessage = { role: 'user', content: text, attachments };
    const updatedMessages = [...activeSession.messages, userMsg];

    // Update session with user message
    const updatedSession: AIChatSession = {
      ...activeSession,
      messages: updatedMessages,
      title: activeSession.messages.length === 0 ? storage.generateTitle([userMsg]) : activeSession.title,
      updatedAt: new Date().toISOString(),
    };
    setActiveSession(updatedSession);
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
    await storage.saveSession(updatedSession);

    // Build multimodal messages for API (convert attachments to content parts)
    const messagesForAPI = updatedMessages.map(m => {
      if (!m.attachments?.length) return { role: m.role, content: m.content };

      const parts: ContentPart[] = [];
      if (m.content.trim()) parts.push({ type: 'text' as const, text: m.content });

      for (const att of m.attachments) {
        if (att.isImage && att.base64DataUrl) {
          parts.push({ type: 'image_url' as const, image_url: { url: att.base64DataUrl } });
        } else {
          parts.push({ type: 'text' as const, text: `[Attached: ${att.originalName} (${att.mimeType}, ${formatBytes(att.size)})]` });
        }
      }
      return { role: m.role, content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts };
    });

    // Start streaming
    setIsStreaming(true);
    const assistantMsg: AIChatMessage = { role: 'assistant', content: '' };
    let fullContent = '';

    try {
      const response = await openclawChat.stream(messagesForAPI);

      for await (const chunk of parseSSEStream(response)) {
        fullContent += chunk;
        assistantMsg.content = fullContent;
        const streamingSession: AIChatSession = {
          ...updatedSession,
          messages: [...updatedMessages, { ...assistantMsg }],
          updatedAt: new Date().toISOString(),
        };
        setActiveSession(streamingSession);
      }

      // Save final state
      const finalSession: AIChatSession = {
        ...updatedSession,
        messages: [...updatedMessages, { role: 'assistant', content: fullContent }],
        updatedAt: new Date().toISOString(),
      };
      setActiveSession(finalSession);
      setSessions(prev => prev.map(s => s.id === finalSession.id ? finalSession : s));
      await storage.saveSession(finalSession);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Failed to get AI response';
      setError(msg);
      // Save what we have so far
      if (fullContent) {
        const partialSession: AIChatSession = {
          ...updatedSession,
          messages: [...updatedMessages, { role: 'assistant', content: fullContent }],
          updatedAt: new Date().toISOString(),
        };
        await storage.saveSession(partialSession);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [activeSession, isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    sessions,
    activeSession,
    isStreaming,
    error,
    sendMessage,
    createNewSession,
    switchSession,
    deleteSessionById,
    stopStreaming,
  };
}
