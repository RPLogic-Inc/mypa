/**
 * Test helpers for integration tests
 *
 * Provides:
 * - In-memory test database setup
 * - Test fixtures (users, cards)
 * - Helper functions for making authenticated requests
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "../db/schema.js";
import { randomUUID } from "crypto";
import express, { type Express } from "express";
import { cardRoutes } from "../routes/cards.js";
import { userRoutes } from "../routes/users.js";
import cors from "cors";

// Store the client reference for cleanup
let testClient: Client | null = null;

/**
 * Create an in-memory SQLite database for testing
 */
export async function createTestDb() {
  // Create in-memory database with shared cache for connection reuse
  const client = createClient({
    url: "file::memory:?cache=shared",
  });

  testClient = client;
  const db = drizzle(client, { schema });

  // Create tables (drop first to ensure fresh schema with any new columns)
  await client.executeMultiple(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS card_views;
    DROP TABLE IF EXISTS reactions;
    DROP TABLE IF EXISTS responses;
    DROP TABLE IF EXISTS card_context;
    DROP TABLE IF EXISTS card_escalations;
    DROP TABLE IF EXISTS card_dependencies;
    DROP TABLE IF EXISTS votes;
    DROP TABLE IF EXISTS ideas;
    DROP TABLE IF EXISTS questions;
    DROP TABLE IF EXISTS routing_patterns;
    DROP TABLE IF EXISTS card_recipients;
    DROP TABLE IF EXISTS cards;
    DROP TABLE IF EXISTS mirror_audit_log;
    DROP TABLE IF EXISTS user_onboarding;
    DROP TABLE IF EXISTS user_settings;
    DROP TABLE IF EXISTS team_settings;
    DROP TABLE IF EXISTS user_teams;
    DROP TABLE IF EXISTS user_skills;
    DROP TABLE IF EXISTS user_roles;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS tez_citations;
    DROP TABLE IF EXISTS tez_interrogations;
    DROP TABLE IF EXISTS team_invites;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS provisioning_jobs;
    DROP TABLE IF EXISTS card_context_fts;

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
      team_id TEXT REFERENCES teams(id),
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
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE user_skills (
      user_id TEXT NOT NULL REFERENCES users(id),
      skill TEXT NOT NULL,
      PRIMARY KEY (user_id, skill)
    );

    CREATE TABLE user_teams (
      user_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
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
      source_user_id TEXT REFERENCES users(id),
      source_ref TEXT,
      from_user_id TEXT NOT NULL REFERENCES users(id),
      to_user_ids TEXT DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'private',
      team_id TEXT REFERENCES teams(id),
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
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      added_at INTEGER,
      PRIMARY KEY (card_id, user_id)
    );

    CREATE TABLE card_dependencies (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      depends_on_card_id TEXT NOT NULL REFERENCES cards(id),
      type TEXT NOT NULL DEFAULT 'related',
      created_at INTEGER,
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE TABLE card_escalations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      reason TEXT NOT NULL,
      previous_priority TEXT NOT NULL,
      new_priority TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER
    );

    CREATE TABLE card_context (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
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
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      audio_url TEXT,
      attachments TEXT DEFAULT '[]',
      created_at INTEGER
    );

    CREATE TABLE reactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      emoji TEXT NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE card_views (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      viewed_at INTEGER
    );

    CREATE TABLE routing_patterns (
      id TEXT PRIMARY KEY,
      keywords TEXT DEFAULT '[]',
      topics TEXT DEFAULT '[]',
      routed_to TEXT DEFAULT '[]',
      was_correct INTEGER,
      created_at INTEGER
    );

    CREATE TABLE votes (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      option TEXT NOT NULL,
      comment TEXT,
      voted_at INTEGER
    );

    CREATE TABLE ideas (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      votes INTEGER DEFAULT 0,
      submitted_at INTEGER
    );

    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      upvotes INTEGER DEFAULT 0,
      answer TEXT,
      answered_at INTEGER,
      submitted_at INTEGER
    );

    CREATE TABLE team_invites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      team_id TEXT NOT NULL REFERENCES teams(id),
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      email TEXT,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      expires_at INTEGER,
      default_roles TEXT,
      default_skills TEXT,
      default_department TEXT,
      default_notification_prefs TEXT,
      openclaw_config TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE user_onboarding (
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

    CREATE TABLE tez_interrogations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      session_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      classification TEXT NOT NULL,
      confidence TEXT NOT NULL,
      context_scope TEXT NOT NULL,
      context_token_count INTEGER,
      model_used TEXT,
      response_time_ms INTEGER,
      guest_token_id TEXT,
      created_at INTEGER
    );

    CREATE TABLE tez_citations (
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

    CREATE TABLE refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER
    );

    CREATE TABLE user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      mirror_warnings_enabled INTEGER DEFAULT 1,
      mirror_default_template TEXT DEFAULT 'surface',
      mirror_append_deeplink INTEGER DEFAULT 1,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE team_settings (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE REFERENCES teams(id),
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
      features_enabled TEXT DEFAULT '{"voiceRecording":true,"emailIngestion":false,"calendarSync":false,"paAssistant":true}',
      setup_completed INTEGER DEFAULT 0,
      setup_completed_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE mirror_audit_log (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      template TEXT NOT NULL,
      destination TEXT NOT NULL,
      recipient_hint TEXT,
      char_count INTEGER NOT NULL,
      deep_link_included INTEGER DEFAULT 1,
      created_at INTEGER
    );

    CREATE TABLE provisioning_jobs (
      id TEXT PRIMARY KEY,
      team_name TEXT NOT NULL,
      subdomain TEXT NOT NULL UNIQUE,
      admin_email TEXT NOT NULL,
      droplet_size TEXT NOT NULL DEFAULT 's-2vcpu-4gb',
      region TEXT NOT NULL DEFAULT 'nyc3',
      status TEXT NOT NULL DEFAULT 'pending',
      current_step TEXT,
      progress INTEGER DEFAULT 0,
      droplet_id TEXT,
      droplet_ip TEXT,
      app_url TEXT,
      error TEXT,
      log TEXT,
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER,
      completed_at INTEGER
    );

    CREATE VIRTUAL TABLE card_context_fts USING fts5(
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

  return { db, client };
}

/**
 * Clean up test database
 */
export async function cleanupTestDb() {
  if (testClient) {
    testClient.close();
    testClient = null;
  }
}

/**
 * Create test Express app with routes
 */
export function createTestApp(db: ReturnType<typeof drizzle>): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Override the db import in routes by using a middleware
  // We'll need to modify the routes to accept db as a parameter
  // For now, we'll use module augmentation

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes
  app.use("/api/cards", cardRoutes);
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
      res.status(500).json({ error: err.message });
    }
  );

  return app;
}

// ============= Test Fixtures =============

export interface TestUser {
  id: string;
  name: string;
  email: string;
  department: string;
  roles: string[];
  skills: string[];
}

export interface TestCard {
  id: string;
  content: string;
  summary?: string;
  fromUserId: string;
  toUserIds: string[];
  priority: string;
  status: string;
  type?: string;
}

/**
 * Create a test user fixture
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: randomUUID(),
    name: "Test User",
    email: `test-${randomUUID()}@example.com`,
    department: "Engineering",
    roles: ["engineer"],
    skills: ["typescript", "testing"],
    ...overrides,
  };
}

/**
 * Create a test card fixture
 */
export function createTestCard(
  userId: string,
  overrides: Partial<TestCard> = {}
): TestCard {
  return {
    id: randomUUID(),
    content: "Test card content",
    summary: "Test summary",
    fromUserId: userId,
    toUserIds: [userId],
    priority: "medium",
    status: "pending",
    type: "task",
    ...overrides,
  };
}

/**
 * Insert a test user into the database
 */
export async function insertTestUser(
  client: Client,
  user: TestUser
): Promise<TestUser> {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      user.id,
      user.name,
      user.email,
      user.department,
      JSON.stringify(user.roles),
      JSON.stringify(user.skills),
      now,
      now,
    ],
  });
  return user;
}

/**
 * Insert a test card into the database
 */
export async function insertTestCard(
  client: Client,
  card: TestCard
): Promise<TestCard> {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO cards (id, content, summary, from_user_id, to_user_ids, priority, status, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      card.id,
      card.content,
      card.summary || null,
      card.fromUserId,
      JSON.stringify(card.toUserIds),
      card.priority,
      card.status,
      card.type || "task",
      now,
      now,
    ],
  });
  return card;
}

/**
 * Insert a test response into the database
 */
export async function insertTestResponse(
  client: Client,
  cardId: string,
  userId: string,
  content: string
): Promise<{ id: string; cardId: string; userId: string; content: string }> {
  const id = randomUUID();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO responses (id, card_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, cardId, userId, content, now],
  });
  return { id, cardId, userId, content };
}

/**
 * Insert a test context entry into the database
 */
export async function insertTestContext(
  client: Client,
  cardId: string,
  userId: string,
  userName: string,
  type: string,
  rawText: string
): Promise<{
  id: string;
  cardId: string;
  userId: string;
  type: string;
  rawText: string;
}> {
  const id = randomUUID();
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO card_context (id, card_id, user_id, user_name, original_type, original_raw_text, captured_at, display_bullets, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      cardId,
      userId,
      userName,
      type,
      rawText,
      now,
      JSON.stringify(["Test bullet"]),
      now,
    ],
  });
  return { id, cardId, userId, type, rawText };
}

/**
 * Cache for generated JWT tokens (userId -> accessToken)
 * Since generateTokens is async, we pre-generate tokens and cache them.
 */
const tokenCache = new Map<string, string>();

/**
 * Pre-generate a JWT token for a test user. Must be called (and awaited)
 * before using authHeaders() for that userId.
 */
export async function generateTestToken(userId: string, email = "test@example.com", name = "Test User"): Promise<string> {
  const { generateTokens } = await import("../services/jwt.js");
  const { accessToken } = await generateTokens({ id: userId, email, name });
  tokenCache.set(userId, accessToken);
  return accessToken;
}

/**
 * Helper to make authenticated request headers.
 * The token must have been pre-generated via generateTestToken().
 */
export function authHeaders(userId: string): Record<string, string> {
  const token = tokenCache.get(userId);
  if (!token) {
    throw new Error(`No token cached for userId "${userId}". Call generateTestToken() first.`);
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}
