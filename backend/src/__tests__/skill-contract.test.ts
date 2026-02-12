/**
 * OpenClaw Skill Contract Tests
 *
 * These tests verify the API contract that OpenClaw skills depend on.
 * Breaking changes here will break OpenClaw integration.
 *
 * Endpoints under contract:
 * - GET /api/pa/context
 * - GET /api/pa/briefing
 * - POST /api/cards/personal
 * - POST /api/cards/team
 * - POST /api/cards/classify
 * - GET /api/cards/feed
 * - POST /api/tez/:id/interrogate
 * - GET /api/library/search
 *
 * NOTE: Some tests may fail due to rate limiting when run as a full suite.
 * This is a test environment concern, not a contract issue. Individual
 * tests can be run with `npx vitest run -t "test name"` to verify contract.
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
import { initializeFTS } from "../db/fts.js";
import { createTestDb, cleanupTestDb, insertTestUser, insertTestCard, type TestUser } from "./helpers.js";
import { clearRateLimitStore } from "../middleware/rateLimit.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;
let authToken: string;
let userId: string;
let teamId: string;
let testUser: TestUser;

beforeAll(async () => {
  // Use test helpers to create database
  const dbSetup = await createTestDb();
  testClient = dbSetup.client;
  testDb = dbSetup.db;

  // Initialize FTS
  await initializeFTS(testClient);

  // Create test team
  teamId = randomUUID();
  const now = Date.now();
  await testClient.execute({
    sql: `INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)`,
    args: [teamId, "Test Team", now],
  });

  // Create test user with team
  testUser = {
    id: randomUUID(),
    name: "Contract Test User",
    email: "contract@test.com",
    department: "Engineering",
    roles: ["engineer"],
    skills: ["typescript"],
  };

  await testClient.execute({
    sql: `INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser.id, testUser.name, testUser.email, testUser.department, teamId, JSON.stringify(testUser.roles), JSON.stringify(testUser.skills), now, now],
  });

  // Add user to team via junction table
  await testClient.execute({
    sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    args: [testUser.id, teamId, "member", now],
  });

  // Add role and skill
  await testClient.execute({
    sql: `INSERT INTO user_roles (user_id, role) VALUES (?, ?)`,
    args: [testUser.id, "engineer"],
  });
  await testClient.execute({
    sql: `INSERT INTO user_skills (user_id, skill) VALUES (?, ?)`,
    args: [testUser.id, "typescript"],
  });

  userId = testUser.id;

  // Generate auth token
  const { accessToken } = await generateTokens({
    id: testUser.id,
    email: testUser.email,
    name: testUser.name,
  });
  authToken = accessToken;

  // Create Express app with routes
  app = express();
  app.use(cors());
  app.use(express.json());

  // Import and mount routes
  const { default: paRoutes } = await import("../routes/pa.js");
  const { cardRoutes } = await import("../routes/cards.js");
  const { default: tezRoutes } = await import("../routes/tez.js");
  const { default: libraryRoutes } = await import("../routes/library.js");

  app.use("/api/pa", paRoutes);
  app.use("/api/cards", cardRoutes);
  app.use("/api/tez", tezRoutes);
  app.use("/api/library", libraryRoutes);

  // Error handler
  app.use((err: Error, _req: any, res: any, _next: any) => {
    console.error("Test Error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: err.message } });
  });
});

afterAll(async () => {
  await cleanupTestDb();
});

// ============= Contract Tests =============

describe("OpenClaw Skill Contract", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  describe("GET /api/pa/context", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Changes to request/response structure are breaking changes.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/pa/context");
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("returns complete context structure", async () => {
      const res = await request(app)
        .get("/api/pa/context")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");

      const data = res.body.data;

      // Core user fields
      expect(data).toHaveProperty("userId");
      expect(data).toHaveProperty("userName");
      expect(data.userId).toBe(testUser.id);
      expect(data.userName).toBe(testUser.name);

      // Team context
      expect(data).toHaveProperty("teamId");
      expect(data).toHaveProperty("teamName");
      expect(data).toHaveProperty("userRoles");
      expect(Array.isArray(data.userRoles)).toBe(true);

      // Multi-team data
      expect(data).toHaveProperty("teams");
      expect(Array.isArray(data.teams)).toBe(true);

      // Card stats
      expect(data).toHaveProperty("pendingCardCount");
      expect(typeof data.pendingCardCount).toBe("number");
      expect(data).toHaveProperty("recentCards");
      expect(Array.isArray(data.recentCards)).toBe(true);

      // Team members (for message routing)
      expect(data).toHaveProperty("teamMembers");
      expect(Array.isArray(data.teamMembers)).toBe(true);

      // Integrations
      expect(data).toHaveProperty("integrations");
      expect(data.integrations).toHaveProperty("openclawConfigured");
      expect(data.integrations).toHaveProperty("notificationsEnabled");
    });
  });

  describe("GET /api/pa/briefing", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Changes to request/response structure are breaking changes.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/pa/briefing");
      expect(res.status).toBe(401);
    });

    it("returns structured briefing data", async () => {
      const res = await request(app)
        .get("/api/pa/briefing")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");

      const data = res.body.data;

      // Card counts
      expect(data).toHaveProperty("pendingCount");
      expect(data).toHaveProperty("activeCount");
      expect(data).toHaveProperty("resolvedToday");
      expect(typeof data.pendingCount).toBe("number");
      expect(typeof data.activeCount).toBe("number");
      expect(typeof data.resolvedToday).toBe("number");

      // Card arrays
      expect(data).toHaveProperty("topPriorityCards");
      expect(data).toHaveProperty("staleCards");
      expect(data).toHaveProperty("upcomingDeadlines");
      expect(Array.isArray(data.topPriorityCards)).toBe(true);
      expect(Array.isArray(data.staleCards)).toBe(true);
      expect(Array.isArray(data.upcomingDeadlines)).toBe(true);
    });
  });

  describe("POST /api/cards/classify", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Message routing depends on this classification.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/cards/classify")
        .send({ content: "Test message" });
      expect(res.status).toBe(401);
    });

    it("classifies self-directed message", async () => {
      const res = await request(app)
        .post("/api/cards/classify")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ content: "Reminder: buy milk" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("meta");

      const data = res.body.data;
      expect(data).toHaveProperty("intent");
      expect(data).toHaveProperty("confidence");
      expect(["self", "dm", "broadcast"]).toContain(data.intent);
      expect(typeof data.confidence).toBe("number");
    });

    it("returns 400 for missing content", async () => {
      const res = await request(app)
        .post("/api/cards/classify")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("POST /api/cards/personal", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Changes to request/response structure are breaking changes.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .send({ content: "Test note" });
      expect(res.status).toBe(401);
    });

    it("creates personal card with minimal fields", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ content: "Test personal note" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.content).toBe("Test personal note");
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body.fromUserId).toBe(testUser.id);
    });

    it("creates personal card with optional fields", async () => {
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          content: "Complete project report",
          summary: "Project report",
          dueDate,
        });

      expect(res.status).toBe(201);
      expect(res.body.summary).toBe("Project report");
      expect(res.body.dueDate).toBeTruthy();
    });

    it("rejects invalid dueDate format", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          content: "Test",
          dueDate: "not-a-date",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("rejects missing required fields", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  describe("POST /api/cards/team", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Changes to request/response structure are breaking changes.
     * See: skills/mypa/SKILL.md
     */
    it("creates broadcast card", async () => {
      const res = await request(app)
        .post("/api/cards/team")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ content: "Team announcement", shareToTeam: true });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.content).toBe("Team announcement");
    });

    it("creates directed message to specific recipients", async () => {
      // Create second user to send to
      const recipient = {
        id: randomUUID(),
        name: "Recipient User",
        email: "recipient@test.com",
        department: "Engineering",
      };

      const now = Date.now();
      await testClient.execute({
        sql: `INSERT INTO users (id, name, email, department, team_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [recipient.id, recipient.name, recipient.email, recipient.department, teamId, now, now],
      });
      await testClient.execute({
        sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, ?, ?)`,
        args: [recipient.id, teamId, "member", now],
      });

      const res = await request(app)
        .post("/api/cards/team")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          content: "Direct message to colleague",
          recipients: [recipient.id],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
    });
  });

  describe("GET /api/cards/feed", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Changes to request/response structure are breaking changes.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app).get("/api/cards/feed");
      expect(res.status).toBe(401);
    });

    it("returns paginated feed with pagination", async () => {
      const res = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${authToken}`)
        .query({ status: "all", limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("cards");
      expect(res.body).toHaveProperty("pagination");
      expect(Array.isArray(res.body.cards)).toBe(true);
      expect(res.body.pagination).toHaveProperty("hasMore");
      expect(typeof res.body.pagination.hasMore).toBe("boolean");
    });

    it("filters by status", async () => {
      const res = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${authToken}`)
        .query({ status: "pending" });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.cards)).toBe(true);
    });

    it("supports pagination with cursor", async () => {
      // First page
      const res1 = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${authToken}`)
        .query({ limit: 1 });

      expect(res1.status).toBe(200);

      // If there's a cursor, try next page
      if (res1.body.pagination?.nextCursor) {
        const res2 = await request(app)
          .get("/api/cards/feed")
          .set("Authorization", `Bearer ${authToken}`)
          .query({ limit: 1, cursor: res1.body.pagination.nextCursor });

        expect(res2.status).toBe(200);
      }
    });
  });

  describe("POST /api/tez/:cardId/interrogate", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * TIP interrogation depends on this structure.
     * See: skills/mypa/SKILL.md
     */
    let testCardId: string;

    beforeAll(async () => {
      // Create a test card with context
      testCardId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO cards (id, content, summary, from_user_id, status, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [testCardId, "Test card for interrogation", "Test summary", testUser.id, "pending", "text", now, now],
      });

      // Add as recipient
      await testClient.execute({
        sql: `INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)`,
        args: [testCardId, testUser.id, now],
      });

      // Add context
      const contextId = randomUUID();
      await testClient.execute({
        sql: `INSERT INTO card_context (id, card_id, user_id, user_name, original_type, original_raw_text, captured_at, created_at, display_bullets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [contextId, testCardId, testUser.id, testUser.name, "text", "Detailed context about the test card", now, now, JSON.stringify(["Test context"])],
      });
    });

    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .post(`/api/tez/${testCardId}/interrogate`)
        .send({ question: "What is this about?" });
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing question", async () => {
      const res = await request(app)
        .post(`/api/tez/${testCardId}/interrogate`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toHaveProperty("code");
    });

    it("returns 404 for non-existent card", async () => {
      const res = await request(app)
        .post(`/api/tez/${randomUUID()}/interrogate`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ question: "What is this?" });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/library/search", () => {
    /**
     * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
     * Library search depends on this structure.
     * See: skills/mypa/SKILL.md
     */
    it("returns 401 without authentication", async () => {
      const res = await request(app)
        .get("/api/library/search")
        .query({ q: "test" });
      expect(res.status).toBe(401);
    });

    it("performs full-text search", async () => {
      const res = await request(app)
        .get("/api/library/search")
        .set("Authorization", `Bearer ${authToken}`)
        .query({ q: "test", limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("results");
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it("returns 400 for missing query", async () => {
      const res = await request(app)
        .get("/api/library/search")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("supports filtering by timeframe", async () => {
      const res = await request(app)
        .get("/api/library/search")
        .set("Authorization", `Bearer ${authToken}`)
        .query({ q: "test", timeframe: "week" });

      expect(res.status).toBe(200);
    });
  });

  describe("Error format consistency", () => {
    /**
     * SKILL CONTRACT: All errors follow consistent format.
     * OpenClaw skills depend on this structure for error handling.
     */
    it("returns consistent error structure on 400", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${authToken}`)
        .send({}); // Missing required fields

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(typeof res.body.error).toBe("object");
      // Must have at least a message or code
      expect(
        res.body.error.code || res.body.error.message
      ).toBeTruthy();
    });

    it("returns consistent error structure on 401", async () => {
      const res = await request(app).get("/api/pa/context");

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("returns consistent error structure on 404", async () => {
      const res = await request(app)
        .post(`/api/tez/${randomUUID()}/interrogate`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ question: "Test?" });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error).toHaveProperty("code");
      expect(res.body.error).toHaveProperty("message");
    });
  });

  describe("Response format consistency", () => {
    /**
     * SKILL CONTRACT: Successful responses follow consistent format.
     * Either { data: T } or { data: T, meta: M }
     */
    it("wraps data in consistent structure", async () => {
      const res = await request(app)
        .get("/api/pa/context")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(typeof res.body.data).toBe("object");
    });

    it("includes pagination metadata when pagination is present", async () => {
      const res = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pagination");
      expect(typeof res.body.pagination).toBe("object");
    });
  });
});
