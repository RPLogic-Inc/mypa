import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module Mocks ─────────────────────────────────────────────────────
// Mock RelayClient and TezitPoller before importing the channel module.
// The channel module creates these internally, so we mock the modules.

const mockShareTez = vi.fn();
const mockRegisterContact = vi.fn();
const mockHealth = vi.fn();
const mockRelayConstructor = vi.fn();

vi.mock("../src/relay-client.js", () => ({
  RelayClient: class MockRelayClient {
    constructor(config: any) {
      mockRelayConstructor(config);
    }
    shareTez = mockShareTez;
    registerContact = mockRegisterContact;
    health = mockHealth;
    setToken = vi.fn();
  },
}));

const mockPollerStart = vi.fn();
const mockPollerStop = vi.fn();
const mockPollerConstructor = vi.fn();

vi.mock("../src/poller.js", () => ({
  TezitPoller: class MockTezitPoller {
    constructor(client: any, config: any, handler: any) {
      mockPollerConstructor(client, config, handler);
      // Store the handler so we can invoke it in tests
      MockTezitPoller._lastHandler = handler;
      MockTezitPoller._lastInstance = this;
    }
    start = mockPollerStart;
    stop = mockPollerStop;
    static _lastHandler: any = null;
    static _lastInstance: any = null;
  },
}));

// Now import the channel module (uses mocked dependencies)
import register from "../src/channel.js";
import type { TezRecord } from "../src/relay-client.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeTezRecord(overrides: Partial<TezRecord> = {}): TezRecord {
  return {
    id: "tez-001",
    teamId: "team-abc",
    threadId: null,
    parentTezId: null,
    surfaceText: "Hello from relay",
    type: "note",
    urgency: "normal",
    senderUserId: "user-other",
    visibility: "team",
    status: "active",
    createdAt: "2026-02-09T00:00:00.000Z",
    updatedAt: "2026-02-09T00:00:00.000Z",
    ...overrides,
  };
}

interface CapturedPlugin {
  id: string;
  meta: {
    id: string;
    label: string;
    selectionLabel: string;
    blurb: string;
    aliases?: string[];
  };
  capabilities: {
    chatTypes: string[];
  };
  config: {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId?: string) => any;
  };
  outbound: {
    deliveryMode: string;
    sendText: (args: any) => Promise<any>;
  };
  setup?: (api: any) => Promise<void>;
  teardown?: () => Promise<void>;
}

function createMockApi(configOverrides: any = {}) {
  const tezitConfig = {
    relayUrl: "http://localhost:3002",
    jwtToken: "test-jwt",
    teamId: "team-abc",
    userId: "user-xyz",
    displayName: "Test PA",
    email: "pa@test.com",
    pollIntervalMs: 5_000,
    ...configOverrides,
  };

  return {
    registerChannel: vi.fn(),
    onMessage: vi.fn(),
    config: {
      channels: {
        tezit: tezitConfig,
      },
    },
  };
}

function registerAndCapture(api: ReturnType<typeof createMockApi>): CapturedPlugin {
  register(api as any);
  expect(api.registerChannel).toHaveBeenCalledOnce();
  return api.registerChannel.mock.calls[0][0].plugin;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Tezit Channel Plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRegisterContact.mockResolvedValue({ data: {} });
    mockHealth.mockResolvedValue({ status: "ok", service: "relay", version: "1.0" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Registration ──────────────────────────────────────────────

  describe("register()", () => {
    it("calls api.registerChannel with a plugin object", () => {
      const api = createMockApi();
      register(api as any);

      expect(api.registerChannel).toHaveBeenCalledOnce();
      expect(api.registerChannel).toHaveBeenCalledWith({
        plugin: expect.objectContaining({ id: "tezit" }),
      });
    });

    it("logs registration message", () => {
      const api = createMockApi();
      register(api as any);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Tezit channel plugin registered"),
      );
    });
  });

  // ── Plugin Meta ───────────────────────────────────────────────

  describe("plugin meta", () => {
    it("has id 'tezit'", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.id).toBe("tezit");
    });

    it("has label 'Tezit'", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.meta.label).toBe("Tezit");
    });

    it("has selectionLabel describing native PA-to-PA", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.meta.selectionLabel).toContain("PA-to-PA");
    });

    it("has blurb describing Tez messaging", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.meta.blurb).toContain("Tez");
    });

    it("has aliases including 'tez'", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.meta.aliases).toContain("tez");
    });
  });

  // ── Capabilities ──────────────────────────────────────────────

  describe("capabilities", () => {
    it("supports direct, group, and thread chat types", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.capabilities.chatTypes).toEqual(["direct", "group", "thread"]);
    });
  });

  // ── Config: listAccountIds ────────────────────────────────────

  describe("config.listAccountIds", () => {
    it("returns empty array when no tezit config exists", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      expect(plugin.config.listAccountIds({})).toEqual([]);
      expect(plugin.config.listAccountIds({ channels: {} })).toEqual([]);
      expect(plugin.config.listAccountIds(null)).toEqual([]);
      expect(plugin.config.listAccountIds(undefined)).toEqual([]);
    });

    it('returns ["default"] for single-account config (enabled)', () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const cfg = { channels: { tezit: { enabled: true, relayUrl: "http://..." } } };
      expect(plugin.config.listAccountIds(cfg)).toEqual(["default"]);
    });

    it("returns empty array when enabled is false", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const cfg = { channels: { tezit: { enabled: false } } };
      expect(plugin.config.listAccountIds(cfg)).toEqual([]);
    });

    it('returns ["default"] when enabled is not explicitly set (default behavior)', () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const cfg = { channels: { tezit: { relayUrl: "http://..." } } };
      expect(plugin.config.listAccountIds(cfg)).toEqual(["default"]);
    });

    it("returns account IDs when multi-account config is used", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const cfg = {
        channels: {
          tezit: {
            accounts: {
              personal: { relayUrl: "http://a.com" },
              work: { relayUrl: "http://b.com" },
            },
          },
        },
      };
      expect(plugin.config.listAccountIds(cfg)).toEqual(["personal", "work"]);
    });
  });

  // ── Config: resolveAccount ────────────────────────────────────

  describe("config.resolveAccount", () => {
    it("returns empty object when no tezit config exists", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      expect(plugin.config.resolveAccount({})).toEqual({});
      expect(plugin.config.resolveAccount({ channels: {} })).toEqual({});
    });

    it("returns the tezit config object for single-account mode", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const tezitCfg = { relayUrl: "http://localhost:3002", jwtToken: "tok" };
      const cfg = { channels: { tezit: tezitCfg } };
      expect(plugin.config.resolveAccount(cfg)).toBe(tezitCfg);
    });

    it("resolves named account in multi-account mode", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const workAccount = { relayUrl: "http://work.com" };
      const cfg = {
        channels: {
          tezit: {
            accounts: {
              personal: { relayUrl: "http://personal.com" },
              work: workAccount,
            },
          },
        },
      };
      expect(plugin.config.resolveAccount(cfg, "work")).toBe(workAccount);
    });

    it("falls back to 'default' account when accountId is not provided in multi-account mode", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const defaultAccount = { relayUrl: "http://default.com" };
      const cfg = {
        channels: {
          tezit: {
            accounts: {
              default: defaultAccount,
              other: { relayUrl: "http://other.com" },
            },
          },
        },
      };
      expect(plugin.config.resolveAccount(cfg)).toBe(defaultAccount);
    });

    it("returns empty object for nonexistent account in multi-account mode", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      const cfg = {
        channels: {
          tezit: {
            accounts: {
              personal: { relayUrl: "http://a.com" },
            },
          },
        },
      };
      expect(plugin.config.resolveAccount(cfg, "nonexistent")).toEqual({});
    });
  });

  // ── Outbound: sendText ────────────────────────────────────────

  describe("outbound.sendText", () => {
    it("returns error when channel is not initialized", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      // Don't call setup, so relayClient is null
      const result = await plugin.outbound.sendText({ text: "hello" });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not initialized");
    });

    it("calls relay shareTez on successful send", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      // Setup to initialize relay client
      await plugin.setup!(api as any);

      const tezRecord = makeTezRecord({ id: "tez-sent" });
      mockShareTez.mockResolvedValueOnce({ data: tezRecord });

      const result = await plugin.outbound.sendText({ text: "hello world" });

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe("tez-sent");
      expect(mockShareTez).toHaveBeenCalledWith({
        teamId: "team-abc",
        surfaceText: "hello world",
        type: "note",
        urgency: "normal",
        visibility: "team",
        recipients: [],
      });
    });

    it("sends as DM when conversationId is provided", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      const tezRecord = makeTezRecord({ visibility: "dm" });
      mockShareTez.mockResolvedValueOnce({ data: tezRecord });

      const result = await plugin.outbound.sendText({
        text: "direct message",
        conversationId: "user-target",
      });

      expect(result.ok).toBe(true);
      expect(mockShareTez).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "dm",
          recipients: ["user-target"],
        }),
      );
    });

    it("returns error result when shareTez throws", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      mockShareTez.mockRejectedValueOnce(new Error("Relay connection refused"));

      const result = await plugin.outbound.sendText({ text: "will fail" });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Relay connection refused");
    });

    it("handles non-Error throw in sendText", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      mockShareTez.mockRejectedValueOnce("string error");

      const result = await plugin.outbound.sendText({ text: "will fail" });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("string error");
    });

    it("has deliveryMode 'direct'", () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);
      expect(plugin.outbound.deliveryMode).toBe("direct");
    });
  });

  // ── Setup ─────────────────────────────────────────────────────

  describe("setup", () => {
    it("initializes RelayClient with config values", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockRelayConstructor).toHaveBeenCalledWith({
        relayUrl: "http://localhost:3002",
        jwtToken: "test-jwt",
        teamId: "team-abc",
        userId: "user-xyz",
      });
    });

    it("registers contact on startup", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockRegisterContact).toHaveBeenCalledWith({
        displayName: "Test PA",
        email: "pa@test.com",
      });
    });

    it("checks relay health on startup", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockHealth).toHaveBeenCalledOnce();
    });

    it("starts the inbound poller", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockPollerConstructor).toHaveBeenCalledOnce();
      expect(mockPollerConstructor).toHaveBeenCalledWith(
        expect.anything(), // RelayClient instance
        {
          teamId: "team-abc",
          userId: "user-xyz",
          intervalMs: 5_000,
        },
        expect.any(Function), // handler callback
      );
      expect(mockPollerStart).toHaveBeenCalledOnce();
    });

    it("uses default pollIntervalMs of 10000 when not configured", async () => {
      const api = createMockApi({ pollIntervalMs: undefined });
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockPollerConstructor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ intervalMs: 10_000 }),
        expect.any(Function),
      );
    });

    it("uses default displayName 'PA Agent' when not configured", async () => {
      const api = createMockApi({ displayName: undefined });
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(mockRegisterContact).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "PA Agent" }),
      );
    });

    it("warns and returns early when config is missing required fields", async () => {
      const api = createMockApi();
      // Override config to be missing required fields
      api.config = { channels: { tezit: {} } } as any;
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Missing required config"),
      );
      expect(mockRelayConstructor).not.toHaveBeenCalled();
      expect(mockPollerStart).not.toHaveBeenCalled();
    });

    it("warns when relayUrl is missing", async () => {
      const api = createMockApi({ relayUrl: undefined });
      api.config = {
        channels: { tezit: { jwtToken: "tok", teamId: "t", userId: "u" } },
      } as any;
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Missing required config"),
      );
    });

    it("continues even if registerContact fails", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      mockRegisterContact.mockRejectedValueOnce(new Error("registration failed"));

      await plugin.setup!(api as any);

      // Should still start poller despite registration failure
      expect(mockPollerStart).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Contact registration failed"),
        expect.any(Error),
      );
    });

    it("continues even if health check fails", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      mockHealth.mockRejectedValueOnce(new Error("health check failed"));

      await plugin.setup!(api as any);

      // Should still start poller despite health failure
      expect(mockPollerStart).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("health check failed"),
        expect.any(Error),
      );
    });
  });

  // ── Teardown ──────────────────────────────────────────────────

  describe("teardown", () => {
    it("stops the poller", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);
      await plugin.teardown!();

      expect(mockPollerStop).toHaveBeenCalledOnce();
    });

    it("cleans up relay client reference", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);
      await plugin.teardown!();

      // After teardown, sendText should return not-initialized error
      const result = await plugin.outbound.sendText({ text: "should fail" });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not initialized");
    });

    it("is safe to call teardown without setup", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      // Teardown without prior setup should not throw
      await expect(plugin.teardown!()).resolves.toBeUndefined();
    });
  });

  // ── Inbound Message Handling ──────────────────────────────────

  describe("handleInbound (via poller callback)", () => {
    it("dispatches inbound tez to onMessage with correct shape", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      // Get the handler that was passed to TezitPoller
      const [, , inboundHandler] = mockPollerConstructor.mock.calls[0];

      const tez = makeTezRecord({
        id: "tez-inbound",
        surfaceText: "Incoming message",
        senderUserId: "user-sender",
        teamId: "team-abc",
        threadId: "thread-001",
        type: "question",
        urgency: "high",
        visibility: "dm",
        parentTezId: "tez-parent",
      });

      inboundHandler(tez);

      expect(api.onMessage).toHaveBeenCalledOnce();
      expect(api.onMessage).toHaveBeenCalledWith({
        channelId: "tezit",
        text: "Incoming message",
        senderId: "user-sender",
        conversationId: "team-abc",
        threadId: "thread-001",
        metadata: {
          tezId: "tez-inbound",
          type: "question",
          urgency: "high",
          visibility: "dm",
          parentTezId: "tez-parent",
        },
      });
    });

    it("passes undefined for conversationId when teamId is null", async () => {
      const api = createMockApi();
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      const [, , inboundHandler] = mockPollerConstructor.mock.calls[0];

      const tez = makeTezRecord({ teamId: null, threadId: null });
      inboundHandler(tez);

      expect(api.onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: undefined,
          threadId: undefined,
        }),
      );
    });

    it("warns when onMessage handler is not registered", async () => {
      const api = createMockApi();
      api.onMessage = undefined as any;
      const plugin = registerAndCapture(api);

      await plugin.setup!(api as any);

      const [, , inboundHandler] = mockPollerConstructor.mock.calls[0];

      const tez = makeTezRecord();
      inboundHandler(tez);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("No onMessage handler registered"),
      );
    });
  });
});
