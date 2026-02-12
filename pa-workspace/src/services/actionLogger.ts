/**
 * PA Action Logger
 *
 * Logs PA actions to both:
 *  1. Local SQLite (pa_action_log table) — always available
 *  2. PA's Google Calendar — timesheet events (color-coded by action type)
 *
 * Each action type maps to a color-coded calendar event.
 * Calendar sync is best-effort: failures don't block the action log.
 */

import { db, paActionLog } from "../db/index.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";
import { createPaCalendarEvent } from "./googleCalendar.js";

/** Action type → Google Calendar color ID mapping */
export const ACTION_COLORS: Record<string, string> = {
  card_created: "9",      // Blueberry
  email_read: "7",        // Peacock
  email_sent: "5",        // Banana
  tez_received: "10",     // Basil
  tez_sent: "6",          // Tangerine
  calendar_checked: "3",  // Grape
  briefing_generated: "1", // Lavender
  general: "8",           // Graphite
};

/** Default action duration in ms when not specified (5 minutes). */
const DEFAULT_DURATION_MS = 5 * 60 * 1000;

/**
 * Log a PA action to local DB and optionally sync to Google Calendar.
 *
 * @param params.serviceAccountJson - If provided, syncs to Google Calendar
 */
export async function logAction(params: {
  paEmail: string;
  actionType: string;
  summary: string;
  durationMs?: number;
  cardId?: string;
  emailMessageId?: string;
  calendarEventId?: string;
  serviceAccountJson?: string;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date();

  await db.insert(paActionLog).values({
    id,
    paEmail: params.paEmail,
    actionType: params.actionType,
    summary: params.summary,
    timestamp: now,
    durationMs: params.durationMs || null,
    cardId: params.cardId || null,
    emailMessageId: params.emailMessageId || null,
    calendarEventId: params.calendarEventId || null,
    calendarSyncStatus: "pending",
  });

  logger.debug("Action logged", { id, paEmail: params.paEmail, actionType: params.actionType });

  // Sync to Google Calendar if credentials available
  if (params.serviceAccountJson) {
    try {
      const duration = params.durationMs || DEFAULT_DURATION_MS;
      const endTime = new Date(now.getTime() + duration);
      const colorId = ACTION_COLORS[params.actionType] || ACTION_COLORS.general;

      const event = await createPaCalendarEvent({
        serviceAccountJson: params.serviceAccountJson,
        paEmail: params.paEmail,
        summary: `[${params.actionType}] ${params.summary}`,
        description: [
          `Action: ${params.actionType}`,
          params.cardId ? `Card: ${params.cardId}` : null,
          params.emailMessageId ? `Email: ${params.emailMessageId}` : null,
          `Duration: ${Math.round(duration / 1000)}s`,
        ].filter(Boolean).join("\n"),
        startTime: now,
        endTime,
        colorId,
      });

      await db
        .update(paActionLog)
        .set({
          googleCalendarEventId: event.eventId,
          calendarSyncStatus: "synced",
        })
        .where(eq(paActionLog.id, id));

      logger.debug("Action synced to calendar", { id, eventId: event.eventId });
    } catch (error) {
      await db
        .update(paActionLog)
        .set({ calendarSyncStatus: "failed" })
        .where(eq(paActionLog.id, id));

      logger.warn("Calendar sync failed (action still logged locally)", {
        id,
        paEmail: params.paEmail,
        error: (error as Error).message,
      });
    }
  }

  return id;
}
