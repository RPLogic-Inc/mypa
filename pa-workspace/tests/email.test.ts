import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    readPaInbox: vi.fn(),
    sendFromPa: vi.fn(),
    markAsRead: vi.fn(),
    createCardFromEmail: vi.fn(),
    importTezBundle: vi.fn(),
    createPaCalendarEvent: vi.fn(),
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

// Mock Gmail API
vi.mock("../src/services/googleGmail.js", () => ({
  readPaInbox: mocks.readPaInbox,
  sendFromPa: mocks.sendFromPa,
  markAsRead: mocks.markAsRead,
  getMessage: vi.fn(),
  addLabels: vi.fn(),
  getAttachment: vi.fn(),
}));

// Mock app client
vi.mock("../src/services/appClient.js", () => ({
  createCardFromEmail: mocks.createCardFromEmail,
  importTezBundle: mocks.importTezBundle,
  getTeamMembers: vi.fn().mockResolvedValue([]),
  exportTezBundle: vi.fn().mockResolvedValue(null),
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

describe("Email Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
    const { emailRoutes } = await import("../src/routes/email.js");
    app = express();
    app.use(express.json());
    app.use("/api/email", emailRoutes);
  });

  describe("GET /api/email/inbox", () => {
    it("reads PA inbox", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-1",
          threadId: "thread-1",
          subject: "Hello from Bob",
          from: "bob@test.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T10:00:00Z",
          snippet: "Hey Alice...",
          body: "Hey Alice, how are you?",
          headers: { Subject: "Hello from Bob", From: "bob@test.com" },
          labelIds: ["INBOX", "UNREAD"],
          attachments: [],
        },
      ]);

      const res = await request(app)
        .get("/api/email/inbox")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].subject).toBe("Hello from Bob");
      expect(res.body.data[0].isTezit).toBe(false);
      expect(res.body.data[0].hasAttachments).toBe(false);
    });

    it("detects Tezit content in inbox messages", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-2",
          threadId: "thread-2",
          subject: "Tez Bundle",
          from: "other-pa@pa.other.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T11:00:00Z",
          snippet: "Tez bundle attached",
          body: "See attached tez",
          headers: { "X-Tezit-Protocol": "1.2" },
          labelIds: ["INBOX", "UNREAD"],
          attachments: [{ filename: "data.tez.json", mimeType: "application/json", size: 1024, attachmentId: "att-1" }],
        },
      ]);

      const res = await request(app)
        .get("/api/email/inbox")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].isTezit).toBe(true);
      expect(res.body.data[0].hasAttachments).toBe(true);
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/email/inbox");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .get("/api/email/inbox")
        .query({ paEmail: "unknown-pa@pa.test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });

  describe("POST /api/email/send", () => {
    it("sends email from PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockResolvedValue({ messageId: "sent-msg-1" });

      const res = await request(app)
        .post("/api/email/send")
        .send({
          paEmail: "alice-pa@pa.test.com",
          to: "bob@test.com",
          subject: "Meeting notes",
          body: "Here are the meeting notes...",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.messageId).toBe("sent-msg-1");
      expect(res.body.data.to).toBe("bob@test.com");
      expect(mocks.sendFromPa).toHaveBeenCalledOnce();
    });

    it("logs sent email in email_log", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.sendFromPa.mockResolvedValue({ messageId: "sent-msg-2" });

      await request(app)
        .post("/api/email/send")
        .send({
          paEmail: "alice-pa@pa.test.com",
          to: "bob@test.com",
          subject: "Test",
          body: "Body",
        });

      // Check email_log
      const { emailLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const logs = await db.select().from(emailLog).where(eq(emailLog.paEmail, "alice-pa@pa.test.com"));
      expect(logs).toHaveLength(1);
      expect(logs[0].direction).toBe("outbound");
      expect(logs[0].gmailMessageId).toBe("sent-msg-2");
    });

    it("rejects missing required fields", async () => {
      const res = await request(app)
        .post("/api/email/send")
        .send({ paEmail: "alice-pa@pa.test.com", to: "bob@test.com" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects when workspace not configured", async () => {
      const res = await request(app)
        .post("/api/email/send")
        .send({
          paEmail: "unknown-pa@pa.test.com",
          to: "bob@test.com",
          subject: "Test",
          body: "Body",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });

  describe("POST /api/email/process", () => {
    it("processes unread emails into cards", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-3",
          threadId: "thread-3",
          subject: "Action needed",
          from: "boss@test.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T12:00:00Z",
          snippet: "Please review...",
          body: "Please review the attached document.",
          headers: { Subject: "Action needed", From: "boss@test.com" },
          labelIds: ["INBOX", "UNREAD"],
          attachments: [],
        },
      ]);

      mocks.createCardFromEmail.mockResolvedValue({ id: "card-1" });
      mocks.markAsRead.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/email/process")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].processedAs).toBe("card");
      expect(res.body.data[0].cardId).toBe("card-1");
      expect(res.body.meta.cards).toBe(1);
      expect(mocks.markAsRead).toHaveBeenCalledOnce();
    });

    it("detects and imports Tez emails", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-4",
          threadId: "thread-4",
          subject: "Tez from other team",
          from: "other-pa@pa.other.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T13:00:00Z",
          snippet: "Tez bundle",
          body: "tezit_version: 1.2\n---\nContent here",
          headers: { "X-Tezit-Protocol": "1.2" },
          labelIds: ["INBOX", "UNREAD"],
          attachments: [],
        },
      ]);

      mocks.importTezBundle.mockResolvedValue({ id: "tez-1" });
      mocks.markAsRead.mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/email/process")
        .send({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].processedAs).toBe("tez_import");
      expect(res.body.meta.tezImports).toBe(1);
      expect(mocks.importTezBundle).toHaveBeenCalledOnce();
    });

    it("logs processed emails in email_log", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-5",
          threadId: "thread-5",
          subject: "Quick note",
          from: "coworker@test.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T14:00:00Z",
          snippet: "FYI...",
          body: "FYI the meeting is at 3pm.",
          headers: {},
          labelIds: ["INBOX", "UNREAD"],
          attachments: [],
        },
      ]);

      mocks.createCardFromEmail.mockResolvedValue({ id: "card-2" });
      mocks.markAsRead.mockResolvedValue(undefined);

      await request(app)
        .post("/api/email/process")
        .send({ paEmail: "alice-pa@pa.test.com" });

      const { emailLog } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const logs = await db.select().from(emailLog).where(eq(emailLog.paEmail, "alice-pa@pa.test.com"));
      expect(logs).toHaveLength(1);
      expect(logs[0].direction).toBe("inbound");
      expect(logs[0].processedAs).toBe("card");
      expect(logs[0].cardId).toBe("card-2");
    });

    it("continues processing if markAsRead fails", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);

      mocks.readPaInbox.mockResolvedValue([
        {
          id: "msg-6",
          threadId: "thread-6",
          subject: "Important",
          from: "client@test.com",
          to: "alice-pa@pa.test.com",
          date: "2026-02-06T15:00:00Z",
          snippet: "Urgent...",
          body: "Urgent request.",
          headers: {},
          labelIds: ["INBOX", "UNREAD"],
          attachments: [],
        },
      ]);

      mocks.createCardFromEmail.mockResolvedValue({ id: "card-3" });
      mocks.markAsRead.mockRejectedValue(new Error("Gmail API error"));

      const res = await request(app)
        .post("/api/email/process")
        .send({ paEmail: "alice-pa@pa.test.com" });

      // Should still succeed overall
      expect(res.status).toBe(200);
      expect(res.body.data[0].processedAs).toBe("card");
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app)
        .post("/api/email/process")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/email/log", () => {
    it("returns email log entries", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceAndIdentity(db);
      const { emailLog } = await import("../src/db/schema.js");
      const { randomUUID } = await import("crypto");

      await db.insert(emailLog).values({
        id: randomUUID(),
        paEmail: "alice-pa@pa.test.com",
        direction: "inbound",
        fromAddress: "bob@test.com",
        toAddress: "alice-pa@pa.test.com",
        subject: "Test email",
        processedAs: "card",
        processedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/email/log")
        .query({ paEmail: "alice-pa@pa.test.com" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].direction).toBe("inbound");
    });

    it("rejects missing paEmail", async () => {
      const res = await request(app).get("/api/email/log");
      expect(res.status).toBe(400);
    });
  });
});
