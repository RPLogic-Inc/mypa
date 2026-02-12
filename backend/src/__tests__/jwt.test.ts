/**
 * Unit tests for JWT Service (Phase 5)
 *
 * Tests:
 * - Token generation
 * - Token verification
 * - Password hashing and verification
 * - Token refresh
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import {
  generateTokens,
  verifyToken,
  hashPassword,
  verifyPassword,
} from "../services/jwt.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;

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

// ============= Test Suite =============

describe("JWT Service", () => {
  beforeAll(async () => {
    testClient = createClient({ url: "file::memory:?cache=shared" });
    testDb = drizzle(testClient, { schema });
    await createTables(testClient);
  });

  afterAll(async () => {
    testClient.close();
  });

  // ============= Token Generation Tests =============

  describe("generateTokens", () => {
    it("should generate access and refresh tokens", async () => {
      const user = {
        id: "test-user-1",
        email: "test@example.com",
        name: "Test User",
      };
      const tokens = await generateTokens(user);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(15 * 60); // 15 minutes in seconds
      expect(typeof tokens.accessToken).toBe("string");
      expect(typeof tokens.refreshToken).toBe("string");
    });

    it("should generate different tokens for different users", async () => {
      const user1 = { id: "user-1", email: "user1@example.com", name: "User 1" };
      const user2 = { id: "user-2", email: "user2@example.com", name: "User 2" };

      const tokens1 = await generateTokens(user1);
      const tokens2 = await generateTokens(user2);

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });

    it("should generate tokens with JWT format", async () => {
      const user = { id: "test-user", email: "test@example.com", name: "Test" };
      const tokens = await generateTokens(user);

      // JWT format: header.payload.signature
      expect(tokens.accessToken.split(".").length).toBe(3);
      expect(tokens.refreshToken.split(".").length).toBe(3);
    });
  });

  // ============= Token Verification Tests =============

  describe("verifyToken", () => {
    it("should verify a valid access token", async () => {
      const user = {
        id: "verify-test-user",
        email: "verify@example.com",
        name: "Verify User",
      };
      const tokens = await generateTokens(user);

      const payload = await verifyToken(tokens.accessToken);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(user.id);
      expect(payload?.email).toBe(user.email);
      expect(payload?.name).toBe(user.name);
      expect(payload?.type).toBe("access");
    });

    it("should verify a valid refresh token", async () => {
      const user = {
        id: "refresh-test-user",
        email: "refresh@example.com",
        name: "Refresh User",
      };
      const tokens = await generateTokens(user);

      const payload = await verifyToken(tokens.refreshToken);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(user.id);
      expect(payload?.type).toBe("refresh");
    });

    it("should return null for invalid token", async () => {
      const payload = await verifyToken("invalid.token.here");

      expect(payload).toBeNull();
    });

    it("should return null for tampered token", async () => {
      const user = { id: "tamper-user", email: "tamper@example.com", name: "Tamper" };
      const tokens = await generateTokens(user);

      // Tamper with the signature
      const parts = tokens.accessToken.split(".");
      parts[2] = parts[2].slice(0, -5) + "XXXXX";
      const tamperedToken = parts.join(".");

      const payload = await verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });

    it("should return null for empty string", async () => {
      const payload = await verifyToken("");

      expect(payload).toBeNull();
    });
  });

  // ============= Password Hashing Tests =============

  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "securePassword123";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(password.length);
    });

    it("should generate different hashes for same password", async () => {
      const password = "samePassword";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // bcrypt generates unique salts, so hashes should differ
      expect(hash1).not.toBe(hash2);
    });

    it("should generate bcrypt format hash", async () => {
      const password = "testPassword";
      const hash = await hashPassword(password);

      // bcrypt hashes start with $2a$ or $2b$
      expect(hash).toMatch(/^\$2[ab]\$/);
    });
  });

  describe("verifyPassword", () => {
    it("should verify correct password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "correctPassword";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword("wrongPassword", hash);

      expect(isValid).toBe(false);
    });

    it("should handle special characters in password", async () => {
      const password = "p@ssw0rd!#$%^&*()";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should handle unicode characters in password", async () => {
      const password = "密码测试🔐";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should be case sensitive", async () => {
      const password = "CaseSensitive";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword("casesensitive", hash);

      expect(isValid).toBe(false);
    });
  });

  // ============= Token Type Tests =============

  describe("Token Types", () => {
    it("should correctly identify access token type", async () => {
      const user = { id: "type-user", email: "type@example.com", name: "Type" };
      const tokens = await generateTokens(user);

      const accessPayload = await verifyToken(tokens.accessToken);
      const refreshPayload = await verifyToken(tokens.refreshToken);

      expect(accessPayload?.type).toBe("access");
      expect(refreshPayload?.type).toBe("refresh");
    });
  });
});
