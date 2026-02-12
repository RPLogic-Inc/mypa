# tezit-signatures: Bundle Signature Verification

**Extension ID:** `tezit-signatures`
**Extension Version:** 1.0
**Status:** Proposed
**Proposed by:** Ragu Platform
**Minimum Protocol Version:** Tezit Protocol v1.3
**Target Standard Extension:** `tezit-signing` v2.0 (supersedes v1.0 with structured verification)

---

## Purpose

When tezits are shared across organizational boundaries or through untrusted channels, recipients need assurance that the bundle has not been tampered with. The existing `tezit-signing` standard extension (v1.0) provides detached signatures but does not define a structured verification protocol, canonical signing payload format, or per-file content hashing.

This extension addresses those gaps by specifying:

1. **Content integrity** -- SHA-256 hashes of every file in the bundle, embedded in the manifest, so recipients can verify each file individually.
2. **Canonical signing payload** -- A deterministic JSON serialization of the signed fields and content hashes, ensuring that signature verification is reproducible across implementations.
3. **Ed25519 signatures** -- A single mandatory algorithm (Ed25519) for the initial version, eliminating algorithm negotiation complexity.
4. **Signer identity** -- Structured metadata about who signed the bundle, enabling audit trails and trust chain decisions.
5. **Verification failure semantics** -- Clear requirements for what implementations MUST, SHOULD, and MUST NOT do when verification fails.

This extension benefits any organization that distributes tezits externally -- legal teams sharing due diligence bundles, research groups distributing findings, compliance departments sharing audit materials -- and any platform that ingests tezits from untrusted sources.

---

## Schema

### Extension Manifest

The extension manifest file is placed at `extensions/tezit-signatures/manifest.json` within the Tez bundle:

```json
{
  "extension_id": "tezit-signatures",
  "extension_version": "1.0",
  "name": "Bundle Signature Verification",
  "description": "Cryptographic signatures for verifying bundle integrity",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/proposed/tezit-signatures"
}
```

### Signature Object

The signature is stored in `manifest.signature` within the Tez's root `manifest.json`. The complete JSON Schema for the signature object:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TezitSignature",
  "description": "Cryptographic signature for Tez bundle integrity verification",
  "type": "object",
  "required": [
    "algorithm",
    "public_key",
    "signed_fields",
    "content_hashes",
    "signature",
    "signed_at",
    "signer"
  ],
  "properties": {
    "algorithm": {
      "type": "string",
      "enum": ["ed25519"],
      "description": "The signing algorithm used. Initially only ed25519 is supported. Future versions of this extension may add additional algorithms."
    },
    "public_key": {
      "type": "string",
      "format": "byte",
      "description": "Base64-encoded Ed25519 public key (32 bytes, standard base64 encoding with padding). This is the verification key corresponding to the private key that produced the signature."
    },
    "signed_fields": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "minItems": 1,
      "description": "Array of JSON Pointer paths (RFC 6901) into the root manifest that are included in the signing payload. At minimum, this MUST include '/tez_version', '/title', and '/created_at'. The signature covers these fields exactly as they appear in the manifest."
    },
    "content_hashes": {
      "type": "object",
      "additionalProperties": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "description": "Object mapping relative file paths within the bundle to their lowercase hex-encoded SHA-256 hashes. Every file in the bundle (except manifest.json itself and the extensions/tezit-signatures/ directory) MUST have an entry. Paths use forward slashes and are relative to the bundle root."
    },
    "signature": {
      "type": "string",
      "format": "byte",
      "description": "Base64-encoded Ed25519 signature (64 bytes) over the canonical signing payload. See the Canonical Signing Payload section for construction."
    },
    "signed_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp (with timezone, preferably UTC) indicating when the signature was created."
    },
    "signer": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Display name of the person or system that signed the bundle."
        },
        "org": {
          "type": "string",
          "description": "Organization the signer belongs to. Optional but recommended for cross-organizational sharing."
        },
        "key_id": {
          "type": "string",
          "description": "Unique identifier for the signing key, enabling key rotation and lookup. Format is implementation-defined but SHOULD be a URI, fingerprint, or UUID."
        }
      },
      "description": "Metadata about the entity that produced the signature."
    }
  },
  "additionalProperties": false
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `algorithm` | string | Yes | Signing algorithm. Must be `"ed25519"` in v1.0. |
| `public_key` | string (base64) | Yes | Base64-encoded Ed25519 public key (32 bytes). |
| `signed_fields` | string[] | Yes | JSON Pointer paths into manifest covered by the signature. |
| `content_hashes` | object | Yes | Map of file paths to hex-encoded SHA-256 hashes. |
| `signature` | string (base64) | Yes | Base64-encoded Ed25519 signature (64 bytes). |
| `signed_at` | string (ISO 8601) | Yes | Timestamp of signature creation. |
| `signer` | object | Yes | Signer identity metadata. |
| `signer.name` | string | Yes | Display name of the signer. |
| `signer.org` | string | No | Organization of the signer. |
| `signer.key_id` | string | No | Identifier for the signing key. |

---

## Canonical Signing Payload

The canonical signing payload is constructed deterministically to ensure that any implementation can reproduce and verify the signature:

1. **Extract signed fields.** For each path in `signed_fields`, resolve the JSON Pointer against the root `manifest.json` (excluding the `signature` object itself). Collect these as key-value pairs where the key is the JSON Pointer path and the value is the resolved value.

2. **Construct the payload object.** Create a JSON object with two keys:
   - `"fields"`: the object of signed field paths to their values (from step 1)
   - `"content_hashes"`: the `content_hashes` object exactly as it appears in the signature

3. **Serialize canonically.** Serialize the payload object to JSON with:
   - Keys sorted lexicographically at every nesting level
   - No whitespace (no spaces after colons or commas)
   - UTF-8 encoding
   - No trailing newline

4. **Hash the payload.** Compute SHA-256 over the canonical JSON bytes to produce a 32-byte digest.

5. **Sign the digest.** Sign the 32-byte SHA-256 digest with the Ed25519 private key.

### Canonical Payload Example

Given the signed manifest in the Examples section below, the canonical signing payload (before hashing) would be:

```json
{"content_hashes":{"context/market-comparison.csv":"c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4","context/q4-earnings.pdf":"b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3","extensions/tezit-signatures/manifest.json":"d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5","synthesis.md":"a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"},"fields":{"/context/items":[{"file":"context/q4-earnings.pdf","id":"q4-report","title":"Q4 2025 Earnings Report","type":"document"},{"file":"context/market-comparison.csv","id":"market-data","title":"Market Comparison Data","type":"data"}],"/created_at":"2026-01-15T09:30:00Z","/creator":{"name":"Sarah Chen","org":"Acme Corp Finance"},"/synthesis/file":"synthesis.md","/tez_version":"1.3","/title":"Q4 2025 Financial Analysis"}}
```

Note: Keys are sorted at every level, and array order is preserved.

---

## Verification Process

Recipients MUST follow this process to verify a signed Tez:

### Step 1: Verify Content Hashes

For each entry in `content_hashes`:
1. Read the file at the specified path within the bundle.
2. Compute its SHA-256 hash.
3. Compare the computed hash (lowercase hex) against the declared hash.
4. If any hash does not match, verification FAILS. The specific file(s) that failed SHOULD be reported to the recipient.

### Step 2: Check Completeness

1. Enumerate all files in the bundle (excluding `manifest.json` and the `extensions/tezit-signatures/` directory).
2. Verify that every file has a corresponding entry in `content_hashes`.
3. If any file is missing from `content_hashes`, verification FAILS (the file may have been injected after signing).

### Step 3: Verify Signature

1. Reconstruct the canonical signing payload (see above).
2. Compute SHA-256 over the canonical JSON bytes.
3. Decode the base64 `public_key` to obtain the 32-byte Ed25519 public key.
4. Decode the base64 `signature` to obtain the 64-byte Ed25519 signature.
5. Verify the Ed25519 signature over the SHA-256 digest using the public key.
6. If the signature does not verify, verification FAILS.

### Verification Failure Semantics

When verification fails, implementations:

- **MUST** warn the recipient that the bundle's integrity could not be verified. The warning must be prominent and not dismissible without explicit acknowledgment.
- **SHOULD** display the verification status (passed, failed, or unsigned) in the bundle's metadata view.
- **SHOULD** indicate which specific check failed (content hash mismatch, missing file, or signature invalid).
- **MUST NOT** silently ignore verification failures. A failed verification must always be surfaced to the user.
- **MAY** allow the recipient to proceed with the unverified bundle after acknowledging the warning, depending on the platform's security policy.

---

## Examples

### Example: Signed Manifest

The following shows a complete `manifest.json` for a signed Tez:

```json
{
  "tez_version": "1.3",
  "title": "Q4 2025 Financial Analysis",
  "created_at": "2026-01-15T09:30:00Z",
  "creator": {
    "name": "Sarah Chen",
    "org": "Acme Corp Finance"
  },
  "synthesis": {
    "file": "synthesis.md",
    "model": "claude-opus-4-20250514",
    "generated_at": "2026-01-15T09:28:00Z"
  },
  "context": {
    "items": [
      {
        "id": "q4-report",
        "file": "context/q4-earnings.pdf",
        "type": "document",
        "title": "Q4 2025 Earnings Report"
      },
      {
        "id": "market-data",
        "file": "context/market-comparison.csv",
        "type": "data",
        "title": "Market Comparison Data"
      }
    ]
  },
  "extensions": ["tezit-signatures"],
  "signature": {
    "algorithm": "ed25519",
    "public_key": "MCowBQYDK2VwAyEAGb1gauf9cg3BKXG5merDwJlPEq8EwFNOjRnPSx9sPEI=",
    "signed_fields": [
      "/tez_version",
      "/title",
      "/created_at",
      "/creator",
      "/synthesis/file",
      "/context/items"
    ],
    "content_hashes": {
      "synthesis.md": "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
      "context/q4-earnings.pdf": "b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3",
      "context/market-comparison.csv": "c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4",
      "extensions/tezit-signatures/manifest.json": "d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5"
    },
    "signature": "MEUCIQC7u8x9A0BzGmFhIjMkNUZXaHlqe3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqA==",
    "signed_at": "2026-01-15T09:31:00Z",
    "signer": {
      "name": "Sarah Chen",
      "org": "Acme Corp Finance",
      "key_id": "acme:finance:sarah-chen:2026-01"
    }
  }
}
```

### Example: Extension Manifest

The file at `extensions/tezit-signatures/manifest.json` within the bundle:

```json
{
  "extension_id": "tezit-signatures",
  "extension_version": "1.0",
  "name": "Bundle Signature Verification",
  "description": "Cryptographic signatures for verifying bundle integrity",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/proposed/tezit-signatures"
}
```

### Example: Verification Failure Display

When a recipient opens a Tez whose content hash verification fails:

```
WARNING: Bundle integrity verification FAILED

  Verification Status: FAILED
  Signer: Sarah Chen (Acme Corp Finance)
  Signed At: 2026-01-15T09:31:00Z

  Failure Details:
    - Content hash mismatch: context/market-comparison.csv
      Expected: c5d4e3f2a1b0c9d8...
      Actual:   ff00112233445566...

  The file 'context/market-comparison.csv' has been modified since
  this bundle was signed. The bundle may have been tampered with.

  [View Anyway (Unverified)]  [Reject Bundle]
```

---

## Compatibility Notes

### Minimum Protocol Version

This extension requires **Tezit Protocol v1.3** or later. The `manifest.signature` field is reserved in v1.3 for this extension.

### Graceful Degradation

When an implementation does not support the `tezit-signatures` extension:

- The Tez remains fully functional. All context items, synthesis, and interrogation capabilities work without modification.
- The `signature` field in the manifest is ignored as an unrecognized key.
- The `extensions/tezit-signatures/` directory within the bundle is ignored.
- Recipients simply do not see verification status -- the Tez behaves as an unsigned bundle.

### Conflicts

- **`tezit-signing` (v1.0):** This extension is intended to supersede `tezit-signing` v1.0 by providing a more rigorous verification protocol. Tezits SHOULD NOT include both `tezit-signing` v1.0 and `tezit-signatures` v1.0. If both are present, implementations SHOULD prefer `tezit-signatures`.
- **`tezit-encryption`:** Compatible. When both are present, content hashes in `tezit-signatures` MUST be computed over the encrypted file contents (not the plaintext). This ensures that signature verification does not require decryption and that the encrypted bundle's integrity is protected.

### Migration

Platforms currently using `tezit-signing` v1.0 should migrate to `tezit-signatures` by:

1. Replacing the `tezit-signing` extension directory with `tezit-signatures`.
2. Moving the signature from the extension's data file to `manifest.signature`.
3. Adding `content_hashes` for all bundle files.
4. Updating the signing process to use the canonical signing payload format defined in this extension.

### Future Considerations

- **Additional algorithms:** Future versions may support RSA-PSS, ECDSA (P-256), or post-quantum algorithms. The `algorithm` field is designed to accommodate this.
- **Key distribution:** This extension intentionally does not define key distribution or trust models. Platforms are expected to integrate with their own PKI, keyservers, or identity providers.
- **Timestamping:** Future versions may add support for trusted timestamps (RFC 3161) to prove that a signature existed at a particular time.
