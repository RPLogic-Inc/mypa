/**
 * HTTP Signatures for federation requests.
 *
 * Simplified from RFC 9421 (HTTP Message Signatures).
 * Signs: method, path, host, date, digest (SHA-256 of body), nonce.
 * Verifies inbound requests using the sender's public key.
 */

import { createHash, randomUUID } from "node:crypto";
import { signData, verifySignature } from "./identity.js";

export interface SignableRequest {
  method: string;
  path: string;
  host: string;
  body: string;
}

export interface SignedHeaders {
  "X-Tezit-Signature": string;
  "X-Tezit-Server": string;
  "X-Tezit-Date": string;
  "X-Tezit-Digest": string;
  "X-Request-Nonce": string;
}

/**
 * Create the canonical string that gets signed.
 * Format: method\npath\nhost\ndate\ndigest\nnonce
 */
function canonicalString(method: string, path: string, host: string, date: string, digest: string, nonce: string): string {
  return `${method.toUpperCase()}\n${path}\n${host}\n${date}\n${digest}\n${nonce}`;
}

/**
 * Compute SHA-256 digest of a body string.
 */
export function bodyDigest(body: string): string {
  return createHash("sha256").update(body).digest("base64");
}

/**
 * Sign an outbound federation request.
 * Returns headers to attach to the request.
 */
export function signRequest(req: SignableRequest, serverHost: string): SignedHeaders {
  const date = new Date().toISOString();
  const digest = bodyDigest(req.body);
  const nonce = randomUUID();
  const canonical = canonicalString(req.method, req.path, req.host, date, digest, nonce);
  const signature = signData(canonical);

  return {
    "X-Tezit-Signature": signature.toString("base64"),
    "X-Tezit-Server": serverHost,
    "X-Tezit-Date": date,
    "X-Tezit-Digest": digest,
    "X-Request-Nonce": nonce,
  };
}

/**
 * Verify an inbound federation request's signature.
 * Returns the sender's server host if valid, null if invalid.
 */
export function verifyRequest(
  method: string,
  path: string,
  host: string,
  headers: {
    "x-tezit-signature"?: string;
    "x-tezit-server"?: string;
    "x-tezit-date"?: string;
    "x-tezit-digest"?: string;
    "x-request-nonce"?: string;
  },
  body: string,
  senderPublicKey: string
): { valid: boolean; senderHost: string | null; error?: string } {
  const sig = headers["x-tezit-signature"];
  const senderHost = headers["x-tezit-server"];
  const date = headers["x-tezit-date"];
  const digest = headers["x-tezit-digest"];
  const nonce = headers["x-request-nonce"];

  if (!sig || !senderHost || !date || !digest || !nonce) {
    return { valid: false, senderHost: null, error: "Missing federation signature headers" };
  }

  // Check date freshness (reject requests older than 60 seconds)
  const requestDate = new Date(date);
  const now = new Date();
  const diffMs = Math.abs(now.getTime() - requestDate.getTime());
  if (diffMs > 60 * 1000) {
    return { valid: false, senderHost, error: "Request date too old or too far in future" };
  }

  // Verify body digest
  const computedDigest = bodyDigest(body);
  if (computedDigest !== digest) {
    return { valid: false, senderHost, error: "Body digest mismatch" };
  }

  // Verify signature (includes nonce to prevent replay)
  const canonical = canonicalString(method, path, host, date, digest, nonce);
  const signatureBuffer = Buffer.from(sig, "base64");

  try {
    const isValid = verifySignature(canonical, signatureBuffer, senderPublicKey);
    if (!isValid) {
      return { valid: false, senderHost, error: "Signature verification failed" };
    }
  } catch {
    return { valid: false, senderHost, error: "Signature verification error" };
  }

  return { valid: true, senderHost };
}
