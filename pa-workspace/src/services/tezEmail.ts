/**
 * Tezit Protocol Email Transport
 *
 * Extends the Tezit Protocol (https://github.com/tezit-protocol/spec) with
 * email as a transport mechanism. Every PA email address becomes a Tezit
 * Protocol endpoint.
 *
 * Outbound: compose email with X-Tezit-Protocol header + .tez.json attachment
 * Inbound: detect Tez markers in PA inbox, extract and import bundles
 */

import { logger } from "../middleware/logging.js";

/** Tezit Protocol email header */
export const TEZIT_PROTOCOL_HEADER = "X-Tezit-Protocol";
export const TEZIT_PROTOCOL_VERSION = "1.2";

/** Attachment filename for Portable Tez bundles */
export const TEZ_BUNDLE_FILENAME = "tez-bundle.tez.json";

// ============= Types =============

export interface TezBundle {
  tezit_version: string;
  id?: string;
  title?: string;
  type?: string;
  created?: string;
  author?: string;
  context?: Record<string, unknown>;
  content?: string;
  [key: string]: unknown;
}

export interface TezEmailComponents {
  headers: Record<string, string>;
  body: string;
  attachments: Array<{ filename: string; content: string; mimeType: string }>;
}

// ============= Detection =============

/**
 * Detect whether an email contains Tezit Protocol content.
 */
export function detectTezitContent(email: {
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string }>;
  body?: string;
}): boolean {
  // Check for X-Tezit-Protocol header
  if (email.headers?.[TEZIT_PROTOCOL_HEADER]) return true;

  // Check for .tez.json attachment
  if (email.attachments?.some((a) => a.filename.endsWith(".tez.json"))) return true;

  // Check for inline Tez markdown (YAML frontmatter with tezit markers)
  if (email.body?.includes("tezit_version:")) return true;

  return false;
}

// ============= Extraction (Inbound) =============

/**
 * Extract a Tezit bundle from an email.
 * Tries sources in priority order:
 *  1. .tez.json attachment (most reliable)
 *  2. Inline YAML frontmatter in body
 *  3. Plain body text wrapped as minimal bundle
 */
export async function extractTezBundle(email: {
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: string }>;
  body?: string;
  from?: string;
  subject?: string;
}): Promise<TezBundle | null> {
  // 1. Try .tez.json attachment
  const tezAttachment = email.attachments?.find((a) => a.filename.endsWith(".tez.json"));
  if (tezAttachment) {
    try {
      // Attachment content may be base64url-encoded (from Gmail API)
      const decoded = decodeAttachmentContent(tezAttachment.content);
      const bundle = JSON.parse(decoded) as TezBundle;
      if (bundle.tezit_version) {
        logger.info("Extracted Tez bundle from attachment", { filename: tezAttachment.filename });
        return bundle;
      }
    } catch (error) {
      logger.warn("Failed to parse .tez.json attachment", { error: (error as Error).message });
    }
  }

  // 2. Try inline YAML frontmatter
  if (email.body) {
    const bundle = parseInlineTez(email.body);
    if (bundle) {
      logger.info("Extracted Tez bundle from inline markdown");
      return bundle;
    }
  }

  // 3. If X-Tezit-Protocol header present but no parseable bundle,
  //    wrap the body as a minimal bundle
  if (email.headers?.[TEZIT_PROTOCOL_HEADER] && email.body) {
    logger.info("Wrapping email body as minimal Tez bundle");
    return {
      tezit_version: email.headers[TEZIT_PROTOCOL_HEADER],
      title: email.subject || "Untitled Tez",
      type: "message",
      author: email.from || "unknown",
      created: new Date().toISOString(),
      content: email.body,
    };
  }

  return null;
}

/**
 * Parse inline Tez from email body (YAML frontmatter + markdown content).
 * Format:
 *   ---
 *   tezit_version: 1.2
 *   title: My Tez
 *   ...
 *   ---
 *   # Content here
 */
function parseInlineTez(body: string): TezBundle | null {
  // Match YAML frontmatter
  const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    // Try without content section
    const headerOnly = body.match(/^---\s*\n([\s\S]*?)\n---\s*$/);
    if (!headerOnly) return null;
    return parseYamlFrontmatter(headerOnly[1], "");
  }

  return parseYamlFrontmatter(match[1], match[2]);
}

/**
 * Simple YAML frontmatter parser (key: value pairs only, no nested structures).
 */
function parseYamlFrontmatter(yaml: string, content: string): TezBundle | null {
  const result: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) {
      result[key] = value;
    }
  }

  if (!result.tezit_version) return null;

  return {
    tezit_version: result.tezit_version,
    id: result.id,
    title: result.title,
    type: result.type || "message",
    author: result.author,
    created: result.created || new Date().toISOString(),
    content: content.trim() || undefined,
  };
}

/**
 * Decode attachment content which may be base64url-encoded (from Gmail API).
 */
function decodeAttachmentContent(content: string): string {
  // If it looks like base64url (no spaces/newlines, has - or _), decode it
  if (/^[A-Za-z0-9_-]+$/.test(content.replace(/\s/g, ""))) {
    const base64 = content.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  }
  // Otherwise assume it's already plain text
  return content;
}

// ============= Composition (Outbound) =============

/**
 * Compose a Tez email with proper Tezit Protocol headers and attachment.
 *
 * The email includes:
 *  - X-Tezit-Protocol: 1.2 header
 *  - Human-readable Tez summary in the body
 *  - .tez.json attachment with the full Portable Tez bundle
 *  - tez://{id} deep link in the body
 */
export function composeTezEmail(params: {
  bundle: TezBundle;
  fromEmail: string;
  toEmail: string;
  subject?: string;
}): TezEmailComponents {
  const { bundle, fromEmail, toEmail } = params;
  const subject = params.subject || `Tez: ${bundle.title || "Untitled"}`;

  // Build human-readable body
  const bodyLines: string[] = [];
  bodyLines.push(`Tezit Protocol v${bundle.tezit_version}`);
  bodyLines.push("");

  if (bundle.title) {
    bodyLines.push(`# ${bundle.title}`);
    bodyLines.push("");
  }

  if (bundle.type) {
    bodyLines.push(`Type: ${bundle.type}`);
  }
  if (bundle.author) {
    bodyLines.push(`Author: ${bundle.author}`);
  }
  if (bundle.created) {
    bodyLines.push(`Created: ${bundle.created}`);
  }

  bodyLines.push("");

  if (bundle.content) {
    bodyLines.push(bundle.content);
    bodyLines.push("");
  }

  if (bundle.id) {
    bodyLines.push(`---`);
    bodyLines.push(`Deep link: tez://${bundle.id}`);
  }

  bodyLines.push("");
  bodyLines.push(`From: ${fromEmail}`);
  bodyLines.push(`To: ${toEmail}`);
  bodyLines.push("");
  bodyLines.push("This email was sent via the Tezit Protocol. The full Tez bundle is attached as a .tez.json file.");

  // Build attachment (full bundle as JSON)
  const bundleJson = JSON.stringify(bundle, null, 2);
  const attachmentContent = Buffer.from(bundleJson).toString("base64");

  return {
    headers: {
      [TEZIT_PROTOCOL_HEADER]: bundle.tezit_version || TEZIT_PROTOCOL_VERSION,
      "X-Tezit-Id": bundle.id || "",
      "X-Tezit-Type": bundle.type || "message",
    },
    body: bodyLines.join("\n"),
    attachments: [
      {
        filename: bundle.id ? `${bundle.id}.tez.json` : TEZ_BUNDLE_FILENAME,
        content: attachmentContent,
        mimeType: "application/json",
      },
    ],
  };
}
