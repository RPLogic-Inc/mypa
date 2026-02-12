/**
 * Gmail API Service
 *
 * Uses domain-wide delegation to read PA inboxes and send emails.
 * The service account impersonates each PA user to access their Gmail.
 */

import { google, gmail_v1 } from "googleapis";
import { logger } from "../middleware/logging.js";

// ============= Types =============

export interface GmailCredentials {
  serviceAccountJson: string;
  /** PA email — the service account impersonates this user via delegation. */
  paEmail: string;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  headers: Record<string, string>;
  labelIds: string[];
  attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>;
}

export interface SendParams extends GmailCredentials {
  to: string;
  subject: string;
  body: string;
  /** Optional reply-to header (e.g., client's real email) */
  replyTo?: string;
  /** Custom headers (e.g., X-Tezit-Protocol) */
  headers?: Record<string, string>;
  /** MIME attachments */
  attachments?: Array<{ filename: string; content: string; mimeType: string }>;
}

// ============= Auth =============

/**
 * Create an authenticated Gmail API client using domain-wide delegation.
 * The service account impersonates the PA user to access their mailbox.
 */
function getGmailClient(creds: GmailCredentials): gmail_v1.Gmail {
  const sa = JSON.parse(creds.serviceAccountJson);

  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    subject: creds.paEmail,
  });

  return google.gmail({ version: "v1", auth: jwtClient });
}

// ============= Read Inbox =============

/**
 * Read messages from a PA's Gmail inbox.
 * Returns full message details including body and attachments.
 */
export async function readPaInbox(params: GmailCredentials & {
  maxResults?: number;
  query?: string;
}): Promise<InboxMessage[]> {
  logger.info("Reading PA inbox", { paEmail: params.paEmail, query: params.query });

  const gmail = getGmailClient(params);

  // List message IDs
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: params.query || "is:unread",
    maxResults: params.maxResults ?? 20,
  });

  const messageIds = listRes.data.messages || [];
  if (messageIds.length === 0) return [];

  // Fetch full messages
  const messages: InboxMessage[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      messages.push(parseMessage(msgRes.data));
    } catch (error) {
      logger.warn("Failed to fetch message", { messageId: id, error: (error as Error).message });
    }
  }

  logger.info("PA inbox read complete", { paEmail: params.paEmail, count: messages.length });
  return messages;
}

/**
 * Get a single message by ID.
 */
export async function getMessage(
  creds: GmailCredentials,
  messageId: string,
): Promise<InboxMessage> {
  const gmail = getGmailClient(creds);
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return parseMessage(res.data);
}

// ============= Send Email =============

/**
 * Send an email from a PA's Gmail account.
 * Supports custom headers (for Tezit Protocol) and MIME attachments.
 */
export async function sendFromPa(params: SendParams): Promise<{ messageId: string }> {
  logger.info("Sending email from PA", { paEmail: params.paEmail, to: params.to, subject: params.subject });

  const gmail = getGmailClient(params);

  const raw = buildRawEmail(params);

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  const messageId = res.data.id || "";
  logger.info("Email sent from PA", { paEmail: params.paEmail, messageId });

  return { messageId };
}

// ============= Mark as Read =============

/**
 * Mark a message as read in a PA's Gmail.
 */
export async function markAsRead(creds: GmailCredentials, messageId: string): Promise<void> {
  logger.info("Marking message as read", { paEmail: creds.paEmail, messageId });

  const gmail = getGmailClient(creds);

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}

/**
 * Add labels to a message.
 */
export async function addLabels(
  creds: GmailCredentials,
  messageId: string,
  labelIds: string[],
): Promise<void> {
  const gmail = getGmailClient(creds);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: labelIds,
    },
  });
}

// ============= Attachment Download =============

/**
 * Download an attachment from a message.
 */
export async function getAttachment(
  creds: GmailCredentials,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const gmail = getGmailClient(creds);
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  // Returns base64url-encoded data
  return res.data.data || "";
}

// ============= Helpers =============

/**
 * Parse a Gmail API Message object into our InboxMessage format.
 */
function parseMessage(msg: gmail_v1.Schema$Message): InboxMessage {
  const headers = msg.payload?.headers || [];
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    if (h.name && h.value) {
      headerMap[h.name] = h.value;
    }
  }

  const attachments: InboxMessage["attachments"] = [];
  collectAttachments(msg.payload, attachments);

  return {
    id: msg.id || "",
    threadId: msg.threadId || "",
    subject: headerMap["Subject"] || "(no subject)",
    from: headerMap["From"] || "",
    to: headerMap["To"] || "",
    date: headerMap["Date"] || "",
    snippet: msg.snippet || "",
    body: extractBody(msg.payload),
    headers: headerMap,
    labelIds: msg.labelIds || [],
    attachments,
  };
}

/**
 * Extract the plain text body from a MIME message.
 * Walks the part tree looking for text/plain, falling back to text/html.
 */
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Single-part message
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — search parts recursively
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

/**
 * Collect attachment metadata from MIME parts.
 */
function collectAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined,
  result: InboxMessage["attachments"],
): void {
  if (!payload) return;

  if (payload.filename && payload.body?.attachmentId) {
    result.push({
      filename: payload.filename,
      mimeType: payload.mimeType || "application/octet-stream",
      size: payload.body.size || 0,
      attachmentId: payload.body.attachmentId,
    });
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      collectAttachments(part, result);
    }
  }
}

/**
 * Decode a base64url-encoded string (Gmail API format).
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Encode a string to base64url (for sending via Gmail API).
 */
function encodeBase64Url(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a raw RFC 2822 email string (base64url encoded) for Gmail API send.
 * Supports custom headers and MIME attachments.
 */
function buildRawEmail(params: SendParams): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = params.attachments && params.attachments.length > 0;

  const lines: string[] = [];

  // Headers
  lines.push(`From: ${params.paEmail}`);
  lines.push(`To: ${params.to}`);
  lines.push(`Subject: ${params.subject}`);
  if (params.replyTo) {
    lines.push(`Reply-To: ${params.replyTo}`);
  }
  // Custom headers
  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("MIME-Version: 1.0");

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("");
    lines.push(params.body);

    for (const att of params.attachments!) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push("Content-Transfer-Encoding: base64");
      lines.push("");
      // Content should already be base64-encoded
      lines.push(att.content);
    }

    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("");
    lines.push(params.body);
  }

  return encodeBase64Url(lines.join("\r\n"));
}
