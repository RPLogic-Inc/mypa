/**
 * Integration tests for Public Discovery API
 *
 * Tests public/semi-public discovery endpoints:
 * - GET /api/discover/trending - Highest-engagement tezits
 * - GET /api/discover/stats    - Aggregate platform statistics
 * - GET /api/discover/profile/:userId - Public user profile
 *
 * These endpoints do NOT require authentication.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";

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
 * Create test tables (same structure as library.test.ts)
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
      updated_at INTEGER,
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
      updated_at INTEGER,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
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
  const now = Math.floor(Date.now() / 1000);
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
    DELETE FROM tez_citations;
    DELETE FROM tez_interrogations;
    DELETE FROM reactions;
    DELETE FROM responses;
    DELETE FROM mirror_audit_log;
    DELETE FROM card_recipients;
    DELETE FROM cards;
  `);
}

async function insertTestCard(
  client: Client,
  card: {
    id: string;
    content: string;
    summary?: string;
    fromUserId: string;
    status?: string;
    visibility?: string;
    /** Epoch seconds (Drizzle mode:"timestamp" stores seconds, not millis) */
    createdAt?: number;
  }
) {
  // Drizzle's integer mode:"timestamp" stores Unix seconds, not milliseconds.
  const now = card.createdAt || Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO cards (id, content, summary, from_user_id, to_user_ids, visibility, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      card.id,
      card.content,
      card.summary || null,
      card.fromUserId,
      JSON.stringify([]),
      card.visibility || "public",
      card.status || "pending",
      now,
      now,
    ],
  });
}

async function insertTestInterrogation(
  client: Client,
  interrog: {
    id: string;
    cardId: string;
    userId: string;
  }
) {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO tez_interrogations (id, card_id, user_id, session_id, question, answer, classification, confidence, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [interrog.id, interrog.cardId, interrog.userId, randomUUID(), "Test question?", "Test answer.", "grounded", "high", now],
  });
}

async function insertTestCitation(
  client: Client,
  citation: {
    id: string;
    interrogationId: string;
  }
) {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO tez_citations (id, interrogation_id, context_item_id, excerpt, claim, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [citation.id, citation.interrogationId, randomUUID(), "test excerpt", "test claim", now],
  });
}

async function insertTestResponse(
  client: Client,
  resp: {
    id: string;
    cardId: string;
    userId: string;
  }
) {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO responses (id, card_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [resp.id, resp.cardId, resp.userId, "Test response", now],
  });
}

async function insertTestReaction(
  client: Client,
  reaction: {
    id: string;
    cardId: string;
    userId: string;
  }
) {
  const now = Math.floor(Date.now() / 1000);
  await client.execute({
    sql: `INSERT INTO reactions (id, card_id, user_id, emoji, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [reaction.id, reaction.cardId, reaction.userId, "thumbsup", now],
  });
}

async function createTestApp() {
  const { default: discoverRoutes } = await import("../routes/discover.js");

  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());

  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Override db with test instance
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

  testApp.use("/api/discover", discoverRoutes);

  testApp.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Test Error:", err);
      res.status(500).json({ error: err.message });
    }
  );

  return testApp;
}

// ============= Test Setup =============

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  testDb = drizzle(testClient, { schema });

  await createTables(testClient);
  await seedTestUsers(testClient);

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

describe("GET /api/discover/trending", () => {
  it("should return empty array when no cards exist", async () => {
    const res = await request(app).get("/api/discover/trending");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("should return cards sorted by engagement score descending", async () => {
    const card1Id = randomUUID();
    const card2Id = randomUUID();

    // Card 1: no engagement
    await insertTestCard(testClient, {
      id: card1Id,
      content: "Low engagement card",
      summary: "Low engagement",
      fromUserId: testUser.id,
    });

    // Card 2: high engagement (interrogation + citation + response)
    await insertTestCard(testClient, {
      id: card2Id,
      content: "High engagement card",
      summary: "High engagement",
      fromUserId: testUser2.id,
    });

    const interrogId = randomUUID();
    await insertTestInterrogation(testClient, {
      id: interrogId,
      cardId: card2Id,
      userId: testUser.id,
    });
    await insertTestCitation(testClient, {
      id: randomUUID(),
      interrogationId: interrogId,
    });
    await insertTestResponse(testClient, {
      id: randomUUID(),
      cardId: card2Id,
      userId: testUser.id,
    });

    const res = await request(app).get("/api/discover/trending");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    // Card2 should be first (score: 5 interrogation + 4 citation + 3 response = 12)
    expect(res.body.data[0].cardId).toBe(card2Id);
    expect(res.body.data[0].engagementScore).toBe(12);
    expect(res.body.data[0].senderName).toBe(testUser2.name);
    // Card1 should be second (score: 0)
    expect(res.body.data[1].cardId).toBe(card1Id);
    expect(res.body.data[1].engagementScore).toBe(0);
  });

  it("should respect period param", async () => {
    const recentCardId = randomUUID();
    const oldCardId = randomUUID();

    // Recent card (now)
    await insertTestCard(testClient, {
      id: recentCardId,
      content: "Recent card",
      summary: "Recent",
      fromUserId: testUser.id,
    });

    // Old card (8 days ago — outside 7d window)
    const eightDaysAgoSec = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    await insertTestCard(testClient, {
      id: oldCardId,
      content: "Old card",
      summary: "Old",
      fromUserId: testUser.id,
      createdAt: eightDaysAgoSec,
    });

    // With period=7d, only the recent card should appear
    const res7d = await request(app).get("/api/discover/trending").query({ period: "7d" });
    expect(res7d.status).toBe(200);
    expect(res7d.body.data.length).toBe(1);
    expect(res7d.body.data[0].cardId).toBe(recentCardId);

    // With period=30d, both cards should appear
    const res30d = await request(app).get("/api/discover/trending").query({ period: "30d" });
    expect(res30d.status).toBe(200);
    expect(res30d.body.data.length).toBe(2);
  });

  it("should respect limit param", async () => {
    // Create 5 cards
    for (let i = 0; i < 5; i++) {
      await insertTestCard(testClient, {
        id: randomUUID(),
        content: `Card ${i}`,
        summary: `Summary ${i}`,
        fromUserId: testUser.id,
      });
    }

    const res = await request(app).get("/api/discover/trending").query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it("should exclude deleted cards", async () => {
    const activeCardId = randomUUID();
    const deletedCardId = randomUUID();

    await insertTestCard(testClient, {
      id: activeCardId,
      content: "Active card",
      summary: "Active",
      fromUserId: testUser.id,
      status: "pending",
    });

    await insertTestCard(testClient, {
      id: deletedCardId,
      content: "Deleted card",
      summary: "Deleted",
      fromUserId: testUser.id,
      status: "deleted",
    });

    const res = await request(app).get("/api/discover/trending");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].cardId).toBe(activeCardId);
  });

  it("should NOT return private or team-scoped cards", async () => {
    const publicCardId = randomUUID();
    const privateCardId = randomUUID();
    const teamCardId = randomUUID();

    await insertTestCard(testClient, {
      id: publicCardId,
      content: "Public card",
      summary: "Public",
      fromUserId: testUser.id,
      visibility: "public",
    });

    await insertTestCard(testClient, {
      id: privateCardId,
      content: "Private card",
      summary: "Private",
      fromUserId: testUser.id,
      visibility: "private",
    });

    await insertTestCard(testClient, {
      id: teamCardId,
      content: "Team card",
      summary: "Team",
      fromUserId: testUser.id,
      visibility: "team",
    });

    const res = await request(app).get("/api/discover/trending");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].cardId).toBe(publicCardId);
  });

  it("should not expose full content — only summary", async () => {
    const cardId = randomUUID();
    await insertTestCard(testClient, {
      id: cardId,
      content: "This is private full content that should not appear",
      summary: "Public summary only",
      fromUserId: testUser.id,
    });

    const res = await request(app).get("/api/discover/trending");
    expect(res.status).toBe(200);
    expect(res.body.data[0].summary).toBe("Public summary only");
    expect(res.body.data[0].content).toBeUndefined();
  });
});

describe("GET /api/discover/stats", () => {
  it("should return platform stats with zero values when empty", async () => {
    const res = await request(app).get("/api/discover/stats");

    expect(res.status).toBe(200);
    expect(res.body.data.totalTezits).toBe(0);
    expect(res.body.data.totalInterrogations).toBe(0);
    expect(res.body.data.totalCitations).toBe(0);
    expect(res.body.data.activeUsers).toBe(0);
    expect(res.body.data.topContributors).toEqual([]);
  });

  it("should return correct aggregate stats", async () => {
    const card1Id = randomUUID();
    const card2Id = randomUUID();

    await insertTestCard(testClient, {
      id: card1Id,
      content: "Card 1",
      fromUserId: testUser.id,
    });

    await insertTestCard(testClient, {
      id: card2Id,
      content: "Card 2",
      fromUserId: testUser2.id,
    });

    // Add interrogation + citation
    const interrogId = randomUUID();
    await insertTestInterrogation(testClient, {
      id: interrogId,
      cardId: card1Id,
      userId: testUser.id,
    });
    await insertTestCitation(testClient, {
      id: randomUUID(),
      interrogationId: interrogId,
    });

    const res = await request(app).get("/api/discover/stats");

    expect(res.status).toBe(200);
    expect(res.body.data.totalTezits).toBe(2);
    expect(res.body.data.totalInterrogations).toBe(1);
    expect(res.body.data.totalCitations).toBe(1);
    expect(res.body.data.activeUsers).toBe(2);
    expect(res.body.data.topContributors.length).toBeGreaterThanOrEqual(1);
  });

  it("should rank top contributors by engagement", async () => {
    const card1Id = randomUUID();
    const card2Id = randomUUID();

    // User1 card with lots of engagement
    await insertTestCard(testClient, {
      id: card1Id,
      content: "Popular card",
      fromUserId: testUser.id,
    });
    await insertTestResponse(testClient, { id: randomUUID(), cardId: card1Id, userId: testUser2.id });
    await insertTestResponse(testClient, { id: randomUUID(), cardId: card1Id, userId: testUser2.id });
    await insertTestReaction(testClient, { id: randomUUID(), cardId: card1Id, userId: testUser2.id });

    // User2 card with no engagement
    await insertTestCard(testClient, {
      id: card2Id,
      content: "Quiet card",
      fromUserId: testUser2.id,
    });

    const res = await request(app).get("/api/discover/stats");

    expect(res.status).toBe(200);
    // User1 should be ranked first (2 responses * 3 + 1 reaction * 1 = 7)
    expect(res.body.data.topContributors[0].name).toBe(testUser.name);
    expect(res.body.data.topContributors[0].engagementScore).toBe(7);
  });

  it("should not count deleted cards in totalTezits", async () => {
    await insertTestCard(testClient, {
      id: randomUUID(),
      content: "Active",
      fromUserId: testUser.id,
      status: "pending",
    });
    await insertTestCard(testClient, {
      id: randomUUID(),
      content: "Deleted",
      fromUserId: testUser.id,
      status: "deleted",
    });

    const res = await request(app).get("/api/discover/stats");
    expect(res.status).toBe(200);
    expect(res.body.data.totalTezits).toBe(1);
  });
});

describe("GET /api/discover/profile/:userId", () => {
  it("should return user profile with tez count and engagement", async () => {
    const cardId = randomUUID();

    await insertTestCard(testClient, {
      id: cardId,
      content: "Test card",
      summary: "Test summary",
      fromUserId: testUser.id,
    });

    await insertTestResponse(testClient, {
      id: randomUUID(),
      cardId: cardId,
      userId: testUser2.id,
    });

    const res = await request(app).get(`/api/discover/profile/${testUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe(testUser.name);
    expect(res.body.data.memberSince).toBeDefined();
    expect(res.body.data.tezCount).toBe(1);
    expect(res.body.data.totalEngagement).toBe(3); // 1 response * 3
    expect(res.body.data.topTezits).toHaveLength(1);
    expect(res.body.data.topTezits[0].cardId).toBe(cardId);
    expect(res.body.data.topTezits[0].summary).toBe("Test summary");
    expect(res.body.data.topTezits[0].score).toBe(3);
  });

  it("should return 404 for unknown user", async () => {
    const res = await request(app).get("/api/discover/profile/nonexistent-user-id");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("should not expose email or internal settings", async () => {
    const res = await request(app).get(`/api/discover/profile/${testUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBeUndefined();
    expect(res.body.data.department).toBeUndefined();
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.body.data.notificationPrefs).toBeUndefined();
  });

  it("should not include deleted cards in profile", async () => {
    await insertTestCard(testClient, {
      id: randomUUID(),
      content: "Active card",
      summary: "Active",
      fromUserId: testUser.id,
      status: "active",
    });
    await insertTestCard(testClient, {
      id: randomUUID(),
      content: "Deleted card",
      summary: "Deleted",
      fromUserId: testUser.id,
      status: "deleted",
    });

    const res = await request(app).get(`/api/discover/profile/${testUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tezCount).toBe(1);
  });

  it("should return top tezits sorted by engagement score", async () => {
    const lowCard = randomUUID();
    const highCard = randomUUID();

    await insertTestCard(testClient, {
      id: lowCard,
      content: "Low card",
      summary: "Low",
      fromUserId: testUser.id,
    });

    await insertTestCard(testClient, {
      id: highCard,
      content: "High card",
      summary: "High",
      fromUserId: testUser.id,
    });

    // Add engagement only to highCard
    const interrogId = randomUUID();
    await insertTestInterrogation(testClient, {
      id: interrogId,
      cardId: highCard,
      userId: testUser2.id,
    });

    const res = await request(app).get(`/api/discover/profile/${testUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.topTezits.length).toBe(2);
    // High engagement card first
    expect(res.body.data.topTezits[0].cardId).toBe(highCard);
    expect(res.body.data.topTezits[0].score).toBe(5); // 1 interrogation * 5
    expect(res.body.data.topTezits[1].cardId).toBe(lowCard);
    expect(res.body.data.topTezits[1].score).toBe(0);
  });
});
