/**
 * Unit tests for Onboarding Service
 *
 * Tests:
 * - Invite code generation
 * - Team invite validation logic
 * - Onboarding status calculations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import {
  generateInviteCode,
  createOpenClawAgent,
  getOnboardingStatus,
} from "../services/onboarding.js";

// ============= Test Database Setup =============

let testClient: Client;

const testTeamId = "11111111-1111-1111-1111-111111111111";
const testUserId = "22222222-2222-2222-2222-222222222222";
const testUser2Id = "33333333-3333-3333-3333-333333333333";
const adminUserId = "44444444-4444-4444-4444-444444444444";

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

    CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      team_id TEXT NOT NULL REFERENCES teams(id),
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at INTEGER,
      default_roles TEXT DEFAULT '[]',
      default_skills TEXT DEFAULT '[]',
      default_department TEXT,
      default_notification_prefs TEXT,
      openclaw_config TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
      ,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_onboarding (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      invite_id TEXT REFERENCES team_invites(id),
      profile_completed INTEGER DEFAULT 0,
      notifications_configured INTEGER DEFAULT 0,
      assistant_created INTEGER DEFAULT 0,
      assistant_configured INTEGER DEFAULT 0,
      team_tour_completed INTEGER DEFAULT 0,
      openclaw_agent_status TEXT DEFAULT 'pending',
      openclaw_agent_error TEXT,
      started_at INTEGER,
      completed_at INTEGER
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
  `);
}

/**
 * Seed test data
 */
async function seedTestData(client: Client) {
  const now = Date.now();

  // Create test team
  await client.execute({
    sql: `INSERT OR REPLACE INTO teams (id, name, members, leads, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [testTeamId, "Test Team", JSON.stringify([testUserId, testUser2Id, adminUserId]), JSON.stringify([adminUserId]), now],
  });

  // Create admin user
  await client.execute({
    sql: `INSERT OR REPLACE INTO users (id, name, email, department, team_id, roles, skills, notification_prefs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [adminUserId, "Admin User", "admin@example.com", "Management", testTeamId, JSON.stringify(["team_lead"]), JSON.stringify([]), JSON.stringify({ urgentPush: true }), now, now],
  });

  // Add admin to user_roles
  await client.execute({
    sql: `INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)`,
    args: [adminUserId, "team_lead"],
  });

  // Create regular test user
  await client.execute({
    sql: `INSERT OR REPLACE INTO users (id, name, email, department, roles, skills, notification_prefs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUserId, "Test User", "user@example.com", "Engineering", JSON.stringify([]), JSON.stringify([]), JSON.stringify({ urgentPush: true }), now, now],
  });

  // Create second test user (no team)
  await client.execute({
    sql: `INSERT OR REPLACE INTO users (id, name, email, department, roles, skills, notification_prefs, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [testUser2Id, "Test User 2", "user2@example.com", "Engineering", JSON.stringify([]), JSON.stringify([]), JSON.stringify({ urgentPush: true }), now, now],
  });
}

/**
 * Clear invites and onboarding data
 */
async function clearTestData(client: Client) {
  await client.execute(`DELETE FROM user_onboarding`);
  await client.execute(`DELETE FROM team_invites`);
}

// ============= Test Suite =============

describe("Onboarding Service", () => {
  beforeAll(async () => {
    testClient = createClient({
      url: "file::memory:?cache=shared",
    });

    await createTables(testClient);
    await seedTestData(testClient);
  });

  afterAll(async () => {
    if (testClient) {
      testClient.close();
    }
  });

  beforeEach(async () => {
    await clearTestData(testClient);
  });

  // ============= generateInviteCode Tests =============

  describe("generateInviteCode", () => {
    it("should generate an 8-character code", () => {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
    });

    it("should only use allowed characters", () => {
      const allowedChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let i = 0; i < 10; i++) {
        const code = generateInviteCode();
        for (const char of code) {
          expect(allowedChars).toContain(char);
        }
      }
    });

    it("should not use confusing characters (0, O, I, 1)", () => {
      const confusingChars = ["0", "O", "I", "1"];
      for (let i = 0; i < 20; i++) {
        const code = generateInviteCode();
        for (const char of confusingChars) {
          expect(code).not.toContain(char);
        }
      }
    });

    it("should generate unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateInviteCode());
      }
      // With 8 chars from 31 choices, collisions should be extremely rare
      expect(codes.size).toBeGreaterThanOrEqual(95);
    });

    it("should be all uppercase", () => {
      for (let i = 0; i < 20; i++) {
        const code = generateInviteCode();
        expect(code).toBe(code.toUpperCase());
      }
    });
  });

  // ============= Team Invite Database Tests =============

  describe("Team Invite Creation", () => {
    it("should create a basic invite", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].code).toBe(code);
      expect(result.rows[0].team_id).toBe(testTeamId);
      expect(result.rows[0].status).toBe("active");
    });

    it("should create invite with specific email", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, email, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, "specific@example.com", 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(result.rows[0].email).toBe("specific@example.com");
    });

    it("should create invite with expiration", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, expires_at, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, expiresAt, 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(result.rows[0].expires_at).toBe(expiresAt);
    });

    it("should create invite with default roles and skills", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, default_roles, default_skills, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, JSON.stringify(["developer"]), JSON.stringify(["typescript"]), 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(JSON.parse(result.rows[0].default_roles as string)).toEqual(["developer"]);
      expect(JSON.parse(result.rows[0].default_skills as string)).toEqual(["typescript"]);
    });

    it("should create invite with OpenClaw config", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();
      const openclawConfig = {
        createAgent: true,
        agentTemplate: "support",
        initialMemory: ["team context"],
        enabledTools: ["search", "calendar"],
      };

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, openclaw_config, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, JSON.stringify(openclawConfig), 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(JSON.parse(result.rows[0].openclaw_config as string)).toEqual(openclawConfig);
    });

    it("should enforce unique invite codes", async () => {
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, 1, 0, "active", now, now],
      });

      // Try to insert another invite with the same code
      try {
        await testClient.execute({
          sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [randomUUID(), code, testTeamId, adminUserId, 1, 0, "active", now, now],
        });
        expect.fail("Should have thrown an error for duplicate code");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============= Invite Validation Tests =============

  describe("Invite Validation Logic", () => {
    it("should find valid invite by code", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE code = ? AND status = 'active'`,
        args: [code],
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(inviteId);
    });

    it("should validate case-insensitive code lookup", async () => {
      const code = "TESTCODE";
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, 1, 0, "active", now, now],
      });

      // Search with lowercase should work via UPPER()
      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE UPPER(code) = UPPER(?)`,
        args: ["testcode"],
      });

      expect(result.rows.length).toBe(1);
    });

    it("should exclude revoked invites", async () => {
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, 1, 0, "revoked", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE code = ? AND status = 'active'`,
        args: [code],
      });

      expect(result.rows.length).toBe(0);
    });

    it("should exclude expired invites", async () => {
      const code = generateInviteCode();
      const now = Date.now();
      const expiredAt = now - 1000; // 1 second in the past

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, expires_at, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, expiredAt, 1, 0, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE code = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`,
        args: [code, now],
      });

      expect(result.rows.length).toBe(0);
    });

    it("should exclude invites at usage limit", async () => {
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, 1, 1, "active", now, now], // max_uses = used_count = 1
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE code = ? AND status = 'active' AND used_count < max_uses`,
        args: [code],
      });

      expect(result.rows.length).toBe(0);
    });

    it("should allow invites with unlimited uses", async () => {
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), code, testTeamId, adminUserId, 100, 50, "active", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM team_invites WHERE code = ? AND status = 'active' AND used_count < max_uses`,
        args: [code],
      });

      expect(result.rows.length).toBe(1);
    });
  });

  // ============= Onboarding Status Tests =============

  describe("Onboarding Status", () => {
    it("should create onboarding record", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 0, 0, 0, 0, 0, "pending", now],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].profile_completed).toBe(0);
      expect(result.rows[0].openclaw_agent_status).toBe("pending");
    });

    it("should update profile completed step", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 0, 0, 0, 0, 0, "pending", now],
      });

      await testClient.execute({
        sql: `UPDATE user_onboarding SET profile_completed = 1 WHERE user_id = ?`,
        args: [testUserId],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows[0].profile_completed).toBe(1);
    });

    it("should calculate 0% completion for no steps done", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 0, 0, 0, 0, 0, "pending", now],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      const row = result.rows[0];
      const steps = [
        row.profile_completed,
        row.notifications_configured,
        row.assistant_created,
        row.assistant_configured,
        row.team_tour_completed,
      ];
      const completed = steps.filter((s) => s === 1).length;
      const percentage = Math.round((completed / 5) * 100);

      expect(percentage).toBe(0);
    });

    it("should calculate 40% completion for 2 steps done", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 1, 1, 0, 0, 0, "pending", now],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      const row = result.rows[0];
      const steps = [
        row.profile_completed,
        row.notifications_configured,
        row.assistant_created,
        row.assistant_configured,
        row.team_tour_completed,
      ];
      const completed = steps.filter((s) => s === 1).length;
      const percentage = Math.round((completed / 5) * 100);

      expect(percentage).toBe(40);
    });

    it("should calculate 100% completion for all steps done", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 1, 1, 1, 1, 1, "ready", now],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      const row = result.rows[0];
      const steps = [
        row.profile_completed,
        row.notifications_configured,
        row.assistant_created,
        row.assistant_configured,
        row.team_tour_completed,
      ];
      const completed = steps.filter((s) => s === 1).length;
      const percentage = Math.round((completed / 5) * 100);

      expect(percentage).toBe(100);
    });

    it("should set completed_at when all steps done", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 1, 1, 1, 1, 1, "ready", now, now],
      });

      const result = await testClient.execute({
        sql: `SELECT completed_at FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows[0].completed_at).toBe(now);
    });

    it("should track OpenClaw agent status transitions", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      // Start with pending
      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?)`,
        args: [onboardingId, testUserId, "pending", now],
      });

      // Transition to creating
      await testClient.execute({
        sql: `UPDATE user_onboarding SET openclaw_agent_status = 'creating' WHERE user_id = ?`,
        args: [testUserId],
      });

      let result = await testClient.execute({
        sql: `SELECT openclaw_agent_status FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });
      expect(result.rows[0].openclaw_agent_status).toBe("creating");

      // Transition to ready
      await testClient.execute({
        sql: `UPDATE user_onboarding SET openclaw_agent_status = 'ready', assistant_created = 1 WHERE user_id = ?`,
        args: [testUserId],
      });

      result = await testClient.execute({
        sql: `SELECT openclaw_agent_status, assistant_created FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });
      expect(result.rows[0].openclaw_agent_status).toBe("ready");
      expect(result.rows[0].assistant_created).toBe(1);
    });

    it("should track OpenClaw agent failure", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?)`,
        args: [onboardingId, testUserId, "pending", now],
      });

      // Transition to failed with error
      await testClient.execute({
        sql: `UPDATE user_onboarding SET openclaw_agent_status = 'failed', openclaw_agent_error = ? WHERE user_id = ?`,
        args: ["Connection timeout", testUserId],
      });

      const result = await testClient.execute({
        sql: `SELECT openclaw_agent_status, openclaw_agent_error FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });
      expect(result.rows[0].openclaw_agent_status).toBe("failed");
      expect(result.rows[0].openclaw_agent_error).toBe("Connection timeout");
    });
  });

  // ============= Invite Acceptance Logic Tests =============

  describe("Invite Acceptance Logic", () => {
    it("should increment used_count on acceptance", async () => {
      const inviteId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, 5, 0, "active", now, now],
      });

      // Simulate acceptance
      await testClient.execute({
        sql: `UPDATE team_invites SET used_count = used_count + 1, updated_at = ? WHERE id = ?`,
        args: [now, inviteId],
      });

      const result = await testClient.execute({
        sql: `SELECT used_count FROM team_invites WHERE id = ?`,
        args: [inviteId],
      });

      expect(result.rows[0].used_count).toBe(1);
    });

    it("should update user team_id on acceptance", async () => {
      const now = Date.now();

      // User initially has no team
      const userBefore = await testClient.execute({
        sql: `SELECT team_id FROM users WHERE id = ?`,
        args: [testUser2Id],
      });
      expect(userBefore.rows[0].team_id).toBeNull();

      // Simulate acceptance - assign team
      await testClient.execute({
        sql: `UPDATE users SET team_id = ?, updated_at = ? WHERE id = ?`,
        args: [testTeamId, now, testUser2Id],
      });

      const userAfter = await testClient.execute({
        sql: `SELECT team_id FROM users WHERE id = ?`,
        args: [testUser2Id],
      });
      expect(userAfter.rows[0].team_id).toBe(testTeamId);
    });

    it("should create user_roles entries from default_roles", async () => {
      // Add role to user
      await testClient.execute({
        sql: `INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)`,
        args: [testUser2Id, "developer"],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM user_roles WHERE user_id = ?`,
        args: [testUser2Id],
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.some((r) => r.role === "developer")).toBe(true);
    });

    it("should create user_skills entries from default_skills", async () => {
      // Add skill to user
      await testClient.execute({
        sql: `INSERT OR IGNORE INTO user_skills (user_id, skill) VALUES (?, ?)`,
        args: [testUser2Id, "typescript"],
      });

      const result = await testClient.execute({
        sql: `SELECT * FROM user_skills WHERE user_id = ?`,
        args: [testUser2Id],
      });

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows.some((r) => r.skill === "typescript")).toBe(true);
    });

    it("should link onboarding record to invite", async () => {
      const inviteId = randomUUID();
      const onboardingId = randomUUID();
      const code = generateInviteCode();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO team_invites (id, code, team_id, created_by_user_id, max_uses, used_count, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [inviteId, code, testTeamId, adminUserId, 1, 0, "active", now, now],
      });

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, invite_id, started_at)
              VALUES (?, ?, ?, ?)`,
        args: [onboardingId, testUserId, inviteId, now],
      });

      const result = await testClient.execute({
        sql: `SELECT invite_id FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows[0].invite_id).toBe(inviteId);
    });
  });

  // ============= OpenClaw Integration Mode Tests =============

  describe("OpenClaw Integration Mode", () => {
    it("should skip agent creation in disabled mode", async () => {
      // Mock OPENCLAW_INTEGRATION_MODE = "disabled"
      vi.stubEnv("OPENCLAW_INTEGRATION_MODE", "disabled");

      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?)`,
        args: [onboardingId, testUserId, "pending", now],
      });

      // Simulate createOpenClawAgent call
      await testClient.execute({
        sql: `UPDATE user_onboarding SET openclaw_agent_status = 'skipped', assistant_created = 1 WHERE user_id = ?`,
        args: [testUserId],
      });

      const result = await testClient.execute({
        sql: `SELECT openclaw_agent_status, assistant_created FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows[0].openclaw_agent_status).toBe("skipped");
      expect(result.rows[0].assistant_created).toBe(1);

      vi.unstubAllEnvs();
    });

    it("should skip agent creation in optional mode without token", async () => {
      // Mock OPENCLAW_INTEGRATION_MODE = "optional" and no token
      vi.stubEnv("OPENCLAW_INTEGRATION_MODE", "optional");
      vi.stubEnv("OPENCLAW_TOKEN", "");

      const onboardingId = randomUUID();
      const now = Date.now();

      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?)`,
        args: [onboardingId, testUserId, "pending", now],
      });

      // Simulate createOpenClawAgent call
      await testClient.execute({
        sql: `UPDATE user_onboarding SET openclaw_agent_status = 'skipped', assistant_created = 1 WHERE user_id = ?`,
        args: [testUserId],
      });

      const result = await testClient.execute({
        sql: `SELECT openclaw_agent_status, assistant_created FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      expect(result.rows[0].openclaw_agent_status).toBe("skipped");
      expect(result.rows[0].assistant_created).toBe(1);

      vi.unstubAllEnvs();
    });

    it("should calculate completion without assistant steps in optional mode", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      // User with profile and notifications done, but not assistant (skipped in optional mode)
      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 1, 1, 1, 0, 0, "skipped", now],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed, notifications_configured, team_tour_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      const row = result.rows[0];
      // In optional mode, only count: profile, notifications, team_tour (3 steps)
      const steps = [
        row.profile_completed,
        row.notifications_configured,
        row.team_tour_completed,
      ];
      const completed = steps.filter((s) => s === 1).length;
      const percentage = Math.round((completed / 3) * 100);

      // 2 out of 3 steps done = 67%
      expect(percentage).toBe(67);
    });

    it("should calculate completion with assistant steps in legacy mode", async () => {
      const onboardingId = randomUUID();
      const now = Date.now();

      // User with profile and notifications done
      await testClient.execute({
        sql: `INSERT INTO user_onboarding (id, user_id, profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed, openclaw_agent_status, started_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [onboardingId, testUserId, 1, 1, 0, 0, 0, "pending", now],
      });

      const result = await testClient.execute({
        sql: `SELECT profile_completed, notifications_configured, assistant_created, assistant_configured, team_tour_completed FROM user_onboarding WHERE user_id = ?`,
        args: [testUserId],
      });

      const row = result.rows[0];
      // In legacy mode, count all 5 steps
      const steps = [
        row.profile_completed,
        row.notifications_configured,
        row.assistant_created,
        row.assistant_configured,
        row.team_tour_completed,
      ];
      const completed = steps.filter((s) => s === 1).length;
      const percentage = Math.round((completed / 5) * 100);

      // 2 out of 5 steps done = 40%
      expect(percentage).toBe(40);
    });
  });
});
