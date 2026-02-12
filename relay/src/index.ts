/**
 * tezit-relay
 *
 * Open relay server for the Tezit Protocol.
 * Does one thing: securely deliver and persist context-rich messages (Tez) for teams.
 */

import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { tezRoutes } from "./routes/tez.js";
import { teamRoutes } from "./routes/teams.js";
import { contactRoutes } from "./routes/contacts.js";
import { conversationRoutes } from "./routes/conversations.js";
import { unreadRoutes } from "./routes/unread.js";
import { federationRoutes } from "./routes/federation.js";
import { adminRoutes } from "./routes/admin.js";
import { channelRoutes } from "./routes/channels.js";
import { spokeHubRoutes } from "./routes/spokeHub.js";
import { eventRoutes } from "./routes/events.js";
import { loadOrCreateIdentity } from "./services/identity.js";
import { rateLimit } from "./middleware/rateLimit.js";

const app = express();
app.disable("x-powered-by");

// Security: CORS restricted to explicit origins in production
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : undefined;

app.use(
  cors({
    origin: config.nodeEnv === "production" && corsOrigins ? corsOrigins : true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: "1mb" }));

// Security: Global rate limiting — 100 req/min per IP
app.use(rateLimit({ windowMs: 60_000, max: 100 }));

// Health — omit version in production
app.get("/health", (_req, res) => {
  const response: Record<string, string> = { status: "ok", service: "tezit-relay" };
  if (config.nodeEnv !== "production") {
    response.version = "0.3.0";
  }
  res.json(response);
});

// .well-known/tezit.json — server discovery for federation
app.get("/.well-known/tezit.json", (_req, res) => {
  if (!config.federationEnabled) {
    res.status(404).json({ error: { code: "FEDERATION_DISABLED", message: "Federation is not enabled" } });
    return;
  }

  try {
    const identity = loadOrCreateIdentity();
    res.json({
      host: identity.host,
      server_id: identity.serverId,
      public_key: identity.publicKey,
      protocol_version: "1.2.4",
      profiles: ["messaging", "knowledge"],
      federation: {
        enabled: true,
        mode: config.federationMode,
        inbox: "/federation/inbox",
      },
    });
  } catch (error) {
    console.error("Failed to load relay identity for discovery endpoint:", error);
    res.status(500).json({
      error: { code: "IDENTITY_INIT_FAILED", message: "Failed to initialize federation identity" },
    });
  }
});

// Core routes
app.use("/tez", tezRoutes);
app.use("/teams", teamRoutes);
app.use("/contacts", contactRoutes);
app.use("/conversations", conversationRoutes);
app.use("/unread", unreadRoutes);

// Real-time SSE events
app.use("/events", eventRoutes);

// Federation + admin + channels routes
app.use("/federation", federationRoutes);
app.use("/federation", spokeHubRoutes);
app.use("/admin", adminRoutes);
app.use("/channels", channelRoutes);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error("Unhandled relay error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
});

// 404 catch-all
app.use((_req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route not found` },
  });
});

// Initialize server identity on startup (if federation enabled)
if (config.federationEnabled) {
  try {
    const identity = loadOrCreateIdentity();
    console.log(`Federation enabled: ${identity.host} (${identity.serverId})`);
  } catch (err) {
    console.error("Failed to initialize server identity:", err);
  }
}

app.listen(config.port, () => {
  console.log(`tezit-relay listening on port ${config.port}`);
});

export default app;
