import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    createPaCalendarEvent: vi.fn(),
  };
});

vi.mock("../src/db/index.js", async () => {
  const schema = await import("../src/db/schema.js");
  return {
    db: new Proxy({} as any, {
      get(_target: any, prop: string) {
        const db = mocks.getTestDb();
        if (!db) throw new Error("testDb not initialized");
        return (db as any)[prop];
      },
    }),
    ...schema,
  };
});

vi.mock("../src/middleware/logging.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../src/services/googleCalendar.js", () => ({
  createPaCalendarEvent: mocks.createPaCalendarEvent,
}));

import { logAction, ACTION_COLORS } from "../src/services/actionLogger.js";

describe("Action Logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
  });

  describe("logAction", () => {
    it("inserts action into local DB", async () => {
      const id = await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "email_read",
        summary: "Read 3 emails",
      });

      expect(id).toBeTruthy();

      const { paActionLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = mocks.getTestDb();
      const entries = await db.select().from(paActionLog).where(eq(paActionLog.id, id));

      expect(entries).toHaveLength(1);
      expect(entries[0].paEmail).toBe("alice-pa@pa.test.com");
      expect(entries[0].actionType).toBe("email_read");
      expect(entries[0].summary).toBe("Read 3 emails");
      expect(entries[0].calendarSyncStatus).toBe("pending");
    });

    it("stores optional fields (durationMs, cardId, emailMessageId)", async () => {
      const id = await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "card_created",
        summary: "Created card from email",
        durationMs: 3000,
        cardId: "card-123",
        emailMessageId: "msg-456",
      });

      const { paActionLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = mocks.getTestDb();
      const entry = await db.select().from(paActionLog).where(eq(paActionLog.id, id));

      expect(entry[0].durationMs).toBe(3000);
      expect(entry[0].cardId).toBe("card-123");
      expect(entry[0].emailMessageId).toBe("msg-456");
    });

    it("does NOT sync to calendar when no serviceAccountJson", async () => {
      await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "general",
        summary: "Something happened",
      });

      expect(mocks.createPaCalendarEvent).not.toHaveBeenCalled();
    });

    it("syncs to calendar when serviceAccountJson provided", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "gcal-event-1",
        summary: "[email_read] Read emails",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      const id = await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "email_read",
        summary: "Read emails",
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      expect(mocks.createPaCalendarEvent).toHaveBeenCalledOnce();

      // Verify calendar event params
      const call = mocks.createPaCalendarEvent.mock.calls[0][0];
      expect(call.paEmail).toBe("alice-pa@pa.test.com");
      expect(call.summary).toBe("[email_read] Read emails");
      expect(call.colorId).toBe("7"); // Peacock for email_read

      // Verify sync status updated to "synced"
      const { paActionLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = mocks.getTestDb();
      const entry = await db.select().from(paActionLog).where(eq(paActionLog.id, id));
      expect(entry[0].calendarSyncStatus).toBe("synced");
      expect(entry[0].googleCalendarEventId).toBe("gcal-event-1");
    });

    it("marks sync as 'failed' when calendar API errors", async () => {
      mocks.createPaCalendarEvent.mockRejectedValue(new Error("Calendar API down"));

      const id = await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "card_created",
        summary: "Created a card",
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      // Should still return an ID (local log succeeded)
      expect(id).toBeTruthy();

      const { paActionLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = mocks.getTestDb();
      const entry = await db.select().from(paActionLog).where(eq(paActionLog.id, id));
      expect(entry[0].calendarSyncStatus).toBe("failed");
      expect(entry[0].googleCalendarEventId).toBeNull();
    });

    it("uses correct color for each action type", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "evt",
        summary: "test",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      for (const [actionType, expectedColor] of Object.entries(ACTION_COLORS)) {
        vi.clearAllMocks();
        await logAction({
          paEmail: "alice-pa@pa.test.com",
          actionType,
          summary: `Testing ${actionType}`,
          serviceAccountJson: '{"client_email":"sa@test.com"}',
        });

        const call = mocks.createPaCalendarEvent.mock.calls[0][0];
        expect(call.colorId).toBe(expectedColor);
      }
    });

    it("falls back to 'general' color for unknown action types", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "evt",
        summary: "test",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "unknown_action_type",
        summary: "Unknown action",
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      const call = mocks.createPaCalendarEvent.mock.calls[0][0];
      expect(call.colorId).toBe(ACTION_COLORS.general); // "8" (Graphite)
    });

    it("uses default 5-minute duration when not specified", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "evt",
        summary: "test",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "general",
        summary: "No duration",
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      const call = mocks.createPaCalendarEvent.mock.calls[0][0];
      const startMs = new Date(call.startTime).getTime();
      const endMs = new Date(call.endTime).getTime();
      expect(endMs - startMs).toBe(5 * 60 * 1000);
    });

    it("uses provided duration for calendar event", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "evt",
        summary: "test",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "email_read",
        summary: "Read email",
        durationMs: 30000,
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      const call = mocks.createPaCalendarEvent.mock.calls[0][0];
      const startMs = new Date(call.startTime).getTime();
      const endMs = new Date(call.endTime).getTime();
      expect(endMs - startMs).toBe(30000);
    });

    it("includes card and email refs in calendar description", async () => {
      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "evt",
        summary: "test",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      await logAction({
        paEmail: "alice-pa@pa.test.com",
        actionType: "card_created",
        summary: "Created card",
        cardId: "card-abc",
        emailMessageId: "msg-xyz",
        serviceAccountJson: '{"client_email":"sa@test.com"}',
      });

      const call = mocks.createPaCalendarEvent.mock.calls[0][0];
      expect(call.description).toContain("Card: card-abc");
      expect(call.description).toContain("Email: msg-xyz");
    });
  });

  describe("ACTION_COLORS", () => {
    it("has all expected action types", () => {
      const expectedTypes = [
        "card_created", "email_read", "email_sent",
        "tez_received", "tez_sent", "calendar_checked",
        "briefing_generated", "general",
      ];

      for (const type of expectedTypes) {
        expect(ACTION_COLORS[type]).toBeTruthy();
      }
    });

    it("all color IDs are valid Google Calendar color IDs (1-11)", () => {
      for (const [type, colorId] of Object.entries(ACTION_COLORS)) {
        const num = parseInt(colorId);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(11);
      }
    });
  });
});
