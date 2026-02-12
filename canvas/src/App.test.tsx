import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./hooks/useComms', () => ({ useComms: vi.fn() }));
vi.mock('./hooks/useAIChat', () => ({ useAIChat: vi.fn() }));
vi.mock('./hooks/useArtifacts', () => ({ useArtifacts: vi.fn() }));
vi.mock('./hooks/useRouter', () => ({ useRouter: vi.fn() }));

vi.mock('./components/LoginScreen', () => ({ LoginScreen: () => <div>Login Screen</div> }));
vi.mock('./components/OnboardingScreen', () => ({ OnboardingScreen: () => <div>Onboarding Screen</div> }));
vi.mock('./components/ActivityBanner', () => ({ ActivityBanner: () => <div>Activity Banner</div> }));
vi.mock('./components/Sidebar', () => ({ Sidebar: () => <div>Sidebar</div> }));
vi.mock('./components/AIChatPanel', () => ({ AIChatPanel: () => <div>AI Chat Panel</div> }));
vi.mock('./components/CommsPanel', () => ({ CommsPanel: () => <div>Comms Panel</div> }));
vi.mock('./components/LibraryPanel', () => ({ LibraryPanel: () => <div>Library Panel</div> }));
vi.mock('./components/artifacts/ArtifactsView', () => ({ ArtifactsView: () => <div>Artifacts View</div> }));
vi.mock('./components/SettingsPage', () => ({ SettingsPage: () => <div>Settings Page</div> }));

import { useAuth } from './hooks/useAuth';
import { useComms } from './hooks/useComms';
import { useAIChat } from './hooks/useAIChat';
import { useArtifacts } from './hooks/useArtifacts';
import { useRouter } from './hooks/useRouter';

function mockBaseState(view: 'chat' | 'inbox' | 'artifacts' | 'library' | 'settings') {
  vi.mocked(useAuth).mockReturnValue({
    token: 'token',
    needsOnboarding: false,
    emailVerified: true,
    currentUserName: 'Rob',
    currentUserId: 'u1',
    handleLogin: vi.fn(),
    setNeedsOnboarding: vi.fn(),
    resendVerification: vi.fn(),
    handleLogout: vi.fn(),
  } as never);

  vi.mocked(useComms).mockReturnValue({
    convList: [],
    teamList: [],
    messages: [],
    hasMore: false,
    unreadCounts: { teams: [], conversations: [], total: 0 },
    selected: null,
    contextTez: null,
    activityItems: [],
    sseConnected: false,
    loadConversations: vi.fn(),
    loadTeams: vi.fn(),
    setTeamList: vi.fn(),
    handleSelect: vi.fn(),
    handleSend: vi.fn(),
    handleLoadMore: vi.fn(),
    handleViewContext: vi.fn(),
    setContextTez: vi.fn(),
    handleUpdateTezStatus: vi.fn(),
  } as never);

  vi.mocked(useAIChat).mockReturnValue({
    sessions: [],
    activeSession: null,
    isStreaming: false,
    error: null,
    sendMessage: vi.fn(),
    createNewSession: vi.fn(),
    switchSession: vi.fn(),
    deleteSessionById: vi.fn(),
    stopStreaming: vi.fn(),
  } as never);

  vi.mocked(useArtifacts).mockReturnValue({ artifacts: [] } as never);
  vi.mocked(useRouter).mockReturnValue({
    activeView: view,
    setActiveView: vi.fn(),
  } as never);
}

describe('App routing shell', () => {
  beforeEach(() => {
    mockBaseState('chat');
  });

  it('renders login when unauthenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ token: null, handleLogin: vi.fn() } as never);

    render(<App />);
    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });

  it('renders onboarding when required', () => {
    vi.mocked(useAuth).mockReturnValue({
      token: 'token',
      needsOnboarding: true,
      currentUserName: 'Rob',
      setNeedsOnboarding: vi.fn(),
    } as never);

    render(<App />);
    expect(screen.getByText('Onboarding Screen')).toBeInTheDocument();
  });

  it('renders dedicated library view header and panel', () => {
    mockBaseState('library');
    render(<App />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('Search and browse your context library')).toBeInTheDocument();
    expect(screen.getByText('Library Panel')).toBeInTheDocument();
  });

  it('routes to artifacts view', () => {
    mockBaseState('artifacts');
    render(<App />);

    expect(screen.getByText('Artifacts View')).toBeInTheDocument();
  });
});
