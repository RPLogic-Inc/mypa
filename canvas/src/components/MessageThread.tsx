import { useState, useRef, useEffect } from 'react';
import { TezBubble } from './TezBubble';
import type { Tez, ContextLayer } from '../types';

const LAYER_OPTIONS: { value: ContextLayer['layer']; label: string }[] = [
  { value: 'background', label: 'Background' },
  { value: 'fact', label: 'Fact' },
  { value: 'artifact', label: 'Artifact' },
  { value: 'relationship', label: 'Relationship' },
  { value: 'constraint', label: 'Constraint' },
  { value: 'hint', label: 'Hint' },
];

type ScopeChoice = 'team' | 'private';

interface MessageThreadProps {
  messages: Tez[];
  currentUserId: string;
  title: string;
  /** viewType determines whether scope picker is shown (team views only) */
  viewType?: 'team' | 'conversation';
  onSend: (text: string, context?: ContextLayer[], replyToId?: string, visibility?: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onViewContext?: (tezId: string) => void;
  onUpdateTezStatus?: (tezId: string, status: Tez['status']) => void;
}

export function MessageThread({ messages, currentUserId, title, viewType, onSend, onLoadMore, hasMore, onViewContext, onUpdateTezStatus }: MessageThreadProps) {
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<Tez | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [contextLayers, setContextLayers] = useState<ContextLayer[]>([]);
  const [newLayerType, setNewLayerType] = useState<ContextLayer['layer']>('background');
  const [newLayerContent, setNewLayerContent] = useState('');
  const [scope, setScope] = useState<ScopeChoice>('private');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const visibility = viewType === 'team' ? scope : undefined;
    onSend(text, contextLayers.length > 0 ? contextLayers : undefined, replyTo?.id, visibility);
    setInput('');
    setContextLayers([]);
    setShowContext(false);
    setReplyTo(null);
  };

  const addLayer = () => {
    const content = newLayerContent.trim();
    if (!content) return;
    setContextLayers(prev => [...prev, { layer: newLayerType, content }]);
    setNewLayerContent('');
  };

  const removeLayer = (index: number) => {
    setContextLayers(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-zinc-900">
        {hasMore && (
          <button onClick={onLoadMore} className="w-full text-center text-sm text-blue-600 py-2">
            Load earlier messages
          </button>
        )}
        {messages.map(msg => (
          <TezBubble
            key={msg.id}
            tez={msg}
            isOwn={msg.senderUserId === currentUserId}
            onViewContext={onViewContext}
            onReply={setReplyTo}
            onUpdateStatus={onUpdateTezStatus}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Context attachment panel */}
      {showContext && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Context Iceberg</span>
            <button onClick={() => setShowContext(false)} className="text-xs text-zinc-400 hover:text-zinc-600">&times; Close</button>
          </div>

          {/* Existing layers */}
          {contextLayers.map((layer, i) => (
            <div key={i} className="flex items-start gap-2 mb-2 bg-white dark:bg-zinc-800 rounded-lg p-2 border border-zinc-200 dark:border-zinc-700">
              <span className="text-xs font-medium text-zinc-500 shrink-0 mt-0.5">{layer.layer}</span>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 line-clamp-2">{layer.content}</p>
              <button onClick={() => removeLayer(i)} className="text-xs text-zinc-400 hover:text-red-500 shrink-0">&times;</button>
            </div>
          ))}

          {/* Add new layer */}
          <div className="flex gap-2">
            <select
              value={newLayerType}
              onChange={e => setNewLayerType(e.target.value as ContextLayer['layer'])}
              className="px-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300"
            >
              {LAYER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={newLayerContent}
              onChange={e => setNewLayerContent(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLayer()}
              placeholder="Add context..."
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={addLayer}
              disabled={!newLayerContent.trim()}
              className="px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-3 pt-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-2">
          <div className="flex-1 pl-3 border-l-2 border-blue-500">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              Replying to {replyTo.senderName || 'message'}
            </div>
            <div className="text-xs text-zinc-500 truncate">{replyTo.surfaceText}</div>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-zinc-400 hover:text-zinc-600 text-sm">&times;</button>
        </div>
      )}

      {/* Compose */}
      <div className={`p-3 ${replyTo ? '' : 'border-t border-zinc-200 dark:border-zinc-800'} bg-white dark:bg-zinc-950`}>
        {/* Scope picker — only shown for team channel sends */}
        {viewType === 'team' && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-500">Share to:</span>
            <button
              onClick={() => setScope('private')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                scope === 'private'
                  ? 'bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Just me
            </button>
            <button
              onClick={() => setScope('team')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                scope === 'team'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Whole team
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setShowContext(!showContext)}
            className={`px-3 py-2 rounded-full text-sm transition-colors ${
              contextLayers.length > 0
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title="Attach context"
          >
            <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            {contextLayers.length > 0 && <span className="ml-1">{contextLayers.length}</span>}
          </button>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
