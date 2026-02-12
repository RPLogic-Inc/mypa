import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { cardRoutes } from "./routes/cards.js";
import { userRoutes } from "./routes/users.js";
import { audioRoutes } from "./routes/audio.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { authRoutes } from "./routes/auth.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import paRoutes from "./routes/pa.js";
import settingsRoutes from "./routes/settings.js";
import tezRoutes from "./routes/tez.js";
import tezPublicRoutes from "./routes/tezPublic.js";
import libraryRoutes from "./routes/library.js";
import discoverRoutes from "./routes/discover.js";
import metricsRoutes from "./routes/metrics.js";
import { openclawProxyRoutes } from "./routes/openclawProxy.js";
import { crmRoutes } from "./routes/crm.js";
import { invitesRoutes } from "./routes/invites.js";
import { tezTransportRoutes } from "./routes/tezTransport.js";
import { provisioningRoutes } from "./routes/provisioning.js";
import { crossTeamRoutes } from "./routes/crossTeam.js";
import { schedulerRoutes } from "./routes/scheduler.js";
import { startScheduler, stopScheduler } from "./services/schedulerEngine.js";
import { requestLogger, logger, closeLogger } from "./middleware/index.js";
import { errorTrackingMiddleware, breadcrumbMiddleware } from "./services/errorTracking.js";
import { APP_SLUG } from "./config/app.js";
import { getClient } from "./db/index.js";
import { initializeFTS, rebuildFTSIndex } from "./db/fts.js";

config();

const app = express();
app.disable("x-powered-by");
// The API is deployed behind nginx. Trust X-Forwarded-* so req.ip / req.protocol
// reflect the real client, which is required for correct rate limiting + logging.
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3001;

// Core middleware
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173", "http://localhost:3001"])
    : true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-User-Id"],
  maxAge: 86400,
}));
app.use(express.json({ limit: "16mb" }));

// Request logging (adds requestId to each request)
app.use(requestLogger);

// Error tracking breadcrumbs
app.use(breadcrumbMiddleware);

// Serve uploaded files (audio recordings, etc.)
app.use("/uploads", express.static("uploads"));

// Tezit Protocol discovery endpoint (/.well-known/tezit.json)
app.get("/.well-known/tezit.json", (_req, res) => {
  res.json({
    platform: APP_SLUG,
    version: "1.0.0",
    protocol_version: "1.2.4",
    tip_version: "1.0.3",
    tip_lite: true,
    profiles: ["knowledge", "messaging", "coordination"],
    endpoints: {
      interrogate: "/api/tez/:cardId/interrogate",
      interrogate_stream: "/api/tez/:cardId/interrogate/stream",
      interrogate_public: "/api/tez/public/:cardId/interrogate",
      share: "/api/tez/:cardId/share",
      export_inline: "/api/tez/:cardId/export",
      export_portable: "/api/tez/:cardId/export/portable",
      import: "/api/tez/import",
      fork: "/api/tez/:cardId/fork",
      resolve: "/api/tez/resolve",
    },
    auth: "bearer",
    namespace: APP_SLUG,
  });
});

// Health check routes (no auth required)
app.use("/health", healthRoutes);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/cards", cardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/pa", paRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/tez", tezRoutes);
app.use("/api/tez/public", tezPublicRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/openclaw", openclawProxyRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/invites", invitesRoutes);
app.use("/api/tez-transport", tezTransportRoutes);
app.use("/api/admin", provisioningRoutes);
app.use("/api/cross-team", crossTeamRoutes);
app.use("/api/scheduler", schedulerRoutes);

// Error tracking middleware (captures errors before the global handler)
app.use(errorTrackingMiddleware);

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("Unhandled error", err, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    });

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
      },
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

const server = app.listen(PORT, async () => {
  logger.info("Server started", {
    port: PORT,
    env: process.env.NODE_ENV || "development",
  });

  // Initialize FTS5 for Library of Context search
  try {
    const client = getClient();
    await initializeFTS(client);
    await rebuildFTSIndex(client);
    logger.info("FTS5 initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize FTS5", error as Error);
    // Don't crash the server - FTS is important but not critical
  }

  // Start personal scheduler engine (no-op in team mode)
  startScheduler();
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);

  stopScheduler();

  server.close(() => {
    logger.info("HTTP server closed");
    closeLogger();
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown due to timeout");
    closeLogger();
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
