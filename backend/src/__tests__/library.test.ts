/**
 * Integration tests for Library of Context API
 *
 * Tests FTS5-powered search, browse, and facets endpoints:
 * - GET /api/library/search - Full-text search with filters
 * - GET /api/library/browse - Cold start browsing with engagement ranking
 * - GET /api/library/facets - Available filter metadata
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";
import { initializeFTS, rebuildFTSIndex } from "../db/fts.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

const testUser = {
  id: "test-user-1",
  name: "Test User",
  email: "test@example.com",
  department: "Engineering",
};

const testUser2 = {
  id: "test-user-2",
  name: "Alice Smith",
  email: "alice@example.com",
  department: "Product",
};

/**
 * Create test tables including FTS5
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
      team_id TEXT,
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

    CREATE TABLE IF NOT EXISTS card_recipients (
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      added_at INTEGER,
      PRIMARY KEY (card_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
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
      guest_token_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tez_citations (
      id TEXT PRIMARY KEY,
      interrogation_id TEXT NOT NULL,
      context_item_id TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      claim TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      confidence TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      emoji TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS mirror_audit_log (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      template TEXT NOT NULL,
      destination TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      deep_link_included INTEGER DEFAULT 1,
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
  `);
}

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
      JSON.stringify([]),
      JSON.stringify([]),
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
      JSON.stringify([]),
      JSON.stringify([]),
      now,
      now,
    ],
  });
}

async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM card_recipients;
    DELETE FROM responses;
    DELETE FROM tez_citations;
    DELETE FROM tez_interrogations;
    DELETE FROM reactions;
    DELETE FROM mirror_audit_log;
    DELETE FROM card_context;
    DELETE FROM cards;
    DELETE FROM card_context_fts;
  `);
}

async function insertTestCard(
  client: Client,
  card: {
    id: string;
    content: string;
    fromUserId: string;
    toUserIds: string[];
  }
) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO cards (id, content, from_user_id, to_user_ids, visibility, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [card.id, card.content, card.fromUserId, JSON.stringify(card.toUserIds), "private", "pending", now, now],
  });

  // Also insert into card_recipients
  for (const userId of card.toUserIds) {
    await client.execute({
      sql: `INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)`,
      args: [card.id, userId, now],
    });
  }
}

async function insertTestContext(
  client: Client,
  ctx: {
    id: string;
    cardId: string;
    userId: string;
    userName: string;
    type: string;
    rawText: string;
  }
) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO card_context (id, card_id, user_id, user_name, original_type, original_raw_text, captured_at, display_bullets, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [ctx.id, ctx.cardId, ctx.userId, ctx.userName, ctx.type, ctx.rawText, now, JSON.stringify(["Summary bullet"]), now],
  });

  // Also insert into FTS
  await client.execute({
    sql: `INSERT INTO card_context_fts (context_id, card_id, user_id, user_name, original_type, captured_at, original_raw_text, display_bullets_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [ctx.id, ctx.cardId, ctx.userId, ctx.userName, ctx.type, now, ctx.rawText, JSON.stringify(["Summary bullet"])],
  });
}

async function createTestApp() {
  const { default: libraryRoutes } = await import("../routes/library.js");

  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());

  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Override db with test instance
  const { vi } = await import("vitest");
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    cards: schema.cards,
    users: schema.users,
    cardContext: schema.cardContext,
    cardRecipients: schema.cardRecipients,
    responses: schema.responses,
    tezInterrogations: schema.tezInterrogations,
    tezCitations: schema.tezCitations,
    reactions: schema.reactions,
    mirrorAuditLog: schema.mirrorAuditLog,
    getClient: () => testClient,
  }));

  testApp.use("/api/library", libraryRoutes);

  testApp.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Test Error:", err);
      res.status(500).json({ error: err.message });
    }
  );

  return testApp;
}

const tokenCache = new Map<string, string>();

async function generateTestToken(userId: string, email: string, name: string): Promise<string> {
  const { accessToken } = await generateTokens({ id: userId, email, name });
  tokenCache.set(userId, accessToken);
  return accessToken;
}

function getAuthHeader(userId: string): { Authorization: string } {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token for user ${userId}`);
  return { Authorization: `Bearer ${token}` };
}

// ============= Test Setup =============

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  testDb = drizzle(testClient, { schema });

  await createTables(testClient);
  await initializeFTS(testClient);
  await seedTestUsers(testClient);

  await generateTestToken(testUser.id, testUser.email, testUser.name);
  await generateTestToken(testUser2.id, testUser2.email, testUser2.name);

  app = await createTestApp();
});

afterAll(async () => {
  if (testClient) {
    testClient.close();
  }
});

beforeEach(async () => {
  await clearTestData(testClient);
});

// ============= Tests =============

describe("GET /api/library/search", () => {
  it("should search context entries with FTS5", async () => {
    const card1Id = randomUUID();
    const ctx1Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "We need to review the quarterly budget report",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "We need to review the quarterly budget report for Q4 spending",
    });

    const res = await request(app)
      .get("/api/library/search")
      .query({ q: "budget" })
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].context.id).toBe(ctx1Id);
    expect(res.body.results[0].context.snippet).toContain("budget");
    expect(res.body.total).toBe(1);
  });

  it("should filter by content type", async () => {
    const card1Id = randomUUID();
    const card2Id = randomUUID();
    const ctx1Id = randomUUID();
    const ctx2Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "Voice note about meeting",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestCard(testClient, {
      id: card2Id,
      content: "Text note about meeting",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "voice",
      rawText: "This is a voice note about the meeting",
    });

    await insertTestContext(testClient, {
      id: ctx2Id,
      cardId: card2Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "This is a text note about the meeting",
    });

    const res = await request(app)
      .get("/api/library/search")
      .query({ q: "meeting", type: "voice" })
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].context.originalType).toBe("voice");
  });

  it("should respect access control", async () => {
    const card1Id = randomUUID();
    const ctx1Id = randomUUID();

    // Card owned by user2, not shared with user1
    await insertTestCard(testClient, {
      id: card1Id,
      content: "Private budget data",
      fromUserId: testUser2.id,
      toUserIds: [testUser2.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser2.id,
      userName: testUser2.name,
      type: "text",
      rawText: "Private budget report for executive team only",
    });

    // User1 should not see this
    const res = await request(app)
      .get("/api/library/search")
      .query({ q: "budget" })
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it("should ignore `from` param and always scope to authenticated user", async () => {
    const myCardId = randomUUID();
    const myCtxId = randomUUID();
    const otherCardId = randomUUID();
    const otherCtxId = randomUUID();

    await insertTestCard(testClient, {
      id: myCardId,
      content: "My private alpha note",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });
    await insertTestContext(testClient, {
      id: myCtxId,
      cardId: myCardId,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "alpha secret for me only",
    });

    await insertTestCard(testClient, {
      id: otherCardId,
      content: "Other user's alpha note",
      fromUserId: testUser2.id,
      toUserIds: [testUser2.id],
    });
    await insertTestContext(testClient, {
      id: otherCtxId,
      cardId: otherCardId,
      userId: testUser2.id,
      userName: testUser2.name,
      type: "text",
      rawText: "alpha secret for someone else",
    });

    const res = await request(app)
      .get("/api/library/search")
      .query({ q: "alpha", from: testUser2.id })
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].context.id).toBe(myCtxId);
  });

  it("should support pagination", async () => {
    // Create 25 test entries
    for (let i = 0; i < 25; i++) {
      const cardId = randomUUID();
      const ctxId = randomUUID();

      await insertTestCard(testClient, {
        id: cardId,
        content: `Test card ${i}`,
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestContext(testClient, {
        id: ctxId,
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: `Test entry ${i} with searchable content`,
      });
    }

    const res1 = await request(app)
      .get("/api/library/search")
      .query({ q: "searchable", limit: 10, offset: 0 })
      .set(getAuthHeader(testUser.id));

    expect(res1.status).toBe(200);
    expect(res1.body.results).toHaveLength(10);
    expect(res1.body.total).toBe(25);

    const res2 = await request(app)
      .get("/api/library/search")
      .query({ q: "searchable", limit: 10, offset: 10 })
      .set(getAuthHeader(testUser.id));

    expect(res2.status).toBe(200);
    expect(res2.body.results).toHaveLength(10);
    expect(res2.body.results[0].context.id).not.toBe(res1.body.results[0].context.id);
  });
});

describe("GET /api/library/browse", () => {
  it("should return recent context entries", async () => {
    const card1Id = randomUUID();
    const ctx1Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "Recent note",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "This is a recent context entry",
    });

    const res = await request(app)
      .get("/api/library/browse")
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.recent).toHaveLength(1);
    expect(res.body.recent[0].context.id).toBe(ctx1Id);
    expect(res.body.facets).toBeDefined();
    expect(res.body.facets.totalEntries).toBe(1);
  });

  it("should include engagement scores", async () => {
    const card1Id = randomUUID();
    const ctx1Id = randomUUID();
    const resp1Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "Card with engagement",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "Context with engagement",
    });

    // Add a response
    const now = Date.now();
    await testClient.execute({
      sql: `INSERT INTO responses (id, card_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [resp1Id, card1Id, testUser.id, "Response to card", now],
    });

    const res = await request(app)
      .get("/api/library/browse")
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.recent).toHaveLength(1);
    expect(res.body.recent[0].engagement).toBeDefined();
    expect(res.body.recent[0].engagement.responseCount).toBe(1);
    expect(res.body.recent[0].engagement.score).toBeGreaterThan(0);
  });
});

describe("GET /api/library/facets", () => {
  it("should return available filter metadata", async () => {
    const card1Id = randomUUID();
    const card2Id = randomUUID();
    const ctx1Id = randomUUID();
    const ctx2Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "Voice card",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestCard(testClient, {
      id: card2Id,
      content: "Text card",
      fromUserId: testUser.id,
      toUserIds: [testUser.id],
    });

    await insertTestContext(testClient, {
      id: ctx1Id,
      cardId: card1Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "voice",
      rawText: "Voice context",
    });

    await insertTestContext(testClient, {
      id: ctx2Id,
      cardId: card2Id,
      userId: testUser.id,
      userName: testUser.name,
      type: "text",
      rawText: "Text context",
    });

    const res = await request(app)
      .get("/api/library/facets")
      .set(getAuthHeader(testUser.id));

    expect(res.status).toBe(200);
    expect(res.body.contributors).toHaveLength(1);
    expect(res.body.contributors[0].userName).toBe(testUser.name);
    expect(res.body.contributors[0].count).toBe(2);
    expect(res.body.typeCount).toEqual({ voice: 1, text: 1 });
    expect(res.body.totalEntries).toBe(2);
    expect(res.body.dateRange).toBeDefined();
  });
});
