/**
 * Integration tests for Audio Routes
 *
 * Tests:
 * - POST /api/audio/upload - Audio file upload
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
import { existsSync, mkdirSync, rmSync } from "fs";
import { generateTokens } from "../services/jwt.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

const testUser = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test User",
  email: "test@example.com",
  department: "Engineering",
};

let testUserToken: string;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${testUserToken}`,
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
      team_id TEXT,
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
 * Seed test data
 */
async function seedTestData(client: Client) {
  await client.execute("DELETE FROM user_teams;");
  await client.execute("DELETE FROM users;");
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser.id, testUser.name, testUser.email, testUser.department, '[]', '[]', now, now],
  });
}

/**
 * Create test Express app
 */
async function createTestApp(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // Request ID middleware
  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Import routes
  const { audioRoutes } = await import("../routes/audio.js");
  app.use("/api/audio", audioRoutes);

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

describe("Audio Routes", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);

    // Generate JWT token for test user
    const { accessToken } = await generateTokens({ id: testUser.id, email: testUser.email, name: testUser.name });
    testUserToken = accessToken;

    app = await createTestApp();

    // Ensure test directories exist
    if (!existsSync("./temp")) mkdirSync("./temp", { recursive: true });
    if (!existsSync("./uploads")) mkdirSync("./uploads", { recursive: true });
  });

  afterAll(async () => {
    testClient.close();
    // Clean up test directories
    try {
      rmSync("./uploads", { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    await seedTestData(testClient);
    clearRateLimitStore();
  });

  // ============= POST /api/audio/upload =============

  describe("POST /api/audio/upload", () => {
    const minimalAudioData = Buffer.from("test audio content").toString("base64");

    it("should upload audio and return file info", async () => {
      const response = await request(app)
        .post("/api/audio/upload")
        .set(authHeaders())
        .send({
          audioData: minimalAudioData,
          mimeType: "audio/webm",
        });

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.url).toBeDefined();
      expect(response.body.filename).toBeDefined();
      expect(response.body.size).toBeGreaterThan(0);
    });

    it("should create .webm file for webm mimeType", async () => {
      const response = await request(app)
        .post("/api/audio/upload")
        .set(authHeaders())
        .send({
          audioData: minimalAudioData,
          mimeType: "audio/webm",
        });

      expect(response.status).toBe(200);
      expect(response.body.filename).toMatch(/\.webm$/);
    });

    it("should create .mp3 file for other mimeTypes", async () => {
      const response = await request(app)
        .post("/api/audio/upload")
        .set(authHeaders())
        .send({
          audioData: minimalAudioData,
          mimeType: "audio/mpeg",
        });

      expect(response.status).toBe(200);
      expect(response.body.filename).toMatch(/\.mp3$/);
    });

    it("should return 401 without authentication", async () => {
      const response = await request(app)
        .post("/api/audio/upload")
        .send({
          audioData: minimalAudioData,
          mimeType: "audio/webm",
        });

      expect(response.status).toBe(401);
    });

    it("should return 400 when audioData is missing", async () => {
      const response = await request(app)
        .post("/api/audio/upload")
        .set(authHeaders())
        .send({
          mimeType: "audio/webm",
        });

      expect(response.status).toBe(400);
    });

    it("should return correct file size", async () => {
      const testData = "test audio data for size check";
      const audioData = Buffer.from(testData).toString("base64");

      const response = await request(app)
        .post("/api/audio/upload")
        .set(authHeaders())
        .send({
          audioData,
          mimeType: "audio/webm",
        });

      expect(response.status).toBe(200);
      expect(response.body.size).toBe(testData.length);
    });
  });
});
