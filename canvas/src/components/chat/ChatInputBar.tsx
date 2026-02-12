import { useState, useRef, useCallback } from 'react';
import { QuickActions } from './QuickActions';
import { files } from '../../services/api';
import { fileToBase64, fileToDataUrl, formatBytes, isAllowedMime, isImageMime, MAX_FILE_SIZE, ACCEPT_STRING } from '../../lib/fileUtils';
import type { FileAttachment } from '../../types';

interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  uploaded?: FileAttachment;
  uploading: boolean;
  error?: string;
}

interface ChatInputBarProps {
  isStreaming: boolean;
  isListening: boolean;
  sttSupported: boolean;
  onSend: (text: string, attachments?: FileAttachment[]) => void;
  onStop: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function ChatInputBar({
  isStreaming,
  isListening,
  sttSupported,
  onSend,
  onStop,
  onStartListening,
  onStopListening,
}: ChatInputBarProps) {
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasUploadedFiles = pendingFiles.some(f => f.uploaded);
  const isUploading = pendingFiles.some(f => f.uploading);

  const handleSend = useCallback(() => {
    const text = input.trim();
    const attachments = pendingFiles
      .filter(f => f.uploaded)
      .map(f => f.uploaded!);

    if ((!text && attachments.length === 0) || isStreaming || isUploading) return;

    onSend(text, attachments.length > 0 ? attachments : undefined);
    setInput('');
    setPendingFiles([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [input, isStreaming, isUploading, onSend, pendingFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handleQuickAction = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesToProcess = Array.from(fileList);

    for (const file of filesToProcess) {
      if (!isAllowedMime(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const id = crypto.randomUUID();
      const isImage = isImageMime(file.type);
      const preview = isImage ? URL.createObjectURL(file) : undefined;

      setPendingFiles(prev => [...prev, { id, file, preview, uploading: true }]);

      try {
        const base64 = await fileToBase64(file);
        const dataUrl = isImage ? await fileToDataUrl(file) : undefined;
        const result = await files.upload(base64, file.type, file.name);
        const attachment: FileAttachment = { ...result, base64DataUrl: dataUrl };

        setPendingFiles(prev =>
          prev.map(f => f.id === id ? { ...f, uploading: false, uploaded: attachment } : f)
        );
      } catch {
        setPendingFiles(prev =>
          prev.map(f => f.id === id ? { ...f, uploading: false, error: 'Upload failed' } : f)
        );
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pastedFiles = e.clipboardData?.files;
    if (pastedFiles?.length) {
      processFiles(pastedFiles);
    }
  }, [processFiles]);

  const removeFile = useCallback((id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }, []);

  return (
    <div
      className={`px-4 py-3 border-t transition-colors ${
        isDragOver
          ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Quick action chips */}
        {!isStreaming && input.length === 0 && pendingFiles.length === 0 && (
          <QuickActions onSelect={handleQuickAction} disabled={isStreaming} />
        )}

        {/* File preview chips */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 py-1">
            {pendingFiles.map(pf => (
              <div
                key={pf.id}
                className={`relative flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg border text-xs ${
                  pf.error
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50'
                }`}
              >
                {pf.preview ? (
                  <img src={pf.preview} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="truncate max-w-[120px] text-zinc-600 dark:text-zinc-300">
                  {pf.file.name}
                </span>
                {pf.uploaded && (
                  <span className="text-[10px] text-zinc-400">{formatBytes(pf.uploaded.size)}</span>
                )}
                {pf.uploading && (
                  <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                {pf.error && (
                  <span className="text-[10px] text-red-500">{pf.error}</span>
                )}
                <button
                  onClick={() => removeFile(pf.id)}
                  className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drag overlay hint */}
        {isDragOver && (
          <div className="flex items-center justify-center py-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
            Drop files to attach
          </div>
        )}

        {/* Input row */}
        <div className="flex gap-2 items-end">
          {/* Paperclip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || isListening}
            className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Attach files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isListening ? 'Listening...' : 'Message your PA...'}
            className="flex-1 resize-none rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-zinc-100 placeholder-zinc-400"
            rows={1}
            disabled={isStreaming || isListening}
          />
          {/* Mic button */}
          {sttSupported && !isStreaming && (
            <button
              onClick={isListening ? onStopListening : onStartListening}
              className={`relative p-3 rounded-xl transition-colors ${
                isListening
                  ? 'bg-red-100 dark:bg-red-950 text-red-600 hover:bg-red-200 dark:hover:bg-red-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100 0h-3v-2.07z" clipRule="evenodd" />
              </svg>
              {isListening && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          )}
          {isStreaming ? (
            <button
              onClick={onStop}
              className="px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !hasUploadedFiles) || isUploading}
              className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
