/**
 * SSE (Server-Sent Events) routes — real-time push notifications.
 *
 * GET /events/subscribe?token=<jwt>
 *
 * EventSource can't set custom headers, so the JWT is passed as a query
 * parameter.  The endpoint verifies it using the same jose logic as the
 * standard Bearer-token auth middleware.
 *
 * Event types:
 *   new_tez       — a new Tez was shared (team share or conversation message)
 *   tez_updated   — an existing Tez was modified
 *   new_reply     — a threaded reply was added
 *   unread_update — unread counts changed (sent after any of the above)
 *   new_message   — a new message in a conversation the user belongs to
 *
 * Wire format (SSE spec):
 *   event: <type>\ndata: <json>\n\n
 *
 * Heartbeat every 30 s:
 *   :ping\n\n
 */

import { Router } from "express";
import { jwtVerify } from "jose";
import { config } from "../config.js";
import { eventBus, type SSEEvent } from "../services/eventBus.js";

export const eventRoutes = Router();

const secret = new TextEncoder().encode(config.jwtSecret);

// ─────────────────────────────────────────────────────────────────────────────
// GET /events/subscribe — SSE stream for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────

eventRoutes.get("/subscribe", async (req, res) => {
  // 1. Authenticate via query-param token (EventSource limitation)
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "token query parameter required" } });
    return;
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });

    if (!payload.sub) {
      res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token must contain sub claim" } });
      return;
    }

    if (payload.type && payload.type !== "access") {
      res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Access token required" } });
      return;
    }

    userId = payload.sub;
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token verification failed" } });
    return;
  }

  // 2. Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Tell nginx not to buffer this response
  });

  // 3. Send initial :ok comment (proves connection is alive)
  res.write(":ok\n\n");

  // 4. Listener for this user's events
  const channel = `user:${userId}`;

  const onEvent = (evt: SSEEvent) => {
    try {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    } catch {
      // Client probably disconnected; cleanup happens in "close" handler
    }
  };

  eventBus.on(channel, onEvent);

  // 5. Heartbeat — keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(":ping\n\n");
    } catch {
      // ignore
    }
  }, 30_000);

  // 6. Cleanup on disconnect
  req.on("close", () => {
    eventBus.off(channel, onEvent);
    clearInterval(heartbeat);
  });
});
