import { Router } from "express";
import { db } from "../db/index.js";
import { sql } from "drizzle-orm";

const router = Router();

/** Liveness probe — is the process alive? */
router.get("/live", (_req, res) => {
  res.json({ status: "ok", service: "pa-workspace" });
});

/** Readiness probe — can we serve traffic? (DB connected, etc.) */
router.get("/ready", async (_req, res) => {
  try {
    // Test DB connectivity
    await db.run(sql`SELECT 1`);

    res.json({
      status: "ok",
      service: "pa-workspace",
      checks: { database: "ok" },
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      service: "pa-workspace",
      checks: { database: "error" },
    });
  }
});

export const healthRoutes = router;
