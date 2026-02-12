import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    detectVoiceNumber: vi.fn(),
    readVoiceSms: vi.fn(),
    sendVoiceSms: vi.fn(),
    createPaCalendarEvent: vi.fn(),
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { id: "test-user", email: "user@test.com", name: "User", roles: ["member"] };
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

// Mock Google Voice service
vi.mock("../src/services/googleVoice.js", () => ({
  detectVoiceNumber: mocks.detectVoiceNumber,
  readVoiceSms: mocks.readVoiceSms,
  sendVoiceSms: mocks.sendVoiceSms,
}));

// Mock Google Calendar (used by actionLogger)
vi.mock("../src/services/googleCalendar.js", () => ({
  createPaCalendarEvent: mocks.createPaCalendarEvent,
  deletePaCalendarEvent: vi.fn(),
  listPaCalendarEvents: vi.fn().mockResolvedValue([]),
  listSharedCalendars: vi.fn().mockResolvedValue([]),
  readSharedCalendarEvents: vi.fn().mockResolvedValue([]),
  getTeamAvailability: vi.fn().mockResolvedValue({}),
}));

// Helper: seed workspace config + PA identity
async function seedWorkspaceAndIdentity(db: any, opts?: { voiceNumber?: string }) {
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
    googleVoiceNumber: opts?.voiceNumber || null,
    provisionStatus: "active",
    createdAt: now,
    updatedAt: now,
  });
}

describe("Voice Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
    const { voiceRoutes } = await import("../src/routes/voice.js");
    app = express();
    app.use(express.json());
    app.use("/api/voice", voiceRoutes);
  });

  describe("GET /api/voice/number", () => {
    it("returns stored voice number when available", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db, { voiceNumber: "+15551234567" });

      const res = await request(app)
        .get("/api/voice/number")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data.voiceNumber).toBe("+15551234567");
      expect(res.body.data.source).toBe("stored");
      expect(mocks.detectVoiceNumber).not.toHaveBeenCalled();
    });

    it("detects voice number from Gmail when not stored", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.detectVoiceNumber.mockResolvedValue("+15559876543");

      const res = await request(app)
        .get("/api/voice/number")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data.voiceNumber).toBe("+15559876543");
      expect(res.body.data.source).toBe("detected");
      expect(mocks.detectVoiceNumber).toHaveBeenCalledOnce();

      // Verify it was persisted
      const { paIdentities } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const identity = await db.query.paIdentities.findFirst({
        where: eq(paIdentities.paEmail, "alice-pa@pa.test.com"),
      });
      expect(identity.googleVoiceNumber).toBe("+15559876543");
    });

    it("returns null when no voice number found", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.detectVoiceNumber.mockResolvedValue(null);

      const res = await request(app)
        .get("/api/voice/number")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data.voiceNumber).toBeNull();
      expect(res.body.data.source).toBe("not_found");
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/voice/number");
      expect(res.status).toBe(400);
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .get("/api/voice/number")
        .query({ paEmail: "unknown-pa@pa.test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });

  describe("PATCH /api/voice/number", () => {
    it("manually sets a voice number", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      const res = await request(app)
        .patch("/api/voice/number")
        .send({ paEmail: "alice-pa@pa.test.com", voiceNumber: "+15551112222" });

      expect(res.status).toBe(200);
      expect(res.body.data.voiceNumber).toBe("+15551112222");

      // Verify persisted
      const { paIdentities } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const identity = await db.query.paIdentities.findFirst({
        where: eq(paIdentities.paEmail, "alice-pa@pa.test.com"),
      });
      expect(identity.googleVoiceNumber).toBe("+15551112222");
    });

    it("rejects missing fields", async () => {
      const res = await request(app)
        .patch("/api/voice/number")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown PA", async () => {
      const res = await request(app)
        .patch("/api/voice/number")
        .send({ paEmail: "unknown-pa@pa.test.com", voiceNumber: "+15551112222" });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/voice/sms", () => {
    it("reads SMS messages from Voice", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db, { voiceNumber: "+15551234567" });

      mocks.readVoiceSms.mockResolvedValue([
        {
          gmailMessageId: "msg-sms-1",
          from: "+15559999999",
          body: "Hey, are you available for a call?",
          timestamp: "2026-02-06T10:00:00Z",
          isVoicemail: false,
        },
        {
          gmailMessageId: "msg-vm-1",
          from: "+15558888888",
          body: "Hi, please call me back about the project.",
          timestamp: "2026-02-06T09:00:00Z",
          isVoicemail: true,
        },
      ]);

      const res = await request(app)
        .get("/api/voice/sms")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].from).toBe("+15559999999");
      expect(res.body.data[0].isVoicemail).toBe(false);
      expect(res.body.data[1].isVoicemail).toBe(true);
      expect(res.body.meta.total).toBe(2);
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/voice/sms");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/voice/sms", () => {
    it("sends SMS via Voice", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db, { voiceNumber: "+15551234567" });

      mocks.sendVoiceSms.mockResolvedValue({ messageId: "sms-sent-1" });

      const res = await request(app)
        .post("/api/voice/sms")
        .send({
          paEmail: "alice-pa@pa.test.com",
          toNumber: "+15559999999",
          body: "Your meeting is in 15 minutes.",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.messageId).toBe("sms-sent-1");
      expect(res.body.data.from).toBe("+15551234567");
      expect(res.body.data.to).toBe("+15559999999");
    });

    it("rejects when PA has no voice number", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db); // no voiceNumber

      const res = await request(app)
        .post("/api/voice/sms")
        .send({
          paEmail: "alice-pa@pa.test.com",
          toNumber: "+15559999999",
          body: "Test message",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("NO_VOICE_NUMBER");
    });

    it("rejects missing required fields", async () => {
      const res = await request(app)
        .post("/api/voice/sms")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .post("/api/voice/sms")
        .send({
          paEmail: "unknown-pa@pa.test.com",
          toNumber: "+15559999999",
          body: "Test",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });
});
