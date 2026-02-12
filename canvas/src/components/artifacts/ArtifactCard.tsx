import type { ArtifactRef } from '../../types';

interface ArtifactCardProps {
  artifact: ArtifactRef;
  onOpen: (artifact: ArtifactRef) => void;
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

const TYPE_ICON: Record<string, string> = {
  research: 'text-emerald-500',
  draft: 'text-blue-500',
  briefing: 'text-violet-500',
  analysis: 'text-amber-500',
  email: 'text-teal-500',
  general: 'text-zinc-500',
};

export function ArtifactCard({ artifact, onOpen }: ArtifactCardProps) {
  const preview = artifact.content.slice(0, 120) + (artifact.content.length > 120 ? '...' : '');
  const dateStr = new Date(artifact.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <button
      onClick={() => onOpen(artifact)}
      className="text-left w-full p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all hover:shadow-sm group"
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-current/10 shrink-0 ${TYPE_ICON[artifact.type] || 'text-zinc-500'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {artifact.title}
          </h3>
          <div className="flex gap-1.5 mt-1">
            <span className={TYPE_BADGE[artifact.type] || 'badge-draft'}>{artifact.type}</span>
            <span className={STATUS_BADGE[artifact.status] || 'status-draft'}>{artifact.status}</span>
            <span className="text-[10px] text-zinc-400">{dateStr}</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2">
            {preview}
          </p>
        </div>
      </div>
    </button>
  );
}
