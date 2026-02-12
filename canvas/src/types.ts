export interface Contact {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  tezAddress: string;
  status: 'active' | 'away' | 'offline';
  lastSeenAt?: string;
}

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  name?: string;
  members: ConversationMember[];
  lastMessage?: Tez;
  unreadCount?: number;
}

export interface ConversationMember {
  userId: string;
  displayName?: string;
  joinedAt: string;
  lastReadAt?: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface ContextLayer {
  layer: 'background' | 'fact' | 'artifact' | 'relationship' | 'constraint' | 'hint';
  content: string;
  mimeType?: string;
  confidence?: number;
  source?: 'stated' | 'inferred' | 'verified';
}

export interface Tez {
  id: string;
  teamId?: string;
  conversationId?: string;
  threadId?: string;
  parentTezId?: string;
  surfaceText: string;
  type: 'note' | 'decision' | 'handoff' | 'question' | 'update';
  urgency: 'critical' | 'high' | 'normal' | 'low' | 'fyi';
  actionRequested?: string;
  senderUserId: string;
  senderName?: string;
  visibility: 'team' | 'dm' | 'private';
  status: 'active' | 'archived' | 'deleted';
  contextCount?: number;
  createdAt: string;
}

export interface TezFull extends Tez {
  context: ContextLayer[];
  recipients: { userId: string; deliveredAt?: string; readAt?: string }[];
}

export interface Thread {
  threadId: string;
  rootTezId: string;
  messages: Tez[];
  messageCount: number;
}

export interface UnreadCounts {
  teams: { teamId: string; count: number }[];
  conversations: { conversationId: string; count: number }[];
  total: number;
}

export type ShareTezRequest = {
  teamId: string;
  surfaceText: string;
  type?: Tez['type'];
  urgency?: Tez['urgency'];
  actionRequested?: string;
  visibility?: Tez['visibility'];
  recipients?: string[];
  context?: ContextLayer[];
};

// Multimodal content parts (OpenAI-compatible)
export interface TextContentPart {
  type: 'text';
  text: string;
}
export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}
export type ContentPart = TextContentPart | ImageContentPart;

// File attachment metadata
export interface FileAttachment {
  id: string;
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  /** Ephemeral — base64 data URL set during upload, stripped before IndexedDB save */
  base64DataUrl?: string;
}

// AI Chat types
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: FileAttachment[];
  toolsUsed?: string[];
  agentId?: string;
  agentLabel?: string;
  model?: string;
  artifact?: ArtifactRef | null;
}

export interface AIChatSession {
  id: string;
  title: string;
  messages: AIChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Artifact types
export interface ArtifactRef {
  id: string;
  type: 'research' | 'draft' | 'briefing' | 'analysis' | 'email' | 'general';
  title: string;
  content: string;
  status: 'draft' | 'published' | 'shared';
  createdAt: string;
  tezId?: string;
}

// App view types
export type AppView = 'chat' | 'inbox' | 'artifacts' | 'library' | 'settings';

export type CrmEntityType = 'person' | 'opportunity' | 'task';

export type CrmSummary = Record<string, unknown>;
export type CrmEntityRecord = Record<string, unknown>;

export interface CrmStatus {
  configured: boolean;
  reachable: boolean;
  reason?: string;
  message?: string;
  openclawConfigured?: boolean;
  paWorkspaceConfigured?: boolean;
  paWorkspaceReachable?: boolean;
  paWorkspaceMessage?: string;
}

export interface CrmWorkflowStatus {
  twenty: {
    configured: boolean;
    reason?: string | null;
  };
  openclaw: {
    configured: boolean;
  };
  paWorkspace: {
    configured: boolean;
    reachable: boolean;
    message: string;
  };
}

export interface CrmTezContextLayer {
  type: 'text';
  content: string;
  query?: string;
}

export interface CrmTezContextResult {
  entityType: CrmEntityType;
  entityId: string;
  summary: CrmSummary;
  contextLayers: CrmTezContextLayer[];
  relayContext: ContextLayer[];
}

export interface CrmWriteResult {
  entityType: CrmEntityType;
  entityId?: string;
  summary: CrmSummary;
  entity: CrmEntityRecord;
}

// Invite types
export interface TeamInvite {
  id: string;
  code: string;
  teamId: string;
  email?: string | null;
  maxUses: number;
  usedCount?: number;
  expiresAt?: string | null;
  defaultDepartment?: string | null;
  defaultRoles?: string[] | null;
  defaultSkills?: string[] | null;
  status: 'active' | 'revoked';
  createdAt: string;
  updatedAt?: string;
}

export interface InviteValidation {
  valid: boolean;
  team?: { id: string; name: string };
  invite?: {
    email?: string | null;
    defaultDepartment?: string | null;
    defaultRoles?: string[] | null;
    openclawConfig?: { createAgent: boolean } | null;
  };
  error?: { code: string; message: string };
}

export interface CrmWorkflowResult {
  entityType: CrmEntityType;
  entityId: string;
  summary: CrmSummary;
  contextLayers: CrmTezContextLayer[];
  relayContext: ContextLayer[];
  tezDraft: {
    teamId: string | null;
    recipients: string[];
    type: Tez['type'] | string;
    urgency: Tez['urgency'] | string;
    visibility: Tez['visibility'] | string;
    surfaceText: string;
    context: ContextLayer[];
  };
  openclaw: {
    available: boolean;
    generated: boolean;
    message: string;
    model?: string;
    summary?: string;
  };
  googleWorkspace: {
    enabled: boolean;
    configured: boolean;
    dryRun: boolean;
    reason?: string | null;
    emailDraft?: Record<string, unknown>;
    calendarAction?: Record<string, unknown>;
    emailResult?: Record<string, unknown> | null;
    calendarResult?: Record<string, unknown> | null;
  };
}

export interface ProvisionTeamRequest {
  teamName: string;
  subdomain: string;
  adminEmail: string;
  adminPassword: string;
  dropletSize?: string;
  region?: string;
}

export interface ProvisioningJob {
  id: string;
  teamName: string;
  subdomain: string;
  adminEmail: string;
  status: string;
  currentStep: string | null;
  progress: number;
  dropletId: string | null;
  dropletIp: string | null;
  appUrl: string | null;
  error: string | null;
  log: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Active scope for hub-and-spoke navigation */
export interface AppScope {
  type: 'personal' | 'team' | 'all';
  teamId?: string;
  hubHost?: string;
  teamName?: string;
}
