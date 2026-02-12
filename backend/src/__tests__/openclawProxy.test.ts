/**
 * Integration tests for OpenClaw Proxy Routes
 *
 * Tests:
 * - POST /api/openclaw/chat/completions - Authenticated proxy to OpenClaw Gateway
 * - Authentication requirements
 * - Rate limiting
 * - Streaming responses
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
let testUserId: string;
let testAccessToken: string;

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
  await client.execute("DELETE FROM user_roles;");
  await client.execute("DELETE FROM user_skills;");
  await client.execute("DELETE FROM user_teams;");
  await client.execute("DELETE FROM users;");
}

/**
 * Create test user
 */
async function createTestUser(client: Client): Promise<string> {
  const userId = randomUUID();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [userId, "Test User", "test@example.com", "Engineering", Date.now(), Date.now()],
  });
  return userId;
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
  const { openclawProxyRoutes } = await import("../routes/openclawProxy.js");
  app.use("/api/openclaw", openclawProxyRoutes);

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

describe("OpenClaw Proxy Routes", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);
    app = await createTestApp();

    // Create test user and generate JWT
    testUserId = await createTestUser(testClient);
    const tokens = await generateTokens({
      id: testUserId,
      email: "test@example.com",
      name: "Test User",
    });
    testAccessToken = tokens.accessToken;
  });

  afterAll(async () => {
    testClient.close();
  });

  beforeEach(async () => {
    clearRateLimitStore();
  });

  // ============= Authentication Tests =============

  describe("POST /api/openclaw/chat/completions - Authentication", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", "Bearer invalid.token.here")
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toMatch(/INVALID_TOKEN|AUTH_ERROR/);
    });

    it("should reject missing Bearer prefix", async () => {
      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", testAccessToken)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });
  });

  // ============= Configuration Tests =============

  describe("POST /api/openclaw/chat/completions - Configuration", () => {
    it("should return 503 when OPENCLAW_TOKEN is not configured", async () => {
      // Temporarily remove OPENCLAW_TOKEN
      const originalToken = process.env.OPENCLAW_TOKEN;
      delete process.env.OPENCLAW_TOKEN;

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("OPENCLAW_UNAVAILABLE");
      expect(response.body.error.message).toContain("not configured");

      // Restore token
      if (originalToken) {
        process.env.OPENCLAW_TOKEN = originalToken;
      }
    });
  });

  // ============= Input Guardrail Tests =============

  describe("POST /api/openclaw/chat/completions - Input Guardrails", () => {
    it("rejects model not in allowlist before hitting Gateway", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";
      process.env.OPENCLAW_MODEL_ALLOWLIST = "claude-3-5-sonnet-20241022";

      const originalFetch = global.fetch;
      const fetchSpy = vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: async () => ({ choices: [{ message: { content: "test" } }] }),
        } as Response)
      );
      global.fetch = fetchSpy;

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "invalid-model",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_MODEL");
      expect(fetchSpy).not.toHaveBeenCalled();

      delete process.env.OPENCLAW_MODEL_ALLOWLIST;
      global.fetch = originalFetch;
    });

    it("rejects oversized prompt payloads", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";
      process.env.OPENCLAW_MAX_PROMPT_CHARS = "20";

      const originalFetch = global.fetch;
      const fetchSpy = vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: async () => ({ choices: [{ message: { content: "test" } }] }),
        } as Response)
      );
      global.fetch = fetchSpy;

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "This message is definitely longer than twenty chars" }],
        });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
      expect(fetchSpy).not.toHaveBeenCalled();

      delete process.env.OPENCLAW_MAX_PROMPT_CHARS;
      global.fetch = originalFetch;
    });

    it("rejects malformed request bodies", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: "not-an-array",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ============= Rate Limiting Tests =============

  describe("POST /api/openclaw/chat/completions - Rate Limiting", () => {
    it("should enforce AI rate limit (5 requests per minute)", async () => {
      // Set up mock token
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      // Mock fetch to avoid actual network calls
      const originalFetch = global.fetch;
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: async () => ({ choices: [{ message: { content: "test" } }] }),
        } as Response)
      );

      // Make 5 requests (should all succeed)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post("/api/openclaw/chat/completions")
          .set("Authorization", `Bearer ${testAccessToken}`)
          .send({
            model: "claude-3-5-sonnet-20241022",
            messages: [{ role: "user", content: `Request ${i}` }],
          });

        expect(response.status).toBe(200);
      }

      // 6th request should be rate limited
      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Request 6" }],
        });

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(response.headers["x-ratelimit-limit"]).toBe("5");
      expect(response.headers["retry-after"]).toBeDefined();

      // Restore
      global.fetch = originalFetch;
    });

    it("should include rate limit headers in response", async () => {
      // Set up mock
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      const originalFetch = global.fetch;
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: async () => ({ choices: [{ message: { content: "test" } }] }),
        } as Response)
      );

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.headers["x-ratelimit-limit"]).toBe("5");
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();

      // Restore
      global.fetch = originalFetch;
    });
  });

  // ============= Proxy Functionality Tests =============

  describe("POST /api/openclaw/chat/completions - Proxy Functionality", () => {
    it("should proxy request to OpenClaw Gateway with server token", async () => {
      process.env.OPENCLAW_TOKEN = "server-secret-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      let capturedRequest: { headers: Record<string, string>; body: string } | null = null;

      const originalFetch = global.fetch;
      global.fetch = vi.fn((url, options) => {
        capturedRequest = {
          headers: (options?.headers || {}) as Record<string, string>,
          body: options?.body as string,
        };
        return Promise.resolve({
          status: 200,
          json: async () => ({ choices: [{ message: { content: "test response" } }] }),
        } as Response);
      });

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Test message" }],
        });

      expect(response.status).toBe(200);
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.headers["Authorization"]).toBe("Bearer server-secret-token");
      expect(capturedRequest!.headers["X-OpenClaw-User-Id"]).toBe(testUserId);
      expect(capturedRequest!.headers["X-OpenClaw-Agent-Id"]).toMatch(/^mypa-user-/);
      expect(capturedRequest!.headers["X-OpenClaw-Session-Key"]).toMatch(/^sess-/);

      const payload = JSON.parse(capturedRequest!.body);
      expect(payload.user).toBe(testUserId);
      expect(payload.agentId).toBe(capturedRequest!.headers["X-OpenClaw-Agent-Id"]);
      expect(payload.sessionId).toBe(capturedRequest!.headers["X-OpenClaw-Session-Key"]);

      // Restore
      global.fetch = originalFetch;
    });

    it("should proxy non-streaming response correctly", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      const mockResponse = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: Date.now(),
        model: "claude-3-5-sonnet-20241022",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello! How can I help?" },
            finish_reason: "stop",
          },
        ],
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: async () => mockResponse,
        } as Response)
      );

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);

      // Restore
      global.fetch = originalFetch;
    });

    it("should handle Gateway error correctly", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      const originalFetch = global.fetch;
      global.fetch = vi.fn(() => Promise.reject(new Error("Network error")));

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe("GATEWAY_ERROR");
      expect(response.body.error.message).toContain("Failed to reach");

      // Restore
      global.fetch = originalFetch;
    });

    it("should proxy Gateway error status codes", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      const originalFetch = global.fetch;
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 400,
          json: async () => ({ error: { message: "Invalid request" } }),
        } as Response)
      );

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "invalid-model",
          messages: [{ role: "user", content: "Hello" }],
        });

      expect(response.status).toBe(400);

      // Restore
      global.fetch = originalFetch;
    });
  });

  // ============= Streaming Response Tests =============

  describe("POST /api/openclaw/chat/completions - Streaming", () => {
    it("should handle streaming responses", async () => {
      process.env.OPENCLAW_TOKEN = "mock-token";
      process.env.OPENCLAW_URL = "http://mock-openclaw";

      // Create a mock ReadableStream
      const encoder = new TextEncoder();
      const chunks = [
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
        "data: [DONE]\n\n",
      ];

      let chunkIndex = 0;
      const mockStream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        },
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          body: mockStream,
        } as Response)
      );

      const response = await request(app)
        .post("/api/openclaw/chat/completions")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          model: "claude-3-5-sonnet-20241022",
          messages: [{ role: "user", content: "Hello" }],
          stream: true,
        });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["connection"]).toBe("keep-alive");

      // Restore
      global.fetch = originalFetch;
    });
  });
});
