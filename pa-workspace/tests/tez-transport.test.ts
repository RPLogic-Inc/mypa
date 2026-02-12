import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    sendFromPa: vi.fn(),
    exportTezBundle: vi.fn(),
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

// Mock Gmail API
vi.mock("../src/services/googleGmail.js", () => ({
  sendFromPa: mocks.sendFromPa,
  readPaInbox: vi.fn().mockResolvedValue([]),
  markAsRead: vi.fn(),
  getMessage: vi.fn(),
  addLabels: vi.fn(),
  getAttachment: vi.fn(),
}));

// Mock app client
vi.mock("../src/services/appClient.js", () => ({
  exportTezBundle: mocks.exportTezBundle,
  importTezBundle: vi.fn().mockResolvedValue(null),
  createCardFromEmail: vi.fn().mockResolvedValue(null),
  getTeamMembers: vi.fn().mockResolvedValue([]),
}));

// Mock Google Calendar (used by actionLogger)
vi.mock("../src/services/googleCalendar.js", () => ({
  createPaCalendarEvent: mocks.createPaCalendarEvent,
  deletePaCalendarEvent: vi.fn(),
  listPaCalendarEvents: vi.fn().mockResolvedValue([]),
  readSharedCalendarEvents: vi.fn().mockResolvedValue([]),
  getTeamAvailability: vi.fn().mockResolvedValue({}),
}));

// Helper: seed workspace config + PA identity
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

describe("Tez Transport Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
    const { tezTransportRoutes } = await import("../src/routes/tez-transport.js");
    app = express();
    app.use(express.json());
    app.use("/api/tez-transport", tezTransportRoutes);
  });

  describe("POST /api/tez-transport/send", () => {
    it("sends a Tez bundle via email", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockResolvedValue({ messageId: "tez-msg-1" });

      const bundle = {
        tezit_version: "1.2",
        id: "tez-123",
        title: "Test Tez",
        type: "knowledge",
        author: "Alice",
        created: "2026-02-06T10:00:00Z",
        content: "This is the tez content.",
      };

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob-pa@pa.other.com",
          bundle,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.messageId).toBe("tez-msg-1");
      expect(res.body.data.tezId).toBe("tez-123");
      expect(res.body.data.from).toBe("alice-pa@pa.test.com");
      expect(res.body.data.to).toBe("bob-pa@pa.other.com");

      // Verify sendFromPa was called with correct params
      expect(mocks.sendFromPa).toHaveBeenCalledOnce();
      const sendCall = mocks.sendFromPa.mock.calls[0][0];
      expect(sendCall.paEmail).toBe("alice-pa@pa.test.com");
      expect(sendCall.to).toBe("bob-pa@pa.other.com");
      expect(sendCall.subject).toBe("Tez: Test Tez");
      expect(sendCall.headers["X-Tezit-Protocol"]).toBe("1.2");
      expect(sendCall.attachments).toHaveLength(1);
      expect(sendCall.attachments[0].filename).toBe("tez-123.tez.json");
    });

    it("sends a Tez by fetching from app backend via tezId", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      const exportedBundle = {
        tezit_version: "1.2",
        id: "tez-456",
        title: "Exported Tez",
        type: "message",
        content: "Exported content.",
      };

      mocks.exportTezBundle.mockResolvedValue(exportedBundle);
      mocks.sendFromPa.mockResolvedValue({ messageId: "tez-msg-2" });

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          tezId: "tez-456",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.messageId).toBe("tez-msg-2");
      expect(res.body.data.tezId).toBe("tez-456");
      expect(mocks.exportTezBundle).toHaveBeenCalledWith("tez-456");
      expect(mocks.sendFromPa).toHaveBeenCalledOnce();
    });

    it("returns 404 when tezId not found in app backend", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.exportTezBundle.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          tezId: "nonexistent-tez",
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("TEZ_NOT_FOUND");
    });

    it("uses custom subject when provided", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockResolvedValue({ messageId: "tez-msg-3" });

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          bundle: {
            tezit_version: "1.2",
            title: "My Tez",
            content: "Some content",
          },
          subject: "Custom Subject Line",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.subject).toBe("Custom Subject Line");

      const sendCall = mocks.sendFromPa.mock.calls[0][0];
      expect(sendCall.subject).toBe("Custom Subject Line");
    });

    it("logs sent Tez in email_log", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockResolvedValue({ messageId: "tez-msg-4" });

      await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          bundle: {
            tezit_version: "1.2",
            id: "tez-789",
            title: "Logged Tez",
          },
        });

      const { emailLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const logs = await db.select().from(emailLog).where(eq(emailLog.paEmail, "alice-pa@pa.test.com"));
      expect(logs).toHaveLength(1);
      expect(logs[0].direction).toBe("outbound");
      expect(logs[0].isTezit).toBe(true);
      expect(logs[0].processedAs).toBe("tez_sent");
      expect(logs[0].gmailMessageId).toBe("tez-msg-4");
    });

    it("rejects missing fromPaEmail or toEmail", async () => {
      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({ toEmail: "bob@test.com", bundle: { tezit_version: "1.2" } });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");

      const res2 = await request(app)
        .post("/api/tez-transport/send")
        .send({ fromPaEmail: "alice-pa@pa.test.com", bundle: { tezit_version: "1.2" } });

      expect(res2.status).toBe(400);
    });

    it("rejects when neither tezId nor bundle provided", async () => {
      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects bundle without tezit_version", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          bundle: { title: "No version" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_BUNDLE");
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "unknown-pa@pa.test.com",
          toEmail: "bob@test.com",
          bundle: { tezit_version: "1.2", title: "Test" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });

    it("returns 500 when Gmail send fails", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockRejectedValue(new Error("Gmail API unavailable"));

      const res = await request(app)
        .post("/api/tez-transport/send")
        .send({
          fromPaEmail: "alice-pa@pa.test.com",
          toEmail: "bob@test.com",
          bundle: { tezit_version: "1.2", title: "Fail Test" },
        });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("TEZ_SEND_FAILED");
    });
  });

  describe("GET /api/tez-transport/log", () => {
    it("returns only Tez email log entries", async () => {
      const db = mocks.getTestDb();
      const { emailLog } = await import("../src/db/schema.js");
      const { randomUUID } = await import("crypto");

      // Insert a tez email and a normal email
      await db.insert(emailLog).values({
        id: randomUUID(),
        paEmail: "alice-pa@pa.test.com",
        direction: "outbound",
        fromAddress: "alice-pa@pa.test.com",
        toAddress: "bob@test.com",
        subject: "Tez: Knowledge Bundle",
        isTezit: true,
        processedAs: "tez_sent",
        processedAt: new Date(),
      });

      await db.insert(emailLog).values({
        id: randomUUID(),
        paEmail: "alice-pa@pa.test.com",
        direction: "outbound",
        fromAddress: "alice-pa@pa.test.com",
        toAddress: "bob@test.com",
        subject: "Regular email",
        isTezit: false,
        processedAs: "sent",
        processedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/tez-transport/log")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].subject).toBe("Tez: Knowledge Bundle");
      expect(res.body.meta.total).toBe(1);
    });

    it("returns empty array when no Tez emails", async () => {
      const res = await request(app)
        .get("/api/tez-transport/log")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/tez-transport/log");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });
});
