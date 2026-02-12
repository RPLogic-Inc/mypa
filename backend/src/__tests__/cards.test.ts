/**
 * Integration tests for the Cards API
 *
 * Tests all card-related endpoints:
 * - GET /api/cards/feed - Get user's card feed
 * - POST /api/cards/personal - Create a personal card
 * - POST /api/cards/team - Create a team card
 * - GET /api/cards/:id - Get card with responses
 * - POST /api/cards/:id/acknowledge - Acknowledge a card
 * - POST /api/cards/:id/context - Add context to a card
 * - GET /api/cards/:id/context - Get context entries
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, desc } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

// Test fixtures
const testUser = {
  id: "test-user-1",
  name: "Test User",
  email: "test@example.com",
  department: "Engineering",
  roles: ["engineer"],
  skills: ["typescript", "testing"],
};

const testUser2 = {
  id: "test-user-2",
  name: "Test User 2",
  email: "test2@example.com",
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
  `);
}

/**
 * Insert test users into database
 */
async function seedTestUsers(client: Client) {
  const now = Date.now();
  const teamId = "test-team-1";

  // Create a team and assign both users to it so `/api/cards/team` has an active team context.
  await client.execute({
    sql: `INSERT INTO teams (id, name, members, leads, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [teamId, "Test Team", JSON.stringify([testUser.id, testUser2.id]), JSON.stringify([testUser2.id]), now],
  });

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      testUser.id,
      testUser.name,
      testUser.email,
      testUser.department,
      teamId,
      JSON.stringify(testUser.roles),
      JSON.stringify(testUser.skills),
      now,
      now,
    ],
  });
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      testUser2.id,
      testUser2.name,
      testUser2.email,
      testUser2.department,
      teamId,
      JSON.stringify(testUser2.roles),
      JSON.stringify(testUser2.skills),
      now,
      now,
    ],
  });

  // Junction table membership (used by card routing logic).
  await client.execute({
    sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    args: [testUser.id, teamId, "member", now],
  });
  await client.execute({
    sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    args: [testUser2.id, teamId, "team_lead", now],
  });
}

/**
 * Clear all test data
 */
async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM card_recipients;
    DELETE FROM user_roles;
    DELETE FROM user_skills;
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
  }
) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO cards (id, content, summary, from_user_id, to_user_ids, status, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      card.id,
      card.content,
      card.summary || null,
      card.fromUserId,
      JSON.stringify(card.toUserIds),
      card.status || "pending",
      "private",
      now,
      now,
    ],
  });
  return card;
}

/**
 * Insert a test response
 */
async function insertTestResponse(
  client: Client,
  response: { id: string; cardId: string; userId: string; content: string }
) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO responses (id, card_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [response.id, response.cardId, response.userId, response.content, now],
  });
  return response;
}

/**
 * Insert test context
 */
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
    args: [
      ctx.id,
      ctx.cardId,
      ctx.userId,
      ctx.userName,
      ctx.type,
      ctx.rawText,
      now,
      JSON.stringify(["Test bullet"]),
      now,
    ],
  });
  return ctx;
}

// ============= OpenClaw Service =============
// Note: We use the real OpenClaw service with fallback logic (no external API calls)
// since OPENCLAW_TOKEN is not set in test environment

// ============= Create Test App =============

async function createTestApp() {
  // Import routes after mocking
  const { cardRoutes } = await import("../routes/cards.js");

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

  testApp.use("/api/cards", cardRoutes);

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

describe("Cards API", () => {
  describe("GET /api/cards/feed", () => {
    it("should return 401 when no user ID is provided", async () => {
      const response = await request(app).get("/api/cards/feed");

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should return empty array when user has no cards", async () => {
      const response = await request(app)
        .get("/api/cards/feed")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards).toEqual([]);
      expect(response.body.pagination.hasMore).toBe(false);
    });

    it("should return cards for authenticated user", async () => {
      // Insert a test card
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Test card content",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const response = await request(app)
        .get("/api/cards/feed")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards).toHaveLength(1);
      expect(response.body.cards[0].id).toBe(cardId);
      expect(response.body.cards[0].content).toBe("Test card content");
      expect(response.body.pagination).toBeDefined();
    });

    it("should filter cards by status", async () => {
      // Insert cards with different statuses
      await insertTestCard(testClient, {
        id: randomUUID(),
        content: "Pending card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      await insertTestCard(testClient, {
        id: randomUUID(),
        content: "Resolved card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "resolved",
      });

      const response = await request(app)
        .get("/api/cards/feed?status=pending")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards).toHaveLength(1);
      expect(response.body.cards[0].content).toBe("Pending card");
    });

    it("should include responses with cards", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with response",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestResponse(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser2.id,
        content: "This is a response",
      });

      const response = await request(app)
        .get("/api/cards/feed")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards).toHaveLength(1);
      expect(response.body.cards[0].responses).toHaveLength(1);
      expect(response.body.cards[0].responses[0].content).toBe("This is a response");
    });
  });

  describe("POST /api/cards/personal", () => {
    it("should return 401 when no user ID is provided", async () => {
      const response = await request(app)
        .post("/api/cards/personal")
        .send({ content: "Test personal card" });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should create a personal card", async () => {
      const response = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Remember to review PR #123",
          summary: "Review PR",
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.fromUserId).toBe(testUser.id);
      expect(response.body.toUserIds).toContain(testUser.id);
      expect(response.body.status).toBe("pending");
    });

    it("should create card with audio URL", async () => {
      const response = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Voice memo content",
          audioUrl: "https://example.com/audio.mp3",
        });

      expect(response.status).toBe(201);
      expect(response.body.audioUrl).toBe("https://example.com/audio.mp3");
    });

    it("should create card with due date", async () => {
      const dueDate = new Date("2025-01-15T10:00:00Z").toISOString();

      const response = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Task with deadline",
          dueDate,
        });

      expect(response.status).toBe(201);
      expect(response.body.dueDate).toBeDefined();
    });
  });

  describe("POST /api/cards/team", () => {
    it("should return 401 when no user ID is provided", async () => {
      const response = await request(app)
        .post("/api/cards/team")
        .send({ content: "Team update" });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should create a team card with AI routing", async () => {
      const response = await request(app)
        .post("/api/cards/team")
        .set(authHeaders(testUser.id))
        .send({
          content: "We need to discuss the new feature implementation",
          shareToTeam: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.fromUserId).toBe(testUser.id);
      // Explicit broadcast intent: server expands recipients to all teammates.
      expect(response.body.toUserIds).toBeDefined();
    });

    it("should allow overriding AI-suggested recipients", async () => {
      const response = await request(app)
        .post("/api/cards/team")
        .set(authHeaders(testUser.id))
        .send({
          content: "Direct message to specific user",
          recipients: [testUser2.id],
        });

      expect(response.status).toBe(201);
      expect(response.body.toUserIds).toContain(testUser2.id);
    });
  });

  describe("GET /api/cards/:id", () => {
    it("should return 404 for non-existent card", async () => {
      const response = await request(app)
        .get(`/api/cards/${randomUUID()}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Card not found");
    });

    it("should return card with responses", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to retrieve",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const responseId = randomUUID();
      await insertTestResponse(testClient, {
        id: responseId,
        cardId,
        userId: testUser2.id,
        content: "Response content",
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(cardId);
      expect(response.body.content).toBe("Card to retrieve");
      expect(response.body.responses).toHaveLength(1);
      expect(response.body.responses[0].content).toBe("Response content");
    });

    it("should return card reactions", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with reactions",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      // Add a reaction
      await testClient.execute({
        sql: `INSERT INTO reactions (id, card_id, user_id, emoji, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), cardId, testUser.id, "thumbsup", Date.now()],
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.reactions).toHaveLength(1);
      expect(response.body.reactions[0].emoji).toBe("thumbsup");
    });
  });

  describe("POST /api/cards/:id/acknowledge", () => {
    it("should return 401 when no user ID is provided", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to acknowledge",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app).post(`/api/cards/${cardId}/acknowledge`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("should update card status to active", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to acknowledge",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/acknowledge`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the status was updated
      const result = await testClient.execute({
        sql: "SELECT status FROM cards WHERE id = ?",
        args: [cardId],
      });
      expect(result.rows[0].status).toBe("active");
    });
  });

  describe("POST /api/cards/:id/context", () => {
    it("should return 401 when no user ID is provided", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .send({ type: "text", rawText: "Some context" });

      expect(response.status).toBe(401);
    });

    it("should return 400 when type or rawText is missing", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id))
        .send({ type: "text" }); // Missing rawText

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should add text context to a card", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id))
        .send({
          type: "text",
          rawText: "Additional context about this card",
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.cardId).toBe(cardId);
      expect(response.body.userId).toBe(testUser.id);
      expect(response.body.originalType).toBe("text");
      expect(response.body.originalRawText).toBe("Additional context about this card");
      expect(response.body.displayBullets).toBeDefined();
    });

    it("should add voice context with audio URL", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for voice context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id))
        .send({
          type: "voice",
          rawText: "Voice transcription text",
          audioUrl: "https://example.com/voice.mp3",
          audioDuration: 30,
        });

      expect(response.status).toBe(201);
      expect(response.body.originalType).toBe("voice");
      expect(response.body.originalAudioUrl).toBe("https://example.com/voice.mp3");
      expect(response.body.originalAudioDuration).toBe(30);
    });

    it("should add assistant context with assistant data", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for assistant context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const assistantData = {
        query: "What should I do next?",
        fullResponse: "Here are the next steps...",
        toolsUsed: ["calendar", "email"],
        sources: [{ type: "internal", reference: "doc-123" }],
        executionTimeMs: 500,
      };

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id))
        .send({
          type: "assistant",
          rawText: "Here are the next steps...",
          assistantData,
        });

      expect(response.status).toBe(201);
      expect(response.body.originalType).toBe("assistant");
      expect(response.body.assistantData).toBeDefined();
      expect(response.body.assistantData.query).toBe("What should I do next?");
    });
  });

  describe("GET /api/cards/:id/context", () => {
    it("should return empty array when no context exists", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card without context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should return all context entries for a card", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with multiple contexts",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      // Add multiple context entries
      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: "First context entry",
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser2.id,
        userName: testUser2.name,
        type: "voice",
        rawText: "Second context entry from voice",
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      // Should be ordered by capturedAt desc
      expect(response.body[0].originalType).toBeDefined();
      expect(response.body[1].originalType).toBeDefined();
    });

    it("should return context with display bullets", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with context bullets",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: "Context with bullets",
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].displayBullets).toBeDefined();
      expect(Array.isArray(response.body[0].displayBullets)).toBe(true);
    });
  });

  describe("POST /api/cards/:id/respond", () => {
    it("should add a response to a card", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to respond to",
        fromUserId: testUser.id,
        toUserIds: [testUser.id, testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set(authHeaders(testUser2.id))
        .send({
          content: "This is my response",
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.cardId).toBe(cardId);
      expect(response.body.userId).toBe(testUser2.id);
      expect(response.body.content).toBe("This is my response");
    });

    it("should update card status to active", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to respond to",
        fromUserId: testUser.id,
        toUserIds: [testUser.id, testUser2.id],
        status: "pending",
      });

      await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set(authHeaders(testUser2.id))
        .send({
          content: "Response",
        });

      // Verify status was updated
      const result = await testClient.execute({
        sql: "SELECT status FROM cards WHERE id = ?",
        args: [cardId],
      });
      expect(result.rows[0].status).toBe("active");
    });
  });

  describe("PATCH /api/cards/:id", () => {
    it("should update card status", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to update",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const response = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id))
        .send({ status: "resolved" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the update
      const result = await testClient.execute({
        sql: "SELECT status FROM cards WHERE id = ?",
        args: [cardId],
      });
      expect(result.rows[0].status).toBe("resolved");
    });
  });

  describe("DELETE /api/cards/:id", () => {
    it("should resolve card (set status to resolved)", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to archive",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const response = await request(app)
        .delete(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the card was resolved
      const result = await testClient.execute({
        sql: "SELECT status FROM cards WHERE id = ?",
        args: [cardId],
      });
      expect(result.rows[0].status).toBe("resolved");
    });
  });

  describe("POST /api/cards/:id/react", () => {
    it("should add a reaction to a card", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to react to",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/react`)
        .set(authHeaders(testUser.id))
        .send({ emoji: "heart" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify the reaction was added
      const result = await testClient.execute({
        sql: "SELECT emoji FROM reactions WHERE card_id = ?",
        args: [cardId],
      });
      expect(result.rows[0].emoji).toBe("heart");
    });

    it("should return 403 when user has no access", async () => {
      // Create card owned by user2 without user1 as recipient
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/react`)
        .set(authHeaders(testUser.id))
        .send({ emoji: "heart" });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Access denied");
    });

    it("should return 404 for non-existent card", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/react`)
        .set(authHeaders(testUser.id))
        .send({ emoji: "heart" });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Card not found");
    });
  });

  // ============= Snooze Tests =============

  describe("POST /api/cards/:id/snooze", () => {
    it("should snooze a card until specified time", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card to snooze",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        status: "pending",
      });

      const snoozeUntil = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      const response = await request(app)
        .post(`/api/cards/${cardId}/snooze`)
        .set(authHeaders(testUser.id))
        .send({ until: snoozeUntil });

      expect(response.status).toBe(200);
      expect(response.body.snoozedUntil).toBeDefined();
    });

    it("should return 404 for non-existent card", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/snooze`)
        .set(authHeaders(testUser.id))
        .send({ until: new Date().toISOString() });

      expect(response.status).toBe(404);
    });

    it("should return 403 when user has no access", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/snooze`)
        .set(authHeaders(testUser.id))
        .send({ until: new Date().toISOString() });

      expect(response.status).toBe(403);
    });
  });

  // ============= Library Search Tests =============

  describe("GET /api/cards/library/search", () => {
    it("should search context by query", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with searchable context",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: "This is about project management and deadlines",
      });

      const response = await request(app)
        .get("/api/cards/library/search?q=project")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeGreaterThanOrEqual(1);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
    });

    it("should filter by context type", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card with multiple context types",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "text",
        rawText: "Text context",
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser.id,
        userName: testUser.name,
        type: "voice",
        rawText: "Voice context unique",
      });

      // Query is required, use a term that matches the voice context
      const response = await request(app)
        .get("/api/cards/library/search?q=unique&type=voice")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      // Should only return voice type contexts
      for (const result of response.body.results) {
        expect(result.context.originalType).toBe("voice");
      }
    });

    it("should not return contexts from cards user cannot access", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      await insertTestContext(testClient, {
        id: randomUUID(),
        cardId,
        userId: testUser2.id,
        userName: testUser2.name,
        type: "text",
        rawText: "Private context with keyword secret",
      });

      const response = await request(app)
        .get("/api/cards/library/search?q=secret")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(0);
    });
  });

  // ============= Cursor Pagination Tests =============

  describe("Cursor-based pagination", () => {
    it("should support cursor-based pagination for feed", async () => {
      // Create multiple cards
      for (let i = 0; i < 5; i++) {
        await insertTestCard(testClient, {
          id: randomUUID(),
          content: `Card ${i}`,
          fromUserId: testUser.id,
          toUserIds: [testUser.id],
        });
      }

      // Get first page
      const firstPage = await request(app)
        .get("/api/cards/feed?limit=2")
        .set(authHeaders(testUser.id));

      expect(firstPage.status).toBe(200);
      expect(firstPage.body.cards.length).toBe(2);
      expect(firstPage.body.pagination.hasMore).toBe(true);
      expect(firstPage.body.pagination.nextCursor).toBeDefined();

      // Get second page using cursor
      const cursor = firstPage.body.pagination.nextCursor;
      const secondPage = await request(app)
        .get(`/api/cards/feed?limit=2&cursor=${cursor}`)
        .set(authHeaders(testUser.id));

      expect(secondPage.status).toBe(200);
      expect(secondPage.body.cards.length).toBe(2);
      // Cards should be different from first page
      const firstPageIds = firstPage.body.cards.map((c: { id: string }) => c.id);
      const secondPageIds = secondPage.body.cards.map((c: { id: string }) => c.id);
      for (const id of secondPageIds) {
        expect(firstPageIds).not.toContain(id);
      }
    });

    it("should handle invalid cursor gracefully", async () => {
      await insertTestCard(testClient, {
        id: randomUUID(),
        content: "Test card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .get("/api/cards/feed?cursor=invalid-cursor")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards).toBeDefined();
    });
  });

  // ============= Access Control Tests =============

  describe("Access Control", () => {
    it("should deny access to card details for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Access denied");
    });

    it("should deny respond access for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set(authHeaders(testUser.id))
        .send({ content: "Trying to respond" });

      expect(response.status).toBe(403);
    });

    it("should deny acknowledge access for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/acknowledge`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(403);
    });

    it("should deny patch access for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set(authHeaders(testUser.id))
        .send({ status: "resolved" });

      expect(response.status).toBe(403);
    });

    it("should deny context access for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(403);
    });

    it("should deny add context for non-recipients", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id))
        .send({ type: "text", rawText: "Test" });

      expect(response.status).toBe(403);
    });
  });

  // ============= Not Found Tests =============

  describe("Not Found Errors", () => {
    it("should return 404 for non-existent card on respond", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/respond`)
        .set(authHeaders(testUser.id))
        .send({ content: "Response" });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Card not found");
    });

    it("should return 404 for non-existent card on acknowledge", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/acknowledge`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent card on patch", async () => {
      const response = await request(app)
        .patch(`/api/cards/${randomUUID()}`)
        .set(authHeaders(testUser.id))
        .send({ status: "resolved" });

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent card on delete", async () => {
      const response = await request(app)
        .delete(`/api/cards/${randomUUID()}`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent card on get context", async () => {
      const response = await request(app)
        .get(`/api/cards/${randomUUID()}/context`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent card on add context", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/context`)
        .set(authHeaders(testUser.id))
        .send({ type: "text", rawText: "Test" });

      expect(response.status).toBe(404);
    });
  });

  // ============= Multiple Tasks from Personal Card =============

  describe("Multiple tasks extraction", () => {
    it("should handle personal card that extracts multiple tasks", async () => {
      const response = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "I need to: 1) Review the PR 2) Update the documentation 3) Send the report",
        });

      expect(response.status).toBe(201);
      // Response could be single card or multiple cards depending on AI extraction
      expect(response.body).toBeDefined();
    });
  });

  // ============= Feed Sorting =============

  describe("Feed sorting", () => {
    it("should sort by chronological when requested", async () => {
      // Create cards with different timestamps
      const card1Id = randomUUID();
      const card2Id = randomUUID();

      await insertTestCard(testClient, {
        id: card1Id,
        content: "First card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      await insertTestCard(testClient, {
        id: card2Id,
        content: "Second card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .get("/api/cards/feed")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards.length).toBe(2);
      // Most recent should be first
      expect(response.body.cards[0].content).toBe("Second card");
    });

    it("should return multiple cards", async () => {
      await insertTestCard(testClient, {
        id: randomUUID(),
        content: "Card A",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await insertTestCard(testClient, {
        id: randomUUID(),
        content: "Card B",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .get("/api/cards/feed")
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(200);
      expect(response.body.cards.length).toBe(2);
    });
  });

  // ============= Response with attachments =============

  describe("Response with attachments", () => {
    it("should add response with audio URL", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Card for detailed response",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set(authHeaders(testUser.id))
        .send({
          content: "Response with media",
          audioUrl: "https://example.com/audio.mp3",
        });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe("Response with media");
      expect(response.body.audioUrl).toBe("https://example.com/audio.mp3");
    });
  });

  // ============= Assistant Endpoint Tests =============

  describe("POST /api/cards/:id/assistant", () => {
    it("should return 410 (deprecated) for card assistant calls", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Prepare quarterly report for the team meeting",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
        summary: "Q4 Report",
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/assistant`)
        .set(authHeaders(testUser.id))
        .send({ query: "What should I include in this report?" });

      expect(response.status).toBe(410);
      expect(response.body.error?.code).toBe("ENDPOINT_DEPRECATED");
    });

    it("should not create assistant context on deprecated endpoint", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Plan team building event",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      await request(app)
        .post(`/api/cards/${cardId}/assistant`)
        .set(authHeaders(testUser.id))
        .send({ query: "What activities should we do?" });

      // Verify context was saved
      const contextResponse = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set(authHeaders(testUser.id));

      expect(contextResponse.status).toBe(200);
      expect(contextResponse.body.some((c: { originalType: string }) => c.originalType === "assistant")).toBe(false);
    });

    it("should return 410 even when query is missing", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Test card",
        fromUserId: testUser.id,
        toUserIds: [testUser.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/assistant`)
        .set(authHeaders(testUser.id))
        .send({});

      expect(response.status).toBe(410);
      expect(response.body.error?.code).toBe("ENDPOINT_DEPRECATED");
    });

    it("should return 410 for non-existent card (deprecated endpoint short-circuit)", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/assistant`)
        .set(authHeaders(testUser.id))
        .send({ query: "Help me with this" });

      expect(response.status).toBe(410);
      expect(response.body.error?.code).toBe("ENDPOINT_DEPRECATED");
    });

    it("should return 410 when user has no access (deprecated endpoint short-circuit)", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/assistant`)
        .set(authHeaders(testUser.id))
        .send({ query: "Help me" });

      expect(response.status).toBe(410);
      expect(response.body.error?.code).toBe("ENDPOINT_DEPRECATED");
    });
  });

  // ============= Context Regeneration Tests =============

  describe("POST /api/cards/:id/context/:contextId/regenerate", () => {
    it("should return 404 for non-existent card", async () => {
      const response = await request(app)
        .post(`/api/cards/${randomUUID()}/context/${randomUUID()}/regenerate`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(404);
    });

    it("should return 403 when user has no access to card", async () => {
      const cardId = randomUUID();
      await insertTestCard(testClient, {
        id: cardId,
        content: "Private card",
        fromUserId: testUser2.id,
        toUserIds: [testUser2.id],
      });

      const response = await request(app)
        .post(`/api/cards/${cardId}/context/${randomUUID()}/regenerate`)
        .set(authHeaders(testUser.id));

      expect(response.status).toBe(403);
    });
  });
});
