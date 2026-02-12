/**
 * Federation bundle — the payload exchanged between servers.
 *
 * A FederationBundle wraps a Tez + context in an envelope with
 * addressing, integrity, and server identity metadata.
 */

import { createHash } from "node:crypto";
import type { ServerIdentity } from "./identity.js";

export interface FederationBundle {
  // Envelope
  protocol_version: string;
  bundle_type: "federation_delivery";
  sender_server: string;
  sender_server_id: string;

  // Addressing
  from: string;          // sender tezAddress (alice@mypa.chat)
  to: string[];          // recipient tezAddresses (bob@company.tezit.chat)

  // Payload
  tez: {
    id: string;
    threadId: string | null;
    parentTezId: string | null;
    surfaceText: string;
    type: string;
    urgency: string;
    actionRequested: string | null;
    visibility: string;
    createdAt: string;
  };
  context: Array<{
    id: string;
    layer: string;
    content: string;
    mimeType: string | null;
    confidence: number | null;
    source: string | null;
    createdAt: string;
    createdBy: string;
  }>;

  // Integrity
  bundle_hash: string;
  signed_at: string;
}

/**
 * Compute the canonical hash of a tez + context payload.
 * This is independent of envelope metadata so it can be verified by the receiver.
 */
export function computeBundleHash(
  tezPayload: FederationBundle["tez"],
  contextPayload: FederationBundle["context"],
): string {
  // Canonical JSON: deterministic key order (context before tez alphabetically)
  const canonical = JSON.stringify({ context: contextPayload, tez: tezPayload });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Create a federation bundle from a local Tez, its context, and addressing info.
 */
export function createBundle(
  tezData: {
    id: string;
    threadId: string | null;
    parentTezId: string | null;
    surfaceText: string;
    type: string;
    urgency: string;
    actionRequested: string | null;
    visibility: string;
    createdAt: string;
  },
  contextData: Array<{
    id: string;
    layer: string;
    content: string;
    mimeType: string | null;
    confidence: number | null;
    source: string | null;
    createdAt: string;
    createdBy: string;
  }>,
  from: string,
  to: string[],
  identity: ServerIdentity,
): FederationBundle {
  const tezPayload: FederationBundle["tez"] = {
    id: tezData.id,
    threadId: tezData.threadId,
    parentTezId: tezData.parentTezId,
    surfaceText: tezData.surfaceText,
    type: tezData.type,
    urgency: tezData.urgency,
    actionRequested: tezData.actionRequested,
    visibility: tezData.visibility,
    createdAt: tezData.createdAt,
  };

  const contextPayload: FederationBundle["context"] = contextData.map((c) => ({
    id: c.id,
    layer: c.layer,
    content: c.content,
    mimeType: c.mimeType,
    confidence: c.confidence,
    source: c.source,
    createdAt: c.createdAt,
    createdBy: c.createdBy,
  }));

  const bundleHash = computeBundleHash(tezPayload, contextPayload);

  return {
    protocol_version: "1.2.4",
    bundle_type: "federation_delivery",
    sender_server: identity.host,
    sender_server_id: identity.serverId,
    from,
    to,
    tez: tezPayload,
    context: contextPayload,
    bundle_hash: bundleHash,
    signed_at: new Date().toISOString(),
  };
}

/**
 * Validate a received federation bundle.
 * Returns null if valid, error string if invalid.
 */
export function validateBundle(bundle: unknown): string | null {
  if (!bundle || typeof bundle !== "object") {
    return "Bundle must be a non-null object";
  }

  const b = bundle as Record<string, unknown>;

  if (b.bundle_type !== "federation_delivery") {
    return "Invalid bundle_type (expected federation_delivery)";
  }

  if (!b.sender_server || typeof b.sender_server !== "string") {
    return "Missing or invalid sender_server";
  }

  if (!b.sender_server_id || typeof b.sender_server_id !== "string") {
    return "Missing or invalid sender_server_id";
  }

  if (!b.from || typeof b.from !== "string") {
    return "Missing or invalid from address";
  }

  if (!Array.isArray(b.to) || b.to.length === 0) {
    return "Missing or empty to addresses";
  }

  if (!b.tez || typeof b.tez !== "object") {
    return "Missing tez payload";
  }

  const tez = b.tez as Record<string, unknown>;
  if (!tez.id || !tez.surfaceText || !tez.createdAt) {
    return "Tez payload missing required fields (id, surfaceText, createdAt)";
  }

  if (!Array.isArray(b.context)) {
    return "Missing context array";
  }

  if (!b.bundle_hash || typeof b.bundle_hash !== "string") {
    return "Missing bundle_hash";
  }

  // Verify hash integrity
  const expectedHash = computeBundleHash(
    b.tez as FederationBundle["tez"],
    b.context as FederationBundle["context"],
  );
  if (expectedHash !== b.bundle_hash) {
    return "Bundle hash mismatch — payload may have been tampered with";
  }

  return null;
}
