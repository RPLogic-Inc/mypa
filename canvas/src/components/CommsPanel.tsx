import { useState, useCallback } from 'react';
import { MessageThread } from './MessageThread';
import { ContextViewer } from './ContextViewer';
import { NewChatDialog } from './NewChatDialog';
import { NewTeamDialog } from './NewTeamDialog';
import type { Conversation, Tez, TezFull, Team, UnreadCounts, ContextLayer } from '../types';
import type { CommsViewType } from '../hooks/useComms';

interface CommsPanelProps {
  convList: Conversation[];
  teamList: Team[];
  messages: Tez[];
  hasMore: boolean;
  unreadCounts: UnreadCounts | null;
  selected: { type: CommsViewType; id: string } | null;
  contextTez: TezFull | null;
  currentUserId: string;
  onSelect: (type: CommsViewType, id: string) => void;
  onSend: (text: string, context?: ContextLayer[], replyToId?: string, visibility?: string) => void;
  onLoadMore: () => void;
  onViewContext: (tezId: string) => void;
  onCloseContext: () => void;
  onUpdateTezStatus: (tezId: string, status: Tez['status']) => void;
  onNewChat: (conv: Conversation) => void;
  onNewTeam: (team: Team) => void;
}

export function CommsPanel({
  convList,
  teamList,
  messages,
  hasMore,
  unreadCounts,
  selected,
  contextTez,
  currentUserId,
  onSelect,
  onSend,
  onLoadMore,
  onViewContext,
  onCloseContext,
  onUpdateTezStatus,
  onNewChat,
  onNewTeam,
}: CommsPanelProps) {
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);

  const getConvName = useCallback((c: Conversation) => {
    if (c.name) return c.name;
    if (c.type === 'dm') {
      const other = c.members.find(m => m.userId !== currentUserId);
      return other?.displayName || 'Direct Message';
    }
    return 'Group Chat';
  }, [currentUserId]);

  const getTitle = () => {
    if (!selected) return '';
    if (selected.type === 'team') {
      return teamList.find(t => t.id === selected.id)?.name || 'Team';
    }
    const conv = convList.find(c => c.id === selected.id);
    if (conv) return getConvName(conv);
    return 'Conversation';
  };

  const getTeamUnread = (teamId: string) =>
    unreadCounts?.teams.find(t => t.teamId === teamId)?.count ?? 0;
  const getConvUnread = (convId: string) =>
    unreadCounts?.conversations.find(c => c.conversationId === convId)?.count ?? 0;

  return (
    <div className="flex-1 flex h-full">
      {/* Left sidebar: teams + conversations */}
      <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-950">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Inbox</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Teams */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Teams</span>
              <button onClick={() => setShowNewTeam(true)} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">+ New</button>
            </div>
            {teamList.length === 0 && <p className="text-xs text-zinc-400 px-3 py-2">No teams yet</p>}
            {teamList.map(t => {
              const count = getTeamUnread(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect('team', t.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm flex items-center justify-between transition-colors ${
                    selected?.id === t.id && selected?.type === 'team'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  {count > 0 && <span className="bg-blue-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-medium">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Conversations */}
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Messages</span>
              <button onClick={() => setShowNewChat(true)} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">+ New</button>
            </div>
            {convList.length === 0 && <p className="text-xs text-zinc-400 px-3 py-2">No conversations yet</p>}
            {convList.map(c => {
              const count = getConvUnread(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect('conversation', c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
                    selected?.id === c.id && selected?.type === 'conversation'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{getConvName(c)}</span>
                    {count > 0 && <span className="bg-blue-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-medium">{count}</span>}
                  </div>
                  {c.lastMessage && <div className="text-xs text-zinc-500 truncate mt-0.5">{c.lastMessage.surfaceText}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main message area */}
      <div className="flex-1 flex">
        {selected ? (
          <MessageThread
            messages={messages}
            currentUserId={currentUserId}
            title={getTitle()}
            viewType={selected.type === 'team' ? 'team' : 'conversation'}
            onSend={onSend}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            onViewContext={onViewContext}
            onUpdateTezStatus={onUpdateTezStatus}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Inbox</h2>
              <p className="text-sm text-zinc-400">Select a team or conversation to start messaging</p>
            </div>
          </div>
        )}
        {contextTez && (
          <ContextViewer
            layers={contextTez.context}
            onClose={onCloseContext}
          />
        )}
      </div>

      {/* Dialogs */}
      {showNewChat && (
        <NewChatDialog
          onClose={() => setShowNewChat(false)}
          onCreate={(conv) => { setShowNewChat(false); onNewChat(conv); }}
          currentUserId={currentUserId}
        />
      )}
      {showNewTeam && (
        <NewTeamDialog
          onClose={() => setShowNewTeam(false)}
          onCreate={(team) => { setShowNewTeam(false); onNewTeam(team); }}
        />
      )}
    </div>
  );
}
