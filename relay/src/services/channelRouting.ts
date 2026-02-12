/**
 * Channel routing service — resolves the best delivery channel per user.
 *
 * Priority:
 * 1. user_channel_link (connected links from the new channel system)
 * 2. contacts.preferredChannel / contacts.channels (legacy fields)
 * 3. Fallback to "tezit" (always available)
 *
 * This replaces direct reads of contacts.phone / contacts.telegramId etc.
 */

import { eq, and } from "drizzle-orm";
import { db, contacts, userChannelLink } from "../db/index.js";

export interface ResolvedRoute {
  userId: string;
  channel: string;
  handle: string | null;
  source: "channel_link" | "contact_legacy" | "fallback";
}

/**
 * Resolve the best delivery channel for a single user within a team.
 */
export async function resolveChannelForUser(
  userId: string,
  teamId: string
): Promise<ResolvedRoute> {
  // 1. Check user_channel_link for connected channels
  const links = await db
    .select()
    .from(userChannelLink)
    .where(
      and(
        eq(userChannelLink.teamId, teamId),
        eq(userChannelLink.userId, userId),
        eq(userChannelLink.status, "connected")
      )
    );

  // Get contact for routing prefs
  const contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, userId))
    .limit(1);

  const preferredChannel = contact[0]?.preferredChannel ?? null;
  const channelOrder = (contact[0]?.channels as string[] | null) ?? [];

  // If preferred channel has a connected link, use it
  if (preferredChannel) {
    const preferredLink = links.find((l) => l.provider === preferredChannel);
    if (preferredLink) {
      return {
        userId,
        channel: preferredChannel,
        handle: preferredLink.handle,
        source: "channel_link",
      };
    }
  }

  // Walk fallback order, preferring connected links
  for (const ch of channelOrder) {
    const link = links.find((l) => l.provider === ch);
    if (link) {
      return {
        userId,
        channel: ch,
        handle: link.handle,
        source: "channel_link",
      };
    }
  }

  // Any connected link at all
  if (links.length > 0) {
    return {
      userId,
      channel: links[0].provider,
      handle: links[0].handle,
      source: "channel_link",
    };
  }

  // 2. Legacy fallback: use contact fields directly
  if (contact.length > 0) {
    if (preferredChannel) {
      const handle = getLegacyHandle(contact[0], preferredChannel);
      if (handle) {
        return { userId, channel: preferredChannel, handle, source: "contact_legacy" };
      }
    }
    for (const ch of channelOrder) {
      const handle = getLegacyHandle(contact[0], ch);
      if (handle) {
        return { userId, channel: ch, handle, source: "contact_legacy" };
      }
    }
  }

  // 3. Absolute fallback: tezit (native PA-to-PA)
  return { userId, channel: "tezit", handle: null, source: "fallback" };
}

/**
 * Resolve routes for multiple recipients.
 */
export async function resolveChannelsForRecipients(
  recipientIds: string[],
  teamId: string
): Promise<ResolvedRoute[]> {
  const results: ResolvedRoute[] = [];
  for (const userId of recipientIds) {
    results.push(await resolveChannelForUser(userId, teamId));
  }
  return results;
}

function getLegacyHandle(
  contact: { phone: string | null; telegramId: string | null; email: string | null },
  channel: string
): string | null {
  switch (channel) {
    case "whatsapp":
    case "sms":
      return contact.phone;
    case "telegram":
      return contact.telegramId;
    case "email":
      return contact.email;
    default:
      return null;
  }
}
