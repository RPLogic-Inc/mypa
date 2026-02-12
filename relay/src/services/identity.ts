/**
 * Server identity — Ed25519 keypair for federation.
 *
 * Each relay generates a keypair on first boot.
 * The public key is published at /.well-known/tezit.json so other servers
 * can verify signed federation requests.
 *
 * Zero new dependencies — uses Node.js built-in crypto.
 */

import { generateKeyPairSync, createPublicKey, createPrivateKey, createHash, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

export interface ServerIdentity {
  /** Full SHA-256 hex digest of public key (64 chars) */
  serverId: string;
  /** Base64-encoded Ed25519 public key (DER/SPKI) */
  publicKey: string;
  /** Raw private key buffer for signing */
  privateKeyPem: string;
  /** This server's host */
  host: string;
}

let _identity: ServerIdentity | null = null;

function loadOrCreateIdentityForDir(dataDir: string): ServerIdentity {
  const privPath = join(dataDir, "server.key");
  const pubPath = join(dataDir, "server.pub");
  const hasExistingKeys = existsSync(privPath) && existsSync(pubPath);

  let privateKeyPem: string;
  let publicKeyPem: string;

  if (hasExistingKeys) {
    privateKeyPem = readFileSync(privPath, "utf-8");
    publicKeyPem = readFileSync(pubPath, "utf-8");
  } else {
    mkdirSync(dataDir, { recursive: true });

    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    privateKeyPem = privateKey;
    publicKeyPem = publicKey;

    writeFileSync(privPath, privateKeyPem, { mode: 0o600 });
    writeFileSync(pubPath, publicKeyPem, { mode: 0o644 });
  }

  const deriveIdentity = (publicPem: string, privatePem: string): ServerIdentity => {
    const pubKeyObj = createPublicKey(publicPem);
    const pubKeyDer = pubKeyObj.export({ type: "spki", format: "der" });
    const publicKeyBase64 = pubKeyDer.toString("base64");
    const serverId = createHash("sha256").update(pubKeyDer).digest("hex");

    return {
      serverId,
      publicKey: publicKeyBase64,
      privateKeyPem: privatePem,
      host: config.relayHost,
    };
  };

  try {
    return deriveIdentity(publicKeyPem, privateKeyPem);
  } catch (error) {
    if (!hasExistingKeys) {
      throw error;
    }

    console.warn(`Invalid relay identity key format in "${dataDir}", regenerating keys`);

    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    writeFileSync(privPath, privateKey, { mode: 0o600 });
    writeFileSync(pubPath, publicKey, { mode: 0o644 });
    return deriveIdentity(publicKey, privateKey);
  }
}

/**
 * Load or generate the server's Ed25519 keypair.
 * Keys are stored in DATA_DIR as server.key (private) and server.pub (public).
 */
export function loadOrCreateIdentity(): ServerIdentity {
  if (_identity) return _identity;

  try {
    _identity = loadOrCreateIdentityForDir(config.dataDir);
    return _identity;
  } catch (error) {
    const fallbackDir = process.env.RELAY_IDENTITY_FALLBACK_DIR || "/tmp/tezit-relay";

    if (fallbackDir === config.dataDir) {
      throw error;
    }

    console.error(
      `Failed to initialize relay identity in "${config.dataDir}", falling back to "${fallbackDir}"`,
      error,
    );

    _identity = loadOrCreateIdentityForDir(fallbackDir);
    return _identity;
  }
}

/**
 * Sign arbitrary data with this server's private key.
 */
export function signData(data: Buffer | string): Buffer {
  const identity = loadOrCreateIdentity();
  const privKey = createPrivateKey(identity.privateKeyPem);
  return sign(null, Buffer.from(data), privKey);
}

/**
 * Verify a signature against a remote server's public key (base64-encoded DER/SPKI).
 */
export function verifySignature(data: Buffer | string, signature: Buffer, publicKeyBase64: string): boolean {
  const pubKeyDer = Buffer.from(publicKeyBase64, "base64");
  const pubKey = createPublicKey({ key: pubKeyDer, format: "der", type: "spki" });
  return verify(null, Buffer.from(data), pubKey, signature);
}

/**
 * Reset identity (for testing only).
 */
export function _resetIdentity(): void {
  _identity = null;
}
