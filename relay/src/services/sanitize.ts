/**
 * Context sanitization — strip prompt injection vectors.
 *
 * From upstream tezit-protocol/relay security audit (Issue #5):
 * 1. Unicode NFC normalization
 * 2. Zero-width character removal
 * 3. Bidi override removal
 * 4. Content length limits
 * 5. MIME type allowlist (Issue #15)
 */

// Zero-width and invisible characters to strip
const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\uFEFF\u2060]/g;

// Unicode bidi overrides that can be used for text reordering attacks
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;

// Control characters (except common whitespace: \t \n \r)
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Issue #15: MIME type allowlist for context items
const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/xml",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

// Max content size per context item (256KB)
const MAX_CONTEXT_CONTENT_LENGTH = 256 * 1024;

/**
 * Sanitize a string for safe storage and downstream AI consumption.
 */
export function sanitizeText(input: string): string {
  let cleaned = input.normalize("NFC");
  cleaned = cleaned.replace(ZERO_WIDTH_CHARS, "");
  cleaned = cleaned.replace(BIDI_OVERRIDES, "");
  cleaned = cleaned.replace(CONTROL_CHARS, "");
  return cleaned;
}

/**
 * Sanitize a context item's content and validate its metadata.
 */
export function sanitizeContextItem(item: {
  layer: string;
  content: string;
  mimeType?: string | null;
}): { content: string; mimeType: string | null } {
  if (item.content.length > MAX_CONTEXT_CONTENT_LENGTH) {
    throw new Error(
      `Context content exceeds maximum length (${MAX_CONTEXT_CONTENT_LENGTH} bytes)`
    );
  }

  const content = sanitizeText(item.content);

  let mimeType: string | null = item.mimeType ?? null;
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    mimeType = "text/plain";
  }

  return { content, mimeType };
}
