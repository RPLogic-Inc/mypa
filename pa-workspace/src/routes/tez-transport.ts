import { Router, Request, Response } from "express";
import { db, emailLog } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { sendFromPa } from "../services/googleGmail.js";
import { composeTezEmail, TezBundle } from "../services/tezEmail.js";
import { exportTezBundle } from "../services/appClient.js";
import { logAction } from "../services/actionLogger.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(authenticate);

/**
 * Look up workspace config for a PA email.
 */
async function getCredentialsForPa(paEmail: string): Promise<{
  serviceAccountJson: string;
  teamId: string;
  userId: string;
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
    userId: identity.userId,
  };
}

/**
 * POST /api/tez-transport/send
 * Send a Tezit bundle via PA email.
 *
 * Accepts either:
 *  - tezId: fetches the bundle from the app backend and sends it
 *  - bundle: sends the provided bundle directly
 */
router.post("/send", async (req: Request, res: Response) => {
  const { fromPaEmail, toEmail, tezId, bundle: rawBundle, subject } = req.body;

  if (!fromPaEmail || !toEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "fromPaEmail and toEmail are required" },
    });
  }

  if (!tezId && !rawBundle) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Either tezId or bundle is required" },
    });
  }

  const creds = await getCredentialsForPa(fromPaEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  try {
    // Get the bundle
    let bundle: TezBundle;
    if (tezId) {
      const exported = await exportTezBundle(tezId);
      if (!exported) {
        return res.status(404).json({
          error: { code: "TEZ_NOT_FOUND", message: `Could not export tez ${tezId} from app backend` },
        });
      }
      bundle = exported as TezBundle;
    } else {
      bundle = rawBundle as TezBundle;
      if (!bundle.tezit_version) {
        return res.status(400).json({
          error: { code: "INVALID_BUNDLE", message: "Bundle must include tezit_version" },
        });
      }
    }

    // Compose the Tez email
    const tezEmail = composeTezEmail({
      bundle,
      fromEmail: fromPaEmail,
      toEmail,
      subject,
    });

    // Send via Gmail API
    const result = await sendFromPa({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail: fromPaEmail,
      to: toEmail,
      subject: subject || `Tez: ${bundle.title || "Untitled"}`,
      body: tezEmail.body,
      headers: tezEmail.headers,
      attachments: tezEmail.attachments,
    });

    // Log in email_log
    await db.insert(emailLog).values({
      id: randomUUID(),
      paEmail: fromPaEmail,
      direction: "outbound",
      fromAddress: fromPaEmail,
      toAddress: toEmail,
      subject: subject || `Tez: ${bundle.title || "Untitled"}`,
      bodyPreview: tezEmail.body.slice(0, 200),
      gmailMessageId: result.messageId,
      isTezit: true,
      processedAs: "tez_sent",
      processedAt: new Date(),
    });

    // Log action for timesheet
    await logAction({
      paEmail: fromPaEmail,
      actionType: "tez_sent",
      summary: `Sent Tez "${bundle.title || "Untitled"}" to ${toEmail}`,
      serviceAccountJson: creds.serviceAccountJson,
    });

    logger.info("Tez sent via email", {
      fromPaEmail,
      toEmail,
      tezId: bundle.id || tezId,
      messageId: result.messageId,
    });

    res.status(201).json({
      data: {
        messageId: result.messageId,
        tezId: bundle.id || tezId,
        from: fromPaEmail,
        to: toEmail,
        subject: subject || `Tez: ${bundle.title || "Untitled"}`,
      },
    });
  } catch (error) {
    logger.error("Failed to send Tez email", error as Error, { fromPaEmail, toEmail });
    res.status(500).json({
      error: { code: "TEZ_SEND_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/tez-transport/log
 * Tez transport history (filtered from email_log where isTezit = true).
 */
router.get("/log", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const logs = await db
    .select()
    .from(emailLog)
    .where(and(eq(emailLog.paEmail, paEmail), eq(emailLog.isTezit, true)))
    .orderBy(desc(emailLog.processedAt));

  res.json({ data: logs, meta: { total: logs.length } });
});

export const tezTransportRoutes = router;
