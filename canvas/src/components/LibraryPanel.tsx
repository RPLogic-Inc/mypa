import { useState, useCallback, useRef } from 'react';
import { library, tezProtocol, files } from '../services/api';
import { fileToBase64, isAllowedMime, MAX_FILE_SIZE, ACCEPT_STRING } from '../lib/fileUtils';

interface LibraryResult {
  context: {
    id: string;
    rawText: string;
    originalType: string;
    snippet: string;
    rank: number;
    capturedAt: string;
  };
  card: {
    id: string;
    summary: string;
    content: string;
    status: string;
    createdAt: string;
  };
  engagement: {
    score: number;
  };
}

interface BrowseResult {
  context: Record<string, unknown>;
  card: {
    id: string;
    summary: string;
    content: string;
    status: string;
    createdAt: string;
  };
  engagement: {
    score: number;
  };
}

export function LibraryPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryResult[]>([]);
  const [browseResults, setBrowseResults] = useState<BrowseResult[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [facets, setFacets] = useState<{ typeCount: Record<string, number>; totalEntries: number } | null>(null);
  const [toast, setToast] = useState('');
  const [forkModal, setForkModal] = useState<{ cardId: string; cardSummary: string; cardContent: string } | null>(null);
  const [forkType, setForkType] = useState<'counter' | 'extension' | 'reframe' | 'update'>('extension');
  const [forkContent, setForkContent] = useState('');
  const [forkSummary, setForkSummary] = useState('');
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadToLibrary = useCallback(async (fileList: FileList | File[]) => {
    const filesToProcess = Array.from(fileList);
    let uploaded = 0;
    setIsUploading(true);
    for (const file of filesToProcess) {
      if (!isAllowedMime(file.type) || file.size > MAX_FILE_SIZE) continue;
      try {
        const base64 = await fileToBase64(file);
        await files.uploadToLibrary(base64, file.type, file.name);
        uploaded++;
      } catch {
        // skip individual failures
      }
    }
    setIsUploading(false);
    if (uploaded > 0) {
      showToast(`Added ${uploaded} file${uploaded > 1 ? 's' : ''} to Library`);
      handleBrowse();
    } else {
      showToast('Upload failed');
    }
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 1800);
  };

  const downloadText = (filename: string, text: string, mime = 'text/plain') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError('');
    setHasSearched(true);

    try {
      const res = await library.search(query.trim(), { limit: 30 });
      setResults(res.results);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleBrowse = useCallback(async () => {
    setIsSearching(true);
    setError('');
    setHasSearched(true);

    try {
      const res = await library.browse(30);
      setBrowseResults(res.recent);
      setFacets(res.facets);
      setResults([]);
      setTotal(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Browse failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const exportInline = useCallback(async (cardId: string) => {
    try {
      const res = await tezProtocol.exportInline(cardId);
      downloadText(res.data.filename, res.data.markdown, 'text/markdown');
      showToast('Exported markdown');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed');
    }
  }, []);

  const exportPortable = useCallback(async (cardId: string) => {
    try {
      const res = await tezProtocol.exportPortable(cardId);
      downloadText(`tez-${cardId.slice(0, 8)}.portable.json`, JSON.stringify(res.data, null, 2), 'application/json');
      showToast('Exported portable bundle');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed');
    }
  }, []);

  const openFork = (card: { id: string; summary: string; content: string }) => {
    setForkError('');
    setForkType('extension');
    setForkContent('');
    setForkSummary('');
    setForkModal({ cardId: card.id, cardSummary: card.summary, cardContent: card.content });
  };

  const createFork = async () => {
    if (!forkModal || forking) return;
    const content = forkContent.trim();
    if (!content) { setForkError('Fork content is required'); return; }

    setForking(true);
    setForkError('');
    try {
      await tezProtocol.fork(forkModal.cardId, {
        forkType,
        content,
        ...(forkSummary.trim() ? { summary: forkSummary.trim() } : {}),
      });
      showToast('Fork created');
      setForkModal(null);
    } catch (err) {
      setForkError(err instanceof Error ? err.message : 'Failed to create fork');
    } finally {
      setForking(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="border-b border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Library of Context</h2>

        {toast && (
          <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
            {toast}
          </div>
        )}

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all context..."
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            {isSearching ? '...' : 'Search'}
          </button>
        </form>

        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBrowse}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Browse recent context
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isUploading ? (
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            Upload to Library
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_STRING}
            onChange={e => { if (e.target.files?.length) { uploadToLibrary(e.target.files); e.target.value = ''; } }}
            className="hidden"
          />
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-4 transition-colors ${isDragOver ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); if (e.dataTransfer.files?.length) uploadToLibrary(e.dataTransfer.files); }}
      >
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        {/* Facets summary */}
        {facets && (
          <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">{facets.totalEntries} entries in your library</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(facets.typeCount).map(([type, count]) => (
                <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <>
            <p className="text-xs text-zinc-500 mb-3">{total} result{total !== 1 ? 's' : ''} found</p>
            <div className="space-y-3">
              {results.map(result => (
                <div key={result.context.id} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        result.context.originalType === 'voice'
                          ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                          : result.context.originalType === 'assistant'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : result.context.originalType === 'document'
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {result.context.originalType}
                      </span>
                      <span className="text-xs text-zinc-400">{formatDate(result.card.createdAt)}</span>
                      {result.engagement.score > 0 && (
                        <span className="text-xs text-amber-500">{result.engagement.score} engagement</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportInline(result.card.id)}
                        className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title="Export Inline Tez markdown"
                      >
                        Export .md
                      </button>
                      <button
                        onClick={() => exportPortable(result.card.id)}
                        className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title="Export portable JSON bundle"
                      >
                        Portable
                      </button>
                      <button
                        onClick={() => openFork(result.card)}
                        className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                        title="Fork this Tez"
                      >
                        Fork
                      </button>
                    </div>
                  </div>
                  {result.card.summary && (
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{result.card.summary}</p>
                  )}
                  <p
                    className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3"
                    dangerouslySetInnerHTML={{ __html: result.context.snippet || result.context.rawText.slice(0, 200) }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Browse results */}
        {browseResults.length > 0 && results.length === 0 && (
          <>
            <p className="text-xs text-zinc-500 mb-3">Recent context</p>
            <div className="space-y-3">
              {browseResults.map((result, i) => (
                <div key={result.card.id || i} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">{formatDate(result.card.createdAt)}</span>
                      {result.engagement.score > 0 && (
                        <span className="text-xs text-amber-500">{result.engagement.score} engagement</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportInline(result.card.id)}
                        className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        Export .md
                      </button>
                      <button
                        onClick={() => exportPortable(result.card.id)}
                        className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        Portable
                      </button>
                      <button
                        onClick={() => openFork(result.card)}
                        className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Fork
                      </button>
                    </div>
                  </div>
                  {result.card.summary && (
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">{result.card.summary}</p>
                  )}
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">
                    {result.card.content?.slice(0, 200)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Drag overlay hint */}
        {isDragOver && (
          <div className="flex items-center justify-center py-4 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
            Drop files to add to Library
          </div>
        )}

        {/* Empty states */}
        {!hasSearched && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">Search across all your preserved context</p>
            <p className="text-zinc-400 text-xs mt-1">Voice memos, messages, AI responses, documents, and more</p>
            <p className="text-zinc-400 text-xs mt-1">Drop files here or use the Upload button to add to your Library</p>
          </div>
        )}

        {hasSearched && !isSearching && results.length === 0 && browseResults.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No results found</p>
            <p className="text-zinc-400 text-xs mt-1">Try a different search term</p>
          </div>
        )}
      </div>

      {/* Fork modal */}
      {forkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setForkModal(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl w-full max-w-lg p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Fork Tez</h3>
              <button onClick={() => setForkModal(null)} className="text-zinc-400 hover:text-zinc-600 text-xl">&times;</button>
            </div>

            <p className="text-xs text-zinc-500 mb-3">Original: {forkModal.cardSummary || forkModal.cardContent.slice(0, 80)}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Fork Type</label>
                <select
                  value={forkType}
                  onChange={e => setForkType(e.target.value as typeof forkType)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  <option value="counter">Counter</option>
                  <option value="extension">Extension</option>
                  <option value="reframe">Reframe</option>
                  <option value="update">Update</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Content</label>
                <textarea
                  value={forkContent}
                  onChange={e => setForkContent(e.target.value)}
                  placeholder="Write your fork..."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 h-28 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Summary (optional)</label>
                <input
                  value={forkSummary}
                  onChange={e => setForkSummary(e.target.value)}
                  placeholder="Short summary..."
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {forkError && <p className="text-sm text-red-500">{forkError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setForkModal(null)}
                  disabled={forking}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createFork}
                  disabled={forking || !forkContent.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  {forking ? 'Creating...' : 'Create Fork'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
