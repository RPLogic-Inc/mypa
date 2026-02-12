# tezit-context-versioning: Context Item Versioning

**Extension ID:** `tezit-context-versioning`
**Extension Version:** 1.0
**Status:** Proposed
**Proposed by:** Ragu Platform
**Minimum Protocol Version:** Tezit Protocol v1.3

---

## Purpose

For living document tezits -- bundles whose context items update over time as source materials evolve -- recipients currently have no way to know which items have changed since their last sync. Without per-item versioning, the only option is to re-download the entire context on every sync, which is wasteful for large bundles and provides no visibility into what actually changed.

Context item versioning solves this by adding version tracking metadata to each context item, enabling:

1. **Incremental sync.** Recipients send their current version numbers to the server; the server responds with only the items that have changed, dramatically reducing bandwidth and sync time for large bundles.
2. **Change visibility.** Recipients can see what changed in each context item, when it changed, and optionally a human-readable summary of the changes.
3. **Version history.** Each item maintains a hash chain linking to its previous version, enabling integrity verification of the version history.
4. **Diff support.** When available, binary or textual diffs can be included in the bundle, allowing recipients to apply incremental updates rather than downloading full replacement files.

This extension benefits teams working with evolving research, continuously updated documentation, regulatory materials that undergo revision, and any scenario where a Tez's context changes over its lifetime.

---

## Schema

### Extension Manifest

The extension manifest file is placed at `extensions/tezit-context-versioning/manifest.json` within the Tez bundle:

```json
{
  "extension_id": "tezit-context-versioning",
  "extension_version": "1.0",
  "name": "Context Item Versioning",
  "description": "Per-item version tracking for living document tezits",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/proposed/tezit-context-versioning"
}
```

### Versioned Context Item Schema

Each context item in `manifest.context.items` gains the following additional fields. The complete JSON Schema for the versioning properties:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TezitContextVersioning",
  "description": "Version tracking fields added to context items in living document tezits",
  "type": "object",
  "properties": {
    "version": {
      "type": "integer",
      "minimum": 1,
      "description": "Integer version number for this context item. Starts at 1 when the item is first created. Increments by 1 on each update. Version numbers are per-item, not global."
    },
    "previous_hash": {
      "type": ["string", "null"],
      "pattern": "^[a-f0-9]{64}$",
      "description": "SHA-256 hash of the previous version's file content (lowercase hex). Null for version 1 (no previous version). This creates a hash chain enabling verification that the version history has not been tampered with."
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when this version of the item was last updated. For version 1, this equals the item's creation time."
    },
    "change_summary": {
      "type": "string",
      "description": "Optional human-readable description of what changed in this version compared to the previous version. Should be concise (1-2 sentences). Implementations MAY auto-generate this from diffs."
    },
    "diff_available": {
      "type": "boolean",
      "default": false,
      "description": "Whether a diff from the previous version to this version is available within the bundle. When true, the diff file is located at the path specified by diff_file."
    },
    "diff_file": {
      "type": "string",
      "description": "Path to the diff file within the bundle, relative to the bundle root. Only present when diff_available is true. The diff format depends on the content type: unified diff for text files, binary diff (bsdiff or similar) for binary files."
    }
  },
  "required": ["version", "previous_hash", "updated_at"]
}
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | Yes | Version number, starting at 1, incrementing on each update. |
| `previous_hash` | string or null | Yes | SHA-256 hash of previous version's content. Null for version 1. |
| `updated_at` | string (ISO 8601) | Yes | Timestamp of this version's creation. |
| `change_summary` | string | No | Human-readable description of what changed. |
| `diff_available` | boolean | No | Whether a diff file is included in the bundle (default: false). |
| `diff_file` | string | No | Path to the diff file. Required when `diff_available` is true. |

### Version Metadata Object

Bundles MAY include a version metadata file at `extensions/tezit-context-versioning/versions.json` that records the full version history for all items. This enables recipients to understand the complete evolution of each context item without needing access to previous bundle versions:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TezitVersionHistory",
  "description": "Complete version history for all context items",
  "type": "object",
  "properties": {
    "items": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["version", "content_hash", "updated_at"],
          "properties": {
            "version": {
              "type": "integer",
              "minimum": 1
            },
            "content_hash": {
              "type": "string",
              "pattern": "^[a-f0-9]{64}$",
              "description": "SHA-256 hash of the file content at this version."
            },
            "updated_at": {
              "type": "string",
              "format": "date-time"
            },
            "change_summary": {
              "type": "string"
            }
          }
        }
      },
      "description": "Map of context item IDs to their ordered version history arrays."
    }
  }
}
```

---

## Sync Protocol

The sync protocol enables efficient incremental updates for living document tezits. It operates over the Tez HTTP API (see TEZ_HTTP_API_SPEC.md).

### Step 1: Client Sends Version Manifest

The client sends a list of context items it already has, along with each item's version number and content hash:

**Request:**

```http
POST /api/v1/tez/{tez_id}/sync
Content-Type: application/json

{
  "client_versions": [
    {
      "item_id": "quarterly-report",
      "version": 2,
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "item_id": "market-analysis",
      "version": 1,
      "hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    },
    {
      "item_id": "competitor-data",
      "version": 3,
      "hash": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3"
    }
  ],
  "include_diffs": true
}
```

The `include_diffs` parameter is optional (default: false). When true, the server includes diff data for items that support it.

### Step 2: Server Responds with Changes

The server compares the client's versions against the current bundle and responds with only the changed items:

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "tez_id": "tez-550e8400-e29b-41d4",
  "current_tez_version": "1.3",
  "sync_timestamp": "2026-01-25T12:00:00Z",
  "changes": [
    {
      "item_id": "quarterly-report",
      "action": "updated",
      "old_version": 2,
      "new_version": 3,
      "updated_at": "2026-01-25T10:00:00Z",
      "change_summary": "Added Q4 2025 actual results and updated forward guidance for Q1 2026.",
      "content_hash": "f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5",
      "content_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/quarterly-report",
      "diff_available": true,
      "diff_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/quarterly-report/diff?from=2&to=3"
    },
    {
      "item_id": "risk-assessment",
      "action": "added",
      "new_version": 1,
      "updated_at": "2026-01-24T16:00:00Z",
      "change_summary": null,
      "content_hash": "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "content_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/risk-assessment",
      "diff_available": false
    }
  ],
  "removed": [],
  "unchanged": ["market-analysis", "competitor-data"]
}
```

### Step 3: Client Applies Changes

The client processes the sync response:

1. **Updated items:** Download new content (or apply diff if available and requested). Verify the content hash matches `content_hash`.
2. **Added items:** Download full content. These are new context items not previously in the client's copy.
3. **Removed items:** Delete from local copy. The server includes the item IDs of any items that have been removed from the bundle since the client's last sync.
4. **Unchanged items:** No action needed. Listed for confirmation.

### Sync Actions

| Action | Description |
|--------|-------------|
| `updated` | Item exists but has a newer version. Download or apply diff. |
| `added` | New item that did not exist in the client's copy. Download full content. |

The `removed` array lists item IDs that were present in the client's version manifest but no longer exist in the current bundle.

---

## Examples

### Example: Context Item at Version 3 with Full Version Chain

The following shows a context item in `manifest.context.items` that is at version 3, along with its complete version history:

**Manifest excerpt (context item):**

```json
{
  "id": "quarterly-report",
  "file": "context/quarterly-report.pdf",
  "type": "document",
  "title": "Quarterly Financial Report",
  "version": 3,
  "previous_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "updated_at": "2026-01-25T10:00:00Z",
  "change_summary": "Added Q4 2025 actual results and updated forward guidance for Q1 2026.",
  "diff_available": true,
  "diff_file": "diffs/quarterly-report-v2-to-v3.diff"
}
```

**Version history (in `extensions/tezit-context-versioning/versions.json`):**

```json
{
  "items": {
    "quarterly-report": [
      {
        "version": 1,
        "content_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        "updated_at": "2025-07-15T09:00:00Z",
        "change_summary": null
      },
      {
        "version": 2,
        "content_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "updated_at": "2025-10-18T14:30:00Z",
        "change_summary": "Added Q3 2025 results and revised annual projections."
      },
      {
        "version": 3,
        "content_hash": "f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5",
        "updated_at": "2026-01-25T10:00:00Z",
        "change_summary": "Added Q4 2025 actual results and updated forward guidance for Q1 2026."
      }
    ]
  }
}
```

**Hash chain verification:**

To verify the integrity of the version chain:
1. Version 1: `previous_hash` is null (first version). Content hash is `a1b2c3...`.
2. Version 2: `previous_hash` is `a1b2c3...` (matches version 1's content hash). Content hash is `e3b0c4...`.
3. Version 3: `previous_hash` is `e3b0c4...` (matches version 2's content hash). Content hash is `f4a5b6...`.

If any link in the chain does not match, the version history may have been tampered with.

### Example: Complete Manifest with Versioned Context

```json
{
  "tez_version": "1.3",
  "title": "Living Research Dashboard",
  "created_at": "2025-06-01T08:00:00Z",
  "creator": {
    "name": "Research Team",
    "org": "Acme Corp"
  },
  "living_document": true,
  "synthesis": {
    "file": "synthesis.md",
    "model": "claude-opus-4-20250514",
    "generated_at": "2026-01-25T10:30:00Z"
  },
  "context": {
    "items": [
      {
        "id": "quarterly-report",
        "file": "context/quarterly-report.pdf",
        "type": "document",
        "title": "Quarterly Financial Report",
        "version": 3,
        "previous_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "updated_at": "2026-01-25T10:00:00Z",
        "change_summary": "Added Q4 2025 actual results and updated forward guidance for Q1 2026.",
        "diff_available": true,
        "diff_file": "diffs/quarterly-report-v2-to-v3.diff"
      },
      {
        "id": "market-analysis",
        "file": "context/market-analysis.md",
        "type": "document",
        "title": "Market Analysis Report",
        "version": 1,
        "previous_hash": null,
        "updated_at": "2025-06-01T08:00:00Z"
      },
      {
        "id": "competitor-data",
        "file": "context/competitor-data.csv",
        "type": "data",
        "title": "Competitor Metrics Dataset",
        "version": 5,
        "previous_hash": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
        "updated_at": "2026-01-20T16:00:00Z",
        "change_summary": "Added December 2025 competitor metrics.",
        "diff_available": false
      }
    ]
  },
  "extensions": ["tezit-context-versioning"]
}
```

### Example: Sync Request and Response

**Client sync request** (client has quarterly-report at v2, market-analysis at v1, competitor-data at v3):

```json
{
  "client_versions": [
    {
      "item_id": "quarterly-report",
      "version": 2,
      "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "item_id": "market-analysis",
      "version": 1,
      "hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
    },
    {
      "item_id": "competitor-data",
      "version": 3,
      "hash": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3"
    }
  ],
  "include_diffs": true
}
```

**Server sync response:**

```json
{
  "tez_id": "tez-550e8400-e29b-41d4",
  "current_tez_version": "1.3",
  "sync_timestamp": "2026-01-25T12:00:00Z",
  "changes": [
    {
      "item_id": "quarterly-report",
      "action": "updated",
      "old_version": 2,
      "new_version": 3,
      "updated_at": "2026-01-25T10:00:00Z",
      "change_summary": "Added Q4 2025 actual results and updated forward guidance for Q1 2026.",
      "content_hash": "f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5",
      "content_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/quarterly-report",
      "diff_available": true,
      "diff_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/quarterly-report/diff?from=2&to=3"
    },
    {
      "item_id": "competitor-data",
      "action": "updated",
      "old_version": 3,
      "new_version": 5,
      "updated_at": "2026-01-20T16:00:00Z",
      "change_summary": "Added December 2025 competitor metrics.",
      "content_hash": "g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0a1b2c3d4e5f6",
      "content_url": "/api/v1/tez/tez-550e8400-e29b-41d4/context/competitor-data",
      "diff_available": false
    }
  ],
  "removed": [],
  "unchanged": ["market-analysis"]
}
```

In this response:
- `quarterly-report` was updated from v2 to v3 -- the client can either download the full new file or apply the diff (since `diff_available` is true).
- `competitor-data` jumped from v3 to v5 (two updates happened since the client's last sync) -- no diff is available, so the client must download the full file.
- `market-analysis` is unchanged -- no download needed.

---

## Implementation Guidance

### Version Number Management

- Version numbers are **per-item**, not global across the bundle.
- Version numbers MUST be monotonically increasing integers starting at 1.
- Implementations MUST NOT reuse or skip version numbers.
- If a context item is removed and later re-added, it starts at version 1 again with a new version chain.

### Hash Chain Integrity

The `previous_hash` field creates a hash chain similar to a blockchain or git commit chain:

- Version 1: `previous_hash` is always `null`.
- Version N (N > 1): `previous_hash` MUST equal the SHA-256 hash of the version N-1 file content.
- Recipients can verify the chain by checking each link. A broken chain indicates the version history has been tampered with or reconstructed.

### Diff Format

When `diff_available` is true:

- **Text files** (markdown, CSV, source code): Use unified diff format (compatible with `patch` command).
- **Binary files** (PDF, images): Use bsdiff format or an equivalent binary diff format. The format SHOULD be indicated in the diff file's first line or via a sidecar metadata file.
- **Structured data** (JSON, XML): Use unified diff on the serialized text representation.

Diffs are stored in the bundle's `diffs/` directory with the naming convention `{item_id}-v{from}-to-v{to}.diff`.

### Synthesis Re-generation

When context items are updated, the synthesis may need to be regenerated. Implementations SHOULD:

- Track which context item versions were used to generate the current synthesis.
- Prompt the Tez creator to regenerate synthesis when context items are updated.
- Include the synthesis version in the versioning metadata if the synthesis itself is a living document.

---

## Compatibility Notes

### Minimum Protocol Version

This extension requires **Tezit Protocol v1.3** or later. The versioning fields are added to the existing `context.items` schema as optional properties.

### Graceful Degradation

When an implementation does not support the `tezit-context-versioning` extension:

- The Tez remains fully functional. All context items, synthesis, and interrogation capabilities work without modification.
- The versioning fields (`version`, `previous_hash`, `updated_at`, `change_summary`, `diff_available`, `diff_file`) in context items are ignored as unrecognized keys.
- The `extensions/tezit-context-versioning/` directory and `diffs/` directory within the bundle are ignored.
- Recipients receive the current version of all context items. They simply cannot perform incremental sync or see version history.

### Conflicts

- **`tezit-signatures`:** Compatible with special considerations. When both extensions are present, the bundle signature covers the current version of all files. After a sync that updates context items, the previous signature becomes invalid. Implementations MUST re-sign the bundle after applying sync updates if signature verification is required.
- **`tezit-encryption`:** Compatible. Version numbers and metadata are stored in the manifest (which remains unencrypted per the `tezit-encryption` spec). Content hashes and diffs operate on encrypted file contents.
- **`tezit-facts` and `tezit-relationships`:** Compatible. Facts and relationships may need to be re-extracted when context items are updated. Implementations SHOULD track which context item version each fact or relationship was extracted from.

### Migration

This is a new extension with no predecessor. Existing tezits can adopt versioning by:

1. Adding the extension to the manifest's `extensions` array.
2. Setting all existing context items to `version: 1`, `previous_hash: null`, and `updated_at` to their original creation timestamp.
3. Creating the `extensions/tezit-context-versioning/manifest.json` file.
4. Future updates to context items then follow the versioning protocol normally.

### Future Considerations

- **Branching:** Future versions may support branched version histories (e.g., when two recipients independently update the same context item and their changes need to be merged).
- **Retention policies:** Future versions may define how long version history should be retained, enabling cleanup of old versions and diffs.
- **Streaming sync:** For very large bundles with frequent updates, future versions may define a WebSocket-based streaming sync protocol for real-time updates.
