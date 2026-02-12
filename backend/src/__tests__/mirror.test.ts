/**
 * Tez Mirror Tests
 *
 * Tests for the Tez Mirror backend:
 * - Mirror renderer service (all 3 templates)
 * - Mirror API (render preview, send/audit logging)
 * - Mirror settings (GET defaults, PATCH upsert)
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express, { type Express } from "express";
import cors from "cors";
import request from "supertest";
import {
  createTestDb,
  cleanupTestDb,
  createTestUser,
  createTestCard,
  insertTestUser,
  insertTestCard,
  insertTestContext,
  generateTestToken,
  authHeaders,
} from "./helpers.js";
import { renderMirror } from "../services/tezMirrorRenderer.js";
import tezRoutes from "../routes/tez.js";
import settingsRoutes from "../routes/settings.js";
import { eq } from "drizzle-orm";
import { mirrorAuditLog } from "../db/schema.js";

let app: Express;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let client: Awaited<ReturnType<typeof createTestDb>>["client"];

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  client = testDb.client;

  // Create test Express app with tez and settings routes
  app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/tez", tezRoutes);
  app.use("/api/settings", settingsRoutes);
});

afterAll(async () => {
  await cleanupTestDb();
});

// ============= Mirror Renderer Tests =============

describe("Mirror Renderer Service", () => {
  it("renders teaser template (~50 chars)", () => {
    const result = renderMirror("teaser", {
      cardId: "test-123",
      content: "This is a long message that should be truncated because it exceeds the limit",
      summary: "Short summary",
      senderName: "Alice",
      createdAt: new Date("2024-01-15"),
      appendDeepLink: true,
    });

    expect(result.template).toBe("teaser");
    expect(result.rendered).toContain("Alice:");
    expect(result.rendered).toContain("Short summary");
    expect(result.deepLink).toContain("tez://mypa/test-123");
    expect(result.charCount).toBe(result.rendered.length);
    expect(result.rendered.length).toBeLessThan(100); // Teaser is short
  });

  it("renders teaser without deep link", () => {
    const result = renderMirror("teaser", {
      cardId: "test-123",
      content: "Message content",
      senderName: "Bob",
      createdAt: new Date(),
      appendDeepLink: false,
    });

    expect(result.deepLink).toBeNull();
    expect(result.rendered).not.toContain("tez://");
  });

  it("truncates long content in teaser", () => {
    const longContent = "A".repeat(200);
    const result = renderMirror("teaser", {
      cardId: "test-123",
      content: longContent,
      senderName: "Charlie",
      createdAt: new Date(),
      appendDeepLink: false,
    });

    expect(result.rendered).toContain("\u2026"); // Ellipsis
    expect(result.rendered.length).toBeLessThan(100);
  });

  it("renders surface template (~200 chars)", () => {
    const result = renderMirror("surface", {
      cardId: "test-456",
      content: "This is the main message content",
      summary: "Summary text",
      senderName: "David",
      createdAt: new Date("2024-02-20T12:00:00Z"),
      appendDeepLink: true,
    });

    expect(result.template).toBe("surface");
    expect(result.rendered).toContain("From David");
    expect(result.rendered).toMatch(/Feb (19|20)/); // Account for timezone differences
    expect(result.rendered).toContain("Summary text");
    expect(result.rendered).toContain("\ud83d\udcce Full context:");
    expect(result.rendered).toContain("tez://mypa/test-456");
    expect(result.rendered).toContain("[Shared via MyPA");
  });

  it("uses content when summary is missing in surface", () => {
    const result = renderMirror("surface", {
      cardId: "test-789",
      content: "Main content here",
      senderName: "Eve",
      createdAt: new Date(),
      appendDeepLink: false,
    });

    expect(result.rendered).toContain("Main content here");
    expect(result.rendered).not.toContain("tez://");
  });

  it("renders surface_facts template with context highlights", () => {
    const result = renderMirror("surface_facts", {
      cardId: "test-abc",
      content: "Message content",
      summary: "Summary",
      senderName: "Frank",
      createdAt: new Date("2024-03-10T12:00:00Z"),
      contextHighlights: ["Fact 1", "Fact 2", "Fact 3"],
      appendDeepLink: true,
    });

    expect(result.template).toBe("surface_facts");
    expect(result.rendered).toContain("From Frank");
    expect(result.rendered).toMatch(/Mar (9|10)/); // Account for timezone differences
    expect(result.rendered).toContain("Context highlights:");
    expect(result.rendered).toContain("\u2022 Fact 1");
    expect(result.rendered).toContain("\u2022 Fact 2");
    expect(result.rendered).toContain("\u2022 Fact 3");
    expect(result.rendered).toContain("tez://mypa/test-abc");
  });

  it("limits context highlights to 5 in surface_facts", () => {
    const highlights = Array.from({ length: 10 }, (_, i) => `Fact ${i + 1}`);
    const result = renderMirror("surface_facts", {
      cardId: "test-def",
      content: "Content",
      senderName: "Grace",
      createdAt: new Date(),
      contextHighlights: highlights,
      appendDeepLink: false,
    });

    expect(result.rendered).toContain("\u2022 Fact 1");
    expect(result.rendered).toContain("\u2022 Fact 5");
    expect(result.rendered).not.toContain("\u2022 Fact 6");
  });

  it("renders surface_facts without highlights", () => {
    const result = renderMirror("surface_facts", {
      cardId: "test-ghi",
      content: "Content",
      senderName: "Hank",
      createdAt: new Date(),
      contextHighlights: [],
      appendDeepLink: false,
    });

    expect(result.rendered).not.toContain("Context highlights:");
    expect(result.rendered).toContain("From Hank");
  });

  it("throws error for unknown template", () => {
    expect(() =>
      renderMirror("unknown" as any, {
        cardId: "test",
        content: "test",
        senderName: "test",
        createdAt: new Date(),
        appendDeepLink: false,
      })
    ).toThrow("Unknown mirror template");
  });
});

// ============= Mirror API Tests =============

describe("Mirror API", () => {
  it("POST /api/tez/:cardId/mirror renders preview", async () => {
    const user = createTestUser();
    const card = createTestCard(user.id, { summary: "Test card summary" });

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror`)
      .set(authHeaders(user.id))
      .send({ template: "surface" });

    expect(res.status).toBe(200);
    expect(res.body.data.rendered).toContain("From Test User");
    expect(res.body.data.rendered).toContain("Test card summary");
    expect(res.body.data.template).toBe("surface");
    expect(res.body.data.deepLink).toContain(`tez://mypa/${card.id}`);
    expect(res.body.data.charCount).toBeGreaterThan(0);
  });

  it("POST /api/tez/:cardId/mirror with surface_facts includes context", async () => {
    const user = createTestUser();
    const card = createTestCard(user.id);

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await insertTestContext(client, card.id, user.id, user.name, "text", "Context detail");
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror`)
      .set(authHeaders(user.id))
      .send({ template: "surface_facts" });

    expect(res.status).toBe(200);
    expect(res.body.data.rendered).toContain("Context highlights:");
    expect(res.body.data.rendered).toContain("\u2022 Test bullet");
  });

  it("POST /api/tez/:cardId/mirror respects user settings for deep link", async () => {
    const user = createTestUser();
    const card = createTestCard(user.id);

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await generateTestToken(user.id, user.email, user.name);

    // Set mirror settings to disable deep link
    await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({ mirrorAppendDeeplink: false });

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror`)
      .set(authHeaders(user.id))
      .send({ template: "teaser" });

    expect(res.status).toBe(200);
    expect(res.body.data.deepLink).toBeNull();
    expect(res.body.data.rendered).not.toContain("tez://");
  });

  it("POST /api/tez/:cardId/mirror rejects invalid template", async () => {
    const user = createTestUser();
    const card = createTestCard(user.id);

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror`)
      .set(authHeaders(user.id))
      .send({ template: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/tez/:cardId/mirror rejects non-existent card", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post("/api/tez/nonexistent/mirror")
      .set(authHeaders(user.id))
      .send({ template: "surface" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CARD_NOT_FOUND");
  });

  it("POST /api/tez/:cardId/mirror enforces access control", async () => {
    const user1 = createTestUser({ email: "user1@example.com" });
    const user2 = createTestUser({ email: "user2@example.com" });
    const card = createTestCard(user1.id); // user1's card

    await insertTestUser(client, user1);
    await insertTestUser(client, user2);
    await insertTestCard(client, card);
    await generateTestToken(user2.id, user2.email, user2.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror`)
      .set(authHeaders(user2.id))
      .send({ template: "surface" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/tez/:cardId/mirror/send logs audit entry", async () => {
    const user = createTestUser({ email: "audit-test@example.com" });
    const card = createTestCard(user.id);

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror/send`)
      .set(authHeaders(user.id))
      .send({
        template: "surface",
        destination: "sms",
        recipientHint: "mom",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.logged).toBe(true);

    // Verify audit log entry
    const logs = await db.select().from(mirrorAuditLog).where(eq(mirrorAuditLog.cardId, card.id));
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(user.id);
    expect(logs[0].template).toBe("surface");
    expect(logs[0].destination).toBe("sms");
    expect(logs[0].recipientHint).toBe("mom");
    expect(logs[0].charCount).toBeGreaterThan(0);
    expect(logs[0].deepLinkIncluded).toBe(true); // default true (Drizzle returns boolean)
  });

  it("POST /api/tez/:cardId/mirror/send validates destination", async () => {
    const user = createTestUser();
    const card = createTestCard(user.id);

    await insertTestUser(client, user);
    await insertTestCard(client, card);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror/send`)
      .set(authHeaders(user.id))
      .send({
        template: "surface",
        destination: "invalid",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /api/tez/:cardId/mirror/send enforces access control", async () => {
    const user1 = createTestUser({ email: "send-user1@example.com" });
    const user2 = createTestUser({ email: "send-user2@example.com" });
    const card = createTestCard(user1.id);

    await insertTestUser(client, user1);
    await insertTestUser(client, user2);
    await insertTestCard(client, card);
    await generateTestToken(user2.id, user2.email, user2.name);

    const res = await request(app)
      .post(`/api/tez/${card.id}/mirror/send`)
      .set(authHeaders(user2.id))
      .send({
        template: "surface",
        destination: "email",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/tez/:cardId/mirror/send requires authentication", async () => {
    const res = await request(app)
      .post("/api/tez/test-123/mirror/send")
      .send({ template: "surface", destination: "sms" });

    expect(res.status).toBe(401);
  });
});

// ============= Mirror Settings Tests =============

describe("Mirror Settings API", () => {
  it("GET /api/settings/mirror returns defaults for new user", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .get("/api/settings/mirror")
      .set(authHeaders(user.id));

    expect(res.status).toBe(200);
    expect(res.body.data.mirrorWarningsEnabled).toBe(true);
    expect(res.body.data.mirrorDefaultTemplate).toBe("surface");
    expect(res.body.data.mirrorAppendDeeplink).toBe(true);
  });

  it("PATCH /api/settings/mirror creates settings for new user", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({
        mirrorWarningsEnabled: false,
        mirrorDefaultTemplate: "teaser",
        mirrorAppendDeeplink: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.mirrorWarningsEnabled).toBe(false);
    expect(res.body.data.mirrorDefaultTemplate).toBe("teaser");
    expect(res.body.data.mirrorAppendDeeplink).toBe(false);
  });

  it("PATCH /api/settings/mirror updates existing settings", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    // Create initial settings
    await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({ mirrorDefaultTemplate: "surface" });

    // Update settings
    const res = await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({ mirrorDefaultTemplate: "surface_facts" });

    expect(res.status).toBe(200);
    expect(res.body.data.mirrorDefaultTemplate).toBe("surface_facts");
  });

  it("PATCH /api/settings/mirror allows partial updates", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    // Set all settings
    await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({
        mirrorWarningsEnabled: true,
        mirrorDefaultTemplate: "surface",
        mirrorAppendDeeplink: true,
      });

    // Update only one field
    const res = await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({ mirrorAppendDeeplink: false });

    expect(res.status).toBe(200);
    expect(res.body.data.mirrorWarningsEnabled).toBe(true); // unchanged
    expect(res.body.data.mirrorDefaultTemplate).toBe("surface"); // unchanged
    expect(res.body.data.mirrorAppendDeeplink).toBe(false); // updated
  });

  it("PATCH /api/settings/mirror rejects invalid template", async () => {
    const user = createTestUser();
    await insertTestUser(client, user);
    await generateTestToken(user.id, user.email, user.name);

    const res = await request(app)
      .patch("/api/settings/mirror")
      .set(authHeaders(user.id))
      .send({ mirrorDefaultTemplate: "invalid_template" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/settings/mirror requires authentication", async () => {
    const res = await request(app).get("/api/settings/mirror");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/settings/mirror requires authentication", async () => {
    const res = await request(app)
      .patch("/api/settings/mirror")
      .send({ mirrorWarningsEnabled: false });
    expect(res.status).toBe(401);
  });
});
