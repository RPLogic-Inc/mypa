import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoice } from '../hooks/useVoice';
import { ChatMessage } from './chat/ChatMessage';
import { ChatInputBar } from './chat/ChatInputBar';
import { ArtifactPanel } from './chat/ArtifactPanel';
import type { AIChatSession, ArtifactRef, FileAttachment } from '../types';

interface AIChatPanelProps {
  sessions: AIChatSession[];
  activeSession: AIChatSession | null;
  isStreaming: boolean;
  error: string | null;
  onSendMessage: (text: string, attachments?: FileAttachment[]) => void;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onStopStreaming: () => void;
}

const HERO_CARDS = [
  { label: 'Research a topic', prompt: 'Research the following topic and create a brief: ', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', color: 'text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15' },
  { label: 'Create a briefing', prompt: 'Create a briefing document about: ', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'text-violet-500 bg-violet-500/10 dark:bg-violet-500/15' },
  { label: 'Draft something', prompt: 'Draft a document for: ', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', color: 'text-blue-500 bg-blue-500/10 dark:bg-blue-500/15' },
  { label: 'Check my calendar', prompt: 'Check my calendar and summarize my schedule for today', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'text-amber-500 bg-amber-500/10 dark:bg-amber-500/15' },
  { label: 'Team update', prompt: 'Prepare a team update about: ', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'text-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/15' },
  { label: 'Draft an email', prompt: 'Draft an email to ', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', color: 'text-teal-500 bg-teal-500/10 dark:bg-teal-500/15' },
];

export function AIChatPanel({
  sessions,
  activeSession,
  isStreaming,
  error,
  onSendMessage,
  onNewSession,
  onSwitchSession,
  onDeleteSession,
  onStopStreaming,
}: AIChatPanelProps) {
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactRef | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);

  const handleVoiceTranscript = useCallback((text: string) => {
    onSendMessage(text);
  }, [onSendMessage]);

  const voice = useVoice(handleVoiceTranscript);

  // Auto-read assistant responses aloud when TTS is enabled
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && voice.ttsEnabled) {
      const lastMsg = activeSession?.messages.at(-1);
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        voice.speak(lastMsg.content);
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, activeSession?.messages, voice]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, activeSession?.messages.at(-1)?.content]);

  // Check for artifacts in messages
  useEffect(() => {
    if (!isStreaming && activeSession?.messages.length) {
      const lastMsg = activeSession.messages.at(-1);
      if (lastMsg?.role === 'assistant' && lastMsg.artifact) {
        setActiveArtifact(lastMsg.artifact);
      }
    }
  }, [isStreaming, activeSession?.messages]);

  const handleUpdateArtifact = useCallback((updated: ArtifactRef) => {
    setActiveArtifact(updated);
  }, []);

  const messages = activeSession?.messages ?? [];
  const hasMessages = messages.length > 0;
  const sessionTitle = activeSession?.title;
  const isNewChat = !sessionTitle || sessionTitle === 'New Chat';

  return (
    <div className="flex-1 flex h-full">
      {/* Session sidebar (collapsible) */}
      {showSidebar && (
        <div className="w-56 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/80 dark:bg-zinc-900/50">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Sessions</span>
            <button
              onClick={onNewSession}
              className="w-6 h-6 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
              title="New chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.map(s => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 mb-1 text-sm cursor-pointer group ${
                  s.id === activeSession?.id
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                }`}
                onClick={() => onSwitchSession(s.id)}
              >
                <span className="truncate flex-1 text-xs">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 ml-2 text-xs"
                  title="Delete session"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title={showSidebar ? 'Hide sessions' : 'Show sessions'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={showSidebar ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M4 6h16M4 12h16M4 18h10'} />
            </svg>
          </button>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">
            {isNewChat ? 'Chat' : sessionTitle}
          </h2>
          <div className="ml-auto flex items-center gap-1.5">
            {/* TTS toggle */}
            <button
              onClick={() => {
                if (voice.isSpeaking) voice.stopSpeaking();
                voice.setTtsEnabled(!voice.ttsEnabled);
              }}
              className={`p-1.5 rounded-md transition-colors ${
                voice.ttsEnabled
                  ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-950/50'
                  : 'text-zinc-400 hover:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={voice.ttsEnabled ? 'Disable read-aloud' : 'Enable read-aloud'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
              </svg>
            </button>
            {hasMessages && (
              <button
                onClick={onNewSession}
                className="p-1.5 rounded-md text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/50 transition-colors"
                title="New chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!hasMessages && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-lg w-full px-4">
                {/* Hero */}
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a8 8 0 00-5.293 14.024l-.737 2.213a.5.5 0 00.638.638l2.213-.737A8 8 0 1010 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-zinc-800 dark:text-zinc-100 mb-1">
                  Your AI Personal Assistant
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
                  Powered by OpenClaw — research, draft, brief, schedule, and more.
                </p>

                {/* Hero action cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {HERO_CARDS.map(({ label, prompt, icon, color }) => (
                    <button
                      key={label}
                      onClick={() => onSendMessage(prompt)}
                      className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-sm transition-all text-left group"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                        </svg>
                      </div>
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors text-center">
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                message={msg}
                isLast={i === messages.length - 1}
                isStreaming={isStreaming}
              />
            ))}
            {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
              <div className="flex justify-start">
                <div className="bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2">Thinking...</span>
                </div>
              </div>
            )}
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-950/50 border-t border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Input bar */}
        <ChatInputBar
          isStreaming={isStreaming}
          isListening={voice.isListening}
          sttSupported={voice.sttSupported}
          onSend={onSendMessage}
          onStop={onStopStreaming}
          onStartListening={voice.startListening}
          onStopListening={voice.stopListening}
        />
      </div>

      {/* Artifact panel (right rail) */}
      {activeArtifact && (
        <ArtifactPanel
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
          onUpdate={handleUpdateArtifact}
        />
      )}
    </div>
  );
}
