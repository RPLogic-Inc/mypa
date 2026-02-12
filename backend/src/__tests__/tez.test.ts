/**
 * Integration tests for Tez Protocol Routes (Wave 3)
 *
 * Tests:
 * - POST /api/tez/:cardId/interrogate - Interrogate card context
 * - POST /api/tez/:cardId/interrogate - Follow-up in same session
 * - POST /api/tez/:cardId/interrogate - Card not found (404)
 * - POST /api/tez/:cardId/interrogate - No auth (401)
 * - POST /api/tez/:cardId/interrogate - Abstention when context insufficient
 * - GET /api/tez/:cardId/interrogate/history - Session Q&A history
 * - GET /api/tez/:cardId/citations - Verified citations
 * - GET /api/tez/:cardId/export - Export as Inline Tez markdown
 * - POST /api/tez/import - Import Inline Tez
 * - POST /api/tez/import - Malformed markdown (400)
 * - Citation verification: verified citation passes
 * - Citation verification: non-existent context item fails
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { clearRateLimitStore } from "../middleware/rateLimit.js";
import { generateTokens } from "../services/jwt.js";

// These are pure functions that don't use db, safe to import directly
import { verifyCitations, parseCitations } from "../services/tezInterrogation.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

// Test fixtures
const testUser = {
  id: "tez-test-user-1",
  name: "Tez Test User",
  email: "teztest@example.com",
  department: "Engineering",
  roles: ["engineer"],
  skills: ["typescript"],
};

const testUser2 = {
  id: "tez-test-user-2",
  name: "Tez Test User 2",
  email: "teztest2@example.com",
  department: "Engineering",
  roles: ["engineer"],
  skills: ["typescript"],
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

    CREATE TABLE IF NOT EXISTS card_context (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      original_type TEXT NOT NULL,
      original_raw_text TEXT NOT NULL,
      original_audio_url TEXT,
      original_audio_duration INTEGER,
      assistant_data TEXT,
      captured_at INTEGER NOT NULL,
      device_info TEXT,
      display_bullets TEXT,
      display_generated_at INTEGER,
      display_model_used TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      audio_url TEXT,
      attachments TEXT DEFAULT '[]',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS card_recipients (
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      added_at INTEGER,
      PRIMARY KEY (card_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT NOT NULL REFERENCES users(id),
      skill TEXT NOT NULL,
      PRIMARY KEY (user_id, skill)
    );

    CREATE TABLE IF NOT EXISTS user_teams (
      user_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER,
      PRIMARY KEY (user_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS tez_interrogations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      classification TEXT NOT NULL,
      confidence TEXT NOT NULL,
      context_scope TEXT NOT NULL DEFAULT 'full',
      context_token_count INTEGER,
      model_used TEXT,
      response_time_ms INTEGER,
      guest_token_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tez_citations (
      id TEXT PRIMARY KEY,
      interrogation_id TEXT NOT NULL REFERENCES tez_interrogations(id),
      context_item_id TEXT NOT NULL,
      location TEXT,
      excerpt TEXT NOT NULL,
      claim TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      verification_details TEXT,
      confidence TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tez_share_tokens (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      context_scope TEXT NOT NULL DEFAULT 'surface',
      context_item_ids TEXT DEFAULT '[]',
      max_interrogations INTEGER,
      interrogation_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER
    );
  `);
}

/**
 * Insert test users
 */
async function seedTestUsers(client: Client) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser.id, testUser.name, testUser.email, testUser.department, JSON.stringify(testUser.roles), JSON.stringify(testUser.skills), now, now],
  });
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser2.id, testUser2.name, testUser2.email, testUser2.department, JSON.stringify(testUser2.roles), JSON.stringify(testUser2.skills), now, now],
  });
}

/**
 * Clear test data
 */
async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM tez_citations;
    DELETE FROM tez_interrogations;
    DELETE FROM card_recipients;
    DELETE FROM responses;
    DELETE FROM card_context;
    DELETE FROM cards;
  `);
}

async function insertTestCard(client: Client, card: { id: string; content: string; fromUserId: string; recipientIds?: string[]; summary?: string }) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO cards (id, content, summary, from_user_id, to_user_ids, priority, status, visibility, tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [card.id, card.content, card.summary || null, card.fromUserId, JSON.stringify(card.recipientIds || []), "medium", "pending", "private", "task", now, now],
  });
  const recipients = card.recipientIds || [card.fromUserId];
  for (const userId of recipients) {
    await client.execute({ sql: `INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)`, args: [card.id, userId, now] });
  }
}

async function insertTestContext(client: Client, ctx: { id: string; cardId: string; userId: string; userName: string; type: string; rawText: string }) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO card_context (id, card_id, user_id, user_name, original_type, original_raw_text, captured_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [ctx.id, ctx.cardId, ctx.userId, ctx.userName, ctx.type, ctx.rawText, now, now],
  });
}

/**
 * Create test Express app.
 * We mock db/index.js then dynamically import routes so all downstream modules use the test db.
 */
async function createTestApp() {
  // Mock the db module BEFORE importing any routes or services that use it
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    // Raw client access is used by FTS hooks in routes.
    getClient: () => testClient,
  }));

  // Force re-import of services that depend on db (invalidate module cache)
  vi.resetModules();

  // Re-mock after reset
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    // Raw client access is used by FTS hooks in routes.
    getClient: () => testClient,
  }));

  // Now import the routes (they will import services which import db - all get the mock)
  const tezRoutes = (await import("../routes/tez.js")).default;

  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());

  // Request ID middleware
  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  testApp.use("/api/tez", tezRoutes);

  testApp.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Test Error:", err);
    res.status(500).json({ error: { code: "TEST_ERROR", message: err.message } });
  });

  return testApp;
}

// JWT token cache for test users
const tokenCache = new Map<string, string>();

function authHeaders(userId: string) {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token cached for userId "${userId}". Call generateTestToken() first.`);
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

// ============= Test Setup =============

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  testDb = drizzle(testClient, { schema });
  await createTables(testClient);
  await seedTestUsers(testClient);

  // Generate JWT tokens for test users
  const { accessToken: token1 } = await generateTokens({ id: testUser.id, email: testUser.email, name: testUser.name });
  tokenCache.set(testUser.id, token1);
  const { accessToken: token2 } = await generateTokens({ id: testUser2.id, email: testUser2.email, name: testUser2.name });
  tokenCache.set(testUser2.id, token2);

  app = await createTestApp();
});

afterAll(async () => {
  if (testClient) testClient.close();
});

beforeEach(async () => {
  await clearTestData(testClient);
  clearRateLimitStore();
  // Also clear the rate limit store from the current module graph
  // (vi.resetModules in createTestApp may create a new module instance)
  const rl = await import("../middleware/rateLimit.js");
  rl.clearRateLimitStore();
});

// ============= Tests =============

describe("Tez Protocol API", () => {
  describe("POST /api/tez/:cardId/interrogate", () => {
    it("should interrogate a card and return answer with classification and citations", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "The project deadline is March 15th and the budget is $50,000", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "The project deadline is March 15th. The total budget allocated is $50,000. The team consists of 5 engineers." });

      const response = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is the project deadline?" });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.answer).toBeDefined();
      expect(response.body.data.answer.length).toBeGreaterThan(0);
      expect(["grounded", "inferred", "partial", "abstention"]).toContain(response.body.data.classification);
      expect(["high", "medium", "low"]).toContain(response.body.data.confidence);
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should support follow-up questions in the same session", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "Engineering team update", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "The API redesign is progressing well. Performance improvements show a 40% reduction in response time. The database migration is scheduled for next week." });

      const response1 = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is the performance improvement?" });
      expect(response1.status).toBe(200);
      const sessionId = response1.body.data.sessionId;
      expect(sessionId).toBeDefined();

      const response2 = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "When is the database migration?", sessionId });
      expect(response2.status).toBe(200);
      expect(response2.body.data.sessionId).toBe(sessionId);
      expect(response2.body.data.answer).toBeDefined();
    });

    it("should return 404 for non-existent card", async () => {
      const response = await request(app).post(`/api/tez/${randomUUID()}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is this about?" });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("CARD_NOT_FOUND");
    });

    it("should return 401 when no auth is provided", async () => {
      const response = await request(app).post(`/api/tez/${randomUUID()}/interrogate`).send({ question: "What is this about?" });
      expect(response.status).toBe(401);
    });

    it("should return abstention when context does not cover the question", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "Weekly team standup notes", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "Discussed the frontend redesign and CSS improvements. Alice will handle the color scheme." });

      const response = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is the quarterly revenue forecast?" });
      expect(response.status).toBe(200);
      expect(response.body.data.classification).toBe("abstention");
    });

    it("should return 400 for missing question", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, { id: cardId, content: "Test card", fromUserId: testUser.id, recipientIds: [testUser.id] });
      const response = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({});
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/tez/:cardId/interrogate/history", () => {
    it("should return session Q&A history", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "Budget planning document", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "The total budget is $100,000. Marketing gets $30,000 and engineering gets $70,000." });

      const interrogateResponse = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is the total budget?" });
      expect(interrogateResponse.status).toBe(200);
      const sessionId = interrogateResponse.body.data.sessionId;

      const response = await request(app).get(`/api/tez/${cardId}/interrogate/history?sessionId=${sessionId}`).set(authHeaders(testUser.id));
      expect(response.status).toBe(200);
      expect(response.body.data.sessions).toBeDefined();
      expect(Array.isArray(response.body.data.sessions)).toBe(true);
      expect(response.body.data.sessions.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.sessions[0].answer).toBeDefined();
    });

    it("should not leak sessions across cards", async () => {
      const cardA = randomUUID();
      const cardB = randomUUID();
      await insertTestCard(testClient, { id: cardA, content: "Card A", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestCard(testClient, { id: cardB, content: "Card B", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: `ctx-${randomUUID()}`, cardId: cardA, userId: testUser.id, userName: testUser.name, type: "text", rawText: "Card A context." });
      await insertTestContext(testClient, { id: `ctx-${randomUUID()}`, cardId: cardB, userId: testUser.id, userName: testUser.name, type: "text", rawText: "Card B context." });

      const interrogateResponse = await request(app)
        .post(`/api/tez/${cardA}/interrogate`)
        .set(authHeaders(testUser.id))
        .send({ question: "What is the context?" });
      expect(interrogateResponse.status).toBe(200);
      const sessionId = interrogateResponse.body.data.sessionId;

      // Same user has access to cardB, but should not be able to reuse cardA's sessionId to fetch history under cardB.
      const historyResponse = await request(app)
        .get(`/api/tez/${cardB}/interrogate/history?sessionId=${sessionId}`)
        .set(authHeaders(testUser.id));
      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.data.sessions).toBeDefined();
      expect(Array.isArray(historyResponse.body.data.sessions)).toBe(true);
      expect(historyResponse.body.data.sessions.length).toBe(0);
    });
  });

  describe("GET /api/tez/:cardId/citations", () => {
    it("should return verified citations for a card", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "Project status report", fromUserId: testUser.id, recipientIds: [testUser.id] });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "The project is on track. Sprint velocity has improved by 20%. All blockers have been resolved." });

      await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser.id)).send({ question: "What is the sprint velocity improvement?" });

      const response = await request(app).get(`/api/tez/${cardId}/citations`).set(authHeaders(testUser.id));
      expect(response.status).toBe(200);
      expect(response.body.data.citations).toBeDefined();
      expect(Array.isArray(response.body.data.citations)).toBe(true);
    });
  });

  describe("GET /api/tez/:cardId/export", () => {
    it("should export a card as valid Inline Tez markdown", async () => {
      const cardId = randomUUID();
      const ctxId = `ctx-${randomUUID()}`;
      await insertTestCard(testClient, { id: cardId, content: "This is the main card content for the export test", fromUserId: testUser.id, recipientIds: [testUser.id], summary: "Export Test Card" });
      await insertTestContext(testClient, { id: ctxId, cardId, userId: testUser.id, userName: testUser.name, type: "text", rawText: "This is the context content that should appear in the export." });

      const response = await request(app).get(`/api/tez/${cardId}/export`).set(authHeaders(testUser.id));
      expect(response.status).toBe(200);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.filename).toBeDefined();
      const md = response.body.data.markdown;
      expect(md).toContain("---");
      expect(md).toContain("tezit");
      expect(md).toContain("Export Test Card");
      expect(md).toContain("This is the main card content");
      expect(md).toContain(ctxId);
    });

    it("should return 404 for non-existent card", async () => {
      const response = await request(app).get(`/api/tez/${randomUUID()}/export`).set(authHeaders(testUser.id));
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/tez/import", () => {
    it("should import Inline Tez markdown and create a card", async () => {
      const markdown = '---\ntezit: "1.2"\ntitle: "Imported Test Card"\nprofile: "knowledge"\nauthor: "Test Author"\ncreated: "2026-02-05T00:00:00Z"\ntype: "task"\npriority: "high"\nstatus: "pending"\n---\n\n# Imported Test Card\n\nThis is the content of the imported tez card. It contains important information about the project timeline and deliverables.\n';

      const response = await request(app).post("/api/tez/import").set(authHeaders(testUser.id)).send({ markdown });
      expect(response.status).toBe(201);
      expect(response.body.data.cardId).toBeDefined();

      const exportResponse = await request(app).get(`/api/tez/${response.body.data.cardId}/export`).set(authHeaders(testUser.id));
      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.data.markdown).toContain("Imported Test Card");
    });

    it("should return 400 for malformed markdown without frontmatter", async () => {
      const response = await request(app).post("/api/tez/import").set(authHeaders(testUser.id)).send({ markdown: "This is just plain text without any YAML frontmatter." });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_FORMAT");
    });

    it("should return 400 when markdown field is missing", async () => {
      const response = await request(app).post("/api/tez/import").set(authHeaders(testUser.id)).send({});
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Citation verification", () => {
    it("should verify citation when context item exists", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "The project deadline is March 15th and the budget is $50,000.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "general" }];
      const result = verifyCitations(parsedCitations, contextItems, "The deadline is March 15th");
      expect(result).toHaveLength(1);
      expect(result[0].contextItemId).toBe("ctx-001");
      expect(result[0].excerpt).toBeDefined();
      expect(result[0].excerpt.length).toBeGreaterThan(0);
    });

    it("should fail verification when context item does not exist", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "Some text content.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-nonexistent", location: "general" }];
      const result = verifyCitations(parsedCitations, contextItems, "Some claim");
      expect(result).toHaveLength(1);
      expect(result[0].verificationStatus).toBe("failed");
      expect(result[0].contextItemId).toBe("ctx-nonexistent");
      expect(result[0].excerptVerified).toBe(false);
    });

    it("should verify line location reference (L42)", () => {
      const multilineText = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} content here.`).join("\n");
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: multilineText, userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "L42" }];
      const result = verifyCitations(parsedCitations, contextItems, 'Answer text citing "Line 42 content here" [[ctx-001:L42]]');
      expect(result).toHaveLength(1);
      expect(result[0].verificationStatus).not.toBe("failed");
      expect(result[0].excerpt).toContain("Line 42");
    });

    it("should verify line range location (L10-15)", () => {
      const multilineText = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} content here.`).join("\n");
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: multilineText, userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "L10-15" }];
      const result = verifyCitations(parsedCitations, contextItems, "Answer text");
      expect(result).toHaveLength(1);
      expect(result[0].excerpt).toContain("Line 10");
      expect(result[0].excerpt).toContain("Line 15");
    });

    it("should fail verification for out-of-range line reference", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "Line 1\nLine 2\nLine 3", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "L99" }];
      const result = verifyCitations(parsedCitations, contextItems, "Some text");
      expect(result).toHaveLength(1);
      expect(result[0].verificationStatus).toBe("failed");
      expect(result[0].excerptVerified).toBe(false);
    });

    it("should verify page location reference (p2)", () => {
      const longText = Array.from({ length: 150 }, (_, i) => `Line ${i + 1} content here.`).join("\n");
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: longText, userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "p2" }];
      const result = verifyCitations(parsedCitations, contextItems, "Answer text");
      expect(result).toHaveLength(1);
      expect(result[0].verificationStatus).not.toBe("failed");
      // Page 2 should start around line 51 (50 lines per page)
      expect(result[0].excerpt).toContain("Line 51");
    });

    it("should verify section location reference (sec-intro)", () => {
      const documentText = "# Introduction\nThis is the intro section.\n\n# Methods\nThis is the methods section.";
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: documentText, userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "sec-intro" }];
      const result = verifyCitations(parsedCitations, contextItems, "Answer text");
      expect(result).toHaveLength(1);
      expect(result[0].verificationStatus).not.toBe("failed");
      expect(result[0].excerpt).toContain("Introduction");
    });

    it("should verify excerpt match with exact quote", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "The total project budget is $100,000 and the timeline is 6 months.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "general" }];
      const answerWithQuote = 'According to the context, "the total project budget is $100,000" [[ctx-001:general]].';
      const result = verifyCitations(parsedCitations, contextItems, answerWithQuote);
      expect(result).toHaveLength(1);
      expect(result[0].excerptVerified).toBe(true);
      expect(result[0].confidence).toBe("high");
      expect(result[0].verificationStatus).toBe("verified");
    });

    it("should verify excerpt match with paraphrase (80% word overlap)", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "The system performance improved significantly after the database optimization.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "general" }];
      const answerWithParaphrase = 'The database optimization led to significant performance improvement [[ctx-001:general]].';
      const result = verifyCitations(parsedCitations, contextItems, answerWithParaphrase);
      expect(result).toHaveLength(1);
      // Should pass 80% threshold: "database", "optimization", "significant", "performance" all match
      expect(result[0].excerptVerified).toBe(true);
      expect(result[0].confidence).toBe("high");
    });

    it("should fail excerpt verification when claim doesn't match content", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "The project is scheduled for March 2026.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "general" }];
      const answerWithFalseClaim = 'The project is scheduled for December 2025 [[ctx-001:general]].';
      const result = verifyCitations(parsedCitations, contextItems, answerWithFalseClaim);
      expect(result).toHaveLength(1);
      expect(result[0].excerptVerified).toBe(false);
      expect(result[0].confidence).toBe("low");
      expect(result[0].verificationStatus).toBe("unverified");
    });

    it("should handle citation without explicit excerpt (just marker)", () => {
      const contextItems = [{ id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "Some context content.", userName: "Test User", capturedAt: new Date() }];
      const parsedCitations = [{ contextItemId: "ctx-001", location: "general" }];
      const answerWithJustMarker = "[[ctx-001:general]]";
      const result = verifyCitations(parsedCitations, contextItems, answerWithJustMarker);
      expect(result).toHaveLength(1);
      expect(result[0].excerptVerified).toBe(false);
      expect(result[0].confidence).toBe("medium");
      expect(result[0].verificationStatus).toBe("unverified");
    });

    it("should handle multiple citations in one answer", () => {
      const contextItems = [
        { id: "ctx-001", cardId: "card-001", originalType: "text", originalRawText: "The budget is $50,000.", userName: "Test User", capturedAt: new Date() },
        { id: "ctx-002", cardId: "card-001", originalType: "text", originalRawText: "The deadline is March 15th.", userName: "Test User", capturedAt: new Date() },
      ];
      const parsedCitations = [
        { contextItemId: "ctx-001", location: "general" },
        { contextItemId: "ctx-002", location: "general" },
      ];
      const answer = 'The budget is $50,000 [[ctx-001:general]] and the deadline is March 15th [[ctx-002:general]].';
      const result = verifyCitations(parsedCitations, contextItems, answer);
      expect(result).toHaveLength(2);
      expect(result[0].excerptVerified).toBe(true);
      expect(result[1].excerptVerified).toBe(true);
    });
  });

  describe("Citation parsing", () => {
    it("should parse [[item-id:location]] format correctly", () => {
      const text = 'The deadline is March 15th [[ctx-001:line-3]] and the budget is $50,000 [[ctx-002:general]].';
      const citations = parseCitations(text);
      expect(citations).toHaveLength(2);
      expect(citations[0].contextItemId).toBe("ctx-001");
      expect(citations[0].location).toBe("line-3");
      expect(citations[1].contextItemId).toBe("ctx-002");
      expect(citations[1].location).toBe("general");
    });

    it("should parse [[item-id]] format without location", () => {
      const text = 'The project is on track [[ctx-001]].';
      const citations = parseCitations(text);
      expect(citations).toHaveLength(1);
      expect(citations[0].contextItemId).toBe("ctx-001");
      expect(citations[0].location).toBeUndefined();
    });

    it("should return empty array for text with no citations", () => {
      const citations = parseCitations("This text has no citations at all.");
      expect(citations).toHaveLength(0);
    });
  });

  describe("Access control", () => {
    it("should return 403 when user is not a recipient or sender", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, { id: cardId, content: "Private card", fromUserId: testUser.id, recipientIds: [testUser.id] });
      const response = await request(app).post(`/api/tez/${cardId}/interrogate`).set(authHeaders(testUser2.id)).send({ question: "What is this about?" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("TIP Lite optimization (Section 1.5.2)", () => {
    it("should use TIP Lite for small context (< 32K tokens)", async () => {
      // Create a card with small context (< 8K characters = ~2K tokens)
      const cardId = randomUUID();
      await insertTestCard(testClient, { id: cardId, content: "Small context test", fromUserId: testUser.id, recipientIds: [testUser.id] });

      const contextText = "The budget for Q1 is $50,000. The deadline is March 15th.";
      await insertTestContext(testClient, {
        id: "ctx-small",
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: contextText,
      });

      const response = await request(app)
        .post(`/api/tez/${cardId}/interrogate`)
        .set(authHeaders(testUser.id))
        .send({ question: "What is the budget?" });

      expect(response.status).toBe(200);
      expect(response.body.data.tipLite).toBe(true);
      expect(response.body.data.contextScope).toBe("tip_lite");
    });

    it("should NOT use TIP Lite for large context (>= 32K tokens)", async () => {
      // Create a card with large context (> 128K characters = ~32K tokens)
      const cardId = randomUUID();
      await insertTestCard(testClient, { id: cardId, content: "Large context test", fromUserId: testUser.id, recipientIds: [testUser.id] });

      // Generate 150K characters of context text
      const largeText = "The project requires detailed analysis. ".repeat(3750);
      await insertTestContext(testClient, {
        id: "ctx-large",
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: largeText,
      });

      const response = await request(app)
        .post(`/api/tez/${cardId}/interrogate`)
        .set(authHeaders(testUser.id))
        .send({ question: "What does the project require?" });

      expect(response.status).toBe(200);
      expect(response.body.data.tipLite).toBe(false);
      expect(response.body.data.contextScope).toBe("full");
    });
  });

  describe("Inline Tez parsing improvements", () => {
    it("should parse multi-line literal block scalars (|)", async () => {
      const markdown = `---
tezit: "1.2"
title: "Multi-line Test"
profile: "knowledge"
description: |
  This is a multi-line description
  that spans multiple lines
  and preserves line breaks.
---

# Multi-line Test

Content here.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(201);
      expect(response.body.data.cardId).toBeDefined();
    });

    it("should parse multi-line folded block scalars (>)", async () => {
      const markdown = `---
tezit: "1.2"
title: "Folded Multi-line Test"
profile: "knowledge"
description: >
  This is a folded multi-line description
  that gets combined into a single line
  with spaces.
---

# Folded Multi-line Test

Content here.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(201);
      expect(response.body.data.cardId).toBeDefined();
    });

    it("should detect duplicate keys in YAML frontmatter", async () => {
      const markdown = `---
tezit: "1.2"
title: "First Title"
title: "Duplicate Title"
profile: "knowledge"
---

# Test

Content.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("Duplicate key");
    });

    it("should validate context items with invalid URLs", async () => {
      const markdown = `---
tezit: "1.2"
title: "Invalid URL Test"
profile: "knowledge"
context:
  - label: "Bad URL"
    url: "not-a-valid-url"
---

# Test

Content.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(400);
      // AJV schema validation catches invalid URI format before our custom check
      expect(response.body.error.message).toMatch(/Invalid URL|validation failed|format/i);
    });

    it("should detect duplicate context labels", async () => {
      const markdown = `---
tezit: "1.2"
title: "Duplicate Labels Test"
profile: "knowledge"
context:
  - label: "Source A"
    url: "https://example.com/a"
  - label: "Source A"
    url: "https://example.com/b"
---

# Test

Content.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("Duplicate context label");
    });

    it("should parse flow-style arrays and objects", async () => {
      const markdown = `---
tezit: "1.2"
title: "Flow Style Test"
profile: "knowledge"
context:
  - {label: "Source A", url: "https://example.com/a"}
  - {label: "Source B", file: "./doc.pdf"}
---

# Test

Content.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(201);
      expect(response.body.data.cardId).toBeDefined();
    });

    it("should enforce required fields per schema", async () => {
      const markdown = `---
tezit: "1.2"
---

# Missing Required Fields

Content.`;

      const response = await request(app)
        .post("/api/tez/import")
        .set(authHeaders(testUser.id))
        .send({ markdown });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain("validation failed");
    });
  });
});
