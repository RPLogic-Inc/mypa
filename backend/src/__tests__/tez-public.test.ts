import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { randomUUID, createHash, randomBytes } from "crypto";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema.js";
import { clearRateLimitStore } from "../middleware/rateLimit.js";

let testClient: Client;
let testDb: ReturnType<typeof drizzle>;
let app: Express;

const sender = {
  id: "tez-public-sender-1",
  name: "Sender User",
  email: "sender@example.com",
  department: "Ops",
};

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
      updated_at INTEGER,
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

    CREATE TABLE IF NOT EXISTS tez_share_tokens (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id),
      created_by_user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      context_scope TEXT NOT NULL DEFAULT 'surface',
      context_item_ids TEXT DEFAULT '[]',
      max_interrogations INTEGER,
      interrogation_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      team_id TEXT REFERENCES teams(id),
      card_id TEXT REFERENCES cards(id),
      event_name TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER
    );
  `);
}

async function seedUsers(client: Client) {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [sender.id, sender.name, sender.email, sender.department, "[]", "[]", now, now],
  });
}

async function clearTezPublicData(client: Client) {
  await client.executeMultiple(`
    DELETE FROM product_events;
    DELETE FROM tez_share_tokens;
    DELETE FROM card_context;
    DELETE FROM cards;
  `);
}

async function createApp() {
  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    getClient: () => testClient,
  }));

  vi.resetModules();

  vi.doMock("../db/index.js", () => ({
    db: testDb,
    ...schema,
    getClient: () => testClient,
  }));

  const tezPublicRoutes = (await import("../routes/tezPublic.js")).default;
  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });
  testApp.use("/api/tez/public", tezPublicRoutes);
  return testApp;
}

async function insertCard(cardId: string, proactiveHints: string[] = ["Likely interpretation"]) {
  const now = Date.now();
  await testClient.execute({
    sql: `INSERT INTO cards
      (id, content, summary, from_user_id, to_user_ids, visibility, status, share_intent, proactive_hints, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      cardId,
      "Decision memo for Q1 launch",
      "Q1 launch decision",
      sender.id,
      JSON.stringify([sender.id]),
      "private",
      "pending",
      "decision",
      JSON.stringify(proactiveHints),
      now,
      now,
    ],
  });
}

async function insertContext(cardId: string) {
  const now = Date.now();
  await testClient.execute({
    sql: `INSERT INTO card_context
      (id, card_id, user_id, user_name, original_type, original_raw_text, captured_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), cardId, sender.id, sender.name, "assistant", "Context body", now, now],
  });
}

async function insertShareToken(
  cardId: string,
  opts: { maxInterrogations?: number | null; interrogationCount?: number; revokedAt?: number | null } = {}
) {
  const now = Date.now();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await testClient.execute({
    sql: `INSERT INTO tez_share_tokens
      (id, card_id, created_by_user_id, token_hash, context_scope, context_item_ids, max_interrogations, interrogation_count, expires_at, revoked_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      randomUUID(),
      cardId,
      sender.id,
      tokenHash,
      "full",
      "[]",
      opts.maxInterrogations ?? 3,
      opts.interrogationCount ?? 0,
      now + 86400000,
      opts.revokedAt ?? null,
      now,
    ],
  });
  return rawToken;
}

beforeAll(async () => {
  testClient = createClient({ url: "file::memory:?cache=shared" });
  testDb = drizzle(testClient, { schema });
  await createTables(testClient);
  await seedUsers(testClient);
  app = await createApp();
});

afterAll(async () => {
  testClient.close();
});

beforeEach(async () => {
  await clearTezPublicData(testClient);
  clearRateLimitStore();
  const rateLimit = await import("../middleware/rateLimit.js");
  rateLimit.clearRateLimitStore();
});

describe("Tez Public Guest Endpoints", () => {
  it("returns guest summary payload with hints and remaining interrogations", async () => {
    const cardId = randomUUID();
    await insertCard(cardId, ["Approve now", "Challenge timeline"]);
    await insertContext(cardId);
    const token = await insertShareToken(cardId, { maxInterrogations: 3, interrogationCount: 1 });

    const res = await request(app).get(`/api/tez/public/${cardId}?token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shareIntent).toBe("decision");
    expect(res.body.data.proactiveHints).toEqual(["Approve now", "Challenge timeline"]);
    expect(res.body.data.contextScope).toBe("full");
    expect(res.body.data.guestAccess.maxInterrogations).toBe(3);
    expect(res.body.data.guestAccess.interrogationCount).toBe(1);
    expect(res.body.data.guestAccess.remainingInterrogations).toBe(2);
    expect(Array.isArray(res.body.data.contextItems)).toBe(true);
  });

  it("captures conversion intent and records product event", async () => {
    const cardId = randomUUID();
    await insertCard(cardId);
    const token = await insertShareToken(cardId);

    const res = await request(app)
      .post(`/api/tez/public/${cardId}/convert?token=${token}`)
      .send({ email: "guest@example.com", intent: "get_pa", source: "cta" });

    expect(res.status).toBe(202);
    expect(res.body.data.captured).toBe(true);

    const row = await testClient.execute({
      sql: "SELECT metadata FROM product_events WHERE event_name = ? LIMIT 1",
      args: ["tez_guest_conversion_intent"],
    });
    expect(row.rows.length).toBe(1);
    const metadataValue = row.rows[0]?.metadata as string | null | undefined;
    const metadata = metadataValue ? JSON.parse(metadataValue) : {};
    expect(metadata.intent).toBe("get_pa");
    expect(metadata.source).toBe("cta");
    expect(metadata.emailDomain).toBe("example.com");
  });

  it("returns 429 when share token interrogation limit is reached", async () => {
    const cardId = randomUUID();
    await insertCard(cardId);
    const token = await insertShareToken(cardId, { maxInterrogations: 1, interrogationCount: 1 });

    const res = await request(app)
      .post(`/api/tez/public/${cardId}/interrogate?token=${token}`)
      .send({ question: "What is the decision?" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("SHARE_TOKEN_LIMIT_REACHED");
  });

  it("returns 401 when share token is revoked", async () => {
    const cardId = randomUUID();
    await insertCard(cardId);
    const token = await insertShareToken(cardId, { revokedAt: Date.now() });

    const res = await request(app).get(`/api/tez/public/${cardId}?token=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_SHARE_TOKEN");
  });
});
