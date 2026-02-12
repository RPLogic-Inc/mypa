/**
 * Tezit Relay HTTP Client
 *
 * Communicates with the Tezit Relay service (port 3002) to send/receive
 * tezits, manage contacts, and poll for new messages.
 *
 * Auth: JWT Bearer token (same shared secret as all MyPA services).
 */

export interface RelayConfig {
  /** Relay base URL, e.g. "http://localhost:3002" or "https://api.mypa.chat" */
  relayUrl: string;
  /** JWT token for relay auth */
  jwtToken: string;
  /** Team ID for scoped operations */
  teamId: string;
  /** User ID of the PA owner (sender) */
  userId: string;
}

export interface TezContext {
  layer: "background" | "fact" | "artifact" | "relationship" | "constraint" | "hint";
  content: string;
  mimeType?: string;
  confidence?: number;
  source?: "stated" | "inferred" | "verified";
}

export interface ShareTezRequest {
  teamId: string;
  surfaceText: string;
  type?: "note" | "decision" | "handoff" | "question" | "update";
  urgency?: "critical" | "high" | "normal" | "low" | "fyi";
  actionRequested?: string;
  visibility?: "team" | "dm" | "private";
  recipients?: string[];
  context?: TezContext[];
}

export interface TezRecord {
  id: string;
  teamId: string | null;
  threadId: string | null;
  parentTezId: string | null;
  surfaceText: string;
  type: string;
  urgency: string;
  senderUserId: string;
  visibility: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReplyTezRequest {
  surfaceText: string;
  type?: "note" | "decision" | "handoff" | "question" | "update";
  context?: TezContext[];
}

export interface RegisterContactRequest {
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface UnreadCounts {
  teams: Array<{ teamId: string; count: number }>;
  conversations: Array<{ conversationId: string; count: number }>;
  total: number;
}

/**
 * HTTP client for the Tezit Relay API.
 */
export class RelayClient {
  private relayUrl: string;
  private jwtToken: string;

  constructor(config: RelayConfig) {
    this.relayUrl = config.relayUrl.replace(/\/$/, "");
    this.jwtToken = config.jwtToken;
  }

  /** Update the JWT token (e.g. after refresh). */
  setToken(token: string): void {
    this.jwtToken = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    let url = `${this.relayUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.jwtToken}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Relay ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Tez Operations ──────────────────────────────────────────────────

  /** Send a new Tez via the relay. */
  async shareTez(req: ShareTezRequest): Promise<{ data: TezRecord }> {
    return this.request("POST", "/tez/share", req);
  }

  /** Reply to an existing Tez (threaded). */
  async replyToTez(tezId: string, req: ReplyTezRequest): Promise<{ data: TezRecord }> {
    return this.request("POST", `/tez/${tezId}/reply`, req);
  }

  /** Get a Tez by ID with full context. */
  async getTez(tezId: string): Promise<{ data: TezRecord & { context: unknown[]; recipients: unknown[] } }> {
    return this.request("GET", `/tez/${tezId}`);
  }

  /** Get the Tez stream (feed) for a team. */
  async getStream(teamId: string, opts?: { limit?: number; before?: string }): Promise<{ data: TezRecord[]; meta: { count: number; hasMore: boolean } }> {
    const query: Record<string, string> = { teamId };
    if (opts?.limit) query.limit = String(opts.limit);
    if (opts?.before) query.before = opts.before;
    return this.request("GET", "/tez/stream", undefined, query);
  }

  /** Get full conversation thread. */
  async getThread(tezId: string): Promise<{ data: { threadId: string; messages: TezRecord[]; messageCount: number } }> {
    return this.request("GET", `/tez/${tezId}/thread`);
  }

  // ── Contacts ────────────────────────────────────────────────────────

  /** Register or update the PA's contact profile. */
  async registerContact(req: RegisterContactRequest): Promise<{ data: unknown }> {
    return this.request("POST", "/contacts/register", req);
  }

  /** Get own contact profile. */
  async getMyContact(): Promise<{ data: unknown }> {
    return this.request("GET", "/contacts/me");
  }

  /** Search contacts by name or email. */
  async searchContacts(q: string, limit?: number): Promise<{ data: unknown[]; meta: { count: number } }> {
    const query: Record<string, string> = { q };
    if (limit) query.limit = String(limit);
    return this.request("GET", "/contacts/search", undefined, query);
  }

  // ── Unread ──────────────────────────────────────────────────────────

  /** Get unread counts across teams and conversations. */
  async getUnreadCounts(): Promise<{ data: UnreadCounts }> {
    return this.request("GET", "/unread");
  }

  // ── Health ──────────────────────────────────────────────────────────

  /** Check relay health. */
  async health(): Promise<{ status: string; service: string; version: string }> {
    // Health endpoint doesn't require auth, but we include it anyway
    return this.request("GET", "/health");
  }
}
