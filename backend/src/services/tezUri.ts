/**
 * Tez URI Scheme Parser & Builder
 *
 * Implements the `tez://` URI scheme for the Tezit Protocol v1.2.4.
 * URIs follow the format: tez://platform/cardId[/subresource/id][?params]
 *
 * Examples:
 *   tez://mypa.chat/abc-123
 *   tez://mypa.chat/abc-123/context/ctx-456
 *   tez://mypa.chat/abc-123/interrogate?sessionId=sess-789
 *   tez://mypa.chat/abc-123/fork/def-456
 */

// ============= Types =============

export interface TezUri {
  platform: string;
  cardId: string;
  subresource?: string;
  subresourceId?: string;
  params?: Record<string, string>;
}

// ============= Constants =============

const TEZ_SCHEME = "tez://";

/** Subresources recognized by the Tezit Protocol v1.2.4 */
const VALID_SUBRESOURCES = [
  "context",
  "interrogate",
  "fork",
  "citations",
  "synthesis",
  "parameters",
] as const;

// ============= Parser =============

/**
 * Parse a `tez://` URI string into its component parts.
 *
 * @param uri - The full tez:// URI to parse
 * @returns Parsed TezUri object
 * @throws Error with a descriptive message if the URI is invalid
 */
export function parseTezUri(uri: string): TezUri {
  if (!uri || typeof uri !== "string") {
    throw new Error("Tez URI must be a non-empty string");
  }

  if (!uri.startsWith(TEZ_SCHEME)) {
    throw new Error(
      `Invalid Tez URI scheme: expected "${TEZ_SCHEME}" prefix, got "${uri.slice(0, Math.min(uri.indexOf("://") + 3, 10) || 10)}"`
    );
  }

  const withoutScheme = uri.slice(TEZ_SCHEME.length);
  if (!withoutScheme) {
    throw new Error("Tez URI is missing platform and card ID: tez://");
  }

  // Split query string from path
  const [pathPart, queryPart] = splitOnce(withoutScheme, "?");

  // Split path segments: platform/cardId[/subresource[/subresourceId]]
  const segments = pathPart.split("/").filter((s) => s.length > 0);

  if (segments.length < 2) {
    throw new Error(
      `Tez URI must include at least platform and card ID (e.g. tez://mypa.chat/abc-123), got: ${uri}`
    );
  }

  const platform = segments[0];
  const cardId = segments[1];

  if (!platform) {
    throw new Error(`Tez URI has an empty platform: ${uri}`);
  }
  if (!cardId) {
    throw new Error(`Tez URI has an empty card ID: ${uri}`);
  }

  const result: TezUri = { platform, cardId };

  // Optional subresource (3rd segment)
  if (segments.length >= 3) {
    result.subresource = segments[2];
  }

  // Optional subresource ID (4th segment)
  if (segments.length >= 4) {
    result.subresourceId = segments[3];
  }

  // Reject excessive path depth
  if (segments.length > 4) {
    throw new Error(
      `Tez URI has too many path segments (max 4: platform/cardId/subresource/subresourceId), got ${segments.length}: ${uri}`
    );
  }

  // Parse query parameters
  if (queryPart) {
    result.params = parseQueryString(queryPart);
  }

  return result;
}

// ============= Builder =============

/**
 * Build a `tez://` URI string from component parts.
 *
 * @param parts - The TezUri parts to assemble
 * @returns A valid tez:// URI string
 * @throws Error if required fields are missing
 */
export function buildTezUri(parts: TezUri): string {
  if (!parts.platform) {
    throw new Error("Cannot build Tez URI: platform is required");
  }
  if (!parts.cardId) {
    throw new Error("Cannot build Tez URI: cardId is required");
  }

  let uri = `${TEZ_SCHEME}${encodeURIComponent(parts.platform)}/${encodeURIComponent(parts.cardId)}`;

  if (parts.subresource) {
    uri += `/${encodeURIComponent(parts.subresource)}`;

    if (parts.subresourceId) {
      uri += `/${encodeURIComponent(parts.subresourceId)}`;
    }
  } else if (parts.subresourceId) {
    throw new Error(
      "Cannot build Tez URI: subresourceId requires a subresource"
    );
  }

  if (parts.params && Object.keys(parts.params).length > 0) {
    uri += "?" + buildQueryString(parts.params);
  }

  return uri;
}

// ============= Validator =============

/**
 * Check whether a string is a valid `tez://` URI.
 *
 * @param uri - The string to validate
 * @returns true if the URI can be parsed successfully
 */
export function isValidTezUri(uri: string): boolean {
  try {
    parseTezUri(uri);
    return true;
  } catch {
    return false;
  }
}

// ============= Internal Helpers =============

/**
 * Split a string on the first occurrence of a delimiter.
 * Returns [whole, undefined] if delimiter is not found.
 */
function splitOnce(str: string, delimiter: string): [string, string | undefined] {
  const idx = str.indexOf(delimiter);
  if (idx === -1) {
    return [str, undefined];
  }
  return [str.slice(0, idx), str.slice(idx + delimiter.length)];
}

/**
 * Parse a query string (without leading '?') into a key-value record.
 */
function parseQueryString(qs: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!qs) return params;

  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const [rawKey, rawValue] = splitOnce(pair, "=");
    const key = decodeURIComponent(rawKey);
    const value = rawValue !== undefined ? decodeURIComponent(rawValue) : "";
    if (key) {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Build a query string (without leading '?') from a key-value record.
 */
function buildQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");
}
