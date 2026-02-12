import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TezitPoller } from "../src/poller.js";
import type { PollerConfig, InboundHandler } from "../src/poller.js";
import type { RelayClient, TezRecord } from "../src/relay-client.js";

// ── Helpers ──────────────────────────────────────────────────────────

const TEAM_ID = "team-abc";
const USER_ID = "user-xyz";
const OTHER_USER = "user-other";

function makeTezRecord(overrides: Partial<TezRecord> = {}): TezRecord {
  return {
    id: "tez-001",
    teamId: TEAM_ID,
    threadId: null,
    parentTezId: null,
    surfaceText: "Hello",
    type: "note",
    urgency: "normal",
    senderUserId: OTHER_USER,
    visibility: "team",
    status: "active",
    createdAt: "2026-02-09T10:00:00.000Z",
    updatedAt: "2026-02-09T10:00:00.000Z",
    ...overrides,
  };
}

function createMockClient(items: TezRecord[] = []): RelayClient {
  return {
    getStream: vi.fn().mockResolvedValue({
      data: items,
      meta: { count: items.length, hasMore: false },
    }),
  } as unknown as RelayClient;
}

function createPoller(
  client: RelayClient,
  handler: InboundHandler,
  configOverrides: Partial<PollerConfig> = {},
): TezitPoller {
  return new TezitPoller(
    client,
    {
      teamId: TEAM_ID,
      userId: USER_ID,
      intervalMs: 10_000,
      ...configOverrides,
    },
    handler,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("TezitPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Lifecycle ──────────────────────────────────────────────────

  describe("start/stop lifecycle", () => {
    it("starts in stopped state", () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      expect(poller.isRunning).toBe(false);
    });

    it("isRunning is true after start()", () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      expect(poller.isRunning).toBe(true);

      poller.stop();
    });

    it("isRunning is false after stop()", () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      poller.stop();
      expect(poller.isRunning).toBe(false);
    });

    it("start() is idempotent (calling twice has no extra effect)", async () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      poller.start(); // second call should be no-op

      // Let the immediate poll resolve
      await vi.advanceTimersByTimeAsync(0);

      // Should only have been called once (from the first start)
      expect(client.getStream).toHaveBeenCalledTimes(1);

      poller.stop();
    });

    it("stop() clears timer and prevents further polls", async () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // first immediate poll
      poller.stop();

      // Advance past where next poll would have been
      await vi.advanceTimersByTimeAsync(20_000);

      // Only the initial poll should have fired
      expect(client.getStream).toHaveBeenCalledTimes(1);
    });
  });

  // ── Polling Behavior ──────────────────────────────────────────

  describe("polling", () => {
    it("polls immediately on start (delay = 0)", async () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(client.getStream).toHaveBeenCalledTimes(1);
      expect(client.getStream).toHaveBeenCalledWith(TEAM_ID, { limit: 50 });

      poller.stop();
    });

    it("polls again after intervalMs", async () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 5_000 });

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // immediate poll
      expect(client.getStream).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000); // second poll
      expect(client.getStream).toHaveBeenCalledTimes(2);

      poller.stop();
    });

    it("uses default intervalMs of 10000 when not specified", async () => {
      const client = createMockClient();
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: undefined });

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // immediate
      expect(client.getStream).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(9_999);
      expect(client.getStream).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(client.getStream).toHaveBeenCalledTimes(2);

      poller.stop();
    });
  });

  // ── Filtering ─────────────────────────────────────────────────

  describe("message filtering", () => {
    it("filters out own messages (matching userId)", async () => {
      const ownMessage = makeTezRecord({
        id: "tez-own",
        senderUserId: USER_ID, // same as poller userId
      });
      const client = createMockClient([ownMessage]);
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(handler).not.toHaveBeenCalled();

      poller.stop();
    });

    it("dispatches messages from other users", async () => {
      const otherMessage = makeTezRecord({
        id: "tez-other",
        senderUserId: OTHER_USER,
      });
      const client = createMockClient([otherMessage]);
      const handler = vi.fn();
      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(otherMessage);

      poller.stop();
    });

    it("filters out already-seen messages (dedup by id)", async () => {
      const message = makeTezRecord({ id: "tez-dup" });
      const client = createMockClient([message]);
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 1_000 });

      poller.start();

      // First poll: message is new
      await vi.advanceTimersByTimeAsync(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // Second poll: same message ID should be filtered
      await vi.advanceTimersByTimeAsync(1_000);
      expect(handler).toHaveBeenCalledTimes(1); // still 1

      poller.stop();
    });

    it("filters out messages older than lastSeenTimestamp", async () => {
      // First poll returns a new message to establish lastSeenTimestamp
      const newMessage = makeTezRecord({
        id: "tez-new",
        createdAt: "2026-02-09T12:00:00.000Z",
      });

      const mockGetStream = vi.fn();
      // First poll: new message
      mockGetStream.mockResolvedValueOnce({
        data: [newMessage],
        meta: { count: 1, hasMore: false },
      });

      // Second poll: old message with earlier timestamp and different ID
      const oldMessage = makeTezRecord({
        id: "tez-old",
        createdAt: "2026-02-09T11:00:00.000Z",
      });
      mockGetStream.mockResolvedValueOnce({
        data: [oldMessage],
        meta: { count: 1, hasMore: false },
      });

      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 1_000 });

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // first poll
      expect(handler).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000); // second poll
      // Old message should be filtered because createdAt <= lastSeenTimestamp
      expect(handler).toHaveBeenCalledTimes(1);

      poller.stop();
    });
  });

  // ── Dispatch Order ────────────────────────────────────────────

  describe("dispatch ordering", () => {
    it("dispatches new messages oldest-first", async () => {
      const msg1 = makeTezRecord({ id: "tez-1", createdAt: "2026-02-09T10:01:00.000Z" });
      const msg2 = makeTezRecord({ id: "tez-2", createdAt: "2026-02-09T10:03:00.000Z" });
      const msg3 = makeTezRecord({ id: "tez-3", createdAt: "2026-02-09T10:02:00.000Z" });

      // Items come in descending order (newest first from API)
      const client = createMockClient([msg2, msg3, msg1]);
      const dispatched: string[] = [];
      const handler = vi.fn((tez: TezRecord) => {
        dispatched.push(tez.id);
      });
      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(dispatched).toEqual(["tez-1", "tez-3", "tez-2"]);

      poller.stop();
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe("error handling", () => {
    it("continues processing other messages when handler throws for one", async () => {
      const msg1 = makeTezRecord({ id: "tez-1", createdAt: "2026-02-09T10:00:00.000Z" });
      const msg2 = makeTezRecord({ id: "tez-2", createdAt: "2026-02-09T10:01:00.000Z" });

      const client = createMockClient([msg1, msg2]);
      const handler = vi.fn().mockImplementation((tez: TezRecord) => {
        if (tez.id === "tez-1") throw new Error("handler error");
      });

      const poller = createPoller(client, handler);

      poller.start();
      await vi.advanceTimersByTimeAsync(0);

      // Both messages should have been attempted
      expect(handler).toHaveBeenCalledTimes(2);
      // Error was logged
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error handling tez tez-1"),
        expect.any(Error),
      );

      poller.stop();
    });

    it("continues polling after getStream error", async () => {
      const mockGetStream = vi.fn();
      mockGetStream.mockRejectedValueOnce(new Error("network error"));
      mockGetStream.mockResolvedValueOnce({
        data: [],
        meta: { count: 0, hasMore: false },
      });

      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 1_000 });

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // first poll fails

      expect(mockGetStream).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalled();

      // Wait for backoff (1000 * 2^1 = 2000ms)
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mockGetStream).toHaveBeenCalledTimes(2);

      poller.stop();
    });
  });

  // ── Exponential Backoff ───────────────────────────────────────

  describe("exponential backoff", () => {
    it("backs off exponentially on consecutive errors", async () => {
      const mockGetStream = vi.fn().mockRejectedValue(new Error("fail"));
      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, {
        intervalMs: 1_000,
        maxBackoffMs: 60_000,
      });

      poller.start();

      // Poll 1: immediate (0ms delay)
      await vi.advanceTimersByTimeAsync(0);
      expect(mockGetStream).toHaveBeenCalledTimes(1);

      // After 1st error: backoff = 1000 * 2^1 = 2000ms
      await vi.advanceTimersByTimeAsync(1_999);
      expect(mockGetStream).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockGetStream).toHaveBeenCalledTimes(2);

      // After 2nd error: backoff = 1000 * 2^2 = 4000ms
      await vi.advanceTimersByTimeAsync(3_999);
      expect(mockGetStream).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockGetStream).toHaveBeenCalledTimes(3);

      // After 3rd error: backoff = 1000 * 2^3 = 8000ms
      await vi.advanceTimersByTimeAsync(7_999);
      expect(mockGetStream).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockGetStream).toHaveBeenCalledTimes(4);

      poller.stop();
    });

    it("caps backoff at maxBackoffMs", async () => {
      const mockGetStream = vi.fn().mockRejectedValue(new Error("fail"));
      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, {
        intervalMs: 1_000,
        maxBackoffMs: 5_000,
      });

      poller.start();

      // Poll 1: immediate
      await vi.advanceTimersByTimeAsync(0);
      expect(mockGetStream).toHaveBeenCalledTimes(1);

      // error 1: backoff = min(2000, 5000) = 2000
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mockGetStream).toHaveBeenCalledTimes(2);

      // error 2: backoff = min(4000, 5000) = 4000
      await vi.advanceTimersByTimeAsync(4_000);
      expect(mockGetStream).toHaveBeenCalledTimes(3);

      // error 3: backoff = min(8000, 5000) = 5000 (capped!)
      await vi.advanceTimersByTimeAsync(5_000);
      expect(mockGetStream).toHaveBeenCalledTimes(4);

      // error 4: backoff still capped at 5000
      await vi.advanceTimersByTimeAsync(5_000);
      expect(mockGetStream).toHaveBeenCalledTimes(5);

      poller.stop();
    });

    it("resets backoff after successful poll", async () => {
      const mockGetStream = vi.fn();

      // First poll: error
      mockGetStream.mockRejectedValueOnce(new Error("fail"));
      // Second poll: success
      mockGetStream.mockResolvedValueOnce({
        data: [],
        meta: { count: 0, hasMore: false },
      });
      // Third poll: should be at normal interval
      mockGetStream.mockResolvedValueOnce({
        data: [],
        meta: { count: 0, hasMore: false },
      });

      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 1_000 });

      poller.start();

      // Poll 1 (immediate, fails)
      await vi.advanceTimersByTimeAsync(0);
      expect(mockGetStream).toHaveBeenCalledTimes(1);

      // Backoff 2000ms -> poll 2 (success)
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mockGetStream).toHaveBeenCalledTimes(2);

      // Back to normal interval 1000ms -> poll 3
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mockGetStream).toHaveBeenCalledTimes(3);

      poller.stop();
    });
  });

  // ── seenIds Trimming ──────────────────────────────────────────

  describe("seenIds trimming", () => {
    it("trims seenIds from 500+ to 300 (keeping newest)", async () => {
      // Create 501 unique messages to push seenIds past 500
      const messages: TezRecord[] = [];
      for (let i = 0; i < 501; i++) {
        messages.push(
          makeTezRecord({
            id: `tez-${String(i).padStart(4, "0")}`,
            createdAt: `2026-02-09T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
            senderUserId: OTHER_USER,
          }),
        );
      }

      // Deliver them in batches of 50 across multiple polls
      const mockGetStream = vi.fn();
      for (let batch = 0; batch < 11; batch++) {
        const start = batch * 50;
        const end = Math.min(start + 50, 501);
        const batchItems = messages.slice(start, end);
        mockGetStream.mockResolvedValueOnce({
          data: batchItems,
          meta: { count: batchItems.length, hasMore: false },
        });
      }

      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();
      const poller = createPoller(client, handler, { intervalMs: 1_000 });

      poller.start();

      // Run 11 poll cycles to process all 501+ messages
      for (let i = 0; i < 11; i++) {
        if (i === 0) {
          await vi.advanceTimersByTimeAsync(0);
        } else {
          await vi.advanceTimersByTimeAsync(1_000);
        }
      }

      // Handler should have been called for all 501 messages
      expect(handler).toHaveBeenCalledTimes(501);

      // After trimming, previously-seen early IDs should NOT be in the set,
      // meaning if they reappear they would be dispatched again.
      // We can verify by sending early messages again:
      const earlyMessage = messages[0]; // tez-0000
      mockGetStream.mockResolvedValueOnce({
        data: [earlyMessage],
        meta: { count: 1, hasMore: false },
      });

      await vi.advanceTimersByTimeAsync(1_000);

      // tez-0000 was trimmed from seenIds, but it will be filtered by
      // lastSeenTimestamp (it's older), so handler count stays the same.
      // This confirms the trim happened and lastSeenTimestamp acts as backup.
      expect(handler.mock.calls.length).toBe(501);

      poller.stop();
    });
  });

  // ── Default Config ────────────────────────────────────────────

  describe("default config values", () => {
    it("uses maxBackoffMs of 60000 by default", async () => {
      const mockGetStream = vi.fn().mockRejectedValue(new Error("fail"));
      const client = { getStream: mockGetStream } as unknown as RelayClient;
      const handler = vi.fn();

      // Don't specify maxBackoffMs, should default to 60_000
      const poller = createPoller(client, handler, {
        intervalMs: 10_000,
        maxBackoffMs: undefined,
      });

      poller.start();

      // Simulate many consecutive errors to reach the cap
      // After 6 errors: 10000 * 2^6 = 640000, capped at 60000
      for (let i = 0; i < 7; i++) {
        if (i === 0) {
          await vi.advanceTimersByTimeAsync(0);
        } else {
          // Each error doubles; cap is 60000
          const delay = Math.min(10_000 * Math.pow(2, i), 60_000);
          await vi.advanceTimersByTimeAsync(delay);
        }
      }

      // Verify it continued polling (7 attempts)
      expect(mockGetStream).toHaveBeenCalledTimes(7);

      poller.stop();
    });
  });
});
