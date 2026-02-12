import { ToolBadge } from './ToolBadge';
import { formatBytes } from '../../lib/fileUtils';
import type { AIChatMessage, FileAttachment } from '../../types';

const FILE_ICONS: Record<string, string> = {
  pdf: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  default: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

function FileIcon({ mimeType }: { mimeType: string }) {
  const path = mimeType === 'application/pdf' ? FILE_ICONS.pdf : FILE_ICONS.default;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function AttachmentChips({ attachments, isUser }: { attachments: FileAttachment[]; isUser: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map(att => (
        att.isImage ? (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-700/50 hover:opacity-90 transition-opacity"
          >
            <img
              src={att.base64DataUrl || att.url}
              alt={att.originalName}
              className="max-w-[200px] max-h-[200px] object-cover"
            />
          </a>
        ) : (
          <a
            key={att.id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
              isUser
                ? 'border-indigo-400/40 hover:border-indigo-300/60 text-indigo-100'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-300'
            }`}
          >
            <FileIcon mimeType={att.mimeType} />
            <span className="font-medium truncate max-w-[150px]">{att.originalName}</span>
            <span className={isUser ? 'text-indigo-200/70' : 'text-zinc-400'}>{formatBytes(att.size)}</span>
          </a>
        )
      ))}
    </div>
  );
}

interface ChatMessageProps {
  message: AIChatMessage;
  isLast: boolean;
  isStreaming: boolean;
}

export function ChatMessage({ message, isLast, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const showCursor = !isUser && isStreaming && isLast;
  const tools = message.toolsUsed;
  const agentLabel = message.agentLabel;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 border-l-2 border-indigo-500/30'
        }`}
      >
        {/* Agent label */}
        {agentLabel && !isUser && (
          <div className="text-[10px] font-medium text-indigo-400 mb-1 uppercase tracking-wider">
            {agentLabel}
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentChips attachments={message.attachments} isUser={isUser} />
        )}

        {/* Message content */}
        {message.content && (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{message.content}</pre>
        )}

        {/* Streaming cursor */}
        {showCursor && (
          <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse ml-0.5" />
        )}

        {/* Tool badges */}
        {tools && tools.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {tools.map((tool, i) => (
              <ToolBadge key={i} tool={tool} />
            ))}
          </div>
        )}

        {/* Model info */}
        {message.model && !isUser && (
          <div className="text-[10px] text-zinc-400 mt-1.5">{message.model}</div>
        )}
      </div>
    </div>
  );
}
