import { Router } from "express";
import { db, users } from "../db/index.js";
import { sql } from "drizzle-orm";

export const healthRoutes = Router();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks?: {
    database?: {
      status: "healthy" | "unhealthy";
      latencyMs?: number;
      error?: string;
    };
  };
  tezit?: {
    tipLiteCompliant: boolean;
    tipVersion: string;
    protocolVersion: string;
    profiles: string[];
  };
}

const startTime = Date.now();

/**
 * Basic liveness check
 * Used by container orchestration to check if the process is running
 */
healthRoutes.get("/live", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check
 * Includes database connectivity check
 * Used by load balancers to determine if the service can accept traffic
 */
healthRoutes.get("/ready", async (_req, res) => {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {},
    tezit: {
      tipLiteCompliant: true,
      tipVersion: "1.0.3",
      protocolVersion: "1.2.4",
      profiles: ["knowledge", "messaging", "coordination"],
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await db.select({ count: sql<number>`count(*)` }).from(users);
    const dbLatency = Date.now() - dbStart;

    health.checks!.database = {
      status: "healthy",
      latencyMs: dbLatency,
    };
  } catch (error) {
    health.status = "unhealthy";
    health.checks!.database = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Full health check (alias for /ready)
 */
healthRoutes.get("/", async (_req, res) => {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {},
    tezit: {
      tipLiteCompliant: true,
      tipVersion: "1.0.3",
      protocolVersion: "1.2.4",
      profiles: ["knowledge", "messaging", "coordination"],
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await db.select({ count: sql<number>`count(*)` }).from(users);
    const dbLatency = Date.now() - dbStart;

    health.checks!.database = {
      status: "healthy",
      latencyMs: dbLatency,
    };
  } catch (error) {
    health.status = "unhealthy";
    health.checks!.database = {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});
