/**
 * Integration tests for Auth Routes (Phase 5)
 *
 * Tests:
 * - POST /api/auth/register - User registration
 * - POST /api/auth/login - User login
 * - POST /api/auth/refresh - Token refresh
 * - GET /api/auth/verify - Token verification
 * - POST /api/auth/logout - User logout
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

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

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
      team_id TEXT,
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
 * Clear test data
 */
async function clearTestData(client: Client) {
  await client.execute("DELETE FROM refresh_tokens;");
  await client.execute("DELETE FROM user_roles;");
  await client.execute("DELETE FROM user_skills;");
  await client.execute("DELETE FROM user_teams;");
  await client.execute("DELETE FROM users;");
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
  const { authRoutes } = await import("../routes/auth.js");
  app.use("/api/auth", authRoutes);

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

describe("Auth Routes", () => {
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
    await clearTestData(testClient);
    clearRateLimitStore();
  });

  // ============= Registration Tests =============

  describe("POST /api/auth/register", () => {
    it("should register a new user", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "newuser@example.com",
          password: "securePassword123",
          name: "New User",
          department: "Engineering",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe("newuser@example.com");
      expect(response.body.data.user.name).toBe("New User");
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();
    });

    it("should normalize email to lowercase", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "UPPERCASE@EXAMPLE.COM",
          password: "securePassword123",
          name: "Uppercase User",
          department: "Engineering",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.email).toBe("uppercase@example.com");
    });

    it("should reject duplicate email", async () => {
      // First registration
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "duplicate@example.com",
          password: "password123",
          name: "First User",
          department: "Engineering",
        });

      // Second registration with same email
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "duplicate@example.com",
          password: "password456",
          name: "Second User",
          department: "Engineering",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("USER_EXISTS");
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "not-an-email",
          password: "password123",
          name: "Invalid Email User",
          department: "Engineering",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject short password", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "shortpw@example.com",
          password: "short",
          name: "Short Password User",
          department: "Engineering",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "incomplete@example.com",
          password: "password123",
          // missing name and department
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ============= Login Tests =============

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Create a test user
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "logintest@example.com",
          password: "testPassword123",
          name: "Login Test User",
          department: "Engineering",
        });
    });

    it("should login with correct credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "logintest@example.com",
          password: "testPassword123",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe("logintest@example.com");
      expect(response.body.data.tokens).toBeDefined();
      expect(response.body.data.tokens.accessToken).toBeDefined();
      expect(response.body.data.tokens.refreshToken).toBeDefined();
    });

    it("should reject incorrect password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "logintest@example.com",
          password: "wrongPassword",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("should reject non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "anyPassword",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("should be case insensitive for email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "LOGINTEST@EXAMPLE.COM",
          password: "testPassword123",
        });

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe("logintest@example.com");
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "not-valid-email",
          password: "password123",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ============= Token Refresh Tests =============

  describe("POST /api/auth/refresh", () => {
    let validRefreshToken: string;

    beforeEach(async () => {
      // Register and get tokens
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "refreshtest@example.com",
          password: "testPassword123",
          name: "Refresh Test User",
          department: "Engineering",
        });

      validRefreshToken = response.body.data.tokens.refreshToken;
    });

    it("should refresh tokens with valid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: validRefreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it("should reject invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: "invalid.refresh.token" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });

    it("should reject missing refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject access token used as refresh token", async () => {
      // Get access token
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "refreshtest@example.com",
          password: "testPassword123",
        });

      const accessToken = loginResponse.body.data.tokens.accessToken;

      // Try to use access token as refresh token
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: accessToken });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });
  });

  // ============= Token Verification Tests =============

  describe("GET /api/auth/verify", () => {
    let validAccessToken: string;

    beforeEach(async () => {
      // Register and get tokens
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "verifytest@example.com",
          password: "testPassword123",
          name: "Verify Test User",
          department: "Engineering",
        });

      validAccessToken = response.body.data.tokens.accessToken;
    });

    it("should verify valid access token", async () => {
      const response = await request(app)
        .get("/api/auth/verify")
        .set("Authorization", `Bearer ${validAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe("verifytest@example.com");
    });

    it("should reject missing token", async () => {
      const response = await request(app).get("/api/auth/verify");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("NO_TOKEN");
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/verify")
        .set("Authorization", "Bearer invalid.token.here");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN");
    });

    it("should reject refresh token", async () => {
      // Get refresh token
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "verifytest@example.com",
          password: "testPassword123",
        });

      const refreshToken = loginResponse.body.data.tokens.refreshToken;

      const response = await request(app)
        .get("/api/auth/verify")
        .set("Authorization", `Bearer ${refreshToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_TOKEN_TYPE");
    });

    it("should reject malformed Authorization header", async () => {
      const response = await request(app)
        .get("/api/auth/verify")
        .set("Authorization", "NotBearer token");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("NO_TOKEN");
    });
  });

  // ============= Logout Tests =============

  describe("POST /api/auth/logout", () => {
    it("should return success on logout", async () => {
      const response = await request(app).post("/api/auth/logout");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
