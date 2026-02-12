import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient } from "../src/relay-client.js";
import type { ShareTezRequest, ReplyTezRequest, RegisterContactRequest, TezRecord } from "../src/relay-client.js";

// ── Helpers ──────────────────────────────────────────────────────────

const RELAY_URL = "http://localhost:3002";
const JWT_TOKEN = "test-jwt-token-123";
const TEAM_ID = "team-abc";
const USER_ID = "user-xyz";

function createClient(): RelayClient {
  return new RelayClient({
    relayUrl: RELAY_URL,
    jwtToken: JWT_TOKEN,
    teamId: TEAM_ID,
    userId: USER_ID,
  });
}

function makeTezRecord(overrides: Partial<TezRecord> = {}): TezRecord {
  return {
    id: "tez-001",
    teamId: TEAM_ID,
    threadId: null,
    parentTezId: null,
    surfaceText: "Hello from relay",
    type: "note",
    urgency: "normal",
    senderUserId: USER_ID,
    visibility: "team",
    status: "active",
    createdAt: "2026-02-09T00:00:00.000Z",
    updatedAt: "2026-02-09T00:00:00.000Z",
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("RelayClient", () => {
  let client: RelayClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = createClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Auth & Headers ───────────────────────────────────────────────

  describe("authentication", () => {
    it("sends Bearer token in Authorization header", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: "ok", service: "relay", version: "1.0" }),
      );

      await client.health();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers.Authorization).toBe(`Bearer ${JWT_TOKEN}`);
    });

    it("sends Content-Type: application/json", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: "ok", service: "relay", version: "1.0" }),
      );

      await client.health();

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers["Content-Type"]).toBe("application/json");
    });

    it("setToken updates the auth token for subsequent requests", async () => {
      const newToken = "new-jwt-token-456";
      client.setToken(newToken);

      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: "ok", service: "relay", version: "1.0" }),
      );

      await client.health();

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers.Authorization).toBe(`Bearer ${newToken}`);
    });
  });

  // ── URL Construction ─────────────────────────────────────────────

  describe("URL construction", () => {
    it("strips trailing slash from relayUrl", async () => {
      const trailingSlashClient = new RelayClient({
        relayUrl: "http://localhost:3002/",
        jwtToken: JWT_TOKEN,
        teamId: TEAM_ID,
        userId: USER_ID,
      });

      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: "ok", service: "relay", version: "1.0" }),
      );

      await trailingSlashClient.health();

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://localhost:3002/health");
    });
  });

  // ── shareTez ─────────────────────────────────────────────────────

  describe("shareTez", () => {
    it("sends POST /tez/share with correct body", async () => {
      const tezRecord = makeTezRecord();
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: tezRecord }));

      const req: ShareTezRequest = {
        teamId: TEAM_ID,
        surfaceText: "Test message",
        type: "note",
        urgency: "normal",
        visibility: "team",
        recipients: [],
      };

      const result = await client.shareTez(req);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/tez/share`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual(req);
      expect(result.data).toEqual(tezRecord);
    });

    it("sends POST with DM visibility and recipients", async () => {
      const tezRecord = makeTezRecord({ visibility: "dm" });
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: tezRecord }));

      const req: ShareTezRequest = {
        teamId: TEAM_ID,
        surfaceText: "DM message",
        visibility: "dm",
        recipients: ["user-other"],
      };

      await client.shareTez(req);

      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.visibility).toBe("dm");
      expect(body.recipients).toEqual(["user-other"]);
    });

    it("includes context layers when provided", async () => {
      const tezRecord = makeTezRecord();
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: tezRecord }));

      const req: ShareTezRequest = {
        teamId: TEAM_ID,
        surfaceText: "With context",
        context: [
          { layer: "background", content: "Some background info" },
          { layer: "fact", content: "A verified fact", confidence: 0.95, source: "verified" },
        ],
      };

      await client.shareTez(req);

      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.context).toHaveLength(2);
      expect(body.context[0].layer).toBe("background");
      expect(body.context[1].confidence).toBe(0.95);
    });
  });

  // ── getStream ────────────────────────────────────────────────────

  describe("getStream", () => {
    it("sends GET /tez/stream with teamId query param", async () => {
      const items = [makeTezRecord()];
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: items, meta: { count: 1, hasMore: false } }),
      );

      const result = await client.getStream(TEAM_ID);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("/tez/stream?");
      expect(url).toContain(`teamId=${TEAM_ID}`);
      expect(opts.method).toBe("GET");
      expect(result.data).toHaveLength(1);
    });

    it("includes limit query param when specified", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0, hasMore: false } }),
      );

      await client.getStream(TEAM_ID, { limit: 25 });

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain("limit=25");
    });

    it("includes before query param when specified", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0, hasMore: false } }),
      );

      const before = "2026-02-08T00:00:00.000Z";
      await client.getStream(TEAM_ID, { before });

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain(`before=${encodeURIComponent(before)}`);
    });

    it("includes both limit and before query params", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0, hasMore: false } }),
      );

      await client.getStream(TEAM_ID, { limit: 10, before: "2026-02-08T00:00:00.000Z" });

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain("limit=10");
      expect(url).toContain("before=");
    });

    it("does not include body in GET request", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0, hasMore: false } }),
      );

      await client.getStream(TEAM_ID);

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.body).toBeUndefined();
    });
  });

  // ── getTez ───────────────────────────────────────────────────────

  describe("getTez", () => {
    it("sends GET /tez/:id", async () => {
      const tez = { ...makeTezRecord(), context: [], recipients: [] };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: tez }));

      const result = await client.getTez("tez-001");

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/tez/tez-001`);
      expect(opts.method).toBe("GET");
      expect(result.data.id).toBe("tez-001");
      expect(result.data.context).toEqual([]);
      expect(result.data.recipients).toEqual([]);
    });
  });

  // ── replyToTez ───────────────────────────────────────────────────

  describe("replyToTez", () => {
    it("sends POST /tez/:id/reply with correct body", async () => {
      const replyRecord = makeTezRecord({ id: "tez-002", parentTezId: "tez-001" });
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: replyRecord }));

      const req: ReplyTezRequest = {
        surfaceText: "Reply message",
        type: "note",
      };

      const result = await client.replyToTez("tez-001", req);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/tez/tez-001/reply`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual(req);
      expect(result.data.parentTezId).toBe("tez-001");
    });

    it("includes context in reply when provided", async () => {
      const replyRecord = makeTezRecord({ id: "tez-002" });
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: replyRecord }));

      const req: ReplyTezRequest = {
        surfaceText: "Reply with context",
        context: [{ layer: "artifact", content: "Supporting doc" }],
      };

      await client.replyToTez("tez-001", req);

      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.context).toHaveLength(1);
      expect(body.context[0].layer).toBe("artifact");
    });
  });

  // ── getThread ────────────────────────────────────────────────────

  describe("getThread", () => {
    it("sends GET /tez/:id/thread", async () => {
      const threadData = {
        threadId: "thread-001",
        messages: [makeTezRecord()],
        messageCount: 1,
      };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: threadData }));

      const result = await client.getThread("tez-001");

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/tez/tez-001/thread`);
      expect(opts.method).toBe("GET");
      expect(result.data.threadId).toBe("thread-001");
      expect(result.data.messages).toHaveLength(1);
    });
  });

  // ── registerContact ──────────────────────────────────────────────

  describe("registerContact", () => {
    it("sends POST /contacts/register with contact data", async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: { id: "contact-1" } }));

      const req: RegisterContactRequest = {
        displayName: "Test PA",
        email: "pa@test.com",
      };

      await client.registerContact(req);

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/contacts/register`);
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body)).toEqual(req);
    });

    it("sends only displayName when email is omitted", async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: { id: "contact-1" } }));

      await client.registerContact({ displayName: "Minimal PA" });

      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.displayName).toBe("Minimal PA");
      expect(body.email).toBeUndefined();
    });
  });

  // ── getMyContact ─────────────────────────────────────────────────

  describe("getMyContact", () => {
    it("sends GET /contacts/me", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: { id: "contact-1", displayName: "My PA" } }),
      );

      const result = await client.getMyContact();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/contacts/me`);
      expect(opts.method).toBe("GET");
      expect(result.data).toEqual({ id: "contact-1", displayName: "My PA" });
    });
  });

  // ── searchContacts ───────────────────────────────────────────────

  describe("searchContacts", () => {
    it("sends GET /contacts/search with query string", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0 } }),
      );

      await client.searchContacts("alice");

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain("/contacts/search?");
      expect(url).toContain("q=alice");
      expect(opts.method).toBe("GET");
    });

    it("includes limit param when specified", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0 } }),
      );

      await client.searchContacts("bob", 5);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain("limit=5");
    });

    it("does not include limit when not specified", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ data: [], meta: { count: 0 } }),
      );

      await client.searchContacts("carol");

      const [url] = fetchSpy.mock.calls[0];
      expect(url).not.toContain("limit=");
    });
  });

  // ── getUnreadCounts ──────────────────────────────────────────────

  describe("getUnreadCounts", () => {
    it("sends GET /unread", async () => {
      const unread = {
        teams: [{ teamId: TEAM_ID, count: 3 }],
        conversations: [],
        total: 3,
      };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ data: unread }));

      const result = await client.getUnreadCounts();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/unread`);
      expect(opts.method).toBe("GET");
      expect(result.data.total).toBe(3);
      expect(result.data.teams).toHaveLength(1);
    });
  });

  // ── health ───────────────────────────────────────────────────────

  describe("health", () => {
    it("sends GET /health and returns service info", async () => {
      const healthData = { status: "ok", service: "tezit-relay", version: "0.5.0" };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(healthData));

      const result = await client.health();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe(`${RELAY_URL}/health`);
      expect(opts.method).toBe("GET");
      expect(result).toEqual(healthData);
    });
  });

  // ── Error Handling ───────────────────────────────────────────────

  describe("error handling", () => {
    it("throws on non-200 response with status and body", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response);

      await expect(client.health()).rejects.toThrow(
        "Relay GET /health failed (401): Unauthorized",
      );
    });

    it("throws on 404 response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response);

      await expect(client.getTez("nonexistent")).rejects.toThrow(
        "Relay GET /tez/nonexistent failed (404): Not found",
      );
    });

    it("throws on 500 response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response);

      await expect(client.shareTez({ teamId: TEAM_ID, surfaceText: "test" })).rejects.toThrow(
        "Relay POST /tez/share failed (500): Internal Server Error",
      );
    });

    it("handles text() failure gracefully", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error("network error")),
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response);

      await expect(client.health()).rejects.toThrow(
        "Relay GET /health failed (502): ",
      );
    });

    it("throws on network-level fetch failure", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(client.health()).rejects.toThrow("ECONNREFUSED");
    });
  });
});
