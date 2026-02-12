import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

vi.mock('../services/api', () => {
  const userSettings = {
    me: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    paPreferences: vi.fn(),
    updatePaPreferences: vi.fn(),
    myTeams: vi.fn(),
    teamMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    consent: vi.fn(),
  };

  const teamSettingsApi = {
    mirror: vi.fn(),
    updateMirror: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    testIntegration: vi.fn(),
  };

  const invitesApi = { send: vi.fn() };
  const teamInvitesApi = { list: vi.fn(), create: vi.fn(), revoke: vi.fn() };
  const crm = { workflowStatus: vi.fn(), status: vi.fn() };
  const channels = {
    providers: vi.fn(),
    me: vi.fn(),
    connectStart: vi.fn(),
    testProvider: vi.fn(),
    connectFinish: vi.fn(),
    updateProvider: vi.fn(),
    rotateWebhookSecret: vi.fn(),
  };

  class ApiError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  return {
    userSettings,
    teamSettingsApi,
    invitesApi,
    teamInvitesApi,
    crm,
    channels,
    ApiError,
  };
});

import {
  channels,
  userSettings,
  crm,
  teamInvitesApi,
  teamSettingsApi,
} from '../services/api';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(userSettings.me).mockResolvedValue({});
    vi.mocked(channels.providers).mockResolvedValue({ data: [] } as never);
    vi.mocked(crm.workflowStatus).mockResolvedValue({ data: {} } as never);
    vi.mocked(teamInvitesApi.list).mockResolvedValue({ invites: [] } as never);
    vi.mocked(userSettings.myTeams).mockResolvedValue({ data: [] } as never);
    vi.mocked(teamSettingsApi.mirror).mockResolvedValue({ data: {} } as never);
    vi.mocked(teamSettingsApi.get).mockResolvedValue({ data: {} } as never);
  });

  it('shows admin sections (OpenClaw, Channels, System Health) for admins', async () => {
    const user = userEvent.setup();

    render(<SettingsPage onBack={vi.fn()} onLogout={vi.fn()} currentUserName="Rob" />);

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'OpenClaw' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Channels' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'System Health' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'OpenClaw' }));

    expect(screen.getByText('OpenClaw Gateway')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open Dashboard/i });
    expect(link).toHaveAttribute('href', 'https://oc.mypa.chat/');
  });

  it('hides admin sections for non-admin users', async () => {
    vi.mocked(channels.providers).mockRejectedValue(new Error('forbidden'));

    render(<SettingsPage onBack={vi.fn()} onLogout={vi.fn()} currentUserName="Rob" />);

    await waitFor(() => {
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'OpenClaw' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Channels' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'System Health' })).not.toBeInTheDocument();
    });
  });
});
