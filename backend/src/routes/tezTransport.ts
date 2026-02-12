/**
 * Tez Transport Proxy
 *
 * Proxies tez-transport requests from the backend API to the PA Workspace service.
 * This allows the OpenClaw agent (which knows MYPA_API_URL) to send Tez via email
 * without needing direct access to PA_WORKSPACE_API_URL.
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.js";
import { logger } from "../middleware/logging.js";

const router = Router();
router.use(authenticate);

function getPaWorkspaceUrl(): string | null {
  return process.env.PA_WORKSPACE_API_URL || null;
}

/**
 * POST /api/tez-transport/send
 * Proxy to PA Workspace's tez-transport/send endpoint.
 */
router.post("/send", async (req: Request, res: Response) => {
  const paUrl = getPaWorkspaceUrl();
  if (!paUrl) {
    return res.status(503).json({
      error: { code: "SERVICE_UNAVAILABLE", message: "PA Workspace is not configured" },
    });
  }

  try {
    const response = await fetch(`${paUrl}/api/tez-transport/send`, {
      method: "POST",
      headers: {
        Authorization: req.headers.authorization || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const body = await response.json().catch(() => ({}));
    res.status(response.status).json(body);
  } catch (error) {
    logger.error("Tez transport proxy error", error as Error);
    res.status(502).json({
      error: { code: "PROXY_ERROR", message: "Failed to reach PA Workspace" },
    });
  }
});

/**
 * GET /api/tez-transport/log
 * Proxy to PA Workspace's tez-transport/log endpoint.
 */
router.get("/log", async (req: Request, res: Response) => {
  const paUrl = getPaWorkspaceUrl();
  if (!paUrl) {
    return res.status(503).json({
      error: { code: "SERVICE_UNAVAILABLE", message: "PA Workspace is not configured" },
    });
  }

  try {
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const response = await fetch(`${paUrl}/api/tez-transport/log?${queryString}`, {
      headers: {
        Authorization: req.headers.authorization || "",
      },
    });

    const body = await response.json().catch(() => ({}));
    res.status(response.status).json(body);
  } catch (error) {
    logger.error("Tez transport log proxy error", error as Error);
    res.status(502).json({
      error: { code: "PROXY_ERROR", message: "Failed to reach PA Workspace" },
    });
  }
});

export const tezTransportRoutes = router;
