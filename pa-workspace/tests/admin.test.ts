import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

// Hoist the testDb reference so mocks can access it
const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
  };
});

// Mock auth middleware
vi.mock("../src/middleware/auth.js", () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { id: "test-user", email: "admin@test.com", name: "Admin", roles: ["admin"] };
    next();
  },
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

// Mock google admin service
vi.mock("../src/services/googleAdmin.js", () => ({
  testWorkspaceConnectivity: vi.fn().mockResolvedValue({
    success: true,
    domain: "pa.test.com",
    message: "Configuration validated",
  }),
  provisionPaAccount: vi.fn().mockResolvedValue({ googleUserId: "google-789", paEmail: "test-pa@pa.test.com" }),
  suspendPaAccount: vi.fn(),
  reactivatePaAccount: vi.fn(),
  deletePaAccount: vi.fn(),
  listDomainUsers: vi.fn().mockResolvedValue([]),
}));

// Mock app client (for provision-all)
vi.mock("../src/services/appClient.js", () => ({
  getTeamMembers: vi.fn().mockResolvedValue([
    { id: "user-1", name: "Alice", email: "alice@test.com" },
    { id: "user-2", name: "Bob", email: "bob@test.com" },
  ]),
}));

// Mock the db module to use our test db
vi.mock("../src/db/index.js", async () => {
  const schema = await import("../src/db/schema.js");
  const handler = {
    get(_target: any, prop: string) {
      const db = mocks.getTestDb();
      if (!db) throw new Error("testDb not initialized");
      return (db as any)[prop];
    },
  };
  return {
    db: new Proxy({} as any, handler),
    ...schema,
  };
});

// Mock the middleware barrel export
vi.mock("../src/middleware/index.js", async () => {
  const auth = await import("../src/middleware/auth.js");
  return {
    authenticate: auth.authenticate,
    requireRole: auth.requireRole,
    requestLogger: (_req: any, _res: any, next: any) => next(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("../src/middleware/logging.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

describe("Admin Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    mocks.setTestDb(createTestDb());
    const { adminRoutes } = await import("../src/routes/admin.js");
    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
  });

  describe("POST /api/admin/setup", () => {
    it("creates workspace config for a team", async () => {
      const res = await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      expect(res.status).toBe(201);
      expect(res.body.data.teamId).toBe("team-1");
      expect(res.body.data.setupStatus).toBe("pending");
    });

    it("rejects missing teamId", async () => {
      const res = await request(app)
        .post("/api/admin/setup")
        .send({ appApiUrl: "http://localhost:3001" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicate team setup", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      const res = await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_EXISTS");
    });
  });

  describe("GET /api/admin/config", () => {
    it("returns workspace config for a team", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      const res = await request(app)
        .get("/api/admin/config")
        .query({ teamId: "team-1" });

      expect(res.status).toBe(200);
      expect(res.body.data.teamId).toBe("team-1");
    });

    it("returns 404 for unknown team", async () => {
      const res = await request(app)
        .get("/api/admin/config")
        .query({ teamId: "nonexistent" });

      expect(res.status).toBe(404);
    });

    it("masks sensitive fields", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001", serviceToken: "secret" });

      const res = await request(app)
        .get("/api/admin/config")
        .query({ teamId: "team-1" });

      expect(res.body.data.serviceToken).toBe("[CONFIGURED]");
    });
  });

  describe("PATCH /api/admin/config", () => {
    it("updates Google Workspace config", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      const res = await request(app)
        .patch("/api/admin/config")
        .send({
          teamId: "team-1",
          googleDomain: "pa.test.com",
          googleServiceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
          googleAdminEmail: "admin@test.com",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.googleDomain).toBe("pa.test.com");
      expect(res.body.data.googleServiceAccountJson).toBe("[CONFIGURED]");
      expect(res.body.data.setupStatus).toBe("workspace_configured");
    });
  });

  describe("POST /api/admin/config/test-workspace", () => {
    it("tests workspace connectivity", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      await request(app)
        .patch("/api/admin/config")
        .send({
          teamId: "team-1",
          googleDomain: "pa.test.com",
          googleServiceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
          googleAdminEmail: "admin@test.com",
        });

      const res = await request(app)
        .post("/api/admin/config/test-workspace")
        .send({ teamId: "team-1" });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it("rejects incomplete config", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      const res = await request(app)
        .post("/api/admin/config/test-workspace")
        .send({ teamId: "team-1" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INCOMPLETE_CONFIG");
    });
  });

  describe("POST /api/admin/provision-all", () => {
    async function setupReadyWorkspace() {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      await request(app)
        .patch("/api/admin/config")
        .send({
          teamId: "team-1",
          googleDomain: "pa.test.com",
          googleServiceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
          googleAdminEmail: "admin@test.com",
        });

      // Manually set status to ready (normally done by test-workspace)
      const { workspaceConfig } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = mocks.getTestDb();
      await db.update(workspaceConfig).set({ setupStatus: "ready" }).where(eq(workspaceConfig.teamId, "team-1"));
    }

    it("provisions PA accounts for all team members", async () => {
      await setupReadyWorkspace();

      const res = await request(app)
        .post("/api/admin/provision-all")
        .send({ teamId: "team-1" });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.succeeded).toBe(2);
      expect(res.body.meta.failed).toBe(0);
    });

    it("skips already-provisioned members", async () => {
      await setupReadyWorkspace();

      // Provision once
      await request(app)
        .post("/api/admin/provision-all")
        .send({ teamId: "team-1" });

      // Provision again — should skip
      const res = await request(app)
        .post("/api/admin/provision-all")
        .send({ teamId: "team-1" });

      expect(res.status).toBe(200);
      expect(res.body.meta.skipped).toBe(2);
      expect(res.body.meta.succeeded).toBe(0);
    });

    it("rejects when workspace not ready", async () => {
      await request(app)
        .post("/api/admin/setup")
        .send({ teamId: "team-1", appApiUrl: "http://localhost:3001" });

      const res = await request(app)
        .post("/api/admin/provision-all")
        .send({ teamId: "team-1" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });
  });
});
