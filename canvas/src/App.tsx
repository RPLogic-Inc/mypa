import { useState, useCallback } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { ActivityBanner } from './components/ActivityBanner';
import { Sidebar } from './components/Sidebar';
import { AIChatPanel } from './components/AIChatPanel';
import { CommsPanel } from './components/CommsPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { ArtifactsView } from './components/artifacts/ArtifactsView';
import { SettingsPage } from './components/SettingsPage';
import { useAuth } from './hooks/useAuth';
import { useComms } from './hooks/useComms';
import { useAIChat } from './hooks/useAIChat';
import { useArtifacts } from './hooks/useArtifacts';
import { useRouter } from './hooks/useRouter';
import { useScope } from './hooks/useScope';
import type { AppView, Conversation, Team } from './types';

function App() {
  const auth = useAuth();
  const comms = useComms(auth.token);
  const aiChat = useAIChat();
  const artifactsHook = useArtifacts();
  const { activeView, setActiveView } = useRouter();
  const { scope, switchScope, canSwitch } = useScope();

  // Connected hubs — populated by Phase 1 API (empty for now)
  const connectedHubs: Array<{ hubHost: string; teamId: string; teamName: string }> = [];

  const [prevView, setPrevView] = useState<AppView>('chat');

  const handleChangeView = useCallback((view: AppView) => {
    if (view === 'settings') {
      setPrevView(activeView === 'settings' ? 'chat' : activeView);
    }
    setActiveView(view);
  }, [activeView, setActiveView]);

  const handleSettingsBack = useCallback(() => {
    setActiveView(prevView);
  }, [prevView, setActiveView]);

  const handleNewChat = useCallback(async (conv: Conversation) => {
    await comms.loadConversations();
    comms.handleSelect('conversation', conv.id);
  }, [comms]);

  const handleNewTeam = useCallback(async (team: Team) => {
    comms.setTeamList(prev => [...prev, team]);
    comms.handleSelect('team', team.id);
  }, [comms]);

  // Not logged in
  if (!auth.token) {
    return <LoginScreen onLogin={auth.handleLogin} />;
  }

  // Onboarding
  if (auth.needsOnboarding) {
    return (
      <OnboardingScreen
        userName={auth.currentUserName}
        onComplete={() => {
          auth.setNeedsOnboarding(false);
          comms.loadTeams();
          comms.loadConversations();
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-zinc-950">
      <ActivityBanner items={comms.activityItems} sseConnected={comms.sseConnected} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onChangeView={handleChangeView}
          onLogout={auth.handleLogout}
          unreadCounts={comms.unreadCounts}
          userName={auth.currentUserName}
          teamName={comms.teamList[0]?.name}
          scope={canSwitch ? scope : undefined}
          onSwitchScope={canSwitch ? switchScope : undefined}
          connectedHubs={canSwitch ? connectedHubs : undefined}
        />
        {/* Main content area — add bottom padding on mobile for the nav bar */}
        <main className="flex-1 overflow-hidden pb-14 md:pb-0">
          {activeView === 'settings' ? (
            <SettingsPage
              onBack={handleSettingsBack}
              onLogout={auth.handleLogout}
              currentUserName={auth.currentUserName}
            />
          ) : activeView === 'chat' ? (
            <AIChatPanel
              sessions={aiChat.sessions}
              activeSession={aiChat.activeSession}
              isStreaming={aiChat.isStreaming}
              error={aiChat.error}
              onSendMessage={aiChat.sendMessage}
              onNewSession={aiChat.createNewSession}
              onSwitchSession={aiChat.switchSession}
              onDeleteSession={aiChat.deleteSessionById}
              onStopStreaming={aiChat.stopStreaming}
            />
          ) : activeView === 'inbox' ? (
            <CommsPanel
              convList={comms.convList}
              teamList={comms.teamList}
              messages={comms.messages}
              hasMore={comms.hasMore}
              unreadCounts={comms.unreadCounts}
              selected={comms.selected}
              contextTez={comms.contextTez}
              currentUserId={auth.currentUserId}
              onSelect={comms.handleSelect}
              onSend={comms.handleSend}
              onLoadMore={comms.handleLoadMore}
              onViewContext={comms.handleViewContext}
              onCloseContext={() => comms.setContextTez(null)}
              onUpdateTezStatus={comms.handleUpdateTezStatus}
              onNewChat={handleNewChat}
              onNewTeam={handleNewTeam}
            />
          ) : activeView === 'artifacts' ? (
            <ArtifactsView artifacts={artifactsHook.artifacts} />
          ) : activeView === 'library' ? (
            <div className="flex-1 flex flex-col h-full">
              <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Library</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Search and browse your context library</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <LibraryPanel />
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
