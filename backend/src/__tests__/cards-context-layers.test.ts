/**
 * Integration tests for context layers (AI Share feature)
 *
 * Tests that contextLayers sent with card creation:
 * - Create card_context entries for each layer
 * - Are backward-compatible (works without layers)
 * - Validate limits and structure
 * - Include metadata in product events
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

const testUser = {
  id: "ctx-test-user-1",
  name: "Context Test User",
  email: "ctx-test@example.com",
  department: "Engineering",
  roles: ["admin"],
  skills: ["typescript"],
};

const testUser2 = {
  id: "ctx-test-user-2",
  name: "Context Test User 2",
  email: "ctx-test2@example.com",
  department: "Engineering",
  roles: ["engineer"],
  skills: ["testing"],
};

const testTeamId = "ctx-test-team-1";

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
      team_id TEXT REFERENCES teams(id),
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

    CREATE TABLE IF NOT EXISTS tez_audit_events (
      id TEXT PRIMARY KEY,
      card_id TEXT,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      team_id TEXT,
      card_id TEXT,
      event_name TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER
    );
  `);
}

async function seedTestData(client: Client) {
  const now = Date.now();

  // Create team
  await client.execute({
    sql: `INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)`,
    args: [testTeamId, "Test Team", now],
  });

  // Create users
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser.id, testUser.name, testUser.email, testUser.department, JSON.stringify(testUser.roles), JSON.stringify(testUser.skills), testTeamId, now, now],
  });
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser2.id, testUser2.name, testUser2.email, testUser2.department, JSON.stringify(testUser2.roles), JSON.stringify(testUser2.skills), testTeamId, now, now],
  });

  // Add team memberships
  await client.execute({
    sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    args: [testUser.id, testTeamId, "admin", now],
  });
  await client.execute({
    sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    args: [testUser2.id, testTeamId, "member", now],
  });
}

async function clearTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM product_events;
    DELETE FROM tez_audit_events;
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

async function createTestApp() {
  const { cardRoutes } = await import("../routes/cards.js");

  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    getClient: () => testClient,
  }));

  testApp.use("/api/cards", cardRoutes);

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

function authHeaders(userId: string) {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token for userId "${userId}"`);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ============= Setup =============

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  testDb = drizzle(testClient, { schema });
  await createTables(testClient);
  await seedTestData(testClient);
  await generateTestToken(testUser.id, testUser.email, testUser.name);
  await generateTestToken(testUser2.id, testUser2.email, testUser2.name);
  app = await createTestApp();
});

afterAll(async () => {
  if (testClient) testClient.close();
});

beforeEach(async () => {
  await clearTestData(testClient);
  const { clearRateLimitStore } = await import("../middleware/rateLimit.js");
  clearRateLimitStore();
});

// ============= Tests =============

describe("Context Layers (AI Share)", () => {
  describe("POST /api/cards/personal with contextLayers", () => {
    it("should create card_context entries for each layer", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Here's my analysis of the project",
          contextLayers: [
            { type: "text", content: "What do you think about the project timeline?" },
            { type: "assistant", content: "Based on my analysis, the project is on track with minor risks in Q3.", query: "What do you think about the project timeline?" },
          ],
        });

      expect(res.status).toBe(201);

      // Check that card_context has 3 entries: 1 original + 2 layers
      const contexts = await testDb
        .select()
        .from(schema.cardContext)
        .where(eq(schema.cardContext.cardId, res.body.id));

      expect(contexts).toHaveLength(3);

      // First entry is the surface text
      expect(contexts[0].originalRawText).toBe("Here's my analysis of the project");
      expect(contexts[0].originalType).toBe("text");

      // Second entry is the user's question
      const textLayer = contexts.find((c) => c.originalType === "text" && c.originalRawText.includes("timeline"));
      expect(textLayer).toBeDefined();
      expect(textLayer!.originalRawText).toBe("What do you think about the project timeline?");

      // Third entry is the assistant response with query
      const assistantLayer = contexts.find((c) => c.originalType === "assistant");
      expect(assistantLayer).toBeDefined();
      expect(assistantLayer!.originalRawText).toContain("on track with minor risks");
      expect(assistantLayer!.assistantData).toBeDefined();
      const data = typeof assistantLayer!.assistantData === "string"
        ? JSON.parse(assistantLayer!.assistantData)
        : assistantLayer!.assistantData;
      expect(data.query).toBe("What do you think about the project timeline?");
    });

    it("should work without contextLayers (backward compatible)", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Regular note without AI context",
        });

      expect(res.status).toBe(201);

      // Should have exactly 1 context entry (the original)
      const contexts = await testDb
        .select()
        .from(schema.cardContext)
        .where(eq(schema.cardContext.cardId, res.body.id));

      expect(contexts).toHaveLength(1);
      expect(contexts[0].originalRawText).toBe("Regular note without AI context");
    });

    it("should reject more than 20 context layers", async () => {
      const layers = Array.from({ length: 21 }, (_, i) => ({
        type: "text" as const,
        content: `Layer ${i}`,
      }));

      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Too many layers",
          contextLayers: layers,
        });

      expect(res.status).toBe(400);
    });

    it("should reject context layers with empty content", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Test",
          contextLayers: [{ type: "text", content: "" }],
        });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/cards/team with contextLayers", () => {
    it("should create card_context entries for team cards", async () => {
      const res = await request(app)
        .post("/api/cards/team")
        .set(authHeaders(testUser.id))
        .send({
          content: "Team update: AI analysis shared",
          shareToTeam: true,
          shareIntent: "update",
          contextLayers: [
            { type: "text", content: "Give me a summary of the sprint" },
            { type: "assistant", content: "Sprint is progressing well. 80% of stories completed.", query: "Give me a summary of the sprint" },
            { type: "assistant", content: "Key risks: dependency on external API, deadline pressure." },
          ],
        });

      expect(res.status).toBe(201);

      // 1 original + 3 context layers = 4
      const contexts = await testDb
        .select()
        .from(schema.cardContext)
        .where(eq(schema.cardContext.cardId, res.body.id));

      expect(contexts).toHaveLength(4);

      // Verify the surface content
      expect(contexts[0].originalRawText).toBe("Team update: AI analysis shared");

      // Check shareIntent was applied
      expect(res.body.shareIntent).toBe("update");
    });

    it("should record product event with contextLayerCount", async () => {
      const res = await request(app)
        .post("/api/cards/team")
        .set(authHeaders(testUser.id))
        .send({
          content: "Shared from AI",
          shareToTeam: true,
          contextLayers: [
            { type: "assistant", content: "AI response content" },
          ],
        });

      expect(res.status).toBe(201);

      // Check product event was recorded
      const events = await testDb
        .select()
        .from(schema.productEvents)
        .where(eq(schema.productEvents.cardId, res.body.id));

      expect(events.length).toBeGreaterThanOrEqual(1);

      const shareEvent = events.find((e) => e.eventName === "tez_shared");
      expect(shareEvent).toBeDefined();
      const metadata = typeof shareEvent!.metadata === "string"
        ? JSON.parse(shareEvent!.metadata)
        : shareEvent!.metadata;
      expect(metadata.contextLayerCount).toBe(1);
      expect(metadata.sourceType).toBe("ai_share");
    });

    it("should set sourceType to self when no contextLayers", async () => {
      const res = await request(app)
        .post("/api/cards/team")
        .set(authHeaders(testUser.id))
        .send({
          content: "Normal team message",
          shareToTeam: true,
        });

      expect(res.status).toBe(201);

      const events = await testDb
        .select()
        .from(schema.productEvents)
        .where(eq(schema.productEvents.cardId, res.body.id));

      const shareEvent = events.find((e) => e.eventName === "tez_shared");
      if (shareEvent) {
        const metadata = typeof shareEvent.metadata === "string"
          ? JSON.parse(shareEvent.metadata)
          : shareEvent.metadata;
        expect(metadata.sourceType).toBe("self");
        expect(metadata.contextLayerCount).toBe(0);
      }
    });
  });

  describe("context layer validation", () => {
    it("should accept valid layer types", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Test",
          contextLayers: [
            { type: "text", content: "User message" },
            { type: "assistant", content: "AI response" },
          ],
        });

      expect(res.status).toBe(201);
    });

    it("should reject invalid layer type", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Test",
          contextLayers: [
            { type: "invalid_type", content: "Bad layer" },
          ],
        });

      expect(res.status).toBe(400);
    });

    it("should accept optional query field", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set(authHeaders(testUser.id))
        .send({
          content: "Test",
          contextLayers: [
            { type: "assistant", content: "Response text", query: "Original question" },
          ],
        });

      expect(res.status).toBe(201);

      const contexts = await testDb
        .select()
        .from(schema.cardContext)
        .where(eq(schema.cardContext.cardId, res.body.id));

      const assistantCtx = contexts.find((c) => c.originalType === "assistant");
      expect(assistantCtx).toBeDefined();
      const data = typeof assistantCtx!.assistantData === "string"
        ? JSON.parse(assistantCtx!.assistantData)
        : assistantCtx!.assistantData;
      expect(data.query).toBe("Original question");
    });
  });
});
