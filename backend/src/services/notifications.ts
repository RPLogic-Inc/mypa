/**
 * Push Notification Service using ntfy.sh
 *
 * ntfy.sh is a simple pub-sub notification service that allows sending
 * push notifications to any device via HTTP POST requests.
 */

import { logger } from "../middleware/logging.js";
import { APP_NAME, APP_SLUG } from "../config/app.js";
import { DEFAULT_NTFY_SERVER_URL, validateNtfyServerUrl } from "./urlSecurity.js";

// Map card priority to ntfy priority levels (1-5)
// 1 = min, 2 = low, 3 = default, 4 = high, 5 = urgent/max
const PRIORITY_MAP: Record<string, number> = {
  critical: 5,
  urgent: 5,
  high: 4,
  medium: 3,
  low: 2,
};

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  priority: string;
  tags?: string[];
  click?: string; // URL to open when notification is clicked
  cardId?: string;
}

export interface NotificationResult {
  success: boolean;
  userId: string;
  error?: string;
}

function resolveNtfyServerUrl(): string {
  const candidate = process.env.NTFY_SERVER_URL || DEFAULT_NTFY_SERVER_URL;
  const validated = validateNtfyServerUrl(candidate);
  if (!validated.valid || !validated.normalizedUrl) {
    logger.warn("Invalid NTFY_SERVER_URL; falling back to default", {
      configuredUrl: candidate,
      reason: validated.message,
    });
    return DEFAULT_NTFY_SERVER_URL;
  }
  return validated.normalizedUrl;
}

function getRequestTimeoutMs(): number {
  const parsed = Number(process.env.NTFY_TIMEOUT_MS || 2500);
  if (!Number.isFinite(parsed) || parsed < 250) return 2500;
  return parsed;
}

/**
 * Get the ntfy topic for a user
 * Format: {APP_SLUG}-{userId}
 */
export function getNtfyTopic(userId: string): string {
  return `${APP_SLUG}-${userId}`;
}

/**
 * Get the full ntfy URL for a user's topic
 */
export function getNtfyUrl(userId: string): string {
  return `${resolveNtfyServerUrl()}/${getNtfyTopic(userId)}`;
}

/**
 * Send a push notification via ntfy.sh
 */
export async function sendNotification(
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (process.env.NODE_ENV === "test" || process.env.DISABLE_NOTIFICATIONS === "true") {
    return {
      success: true,
      userId: payload.userId,
    };
  }

  const topic = getNtfyTopic(payload.userId);
  const ntfyPriority = PRIORITY_MAP[payload.priority] || 3;

  try {
    const headers: Record<string, string> = {
      Title: payload.title,
      Priority: ntfyPriority.toString(),
    };

    // Add optional tags (displayed as emojis in ntfy)
    if (payload.tags && payload.tags.length > 0) {
      headers.Tags = payload.tags.join(",");
    }

    // Add click action to open app/card
    if (payload.click) {
      headers.Click = payload.click;
    }

    // Add card ID as action button if provided
    if (payload.cardId) {
      headers.Actions = `view, View Card, ${payload.click || `/cards/${payload.cardId}`}`;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), getRequestTimeoutMs());
    let response: Response;
    try {
      response = await fetch(`${resolveNtfyServerUrl()}/${topic}`, {
        method: "POST",
        headers,
        body: payload.message,
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`ntfy.sh error for user ${payload.userId}: ${errorText}`);
      return {
        success: false,
        userId: payload.userId,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    logger.info(`Notification sent to ${topic}: ${payload.title}`);
    return {
      success: true,
      userId: payload.userId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(`Failed to send notification to ${payload.userId}`, error as Error);
    return {
      success: false,
      userId: payload.userId,
      error: errorMessage,
    };
  }
}

/**
 * Send notifications to multiple users
 */
export async function sendNotifications(
  payloads: NotificationPayload[]
): Promise<NotificationResult[]> {
  const results = await Promise.all(payloads.map(sendNotification));
  return results;
}

/**
 * Send a card notification to recipients
 * This is the main function used when creating team cards
 */
export async function notifyCardRecipients(options: {
  cardId: string;
  cardSummary: string;
  cardContent: string;
  priority: string;
  senderName: string;
  recipientIds: string[];
  notifyImmediately?: boolean;
  appBaseUrl?: string;
}): Promise<NotificationResult[]> {
  const {
    cardId,
    cardSummary,
    cardContent,
    priority,
    senderName,
    recipientIds,
    notifyImmediately,
    appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173",
  } = options;

  // Determine if we should send notifications
  // Default: always notify unless explicitly disabled (notifyImmediately === false)
  // Team messages should always notify recipients so they know something is waiting
  const shouldNotify = notifyImmediately !== false;

  if (!shouldNotify) {
    logger.info(
      `Skipping notification for card ${cardId} - explicitly disabled`
    );
    return [];
  }

  // Build notification payloads for each recipient
  const payloads: NotificationPayload[] = recipientIds.map((userId) => {
    // Use summary if available, otherwise truncate content
    const displayMessage =
      cardSummary || (cardContent.length > 100 ? cardContent.slice(0, 100) + "..." : cardContent);

    // Choose tags based on priority
    const tags: string[] = [];
    if (priority === "critical" || priority === "urgent") {
      tags.push("warning");
    } else if (priority === "high") {
      tags.push("bell");
    } else {
      tags.push("speech_balloon");
    }

    return {
      userId,
      title: `New message from ${senderName}`,
      message: displayMessage,
      priority,
      tags,
      click: `${appBaseUrl}/cards/${cardId}`,
      cardId,
    };
  });

  return sendNotifications(payloads);
}

/**
 * Send a test notification to verify setup
 */
export async function sendTestNotification(
  userId: string
): Promise<NotificationResult> {
  return sendNotification({
    userId,
    title: `${APP_NAME} Notifications Active`,
    message:
      "Your push notifications are working! You will receive alerts for urgent and high-priority messages.",
    priority: "medium",
    tags: ["white_check_mark", "tada"],
  });
}

export const notificationService = {
  sendNotification,
  sendNotifications,
  notifyCardRecipients,
  sendTestNotification,
  getNtfyTopic,
  getNtfyUrl,
};
