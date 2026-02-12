import { useState } from 'react';
import { ArtifactCard } from './ArtifactCard';
import type { ArtifactRef } from '../../types';

interface ArtifactsViewProps {
  artifacts: ArtifactRef[];
}

type TypeFilter = ArtifactRef['type'] | 'all';

export function ArtifactsView({ artifacts }: ArtifactsViewProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRef | null>(null);

  const filtered = typeFilter === 'all'
    ? artifacts
    : artifacts.filter(a => a.type === typeFilter);

  const types: TypeFilter[] = ['all', 'research', 'draft', 'briefing', 'analysis', 'email', 'general'];

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Artifacts</h2>
        <p className="text-xs text-zinc-400 mt-0.5">Documents, research, and content created by your PA</p>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex gap-1.5 flex-wrap">
        {types.map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              typeFilter === type
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-violet-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">No artifacts yet</h3>
              <p className="text-sm text-zinc-400 max-w-sm">
                Start a chat and ask your PA to research, draft, or analyze something. Artifacts will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
            {filtered.map(artifact => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                onOpen={setSelectedArtifact}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel (slide-in) */}
      {selectedArtifact && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSelectedArtifact(null)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 flex flex-col animate-slide-in-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedArtifact.title}</h3>
              <button
                onClick={() => setSelectedArtifact(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                {selectedArtifact.content}
              </pre>
            </div>
            <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(selectedArtifact.content)}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
