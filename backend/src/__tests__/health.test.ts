/**
 * Integration tests for Health Check API (Phase 4C)
 *
 * Tests:
 * - GET /health/live - Liveness probe
 * - GET /health/ready - Readiness probe with database check
 * - GET /health - Full health check
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

/**
 * Create test database tables
 */
async function createTables(client: Client) {
  await client.executeMultiple(`
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
  `);
}

/**
 * Create test Express app
 */
async function createTestApp(): Promise<Express> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Import routes
  const { healthRoutes } = await import("../routes/health.js");
  app.use("/health", healthRoutes);

  return app;
}

// ============= Test Suite =============

describe("Health Check API", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);
    app = await createTestApp();
  });

  afterAll(async () => {
    testClient.close();
  });

  // ============= Liveness Tests =============

  describe("GET /health/live", () => {
    it("should return healthy status", async () => {
      const response = await request(app).get("/health/live");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("healthy");
      expect(response.body.timestamp).toBeDefined();
    });

    it("should return valid ISO timestamp", async () => {
      const response = await request(app).get("/health/live");

      expect(response.status).toBe(200);
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it("should respond quickly (under 100ms)", async () => {
      const start = Date.now();
      await request(app).get("/health/live");
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  // ============= Readiness Tests =============

  describe("GET /health/ready", () => {
    it("should return healthy status with database check", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("healthy");
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should include database health check", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.database).toBeDefined();
      expect(response.body.checks.database.status).toBe("healthy");
      expect(response.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should report database latency", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      const latency = response.body.checks.database.latencyMs;
      expect(typeof latency).toBe("number");
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(latency).toBeLessThan(1000); // Should be fast for in-memory DB
    });

    it("should report uptime in seconds", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(typeof response.body.uptime).toBe("number");
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should include version information", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.status).toBe(200);
      expect(response.body.version).toBeDefined();
      expect(typeof response.body.version).toBe("string");
    });
  });

  // ============= Root Health Check Tests =============

  describe("GET /health", () => {
    it("should return same response as /health/ready", async () => {
      const rootResponse = await request(app).get("/health");
      const readyResponse = await request(app).get("/health/ready");

      // Both should be healthy
      expect(rootResponse.status).toBe(200);
      expect(readyResponse.status).toBe(200);

      // Both should have same structure
      expect(rootResponse.body.status).toBe(readyResponse.body.status);
      expect(rootResponse.body.checks).toBeDefined();
      expect(rootResponse.body.checks.database).toBeDefined();
    });
  });

  // ============= Response Format Tests =============

  describe("Response Format", () => {
    it("should return JSON content type", async () => {
      const response = await request(app).get("/health/live");

      expect(response.headers["content-type"]).toMatch(/application\/json/);
    });

    it("should have consistent response structure for /live", async () => {
      const response = await request(app).get("/health/live");

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should have consistent response structure for /ready", async () => {
      const response = await request(app).get("/health/ready");

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("uptime");
      expect(response.body).toHaveProperty("checks");
    });
  });
});
