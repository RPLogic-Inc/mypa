import express from "express";
import cors from "cors";
import { config as dotenvConfig } from "dotenv";
import { healthRoutes } from "./routes/health.js";
import { adminRoutes } from "./routes/admin.js";
import { identityRoutes } from "./routes/identity.js";
import { calendarRoutes } from "./routes/calendar.js";
import { emailRoutes } from "./routes/email.js";
import { tezTransportRoutes } from "./routes/tez-transport.js";
import { voiceRoutes } from "./routes/voice.js";
import { requestLogger, logger } from "./middleware/index.js";
import { config } from "./config.js";

dotenvConfig();

const app = express();
app.set("trust proxy", 1);

// CORS
app.use(cors({
  origin: config.nodeEnv === "production" ? config.allowedOrigins : true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
}));

app.use(express.json({ limit: "4mb" }));
app.use(requestLogger);

// Health (no auth)
app.use("/health", healthRoutes);

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api/identity", identityRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/tez-transport", tezTransportRoutes);
app.use("/api/voice", voiceRoutes);

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", err, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    });

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: config.nodeEnv === "production" ? "An unexpected error occurred" : err.message,
      },
    });
  },
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
});

const server = app.listen(config.port, () => {
  logger.info("PA Workspace server started", {
    port: config.port,
    env: config.nodeEnv,
  });
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
