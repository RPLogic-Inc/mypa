import { randomUUID } from "crypto";
import { db, productEvents, tezAuditEvents } from "../db/index.js";
import { logger } from "../middleware/logging.js";

export const SHARE_INTENTS = [
  "note",
  "decision",
  "handoff",
  "question",
  "update",
  "escalation",
] as const;

export type ShareIntent = typeof SHARE_INTENTS[number];

export function normalizeShareIntent(value: unknown): ShareIntent {
  if (typeof value !== "string") return "note";
  const normalized = value.trim().toLowerCase();
  if (SHARE_INTENTS.includes(normalized as ShareIntent)) {
    return normalized as ShareIntent;
  }
  return "note";
}

export function sanitizeTezContent(input: string): {
  sanitized: string;
  redactions: string[];
} {
  let text = input;
  const redactions: string[] = [];

  const replacements: Array<[RegExp, string, string]> = [
    [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[EMAIL_REDACTED]", "email"],
    [/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]", "phone"],
    [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN_REDACTED]", "ssn"],
    [/\b\d{4}([\s-]?\d{4}){3}\b/g, "[CARD_REDACTED]", "card"],
  ];

  for (const [pattern, token, kind] of replacements) {
    if (pattern.test(text)) {
      redactions.push(kind);
      text = text.replace(pattern, token);
    }
  }

  return { sanitized: text, redactions };
}

export function generateProactiveHints(content: string, shareIntent: ShareIntent): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const baseHints: Record<ShareIntent, string[]> = {
    note: ["Summarize key point", "Ask for clarification", "Acknowledge receipt"],
    decision: ["Approve decision", "Challenge assumptions", "Request evidence"],
    handoff: ["Confirm ownership", "Ask for blockers", "Set follow-up checkpoint"],
    question: ["Answer directly", "Request more context", "Route to owner"],
    update: ["Acknowledge update", "Ask for ETA", "Identify next action"],
    escalation: ["Acknowledge urgency", "Request mitigation plan", "Escalate to lead"],
  };

  const contentHints: string[] = [];
  if (/\b(today|asap|urgent|critical|immediately)\b/i.test(trimmed)) {
    contentHints.push("This looks time-sensitive");
  }
  if (/\bblocked|blocker|stuck|cannot\b/i.test(trimmed)) {
    contentHints.push("Potential blocker detected");
  }
  if (/\bdecide|decision|option|vote\b/i.test(trimmed)) {
    contentHints.push("Decision language detected");
  }
  if (/\bowner|handoff|take over|assign\b/i.test(trimmed)) {
    contentHints.push("Ownership transition likely");
  }

  return Array.from(new Set([...contentHints, ...baseHints[shareIntent]])).slice(0, 3);
}

export async function recordTezAuditEvent(params: {
  cardId?: string | null;
  actorUserId: string;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(tezAuditEvents).values({
      id: randomUUID(),
      cardId: params.cardId || null,
      actorUserId: params.actorUserId,
      action: params.action,
      details: params.details || {},
      createdAt: new Date(),
    });
  } catch (error) {
    logger.warn("Failed to record tez audit event", {
      action: params.action,
      actorUserId: params.actorUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recordProductEvent(params: {
  userId: string;
  teamId?: string | null;
  cardId?: string | null;
  eventName: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(productEvents).values({
      id: randomUUID(),
      userId: params.userId,
      teamId: params.teamId || null,
      cardId: params.cardId || null,
      eventName: params.eventName,
      metadata: params.metadata || {},
      createdAt: new Date(),
    });
  } catch (error) {
    logger.warn("Failed to record product event", {
      eventName: params.eventName,
      userId: params.userId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
