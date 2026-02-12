/**
 * Google Voice Service
 *
 * Google Voice is included with Google Workspace accounts. Each PA gets a
 * phone number that users can link their personal number to.
 *
 * Note: Google Voice Admin API has limited programmatic support.
 * Number assignment typically happens through the Google Admin Console.
 * This service provides:
 *  - Number assignment tracking (after admin provisions via console)
 *  - SMS sending via the PA's Gmail (Google Voice SMS appear in Gmail)
 *  - Voicemail/SMS detection in the PA's inbox
 */

import { logger } from "../middleware/logging.js";

// ============= Types =============

export interface VoiceConfig {
  serviceAccountJson: string;
  paEmail: string;
  voiceNumber?: string;
}

export interface VoiceSmsMessage {
  gmailMessageId: string;
  from: string;
  body: string;
  timestamp: string;
  isVoicemail: boolean;
}

// ============= Number Management =============

/**
 * Check if a PA's Google Workspace account has a Voice number assigned.
 * This reads from Gmail labels — Google Voice creates specific labels.
 *
 * Returns the voice number if found, null otherwise.
 */
export async function detectVoiceNumber(config: VoiceConfig): Promise<string | null> {
  logger.info("Detecting Voice number for PA", { paEmail: config.paEmail });

  // Import Gmail service to check for Voice labels
  const { readPaInbox } = await import("./googleGmail.js");

  try {
    // Google Voice messages in Gmail have a specific pattern
    // Search for any Voice SMS/voicemail to detect the number
    const messages = await readPaInbox({
      serviceAccountJson: config.serviceAccountJson,
      paEmail: config.paEmail,
      query: "label:sms OR label:voicemail OR from:voice-noreply@google.com",
      maxResults: 1,
    });

    if (messages.length > 0) {
      // The Voice number is typically in the To header for outbound
      // or mentioned in the Voice notification emails
      const voiceMsg = messages[0];
      const voiceMatch = voiceMsg.body.match(/\+?\d[\d\s()-]{9,}/);
      if (voiceMatch) {
        const number = voiceMatch[0].replace(/[\s()-]/g, "");
        logger.info("Detected Voice number", { paEmail: config.paEmail, number });
        return number;
      }
    }

    logger.info("No Voice number detected", { paEmail: config.paEmail });
    return null;
  } catch (error) {
    logger.warn("Failed to detect Voice number", {
      paEmail: config.paEmail,
      error: (error as Error).message,
    });
    return null;
  }
}

// ============= SMS via Gmail =============

/**
 * Read SMS messages from a PA's Google Voice via Gmail.
 * Google Voice stores SMS as emails in Gmail with specific labels.
 */
export async function readVoiceSms(config: VoiceConfig & {
  maxResults?: number;
}): Promise<VoiceSmsMessage[]> {
  logger.info("Reading Voice SMS for PA", { paEmail: config.paEmail });

  const { readPaInbox } = await import("./googleGmail.js");

  try {
    const messages = await readPaInbox({
      serviceAccountJson: config.serviceAccountJson,
      paEmail: config.paEmail,
      // Google Voice SMS in Gmail are tagged with specific subjects/labels
      query: "from:voice-noreply@google.com subject:\"New text message\" OR subject:\"New voicemail\"",
      maxResults: config.maxResults ?? 20,
    });

    return messages.map((msg) => ({
      gmailMessageId: msg.id,
      from: extractVoiceSender(msg.body),
      body: extractVoiceBody(msg.body),
      timestamp: msg.date,
      isVoicemail: msg.subject.toLowerCase().includes("voicemail"),
    }));
  } catch (error) {
    logger.error("Failed to read Voice SMS", error as Error, { paEmail: config.paEmail });
    return [];
  }
}

/**
 * Send an SMS via the PA's Google Voice.
 *
 * Google Voice SMS sending is not directly supported via API.
 * This uses the Gmail compose approach: sends an email to
 * {phone-number}@txt.voice.google.com which routes through Voice.
 */
export async function sendVoiceSms(config: VoiceConfig & {
  toNumber: string;
  body: string;
}): Promise<{ messageId: string } | null> {
  logger.info("Sending Voice SMS", {
    paEmail: config.paEmail,
    toNumber: config.toNumber,
  });

  if (!config.voiceNumber) {
    logger.warn("Cannot send SMS — PA has no Voice number configured");
    return null;
  }

  // Normalize the phone number (remove non-digits except leading +)
  const normalized = config.toNumber.replace(/[^\d+]/g, "");
  if (normalized.length < 10) {
    logger.warn("Invalid phone number for SMS", { toNumber: config.toNumber });
    return null;
  }

  const { sendFromPa } = await import("./googleGmail.js");

  try {
    // Google Voice SMS via Gmail: email to phone@txt.voice.google.com
    const smsEmail = `${normalized}@txt.voice.google.com`;
    const result = await sendFromPa({
      serviceAccountJson: config.serviceAccountJson,
      paEmail: config.paEmail,
      to: smsEmail,
      subject: "", // SMS has no subject
      body: config.body,
    });

    logger.info("Voice SMS sent", {
      paEmail: config.paEmail,
      messageId: result.messageId,
    });

    return result;
  } catch (error) {
    logger.error("Failed to send Voice SMS", error as Error, {
      paEmail: config.paEmail,
      toNumber: config.toNumber,
    });
    return null;
  }
}

// ============= Helpers =============

/**
 * Extract the sender phone number from a Google Voice notification email body.
 */
function extractVoiceSender(body: string): string {
  // Google Voice emails typically contain the caller's number
  const match = body.match(/from\s*[:：]\s*(\+?\d[\d\s()-]{9,})/i)
    || body.match(/(\+?\d[\d\s()-]{9,})/);
  return match ? match[1].replace(/[\s()-]/g, "") : "unknown";
}

/**
 * Extract the message body from a Google Voice notification email.
 */
function extractVoiceBody(body: string): string {
  // Strip Google Voice email chrome and extract the actual message
  // Voice notification emails have the message text between markers
  const lines = body.split("\n");
  const contentLines: string[] = [];
  let inContent = false;

  for (const line of lines) {
    // Skip header lines
    if (line.includes("New text message") || line.includes("New voicemail")) {
      inContent = true;
      continue;
    }
    if (inContent && line.trim() === "") {
      // End of content on empty line after start
      if (contentLines.length > 0) break;
      continue;
    }
    if (inContent) {
      contentLines.push(line.trim());
    }
  }

  return contentLines.join("\n") || body.slice(0, 500);
}
