import { useState, useRef, useCallback } from 'react';
import type { ContextLayer } from '../types';
import { openclawChat } from '../services/api';

interface ContextViewerProps {
  layers: ContextLayer[];
  onClose: () => void;
}

interface QAPair {
  question: string;
  answer: string;
  isStreaming?: boolean;
}

const LAYER_LABELS: Record<string, { label: string; color: string }> = {
  background: { label: 'Background', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  fact: { label: 'Fact', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  artifact: { label: 'Artifact', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  relationship: { label: 'Relationship', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  constraint: { label: 'Constraint', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  hint: { label: 'Hint', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
};

function buildTipSystemPrompt(layers: ContextLayer[]): string {
  const contextBlock = layers
    .map(l => `[${l.layer.toUpperCase()}${l.confidence != null ? ` (${l.confidence}% confidence)` : ''}${l.source ? ` — ${l.source}` : ''}]\n${l.content}`)
    .join('\n\n');

  return `You are the Tez Interrogation Protocol (TIP) assistant. You answer questions ONLY from the transmitted context below. Never use outside knowledge.

RULES:
- Answer strictly from the provided context
- If the context doesn't contain the answer, say so clearly
- Cite which context layer(s) your answer draws from
- Be concise and direct

CONTEXT:
${contextBlock}`;
}

type TabView = 'layers' | 'interrogate';

export function ContextViewer({ layers, onClose }: ContextViewerProps) {
  const [tab, setTab] = useState<TabView>('layers');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QAPair[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q || isAsking || layers.length === 0) return;

    setQuestion('');
    setIsAsking(true);

    const newPair: QAPair = { question: q, answer: '', isStreaming: true };
    setHistory(prev => [...prev, newPair]);

    try {
      const systemPrompt = buildTipSystemPrompt(layers);
      const messages = [
        { role: 'system', content: systemPrompt },
        // Include prior Q&A for session continuity
        ...history.flatMap(h => [
          { role: 'user' as const, content: h.question },
          { role: 'assistant' as const, content: h.answer },
        ]),
        { role: 'user', content: q },
      ];

      const res = await openclawChat.stream(messages, { temperature: 0.1 });
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              accumulated += token;
              const current = accumulated;
              setHistory(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { question: q, answer: current, isStreaming: true };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      // Finalize
      setHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { question: q, answer: accumulated || 'No response received.', isStreaming: false };
        return updated;
      });
    } catch (err) {
      setHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          question: q,
          answer: `Error: ${err instanceof Error ? err.message : 'Failed to interrogate'}`,
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsAsking(false);
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    }
  }, [question, isAsking, layers, history]);

  return (
    <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Context Iceberg</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">&times;</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setTab('layers')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            tab === 'layers'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Layers ({layers.length})
        </button>
        <button
          onClick={() => setTab('interrogate')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            tab === 'interrogate'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          Ask (TIP)
        </button>
      </div>

      {/* Layers tab */}
      {tab === 'layers' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {layers.map((layer, i) => {
            const meta = LAYER_LABELS[layer.layer] || { label: layer.layer, color: 'bg-zinc-100 text-zinc-800' };
            return (
              <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${meta.color}`}>
                  {meta.label}
                </span>
                {layer.confidence != null && (
                  <span className="text-xs text-zinc-400 ml-2">{layer.confidence}% confidence</span>
                )}
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{layer.content}</p>
                {layer.source && (
                  <span className="text-xs text-zinc-400 mt-1 block">{layer.source}</span>
                )}
              </div>
            );
          })}
          {layers.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">No context layers</p>
          )}
        </div>
      )}

      {/* Interrogate tab */}
      {tab === 'interrogate' && (
        <div className="flex-1 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {layers.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-8">No context to interrogate</p>
            ) : history.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-zinc-500 mb-2">Ask questions about this Tez's context.</p>
                <p className="text-xs text-zinc-400">Answers are grounded strictly in the transmitted context layers.</p>
              </div>
            ) : (
              history.map((pair, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-3 py-2 max-w-[85%]">
                      <p className="text-sm">{pair.question}</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-bl-md px-3 py-2 max-w-[85%]">
                      <p className="text-sm whitespace-pre-wrap">{pair.answer || (pair.isStreaming ? '...' : '')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          {layers.length > 0 && (
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                  placeholder="Ask about this context..."
                  disabled={isAsking}
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  onClick={handleAsk}
                  disabled={!question.trim() || isAsking || layers.length === 0}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
