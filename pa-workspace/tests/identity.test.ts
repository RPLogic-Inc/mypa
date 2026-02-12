import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDb } from "./setup.js";

const mocks = vi.hoisted(() => {
  let _testDb: any = null;
  return {
    getTestDb: () => _testDb,
    setTestDb: (db: any) => { _testDb = db; },
    provisionPaAccount: vi.fn(),
    suspendPaAccount: vi.fn(),
    reactivatePaAccount: vi.fn(),
    deletePaAccount: vi.fn(),
  };
});

// Mock auth
vi.mock("../src/middleware/auth.js", () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { id: "user-1", email: "admin@test.com", name: "Admin", roles: ["admin"] };
    next();
  },
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

// Mock google admin — return controlled values
vi.mock("../src/services/googleAdmin.js", () => ({
  provisionPaAccount: mocks.provisionPaAccount,
  suspendPaAccount: mocks.suspendPaAccount,
  reactivatePaAccount: mocks.reactivatePaAccount,
  deletePaAccount: mocks.deletePaAccount,
  testWorkspaceConnectivity: vi.fn().mockResolvedValue({ success: true, domain: "pa.test.com", message: "ok" }),
  listDomainUsers: vi.fn().mockResolvedValue([]),
}));

// Mock db
vi.mock("../src/db/index.js", async () => {
  const schema = await import("../src/db/schema.js");
  return {
    db: new Proxy({} as any, {
      get(_target: any, prop: string) {
        const db = mocks.getTestDb();
        if (!db) throw new Error("testDb not initialized");
        return (db as any)[prop];
      },
    }),
    ...schema,
  };
});

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

// Helper: seed workspace config so provision can find it
async function seedWorkspaceConfig(db: any) {
  const { workspaceConfig } = await import("../src/db/schema.js");
  await db.insert(workspaceConfig).values({
    teamId: "team-1",
    appApiUrl: "http://localhost:3001",
    googleDomain: "pa.test.com",
    googleServiceAccountJson: '{"client_email":"sa@test.com","private_key":"key"}',
    googleAdminEmail: "admin@test.com",
    setupStatus: "ready",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// Helper: seed a PA identity
async function seedIdentity(db: any, overrides: Record<string, any> = {}) {
  const { paIdentities } = await import("../src/db/schema.js");
  const defaults = {
    userId: "user-1",
    teamId: "team-1",
    paEmail: "alice-pa@pa.test.com",
    displayName: "Alice's PA",
    clientEmail: "alice@test.com",
    clientName: "Alice",
    googleUserId: "google-123",
    provisionStatus: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(paIdentities).values({ ...defaults, ...overrides });
}

describe("Identity Routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
    const { identityRoutes } = await import("../src/routes/identity.js");
    app = express();
    app.use(express.json());
    app.use("/api/identity", identityRoutes);
  });

  describe("POST /api/identity/provision", () => {
    it("provisions a PA account", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);

      mocks.provisionPaAccount.mockResolvedValue({
        googleUserId: "google-456",
        paEmail: "alice-pa@pa.test.com",
      });

      const res = await request(app)
        .post("/api/identity/provision")
        .send({ userId: "user-1", teamId: "team-1", clientName: "Alice", clientEmail: "alice@test.com" });

      expect(res.status).toBe(201);
      expect(res.body.data.paEmail).toBe("alice-pa@pa.test.com");
      expect(res.body.data.provisionStatus).toBe("active");
      expect(res.body.data.googleUserId).toBe("google-456");
      expect(mocks.provisionPaAccount).toHaveBeenCalledOnce();
    });

    it("rejects missing fields", async () => {
      const res = await request(app)
        .post("/api/identity/provision")
        .send({ userId: "user-1" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects duplicate provisioning", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db);

      const res = await request(app)
        .post("/api/identity/provision")
        .send({ userId: "user-1", teamId: "team-1", clientName: "Alice" });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_EXISTS");
    });

    it("rejects when workspace not ready", async () => {
      const db = mocks.getTestDb();
      const { workspaceConfig } = await import("../src/db/schema.js");
      await db.insert(workspaceConfig).values({
        teamId: "team-1",
        appApiUrl: "http://localhost:3001",
        setupStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/identity/provision")
        .send({ userId: "user-1", teamId: "team-1", clientName: "Alice" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WORKSPACE_NOT_READY");
    });

    it("reverts to pending on Google API failure", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);

      mocks.provisionPaAccount.mockRejectedValue(new Error("Google API down"));

      const res = await request(app)
        .post("/api/identity/provision")
        .send({ userId: "user-1", teamId: "team-1", clientName: "Alice" });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("PROVISION_FAILED");

      // Check the identity was saved with pending status
      const { paIdentities } = await import("../src/db/schema.js");
      const { eq } = await import("drizzle-orm");
      const identity = await db.query.paIdentities.findFirst({
        where: eq(paIdentities.userId, "user-1"),
      });
      expect(identity!.provisionStatus).toBe("pending");
    });
  });

  describe("GET /api/identity/:userId", () => {
    it("returns PA identity", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db);

      const res = await request(app).get("/api/identity/user-1");

      expect(res.status).toBe(200);
      expect(res.body.data.paEmail).toBe("alice-pa@pa.test.com");
      expect(res.body.data.displayName).toBe("Alice's PA");
    });

    it("returns 404 for unknown user", async () => {
      const res = await request(app).get("/api/identity/user-1");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/identity/:userId/suspend", () => {
    it("suspends an active PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db, { provisionStatus: "active" });

      mocks.suspendPaAccount.mockResolvedValue(undefined);

      const res = await request(app).post("/api/identity/user-1/suspend");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("suspended");
      expect(mocks.suspendPaAccount).toHaveBeenCalledOnce();
    });

    it("rejects suspending a non-active PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db, { provisionStatus: "pending" });

      const res = await request(app).post("/api/identity/user-1/suspend");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATUS");
    });
  });

  describe("POST /api/identity/:userId/reactivate", () => {
    it("reactivates a suspended PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db, { provisionStatus: "suspended" });

      mocks.reactivatePaAccount.mockResolvedValue(undefined);

      const res = await request(app).post("/api/identity/user-1/reactivate");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("active");
      expect(mocks.reactivatePaAccount).toHaveBeenCalledOnce();
    });

    it("rejects reactivating a non-suspended PA", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db, { provisionStatus: "active" });

      const res = await request(app).post("/api/identity/user-1/reactivate");

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STATUS");
    });
  });

  describe("DELETE /api/identity/:userId", () => {
    it("deletes a PA identity", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db);

      mocks.deletePaAccount.mockResolvedValue(undefined);

      const res = await request(app).delete("/api/identity/user-1");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("deleted");
      expect(mocks.deletePaAccount).toHaveBeenCalledOnce();
    });

    it("continues local cleanup if Google delete fails", async () => {
      const db = mocks.getTestDb();
      await seedWorkspaceConfig(db);
      await seedIdentity(db);

      mocks.deletePaAccount.mockRejectedValue(new Error("Google error"));

      const res = await request(app).delete("/api/identity/user-1");

      // Should still succeed (local cleanup continues)
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("deleted");
    });

    it("returns 404 for unknown user", async () => {
      const res = await request(app).delete("/api/identity/user-1");
      expect(res.status).toBe(404);
    });
  });
});
