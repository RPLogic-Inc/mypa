import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    createPaCalendarEvent: vi.fn(),
    listSharedCalendars: vi.fn(),
    readSharedCalendarEvents: vi.fn(),
    getTeamAvailability: vi.fn(),
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { id: "user-1", email: "user@test.com", name: "User", roles: ["member"] };
    next();
  },
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

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

vi.mock("../src/middleware/index.js", async () => {
  const auth = await import("../src/middleware/auth.js");
  return {
    authenticate: auth.authenticate,
    requireRole: auth.requireRole,
    requestLogger: (_req: any, _res: any, next: any) => next(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("../src/middleware/logging.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

// Mock Google Calendar API
vi.mock("../src/services/googleCalendar.js", () => ({
  createPaCalendarEvent: mocks.createPaCalendarEvent,
  deletePaCalendarEvent: vi.fn(),
  listPaCalendarEvents: vi.fn().mockResolvedValue([]),
  listSharedCalendars: mocks.listSharedCalendars,
  readSharedCalendarEvents: mocks.readSharedCalendarEvents,
  getTeamAvailability: mocks.getTeamAvailability,
}));

// Helper: seed workspace config + PA identity so calendar sync can find credentials
async function seedWorkspaceAndIdentity(db: any) {
  const { workspaceConfig, paIdentities } = await import("../src/db/schema.js");
  const now = new Date();
  await db.insert(workspaceConfig).values({
    teamId: "team-1",
    appApiUrl: "http://localhost:3001",
    googleDomain: "pa.test.com",
    googleServiceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
    googleAdminEmail: "admin@test.com",
    setupStatus: "ready",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(paIdentities).values({
    userId: "user-1",
    teamId: "team-1",
    paEmail: "alice-pa@pa.test.com",
    displayName: "Alice's PA",
    clientEmail: "alice@test.com",
    clientName: "Alice",
    googleUserId: "google-123",
    provisionStatus: "active",
    createdAt: now,
    updatedAt: now,
  });
}

describe("Calendar Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
    const { calendarRoutes } = await import("../src/routes/calendar.js");
    app = express();
    app.use(express.json());
    app.use("/api/calendar", calendarRoutes);
  });

  describe("POST /api/calendar/log-action", () => {
    it("logs a PA action", async () => {
      const res = await request(app)
        .post("/api/calendar/log-action")
        .send({
          paEmail: "alice-pa@pa.test.com",
          actionType: "email_read",
          summary: "Read 3 forwarded emails",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.paEmail).toBe("alice-pa@pa.test.com");
      expect(res.body.data.actionType).toBe("email_read");
      expect(res.body.data.id).toBeTruthy();
    });

    it("rejects missing required fields", async () => {
      const res = await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(400);
    });

    it("syncs to Google Calendar when workspace is configured", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.createPaCalendarEvent.mockResolvedValue({
        eventId: "gcal-event-123",
        summary: "[email_read] Read emails",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      });

      const res = await request(app)
        .post("/api/calendar/log-action")
        .send({
          paEmail: "alice-pa@pa.test.com",
          actionType: "email_read",
          summary: "Read emails",
        });

      expect(res.status).toBe(201);
      expect(mocks.createPaCalendarEvent).toHaveBeenCalledOnce();

      // Verify the calendar event was created with correct params
      const calendarCall = mocks.createPaCalendarEvent.mock.calls[0][0];
      expect(calendarCall.paEmail).toBe("alice-pa@pa.test.com");
      expect(calendarCall.summary).toContain("[email_read]");
      expect(calendarCall.colorId).toBe("7"); // Peacock for email_read
    });

    it("still logs locally when calendar sync fails", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.createPaCalendarEvent.mockRejectedValue(new Error("Calendar API down"));

      const res = await request(app)
        .post("/api/calendar/log-action")
        .send({
          paEmail: "alice-pa@pa.test.com",
          actionType: "card_created",
          summary: "Created a card",
        });

      // Should still succeed — local log is the source of truth
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
    });

    it("skips calendar sync when workspace not configured", async () => {
      const res = await request(app)
        .post("/api/calendar/log-action")
        .send({
          paEmail: "unknown-pa@pa.test.com",
          actionType: "general",
          summary: "Did something",
        });

      expect(res.status).toBe(201);
      expect(mocks.createPaCalendarEvent).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/calendar/timesheet", () => {
    it("returns action log entries for a PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read emails" });

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "card_created", summary: "Created card" });

      const res = await request(app)
        .get("/api/calendar/timesheet")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it("filters by date range", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read emails" });

      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .get("/api/calendar/timesheet")
        .query({ paEmail: "alice-pa@pa.test.com", from: futureDate });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("requires paEmail parameter", async () => {
      const res = await request(app).get("/api/calendar/timesheet");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/calendar/timesheet/summary", () => {
    it("returns aggregated stats by action type", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read emails", durationMs: 5000 });

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read more emails", durationMs: 3000 });

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "card_created", summary: "Created card" });

      const res = await request(app)
        .get("/api/calendar/timesheet/summary")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data.email_read.count).toBe(2);
      expect(res.body.data.email_read.totalDurationMs).toBe(8000);
      expect(res.body.data.card_created.count).toBe(1);
      expect(res.body.meta.totalActions).toBe(3);
    });
  });

  describe("POST /api/calendar/timesheet/export", () => {
    it("exports as CSV by default", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read emails", durationMs: 5000 });

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "card_created", summary: "Created card" });

      const res = await request(app)
        .post("/api/calendar/timesheet/export")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("timesheet-alice-pa@pa.test.com.csv");

      const lines = res.text.split("\n");
      expect(lines[0]).toBe("timestamp,actionType,summary,durationMs,cardId,emailMessageId,calendarSyncStatus");
      expect(lines.length).toBe(3); // header + 2 entries
    });

    it("exports as ICS when format=ics", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      await request(app)
        .post("/api/calendar/log-action")
        .send({ paEmail: "alice-pa@pa.test.com", actionType: "email_read", summary: "Read emails", durationMs: 5000 });

      const res = await request(app)
        .post("/api/calendar/timesheet/export")
        .send({ paEmail: "alice-pa@pa.test.com", format: "ics" });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/calendar");
      expect(res.text).toContain("BEGIN:VCALENDAR");
      expect(res.text).toContain("BEGIN:VEVENT");
      expect(res.text).toContain("[email_read] Read emails");
      expect(res.text).toContain("END:VCALENDAR");
    });

    it("returns 404 when no data found", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      const res = await request(app)
        .post("/api/calendar/timesheet/export")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NO_DATA");
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app)
        .post("/api/calendar/timesheet/export")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/calendar/shared-calendars", () => {
    it("lists calendars shared with PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.listSharedCalendars.mockResolvedValue([
        { calendarId: "alice@company.com", summary: "Alice's Calendar", accessRole: "reader" },
        { calendarId: "team@company.com", summary: "Team Calendar", accessRole: "reader" },
      ]);

      const res = await request(app)
        .get("/api/calendar/shared-calendars")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].summary).toBe("Alice's Calendar");
      expect(res.body.meta.total).toBe(2);
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/calendar/shared-calendars");
      expect(res.status).toBe(400);
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .get("/api/calendar/shared-calendars")
        .query({ paEmail: "unknown-pa@pa.test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });

  describe("GET /api/calendar/shared-events", () => {
    it("returns events from shared calendars", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readSharedCalendarEvents.mockResolvedValue([
        {
          eventId: "event-1",
          summary: "Team Standup",
          start: "2026-02-07T09:00:00Z",
          end: "2026-02-07T09:30:00Z",
          description: "[Alice's Calendar]",
        },
        {
          eventId: "event-2",
          summary: "1:1 with Bob",
          start: "2026-02-07T14:00:00Z",
          end: "2026-02-07T14:30:00Z",
          description: "[Alice's Calendar]",
        },
      ]);

      const res = await request(app)
        .get("/api/calendar/shared-events")
        .query({ paEmail: "alice-pa@pa.test.com", from: "2026-02-07", to: "2026-02-08" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].summary).toBe("Team Standup");
      expect(res.body.meta.total).toBe(2);
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .get("/api/calendar/shared-events")
        .query({ paEmail: "unknown-pa@pa.test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });

  describe("GET /api/calendar/team-availability", () => {
    it("returns availability data for team PAs", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.getTeamAvailability.mockResolvedValue({
        "alice-pa@pa.test.com": [
          { start: "2026-02-07T09:00:00Z", end: "2026-02-07T10:00:00Z" },
          { start: "2026-02-07T14:00:00Z", end: "2026-02-07T15:00:00Z" },
        ],
      });

      const res = await request(app)
        .get("/api/calendar/team-availability")
        .query({ teamId: "team-1", from: "2026-02-07", to: "2026-02-08" });

      expect(res.status).toBe(200);
      expect(res.body.data["alice-pa@pa.test.com"]).toHaveLength(2);
      expect(res.body.meta.teamId).toBe("team-1");
      expect(res.body.meta.paCount).toBe(1);
      expect(res.body.meta.busyPaCount).toBe(1);
    });

    it("rejects missing required params", async () => {
      const res = await request(app)
        .get("/api/calendar/team-availability")
        .query({ teamId: "team-1" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .get("/api/calendar/team-availability")
        .query({ teamId: "nonexistent-team", from: "2026-02-07", to: "2026-02-08" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });
});
