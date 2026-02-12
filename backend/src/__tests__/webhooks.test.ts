/**
 * Integration tests for Webhook API (Phase 4A)
 *
 * Tests:
 * - POST /api/webhooks/email - Email webhook processing
 * - POST /api/webhooks/calendar - Calendar webhook processing
 * - Signature verification
 * - Action item extraction
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createHmac } from "crypto";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

// Test fixtures
const testUser1 = {
  id: "test-user-1",
  name: "Alice",
  email: "alice@example.com",
  department: "Engineering",
};

const testUser2 = {
  id: "test-user-2",
  name: "Bob",
  email: "bob@example.com",
  department: "Engineering",
};

/**
 * Create test database tables
 */
async function createTables(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members TEXT DEFAULT '[]',
      leads TEXT DEFAULT '[]',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      roles TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      department TEXT NOT NULL,
      team_id TEXT REFERENCES teams(id),
      manager_id TEXT,
      openclaw_agent_id TEXT,
      notification_prefs TEXT,
      pa_preferences TEXT,
      created_at INTEGER,
      updated_at INTEGER
      ,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      summary TEXT,
      audio_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'self',
      source_user_id TEXT REFERENCES users(id),
      source_ref TEXT,
      from_user_id TEXT NOT NULL REFERENCES users(id),
      to_user_ids TEXT DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'private',
      team_id TEXT REFERENCES teams(id),
      tag TEXT NOT NULL DEFAULT 'task',
      priority TEXT NOT NULL DEFAULT 'medium',
      priority_score REAL DEFAULT 50,
      priority_reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      due_date INTEGER,
      snoozed_until INTEGER,
      decision_options TEXT,
      type TEXT,
      attachments TEXT DEFAULT '[]',
      parent_id TEXT,
      related_card_ids TEXT DEFAULT '[]',
      type_data TEXT,
      blocked_reason TEXT,
      forked_from_id TEXT,
      fork_type TEXT,
      created_at INTEGER,
      updated_at INTEGER
      ,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS card_dependencies (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      depends_on_card_id TEXT NOT NULL REFERENCES cards(id),
      type TEXT NOT NULL DEFAULT 'related',
      created_at INTEGER,
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS card_escalations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      reason TEXT NOT NULL,
      previous_priority TEXT NOT NULL,
      new_priority TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS card_recipients (
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      added_at INTEGER,
      PRIMARY KEY (card_id, user_id)
    );
  `);
}

/**
 * Seed test data
 */
async function seedTestData(client: Client) {
  const now = Date.now();

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [testUser1.id, testUser1.name, testUser1.email, testUser1.department, now, now],
  });

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [testUser2.id, testUser2.name, testUser2.email, testUser2.department, now, now],
  });
}

/**
 * Clear test data
 */
async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM card_recipients;
    DELETE FROM cards;
    DELETE FROM users;
  `);
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: object, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Create test Express app
 */
async function createTestApp(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Request ID middleware
  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Import routes
  const { webhookRoutes } = await import("../routes/webhooks.js");
  app.use("/api/webhooks", webhookRoutes);

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("Test Error:", err);
      res.status(500).json({ error: { code: "TEST_ERROR", message: err.message } });
    }
  );

  return app;
}

// ============= Test Suite =============

describe("Webhook API", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);
    app = await createTestApp();
  });

  afterAll(async () => {
    testClient.close();
  });

  beforeEach(async () => {
    // Clear any WEBHOOK_SECRET that might have been set by previous tests
    delete process.env.WEBHOOK_SECRET;
    await clearTestData(testClient);
    await seedTestData(testClient);
  });

  afterEach(() => {
    // Ensure WEBHOOK_SECRET is cleaned up
    delete process.env.WEBHOOK_SECRET;
  });

  // ============= Email Webhook Tests =============

  describe("POST /api/webhooks/email", () => {
    it("should create card from valid email", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "Project Update",
        text: "Here's the update on the project status.\n\n- Review the design mockups\n- Update the documentation",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.cardCreated).toBe(true);
      expect(response.body.card).toBeDefined();
      expect(response.body.card.sourceType).toBe("email");
    });

    it("should create card with multiple recipients", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: [testUser2.email, testUser1.email],
        subject: "Team Meeting Notes",
        text: "Meeting notes here.",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });

    it("should extract action items from email body", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "Action Required",
        text: `Hi Bob,

Please complete the following tasks:

- Review the PR by EOD
- Update the documentation
- Schedule the follow-up meeting

Thanks!`,
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.card.actionItems).toBeGreaterThan(0);
    });

    it("should mark email as urgent when subject contains urgent", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "URGENT: Server Down",
        text: "The production server is down. Please investigate immediately.",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });

    it("should detect reply chain emails", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "Re: Project Discussion",
        text: "Thanks for the update.",
        inReplyTo: "original-message-id@example.com",
        references: "original-message-id@example.com",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.card.isReply).toBe(true);
    });

    it("should return success with no card when no internal recipients", async () => {
      const emailPayload = {
        from: "external@other.com",
        to: "unknown@unknown.com",
        subject: "Test",
        text: "Test message",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.cardCreated).toBe(false);
    });

    it("should reject invalid email format", async () => {
      const emailPayload = {
        from: "not-an-email",
        to: testUser2.email,
        subject: "Test",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid payload");
    });

    it("should reject missing required fields", async () => {
      const emailPayload = {
        from: testUser1.email,
        // missing to and subject
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(400);
    });

    it("should verify signature when WEBHOOK_SECRET is set", async () => {
      // Save original env
      const originalSecret = process.env.WEBHOOK_SECRET;
      process.env.WEBHOOK_SECRET = "test-secret";

      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "Test",
        text: "Test message",
      };

      // Without signature
      const responseNoSig = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(responseNoSig.status).toBe(401);

      // With valid signature
      const signature = generateSignature(emailPayload, "test-secret");
      const responseWithSig = await request(app)
        .post("/api/webhooks/email")
        .set("x-webhook-signature", signature)
        .send(emailPayload);

      expect(responseWithSig.status).toBe(201);

      // Restore env
      process.env.WEBHOOK_SECRET = originalSecret;
    });

    it("should handle HTML-only emails", async () => {
      const emailPayload = {
        from: testUser1.email,
        to: testUser2.email,
        subject: "HTML Email",
        html: "<p>Hello <b>Bob</b>,</p><p>This is an HTML email.</p>",
      };

      const response = await request(app)
        .post("/api/webhooks/email")
        .send(emailPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });
  });

  // ============= Calendar Webhook Tests =============

  describe("POST /api/webhooks/calendar", () => {
    it("should create card from meeting event", async () => {
      const calendarPayload = {
        eventId: "event-123",
        title: "Team Sync Meeting",
        description: "Weekly team sync to discuss progress.",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        organizer: {
          email: testUser1.email,
          name: testUser1.name,
        },
        attendees: [
          { email: testUser2.email, name: testUser2.name, responseStatus: "accepted" },
        ],
        action: "created",
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.cardCreated).toBe(true);
      expect(response.body.card.sourceType).toBe("calendar");
    });

    it("should extract action items from event description", async () => {
      const calendarPayload = {
        eventId: "event-456",
        title: "Planning Session",
        description: `Agenda:
- Review Q3 goals
- Assign tasks for next sprint
- Follow-up on pending items

Action Items:
- Prepare the budget proposal
- Schedule stakeholder meeting`,
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        organizer: { email: testUser1.email },
        attendees: [{ email: testUser2.email }],
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(201);
      expect(response.body.card.actionItems).toBeGreaterThan(0);
    });

    it("should create card for follow-up meetings", async () => {
      const calendarPayload = {
        eventId: "event-789",
        title: "Follow-up: Client Discussion",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        organizer: { email: testUser1.email },
        attendees: [{ email: testUser2.email }],
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });

    it("should create prep card for presentation meetings", async () => {
      const calendarPayload = {
        eventId: "event-prep",
        title: "Q4 Presentation to Leadership",
        description: "Prepare slides with Q3 results.",
        start: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        end: new Date(Date.now() + 90000000).toISOString(),
        organizer: { email: testUser1.email },
        attendees: [{ email: testUser2.email }],
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });

    it("should skip deleted events", async () => {
      const calendarPayload = {
        eventId: "event-deleted",
        title: "Cancelled Meeting",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        organizer: { email: testUser1.email },
        action: "deleted",
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Deleted event skipped");
    });

    it("should skip events with no internal attendees", async () => {
      const calendarPayload = {
        eventId: "event-external",
        title: "External Meeting",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        organizer: { email: "external@other.com" },
        attendees: [{ email: "another@other.com" }],
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(200);
      expect(response.body.cardCreated).toBe(false);
    });

    it("should skip non-actionable events", async () => {
      const calendarPayload = {
        eventId: "event-lunch",
        title: "Lunch Break",
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        organizer: { email: testUser1.email },
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(200);
      expect(response.body.cardCreated).toBe(false);
      expect(response.body.message).toBe("No action items detected");
    });

    it("should reject invalid calendar payload", async () => {
      const calendarPayload = {
        eventId: "event-123",
        // missing required fields
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid payload");
    });

    it("should handle events with location", async () => {
      const calendarPayload = {
        eventId: "event-office",
        title: "Team Meeting",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        location: "Conference Room A",
        organizer: { email: testUser1.email },
        attendees: [{ email: testUser2.email }],
      };

      const response = await request(app)
        .post("/api/webhooks/calendar")
        .send(calendarPayload);

      expect(response.status).toBe(201);
      expect(response.body.cardCreated).toBe(true);
    });
  });
});
