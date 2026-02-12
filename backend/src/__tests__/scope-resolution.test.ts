/**
 * Multi-Team Scope Resolution Tests
 *
 * Verifies that:
 * - Single-team users can create team cards without explicit teamId
 * - Multi-team users get AMBIGUOUS_TEAM_SCOPE without explicit teamId
 * - Multi-team users can create team cards with valid teamId
 * - Multi-team users are rejected with invalid teamId
 * - Classify endpoint accepts optional teamId for scoped name matching
 * - Bootstrap endpoint returns correct shape
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import { cardRoutes } from "../routes/cards.js";
import { authRoutes } from "../routes/auth.js";
import { generateTokens } from "../services/jwt.js";
import { clearRateLimitStore } from "../middleware/rateLimit.js";

let testClient: Client;
let app: Express;

// Test IDs
const team1Id = randomUUID();
const team2Id = randomUUID();
const singleTeamUserId = randomUUID();
const multiTeamUserId = randomUUID();
const outsideUserId = randomUUID();
let singleTeamToken: string;
let multiTeamToken: string;
let outsideToken: string;

async function createTables(client: Client) {
  await client.executeMultiple(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS card_recipients;
    DROP TABLE IF EXISTS card_context;
    DROP TABLE IF EXISTS cards;
    DROP TABLE IF EXISTS user_teams;
    DROP TABLE IF EXISTS user_skills;
    DROP TABLE IF EXISTS user_roles;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS team_settings;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS card_views;
    DROP TABLE IF EXISTS responses;
    DROP TABLE IF EXISTS reactions;

    PRAGMA foreign_keys = ON;

    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members TEXT DEFAULT '[]',
      leads TEXT DEFAULT '[]',
      created_at INTEGER
    );

    CREATE TABLE users (
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

    CREATE TABLE user_roles (
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE user_skills (
      user_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      PRIMARY KEY (user_id, skill)
    );

    CREATE TABLE user_teams (
      user_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER,
      PRIMARY KEY (user_id, team_id)
    );

    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      summary TEXT,
      audio_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'self',
      source_user_id TEXT,
      source_ref TEXT,
      from_user_id TEXT NOT NULL,
      to_user_ids TEXT DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'private',
      team_id TEXT,
      tag TEXT NOT NULL DEFAULT 'task',
      priority TEXT NOT NULL DEFAULT 'medium',
      priority_score REAL DEFAULT 50,
      priority_reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      share_intent TEXT NOT NULL DEFAULT 'note',
      proactive_hints TEXT DEFAULT '[]',
      due_date INTEGER,
      snoozed_until INTEGER,
      decision_options TEXT,
      type TEXT,
      attachments TEXT DEFAULT '[]',
      parent_id TEXT,
      related_card_ids TEXT DEFAULT '[]',
      type_data TEXT,
      blocked_reason TEXT,
      forked_from_id TEXT,
      fork_type TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE card_recipients (
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      added_at INTEGER,
      PRIMARY KEY (card_id, user_id)
    );

    CREATE TABLE card_context (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      original_type TEXT NOT NULL,
      original_raw_text TEXT NOT NULL,
      original_audio_url TEXT,
      original_audio_duration INTEGER,
      original_file_url TEXT,
      original_file_name TEXT,
      original_file_mime_type TEXT,
      original_file_size INTEGER,
      assistant_data TEXT,
      captured_at INTEGER NOT NULL,
      device_info TEXT,
      display_bullets TEXT,
      display_generated_at INTEGER,
      display_model_used TEXT,
      created_at INTEGER
    );

    CREATE TABLE responses (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      audio_url TEXT,
      attachments TEXT DEFAULT '[]',
      created_at INTEGER
    );

    CREATE TABLE reactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE card_views (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      viewed_at INTEGER
    );

    CREATE TABLE team_settings (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE,
      openclaw_url TEXT DEFAULT 'http://localhost:18789',
      openclaw_agent_template TEXT DEFAULT 'default',
      openclaw_team_context TEXT,
      openclaw_enabled_tools TEXT DEFAULT '[]',
      ai_model_allowlist TEXT,
      ai_default_model TEXT,
      ai_max_prompt_chars INTEGER,
      openai_api_key TEXT,
      ntfy_server_url TEXT DEFAULT 'https://ntfy.sh',
      ntfy_default_topic TEXT,
      email_webhook_secret TEXT,
      calendar_webhook_secret TEXT,
      features_enabled TEXT DEFAULT '{}',
      setup_completed INTEGER DEFAULT 0,
      setup_completed_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS card_context_fts USING fts5(
      context_id UNINDEXED,
      card_id UNINDEXED,
      user_id UNINDEXED,
      user_name UNINDEXED,
      original_type UNINDEXED,
      captured_at UNINDEXED,
      original_raw_text,
      display_bullets_text,
      tokenize='porter unicode61'
    );
  `);
}

async function seedData(client: Client) {
  const now = Date.now();

  // Create teams
  await client.execute({
    sql: "INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)",
    args: [team1Id, "Alpha Team", now],
  });
  await client.execute({
    sql: "INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)",
    args: [team2Id, "Beta Team", now],
  });

  // Single-team user (belongs to team1 only)
  await client.execute({
    sql: "INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
    args: [singleTeamUserId, "Alice Single", "alice@test.com", "Eng", team1Id, now, now],
  });
  await client.execute({
    sql: "INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, 'member', ?)",
    args: [singleTeamUserId, team1Id, now],
  });

  // Multi-team user (belongs to both teams)
  await client.execute({
    sql: "INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
    args: [multiTeamUserId, "Bob Multi", "bob@test.com", "Eng", team1Id, now, now],
  });
  await client.execute({
    sql: "INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, 'member', ?)",
    args: [multiTeamUserId, team1Id, now],
  });
  await client.execute({
    sql: "INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, 'member', ?)",
    args: [multiTeamUserId, team2Id, now],
  });

  // Outside user (not in any team via user_teams but has team_id set)
  await client.execute({
    sql: "INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
    args: [outsideUserId, "Charlie Outside", "charlie@test.com", "Eng", null, now, now],
  });

  // Add a teammate in team1 for classify name matching
  const teammateId = randomUUID();
  await client.execute({
    sql: "INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
    args: [teammateId, "Diana Team1", "diana@test.com", "Design", team1Id, now, now],
  });
  await client.execute({
    sql: "INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, 'member', ?)",
    args: [teammateId, team1Id, now],
  });

  // Add a teammate only in team2
  const team2MateId = randomUUID();
  await client.execute({
    sql: "INSERT INTO users (id, name, email, department, team_id, roles, skills, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
    args: [team2MateId, "Eve Team2", "eve@test.com", "Sales", team2Id, now, now],
  });
  await client.execute({
    sql: "INSERT INTO user_teams (user_id, team_id, role, joined_at) VALUES (?, ?, 'member', ?)",
    args: [team2MateId, team2Id, now],
  });
}

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  const testDb = drizzle(testClient, { schema });

  await createTables(testClient);
  await seedData(testClient);

  // Generate tokens
  const singleTokenResult = await generateTokens({ id: singleTeamUserId, email: "alice@test.com", name: "Alice Single" });
  singleTeamToken = singleTokenResult.accessToken;

  const multiTokenResult = await generateTokens({ id: multiTeamUserId, email: "bob@test.com", name: "Bob Multi" });
  multiTeamToken = multiTokenResult.accessToken;

  const outsideTokenResult = await generateTokens({ id: outsideUserId, email: "charlie@test.com", name: "Charlie Outside" });
  outsideToken = outsideTokenResult.accessToken;

  // Create Express app
  app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/cards", cardRoutes);
  app.use("/api/auth", authRoutes);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Test Error:", err);
    res.status(500).json({ error: err.message });
  });
});

afterAll(() => {
  clearRateLimitStore();
  testClient?.close();
});

beforeEach(() => {
  clearRateLimitStore();
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/cards/team — Team Scope Resolution
// ═══════════════════════════════════════════════════════════════════

describe("POST /api/cards/team — scope resolution", () => {
  it("single-team user: succeeds without explicit teamId", async () => {
    const res = await request(app)
      .post("/api/cards/team")
      .set("Authorization", `Bearer ${singleTeamToken}`)
      .send({ content: "Hello team!", shareToTeam: true });

    expect(res.status).toBe(201);
    expect(res.body.teamId).toBe(team1Id);
  });

  it("multi-team user: returns AMBIGUOUS_TEAM_SCOPE without teamId", async () => {
    const res = await request(app)
      .post("/api/cards/team")
      .set("Authorization", `Bearer ${multiTeamToken}`)
      .send({ content: "Hello which team?", shareToTeam: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AMBIGUOUS_TEAM_SCOPE");
    expect(res.body.error.teams).toHaveLength(2);
    // Verify team details are included
    const teamIds = res.body.error.teams.map((t: any) => t.id);
    expect(teamIds).toContain(team1Id);
    expect(teamIds).toContain(team2Id);
    // Verify team names are included
    const teamNames = res.body.error.teams.map((t: any) => t.name);
    expect(teamNames).toContain("Alpha Team");
    expect(teamNames).toContain("Beta Team");
  });

  it("multi-team user: succeeds with valid teamId", async () => {
    const res = await request(app)
      .post("/api/cards/team")
      .set("Authorization", `Bearer ${multiTeamToken}`)
      .send({ content: "Hello Alpha!", teamId: team1Id, shareToTeam: true });

    expect(res.status).toBe(201);
    expect(res.body.teamId).toBe(team1Id);
  });

  it("multi-team user: rejected with non-member teamId", async () => {
    const fakeTeamId = randomUUID();
    const res = await request(app)
      .post("/api/cards/team")
      .set("Authorization", `Bearer ${multiTeamToken}`)
      .send({ content: "Wrong team", teamId: fakeTeamId, shareToTeam: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_TEAM_MEMBER");
  });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/cards/classify — Team-Scoped Name Matching
// ═══════════════════════════════════════════════════════════════════

describe("POST /api/cards/classify — team-scoped matching", () => {
  it("classifies with default team scope", async () => {
    const res = await request(app)
      .post("/api/cards/classify")
      .set("Authorization", `Bearer ${singleTeamToken}`)
      .send({ content: "Tell Diana about the project" });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("classifies with explicit teamId scope", async () => {
    const res = await request(app)
      .post("/api/cards/classify")
      .set("Authorization", `Bearer ${multiTeamToken}`)
      .send({ content: "Tell Eve about the deal", teamId: team2Id });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("rejects classify with non-member teamId", async () => {
    const fakeTeamId = randomUUID();
    const res = await request(app)
      .post("/api/cards/classify")
      .set("Authorization", `Bearer ${multiTeamToken}`)
      .send({ content: "Hello", teamId: fakeTeamId });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_TEAM_MEMBER");
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/auth/bootstrap
// ═══════════════════════════════════════════════════════════════════

describe("GET /api/auth/bootstrap", () => {
  it("returns correct bootstrap shape for multi-team user", async () => {
    const res = await request(app)
      .get("/api/auth/bootstrap")
      .set("Authorization", `Bearer ${multiTeamToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.id).toBe(multiTeamUserId);
    expect(res.body.data.user.email).toBe("bob@test.com");
    expect(res.body.data.teams).toHaveLength(2);
    expect(res.body.data.instanceMode).toBeDefined();
    expect(res.body.data.capabilities).toBeDefined();
    expect(res.body.data.capabilities).toHaveProperty("relay");
    expect(res.body.data.capabilities).toHaveProperty("crm");
    expect(res.body.data.capabilities).toHaveProperty("paWorkspace");
    expect(res.body.data.capabilities).toHaveProperty("federation");
    expect(res.body.data.capabilities).toHaveProperty("scheduler");
    expect(res.body.data.endpoints).toBeDefined();
    expect(res.body.data.connectedHubs).toBeDefined();
    expect(Array.isArray(res.body.data.connectedHubs)).toBe(true);
  });

  it("returns correct bootstrap shape for single-team user", async () => {
    const res = await request(app)
      .get("/api/auth/bootstrap")
      .set("Authorization", `Bearer ${singleTeamToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(singleTeamUserId);
    expect(res.body.data.teams).toHaveLength(1);
    expect(res.body.data.teams[0].name).toBe("Alpha Team");
    expect(res.body.data.teams[0].isActive).toBe(true);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/auth/bootstrap");
    expect(res.status).toBe(401);
  });
});
