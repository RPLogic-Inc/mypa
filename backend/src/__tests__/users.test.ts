/**
 * Integration tests for User Routes
 *
 * Tests:
 * - GET /api/users/me - Get current user profile
 * - PATCH /api/users/me - Update user profile
 * - GET /api/users/me/notifications - Get notification settings
 * - PATCH /api/users/me/notifications - Update notification preferences
 * - POST /api/users/me/notifications/test - Send test notification
 * - GET /api/users/:id - Get user by ID
 * - POST /api/users - Create user
 * - GET /api/users/teams/:id - Get team details
 * - GET /api/users/teams/:id/members - Get team members
 * - POST /api/users/teams - Create team
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { clearRateLimitStore } from "../middleware/rateLimit.js";
import { generateTokens } from "../services/jwt.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

const testUser1 = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Alice",
  email: "alice@example.com",
  department: "Engineering",
};

const testUser2 = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Bob",
  email: "bob@example.com",
  department: "Engineering",
};

const testTeam = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "Engineering Team",
};

// JWT token cache for test users
const tokenCache = new Map<string, string>();

function authHeaders(userId: string) {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token cached for userId "${userId}". Call generateTestToken() first.`);
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

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
 * Clear and seed test data
 */
async function seedTestData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM refresh_tokens;
    DELETE FROM user_roles;
    DELETE FROM user_skills;
    DELETE FROM user_teams;
    DELETE FROM users;
    DELETE FROM teams;
  `);

  const now = Date.now();

  await client.execute({
    sql: `INSERT INTO teams (id, name, members, leads, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [testTeam.id, testTeam.name, JSON.stringify([testUser1.id, testUser2.id]), JSON.stringify([testUser1.id]), now],
  });

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, team_id, roles, skills, notification_prefs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // Test user 1 is an admin so they can create users/teams in these tests.
    args: [testUser1.id, testUser1.name, testUser1.email, testUser1.department, testTeam.id, '["admin"]', '["typescript", "react"]', '{"urgentPush": true}', now, now],
  });

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, team_id, roles, skills, notification_prefs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser2.id, testUser2.name, testUser2.email, testUser2.department, testTeam.id, '["developer"]', '["python"]', '{"urgentPush": false}', now, now],
  });

  await client.executeMultiple(`
    INSERT INTO user_roles (user_id, role) VALUES ('${testUser1.id}', 'admin');
    INSERT INTO user_roles (user_id, role) VALUES ('${testUser2.id}', 'developer');

    INSERT INTO user_skills (user_id, skill) VALUES ('${testUser1.id}', 'typescript');
    INSERT INTO user_skills (user_id, skill) VALUES ('${testUser1.id}', 'react');
    INSERT INTO user_skills (user_id, skill) VALUES ('${testUser2.id}', 'python');

    INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES ('${testUser1.id}', '${testTeam.id}', 'admin', ${Date.now()});
    INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES ('${testUser2.id}', '${testTeam.id}', 'member', ${Date.now()});
  `);
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
  const { userRoutes } = await import("../routes/users.js");
  app.use("/api/users", userRoutes);

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

describe("User Routes", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);
    await seedTestData(testClient);

    // Generate JWT tokens for test users
    const { accessToken: token1 } = await generateTokens({ id: testUser1.id, email: testUser1.email, name: testUser1.name });
    tokenCache.set(testUser1.id, token1);
    const { accessToken: token2 } = await generateTokens({ id: testUser2.id, email: testUser2.email, name: testUser2.name });
    tokenCache.set(testUser2.id, token2);
    // Token for a non-existent user (valid JWT but user not in DB)
    const { accessToken: tokenNonExistent } = await generateTokens({ id: "non-existent-user", email: "noone@example.com", name: "Nobody" });
    tokenCache.set("non-existent-user", tokenNonExistent);

    app = await createTestApp();
  });

  afterAll(async () => {
    testClient.close();
  });

  beforeEach(async () => {
    await seedTestData(testClient);
    clearRateLimitStore();
  });

  // ============= GET /api/users/me =============

  describe("GET /api/users/me", () => {
    it("should return current user profile", async () => {
      const response = await request(app)
        .get("/api/users/me")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testUser1.id);
      expect(response.body.name).toBe(testUser1.name);
      expect(response.body.email).toBe(testUser1.email);
      expect(response.body.department).toBe(testUser1.department);
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get("/api/users/me");

      expect(response.status).toBe(401);
    });

    it("should return 401 for non-existent user", async () => {
      const response = await request(app)
        .get("/api/users/me")
        .set(authHeaders("non-existent-user"));

      expect(response.status).toBe(401);
    });
  });

  // ============= PATCH /api/users/me =============

  describe("PATCH /api/users/me", () => {
    it("should update user name", async () => {
      const response = await request(app)
        .patch("/api/users/me")
        .set(authHeaders(testUser1.id))
        .send({ name: "Alice Updated" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Alice Updated");
    });

    it("should update user avatar URL", async () => {
      const response = await request(app)
        .patch("/api/users/me")
        .set(authHeaders(testUser1.id))
        .send({ avatarUrl: "https://example.com/avatar.png" });

      expect(response.status).toBe(200);
      expect(response.body.avatarUrl).toBe("https://example.com/avatar.png");
    });

    it("should update notification preferences", async () => {
      const response = await request(app)
        .patch("/api/users/me")
        .set(authHeaders(testUser1.id))
        .send({ notificationPrefs: { urgentPush: false, digestTime: "09:00" } });

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs.urgentPush).toBe(false);
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .patch("/api/users/me")
        .send({ name: "New Name" });

      expect(response.status).toBe(401);
    });
  });

  // ============= GET /api/users/me/notifications =============

  describe("GET /api/users/me/notifications", () => {
    it("should return notification settings", async () => {
      const response = await request(app)
        .get("/api/users/me/notifications")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs).toBeDefined();
      expect(response.body.ntfyTopic).toBeDefined();
      expect(response.body.ntfyUrl).toBeDefined();
      expect(response.body.subscribeInstructions).toBeDefined();
    });

    it("should include default prefs if none set", async () => {
      // Create user without notification prefs
      const noPrefsUserId = "no-prefs-user";
      await testClient.execute({
        sql: `INSERT INTO users (id, name, email, department, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [noPrefsUserId, "NoPrefs", "noprefs@example.com", "Engineering", Date.now(), Date.now()],
      });

      // Generate JWT for this ad-hoc user
      const { accessToken } = await generateTokens({ id: noPrefsUserId, email: "noprefs@example.com", name: "NoPrefs" });
      tokenCache.set(noPrefsUserId, accessToken);

      const response = await request(app)
        .get("/api/users/me/notifications")
        .set(authHeaders(noPrefsUserId));

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs.urgentPush).toBe(true);
    });
  });

  // ============= PATCH /api/users/me/notifications =============

  describe("PATCH /api/users/me/notifications", () => {
    it("should update urgentPush setting", async () => {
      const response = await request(app)
        .patch("/api/users/me/notifications")
        .set(authHeaders(testUser1.id))
        .send({ urgentPush: false });

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs.urgentPush).toBe(false);
    });

    it("should update digestTime setting", async () => {
      const response = await request(app)
        .patch("/api/users/me/notifications")
        .set(authHeaders(testUser1.id))
        .send({ digestTime: "18:00" });

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs.digestTime).toBe("18:00");
    });

    it("should preserve existing settings when updating one", async () => {
      // First set both
      await request(app)
        .patch("/api/users/me/notifications")
        .set(authHeaders(testUser1.id))
        .send({ urgentPush: true, digestTime: "09:00" });

      // Then update only digestTime
      const response = await request(app)
        .patch("/api/users/me/notifications")
        .set(authHeaders(testUser1.id))
        .send({ digestTime: "10:00" });

      expect(response.status).toBe(200);
      expect(response.body.notificationPrefs.urgentPush).toBe(true);
      expect(response.body.notificationPrefs.digestTime).toBe("10:00");
    });
  });

  // ============= GET /api/users/:id =============

  describe("GET /api/users/:id", () => {
    it("should return user by ID", async () => {
      const response = await request(app)
        .get(`/api/users/${testUser2.id}`)
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testUser2.id);
      expect(response.body.name).toBe(testUser2.name);
    });

    it("should return 404 for non-existent user", async () => {
      const response = await request(app)
        .get("/api/users/99999999-9999-9999-9999-999999999999")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid UUID", async () => {
      const response = await request(app)
        .get("/api/users/invalid-id")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(400);
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app).get(`/api/users/${testUser2.id}`);

      expect(response.status).toBe(401);
    });
  });

  // ============= POST /api/users =============

  describe("POST /api/users", () => {
    it("should create a new user", async () => {
      const newUser = {
        name: "Charlie",
        email: "charlie@example.com",
        department: "Design",
      };

      const response = await request(app)
        .post("/api/users")
        .set(authHeaders(testUser1.id))
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(newUser.name);
      expect(response.body.email).toBe(newUser.email);
      expect(response.body.department).toBe(newUser.department);
      expect(response.body.id).toBeDefined();
    });

    it("should create user with roles and skills", async () => {
      const newUser = {
        name: "David",
        email: "david@example.com",
        department: "Engineering",
        roles: ["developer", "tech_lead"],
        skills: ["golang", "kubernetes"],
      };

      const response = await request(app)
        .post("/api/users")
        .set(authHeaders(testUser1.id))
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body.roles).toEqual(newUser.roles);
      expect(response.body.skills).toEqual(newUser.skills);
    });

    it("should reject missing required fields", async () => {
      const response = await request(app)
        .post("/api/users")
        .set(authHeaders(testUser1.id))
        .send({ name: "Incomplete" });

      expect(response.status).toBe(400);
    });
  });

  // ============= GET /api/users/teams/:id =============

  describe("GET /api/users/teams/:id", () => {
    it("should return team by ID", async () => {
      const response = await request(app)
        .get(`/api/users/teams/${testTeam.id}`)
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testTeam.id);
      expect(response.body.name).toBe(testTeam.name);
    });

    it("should return 404 for non-existent team", async () => {
      const response = await request(app)
        .get("/api/users/teams/99999999-9999-9999-9999-999999999999")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid UUID", async () => {
      const response = await request(app)
        .get("/api/users/teams/invalid-id")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(400);
    });
  });

  // ============= GET /api/users/teams/:id/members =============

  describe("GET /api/users/teams/:id/members", () => {
    it("should return team members", async () => {
      const response = await request(app)
        .get(`/api/users/teams/${testTeam.id}/members`)
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body.map((u: { id: string }) => u.id)).toContain(testUser1.id);
      expect(response.body.map((u: { id: string }) => u.id)).toContain(testUser2.id);
    });

    it("should return 404 for non-existent team", async () => {
      const response = await request(app)
        .get("/api/users/teams/99999999-9999-9999-9999-999999999999/members")
        .set(authHeaders(testUser1.id));

      expect(response.status).toBe(404);
    });
  });

  // ============= POST /api/users/teams =============

  describe("POST /api/users/teams", () => {
    it("should create a new team", async () => {
      const newTeam = {
        name: "Design Team",
      };

      const response = await request(app)
        .post("/api/users/teams")
        .set(authHeaders(testUser1.id))
        .send(newTeam);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(newTeam.name);
      expect(response.body.id).toBeDefined();
    });

    it("should create team with members and leads", async () => {
      const newTeam = {
        name: "Product Team",
        members: [testUser2.id],
        leads: [testUser2.id],
      };

      const response = await request(app)
        .post("/api/users/teams")
        .set(authHeaders(testUser1.id))
        .send(newTeam);

      expect(response.status).toBe(201);
      // API always includes the creator as a member + lead, and ensures all leads are members.
      const expectedMembers = Array.from(new Set([...newTeam.members, ...newTeam.leads, testUser1.id])).sort();
      const expectedLeads = Array.from(new Set([...newTeam.leads, testUser1.id])).sort();
      expect((response.body.members as string[]).sort()).toEqual(expectedMembers);
      expect((response.body.leads as string[]).sort()).toEqual(expectedLeads);
    });

    it("should reject invalid member UUIDs", async () => {
      const response = await request(app)
        .post("/api/users/teams")
        .set(authHeaders(testUser1.id))
        .send({
          name: "Invalid Team",
          members: ["not-a-uuid"],
        });

      expect(response.status).toBe(400);
    });

    it("should reject missing team name", async () => {
      const response = await request(app)
        .post("/api/users/teams")
        .set(authHeaders(testUser1.id))
        .send({});

      expect(response.status).toBe(400);
    });
  });
});
