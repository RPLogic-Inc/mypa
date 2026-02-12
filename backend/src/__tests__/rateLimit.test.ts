/**
 * Integration tests for Rate Limiting (Phase 4B)
 *
 * Tests:
 * - Standard rate limiting (100/min)
 * - Strict rate limiting (10/min)
 * - AI rate limiting (5/min)
 * - Auth rate limiting (5/min per IP)
 * - Rate limit headers
 * - Rate limit reset
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { randomUUID } from "crypto";
import {
  rateLimit,
  standardRateLimit,
  strictRateLimit,
  aiRateLimit,
  authRateLimit,
  clearRateLimitStore,
} from "../middleware/rateLimit.js";

// ============= Test Setup =============

/**
 * Create test app with specific rate limiter
 */
function createTestApp(middleware: ReturnType<typeof rateLimit>): Express {
  const app = express();

  app.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  app.use(middleware);

  app.get("/test", (_req, res) => {
    res.json({ success: true });
  });

  app.post("/test", (_req, res) => {
    res.json({ success: true });
  });

  return app;
}

// ============= Test Suite =============

describe("Rate Limiting", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  afterEach(() => {
    clearRateLimitStore();
  });

  // ============= Custom Rate Limiter Tests =============

  describe("Custom Rate Limiter", () => {
    it("should allow requests under the limit", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 5,
      });
      const app = createTestApp(limiter);

      // Make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get("/test")
          .set("x-user-id", "test-user");

        expect(response.status).toBe(200);
      }
    });

    it("should block requests over the limit", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 3,
      });
      const app = createTestApp(limiter);

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        await request(app).get("/test").set("x-user-id", "test-user");
      }

      // 4th request should be blocked
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should include rate limit headers", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 10,
      });
      const app = createTestApp(limiter);

      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBe("10");
      expect(response.headers["x-ratelimit-remaining"]).toBe("9");
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
    });

    it("should decrement remaining count with each request", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 5,
      });
      const app = createTestApp(limiter);

      const response1 = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(response1.headers["x-ratelimit-remaining"]).toBe("4");

      const response2 = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(response2.headers["x-ratelimit-remaining"]).toBe("3");

      const response3 = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(response3.headers["x-ratelimit-remaining"]).toBe("2");
    });

    it("should include Retry-After header when blocked", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
      });
      const app = createTestApp(limiter);

      // First request succeeds
      await request(app).get("/test").set("x-user-id", "test-user");

      // Second request is blocked
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.headers["retry-after"]).toBeDefined();
      const retryAfter = parseInt(response.headers["retry-after"], 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it("should track different users separately", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 2,
        keyGenerator: (req) => `user:${req.headers["x-test-user"] || "anonymous"}`,
      });
      const app = createTestApp(limiter);

      // User 1 makes 2 requests
      await request(app).get("/test").set("x-test-user", "user-1");
      await request(app).get("/test").set("x-test-user", "user-1");

      // User 1 is now at limit
      const user1Blocked = await request(app)
        .get("/test")
        .set("x-test-user", "user-1");
      expect(user1Blocked.status).toBe(429);

      // User 2 should still be allowed
      const user2Response = await request(app)
        .get("/test")
        .set("x-test-user", "user-2");
      expect(user2Response.status).toBe(200);
    });

    it("should use custom key generator", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 2,
        keyGenerator: (req) => `custom:${req.headers["x-custom-key"]}`,
      });
      const app = createTestApp(limiter);

      // Use same custom key
      await request(app).get("/test").set("x-custom-key", "key-1");
      await request(app).get("/test").set("x-custom-key", "key-1");

      // Third request with same key should be blocked
      const response = await request(app)
        .get("/test")
        .set("x-custom-key", "key-1");
      expect(response.status).toBe(429);

      // Different key should be allowed
      const differentKey = await request(app)
        .get("/test")
        .set("x-custom-key", "key-2");
      expect(differentKey.status).toBe(200);
    });

    it("should skip rate limiting when skipFn returns true", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
        skipFn: (req) => req.headers["x-skip-rate-limit"] === "true",
      });
      const app = createTestApp(limiter);

      // Normal request counts toward limit
      await request(app).get("/test").set("x-user-id", "test-user");

      // Second normal request is blocked
      const blocked = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(blocked.status).toBe(429);

      // Skipped request should pass
      const skipped = await request(app)
        .get("/test")
        .set("x-user-id", "test-user")
        .set("x-skip-rate-limit", "true");
      expect(skipped.status).toBe(200);
    });

    it("should use custom error message", async () => {
      const customMessage = "Custom rate limit message";
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
        message: customMessage,
      });
      const app = createTestApp(limiter);

      // First request
      await request(app).get("/test").set("x-user-id", "test-user");

      // Second request shows custom message
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.body.error.message).toBe(customMessage);
    });
  });

  // ============= Pre-configured Rate Limiters Tests =============

  describe("Standard Rate Limit (100/min)", () => {
    it("should have correct limit", async () => {
      const app = createTestApp(standardRateLimit);

      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.headers["x-ratelimit-limit"]).toBe("100");
    });

    it("should allow many requests", async () => {
      const app = createTestApp(standardRateLimit);

      // Make 50 requests (well under limit)
      for (let i = 0; i < 50; i++) {
        const response = await request(app)
          .get("/test")
          .set("x-user-id", "test-user");
        expect(response.status).toBe(200);
      }
    });
  });

  describe("Strict Rate Limit (10/min)", () => {
    it("should have correct limit", async () => {
      const app = createTestApp(strictRateLimit);

      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.headers["x-ratelimit-limit"]).toBe("10");
    });

    it("should block after 10 requests", async () => {
      const app = createTestApp(strictRateLimit);

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await request(app).get("/test").set("x-user-id", "test-user");
      }

      // 11th request should be blocked
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.body.error.message).toContain("rate limited");
    });
  });

  describe("AI Rate Limit (5/min)", () => {
    it("should have correct limit", async () => {
      const app = createTestApp(aiRateLimit);

      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.headers["x-ratelimit-limit"]).toBe("5");
    });

    it("should block after 5 requests", async () => {
      const app = createTestApp(aiRateLimit);

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).get("/test").set("x-user-id", "test-user");
      }

      // 6th request should be blocked
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.body.error.message).toContain("AI");
    });
  });

  describe("Auth Rate Limit (5/min per IP)", () => {
    it("should have correct limit", async () => {
      const app = createTestApp(authRateLimit);

      const response = await request(app).get("/test");

      expect(response.headers["x-ratelimit-limit"]).toBe("5");
    });

    it("should rate limit by IP, not user", async () => {
      const app = createTestApp(authRateLimit);

      // Make 5 requests with different user IDs (same IP)
      for (let i = 0; i < 5; i++) {
        await request(app).get("/test").set("x-user-id", `user-${i}`);
      }

      // 6th request should be blocked regardless of user ID
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "different-user");

      expect(response.status).toBe(429);
    });
  });

  // ============= Rate Limit Store Tests =============

  describe("clearRateLimitStore", () => {
    it("should reset all rate limits", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 2,
      });
      const app = createTestApp(limiter);

      // Use up the limit
      await request(app).get("/test").set("x-user-id", "test-user");
      await request(app).get("/test").set("x-user-id", "test-user");

      // Should be blocked
      const blocked = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(blocked.status).toBe(429);

      // Clear the store
      clearRateLimitStore();

      // Should be allowed again
      const allowed = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");
      expect(allowed.status).toBe(200);
    });
  });

  // ============= Response Format Tests =============

  describe("Response Format", () => {
    it("should return JSON error response when blocked", async () => {
      const limiter = rateLimit({
        windowMs: 60000,
        maxRequests: 1,
      });
      const app = createTestApp(limiter);

      // Use up limit
      await request(app).get("/test").set("x-user-id", "test-user");

      // Get blocked response
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "test-user");

      expect(response.status).toBe(429);
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(response.body.error.message).toBeDefined();
      expect(response.body.error.retryAfter).toBeDefined();
    });
  });
});
