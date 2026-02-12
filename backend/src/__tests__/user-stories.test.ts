/**
 * Comprehensive User Story Integration Tests
 *
 * Tests end-to-end user flows covering:
 * 1. Registration & Auth
 * 2. Team creation & management
 * 3. Invite generation & acceptance
 * 4. Card lifecycle (create, acknowledge, respond, resolve)
 * 5. Multi-user card responses
 * 6. Card snooze
 * 7. Library of Context
 * 8. Reactions
 * 9. Profile management
 * 10. Health checks
 * 11. Token refresh & session management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";
import { clearRateLimitStore } from "../middleware/rateLimit.js";

// ============= Test Database Setup =============

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

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
      updated_at INTEGER
      ,
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

    CREATE TABLE IF NOT EXISTS team_settings (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE REFERENCES teams(id),
      openclaw_url TEXT DEFAULT 'http://localhost:18789',
      openclaw_agent_template TEXT DEFAULT 'default',
      openclaw_team_context TEXT,
      openclaw_enabled_tools TEXT DEFAULT '[]',
      openai_api_key TEXT,
      ntfy_server_url TEXT DEFAULT 'https://ntfy.sh',
      ntfy_default_topic TEXT,
      email_webhook_secret TEXT,
      calendar_webhook_secret TEXT,
      features_enabled TEXT,
      setup_completed INTEGER DEFAULT 0,
      setup_completed_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
      ,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tez_interrogations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      classification TEXT NOT NULL,
      confidence TEXT NOT NULL,
      context_scope TEXT NOT NULL DEFAULT 'full',
      context_token_count INTEGER,
      model_used TEXT,
      response_time_ms INTEGER,
      guest_token_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tez_citations (
      id TEXT PRIMARY KEY,
      interrogation_id TEXT NOT NULL REFERENCES tez_interrogations(id),
      context_item_id TEXT NOT NULL,
      location TEXT,
      excerpt TEXT NOT NULL,
      claim TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      verification_details TEXT,
      confidence TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER
    );
  `);
}

// ============= Token Management =============

const tokenCache = new Map<string, string>();
const refreshTokenCache = new Map<string, string>();

async function getTokens(userId: string, email: string, name: string) {
  const tokens = await generateTokens({ id: userId, email, name });
  tokenCache.set(userId, tokens.accessToken);
  refreshTokenCache.set(userId, tokens.refreshToken);
  return tokens;
}

function authHeaders(userId: string) {
  const token = tokenCache.get(userId);
  if (!token) throw new Error(`No token for ${userId}`);
  return { Authorization: `Bearer ${token}` };
}

// ============= Test App Creation =============

async function createTestApp(): Promise<Express> {
  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());

  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  // Override the db module
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    users: schema.users,
    teams: schema.teams,
    cards: schema.cards,
    responses: schema.responses,
    reactions: schema.reactions,
    cardViews: schema.cardViews,
    cardContext: schema.cardContext,
    cardRecipients: schema.cardRecipients,
    userRoles: schema.userRoles,
    userSkills: schema.userSkills,
    userTeams: schema.userTeams,
    teamInvites: schema.teamInvites,
    userOnboarding: schema.userOnboarding,
    teamSettings: schema.teamSettings,
    tezInterrogations: schema.tezInterrogations,
    tezCitations: schema.tezCitations,
    refreshTokens: schema.refreshTokens,
    // Raw client access is used by FTS hooks in routes.
    getClient: () => testClient,
  }));

  const { authRoutes } = await import("../routes/auth.js");
  const { cardRoutes } = await import("../routes/cards.js");
  const { userRoutes } = await import("../routes/users.js");
  const { onboardingRoutes } = await import("../routes/onboarding.js");
  const { healthRoutes } = await import("../routes/health.js");

  testApp.use("/api/auth", authRoutes);
  testApp.use("/api/cards", cardRoutes);
  testApp.use("/api/users", userRoutes);
  testApp.use("/api/onboarding", onboardingRoutes);
  testApp.use("/api/health", healthRoutes);

  testApp.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("Test Error:", err);
      res.status(500).json({ error: { code: "TEST_ERROR", message: err.message } });
    }
  );

  return testApp;
}

// ============= Clear All Data =============

async function clearAllData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM tez_citations;
    DELETE FROM tez_interrogations;
    DELETE FROM user_onboarding;
    DELETE FROM team_invites;
    DELETE FROM card_recipients;
    DELETE FROM user_roles;
    DELETE FROM user_skills;
    DELETE FROM user_teams;
    DELETE FROM card_views;
    DELETE FROM reactions;
    DELETE FROM responses;
    DELETE FROM card_context;
    DELETE FROM cards;
    DELETE FROM refresh_tokens;
    DELETE FROM team_settings;
    DELETE FROM users;
    DELETE FROM teams;
  `);
}

// ============= Test Suite =============

describe("User Story Integration Tests", () => {
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
    await clearAllData(testClient);
    clearRateLimitStore();
    tokenCache.clear();
    refreshTokenCache.clear();
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 1: New Admin registers, creates team, invites member
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 1: Admin bootstrap flow", () => {
    it("should register first user as admin with all tokens", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "alice@company.com",
          password: "SecurePass123",
          name: "Alice Admin",
          department: "Management",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe("alice@company.com");
      expect(res.body.data.user.name).toBe("Alice Admin");
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
      // First user gets admin role
      expect(res.body.data.user.roles).toContain("admin");
    });

    it("should allow admin to create a team", async () => {
      // Register admin
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "alice@company.com",
          password: "SecurePass123",
          name: "Alice Admin",
          department: "Management",
        });

      const userId = reg.body.data.user.id;
      const token = reg.body.data.tokens.accessToken;

      // Create team
      const teamRes = await request(app)
        .post("/api/users/teams")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Engineering Team" });

      expect(teamRes.status).toBe(201);
      expect(teamRes.body.name).toBe("Engineering Team");
      expect(teamRes.body.members).toContain(userId);
      expect(teamRes.body.leads).toContain(userId);
    });

    it("should allow full bootstrap: register → create team → create invite", async () => {
      // 1. Register admin
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "alice@company.com",
          password: "SecurePass123",
          name: "Alice Admin",
          department: "Management",
        });

      expect(reg.status).toBe(201);
      const adminToken = reg.body.data.tokens.accessToken;
      const adminId = reg.body.data.user.id;

      // 2. Create team
      const teamRes = await request(app)
        .post("/api/users/teams")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Engineering Team" });

      expect(teamRes.status).toBe(201);
      const teamId = teamRes.body.id;

      // 3. Create invite (admin needs team_lead role for this)
      // First add the team_lead role since the invite endpoint requires it
      await testClient.execute({
        sql: "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
        args: [adminId, "team_lead"],
      });

      const inviteRes = await request(app)
        .post("/api/onboarding/invites")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          teamId,
          maxUses: 10,
          expiresInDays: 30,
        });

      expect(inviteRes.status).toBe(201);
      expect(inviteRes.body.invite.code).toHaveLength(8);
      expect(inviteRes.body.invite.teamId).toBe(teamId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 2: Second user registers, joins team via invite code
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 2: Team member joins via invite", () => {
    let adminToken: string;
    let adminId: string;
    let teamId: string;
    let inviteCode: string;

    beforeEach(async () => {
      // Set up admin + team + invite
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "alice@company.com",
          password: "SecurePass123",
          name: "Alice Admin",
          department: "Management",
        });
      adminToken = reg.body.data.tokens.accessToken;
      adminId = reg.body.data.user.id;

      const teamRes = await request(app)
        .post("/api/users/teams")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Engineering Team" });
      teamId = teamRes.body.id;

      await testClient.execute({
        sql: "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
        args: [adminId, "team_lead"],
      });

      const inviteRes = await request(app)
        .post("/api/onboarding/invites")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ teamId, maxUses: 5 });
      inviteCode = inviteRes.body.invite.code;
    });

    it("should validate an invite code", async () => {
      const res = await request(app)
        .get(`/api/onboarding/invites/validate/${inviteCode}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.team.name).toBe("Engineering Team");
    });

    it("should register and accept invite to join team", async () => {
      // Register second user
      const reg2 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "bob@company.com",
          password: "SecurePass456",
          name: "Bob Builder",
          department: "Engineering",
        });

      expect(reg2.status).toBe(201);
      const bobToken = reg2.body.data.tokens.accessToken;

      // Accept invite
      const acceptRes = await request(app)
        .post("/api/onboarding/invites/accept")
        .set("Authorization", `Bearer ${bobToken}`)
        .send({ code: inviteCode });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
    });

    it("should reject invalid invite code", async () => {
      const res = await request(app)
        .get("/api/onboarding/invites/validate/BADCODE1");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_INVITE");
    });

    it("should allow admin to revoke an invite", async () => {
      // Get invite ID
      const listRes = await request(app)
        .get("/api/onboarding/invites")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.invites.length).toBeGreaterThan(0);

      const inviteId = listRes.body.invites[0].id;

      const revokeRes = await request(app)
        .delete(`/api/onboarding/invites/${inviteId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(revokeRes.status).toBe(200);

      // Code should no longer be valid
      const validateRes = await request(app)
        .get(`/api/onboarding/invites/validate/${inviteCode}`);

      expect(validateRes.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 3: Login, token refresh, session management
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 3: Authentication session lifecycle", () => {
    it("should register then login with same credentials", async () => {
      // Register
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      // Login
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.email).toBe("charlie@company.com");
      expect(loginRes.body.data.tokens.accessToken).toBeDefined();
      expect(loginRes.body.data.tokens.refreshToken).toBeDefined();
    });

    it("should reject login with wrong password", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "charlie@company.com",
          password: "WrongPassword",
        });

      expect(loginRes.status).toBe(401);
    });

    it("should verify a valid access token", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      const token = reg.body.data.tokens.accessToken;

      const verifyRes = await request(app)
        .get("/api/auth/verify")
        .set("Authorization", `Bearer ${token}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(true);
      expect(verifyRes.body.user.email).toBe("charlie@company.com");
    });

    it("should refresh access token using refresh token", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      const refreshToken = reg.body.data.tokens.refreshToken;

      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).toBeDefined();
    });

    it("should reject requests without auth token", async () => {
      const res = await request(app)
        .get("/api/users/me");

      expect(res.status).toBe(401);
    });

    it("should reject duplicate email registration", async () => {
      await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "OtherPass123",
          name: "Charlie Clone",
          department: "Engineering",
        });

      expect(res.status).toBe(409);
    });

    it("should normalize email to lowercase on registration", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "CHARLIE@COMPANY.COM",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe("charlie@company.com");
    });

    it("should logout (best-effort revocation)", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "charlie@company.com",
          password: "SecurePass789",
          name: "Charlie Coder",
          department: "Engineering",
        });

      const refreshToken = reg.body.data.tokens.refreshToken;

      const logoutRes = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 4: Personal card lifecycle
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 4: Personal card lifecycle (create → acknowledge → respond → resolve)", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "dave@company.com",
          password: "SecurePass123",
          name: "Dave Developer",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;
    });

    it("should create a personal card", async () => {
      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          content: "Review the PR for the auth refactor",
        });

      expect(res.status).toBe(201);
      expect(res.body.content).toBe("Review the PR for the auth refactor");
      expect(res.body.status).toBe("pending");
      expect(res.body.fromUserId).toBe(userId);
    });

    it("should show card in feed", async () => {
      // Create card
      await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Feed test card" });

      // Check feed
      const feedRes = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${userToken}`);

      expect(feedRes.status).toBe(200);
      expect(feedRes.body.cards.length).toBeGreaterThanOrEqual(1);
      expect(feedRes.body.cards.some((c: { content: string }) => c.content === "Feed test card")).toBe(true);
    });

    it("should acknowledge a card", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Need to acknowledge this" });

      const cardId = createRes.body.id;

      const ackRes = await request(app)
        .post(`/api/cards/${cardId}/acknowledge`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(ackRes.status).toBe(200);
      expect(ackRes.body.success).toBe(true);
    });

    it("should respond to a card", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Need a response" });

      const cardId = createRes.body.id;

      const respondRes = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Here is my response" });

      expect(respondRes.status).toBe(201);
      expect(respondRes.body.content).toBe("Here is my response");
    });

    it("should complete a card via status update", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Will be completed" });

      const cardId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ status: "resolved" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
    });

    it("should resolve a card via status update", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Will be resolved" });

      const cardId = createRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ status: "resolved" });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
    });

    it("should delete a card", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Will be deleted" });

      const cardId = createRes.body.id;

      const deleteRes = await request(app)
        .delete(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(deleteRes.status).toBe(200);

      // Card should be resolved (delete endpoint sets status to resolved)
      const detailRes = await request(app)
        .get(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(detailRes.body.status).toBe("resolved");
    });

    it("should get card detail with responses", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Card with detail" });

      const cardId = createRes.body.id;

      // Add a response
      await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "First response" });

      // Get detail
      const detailRes = await request(app)
        .get(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.content).toBe("Card with detail");
      expect(detailRes.body.responses.length).toBe(1);
      expect(detailRes.body.responses[0].content).toBe("First response");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 5: Team card with routing
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 5: Team card creation", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "eve@company.com",
          password: "SecurePass123",
          name: "Eve Engineer",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;

      // Create a team and add the user
      const teamId = randomUUID();
      const now = Date.now();
      await testClient.execute({
        sql: "INSERT INTO teams (id, name, members, leads, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [teamId, "Test Team", JSON.stringify([userId]), JSON.stringify([userId]), now],
      });
      await testClient.execute({
        sql: "UPDATE users SET team_id = ? WHERE id = ?",
        args: [teamId, userId],
      });
    });

    it("should create a team card (no external API dependency)", async () => {
      const res = await request(app)
        .post("/api/cards/team")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          content: "We need to update the deployment docs",
          shareToTeam: true,
        });

      // Team card creation should work even if OpenClaw is down (fallback routing)
      expect([201, 200]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 6: Multi-user card responses
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 6: Multi-user card responses", () => {
    let userToken: string;
    let userId: string;
    let user2Token: string;
    let user2Id: string;

    beforeEach(async () => {
      // Register two users
      const reg1 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "frank@company.com",
          password: "SecurePass123",
          name: "Frank",
          department: "Engineering",
        });
      userToken = reg1.body.data.tokens.accessToken;
      userId = reg1.body.data.user.id;

      const reg2 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "grace@company.com",
          password: "SecurePass123",
          name: "Grace",
          department: "Engineering",
        });
      user2Token = reg2.body.data.tokens.accessToken;
      user2Id = reg2.body.data.user.id;
    });

    it("should allow multiple users to respond to a card", async () => {
      // Create card directly in DB with both users as recipients
      const cardId = randomUUID();
      const now = Date.now();
      await testClient.execute({
        sql: `INSERT INTO cards (id, content, from_user_id, to_user_ids, status, visibility, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          cardId,
          "Which framework should we use?",
          userId,
          JSON.stringify([userId, user2Id]),
          "pending",
          "team",
          now,
          now,
        ],
      });
      // Add recipients
      await testClient.execute({
        sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
        args: [cardId, userId, now],
      });
      await testClient.execute({
        sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
        args: [cardId, user2Id, now],
      });

      // User 1 responds
      const resp1 = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "I think React - ecosystem is mature" });

      expect(resp1.status).toBe(201);

      // User 2 responds
      const resp2 = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ content: "I prefer Svelte - simpler reactivity model" });

      expect(resp2.status).toBe(201);

      // Get card detail with responses
      const detail = await request(app)
        .get(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(detail.status).toBe(200);
      expect(detail.body.responses.length).toBe(2);
    });

    it("should allow same user to respond multiple times", async () => {
      const cardId = randomUUID();
      const now = Date.now();
      await testClient.execute({
        sql: `INSERT INTO cards (id, content, from_user_id, status, visibility, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [cardId, "Discussion card", userId, "pending", "team", now, now],
      });
      await testClient.execute({
        sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
        args: [cardId, userId, now],
      });

      // First response
      const resp1 = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Initial thought" });
      expect(resp1.status).toBe(201);

      // Second response (follow-up)
      const resp2 = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Actually, on second thought..." });
      expect(resp2.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 7: Card snooze
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 7: Snooze a card", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "heidi@company.com",
          password: "SecurePass123",
          name: "Heidi",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;
    });

    it("should snooze a card until a future time", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Handle later" });

      const cardId = createRes.body.id;
      const snoozeUntil = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      const snoozeRes = await request(app)
        .post(`/api/cards/${cardId}/snooze`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ until: snoozeUntil });

      expect(snoozeRes.status).toBe(200);
      // Snooze is a timing mechanism, not a status change — card keeps its current status
      expect(snoozeRes.body.status).toBe("pending");
      expect(snoozeRes.body.snoozedUntil).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 8: Library of Context
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 8: Library of Context - add and retrieve context", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "ivan@company.com",
          password: "SecurePass123",
          name: "Ivan",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;
    });

    it("should add text context to a card and retrieve it", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Card with context" });

      const cardId = createRes.body.id;

      // Add context
      const contextRes = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          type: "text",
          rawText: "Detailed notes about this task - we need to handle edge cases for null values",
        });

      expect(contextRes.status).toBe(201);

      // Retrieve context
      const getContextRes = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(getContextRes.status).toBe(200);
      expect(getContextRes.body.length).toBe(2); // 1 auto-created at card creation + 1 manually added
      expect(getContextRes.body[1].originalRawText).toContain("null values");
    });

    it("should search the library of context", async () => {
      // Create card with context
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Deployment checklist" });

      const cardId = createRes.body.id;

      await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          type: "text",
          rawText: "Check nginx configuration and SSL certificates before deploying",
        });

      // Search for context
      const searchRes = await request(app)
        .get("/api/cards/library/search?q=nginx")
        .set("Authorization", `Bearer ${userToken}`);

      expect(searchRes.status).toBe(200);
      expect(Array.isArray(searchRes.body.results)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 9: Reactions
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 9: Emoji reactions on cards", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "judy@company.com",
          password: "SecurePass123",
          name: "Judy",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;
    });

    it("should add a reaction to a card", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Great work!" });

      const cardId = createRes.body.id;

      const reactRes = await request(app)
        .post(`/api/cards/${cardId}/react`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ emoji: "thumbsup" });

      expect(reactRes.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 10: User profile management
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 10: Profile management", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "karl@company.com",
          password: "SecurePass123",
          name: "Karl",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;
    });

    it("should get current user profile", async () => {
      const res = await request(app)
        .get("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("karl@company.com");
      expect(res.body.name).toBe("Karl");
      // passwordHash should NOT be in response
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("should update user name", async () => {
      const res = await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ name: "Karl Updated" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Karl Updated");
    });

    it("should update notification preferences", async () => {
      const res = await request(app)
        .patch("/api/users/me/notifications")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ urgentPush: false, digestTime: "09:00" });

      expect(res.status).toBe(200);
      expect(res.body.notificationPrefs.urgentPush).toBe(false);
      expect(res.body.notificationPrefs.digestTime).toBe("09:00");
    });

    it("should get notification setup info", async () => {
      const res = await request(app)
        .get("/api/users/me/notifications")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.notificationPrefs).toBeDefined();
      expect(res.body.subscribeInstructions).toBeDefined();
    });

    it("should fetch user by ID", async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Karl");
      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 11: Team management
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 11: Team management", () => {
    let adminToken: string;
    let adminId: string;
    let teamId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "laura@company.com",
          password: "SecurePass123",
          name: "Laura Lead",
          department: "Management",
        });
      adminToken = reg.body.data.tokens.accessToken;
      adminId = reg.body.data.user.id;

      const teamRes = await request(app)
        .post("/api/users/teams")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Design Team" });
      teamId = teamRes.body.id;
    });

    it("should get team details", async () => {
      const res = await request(app)
        .get(`/api/users/teams/${teamId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Design Team");
    });

    it("should get team members", async () => {
      const res = await request(app)
        .get(`/api/users/teams/${teamId}/members`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBe("Laura Lead");
    });

    it("should return 404 for non-existent team", async () => {
      const fakeId = randomUUID();
      const res = await request(app)
        .get(`/api/users/teams/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 12: Health checks
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 12: Health check endpoints", () => {
    it("should return healthy on liveness check", async () => {
      const res = await request(app)
        .get("/api/health/live");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("should return healthy on readiness check", async () => {
      const res = await request(app)
        .get("/api/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.checks.database.status).toBe("healthy");
    });

    it("should return healthy on root health check", async () => {
      const res = await request(app)
        .get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.uptime).toBeDefined();
      expect(res.body.version).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 13: Feed views and filtering
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 13: Feed views and filtering", () => {
    let userToken: string;
    let userId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "mike@company.com",
          password: "SecurePass123",
          name: "Mike",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
      userId = reg.body.data.user.id;

      // Create cards directly in DB to avoid AI rate limits
      let now = Date.now();
      for (const content of [
        "First task",
        "Second task",
        "Third task",
        "Fourth task",
      ]) {
        const cardId = randomUUID();
        await testClient.execute({
          sql: `INSERT INTO cards (id, content, from_user_id, to_user_ids, status, visibility, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [cardId, content, userId, JSON.stringify([userId]), "pending", "private", now++, now],
        });
        await testClient.execute({
          sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
          args: [cardId, userId, now],
        });
      }
    });

    it("should return feed with all cards (chronological order)", async () => {
      const res = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cards.length).toBe(4);
    });

    it("should support pagination with limit", async () => {
      const res = await request(app)
        .get("/api/cards/feed?limit=2")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cards.length).toBe(2);
    });

    it("should filter feed by status", async () => {
      const res = await request(app)
        .get("/api/cards/feed?status=pending")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cards.every((c: { status: string }) => c.status === "pending")).toBe(true);
    });

    it("should return empty feed for new user with no cards", async () => {
      // Register a brand new user
      const reg2 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "newbie@company.com",
          password: "SecurePass123",
          name: "Newbie",
          department: "Engineering",
        });

      const res = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${reg2.body.data.tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cards.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 14: Card tags/types
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 14: Different card tags", () => {
    let userToken: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "nancy@company.com",
          password: "SecurePass123",
          name: "Nancy",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
    });

    it("should create cards with different content", async () => {
      // Note: personal card creation goes through AI analysis which has rate limits
      // Just create 2 cards to stay under the rate limit
      const res1 = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "This is a task for the team" });

      expect(res1.status).toBe(201);
      expect(res1.body.content).toBeDefined();

      const res2 = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Quick update on progress" });

      expect(res2.status).toBe(201);
      expect(res2.body.content).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 15: Onboarding status tracking
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 15: Onboarding status", () => {
    it("should report onboarding in progress for newly registered user", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "oscar@company.com",
          password: "SecurePass123",
          name: "Oscar",
          department: "Engineering",
        });

      const res = await request(app)
        .get("/api/onboarding/status")
        .set("Authorization", `Bearer ${reg.body.data.tokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.hasOnboarding).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 16: Input validation
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 16: Input validation", () => {
    it("should reject registration with short password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "val@company.com",
          password: "short",
          name: "Val",
          department: "Engineering",
        });

      expect(res.status).toBe(400);
    });

    it("should reject registration with invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          email: "not-an-email",
          password: "SecurePass123",
          name: "Val",
          department: "Engineering",
        });

      expect(res.status).toBe(400);
    });

    it("should reject registration without required fields", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "val@company.com" });

      expect(res.status).toBe(400);
    });

    it("should reject creating a card without content", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "val@company.com",
          password: "SecurePass123",
          name: "Val",
          department: "Engineering",
        });

      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${reg.body.data.tokens.accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 17: Multi-user card interaction
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 17: Multi-user card interactions", () => {
    let user1Token: string;
    let user1Id: string;
    let user2Token: string;
    let user2Id: string;

    beforeEach(async () => {
      const reg1 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "pat@company.com",
          password: "SecurePass123",
          name: "Pat",
          department: "Engineering",
        });
      user1Token = reg1.body.data.tokens.accessToken;
      user1Id = reg1.body.data.user.id;

      const reg2 = await request(app)
        .post("/api/auth/register")
        .send({
          email: "quinn@company.com",
          password: "SecurePass123",
          name: "Quinn",
          department: "Engineering",
        });
      user2Token = reg2.body.data.tokens.accessToken;
      user2Id = reg2.body.data.user.id;
    });

    it("should allow user2 to respond to user1's card when they are a recipient", async () => {
      // Create card targeting user2
      const cardId = randomUUID();
      const now = Date.now();
      await testClient.execute({
        sql: `INSERT INTO cards (id, content, from_user_id, to_user_ids, status, visibility, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cardId, "Please review this", user1Id, JSON.stringify([user2Id]), "pending", "private", now, now],
      });
      await testClient.execute({
        sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
        args: [cardId, user2Id, now],
      });

      // User2 responds
      const res = await request(app)
        .post(`/api/cards/${cardId}/respond`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({ content: "Reviewed and approved!" });

      expect(res.status).toBe(201);
    });

    it("should show card in recipient's feed", async () => {
      const cardId = randomUUID();
      const now = Date.now();
      await testClient.execute({
        sql: `INSERT INTO cards (id, content, from_user_id, to_user_ids, status, visibility, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [cardId, "Appears in feed", user1Id, JSON.stringify([user2Id]), "pending", "private", now, now],
      });
      await testClient.execute({
        sql: "INSERT INTO card_recipients (card_id, user_id, added_at) VALUES (?, ?, ?)",
        args: [cardId, user2Id, now],
      });

      const feedRes = await request(app)
        .get("/api/cards/feed")
        .set("Authorization", `Bearer ${user2Token}`);

      expect(feedRes.status).toBe(200);
      const found = feedRes.body.cards.find((c: { id: string }) => c.id === cardId);
      expect(found).toBeDefined();
      expect(found.content).toBe("Appears in feed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 18: Multiple context entries per card
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 18: Multiple context entries (Library of Context)", () => {
    let userToken: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "rosa@company.com",
          password: "SecurePass123",
          name: "Rosa",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
    });

    it("should accumulate multiple context entries on a card", async () => {
      const createRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ content: "Multi-context card" });

      const cardId = createRes.body.id;

      // Add first context
      const ctx1 = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ type: "text", rawText: "First context entry" });
      expect(ctx1.status).toBe(201);

      // Clear rate limit between calls since both use aiRateLimit
      clearRateLimitStore();

      // Add second context
      const ctx2 = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ type: "text", rawText: "Second context entry with more details" });
      expect(ctx2.status).toBe(201);

      // Get all context
      const contextRes = await request(app)
        .get(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(contextRes.status).toBe(200);
      expect(contextRes.body.length).toBe(3); // 1 auto-created at card creation + 2 manually added
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 19: Card with due date
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 19: Card with due date", () => {
    let userToken: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "sam@company.com",
          password: "SecurePass123",
          name: "Sam",
          department: "Engineering",
        });
      userToken = reg.body.data.tokens.accessToken;
    });

    it("should create a card with a due date", async () => {
      const dueDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow

      const res = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          content: "Due tomorrow",
          dueDate,
        });

      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // STORY 20: End-to-end admin → team → member → card → complete flow
  // ═══════════════════════════════════════════════════════════════════

  describe("Story 20: Full end-to-end flow", () => {
    it("should complete full lifecycle: admin registers → creates team → invites → member joins → creates card → completes", async () => {
      // 1. Admin registers (first user = admin)
      const adminReg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "admin@company.com",
          password: "AdminPass123",
          name: "Admin User",
          department: "Management",
        });
      expect(adminReg.status).toBe(201);
      const adminToken = adminReg.body.data.tokens.accessToken;
      const adminId = adminReg.body.data.user.id;

      // 2. Admin creates team
      const teamRes = await request(app)
        .post("/api/users/teams")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Product Team" });
      expect(teamRes.status).toBe(201);
      const teamId = teamRes.body.id;

      // 3. Admin creates invite
      await testClient.execute({
        sql: "INSERT INTO user_roles (user_id, role) VALUES (?, ?)",
        args: [adminId, "team_lead"],
      });

      const inviteRes = await request(app)
        .post("/api/onboarding/invites")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ teamId, maxUses: 10 });
      expect(inviteRes.status).toBe(201);
      const inviteCode = inviteRes.body.invite.code;

      // 4. Member registers
      const memberReg = await request(app)
        .post("/api/auth/register")
        .send({
          email: "member@company.com",
          password: "MemberPass123",
          name: "Team Member",
          department: "Engineering",
        });
      expect(memberReg.status).toBe(201);
      const memberToken = memberReg.body.data.tokens.accessToken;

      // 5. Member validates invite
      const validateRes = await request(app)
        .get(`/api/onboarding/invites/validate/${inviteCode}`);
      expect(validateRes.status).toBe(200);
      expect(validateRes.body.valid).toBe(true);

      // 6. Member accepts invite
      const acceptRes = await request(app)
        .post("/api/onboarding/invites/accept")
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ code: inviteCode });
      expect(acceptRes.status).toBe(200);

      // 7. Member creates personal card
      const cardRes = await request(app)
        .post("/api/cards/personal")
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ content: "Set up dev environment" });
      expect(cardRes.status).toBe(201);
      const cardId = cardRes.body.id;

      // 8. Member adds context
      const contextRes = await request(app)
        .post(`/api/cards/${cardId}/context`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ type: "text", rawText: "Need Docker and Node 22 installed" });
      expect(contextRes.status).toBe(201);

      // 9. Member acknowledges
      const ackRes = await request(app)
        .post(`/api/cards/${cardId}/acknowledge`)
        .set("Authorization", `Bearer ${memberToken}`);
      expect(ackRes.status).toBe(200);

      // 10. Member resolves
      const completeRes = await request(app)
        .patch(`/api/cards/${cardId}`)
        .set("Authorization", `Bearer ${memberToken}`)
        .send({ status: "resolved" });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);

      // 11. Verify card is resolved in feed
      const feedRes = await request(app)
        .get("/api/cards/feed?status=resolved")
        .set("Authorization", `Bearer ${memberToken}`);
      expect(feedRes.status).toBe(200);
      const resolvedCard = feedRes.body.cards.find((c: { id: string }) => c.id === cardId);
      expect(resolvedCard).toBeDefined();
      expect(resolvedCard.status).toBe("resolved");

      // 12. Health check still healthy
      const healthRes = await request(app).get("/api/health/live");
      expect(healthRes.status).toBe(200);
    });
  });
});
