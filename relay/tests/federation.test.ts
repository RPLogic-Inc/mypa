/**
 * Federation integration tests
 *
 * Tests the full federation stack:
 * - Server identity (Ed25519 keypair)
 * - HTTP signatures (sign / verify)
 * - Federation bundle format (create / validate / hash integrity)
 * - Federation endpoints (server-info, verify, inbox)
 * - Admin routes (trust management)
 * - Two-server cross-delivery (Server A → Server B)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { randomUUID } from "crypto";
import {
  setupDbMock,
  initTestDb,
  cleanDb,
  closeTestDb,
  createTestApp,
  authHeader,
  createTeamWithAdmin,
  addMember,
  getTestDb,
} from "./setup.js";

// Must call before any imports that touch the db
setupDbMock();

let app: Express;

const ADMIN_USER = "fed-admin-1";
const MEMBER_USER = "fed-member-1";
const OUTSIDER_USER = "fed-outsider-1";

// Set up env for federation testing
process.env.FEDERATION_ENABLED = "true";
process.env.FEDERATION_MODE = "open";
process.env.RELAY_HOST = "alpha.test";
process.env.ADMIN_USER_IDS = ADMIN_USER;

beforeAll(async () => {
  await initTestDb();
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanDb();
  // Clear discovery cache and identity between tests
  const { clearDiscoveryCache } = await import("../src/services/discovery.js");
  clearDiscoveryCache();
  const { _resetIdentity } = await import("../src/services/identity.js");
  _resetIdentity();
});

afterAll(async () => {
  await closeTestDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit: Federation Bundle
// ─────────────────────────────────────────────────────────────────────────────

describe("Federation Bundle", () => {
  it("creates a valid bundle with hash", async () => {
    const { createBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "test-server-id",
      publicKey: "test-pub-key",
      privateKeyPem: "test-priv",
      host: "alpha.test",
    };

    const bundle = createBundle(
      {
        id: "tez-1",
        threadId: "tez-1",
        parentTezId: null,
        surfaceText: "Hello from alpha",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [
        {
          id: "ctx-1",
          layer: "fact",
          content: "Some important context",
          mimeType: null,
          confidence: 95,
          source: "stated",
          createdAt: "2026-02-09T00:00:00Z",
          createdBy: "alice",
        },
      ],
      "alice@alpha.test",
      ["bob@beta.test"],
      identity,
    );

    expect(bundle.protocol_version).toBe("1.2.4");
    expect(bundle.bundle_type).toBe("federation_delivery");
    expect(bundle.sender_server).toBe("alpha.test");
    expect(bundle.from).toBe("alice@alpha.test");
    expect(bundle.to).toEqual(["bob@beta.test"]);
    expect(bundle.tez.surfaceText).toBe("Hello from alpha");
    expect(bundle.context).toHaveLength(1);
    expect(bundle.bundle_hash).toBeDefined();
    expect(bundle.bundle_hash.length).toBe(64); // SHA-256 hex
  });

  it("validates a well-formed bundle", async () => {
    const { createBundle, validateBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "test-server-id",
      publicKey: "test-pub-key",
      privateKeyPem: "test-priv",
      host: "alpha.test",
    };

    const bundle = createBundle(
      {
        id: "tez-1",
        threadId: "tez-1",
        parentTezId: null,
        surfaceText: "Valid message",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [],
      "alice@alpha.test",
      ["bob@beta.test"],
      identity,
    );

    expect(validateBundle(bundle)).toBeNull();
  });

  it("rejects bundle with tampered hash", async () => {
    const { createBundle, validateBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "test-server-id",
      publicKey: "test-pub-key",
      privateKeyPem: "test-priv",
      host: "alpha.test",
    };

    const bundle = createBundle(
      {
        id: "tez-1",
        threadId: "tez-1",
        parentTezId: null,
        surfaceText: "Original message",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [],
      "alice@alpha.test",
      ["bob@beta.test"],
      identity,
    );

    // Tamper with the surface text after hashing
    bundle.tez.surfaceText = "Tampered message";

    const error = validateBundle(bundle);
    expect(error).toContain("hash mismatch");
  });

  it("rejects bundle missing required fields", async () => {
    const { validateBundle } = await import("../src/services/federationBundle.js");

    expect(validateBundle(null)).toContain("non-null object");
    expect(validateBundle({})).toContain("bundle_type");
    expect(validateBundle({ bundle_type: "federation_delivery" })).toContain("sender_server");
    expect(validateBundle({
      bundle_type: "federation_delivery",
      sender_server: "a.test",
      sender_server_id: "abc",
      from: "alice@a.test",
      to: ["bob@b.test"],
    })).toContain("tez payload");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit: HTTP Signatures
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP Signatures", () => {
  it("signs and verifies a request", async () => {
    // Initialize identity first
    const { loadOrCreateIdentity, _resetIdentity } = await import("../src/services/identity.js");

    // Need a writable temp dir for keys
    const tmpDir = `/tmp/tezit-test-keys-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    _resetIdentity();

    const identity = loadOrCreateIdentity();

    const { signRequest, verifyRequest } = await import("../src/services/httpSignature.js");

    const body = JSON.stringify({ tez: { surfaceText: "hello" } });
    const signed = signRequest(
      { method: "POST", path: "/federation/inbox", host: "beta.test", body },
      identity.host,
    );

    expect(signed["X-Tezit-Signature"]).toBeDefined();
    expect(signed["X-Tezit-Server"]).toBe(identity.host);
    expect(signed["X-Tezit-Date"]).toBeDefined();
    expect(signed["X-Tezit-Digest"]).toBeDefined();
    expect(signed["X-Request-Nonce"]).toBeDefined();

    // Verify
    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": signed["X-Tezit-Signature"],
        "x-tezit-server": signed["X-Tezit-Server"],
        "x-tezit-date": signed["X-Tezit-Date"],
        "x-tezit-digest": signed["X-Tezit-Digest"],
        "x-request-nonce": signed["X-Request-Nonce"],
      },
      body,
      identity.publicKey,
    );

    expect(result.valid).toBe(true);
    expect(result.senderHost).toBe(identity.host);

    // Cleanup
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("rejects tampered body", async () => {
    const { loadOrCreateIdentity, _resetIdentity } = await import("../src/services/identity.js");

    const tmpDir = `/tmp/tezit-test-keys-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    _resetIdentity();

    const identity = loadOrCreateIdentity();
    const { signRequest, verifyRequest } = await import("../src/services/httpSignature.js");

    const originalBody = JSON.stringify({ tez: { surfaceText: "original" } });
    const signed = signRequest(
      { method: "POST", path: "/federation/inbox", host: "beta.test", body: originalBody },
      identity.host,
    );

    // Verify with different body
    const tamperedBody = JSON.stringify({ tez: { surfaceText: "tampered" } });
    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": signed["X-Tezit-Signature"],
        "x-tezit-server": signed["X-Tezit-Server"],
        "x-tezit-date": signed["X-Tezit-Date"],
        "x-tezit-digest": signed["X-Tezit-Digest"],
        "x-request-nonce": signed["X-Request-Nonce"],
      },
      tamperedBody,
      identity.publicKey,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("digest mismatch");

    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /federation/server-info
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /federation/server-info", () => {
  it("returns server identity when federation enabled", async () => {
    // Identity needs a writable data dir
    const tmpDir = `/tmp/tezit-test-keys-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const res = await request(app).get("/federation/server-info");

    expect(res.status).toBe(200);
    expect(res.body.host).toBeDefined();
    expect(res.body.server_id).toBeDefined();
    expect(res.body.public_key).toBeDefined();
    expect(res.body.protocol_version).toBe("1.2.4");
    expect(res.body.federation.enabled).toBe(true);
    expect(res.body.federation.inbox).toBe("/federation/inbox");

    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /federation/verify — Trust handshake
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /federation/verify", () => {
  it("registers a new server as trusted in open mode", async () => {
    const res = await request(app)
      .post("/federation/verify")
      .send({
        host: "beta.test",
        server_id: "beta-server-id",
        public_key: "beta-public-key-base64",
        display_name: "Beta Server",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("trusted"); // open mode auto-trusts
    expect(res.body.data.message).toContain("trusted");
  });

  it("updates an existing server record", async () => {
    // First register
    await request(app)
      .post("/federation/verify")
      .send({
        host: "beta.test",
        server_id: "beta-old-id",
        public_key: "beta-old-key",
      });

    // Re-verify with updated info
    const res = await request(app)
      .post("/federation/verify")
      .send({
        host: "beta.test",
        server_id: "beta-new-id",
        public_key: "beta-new-key",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("trusted");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/federation/verify")
      .send({ host: "beta.test" }); // missing server_id and public_key

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /federation/inbox — Receive a Tez from a remote server
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /federation/inbox", () => {
  it("accepts a valid federation bundle and creates local Tez", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");

    // Register the sending server as trusted
    const now = new Date().toISOString();
    await db.insert(schema.federatedServers).values({
      host: "beta.test",
      serverId: "beta-server-id",
      publicKey: "beta-public-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
    });

    // Create a local contact that the Tez is addressed to
    await db.insert(schema.contacts).values({
      id: MEMBER_USER,
      displayName: "Local Member",
      tezAddress: `${MEMBER_USER}@alpha.test`,
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    // Build a bundle
    const { createBundle } = await import("../src/services/federationBundle.js");
    const bundle = createBundle(
      {
        id: "remote-tez-123",
        threadId: "remote-tez-123",
        parentTezId: null,
        surfaceText: "Hello from beta server",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
      },
      [
        {
          id: "ctx-remote-1",
          layer: "background",
          content: "This is cross-server context",
          mimeType: null,
          confidence: null,
          source: "stated",
          createdAt: now,
          createdBy: "alice@beta.test",
        },
      ],
      "alice@beta.test",
      [`${MEMBER_USER}@alpha.test`],
      {
        serverId: "beta-server-id",
        publicKey: "beta-public-key",
        privateKeyPem: "",
        host: "beta.test",
      },
    );

    // We need to mock the signature verification since we can't actually sign
    // with the real beta server's key. Mock verifyRequest to pass.
    const httpSigModule = await import("../src/services/httpSignature.js");
    const origVerify = httpSigModule.verifyRequest;
    vi.spyOn(httpSigModule, "verifyRequest").mockReturnValue({
      valid: true,
      senderHost: "beta.test",
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "beta.test")
      .set("X-Tezit-Signature", "mock-sig")
      .set("X-Tezit-Date", now)
      .set("X-Tezit-Digest", "mock-digest")
      .set("X-Request-Nonce", randomUUID())
      .send(bundle);

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    expect(res.body.data.localTezIds).toHaveLength(1);

    // Verify the Tez was created locally
    const localTezId = res.body.data.localTezIds[0];
    const { eq } = await import("drizzle-orm");
    const tezRows = await db
      .select()
      .from(schema.tez)
      .where(eq(schema.tez.id, localTezId));

    expect(tezRows).toHaveLength(1);
    expect(tezRows[0].surfaceText).toBe("Hello from beta server");
    expect(tezRows[0].sourceChannel).toBe("federation");
    expect(tezRows[0].sourceAddress).toBe("alice@beta.test");

    // Verify context was stored
    const ctxRows = await db
      .select()
      .from(schema.tezContext)
      .where(eq(schema.tezContext.tezId, localTezId));

    expect(ctxRows).toHaveLength(1);
    expect(ctxRows[0].layer).toBe("background");
    expect(ctxRows[0].content).toBe("This is cross-server context");

    // Verify federated_tez record
    const fedRows = await db
      .select()
      .from(schema.federatedTez)
      .where(eq(schema.federatedTez.localTezId, localTezId));

    expect(fedRows).toHaveLength(1);
    expect(fedRows[0].remoteTezId).toBe("remote-tez-123");
    expect(fedRows[0].remoteHost).toBe("beta.test");
    expect(fedRows[0].direction).toBe("inbound");

    // Verify recipient record
    const recipRows = await db
      .select()
      .from(schema.tezRecipients)
      .where(eq(schema.tezRecipients.tezId, localTezId));

    expect(recipRows).toHaveLength(1);
    expect(recipRows[0].userId).toBe(MEMBER_USER);

    // Restore original
    vi.restoreAllMocks();
  });

  it("rejects bundle from unknown server in allowlist mode", async () => {
    // Switch to allowlist mode for this test
    const origMode = process.env.FEDERATION_MODE;
    process.env.FEDERATION_MODE = "allowlist";

    // Reimport config module to pick up new env
    // (config is evaluated once at import time, so we need to manipulate directly)
    const configModule = await import("../src/config.js");
    const origConfigMode = configModule.config.federationMode;
    (configModule.config as { federationMode: string }).federationMode = "allowlist";

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "unknown.test")
      .set("X-Tezit-Signature", "mock-sig")
      .set("X-Tezit-Date", new Date().toISOString())
      .set("X-Tezit-Digest", "mock-digest")
      .send({ bundle_type: "federation_delivery" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("UNKNOWN_SERVER");

    // Restore
    process.env.FEDERATION_MODE = origMode;
    (configModule.config as { federationMode: string }).federationMode = origConfigMode as string;
  });

  it("rejects bundle from blocked server", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");

    await db.insert(schema.federatedServers).values({
      host: "blocked.test",
      serverId: "blocked-id",
      publicKey: "blocked-key",
      trustLevel: "blocked",
      protocolVersion: "1.2.4",
      lastSeenAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "blocked.test")
      .send({ bundle_type: "federation_delivery" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SERVER_BLOCKED");
  });

  it("rejects bundle from pending server", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");

    await db.insert(schema.federatedServers).values({
      host: "pending.test",
      serverId: "pending-id",
      publicKey: "pending-key",
      trustLevel: "pending",
      protocolVersion: "1.2.4",
      lastSeenAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "pending.test")
      .send({ bundle_type: "federation_delivery" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SERVER_PENDING");
  });

  it("rejects request without X-Tezit-Server header", async () => {
    const res = await request(app)
      .post("/federation/inbox")
      .send({ bundle_type: "federation_delivery" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_SIGNATURE");
  });

  it("returns 422 when no local recipients match", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "beta.test",
      serverId: "beta-id",
      publicKey: "beta-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
    });

    const { createBundle } = await import("../src/services/federationBundle.js");
    const bundle = createBundle(
      {
        id: "tez-no-local",
        threadId: "tez-no-local",
        parentTezId: null,
        surfaceText: "Nobody here",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
      },
      [],
      "alice@beta.test",
      ["nobody@gamma.test"], // different host entirely
      {
        serverId: "beta-id",
        publicKey: "beta-key",
        privateKeyPem: "",
        host: "beta.test",
      },
    );

    const httpSigModule = await import("../src/services/httpSignature.js");
    vi.spyOn(httpSigModule, "verifyRequest").mockReturnValue({
      valid: true,
      senderHost: "beta.test",
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "beta.test")
      .set("X-Tezit-Signature", "mock-sig")
      .set("X-Tezit-Date", now)
      .set("X-Tezit-Digest", "mock-digest")
      .set("X-Request-Nonce", randomUUID())
      .send(bundle);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_LOCAL_RECIPIENTS");

    vi.restoreAllMocks();
  });

  it("returns 207 for partial delivery (some recipients not found)", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "beta.test",
      serverId: "beta-id",
      publicKey: "beta-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
    });

    // Create one real local contact
    await db.insert(schema.contacts).values({
      id: "local-user",
      displayName: "Local User",
      tezAddress: "local-user@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    const { createBundle } = await import("../src/services/federationBundle.js");
    const bundle = createBundle(
      {
        id: "tez-partial",
        threadId: "tez-partial",
        parentTezId: null,
        surfaceText: "Partial delivery test",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
      },
      [],
      "alice@beta.test",
      ["local-user@alpha.test", "ghost@alpha.test"], // one exists, one doesn't
      {
        serverId: "beta-id",
        publicKey: "beta-key",
        privateKeyPem: "",
        host: "beta.test",
      },
    );

    const httpSigModule = await import("../src/services/httpSignature.js");
    vi.spyOn(httpSigModule, "verifyRequest").mockReturnValue({
      valid: true,
      senderHost: "beta.test",
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "beta.test")
      .set("X-Tezit-Signature", "mock-sig")
      .set("X-Tezit-Date", now)
      .set("X-Tezit-Digest", "mock-digest")
      .set("X-Request-Nonce", randomUUID())
      .send(bundle);

    expect(res.status).toBe(207);
    expect(res.body.data.accepted).toBe(true);
    expect(res.body.data.partial).toBe(true);
    expect(res.body.data.failures).toHaveLength(1);
    expect(res.body.data.failures[0].address).toBe("ghost@alpha.test");

    vi.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin routes — trust management
// ─────────────────────────────────────────────────────────────────────────────

describe("Admin routes", () => {
  it("lists federated servers", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "server-a.test",
      serverId: "a-id",
      publicKey: "a-key",
      trustLevel: "trusted",
      firstSeenAt: now,
    });

    await db.insert(schema.federatedServers).values({
      host: "server-b.test",
      serverId: "b-id",
      publicKey: "b-key",
      trustLevel: "pending",
      firstSeenAt: now,
    });

    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .get("/admin/federation/servers")
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("updates trust level of a server", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "upgrade.test",
      serverId: "u-id",
      publicKey: "u-key",
      trustLevel: "pending",
      firstSeenAt: now,
    });

    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .patch("/admin/federation/servers/upgrade.test")
      .set("Authorization", token)
      .send({ trustLevel: "trusted" });

    expect(res.status).toBe(200);
    expect(res.body.data.trustLevel).toBe("trusted");

    // Verify in DB
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.federatedServers)
      .where(eq(schema.federatedServers.host, "upgrade.test"));

    expect(rows[0].trustLevel).toBe("trusted");
  });

  it("blocks a server", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "malicious.test",
      serverId: "m-id",
      publicKey: "m-key",
      trustLevel: "trusted",
      firstSeenAt: now,
    });

    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .patch("/admin/federation/servers/malicious.test")
      .set("Authorization", token)
      .send({ trustLevel: "blocked" });

    expect(res.status).toBe(200);
    expect(res.body.data.trustLevel).toBe("blocked");
  });

  it("deletes a server from trust registry", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    await db.insert(schema.federatedServers).values({
      host: "remove.test",
      serverId: "r-id",
      publicKey: "r-key",
      trustLevel: "trusted",
      firstSeenAt: now,
    });

    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .delete("/admin/federation/servers/remove.test")
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);

    // Verify gone from DB
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(schema.federatedServers)
      .where(eq(schema.federatedServers.host, "remove.test"));

    expect(rows).toHaveLength(0);
  });

  it("returns 404 for non-existent server", async () => {
    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .patch("/admin/federation/servers/nonexistent.test")
      .set("Authorization", token)
      .send({ trustLevel: "trusted" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid trust level", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");

    await db.insert(schema.federatedServers).values({
      host: "invalid.test",
      serverId: "i-id",
      publicKey: "i-key",
      trustLevel: "trusted",
      firstSeenAt: new Date().toISOString(),
    });

    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .patch("/admin/federation/servers/invalid.test")
      .set("Authorization", token)
      .send({ trustLevel: "superduper" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TRUST_LEVEL");
  });

  it("returns 403 for non-admin user", async () => {
    const token = await authHeader(OUTSIDER_USER);
    const res = await request(app)
      .get("/admin/federation/servers")
      .set("Authorization", token);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/admin/federation/servers");

    expect(res.status).toBe(401);
  });

  it("lists outbox items", async () => {
    const token = await authHeader(ADMIN_USER);
    const res = await request(app)
      .get("/admin/federation/outbox")
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outbound federation — isRemoteAddress
// ─────────────────────────────────────────────────────────────────────────────

describe("Outbound federation helpers", () => {
  it("detects remote addresses correctly", async () => {
    const { isRemoteAddress } = await import("../src/services/federationOutbound.js");

    // Local addresses should not be remote
    expect(isRemoteAddress("alice@alpha.test")).toBe(false);

    // Remote addresses should be detected
    expect(isRemoteAddress("bob@beta.test")).toBe(true);
    expect(isRemoteAddress("carol@gamma.test")).toBe(true);

    // No @ sign = not remote
    expect(isRemoteAddress("alice")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outbound Flow — create tez → outbox entry → bundle format
// ─────────────────────────────────────────────────────────────────────────────

describe("Outbound federation flow", () => {
  it("queues a federation delivery when tez has remote recipients", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const now = new Date().toISOString();

    // Create a local sender contact
    await db.insert(schema.contacts).values({
      id: "sender-user-1",
      displayName: "Sender User",
      tezAddress: "sender-user-1@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    // Create a remote recipient contact (on beta.test)
    await db.insert(schema.contacts).values({
      id: "remote-recip-1",
      displayName: "Remote Recipient",
      tezAddress: "remote-recip-1@beta.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    // Register beta.test in federated_servers so discovery falls back to DB
    await db.insert(schema.federatedServers).values({
      host: "beta.test",
      serverId: "beta-server-id",
      publicKey: "beta-public-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
      metadata: { federationInbox: "/federation/inbox", profiles: ["messaging"] },
    });

    // Create a local tez record
    const tezId = randomUUID();
    await db.insert(schema.tez).values({
      id: tezId,
      teamId: null,
      threadId: tezId,
      parentTezId: null,
      surfaceText: "Hello to remote server",
      type: "note",
      urgency: "normal",
      actionRequested: null,
      senderUserId: "sender-user-1",
      visibility: "dm",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Add context
    await db.insert(schema.tezContext).values({
      id: randomUUID(),
      tezId,
      layer: "background",
      content: "Some important background for remote delivery",
      mimeType: null,
      confidence: null,
      source: "stated",
      derivedFrom: null,
      createdAt: now,
      createdBy: "sender-user-1",
    });

    // Mock fetch so processOutbox doesn't make real HTTP calls
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { accepted: true, localTezIds: ["remote-local-1"] } }),
      text: async () => "OK",
    }) as unknown as typeof fetch;

    // Need a writable data dir for identity
    const tmpDir = `/tmp/tezit-test-outbound-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const { routeToFederation } = await import("../src/services/federationOutbound.js");

    const result = await routeToFederation(
      {
        id: tezId,
        threadId: tezId,
        parentTezId: null,
        surfaceText: "Hello to remote server",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
        senderUserId: "sender-user-1",
      },
      ["remote-recip-1"],
    );

    expect(result.queued).toBe(1);
    expect(result.remoteHosts).toContain("beta.test");

    // Verify outbox entry was created
    const outboxRows = await db
      .select()
      .from(schema.federationOutbox)
      .where(eq(schema.federationOutbox.tezId, tezId));

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    const outboxEntry = outboxRows[0];
    expect(outboxEntry.targetHost).toBe("beta.test");
    expect(outboxEntry.status).toMatch(/^(pending|delivered|failed)$/);

    // Verify the bundle stored in outbox has correct structure
    const bundle = outboxEntry.bundle as unknown as Record<string, unknown>;
    expect(bundle.protocol_version).toBe("1.2.4");
    expect(bundle.bundle_type).toBe("federation_delivery");
    expect(bundle.sender_server).toBe("alpha.test");
    expect(bundle.from).toBe("sender-user-1@alpha.test");
    expect(bundle.to).toEqual(["remote-recip-1@beta.test"]);
    expect((bundle.tez as Record<string, unknown>).surfaceText).toBe("Hello to remote server");
    expect(bundle.bundle_hash).toBeDefined();
    expect((bundle.bundle_hash as string).length).toBe(64); // SHA-256 hex

    // Verify context was included in the bundle
    const bundleContext = bundle.context as Array<Record<string, unknown>>;
    expect(bundleContext).toHaveLength(1);
    expect(bundleContext[0].layer).toBe("background");
    expect(bundleContext[0].content).toBe("Some important background for remote delivery");

    // Cleanup
    globalThis.fetch = origFetch;
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("does not queue federation when all recipients are local", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const now = new Date().toISOString();

    // Create local sender and recipient (both on alpha.test)
    await db.insert(schema.contacts).values({
      id: "local-sender",
      displayName: "Local Sender",
      tezAddress: "local-sender@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    await db.insert(schema.contacts).values({
      id: "local-recip",
      displayName: "Local Recipient",
      tezAddress: "local-recip@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    const tezId = randomUUID();
    await db.insert(schema.tez).values({
      id: tezId,
      teamId: null,
      threadId: tezId,
      parentTezId: null,
      surfaceText: "Local message",
      type: "note",
      urgency: "normal",
      actionRequested: null,
      senderUserId: "local-sender",
      visibility: "dm",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const tmpDir = `/tmp/tezit-test-local-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const { routeToFederation } = await import("../src/services/federationOutbound.js");

    const result = await routeToFederation(
      {
        id: tezId,
        threadId: tezId,
        parentTezId: null,
        surfaceText: "Local message",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
        senderUserId: "local-sender",
      },
      ["local-recip"],
    );

    expect(result.queued).toBe(0);
    expect(result.remoteHosts).toHaveLength(0);

    // No outbox entries should exist
    const outboxRows = await db.select().from(schema.federationOutbox);
    expect(outboxRows).toHaveLength(0);

    // Cleanup
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Loopback — same server as both sender and recipient (full round-trip)
// ─────────────────────────────────────────────────────────────────────────────

describe("Federation loopback (same-server round-trip)", () => {
  it("delivers a tez from user A to user B on the same server via federation inbox", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const now = new Date().toISOString();

    // Need a writable data dir for real keypair
    const tmpDir = `/tmp/tezit-test-loopback-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity, loadOrCreateIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const identity = loadOrCreateIdentity();

    // Register self as trusted server
    await db.insert(schema.federatedServers).values({
      host: "alpha.test",
      serverId: identity.serverId,
      publicKey: identity.publicKey,
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
    });

    // Create two local users
    await db.insert(schema.contacts).values({
      id: "user-a",
      displayName: "User A (Sender)",
      tezAddress: "user-a@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    await db.insert(schema.contacts).values({
      id: "user-b",
      displayName: "User B (Recipient)",
      tezAddress: "user-b@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    // Create a federation bundle from user A to user B
    const { createBundle } = await import("../src/services/federationBundle.js");
    const bundle = createBundle(
      {
        id: "loopback-tez-1",
        threadId: "loopback-tez-1",
        parentTezId: null,
        surfaceText: "Loopback message from A to B",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: now,
      },
      [
        {
          id: "ctx-loopback-1",
          layer: "fact",
          content: "This context survived the loopback",
          mimeType: null,
          confidence: 99,
          source: "stated",
          createdAt: now,
          createdBy: "user-a@alpha.test",
        },
      ],
      "user-a@alpha.test",
      ["user-b@alpha.test"],
      identity,
    );

    // Sign the request with the real identity
    const { signRequest } = await import("../src/services/httpSignature.js");
    const bodyStr = JSON.stringify(bundle);
    const signedHeaders = signRequest(
      { method: "POST", path: "/federation/inbox", host: "alpha.test", body: bodyStr },
      identity.host,
    );

    // Deliver via the federation inbox endpoint using real signature
    // We need to mock verifyRequest because the Express test doesn't know the
    // exact host header the route handler will use (req.hostname in supertest may differ).
    const httpSigModule = await import("../src/services/httpSignature.js");
    vi.spyOn(httpSigModule, "verifyRequest").mockReturnValue({
      valid: true,
      senderHost: "alpha.test",
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "alpha.test")
      .set("X-Tezit-Signature", signedHeaders["X-Tezit-Signature"])
      .set("X-Tezit-Date", signedHeaders["X-Tezit-Date"])
      .set("X-Tezit-Digest", signedHeaders["X-Tezit-Digest"])
      .set("X-Request-Nonce", signedHeaders["X-Request-Nonce"])
      .send(bundle);

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    expect(res.body.data.localTezIds).toHaveLength(1);

    const localTezId = res.body.data.localTezIds[0];

    // Verify the tez was created locally with correct content
    const tezRows = await db
      .select()
      .from(schema.tez)
      .where(eq(schema.tez.id, localTezId));

    expect(tezRows).toHaveLength(1);
    expect(tezRows[0].surfaceText).toBe("Loopback message from A to B");
    expect(tezRows[0].sourceChannel).toBe("federation");
    expect(tezRows[0].sourceAddress).toBe("user-a@alpha.test");

    // Verify context survived the loopback
    const ctxRows = await db
      .select()
      .from(schema.tezContext)
      .where(eq(schema.tezContext.tezId, localTezId));

    expect(ctxRows).toHaveLength(1);
    expect(ctxRows[0].layer).toBe("fact");
    expect(ctxRows[0].content).toBe("This context survived the loopback");

    // Verify user B is recorded as a recipient
    const recipRows = await db
      .select()
      .from(schema.tezRecipients)
      .where(eq(schema.tezRecipients.tezId, localTezId));

    expect(recipRows).toHaveLength(1);
    expect(recipRows[0].userId).toBe("user-b");

    // Verify the federated_tez record links back to the original
    const fedRows = await db
      .select()
      .from(schema.federatedTez)
      .where(eq(schema.federatedTez.localTezId, localTezId));

    expect(fedRows).toHaveLength(1);
    expect(fedRows[0].remoteTezId).toBe("loopback-tez-1");
    expect(fedRows[0].remoteHost).toBe("alpha.test");
    expect(fedRows[0].direction).toBe("inbound");

    // Cleanup
    vi.restoreAllMocks();
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("delivers loopback tez with multiple local recipients", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    const now = new Date().toISOString();

    const tmpDir = `/tmp/tezit-test-loopback-multi-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity, loadOrCreateIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const identity = loadOrCreateIdentity();

    await db.insert(schema.federatedServers).values({
      host: "alpha.test",
      serverId: identity.serverId,
      publicKey: identity.publicKey,
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
    });

    // Create sender and two local recipients
    await db.insert(schema.contacts).values({
      id: "multi-sender",
      displayName: "Multi Sender",
      tezAddress: "multi-sender@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    await db.insert(schema.contacts).values({
      id: "recip-x",
      displayName: "Recipient X",
      tezAddress: "recip-x@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    await db.insert(schema.contacts).values({
      id: "recip-y",
      displayName: "Recipient Y",
      tezAddress: "recip-y@alpha.test",
      status: "active",
      registeredAt: now,
      updatedAt: now,
    });

    const { createBundle } = await import("../src/services/federationBundle.js");
    const bundle = createBundle(
      {
        id: "loopback-multi-tez",
        threadId: "loopback-multi-tez",
        parentTezId: null,
        surfaceText: "Message to multiple local users",
        type: "note",
        urgency: "high",
        actionRequested: "Please review",
        visibility: "dm",
        createdAt: now,
      },
      [],
      "multi-sender@alpha.test",
      ["recip-x@alpha.test", "recip-y@alpha.test"],
      identity,
    );

    const httpSigModule = await import("../src/services/httpSignature.js");
    vi.spyOn(httpSigModule, "verifyRequest").mockReturnValue({
      valid: true,
      senderHost: "alpha.test",
    });

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "alpha.test")
      .set("X-Tezit-Signature", "mock-sig")
      .set("X-Tezit-Date", now)
      .set("X-Tezit-Digest", "mock-digest")
      .set("X-Request-Nonce", randomUUID())
      .send(bundle);

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);

    const localTezId = res.body.data.localTezIds[0];

    // Both recipients should be recorded
    const recipRows = await db
      .select()
      .from(schema.tezRecipients)
      .where(eq(schema.tezRecipients.tezId, localTezId));

    expect(recipRows).toHaveLength(2);
    const recipientIds = recipRows.map((r) => r.userId).sort();
    expect(recipientIds).toEqual(["recip-x", "recip-y"]);

    // Cleanup
    vi.restoreAllMocks();
    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bundle Integrity — SHA-256 hash verification and tamper detection
// ─────────────────────────────────────────────────────────────────────────────

describe("Bundle integrity (SHA-256)", () => {
  it("computeBundleHash produces a 64-char hex SHA-256", async () => {
    const { computeBundleHash } = await import("../src/services/federationBundle.js");

    const hash = computeBundleHash(
      {
        id: "tez-hash-1",
        threadId: "tez-hash-1",
        parentTezId: null,
        surfaceText: "Hash test",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [],
    );

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("same payload always produces the same hash (deterministic)", async () => {
    const { computeBundleHash } = await import("../src/services/federationBundle.js");

    const tezPayload = {
      id: "tez-deterministic",
      threadId: "tez-deterministic",
      parentTezId: null,
      surfaceText: "Deterministic hash test",
      type: "note" as const,
      urgency: "normal" as const,
      actionRequested: null,
      visibility: "dm" as const,
      createdAt: "2026-02-09T12:00:00Z",
    };

    const contextPayload = [
      {
        id: "ctx-det-1",
        layer: "fact",
        content: "A verifiable claim",
        mimeType: null,
        confidence: 95,
        source: "verified",
        createdAt: "2026-02-09T12:00:00Z",
        createdBy: "alice",
      },
    ];

    const hash1 = computeBundleHash(tezPayload, contextPayload);
    const hash2 = computeBundleHash(tezPayload, contextPayload);
    const hash3 = computeBundleHash(tezPayload, contextPayload);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it("different payloads produce different hashes", async () => {
    const { computeBundleHash } = await import("../src/services/federationBundle.js");

    const baseTez = {
      id: "tez-diff-1",
      threadId: "tez-diff-1",
      parentTezId: null,
      surfaceText: "Original message",
      type: "note" as const,
      urgency: "normal" as const,
      actionRequested: null,
      visibility: "dm" as const,
      createdAt: "2026-02-09T00:00:00Z",
    };

    const modifiedTez = { ...baseTez, surfaceText: "Modified message" };

    const hash1 = computeBundleHash(baseTez, []);
    const hash2 = computeBundleHash(modifiedTez, []);

    expect(hash1).not.toBe(hash2);
  });

  it("validateBundle rejects when surface text is tampered post-hash", async () => {
    const { createBundle, validateBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "integrity-server",
      publicKey: "integrity-pub",
      privateKeyPem: "integrity-priv",
      host: "integrity.test",
    };

    const bundle = createBundle(
      {
        id: "tez-tamper-surface",
        threadId: "tez-tamper-surface",
        parentTezId: null,
        surfaceText: "Authentic message",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [
        {
          id: "ctx-tamper-1",
          layer: "fact",
          content: "Verified fact",
          mimeType: null,
          confidence: 100,
          source: "verified",
          createdAt: "2026-02-09T00:00:00Z",
          createdBy: "alice",
        },
      ],
      "alice@integrity.test",
      ["bob@other.test"],
      identity,
    );

    // Untampered should be valid
    expect(validateBundle(bundle)).toBeNull();

    // Tamper with surface text
    bundle.tez.surfaceText = "Forged message";
    const error = validateBundle(bundle);
    expect(error).toContain("hash mismatch");
  });

  it("validateBundle rejects when context is tampered post-hash", async () => {
    const { createBundle, validateBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "ctx-tamper-server",
      publicKey: "ctx-tamper-pub",
      privateKeyPem: "ctx-tamper-priv",
      host: "ctx-tamper.test",
    };

    const bundle = createBundle(
      {
        id: "tez-ctx-tamper",
        threadId: "tez-ctx-tamper",
        parentTezId: null,
        surfaceText: "Message with tampered context",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [
        {
          id: "ctx-orig",
          layer: "background",
          content: "Original context content",
          mimeType: null,
          confidence: null,
          source: "stated",
          createdAt: "2026-02-09T00:00:00Z",
          createdBy: "alice",
        },
      ],
      "alice@ctx-tamper.test",
      ["bob@other.test"],
      identity,
    );

    // Untampered should be valid
    expect(validateBundle(bundle)).toBeNull();

    // Tamper with context content
    bundle.context[0].content = "Injected malicious context";
    const error = validateBundle(bundle);
    expect(error).toContain("hash mismatch");
  });

  it("validateBundle rejects when context item is added post-hash", async () => {
    const { createBundle, validateBundle } = await import("../src/services/federationBundle.js");

    const identity = {
      serverId: "add-ctx-server",
      publicKey: "add-ctx-pub",
      privateKeyPem: "add-ctx-priv",
      host: "add-ctx.test",
    };

    const bundle = createBundle(
      {
        id: "tez-add-ctx",
        threadId: "tez-add-ctx",
        parentTezId: null,
        surfaceText: "Bundle with injected context",
        type: "note",
        urgency: "normal",
        actionRequested: null,
        visibility: "dm",
        createdAt: "2026-02-09T00:00:00Z",
      },
      [],
      "alice@add-ctx.test",
      ["bob@other.test"],
      identity,
    );

    // Valid with no context
    expect(validateBundle(bundle)).toBeNull();

    // Inject a context item after hashing
    bundle.context.push({
      id: "injected-ctx",
      layer: "hint",
      content: "This was injected after bundle creation",
      mimeType: null,
      confidence: null,
      source: "stated",
      createdAt: "2026-02-09T00:00:00Z",
      createdBy: "attacker",
    });

    const error = validateBundle(bundle);
    expect(error).toContain("hash mismatch");
  });

  it("bundle hash is independent of envelope metadata", async () => {
    const { createBundle, computeBundleHash } = await import("../src/services/federationBundle.js");

    const tezData = {
      id: "tez-envelope-test",
      threadId: "tez-envelope-test",
      parentTezId: null,
      surfaceText: "Same payload, different envelopes",
      type: "note" as const,
      urgency: "normal" as const,
      actionRequested: null,
      visibility: "dm" as const,
      createdAt: "2026-02-09T00:00:00Z",
    };

    const contextData: Array<{
      id: string;
      layer: string;
      content: string;
      mimeType: string | null;
      confidence: number | null;
      source: string | null;
      createdAt: string;
      createdBy: string;
    }> = [];

    // Create two bundles with different senders/recipients but same tez payload
    const bundle1 = createBundle(tezData, contextData, "alice@server-a.test", ["bob@server-b.test"], {
      serverId: "server-a-id",
      publicKey: "server-a-key",
      privateKeyPem: "",
      host: "server-a.test",
    });

    const bundle2 = createBundle(tezData, contextData, "carol@server-c.test", ["dave@server-d.test"], {
      serverId: "server-c-id",
      publicKey: "server-c-key",
      privateKeyPem: "",
      host: "server-c.test",
    });

    // Hash should be the same because it only covers tez + context
    expect(bundle1.bundle_hash).toBe(bundle2.bundle_hash);

    // And it matches the standalone computation
    const standaloneHash = computeBundleHash(tezData, contextData);
    expect(bundle1.bundle_hash).toBe(standaloneHash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Signature Verification — expired, missing headers, wrong key
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP Signature verification (extended)", () => {
  it("rejects request with expired date (older than 60 seconds)", async () => {
    const { loadOrCreateIdentity, _resetIdentity } = await import("../src/services/identity.js");

    const tmpDir = `/tmp/tezit-test-sig-expired-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    _resetIdentity();

    const identity = loadOrCreateIdentity();
    const { signRequest, verifyRequest, bodyDigest } = await import("../src/services/httpSignature.js");

    const body = JSON.stringify({ tez: { surfaceText: "expired test" } });

    // Sign with current time
    const signed = signRequest(
      { method: "POST", path: "/federation/inbox", host: "beta.test", body },
      identity.host,
    );

    // Tamper with the date to make it 2 minutes old (> 60sec threshold)
    const oldDate = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": signed["X-Tezit-Signature"],
        "x-tezit-server": signed["X-Tezit-Server"],
        "x-tezit-date": oldDate, // expired date
        "x-tezit-digest": signed["X-Tezit-Digest"],
        "x-request-nonce": signed["X-Request-Nonce"],
      },
      body,
      identity.publicKey,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("too old");

    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("rejects request with future date (more than 60 seconds ahead)", async () => {
    const { loadOrCreateIdentity, _resetIdentity } = await import("../src/services/identity.js");

    const tmpDir = `/tmp/tezit-test-sig-future-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    _resetIdentity();

    const identity = loadOrCreateIdentity();
    const { verifyRequest, bodyDigest } = await import("../src/services/httpSignature.js");

    const body = JSON.stringify({ tez: { surfaceText: "future test" } });
    const futureDate = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const digest = bodyDigest(body);

    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": "irrelevant-because-date-check-first",
        "x-tezit-server": identity.host,
        "x-tezit-date": futureDate,
        "x-tezit-digest": digest,
        "x-request-nonce": "test-nonce-future",
      },
      body,
      identity.publicKey,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("too old or too far in future");

    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("rejects request with missing signature headers", async () => {
    const { verifyRequest } = await import("../src/services/httpSignature.js");
    const body = JSON.stringify({ test: true });

    // All headers missing
    const result1 = verifyRequest("POST", "/federation/inbox", "beta.test", {}, body, "some-key");
    expect(result1.valid).toBe(false);
    expect(result1.error).toContain("Missing federation signature headers");

    // Only server present, rest missing
    const result2 = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      { "x-tezit-server": "alpha.test" },
      body,
      "some-key",
    );
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain("Missing federation signature headers");
  });

  it("rejects request signed with wrong key", async () => {
    const { generateKeyPairSync, createPublicKey, createPrivateKey, sign } = await import("node:crypto");
    const { verifyRequest, bodyDigest } = await import("../src/services/httpSignature.js");

    // Generate two distinct Ed25519 keypairs directly (bypassing identity module)
    const keypair1 = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const keypair2 = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Get base64 DER public keys
    const pubKey1Der = createPublicKey(keypair1.publicKey).export({ type: "spki", format: "der" });
    const pubKey1Base64 = pubKey1Der.toString("base64");

    const pubKey2Der = createPublicKey(keypair2.publicKey).export({ type: "spki", format: "der" });
    const pubKey2Base64 = pubKey2Der.toString("base64");

    // Sign with keypair2's private key
    const body = JSON.stringify({ tez: { surfaceText: "wrong key test" } });
    const date = new Date().toISOString();
    const digest = bodyDigest(body);
    const nonce = "test-nonce-wrong-key";
    const canonical = `POST\n/federation/inbox\nbeta.test\n${date}\n${digest}\n${nonce}`;

    const privKey2 = createPrivateKey(keypair2.privateKey);
    const signature = sign(null, Buffer.from(canonical), privKey2);

    // Verify with keypair1's public key (should fail — different key)
    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": signature.toString("base64"),
        "x-tezit-server": "alpha.test",
        "x-tezit-date": date,
        "x-tezit-digest": digest,
        "x-request-nonce": nonce,
      },
      body,
      pubKey1Base64, // different key than what signed it
    );

    expect(result.valid).toBe(false);
    // Could be "Signature verification failed" or "Signature verification error"
    expect(result.error).toContain("Signature verification");
  });

  it("rejects request with mismatched digest (body integrity)", async () => {
    const { verifyRequest, bodyDigest } = await import("../src/services/httpSignature.js");

    const body = JSON.stringify({ tez: { surfaceText: "digest test" } });
    const wrongDigest = bodyDigest(JSON.stringify({ tez: { surfaceText: "different body" } }));
    const date = new Date().toISOString();

    const result = verifyRequest(
      "POST",
      "/federation/inbox",
      "beta.test",
      {
        "x-tezit-signature": "irrelevant-because-digest-fails-first",
        "x-tezit-server": "alpha.test",
        "x-tezit-date": date,
        "x-tezit-digest": wrongDigest,
        "x-request-nonce": "test-nonce-digest",
      },
      body,
      "some-public-key",
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain("digest mismatch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discovery endpoint — .well-known/tezit.json and /federation/server-info
// ─────────────────────────────────────────────────────────────────────────────

describe("Discovery endpoint", () => {
  it("GET /federation/server-info returns correct format with all required fields", async () => {
    const tmpDir = `/tmp/tezit-test-discovery-${randomUUID()}`;
    process.env.DATA_DIR = tmpDir;
    const { _resetIdentity } = await import("../src/services/identity.js");
    _resetIdentity();

    const res = await request(app).get("/federation/server-info");

    expect(res.status).toBe(200);

    // Required top-level fields
    expect(res.body.host).toBe("alpha.test");
    expect(res.body.server_id).toBeDefined();
    expect(typeof res.body.server_id).toBe("string");
    expect(res.body.server_id.length).toBe(64); // full SHA-256 hex digest

    expect(res.body.public_key).toBeDefined();
    expect(typeof res.body.public_key).toBe("string");
    expect(res.body.public_key.length).toBeGreaterThan(0);

    expect(res.body.protocol_version).toBe("1.2.4");

    // Profiles
    expect(res.body.profiles).toBeDefined();
    expect(Array.isArray(res.body.profiles)).toBe(true);
    expect(res.body.profiles).toContain("messaging");

    // Federation sub-object
    expect(res.body.federation).toBeDefined();
    expect(res.body.federation.enabled).toBe(true);
    expect(res.body.federation.mode).toBe("open"); // FEDERATION_MODE is set to "open" at top
    expect(res.body.federation.inbox).toBe("/federation/inbox");

    const { rmSync } = await import("fs");
    rmSync(tmpDir, { recursive: true, force: true });
    _resetIdentity();
    process.env.DATA_DIR = "./data";
  });

  it("GET /federation/server-info returns 404 when federation disabled", async () => {
    const origEnabled = process.env.FEDERATION_ENABLED;
    process.env.FEDERATION_ENABLED = "false";

    const configModule = await import("../src/config.js");
    const origConfigEnabled = configModule.config.federationEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = false;

    const res = await request(app).get("/federation/server-info");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("FEDERATION_DISABLED");

    // Restore
    process.env.FEDERATION_ENABLED = origEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = origConfigEnabled as boolean;
  });

  it("POST /federation/verify returns 404 when federation disabled", async () => {
    const origEnabled = process.env.FEDERATION_ENABLED;
    process.env.FEDERATION_ENABLED = "false";

    const configModule = await import("../src/config.js");
    const origConfigEnabled = configModule.config.federationEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = false;

    const res = await request(app)
      .post("/federation/verify")
      .send({
        host: "beta.test",
        server_id: "beta-id",
        public_key: "beta-key",
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("FEDERATION_DISABLED");

    // Restore
    process.env.FEDERATION_ENABLED = origEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = origConfigEnabled as boolean;
  });

  it("POST /federation/inbox returns 404 when federation disabled", async () => {
    const origEnabled = process.env.FEDERATION_ENABLED;
    process.env.FEDERATION_ENABLED = "false";

    const configModule = await import("../src/config.js");
    const origConfigEnabled = configModule.config.federationEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = false;

    const res = await request(app)
      .post("/federation/inbox")
      .set("X-Tezit-Server", "beta.test")
      .send({ bundle_type: "federation_delivery" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("FEDERATION_DISABLED");

    // Restore
    process.env.FEDERATION_ENABLED = origEnabled;
    (configModule.config as { federationEnabled: boolean }).federationEnabled = origConfigEnabled as boolean;
  });

  it("discovery service falls back to DB when network is unreachable", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const { clearDiscoveryCache } = await import("../src/services/discovery.js");
    const now = new Date().toISOString();

    clearDiscoveryCache();

    // Insert a server record in the DB
    await db.insert(schema.federatedServers).values({
      host: "offline.test",
      serverId: "offline-id",
      publicKey: "offline-pub-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
      metadata: { federationInbox: "/federation/inbox", profiles: ["messaging"] },
    });

    // discoverServer should find it from DB (network fetch will fail for offline.test)
    const { discoverServer } = await import("../src/services/discovery.js");
    const info = await discoverServer("offline.test");

    expect(info).not.toBeNull();
    expect(info!.host).toBe("offline.test");
    expect(info!.serverId).toBe("offline-id");
    expect(info!.publicKey).toBe("offline-pub-key");
    expect(info!.federationInbox).toBe("/federation/inbox");
    expect(info!.protocolVersion).toBe("1.2.4");
  });

  it("discovery service returns null for completely unknown server", async () => {
    const { clearDiscoveryCache, discoverServer } = await import("../src/services/discovery.js");
    clearDiscoveryCache();

    // This server doesn't exist in DB and network fetch will fail
    const info = await discoverServer("totally-unknown-server-that-does-not-exist.test");
    expect(info).toBeNull();
  });

  it("discovery service caches results", async () => {
    const db = getTestDb();
    const schema = await import("../src/db/schema.js");
    const { clearDiscoveryCache, discoverServer } = await import("../src/services/discovery.js");
    const now = new Date().toISOString();

    clearDiscoveryCache();

    await db.insert(schema.federatedServers).values({
      host: "cached.test",
      serverId: "cached-id",
      publicKey: "cached-pub-key",
      trustLevel: "trusted",
      protocolVersion: "1.2.4",
      lastSeenAt: now,
      firstSeenAt: now,
      metadata: { federationInbox: "/federation/inbox", profiles: [] },
    });

    // First call — hits DB
    const info1 = await discoverServer("cached.test");
    expect(info1).not.toBeNull();

    // Delete from DB — second call should still work (from cache)
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.federatedServers).where(eq(schema.federatedServers.host, "cached.test"));

    const info2 = await discoverServer("cached.test");
    expect(info2).not.toBeNull();
    expect(info2!.serverId).toBe("cached-id");
  });
});
