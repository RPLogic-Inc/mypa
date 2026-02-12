import { Router, Request, Response } from "express";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticate } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { detectVoiceNumber, readVoiceSms, sendVoiceSms } from "../services/googleVoice.js";
import { logAction } from "../services/actionLogger.js";

const router = Router();
router.use(authenticate);

/**
 * Look up workspace credentials for a PA email.
 */
async function getCredentialsForPa(paEmail: string): Promise<{
  serviceAccountJson: string;
  teamId: string;
  voiceNumber: string | null;
} | null> {
  const { paIdentities, workspaceConfig } = await import("../db/schema.js");

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.paEmail, paEmail),
  });
  if (!identity) return null;

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });
  if (!config?.googleServiceAccountJson || config.setupStatus !== "ready") return null;

  return {
    serviceAccountJson: config.googleServiceAccountJson,
    teamId: identity.teamId,
    voiceNumber: identity.googleVoiceNumber,
  };
}

/**
 * GET /api/voice/number
 * Get or detect the PA's Google Voice number.
 */
router.get("/number", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  // Return stored number if available
  if (creds.voiceNumber) {
    return res.json({
      data: { paEmail, voiceNumber: creds.voiceNumber, source: "stored" },
    });
  }

  // Try to detect from Gmail
  try {
    const detected = await detectVoiceNumber({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
    });

    if (detected) {
      // Store the detected number
      const { paIdentities } = await import("../db/schema.js");
      await db.update(paIdentities)
        .set({ googleVoiceNumber: detected, updatedAt: new Date() })
        .where(eq(paIdentities.paEmail, paEmail));

      return res.json({
        data: { paEmail, voiceNumber: detected, source: "detected" },
      });
    }

    res.json({
      data: { paEmail, voiceNumber: null, source: "not_found" },
    });
  } catch (error) {
    logger.error("Failed to detect Voice number", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "VOICE_ERROR", message: (error as Error).message },
    });
  }
});

/**
 * PATCH /api/voice/number
 * Manually set a PA's Voice number (after admin assigns it in Google Admin Console).
 */
router.patch("/number", async (req: Request, res: Response) => {
  const { paEmail, voiceNumber } = req.body;

  if (!paEmail || !voiceNumber) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail and voiceNumber are required" },
    });
  }

  const { paIdentities } = await import("../db/schema.js");
  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.paEmail, paEmail),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "PA identity not found" },
    });
  }

  await db.update(paIdentities)
    .set({ googleVoiceNumber: voiceNumber, updatedAt: new Date() })
    .where(eq(paIdentities.paEmail, paEmail));

  res.json({
    data: { paEmail, voiceNumber },
  });
});

/**
 * GET /api/voice/sms
 * Read SMS messages from the PA's Google Voice (via Gmail).
 */
router.get("/sms", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;
  const maxResults = req.query.maxResults ? parseInt(req.query.maxResults as string) : undefined;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  try {
    const messages = await readVoiceSms({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      maxResults,
    });

    res.json({ data: messages, meta: { total: messages.length } });
  } catch (error) {
    logger.error("Failed to read Voice SMS", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "VOICE_ERROR", message: (error as Error).message },
    });
  }
});

/**
 * POST /api/voice/sms
 * Send an SMS via the PA's Google Voice.
 */
router.post("/sms", async (req: Request, res: Response) => {
  const { paEmail, toNumber, body } = req.body;

  if (!paEmail || !toNumber || !body) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail, toNumber, and body are required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  if (!creds.voiceNumber) {
    return res.status(400).json({
      error: { code: "NO_VOICE_NUMBER", message: "PA does not have a Google Voice number configured" },
    });
  }

  try {
    const result = await sendVoiceSms({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      voiceNumber: creds.voiceNumber,
      toNumber,
      body,
    });

    if (!result) {
      return res.status(500).json({
        error: { code: "SMS_SEND_FAILED", message: "Failed to send SMS" },
      });
    }

    // Log action
    await logAction({
      paEmail,
      actionType: "sms_sent",
      summary: `Sent SMS to ${toNumber}`,
      serviceAccountJson: creds.serviceAccountJson,
    });

    res.status(201).json({
      data: {
        messageId: result.messageId,
        from: creds.voiceNumber,
        to: toNumber,
      },
    });
  } catch (error) {
    logger.error("Failed to send Voice SMS", error as Error, { paEmail, toNumber });
    res.status(500).json({
      error: { code: "SMS_SEND_FAILED", message: (error as Error).message },
    });
  }
});

export const voiceRoutes = router;
