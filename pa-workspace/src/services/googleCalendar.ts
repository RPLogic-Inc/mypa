/**
 * Google Calendar API Service
 *
 * Uses domain-wide delegation to:
 *  - Create events on PA calendars (action logging/timesheet)
 *  - Read calendars shared with the PA by users (Phase 6)
 *  - Query team availability via freebusy (Phase 6)
 */

import { google, calendar_v3 } from "googleapis";
import { logger } from "../middleware/logging.js";

// ============= Types =============

export interface CalendarCredentials {
  serviceAccountJson: string;
  /** PA email — the service account impersonates this user via delegation. */
  paEmail: string;
}

export interface CreateEventParams extends CalendarCredentials {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  colorId?: string;
}

export interface CalendarEvent {
  eventId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  colorId?: string;
  htmlLink?: string;
}

export interface ListEventsParams extends CalendarCredentials {
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  calendarId?: string;
}

// ============= Auth =============

/**
 * Create an authenticated Calendar API client using domain-wide delegation.
 * The service account impersonates the PA user to access their calendar.
 */
function getCalendarClient(creds: CalendarCredentials): calendar_v3.Calendar {
  const sa = JSON.parse(creds.serviceAccountJson);

  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    subject: creds.paEmail,
  });

  return google.calendar({ version: "v3", auth: jwtClient });
}

// ============= Write Operations (Phase 3) =============

/**
 * Create a calendar event on a PA's Google Calendar (timesheet entry).
 * Returns the created event's ID and details.
 */
export async function createPaCalendarEvent(params: CreateEventParams): Promise<CalendarEvent> {
  logger.info("Creating PA calendar event", { paEmail: params.paEmail, summary: params.summary });

  const calendar = getCalendarClient(params);

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: params.startTime.toISOString(),
      },
      end: {
        dateTime: params.endTime.toISOString(),
      },
      colorId: params.colorId,
      transparency: "transparent", // PA actions don't block time
    },
  });

  const event = res.data;

  logger.info("PA calendar event created", {
    paEmail: params.paEmail,
    eventId: event.id,
  });

  return {
    eventId: event.id!,
    summary: event.summary || params.summary,
    description: event.description || undefined,
    start: event.start?.dateTime || params.startTime.toISOString(),
    end: event.end?.dateTime || params.endTime.toISOString(),
    colorId: event.colorId || undefined,
    htmlLink: event.htmlLink || undefined,
  };
}

/**
 * Delete a calendar event from a PA's calendar.
 */
export async function deletePaCalendarEvent(
  creds: CalendarCredentials,
  eventId: string,
): Promise<void> {
  logger.info("Deleting PA calendar event", { paEmail: creds.paEmail, eventId });

  const calendar = getCalendarClient(creds);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
    sendUpdates: "none",
  });
}

/**
 * List events on a PA's primary calendar.
 */
export async function listPaCalendarEvents(params: ListEventsParams): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient(params);
  const calendarId = params.calendarId || "primary";
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const res = await calendar.events.list({
      calendarId,
      maxResults: params.maxResults ?? 100,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: params.timeMin?.toISOString(),
      timeMax: params.timeMax?.toISOString(),
      pageToken,
    });

    if (res.data.items) {
      for (const event of res.data.items) {
        allEvents.push({
          eventId: event.id!,
          summary: event.summary || "(no title)",
          description: event.description || undefined,
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          colorId: event.colorId || undefined,
          htmlLink: event.htmlLink || undefined,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allEvents;
}

// ============= Read Operations (Phase 6) =============

export interface SharedCalendar {
  calendarId: string;
  summary: string;
  description?: string;
  accessRole: string;
}

/**
 * List calendars shared with the PA (secondary calendars only).
 * Users share their personal calendar with the PA's email — this shows up in the PA's calendar list.
 */
export async function listSharedCalendars(creds: CalendarCredentials): Promise<SharedCalendar[]> {
  logger.info("Listing shared calendars", { paEmail: creds.paEmail });

  const calendar = getCalendarClient(creds);

  const res = await calendar.calendarList.list({
    showHidden: false,
  });

  const calendars: SharedCalendar[] = [];
  for (const item of res.data.items || []) {
    // Skip the PA's own primary calendar
    if (item.id === creds.paEmail || item.primary) continue;

    calendars.push({
      calendarId: item.id!,
      summary: item.summary || item.id || "",
      description: item.description || undefined,
      accessRole: item.accessRole || "reader",
    });
  }

  logger.info("Found shared calendars", { paEmail: creds.paEmail, count: calendars.length });
  return calendars;
}

/**
 * Read events from calendars shared with the PA.
 * Lists all secondary calendars, then fetches events from each.
 */
export async function readSharedCalendarEvents(params: ListEventsParams): Promise<CalendarEvent[]> {
  logger.info("Reading shared calendar events", { paEmail: params.paEmail });

  const sharedCalendars = await listSharedCalendars(params);
  if (sharedCalendars.length === 0) return [];

  const allEvents: CalendarEvent[] = [];

  for (const cal of sharedCalendars) {
    try {
      const events = await listPaCalendarEvents({
        ...params,
        calendarId: cal.calendarId,
      });
      // Tag events with their source calendar
      for (const event of events) {
        allEvents.push({
          ...event,
          description: event.description
            ? `[${cal.summary}] ${event.description}`
            : `[${cal.summary}]`,
        });
      }
    } catch (error) {
      logger.warn("Failed to read shared calendar", {
        calendarId: cal.calendarId,
        summary: cal.summary,
        error: (error as Error).message,
      });
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => a.start.localeCompare(b.start));

  logger.info("Shared calendar events read", { paEmail: params.paEmail, count: allEvents.length });
  return allEvents;
}

/**
 * Get team availability by aggregating freebusy data from shared calendars.
 * Uses the Calendar API's freebusy.query to find busy time slots.
 */
export async function getTeamAvailability(params: {
  serviceAccountJson: string;
  paEmails: string[];
  timeMin: Date;
  timeMax: Date;
}): Promise<Record<string, Array<{ start: string; end: string }>>> {
  logger.info("Getting team availability", { paCount: params.paEmails.length });

  const result: Record<string, Array<{ start: string; end: string }>> = {};

  // For each PA, check their shared calendars' freebusy data
  for (const paEmail of params.paEmails) {
    const creds: CalendarCredentials = {
      serviceAccountJson: params.serviceAccountJson,
      paEmail,
    };

    try {
      const sharedCalendars = await listSharedCalendars(creds);
      if (sharedCalendars.length === 0) continue;

      const calendar = getCalendarClient(creds);

      const fbRes = await calendar.freebusy.query({
        requestBody: {
          timeMin: params.timeMin.toISOString(),
          timeMax: params.timeMax.toISOString(),
          items: sharedCalendars.map((c) => ({ id: c.calendarId })),
        },
      });

      // Merge busy slots from all shared calendars for this PA
      const busySlots: Array<{ start: string; end: string }> = [];
      for (const cal of sharedCalendars) {
        const calBusy = fbRes.data.calendars?.[cal.calendarId]?.busy || [];
        for (const slot of calBusy) {
          if (slot.start && slot.end) {
            busySlots.push({ start: slot.start, end: slot.end });
          }
        }
      }

      // Sort and store
      busySlots.sort((a, b) => a.start.localeCompare(b.start));
      if (busySlots.length > 0) {
        result[paEmail] = busySlots;
      }
    } catch (error) {
      logger.warn("Failed to get availability for PA", {
        paEmail,
        error: (error as Error).message,
      });
    }
  }

  return result;
}
