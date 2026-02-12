import { useEffect, useRef, useState } from 'react';
import { tez as tezApi } from '../services/api';
import type { Tez } from '../types';

interface TezBubbleProps {
  tez: Tez;
  isOwn: boolean;
  onViewContext?: (tezId: string) => void;
  onReply?: (tez: Tez) => void;
  onUpdateStatus?: (tezId: string, status: Tez['status']) => void;
}

function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TezBubble({ tez, isOwn, onViewContext, onReply, onUpdateStatus }: TezBubbleProps) {
  const time = new Date(tez.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hasContext = (tez.contextCount ?? 0) > 0;
  const isReply = !!tez.parentTezId;

  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const copyToClipboard = async () => {
    setActionMessage(null);
    try {
      await navigator.clipboard.writeText(tez.surfaceText);
      setActionMessage('Copied');
      setTimeout(() => setActionMessage(null), 1200);
    } catch {
      setActionMessage('Copy failed');
    }
  };

  const exportJson = async () => {
    if (exporting) return;
    setActionMessage(null);
    setExporting(true);
    try {
      const res = await tezApi.get(tez.id);
      const payload = res.data;
      downloadText(`tez-${tez.id.slice(0, 8)}.json`, JSON.stringify(payload, null, 2), 'application/json');
      setMenuOpen(false);
    } catch {
      setActionMessage('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const requestStatusChange = (status: Tez['status']) => {
    if (!onUpdateStatus) return;
    setMenuOpen(false);
    onUpdateStatus(tez.id, status);
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[75%] rounded-2xl px-4 py-2 ${
        isOwn
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700'
      }`} ref={containerRef}>
        {!isOwn && tez.senderName && (
          <div className="text-xs font-medium mb-1 opacity-70">{tez.senderName}</div>
        )}
        {isReply && (
          <div className={`text-xs mb-1 pl-2 border-l-2 ${isOwn ? 'border-blue-400 text-blue-200' : 'border-zinc-300 dark:border-zinc-600 text-zinc-400'}`}>
            Reply
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{tez.surfaceText}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs ${isOwn ? 'text-blue-200' : 'text-zinc-400'}`}>{time}</span>
          {hasContext && (
            <button
              onClick={() => onViewContext?.(tez.id)}
              className={`text-xs flex items-center gap-1 ${isOwn ? 'text-blue-200 hover:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {tez.contextCount} context
            </button>
          )}
          {onReply && (
            <button
              onClick={() => onReply(tez)}
              className={`text-xs ${isOwn ? 'text-blue-200 hover:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              Reply
            </button>
          )}
          <button
            onClick={() => { setMenuOpen(v => !v); setActionMessage(null); }}
            className={`text-xs ${isOwn ? 'text-blue-200 hover:text-white' : 'text-zinc-400 hover:text-zinc-600'}`}
            title="More"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div
            className={`absolute z-50 mt-2 w-44 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg ${
              isOwn ? 'right-0' : 'left-0'
            }`}
          >
            <div className="py-1">
              <button
                onClick={copyToClipboard}
                className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Copy text
              </button>
              <button
                onClick={exportJson}
                disabled={exporting}
                className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Download JSON'}
              </button>
              {isOwn && (
                <>
                  <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />
                  <button
                    onClick={() => requestStatusChange('archived')}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Archive
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this Tez? This hides it from everyone.')) {
                        requestStatusChange('deleted');
                      }
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Delete
                  </button>
                </>
              )}
              {actionMessage && (
                <div className="px-3 py-2 text-xs text-zinc-500">{actionMessage}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
