import { useState } from 'react';
import type { ArtifactRef } from '../../types';

interface ArtifactPanelProps {
  artifact: ArtifactRef;
  onClose: () => void;
  onUpdate: (updated: ArtifactRef) => void;
}

const TYPE_BADGE: Record<string, string> = {
  research: 'badge-research',
  draft: 'badge-draft',
  briefing: 'badge-briefing',
  analysis: 'badge-analysis',
  email: 'badge-email',
  general: 'badge-draft',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'status-draft',
  published: 'status-published',
  shared: 'status-shared',
};

export function ArtifactPanel({ artifact, onClose, onUpdate }: ArtifactPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);

  const handleSave = () => {
    onUpdate({ ...artifact, content: editContent });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditContent(artifact.content);
    setEditing(false);
  };

  return (
    <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950 animate-slide-in-right shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {artifact.title}
          </h3>
          <div className="flex gap-1.5 mt-1">
            <span className={TYPE_BADGE[artifact.type] || 'badge-draft'}>{artifact.type}</span>
            <span className={STATUS_BADGE[artifact.status] || 'status-draft'}>{artifact.status}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1"
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {editing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full min-h-[200px] resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
            {artifact.content}
          </pre>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
        {editing ? (
          <>
            <button onClick={handleSave} className="btn-primary flex-1 text-xs">
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(artifact.content)}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Copy
            </button>
          </>
        )}
      </div>
    </div>
  );
}
