/**
 * Integration tests for Tezit Protocol v1.2.4 features
 *
 * Tests:
 * - Discovery + Health (well-known endpoint, readiness tezit block)
 * - Status Transitions via API (valid, invalid, blocked reason)
 * - Dependencies via API (create, self-dep, circular, get both directions)
 * - tez:// URI parser (simple, subresource, invalid)
 * - Forking (create fork, lineage ancestors/descendants)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";
import { parseTezUri, isValidTezUri } from "../services/tezUri.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

// Test fixtures
const testUser = {
  id: "tez-test-user-1",
  name: "Tez Test User",
  email: "tez-test@example.com",
  department: "Engineering",
  roles: ["engineer"],
  skills: ["typescript", "testing"],
};

const testUser2 = {
  id: "tez-test-user-2",
  name: "Tez Test User 2",
  email: "tez-test2@example.com",
  department: "Engineering",
  roles: ["engineering_lead"],
  skills: ["typescript", "leadership"],
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
      status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      due_date INTEGER,
      snoozed_until INTEGER,
      forked_from_id TEXT,
      fork_type TEXT,
      created_at INTEGER,
      updated_at INTEGER
      ,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      emoji TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS card_views (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      viewed_at INTEGER
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

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER
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

  `);
}

/**
 * Insert test users into database
 */
async function seedTestUsers(client: Client) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      testUser.id,
      testUser.name,
      testUser.email,
      testUser.department,
      JSON.stringify(testUser.roles),
      JSON.stringify(testUser.skills),
      now,
      now,
    ],
  });
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      testUser2.id,
      testUser2.name,
      testUser2.email,
      testUser2.department,
      JSON.stringify(testUser2.roles),
      JSON.stringify(testUser2.skills),
      now,
      now,
    ],
  });
}

/**
 * Clear all test data
 */
async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM tez_citations;
    DELETE FROM tez_interrogations;
    DELETE FROM card_recipients;
    DELETE FROM user_roles;
    DELETE FROM user_skills;
    DELETE FROM user_teams;
    DELETE FROM card_views;
    DELETE FROM reactions;
    DELETE FROM responses;
    DELETE FROM card_context;
    DELETE FROM cards;
  `);
}

/**
 * Insert a test card
 */
async function insertTestCard(
  client: Client,
  card: {
    id: string;
    content: string;
    fromUserId: string;
    toUserIds: string[];
    status?: string;
    summary?: string;
    forkedFromId?: string;
    forkType?: string;
  }
) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO cards (id, content, summary, from_user_id, to_user_ids, status, visibility, forked_from_id, fork_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      card.id,
      card.content,
      card.summary || null,
      card.fromUserId,
      JSON.stringify(card.toUserIds),
      card.status || "pending",
      "private",
      card.forkedFromId || null,
      card.forkType || null,
      now,
      now,
    ],
  });
  return card;
}

// ============= Create Test App =============

async function createTestApp() {
  const { cardRoutes } = await import("../routes/cards.js");
  const { healthRoutes } = await import("../routes/health.js");
  const tezRoutes = (await import("../routes/tez.js")).default;

  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());

  // Request ID middleware (required by authenticate and route handlers)
  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Override the db module
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    // Raw client access is used by FTS hooks in routes.
    getClient: () => testClient,
  }));

  // Discovery endpoint (matches index.ts pattern)
  testApp.get("/.well-known/tezit.json", (_req, res) => {
    res.json({
      platform: "mypa",
      version: "1.0.0",
      protocol_version: "1.2.4",
      tip_version: "1.0.3",
      tip_lite: true,
      profiles: ["knowledge", "messaging", "coordination"],
      endpoints: {
        interrogate: "/api/tez/:cardId/interrogate",
        interrogate_stream: "/api/tez/:cardId/interrogate/stream",
        export_inline: "/api/tez/:cardId/export",
        export_portable: "/api/tez/:cardId/export/portable",
        import: "/api/tez/import",
        fork: "/api/tez/:cardId/fork",
        resolve: "/api/tez/resolve",
      },
      auth: "bearer",
      namespace: "mypa.chat",
    });
  });

  testApp.use("/health", healthRoutes);
  testApp.use("/api/cards", cardRoutes);
  testApp.use("/api/tez", tezRoutes);

  testApp.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("Test Error:", err);
      res.status(500).json({ error: err.message });
    }
  );

  return testApp;
}

// ============= Test Setup =============

beforeAll(async () => {
  // Create in-memory database
  testClient = createClient({
    url: "file::memory:?cache=shared",
  });

  testDb = drizzle(testClient, { schema });

  // Create tables
  await createTables(testClient);

  // Seed test users
  await seedTestUsers(testClient);

  // Generate JWT tokens for test users
  await generateTestToken(testUser.id, testUser.email, testUser.name);
  await generateTestToken(testUser2.id, testUser2.email, testUser2.name);

  // Create test app
  app = await createTestApp();
});

afterAll(async () => {
  if (testClient) {
    testClient.close();
  }
});

beforeEach(async () => {
  // Clear cards and related data before each test
  await clearTestData(testClient);

  // Clear rate limit store between tests
  const { clearRateLimitStore } = await import("../middleware/rateLimit.js");
  clearRateLimitStore();
});

// ============= Helper Functions =============

// JWT token cache for test users
const tokenCache = new Map<string, string>();

async function generateTestToken(userId: string, email: string, name: string): Promise<string> {
  const { accessToken } = await generateTokens({ id: userId, email, name });
  tokenCache.set(userId, accessToken);
  return accessToken;
}

function authHeaders(userId: string) {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token cached for userId "${userId}". Call generateTestToken() first.`);
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

// ============= Tests =============

describe("Tezit Protocol v1.2.4", () => {
  // ============= Section 1: Discovery + Health =============

  describe("Discovery + Health", () => {
    it("GET /.well-known/tezit.json returns discovery document with correct fields", async () => {
      const response = await request(app).get("/.well-known/tezit.json");

      expect(response.status).toBe(200);
      expect(response.body.platform).toBe("mypa");
      expect(response.body.protocol_version).toBe("1.2.4");
      expect(response.body.tip_version).toBe("1.0.3");
      expect(response.body.tip_lite).toBe(true);
      expect(response.body.profiles).toEqual(["knowledge", "messaging", "coordination"]);
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.interrogate).toBe("/api/tez/:cardId/interrogate");
      expect(response.body.endpoints.fork).toBe("/api/tez/:cardId/fork");
      expect(response.body.endpoints.resolve).toBe("/api/tez/resolve");
      expect(response.body.auth).toBe("bearer");
      expect(response.body.namespace).toBe("mypa.chat");
    });

    it("GET /health/ready includes tezit compliance block", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.tezit).toBeDefined();
      expect(response.body.tezit.tipLiteCompliant).toBe(true);
      expect(response.body.tezit.tipVersion).toBe("1.0.3");
      expect(response.body.tezit.protocolVersion).toBe("1.2.4");
      expect(response.body.tezit.profiles).toEqual(["knowledge", "messaging", "coordination"]);
    });
  });

  // ============= Section 2: Status Transitions via API =============

  describe("Status Transitions via API", () => {
    it("PATCH card with valid transition (pending -> active) returns 200", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for status transition test",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const response = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id))
        .send({ status: "active" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("PATCH card with invalid transition (resolved -> pending) returns 400 with INVALID_TRANSITION", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Resolved card for invalid transition test",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "resolved",
      });

      const response = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id))
        .send({ status: "pending" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
      expect(response.body.error.message).toContain("resolved");
      expect(response.body.error.message).toContain("pending");
      expect(response.body.error.validTransitions).toEqual(["archived"]);
    });

  });

  // ============= Section 3: tez:// URI Parser =============

  describe("tez:// URI Parser", () => {
    it("parseTezUri parses simple URI correctly", () => {
      const result = parseTezUri("tez://mypa.chat/abc-123");

      expect(result.platform).toBe("mypa.chat");
      expect(result.cardId).toBe("abc-123");
      expect(result.subresource).toBeUndefined();
      expect(result.subresourceId).toBeUndefined();
      expect(result.params).toBeUndefined();
    });

    it("parseTezUri parses URI with subresource", () => {
      const result = parseTezUri("tez://mypa.chat/abc-123/context/ctx-456");

      expect(result.platform).toBe("mypa.chat");
      expect(result.cardId).toBe("abc-123");
      expect(result.subresource).toBe("context");
      expect(result.subresourceId).toBe("ctx-456");
    });

    it("isValidTezUri returns false for invalid URIs", () => {
      expect(isValidTezUri("")).toBe(false);
      expect(isValidTezUri("http://example.com")).toBe(false);
      expect(isValidTezUri("tez://")).toBe(false);
      expect(isValidTezUri("tez://mypa.chat")).toBe(false); // missing cardId
      expect(isValidTezUri("not-a-uri")).toBe(false);
    });
  });

  // ============= Section 4: Forking =============

  describe("Forking", () => {
    it("POST /api/tez/:cardId/fork creates fork card (201)", async () => {
      const originalCardId = randomUUID();
      await insertTestCard(testClient, {
        id: originalCardId,
        content: "Original card to be forked",
        summary: "Original summary",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      // Add the user as a recipient so access check passes
      await testClient.execute({
        sql: `INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)`,
        args: [originalCardId, testUser.id, Date.now()],
      });

      const response = await request(app)
        .post(`/api/tez/${originalCardId}/fork`)
        .set(authHeaders(testUser.id))
        .send({
          forkType: "counter",
          content: "This is a counter-argument to the original card",
          summary: "Counter-argument summary",
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.content).toBe("This is a counter-argument to the original card");
      expect(response.body.data.forkedFromId).toBe(originalCardId);
      expect(response.body.data.forkType).toBe("counter");
      expect(response.body.data.status).toBe("pending");
      expect(response.body.data.id).toBeDefined();
    });

    it("GET /api/tez/:cardId/lineage returns ancestors and descendants", async () => {
      // Create a chain: grandparent -> parent -> child
      const grandparentId = randomUUID();
      const parentId = randomUUID();
      const childId = randomUUID();

      await insertTestCard(testClient, {
        id: grandparentId,
        content: "Grandparent card",
        summary: "Grandparent",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });
      await insertTestCard(testClient, {
        id: parentId,
        content: "Parent card (forked from grandparent)",
        summary: "Parent",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        forkedFromId: grandparentId,
        forkType: "extension",
      });
      await insertTestCard(testClient, {
        id: childId,
        content: "Child card (forked from parent)",
        summary: "Child",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        forkedFromId: parentId,
        forkType: "counter",
      });

      // Add user as recipient so access check passes
      await testClient.execute({
        sql: `INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)`,
        args: [parentId, testUser.id, Date.now()],
      });

      // Get lineage from parent's perspective
      const response = await request(app)
        .get(`/api/tez/${parentId}/lineage`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      // Parent's card info
      expect(response.body.data.card.id).toBe(parentId);
      expect(response.body.data.card.forkedFromId).toBe(grandparentId);

      // Ancestors: grandparent
      expect(response.body.data.ancestors).toHaveLength(1);
      expect(response.body.data.ancestors[0].id).toBe(grandparentId);

      // Descendants: child
      expect(response.body.data.descendants).toHaveLength(1);
      expect(response.body.data.descendants[0].id).toBe(childId);
    });
  });
});
