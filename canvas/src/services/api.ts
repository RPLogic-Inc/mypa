import type {
  Contact,
  Conversation,
  Tez,
  TezFull,
  Team,
  TeamMember,
  ContextLayer,
  Thread,
  UnreadCounts,
  ShareTezRequest,
  CrmEntityType,
  CrmTezContextResult,
  CrmStatus,
  CrmSummary,
  CrmWriteResult,
  CrmWorkflowResult,
  CrmWorkflowStatus,
  TeamInvite,
  InviteValidation,
} from '../types';

const APP_BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat';

/** Instance mode: "personal" (spoke) or "team" (hub, default) */
export const INSTANCE_MODE: 'personal' | 'team' =
  (import.meta.env.VITE_INSTANCE_MODE as 'personal' | 'team') || 'team';
export const isPersonalMode = INSTANCE_MODE === 'personal';
export const isTeamMode = INSTANCE_MODE === 'team';

function getDefaultBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '/api';
  }
  const host = window.location.hostname.toLowerCase();
  if (host === `oc.${APP_BASE_DOMAIN}` || host === `app.${APP_BASE_DOMAIN}`) {
    return '/api';
  }
  if (host.endsWith(`.${APP_BASE_DOMAIN}`)) {
    return `https://api.${APP_BASE_DOMAIN}/api`;
  }
  return '/api';
}

const BASE_URL = import.meta.env.VITE_RELAY_URL || getDefaultBaseUrl();

function getDefaultBackendBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '/api';
  }
  const host = window.location.hostname.toLowerCase();
  if (host === `oc.${APP_BASE_DOMAIN}` || host === `app.${APP_BASE_DOMAIN}`) {
    return '/api';
  }
  if (host.endsWith(`.${APP_BASE_DOMAIN}`)) {
    return `https://api.${APP_BASE_DOMAIN}/api`;
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  return '/api';
}

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || getDefaultBackendBaseUrl();

function getToken(): string | null {
  const keys = ['tezit_token', 'mypa_access_token'];
  for (const key of keys) {
    const token = localStorage.getItem(key);
    if (token) return token;
  }
  return null;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('tezit_refresh_token');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const newAccess = body?.data?.tokens?.accessToken ?? body?.data?.accessToken;
    const newRefresh = body?.data?.tokens?.refreshToken ?? body?.data?.refreshToken;
    if (newAccess && typeof newAccess === 'string') {
      localStorage.setItem('tezit_token', newAccess);
      if (newRefresh && typeof newRefresh === 'string') {
        localStorage.setItem('tezit_refresh_token', newRefresh);
      }
      return newAccess;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function fetchWithRefresh(url: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      return fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...options.headers,
        },
      });
    }
    // Refresh failed — clear stale tokens and force re-login
    localStorage.removeItem('tezit_token');
    localStorage.removeItem('mypa_access_token');
    localStorage.removeItem('tezit_refresh_token');
    window.location.reload();
  }

  return res;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchWithRefresh(`${BASE_URL}${path}`, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error?.code || 'UNKNOWN', body.error?.message || res.statusText);
  }

  return res.json();
}

async function backendRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchWithRefresh(`${BACKEND_BASE_URL}${path}`, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error?.code || 'UNKNOWN', body.error?.message || res.statusText);
  }

  return res.json();
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Contacts
export const contacts = {
  register: (data: { displayName: string; email?: string }) =>
    request<{ data: Contact }>('/contacts/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<{ data: Contact }>('/contacts/me'),
  search: (q: string) => request<{ data: Contact[] }>(`/contacts/search?q=${encodeURIComponent(q)}`),
  get: (userId: string) => request<{ data: Contact }>(`/contacts/${userId}`),
};

// Conversations
export const conversations = {
  list: () => request<{ data: Conversation[] }>('/conversations'),
  create: (data: { type: 'dm' | 'group'; memberIds: string[]; name?: string }) =>
    request<{ data: Conversation }>('/conversations', { method: 'POST', body: JSON.stringify(data) }),
  messages: (id: string, before?: string) =>
    request<{ data: Tez[]; meta: { count: number; hasMore: boolean } }>(
      `/conversations/${id}/messages${before ? `?before=${before}` : ''}`
    ),
  send: (id: string, data: { surfaceText: string; context?: ContextLayer[] }) =>
    request<{ data: Tez }>(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  markRead: (id: string) =>
    request<{ data: { success: boolean } }>(`/conversations/${id}/read`, { method: 'POST' }),
};

// Teams
export const teams = {
  list: () => request<{ data: Team[] }>('/teams'),
  create: (name: string) =>
    request<{ data: Team }>('/teams', { method: 'POST', body: JSON.stringify({ name }) }),
  members: (id: string) => request<{ data: TeamMember[] }>(`/teams/${id}/members`),
  addMember: (id: string, userId: string) =>
    request<{ data: TeamMember }>(`/teams/${id}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
};

// Tez
export const tez = {
  share: (data: ShareTezRequest) =>
    request<{ data: Tez }>('/tez/share', { method: 'POST', body: JSON.stringify(data) }),
  stream: (teamId: string, before?: string) =>
    request<{ data: Tez[]; meta: { count: number; hasMore: boolean } }>(
      `/tez/stream?teamId=${teamId}${before ? `&before=${before}` : ''}`
    ),
  get: (id: string) => request<{ data: TezFull }>(`/tez/${id}`),
  reply: (id: string, data: { surfaceText: string; context?: ContextLayer[] }) =>
    request<{ data: Tez }>(`/tez/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
  thread: (id: string) => request<{ data: Thread }>(`/tez/${id}/thread`),
  update: (id: string, data: { status: Tez['status'] }) =>
    request<{ data: { id: string; status: Tez['status']; updatedAt: string } }>(`/tez/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Unread
export const unread = {
  counts: () => request<{ data: UnreadCounts }>('/unread'),
};

export const settings = {
  team: () => backendRequest<{ data: Record<string, unknown> }>('/settings/team'),
};

export const auth = {
  register: (data: { name: string; email: string; password: string; inviteCode?: string }) =>
    backendRequest<{
      data: {
        user: { id: string; email: string; name: string; department: string; teamId?: string };
        tokens: { accessToken: string; refreshToken: string };
      };
    }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  updatePAPreferences: (prefs: { paDisplayName?: string }) =>
    backendRequest<{ data: Record<string, unknown> }>('/users/me/pa-preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),
  forgotPassword: (email: string) =>
    backendRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    backendRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
  sendVerifyEmail: () =>
    backendRequest<{ message: string }>('/auth/verify-email/send', { method: 'POST' }),
  confirmVerifyEmail: (token: string) =>
    backendRequest<{ message: string }>('/auth/verify-email/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
};

export const onboarding = {
  status: () =>
    backendRequest<{
      hasOnboarding: boolean;
      isComplete?: boolean;
      completionPercentage?: number;
      nextStep?: string | null;
      profileCompleted?: boolean;
      notificationsConfigured?: boolean;
      teamTourCompleted?: boolean;
    }>('/onboarding/status'),
  completeStep: (step: string) =>
    backendRequest<{ success: boolean; status: Record<string, unknown> }>('/onboarding/complete-step', {
      method: 'POST',
      body: JSON.stringify({ step }),
    }),
};

export const library = {
  search: (q: string, options?: { type?: string; limit?: number; offset?: number }) =>
    backendRequest<{
      results: Array<{
        context: { id: string; rawText: string; originalType: string; snippet: string; rank: number; capturedAt: string };
        card: { id: string; summary: string; content: string; status: string; createdAt: string };
        engagement: { score: number };
      }>;
      total: number;
    }>(`/library/search?q=${encodeURIComponent(q)}${options?.type ? `&type=${options.type}` : ''}${options?.limit ? `&limit=${options.limit}` : ''}${options?.offset ? `&offset=${options.offset}` : ''}`),
  browse: (limit = 20) =>
    backendRequest<{
      recent: Array<{
        context: Record<string, unknown>;
        card: { id: string; summary: string; content: string; status: string; createdAt: string };
        engagement: { score: number };
      }>;
      facets: { typeCount: Record<string, number>; totalEntries: number };
    }>(`/library/browse?limit=${limit}`),
};

// Backend Tez Protocol endpoints (cards + exports/forks live in backend, not the relay)
export const tezProtocol = {
  exportInline: (cardId: string) =>
    backendRequest<{ data: { markdown: string; filename: string } }>(`/tez/${encodeURIComponent(cardId)}/export`),
  exportPortable: (cardId: string) =>
    backendRequest<{ data: unknown }>(`/tez/${encodeURIComponent(cardId)}/export/portable`),
  fork: (cardId: string, data: { forkType: 'counter' | 'extension' | 'reframe' | 'update'; content: string; summary?: string }) =>
    backendRequest<{ data: Record<string, unknown> }>(`/tez/${encodeURIComponent(cardId)}/fork`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// File uploads
export const files = {
  upload: (fileData: string, mimeType: string, filename?: string) =>
    backendRequest<{
      id: string; url: string; filename: string; originalName: string;
      mimeType: string; size: number; isImage: boolean;
    }>('/files/upload', {
      method: 'POST', body: JSON.stringify({ fileData, mimeType, filename }),
    }),
  uploadToLibrary: (fileData: string, mimeType: string, filename?: string) =>
    backendRequest<{
      file: { id: string; url: string; filename: string; originalName: string; mimeType: string; size: number; isImage: boolean };
      card: { id: string };
      context: { id: string };
    }>('/files/upload-to-library', {
      method: 'POST', body: JSON.stringify({ fileData, mimeType, filename }),
    }),
};

// OpenClaw AI Chat (SSE streaming)
export const openclawChat = {
  stream: async (messages: Array<{ role: string; content: string | unknown[] }>, options?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<Response> => {
    const fetchOpts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: true, ...options }),
    };
    const res = await fetchWithRefresh(`${BACKEND_BASE_URL}/openclaw/chat/completions`, fetchOpts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error?.code || 'UNKNOWN', body.error?.message || res.statusText);
    }
    return res;
  },
};

// Users (settings endpoints on backend)
export const userSettings = {
  me: () => backendRequest<Record<string, unknown>>('/users/me'),
  updateProfile: (data: { name?: string; avatarUrl?: string }) =>
    backendRequest<Record<string, unknown>>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    backendRequest<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST', body: JSON.stringify(data),
    }),
  paPreferences: () =>
    backendRequest<{ data: Record<string, unknown>; meta: { modelOptions: Array<{ value: string; label: string; description: string }> } }>('/users/me/pa-preferences'),
  updatePaPreferences: (data: Record<string, unknown>) =>
    backendRequest<{ data: Record<string, unknown> }>('/users/me/pa-preferences', {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  notifications: () => backendRequest<Record<string, unknown>>('/users/me/notifications'),
  updateNotifications: (data: { urgentPush?: boolean; digestTime?: string }) =>
    backendRequest<Record<string, unknown>>('/users/me/notifications', {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  testNotification: () =>
    backendRequest<{ success: boolean; message: string }>('/users/me/notifications/test', { method: 'POST' }),
  consent: (granted: boolean) =>
    backendRequest<Record<string, unknown>>('/users/me/consent', {
      method: 'POST', body: JSON.stringify({ granted }),
    }),
  myTeams: () =>
    backendRequest<{ data: Array<{ id: string; name: string; role: string; isActive: boolean; memberCount: number }> }>('/users/me/teams'),
  teamMembers: (teamId: string) =>
    backendRequest<Array<Record<string, unknown>>>(`/users/teams/${teamId}/members`),
  registerTeam: (teamId: string, teamName: string) =>
    backendRequest<{ data: { teamId: string; synced: boolean } }>('/users/me/register-team', {
      method: 'POST', body: JSON.stringify({ teamId, teamName }),
    }),
  updateMemberRole: (teamId: string, userId: string, role: string) =>
    backendRequest<{ data: { userId: string; teamId: string; role: string } }>(
      `/users/teams/${teamId}/members/${userId}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
    ),
};

// Team-level settings
export const teamSettingsApi = {
  get: () => backendRequest<{ data: Record<string, unknown> }>('/settings/team'),
  update: (data: Record<string, unknown>) =>
    backendRequest<{ data: Record<string, unknown> }>('/settings/team', {
      method: 'PATCH', body: JSON.stringify(data),
    }),
  testIntegration: (integration: string) =>
    backendRequest<Record<string, unknown>>('/settings/team/test-integration', {
      method: 'POST', body: JSON.stringify({ integration }),
    }),
  mirror: () => backendRequest<{ data: Record<string, unknown> }>('/settings/mirror'),
  updateMirror: (data: Record<string, unknown>) =>
    backendRequest<{ data: Record<string, unknown> }>('/settings/mirror', {
      method: 'PATCH', body: JSON.stringify(data),
    }),
};

// Invites (PA email-based invites)
export const invitesApi = {
  send: (data: { email: string; name: string }) =>
    backendRequest<{ data: Record<string, unknown> }>('/invites/send', {
      method: 'POST', body: JSON.stringify(data),
    }),
  validate: (token: string) =>
    backendRequest<{ data: { email: string; invitedBy: string; expiresAt: string } }>(`/invites/${encodeURIComponent(token)}`),
};

// Team Invites (code-based team invites via onboarding routes)
export const teamInvitesApi = {
  create: (data: {
    teamId: string;
    email?: string;
    maxUses?: number;
    expiresInDays?: number;
    defaultDepartment?: string;
    defaultRoles?: string[];
    defaultSkills?: string[];
  }) =>
    backendRequest<{
      invite: TeamInvite;
      shareUrl: string;
    }>('/onboarding/invites', { method: 'POST', body: JSON.stringify(data) }),

  list: () =>
    backendRequest<{ invites: TeamInvite[] }>('/onboarding/invites'),

  revoke: (id: string) =>
    backendRequest<{ success: boolean }>(`/onboarding/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  validate: (code: string, email?: string) =>
    backendRequest<InviteValidation>(
      `/onboarding/invites/validate/${encodeURIComponent(code)}${email ? `?email=${encodeURIComponent(email)}` : ''}`
    ),
};

export const crm = {
  status: () => backendRequest<{ data: CrmStatus }>('/crm/status'),
  workflowStatus: () => backendRequest<{ data: CrmWorkflowStatus }>('/crm/workflows/status'),
  people: (q = '', limit = 20, offset = 0) =>
    backendRequest<{ data: { items: CrmSummary[] } }>(
      `/crm/people?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
    ),
  opportunities: (q = '', limit = 20, offset = 0) =>
    backendRequest<{ data: { items: CrmSummary[] } }>(
      `/crm/opportunities?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
    ),
  tasks: (q = '', limit = 20, offset = 0) =>
    backendRequest<{ data: { items: CrmSummary[] } }>(
      `/crm/tasks?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
    ),
  getEntity: (entityType: CrmEntityType, entityId: string) =>
    backendRequest<{ data: { entityType: CrmEntityType; entityId: string; summary: CrmSummary; relayContext: ContextLayer[] } }>(
      `/crm/${entityType}/${encodeURIComponent(entityId)}`
    ),
  tezContext: (entityType: CrmEntityType, entityId: string) =>
    backendRequest<{ data: CrmTezContextResult }>('/crm/tez-context', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    }),
  createEntity: (entityType: CrmEntityType, payload: Record<string, unknown>) => {
    const path = entityType === 'person' ? '/crm/people' : entityType === 'opportunity' ? '/crm/opportunities' : '/crm/tasks';
    return backendRequest<{ data: CrmWriteResult }>(path, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  },
  updateEntity: (entityType: CrmEntityType, entityId: string, payload: Record<string, unknown>) => {
    const root = entityType === 'person' ? '/crm/people' : entityType === 'opportunity' ? '/crm/opportunities' : '/crm/tasks';
    return backendRequest<{ data: CrmWriteResult }>(`${root}/${encodeURIComponent(entityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ payload }),
    });
  },
  coordinateWorkflow: (payload: {
    entityType: CrmEntityType;
    entityId: string;
    objective: string;
    tez?: {
      teamId?: string;
      recipients?: string[];
      type?: Tez['type'] | 'escalation';
      urgency?: Tez['urgency'];
      visibility?: Tez['visibility'];
      surfaceText?: string;
    };
    openclaw?: {
      enabled?: boolean;
      model?: string;
      temperature?: number;
    };
    googleWorkspace?: {
      enabled?: boolean;
      paEmail?: string;
      emailTo?: string;
      emailSubject?: string;
      emailBody?: string;
      sendEmail?: boolean;
      logCalendar?: boolean;
      calendarSummary?: string;
      durationMs?: number;
      dryRun?: boolean;
    };
  }) =>
    backendRequest<{ data: CrmWorkflowResult; meta?: { usage?: string } }>('/crm/workflows/coordinate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// Channels — user self-service + admin provider management
export const channels = {
  // User endpoints (relay-side, via /api/ rewrite)
  me: () => request<{
    data: Array<{
      provider: string;
      providerEnabled: boolean;
      status: string;
      handle: string | null;
      lastVerifiedAt: string | null;
      canConnect: boolean;
    }>;
  }>('/channels/me'),

  connectStart: (provider: string, handle?: string) =>
    request<{ data: { state: string; connectUrl: string | null; expiresAt: string } }>(
      `/channels/me/${provider}/connect/start`,
      { method: 'POST', body: JSON.stringify({ handle }) }
    ),

  connectStatus: (provider: string) =>
    request<{ data: { status: string; handle: string | null; failureReason: string | null; lastVerifiedAt: string | null } }>(
      `/channels/me/${provider}/connect/status`
    ),

  disconnect: (provider: string) =>
    request<{ data: { disconnected: boolean } }>(
      `/channels/me/${provider}/disconnect`,
      { method: 'POST', body: JSON.stringify({ confirm: true }) }
    ),

  updateRouting: (data: { preferredChannel?: string | null; channels?: string[] }) =>
    request<{ data: { preferredChannel: string | null; channels: string[] } }>(
      '/channels/me/routing',
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  // Admin endpoints
  providers: () => request<{
    data: Array<{
      provider: string;
      enabled: boolean;
      configured: boolean;
      healthy: boolean;
      connectionCount: number;
    }>;
  }>('/channels/providers'),

  updateProvider: (provider: string, data: { enabled?: boolean; configRef?: string }) =>
    request<{ data: { provider: string; enabled: boolean; configured: boolean; updatedAt: string } }>(
      `/channels/providers/${provider}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  testProvider: (provider: string) =>
    request<{ data: { ok: boolean; message: string } }>(
      `/channels/providers/${provider}/test`,
      { method: 'POST' }
    ),

  rotateWebhookSecret: (provider: string) =>
    request<{ data: { rotated: boolean; updatedAt: string } }>(
      `/channels/providers/${provider}/rotate-webhook-secret`,
      { method: 'POST' }
    ),
};

export const admin = {
  provisionTeam: (data: { teamName: string; subdomain: string; adminEmail: string; adminPassword: string; dropletSize?: string; region?: string }) =>
    backendRequest<{ jobId: string; status: string }>('/admin/provision-team', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listJobs: () =>
    backendRequest<{ jobs: Array<any> }>('/admin/provision-jobs'),
  getJob: (id: string) =>
    backendRequest<{ job: any }>(`/admin/provision-jobs/${id}`),
  retryJob: (id: string) =>
    backendRequest<{ jobId: string }>(`/admin/provision-jobs/${id}/retry`, { method: 'POST' }),
};
