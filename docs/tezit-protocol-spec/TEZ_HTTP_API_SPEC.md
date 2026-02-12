# Tezit HTTP API Specification

**Version**: 1.0
**Status**: Draft
**Last Updated**: February 5, 2026
**Protocol Spec**: [TEZIT_PROTOCOL_SPEC.md](./TEZIT_PROTOCOL_SPEC.md)
**Website**: [tezit.com/api](https://tezit.com/api)

---

## 1. Overview

This document specifies the HTTP API that any Tezit-compatible platform MUST implement to enable interoperability between different Tez hosts. A conformant implementation allows clients to create, retrieve, interrogate, fork, and share tezits across federated platforms.

### 1.1 Base URL

All API endpoints are prefixed with a versioned base path:

```
https://{host}/api/v1/
```

Examples:
- `https://tezit.com/api/v1/`
- `https://tez.acme.corp/api/v1/`
- `https://localhost:8080/api/v1/`

### 1.2 Transport

- All requests MUST use HTTPS in production. HTTP MAY be used for local development only.
- TLS 1.2 is the minimum required version. TLS 1.3 is RECOMMENDED.

### 1.3 Content Types

| Context | Content-Type |
|---------|-------------|
| Request/response bodies (metadata) | `application/json; charset=utf-8` |
| File uploads | `multipart/form-data` |
| Tez archive downloads | `application/vnd.tezit+zip` |
| SSE streaming | `text/event-stream` |
| Synthesis documents | `text/markdown; charset=utf-8` |

### 1.4 Common Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes (most endpoints) | Bearer token: `Bearer {token}` |
| `Content-Type` | Yes (for request bodies) | As specified per endpoint |
| `Accept` | Recommended | Desired response content type |
| `X-Request-ID` | Recommended | Client-generated UUID for tracing |
| `X-Tezit-Version` | Optional | Protocol version the client supports (e.g., `1.0`) |

### 1.5 Common Response Headers

| Header | Always Present | Description |
|--------|---------------|-------------|
| `Content-Type` | Yes | Response content type |
| `X-Request-ID` | Yes | Echoed from request, or server-generated |
| `X-RateLimit-Limit` | Yes | Requests allowed per window |
| `X-RateLimit-Remaining` | Yes | Requests remaining in current window |
| `X-RateLimit-Reset` | Yes | Unix timestamp when the window resets |
| `X-RateLimit-RetryAfter` | On 429 only | Seconds until the client should retry |

### 1.6 Pagination

All list endpoints use cursor-based pagination. Responses include a `pagination` object and `Link` headers.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 25 | Items per page (max 100) |
| `cursor` | string | (none) | Opaque cursor from a previous response |
| `direction` | string | `next` | `next` or `prev` |

**Response Pagination Object:**

```json
{
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJpZCI6IjEyMyIsInRzIjoiMjAyNi0wMS0yNVQxNDozMDowMFoifQ==",
    "prev_cursor": "eyJpZCI6Ijk5IiwidHMiOiIyMDI2LTAxLTI0VDEwOjAwOjAwWiJ9"
  }
}
```

**Link Headers (RFC 8288):**

```
Link: <https://tezit.com/api/v1/tez?cursor=eyJ...&limit=25>; rel="next",
      <https://tezit.com/api/v1/tez?cursor=eyJ...&limit=25>; rel="prev"
```

### 1.7 Timestamps

All timestamps use ISO 8601 format in UTC: `2026-01-25T14:30:00Z`

### 1.8 Identifiers

- Tez IDs: lowercase alphanumeric with hyphens, 3-100 characters (e.g., `acme-analysis-2026-01`)
- UUIDs: Used for sessions, shares, webhooks (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- Vault IDs: Same format as Tez IDs
- User identifiers: Username strings (e.g., `jsmith`) or UUIDs

---

## 2. Authentication

Tezit uses OAuth 2.0 bearer tokens. Platforms MUST support API key authentication and SHOULD support the full OAuth 2.0 authorization code flow.

### 2.1 Obtain Access Token

Exchange credentials for an access token.

```
POST /api/v1/auth/token
```

**Request Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "grant_type": "client_credentials",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "scope": "tez:read tez:write interrogate vault:read vault:write"
}
```

For API key authentication:

```json
{
  "grant_type": "api_key",
  "api_key": "tez_live_sk_abc123def456..."
}
```

**Response: `200 OK`**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "dGV6aXQtcmVmcmVzaC10b2tlbi0xMjM0NTY...",
  "scope": "tez:read tez:write interrogate vault:read vault:write"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_grant` | Invalid credentials or grant type |
| 401 | `invalid_client` | Unknown client_id |
| 429 | `rate_limited` | Too many authentication attempts |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "api_key",
    "api_key": "tez_live_sk_abc123def456"
  }'
```

### 2.2 Refresh Token

Exchange a refresh token for a new access token.

```
POST /api/v1/auth/refresh
```

**Request Body:**

```json
{
  "grant_type": "refresh_token",
  "refresh_token": "dGV6aXQtcmVmcmVzaC10b2tlbi0xMjM0NTY..."
}
```

**Response: `200 OK`**

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "bmV3LXJlZnJlc2gtdG9rZW4tNzg5MDEy..."
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_grant` | Refresh token is expired or invalid |
| 401 | `token_revoked` | Refresh token has been revoked |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "dGV6aXQtcmVmcmVzaC10b2tlbi0xMjM0NTY..."
  }'
```

### 2.3 Revoke Token

Revoke an access token or refresh token.

```
DELETE /api/v1/auth/token
```

**Request Headers:**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {access_token}` |
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "token": "dGV6aXQtcmVmcmVzaC10b2tlbi0xMjM0NTY...",
  "token_type_hint": "refresh_token"
}
```

The `token_type_hint` field is optional and accepts `access_token` or `refresh_token`.

**Response: `204 No Content`**

No response body. The server MUST return 204 even if the token was already invalid (to prevent token enumeration).

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/auth/token \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "token": "dGV6aXQtcmVmcmVzaC10b2tlbi0xMjM0NTY...",
    "token_type_hint": "refresh_token"
  }'
```

### 2.4 Scopes

| Scope | Description |
|-------|-------------|
| `tez:read` | Read Tez metadata, synthesis, and context listings |
| `tez:write` | Create, update, and delete tezits |
| `tez:admin` | Manage permissions, shares, and capability URLs |
| `interrogate` | Submit interrogation queries |
| `vault:read` | List and read vault contents |
| `vault:write` | Create, update, and delete vaults |
| `user:read` | Read user profile information |
| `user:write` | Update user profile |
| `org:read` | Read organization information |
| `org:write` | Manage organization settings |
| `webhook:manage` | Create and delete webhooks |

---

## 3. Tez CRUD Operations

### 3.1 Create a New Tez

Create a new Tez with metadata. Context files are uploaded separately via the Upload API (Section 4).

```
POST /api/v1/tez
```

**Required Scope:** `tez:write`

**Request Headers:**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {token}` |
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "id": "acme-analysis-2026-01",
  "title": "Acme Partnership Analysis",
  "profile": "knowledge",
  "synthesis": {
    "title": "Acme Partnership Analysis",
    "type": "recommendation",
    "abstract": "Analysis of proposed partnership terms with risk assessment.",
    "language": "en"
  },
  "context": {
    "scope": "focused"
  },
  "parameters": {
    "negotiable": true
  },
  "permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false,
    "commercial_use": false
  },
  "vault_id": "my-research-vault",
  "tags": ["partnership", "analysis", "acme"]
}
```

The `id` field is optional. If omitted, the server generates one.

**Response: `201 Created`**

```json
{
  "id": "acme-analysis-2026-01",
  "version": 1,
  "title": "Acme Partnership Analysis",
  "profile": "knowledge",
  "status": "draft",
  "created_at": "2026-01-25T14:30:00Z",
  "updated_at": "2026-01-25T14:30:00Z",
  "creator": {
    "id": "usr_abc123",
    "username": "jsmith",
    "name": "Jane Smith",
    "avatar_url": "https://tezit.com/avatars/jsmith.png"
  },
  "synthesis": {
    "title": "Acme Partnership Analysis",
    "type": "recommendation",
    "file": "tez.md",
    "abstract": "Analysis of proposed partnership terms with risk assessment.",
    "language": "en"
  },
  "context": {
    "scope": "focused",
    "item_count": 0,
    "total_size_bytes": 0,
    "items": []
  },
  "parameters": {
    "negotiable": true,
    "count": 0
  },
  "permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false,
    "commercial_use": false
  },
  "lineage": {
    "forked_from": null,
    "fork_count": 0,
    "related": []
  },
  "vault_id": "my-research-vault",
  "tags": ["partnership", "analysis", "acme"],
  "urls": {
    "self": "https://tezit.com/api/v1/tez/acme-analysis-2026-01",
    "synthesis": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/synthesis",
    "context": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/context",
    "interrogate": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate",
    "web": "https://tezit.com/jsmith/acme-analysis-2026-01"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Malformed request body or invalid field values |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Token lacks `tez:write` scope |
| 409 | `id_conflict` | A Tez with this ID already exists for this user |
| 422 | `validation_error` | Request body fails schema validation |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Acme Partnership Analysis",
    "profile": "knowledge",
    "synthesis": {
      "title": "Acme Partnership Analysis",
      "type": "recommendation"
    },
    "context": { "scope": "focused" }
  }'
```

### 3.2 Get Tez Metadata

Retrieve complete metadata for a Tez.

```
GET /api/v1/tez/{id}
```

**Required Scope:** `tez:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Tez identifier |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `version` | integer | (latest) | Specific version to retrieve |

**Response: `200 OK`**

Response body matches the structure shown in Section 3.1 (Create response).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | No access to this Tez |
| 404 | `not_found` | Tez does not exist |

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3.3 Get Synthesis Document

Retrieve the synthesis Markdown document (tez.md).

```
GET /api/v1/tez/{id}/synthesis
```

**Required Scope:** `tez:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Tez identifier |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `version` | integer | (latest) | Specific version |
| `format` | string | `markdown` | `markdown` or `html` |

**Response: `200 OK`**

When `format=markdown` (default):

```
Content-Type: text/markdown; charset=utf-8

# Acme Partnership Analysis

## Executive Summary

Based on analysis of the proposed terms [[doc-001]], market comparables [[doc-003]],
and our internal projections [[data-005]], I recommend proceeding with the partnership
under modified terms.
...
```

When `format=html`:

```
Content-Type: text/html; charset=utf-8

<h1>Acme Partnership Analysis</h1>
<h2>Executive Summary</h2>
<p>Based on analysis of the proposed terms
<cite data-item="doc-001">doc-001</cite>...</p>
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | No access to this Tez |
| 404 | `not_found` | Tez or synthesis not found |

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/synthesis \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Accept: text/markdown"
```

### 3.4 List Context Items

List all context items in a Tez.

```
GET /api/v1/tez/{id}/context
```

**Required Scope:** `tez:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Tez identifier |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | (all) | Filter by item type (e.g., `document`, `spreadsheet`) |
| `limit` | integer | 25 | Items per page (max 100) |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "items": [
    {
      "id": "doc-001",
      "type": "document",
      "title": "Partnership Agreement Draft v3",
      "source": "google_drive",
      "file": "context/doc-001.pdf",
      "mime_type": "application/pdf",
      "size_bytes": 245760,
      "hash": "sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
      "uploaded_at": "2026-01-25T14:31:00Z",
      "metadata": {
        "pages": 12,
        "author": "Legal Team"
      },
      "urls": {
        "download": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/context/doc-001"
      }
    },
    {
      "id": "data-005",
      "type": "spreadsheet",
      "title": "Revenue Projections Q1-Q4",
      "source": "upload",
      "file": "context/data-005.xlsx",
      "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "size_bytes": 102400,
      "hash": "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "uploaded_at": "2026-01-25T14:32:00Z",
      "metadata": {
        "sheets": ["Revenue", "Costs", "Projections"]
      },
      "urls": {
        "download": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/context/data-005"
      }
    }
  ],
  "total_count": 12,
  "total_size_bytes": 3145728,
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJpZCI6ImRvYy0wMDMifQ=="
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/context \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3.5 Download Specific Context Item

Download a specific context file.

```
GET /api/v1/tez/{id}/context/{item_id}
```

**Required Scope:** `tez:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Tez identifier |
| `item_id` | string | Context item identifier |

**Response: `200 OK`**

The response is the raw file content with appropriate headers:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="doc-001.pdf"
Content-Length: 245760
ETag: "sha256:3a7bd3e2..."
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | No access to this Tez or context downloads not permitted |
| 404 | `not_found` | Tez or context item not found |

**Example:**

```bash
curl -O https://tezit.com/api/v1/tez/acme-analysis-2026-01/context/doc-001 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3.6 Update Tez

Update a Tez. This creates a new version. The previous version remains accessible via the versions endpoint.

```
PUT /api/v1/tez/{id}
```

**Required Scope:** `tez:write`

**Request Body:**

Only include fields being updated. Omitted fields remain unchanged.

```json
{
  "title": "Acme Partnership Analysis (Revised)",
  "synthesis": {
    "abstract": "Revised analysis incorporating Q4 actuals and updated risk assessment."
  },
  "tags": ["partnership", "analysis", "acme", "revised"]
}
```

To upload a new synthesis document, use `multipart/form-data`:

```
PUT /api/v1/tez/{id}
Content-Type: multipart/form-data; boundary=----TezBoundary

------TezBoundary
Content-Disposition: form-data; name="metadata"
Content-Type: application/json

{"title": "Acme Partnership Analysis (Revised)"}
------TezBoundary
Content-Disposition: form-data; name="synthesis"; filename="tez.md"
Content-Type: text/markdown

# Acme Partnership Analysis (Revised)
...
------TezBoundary--
```

**Response: `200 OK`**

Returns the full updated Tez metadata (same structure as Create response) with an incremented `version`.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Malformed request body |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Not the owner or lacks write permission |
| 404 | `not_found` | Tez does not exist |
| 409 | `conflict` | Concurrent update detected (include `If-Match` ETag to resolve) |
| 422 | `validation_error` | Request body fails schema validation |

**Example:**

```bash
curl -X PUT https://tezit.com/api/v1/tez/acme-analysis-2026-01 \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Acme Partnership Analysis (Revised)",
    "tags": ["partnership", "analysis", "acme", "revised"]
  }'
```

### 3.7 Delete Tez

Permanently delete a Tez and all its versions, context, and associated data.

```
DELETE /api/v1/tez/{id}
```

**Required Scope:** `tez:write`

**Response: `204 No Content`**

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Not the owner |
| 404 | `not_found` | Tez does not exist |
| 409 | `has_forks` | Cannot delete a Tez with active forks (use `?force=true` to override) |

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/tez/acme-analysis-2026-01 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3.8 List Versions

List all versions of a Tez.

```
GET /api/v1/tez/{id}/versions
```

**Required Scope:** `tez:read`

**Response: `200 OK`**

```json
{
  "versions": [
    {
      "version": 3,
      "created_at": "2026-01-28T09:15:00Z",
      "update_type": "manual",
      "update_reason": "Incorporated Q4 actuals",
      "creator": {
        "id": "usr_abc123",
        "username": "jsmith"
      },
      "synthesis_hash": "sha256:abc123...",
      "context_item_count": 14,
      "context_total_bytes": 3670016
    },
    {
      "version": 2,
      "created_at": "2026-01-26T16:00:00Z",
      "update_type": "auto",
      "update_reason": "Linked source sync",
      "update_source": "revenue-model",
      "synthesis_hash": "sha256:def456...",
      "context_item_count": 12,
      "context_total_bytes": 3145728
    },
    {
      "version": 1,
      "created_at": "2026-01-25T14:30:00Z",
      "update_type": "initial",
      "creator": {
        "id": "usr_abc123",
        "username": "jsmith"
      },
      "synthesis_hash": "sha256:789abc...",
      "context_item_count": 12,
      "context_total_bytes": 3145728
    }
  ],
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/versions \
  -H "Authorization: Bearer eyJhbGci..."
```

### 3.9 Get Specific Version

Retrieve the full Tez metadata at a specific version.

```
GET /api/v1/tez/{id}/versions/{version}
```

**Required Scope:** `tez:read`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Tez identifier |
| `version` | integer | Version number |

**Response: `200 OK`**

Returns the full Tez metadata as it existed at that version (same structure as the Create response in Section 3.1).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `not_found` | Tez or version not found |

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/versions/2 \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 4. Upload and Build

### 4.1 Upload Context File

Upload a context file to a Tez.

```
POST /api/v1/tez/{id}/context
```

**Required Scope:** `tez:write`

**Request Headers:**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {token}` |
| `Content-Type` | `multipart/form-data` |

**Request Body (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | The file to upload |
| `item_id` | string | No | Custom item ID (auto-generated if omitted) |
| `title` | string | No | Display title (filename used if omitted) |
| `type` | string | No | Item type (auto-detected if omitted). See Section 3.5 of the Protocol Spec. |
| `source` | string | No | Where the file came from (e.g., `google_drive`, `upload`) |
| `metadata` | JSON string | No | Additional metadata as a JSON object |

**Response: `201 Created`**

```json
{
  "id": "doc-001",
  "type": "document",
  "title": "Partnership Agreement Draft v3",
  "source": "upload",
  "file": "context/doc-001.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 245760,
  "hash": "sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",
  "uploaded_at": "2026-01-25T14:31:00Z",
  "indexing_status": "processing",
  "metadata": {
    "pages": 12
  }
}
```

The `indexing_status` field indicates whether the file has been indexed for interrogation:
- `processing` -- The file is being indexed (chunked, embedded)
- `ready` -- Indexing complete; the file is available for interrogation
- `failed` -- Indexing failed (see `indexing_error` field)
- `skipped` -- File type not supported for indexing

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_file` | File is corrupt or cannot be processed |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Not the owner or lacks write permission |
| 404 | `not_found` | Tez does not exist |
| 409 | `item_id_conflict` | A context item with this ID already exists |
| 413 | `file_too_large` | File exceeds maximum upload size |
| 415 | `unsupported_type` | File type not supported |
| 422 | `validation_error` | Invalid metadata |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/context \
  -H "Authorization: Bearer eyJhbGci..." \
  -F "file=@partnership-agreement-v3.pdf" \
  -F "item_id=doc-001" \
  -F "title=Partnership Agreement Draft v3" \
  -F "type=document"
```

### 4.2 Remove Context Item

Remove a context item from a Tez.

```
DELETE /api/v1/tez/{id}/context/{item_id}
```

**Required Scope:** `tez:write`

**Response: `204 No Content`**

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Not the owner |
| 404 | `not_found` | Tez or context item not found |

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/tez/acme-analysis-2026-01/context/doc-001 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 4.3 Build Tez Archive

Package the Tez into a `.tez` archive file for download or portable sharing. This triggers archive generation asynchronously.

```
POST /api/v1/tez/{id}/build
```

**Required Scope:** `tez:read`

**Request Body (optional):**

```json
{
  "version": 3,
  "include_conversation": true,
  "include_parameters": true,
  "format": "zip"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | integer | (latest) | Version to archive |
| `include_conversation` | boolean | `true` | Include conversation.json |
| `include_parameters` | boolean | `true` | Include params.json |
| `format` | string | `zip` | Archive format (`zip` is the only format currently supported) |

**Response: `202 Accepted`**

```json
{
  "build_id": "bld_abc123def456",
  "status": "building",
  "tez_id": "acme-analysis-2026-01",
  "version": 3,
  "estimated_size_bytes": 3500000,
  "urls": {
    "status": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/builds/bld_abc123def456",
    "archive": "https://tezit.com/api/v1/tez/acme-analysis-2026-01/archive"
  }
}
```

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/build \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{"include_conversation": false}'
```

### 4.4 Download Tez Archive

Download the packaged `.tez` archive. The most recent successful build is returned.

```
GET /api/v1/tez/{id}/archive
```

**Required Scope:** `tez:read`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `version` | integer | (latest) | Specific version to download |

**Response: `200 OK`**

```
Content-Type: application/vnd.tezit+zip
Content-Disposition: attachment; filename="acme-analysis-2026-01.tez"
Content-Length: 3456789
```

The response body is the raw archive bytes.

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `not_found` | Tez not found or no archive has been built |
| 409 | `build_in_progress` | Archive is still being generated |

**Example:**

```bash
curl -O -J https://tezit.com/api/v1/tez/acme-analysis-2026-01/archive \
  -H "Authorization: Bearer eyJhbGci..."
```

### 4.5 Import Tez Archive

Import a `.tez` archive file to create a new Tez on the platform.

```
POST /api/v1/tez/import
```

**Required Scope:** `tez:write`

**Request Headers:**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {token}` |
| `Content-Type` | `multipart/form-data` |

**Request Body (multipart/form-data):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | The `.tez` archive file |
| `vault_id` | string | No | Target vault (uses default vault if omitted) |
| `id_override` | string | No | Override the Tez ID from the manifest |

**Response: `201 Created`**

Returns the full Tez metadata (same structure as the Create response in Section 3.1).

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_archive` | Archive is corrupt or not a valid `.tez` file |
| 400 | `invalid_manifest` | manifest.json is missing or invalid |
| 409 | `id_conflict` | A Tez with this ID already exists |
| 413 | `file_too_large` | Archive exceeds maximum upload size |
| 422 | `unsupported_version` | Archive uses an unsupported protocol version |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/import \
  -H "Authorization: Bearer eyJhbGci..." \
  -F "file=@acme-analysis-2026-01.tez" \
  -F "vault_id=my-research-vault"
```

---

## 5. Interrogation API

The Interrogation API enables AI-powered question-answering against a Tez's context. Responses are grounded exclusively in the transmitted context per Section 9 of the Protocol Spec.

### 5.1 Ask a Question

Submit a question and receive a grounded response.

```
POST /api/v1/tez/{id}/interrogate
```

**Required Scope:** `interrogate`

**Request Headers:**

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {token}` |
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
  "query": "What evidence supports the 18% overrun claim?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "options": {
    "model": "claude-sonnet-4-5-20250929",
    "include_citations": true,
    "confidence_signals": true,
    "max_tokens": 2048,
    "temperature": 0.0
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | The question to ask (max 10,000 characters) |
| `session_id` | string (UUID) | No | Existing session ID for multi-turn conversations. Omit to create a new session. |
| `options.model` | string | No | AI model to use (platform default if omitted) |
| `options.include_citations` | boolean | No | Include structured citations in response (default: `true`) |
| `options.confidence_signals` | boolean | No | Include confidence classification (default: `true`) |
| `options.max_tokens` | integer | No | Maximum tokens in response (default: 2048, max: 8192) |
| `options.temperature` | number | No | Model temperature 0.0-1.0 (default: 0.0 for grounded responses) |

**Response: `200 OK`**

```json
{
  "answer": "The Q4 budget spreadsheet shows infrastructure costs of $2.36M against a target of $2.0M, representing an 18% overrun [[q4-budget:Sheet2:B14]]. This is corroborated by the CFO's email noting that \"infrastructure spend exceeded plan by approximately 18 percent\" [[email-thread-042]].",
  "citations": [
    {
      "item_id": "q4-budget",
      "location": "Sheet2:B14",
      "excerpt": "Infrastructure Total: $2,360,000",
      "confidence": "high"
    },
    {
      "item_id": "email-thread-042",
      "location": null,
      "excerpt": "infrastructure spend exceeded plan by approximately 18 percent",
      "confidence": "high"
    }
  ],
  "classification": "grounded",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "query_id": "qry_abc123def456",
  "model": "claude-sonnet-4-5-20250929",
  "tokens_used": 847,
  "context_chunks_searched": 156,
  "context_chunks_used": 8
}
```

**Classification Values:**

| Classification | Description |
|----------------|-------------|
| `grounded` | All claims are supported by cited context |
| `partially_grounded` | Some claims lack citations; ungrounded claims are flagged |
| `insufficient_context` | The context does not contain enough information to answer |
| `out_of_scope` | The question is unrelated to the Tez's subject matter |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_query` | Query is empty or exceeds maximum length |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `interrogation_disabled` | Tez owner has disabled interrogation |
| 404 | `not_found` | Tez does not exist |
| 409 | `not_indexed` | Context files are still being indexed |
| 429 | `rate_limited` | Interrogation rate limit exceeded |
| 503 | `model_unavailable` | The requested AI model is temporarily unavailable |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What evidence supports the 18% overrun claim?",
    "options": {
      "include_citations": true,
      "confidence_signals": true
    }
  }'
```

### 5.2 Ask with SSE Streaming

Submit a question and receive a streaming response via Server-Sent Events.

```
POST /api/v1/tez/{id}/interrogate/stream
```

**Required Scope:** `interrogate`

**Request Body:** Same as Section 5.1.

**Response: `200 OK`**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Stream Format:**

```
event: session
data: {"session_id": "550e8400-e29b-41d4-a716-446655440000", "query_id": "qry_abc123def456"}

event: citation
data: {"item_id": "q4-budget", "location": "Sheet2:B14", "excerpt": "Infrastructure Total: $2,360,000", "confidence": "high"}

event: token
data: {"text": "The Q4 budget spreadsheet shows "}

event: token
data: {"text": "infrastructure costs of $2.36M "}

event: token
data: {"text": "against a target of $2.0M, representing an 18% overrun "}

event: token
data: {"text": "[[q4-budget:Sheet2:B14]]."}

event: citation
data: {"item_id": "email-thread-042", "location": null, "excerpt": "infrastructure spend exceeded plan by approximately 18 percent", "confidence": "high"}

event: token
data: {"text": " This is corroborated by the CFO's email..."}

event: done
data: {"classification": "grounded", "tokens_used": 847, "context_chunks_searched": 156, "context_chunks_used": 8}
```

**Event Types:**

| Event | Description |
|-------|-------------|
| `session` | Session and query identifiers (sent first) |
| `citation` | A citation to a context item (sent as sources are identified) |
| `token` | A text token of the response |
| `error` | An error occurred during generation |
| `done` | Generation complete with summary metadata |

**Error Event:**

```
event: error
data: {"code": "model_error", "message": "Model generation failed unexpectedly"}
```

**Example:**

```bash
curl -N -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate/stream \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What evidence supports the 18% overrun claim?",
    "options": {"include_citations": true}
  }'
```

### 5.3 List Interrogation Sessions

List interrogation sessions for a Tez.

```
GET /api/v1/tez/{id}/interrogate/sessions
```

**Required Scope:** `interrogate`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "sessions": [
    {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2026-01-25T15:00:00Z",
      "last_activity": "2026-01-25T15:45:00Z",
      "query_count": 7,
      "total_tokens": 5230,
      "model": "claude-sonnet-4-5-20250929"
    }
  ],
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate/sessions \
  -H "Authorization: Bearer eyJhbGci..."
```

### 5.4 Get Session History

Retrieve the full question-and-answer history for an interrogation session.

```
GET /api/v1/tez/{id}/interrogate/sessions/{session_id}
```

**Required Scope:** `interrogate`

**Response: `200 OK`**

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "tez_id": "acme-analysis-2026-01",
  "tez_version": 3,
  "created_at": "2026-01-25T15:00:00Z",
  "last_activity": "2026-01-25T15:45:00Z",
  "model": "claude-sonnet-4-5-20250929",
  "exchanges": [
    {
      "query_id": "qry_001",
      "query": "What evidence supports the 18% overrun claim?",
      "answer": "The Q4 budget spreadsheet shows...",
      "citations": [
        {
          "item_id": "q4-budget",
          "location": "Sheet2:B14",
          "excerpt": "Infrastructure Total: $2,360,000",
          "confidence": "high"
        }
      ],
      "classification": "grounded",
      "tokens_used": 847,
      "timestamp": "2026-01-25T15:00:15Z"
    },
    {
      "query_id": "qry_002",
      "query": "Who approved this spending?",
      "answer": "The context does not contain explicit approval records...",
      "citations": [],
      "classification": "insufficient_context",
      "tokens_used": 312,
      "timestamp": "2026-01-25T15:02:30Z"
    }
  ],
  "total_tokens": 1159
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate/sessions/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 5.5 End Session

Delete an interrogation session and its history.

```
DELETE /api/v1/tez/{id}/interrogate/sessions/{session_id}
```

**Required Scope:** `interrogate`

**Response: `204 No Content`**

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/tez/acme-analysis-2026-01/interrogate/sessions/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 6. Forking

Forking creates a new Tez derived from an existing one. The fork inherits the parent's context and may add new context or develop a counter-position.

### 6.1 Fork a Tez

```
POST /api/v1/tez/{id}/fork
```

**Required Scope:** `tez:write`

**Request Body:**

```json
{
  "id": "acme-analysis-counter-2026-02",
  "title": "Acme Analysis: Counter-Proposal",
  "reason": "Different market assumptions based on Q4 actuals",
  "inherit_context": true,
  "inherit_parameters": true,
  "vault_id": "my-research-vault"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | No | ID for the fork (auto-generated if omitted) |
| `title` | string | No | Title (defaults to "Fork of {parent title}") |
| `reason` | string | No | Why this fork was created |
| `inherit_context` | boolean | No | Copy parent's context items (default: `true`) |
| `inherit_parameters` | boolean | No | Copy parent's parameters (default: `true`) |
| `vault_id` | string | No | Target vault for the fork |

**Response: `201 Created`**

Returns the full Tez metadata for the new fork, with `lineage.forked_from` set to the parent Tez ID.

```json
{
  "id": "acme-analysis-counter-2026-02",
  "version": 1,
  "title": "Acme Analysis: Counter-Proposal",
  "status": "draft",
  "lineage": {
    "forked_from": "acme-analysis-2026-01",
    "fork_count": 0,
    "related": ["acme-analysis-2026-01"]
  },
  "...": "..."
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `fork_disabled` | Tez owner has disabled forking |
| 404 | `not_found` | Parent Tez does not exist |
| 409 | `id_conflict` | A Tez with the requested fork ID already exists |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/fork \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Acme Analysis: Counter-Proposal",
    "reason": "Different market assumptions based on Q4 actuals"
  }'
```

### 6.2 List Forks

List all forks of a Tez.

```
GET /api/v1/tez/{id}/forks
```

**Required Scope:** `tez:read`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "forks": [
    {
      "id": "acme-analysis-counter-2026-02",
      "title": "Acme Analysis: Counter-Proposal",
      "reason": "Different market assumptions based on Q4 actuals",
      "creator": {
        "id": "usr_def456",
        "username": "mjones",
        "name": "Mike Jones"
      },
      "created_at": "2026-02-01T10:00:00Z",
      "version": 2,
      "fork_count": 0
    }
  ],
  "total_count": 1,
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/forks \
  -H "Authorization: Bearer eyJhbGci..."
```

### 6.3 Get Fork Lineage

Retrieve the complete fork tree for a Tez, showing its ancestry and descendants.

```
GET /api/v1/tez/{id}/lineage
```

**Required Scope:** `tez:read`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | integer | 5 | Maximum depth to traverse (max 20) |

**Response: `200 OK`**

```json
{
  "root": {
    "id": "acme-analysis-2026-01",
    "title": "Acme Partnership Analysis",
    "creator": {
      "id": "usr_abc123",
      "username": "jsmith"
    },
    "created_at": "2026-01-25T14:30:00Z",
    "version": 3,
    "children": [
      {
        "id": "acme-analysis-counter-2026-02",
        "title": "Acme Analysis: Counter-Proposal",
        "creator": {
          "id": "usr_def456",
          "username": "mjones"
        },
        "created_at": "2026-02-01T10:00:00Z",
        "reason": "Different market assumptions based on Q4 actuals",
        "version": 2,
        "children": []
      }
    ]
  },
  "total_nodes": 2,
  "max_depth_reached": false
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/lineage?depth=10 \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 7. Sharing and Permissions

### 7.1 Share a Tez

Share a Tez with a specific user or email address.

```
POST /api/v1/tez/{id}/share
```

**Required Scope:** `tez:admin`

**Request Body:**

```json
{
  "recipient": "legal@lawfirm.com",
  "recipient_type": "email",
  "permissions": {
    "interrogate": true,
    "fork": false,
    "reshare": false,
    "download": true
  },
  "message": "Please review the partnership analysis and let me know if you have questions.",
  "expires_at": "2026-03-01T00:00:00Z",
  "notify": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient` | string | Yes | Username, email address, or user ID |
| `recipient_type` | string | Yes | `username`, `email`, or `user_id` |
| `permissions` | object | No | Override default Tez permissions for this share |
| `message` | string | No | Message to include in the share notification |
| `expires_at` | string | No | ISO 8601 expiration (no expiration if omitted) |
| `notify` | boolean | No | Send notification to recipient (default: `true`) |
| `hosting` | string | No | `sender`, `portable`, or `dual` (default: `sender`) |

**Response: `201 Created`**

```json
{
  "share_id": "shr_abc123def456",
  "tez_id": "acme-analysis-2026-01",
  "recipient": "legal@lawfirm.com",
  "recipient_type": "email",
  "permissions": {
    "interrogate": true,
    "fork": false,
    "reshare": false,
    "download": true
  },
  "hosting": "sender",
  "created_at": "2026-01-26T09:00:00Z",
  "expires_at": "2026-03-01T00:00:00Z",
  "status": "pending",
  "urls": {
    "web": "https://tezit.com/s/shr_abc123def456"
  }
}
```

**Share Status Values:**

| Status | Description |
|--------|-------------|
| `pending` | Invitation sent, not yet accepted |
| `accepted` | Recipient has accessed the share |
| `expired` | Share has expired |
| `revoked` | Share was revoked by the owner |

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_recipient` | Recipient format is invalid |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `reshare_disabled` | Cannot share a Tez you received without reshare permission |
| 404 | `not_found` | Tez does not exist |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/share \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "legal@lawfirm.com",
    "recipient_type": "email",
    "permissions": {"interrogate": true, "fork": false},
    "message": "Please review the partnership analysis."
  }'
```

### 7.2 List Shares

List all active shares for a Tez.

```
GET /api/v1/tez/{id}/shares
```

**Required Scope:** `tez:admin`

**Response: `200 OK`**

```json
{
  "shares": [
    {
      "share_id": "shr_abc123def456",
      "recipient": "legal@lawfirm.com",
      "recipient_type": "email",
      "permissions": {
        "interrogate": true,
        "fork": false,
        "reshare": false,
        "download": true
      },
      "created_at": "2026-01-26T09:00:00Z",
      "expires_at": "2026-03-01T00:00:00Z",
      "status": "accepted",
      "last_accessed": "2026-01-27T14:00:00Z",
      "access_count": 3
    }
  ],
  "total_count": 1,
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/tez/acme-analysis-2026-01/shares \
  -H "Authorization: Bearer eyJhbGci..."
```

### 7.3 Revoke Share

Revoke a share, immediately removing the recipient's access.

```
DELETE /api/v1/tez/{id}/shares/{share_id}
```

**Required Scope:** `tez:admin`

**Response: `204 No Content`**

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/tez/acme-analysis-2026-01/shares/shr_abc123def456 \
  -H "Authorization: Bearer eyJhbGci..."
```

### 7.4 Update Permissions

Update the default permissions for a Tez.

```
PUT /api/v1/tez/{id}/permissions
```

**Required Scope:** `tez:admin`

**Request Body:**

```json
{
  "interrogate": true,
  "fork": true,
  "reshare": false,
  "commercial_use": false,
  "download": true,
  "license": "CC-BY-4.0"
}
```

**Response: `200 OK`**

```json
{
  "tez_id": "acme-analysis-2026-01",
  "permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false,
    "commercial_use": false,
    "download": true,
    "license": "CC-BY-4.0"
  },
  "updated_at": "2026-01-26T10:00:00Z"
}
```

**Example:**

```bash
curl -X PUT https://tezit.com/api/v1/tez/acme-analysis-2026-01/permissions \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{"fork": false, "reshare": false}'
```

### 7.5 Generate Capability URL

Generate a capability URL that grants temporary access to a Tez without requiring authentication. Useful for sharing with external recipients who do not have platform accounts.

```
POST /api/v1/tez/{id}/capability-url
```

**Required Scope:** `tez:admin`

**Request Body:**

```json
{
  "permissions": {
    "interrogate": true,
    "fork": false,
    "download": false
  },
  "expires_at": "2026-02-15T00:00:00Z",
  "max_uses": 50,
  "password": "optional-password",
  "label": "External legal review"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `permissions` | object | No | Permissions for URL holders (defaults to Tez permissions) |
| `expires_at` | string | No | Expiration timestamp (default: 30 days) |
| `max_uses` | integer | No | Maximum access count (default: unlimited) |
| `password` | string | No | Optional password protection |
| `label` | string | No | Human-readable label for management |

**Response: `201 Created`**

```json
{
  "capability_id": "cap_abc123def456",
  "url": "https://tezit.com/t/acme-analysis-2026-01?cap=tez_cap_a1b2c3d4e5f6...",
  "short_url": "https://tez.it/c/a1b2c3",
  "permissions": {
    "interrogate": true,
    "fork": false,
    "download": false
  },
  "expires_at": "2026-02-15T00:00:00Z",
  "max_uses": 50,
  "current_uses": 0,
  "password_protected": true,
  "label": "External legal review",
  "created_at": "2026-01-26T10:30:00Z"
}
```

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/tez/acme-analysis-2026-01/capability-url \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": {"interrogate": true, "fork": false},
    "expires_at": "2026-02-15T00:00:00Z",
    "label": "External legal review"
  }'
```

---

## 8. Vaults

Vaults are collections of tezits, analogous to GitHub repositories.

### 8.1 Create Vault

```
POST /api/v1/vaults
```

**Required Scope:** `vault:write`

**Request Body:**

```json
{
  "id": "partnership-research",
  "name": "Partnership Research",
  "description": "Analyses and counter-proposals for partnership opportunities",
  "visibility": "private",
  "default_permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | No | Vault identifier (auto-generated if omitted) |
| `name` | string | Yes | Display name |
| `description` | string | No | Vault description |
| `visibility` | string | No | `private`, `internal` (org-only), or `public` (default: `private`) |
| `default_permissions` | object | No | Default permissions for tezits added to this vault |

**Response: `201 Created`**

```json
{
  "id": "partnership-research",
  "name": "Partnership Research",
  "description": "Analyses and counter-proposals for partnership opportunities",
  "visibility": "private",
  "owner": {
    "id": "usr_abc123",
    "username": "jsmith",
    "name": "Jane Smith"
  },
  "default_permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false
  },
  "tez_count": 0,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z",
  "urls": {
    "self": "https://tezit.com/api/v1/vaults/partnership-research",
    "tez": "https://tezit.com/api/v1/vaults/partnership-research/tez",
    "web": "https://tezit.com/jsmith/vaults/partnership-research"
  }
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Malformed request body |
| 401 | `unauthorized` | Missing or invalid token |
| 409 | `id_conflict` | A vault with this ID already exists for this user |

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/vaults \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Partnership Research",
    "description": "Analyses and counter-proposals for partnership opportunities",
    "visibility": "private"
  }'
```

### 8.2 List User's Vaults

```
GET /api/v1/vaults
```

**Required Scope:** `vault:read`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `visibility` | string | (all) | Filter by `private`, `internal`, or `public` |
| `sort` | string | `updated_at` | Sort by `name`, `created_at`, or `updated_at` |
| `order` | string | `desc` | `asc` or `desc` |
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "vaults": [
    {
      "id": "partnership-research",
      "name": "Partnership Research",
      "description": "Analyses and counter-proposals for partnership opportunities",
      "visibility": "private",
      "tez_count": 5,
      "created_at": "2026-01-20T10:00:00Z",
      "updated_at": "2026-01-28T09:15:00Z"
    }
  ],
  "total_count": 3,
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJ2IjoicGFydG5lcnNoaXAtcmVzZWFyY2gifQ=="
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/vaults \
  -H "Authorization: Bearer eyJhbGci..."
```

### 8.3 Get Vault Details

```
GET /api/v1/vaults/{id}
```

**Required Scope:** `vault:read`

**Response: `200 OK`**

Returns the full vault object as shown in the Create response (Section 8.1).

**Example:**

```bash
curl https://tezit.com/api/v1/vaults/partnership-research \
  -H "Authorization: Bearer eyJhbGci..."
```

### 8.4 Update Vault

```
PUT /api/v1/vaults/{id}
```

**Required Scope:** `vault:write`

**Request Body:**

Only include fields being updated.

```json
{
  "name": "Partnership Research (2026)",
  "description": "Updated description",
  "visibility": "internal"
}
```

**Response: `200 OK`**

Returns the full updated vault object.

**Example:**

```bash
curl -X PUT https://tezit.com/api/v1/vaults/partnership-research \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{"name": "Partnership Research (2026)"}'
```

### 8.5 Delete Vault

```
DELETE /api/v1/vaults/{id}
```

**Required Scope:** `vault:write`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `delete_tez` | boolean | `false` | Also delete all tezits in the vault. If `false`, tezits are moved to the user's default vault. |

**Response: `204 No Content`**

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 403 | `forbidden` | Not the vault owner |
| 404 | `not_found` | Vault does not exist |

**Example:**

```bash
curl -X DELETE "https://tezit.com/api/v1/vaults/partnership-research?delete_tez=false" \
  -H "Authorization: Bearer eyJhbGci..."
```

### 8.6 List Tezits in Vault

```
GET /api/v1/vaults/{id}/tez
```

**Required Scope:** `vault:read`

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort` | string | `updated_at` | Sort by `title`, `created_at`, or `updated_at` |
| `order` | string | `desc` | `asc` or `desc` |
| `profile` | string | (all) | Filter by Tez profile (e.g., `knowledge`, `messaging`) |
| `tag` | string | (all) | Filter by tag |
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "tez": [
    {
      "id": "acme-analysis-2026-01",
      "title": "Acme Partnership Analysis",
      "profile": "knowledge",
      "status": "published",
      "version": 3,
      "creator": {
        "id": "usr_abc123",
        "username": "jsmith"
      },
      "synthesis": {
        "type": "recommendation",
        "abstract": "Analysis of proposed partnership terms with risk assessment."
      },
      "context": {
        "item_count": 12,
        "total_size_bytes": 3145728
      },
      "tags": ["partnership", "analysis", "acme"],
      "created_at": "2026-01-25T14:30:00Z",
      "updated_at": "2026-01-28T09:15:00Z"
    }
  ],
  "total_count": 5,
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/vaults/partnership-research/tez \
  -H "Authorization: Bearer eyJhbGci..."
```

### 8.7 Add Tez to Vault

Move or copy a Tez into a vault.

```
POST /api/v1/vaults/{id}/tez
```

**Required Scope:** `vault:write`

**Request Body:**

```json
{
  "tez_id": "acme-analysis-2026-01",
  "action": "move"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tez_id` | string | Yes | The Tez to add |
| `action` | string | No | `move` (default) or `copy` |

**Response: `200 OK`**

```json
{
  "tez_id": "acme-analysis-2026-01",
  "vault_id": "partnership-research",
  "action": "move",
  "previous_vault_id": "default"
}
```

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/vaults/partnership-research/tez \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{"tez_id": "acme-analysis-2026-01", "action": "move"}'
```

---

## 9. Search and Discovery

### 9.1 Search Tezits

Full-text search across tezits the authenticated user has access to.

```
GET /api/v1/search
```

**Required Scope:** `tez:read`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query (max 500 characters) |
| `scope` | string | No | `own` (user's tezits), `shared` (shared with user), `public`, or `all` (default: `all`) |
| `profile` | string | No | Filter by Tez profile |
| `type` | string | No | Filter by synthesis type |
| `tag` | string | No | Filter by tag (repeatable) |
| `creator` | string | No | Filter by creator username |
| `vault` | string | No | Filter by vault ID |
| `created_after` | string | No | ISO 8601 minimum creation date |
| `created_before` | string | No | ISO 8601 maximum creation date |
| `sort` | string | No | `relevance` (default), `created_at`, `updated_at` |
| `limit` | integer | No | Items per page (default: 25, max: 100) |
| `cursor` | string | No | Pagination cursor |

**Response: `200 OK`**

```json
{
  "results": [
    {
      "tez": {
        "id": "acme-analysis-2026-01",
        "title": "Acme Partnership Analysis",
        "profile": "knowledge",
        "creator": {
          "id": "usr_abc123",
          "username": "jsmith",
          "name": "Jane Smith"
        },
        "synthesis": {
          "type": "recommendation",
          "abstract": "Analysis of proposed partnership terms with risk assessment."
        },
        "tags": ["partnership", "analysis"],
        "created_at": "2026-01-25T14:30:00Z",
        "updated_at": "2026-01-28T09:15:00Z"
      },
      "score": 0.95,
      "highlights": {
        "synthesis": "...proposed <mark>partnership</mark> terms with risk assessment...",
        "context": "...revenue share is below <mark>market</mark> comparable..."
      }
    }
  ],
  "total_count": 42,
  "query": "partnership analysis",
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJzIjowLjg1fQ=="
  }
}
```

**Example:**

```bash
curl "https://tezit.com/api/v1/search?q=partnership%20analysis&scope=own&sort=relevance" \
  -H "Authorization: Bearer eyJhbGci..."
```

### 9.2 Discover Trending Tezits

Browse trending and featured public tezits.

```
GET /api/v1/discover
```

**Required Scope:** `tez:read` (or no authentication for public discovery)

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | (all) | Filter by topic category |
| `period` | string | `week` | Trending period: `day`, `week`, `month`, `all_time` |
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

```json
{
  "featured": [
    {
      "tez": {
        "id": "climate-models-2026",
        "title": "Climate Model Comparison: IPCC AR7 Assessment",
        "profile": "knowledge",
        "creator": {
          "username": "climate-lab",
          "name": "Climate Research Lab"
        },
        "synthesis": {
          "type": "analysis",
          "abstract": "Comparative analysis of leading climate models..."
        },
        "context": {
          "item_count": 47
        },
        "stats": {
          "interrogations": 1250,
          "forks": 23,
          "shares": 89
        }
      },
      "featured_reason": "editors_pick"
    }
  ],
  "trending": [
    {
      "tez": { "...": "..." },
      "trend_score": 0.92
    }
  ],
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJwIjoxfQ=="
  }
}
```

**Example:**

```bash
curl "https://tezit.com/api/v1/discover?period=week&limit=10" \
  -H "Authorization: Bearer eyJhbGci..."
```

### 9.3 Discover Topics

List available topic categories for browsing.

```
GET /api/v1/discover/topics
```

**Required Scope:** None (public endpoint)

**Response: `200 OK`**

```json
{
  "topics": [
    {
      "id": "business",
      "name": "Business & Finance",
      "description": "Financial analyses, market research, and business strategy",
      "tez_count": 1250,
      "subtopics": [
        {"id": "business/finance", "name": "Finance", "tez_count": 450},
        {"id": "business/strategy", "name": "Strategy", "tez_count": 320},
        {"id": "business/negotiations", "name": "Negotiations", "tez_count": 180}
      ]
    },
    {
      "id": "legal",
      "name": "Legal & Compliance",
      "description": "Legal analyses, regulatory compliance, and case studies",
      "tez_count": 890,
      "subtopics": []
    },
    {
      "id": "research",
      "name": "Research & Academia",
      "description": "Academic research, literature reviews, and methodologies",
      "tez_count": 2100,
      "subtopics": []
    }
  ]
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/discover/topics
```

---

## 10. User and Organization

### 10.1 Get Current User Profile

```
GET /api/v1/user
```

**Required Scope:** `user:read`

**Response: `200 OK`**

```json
{
  "id": "usr_abc123",
  "username": "jsmith",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "avatar_url": "https://tezit.com/avatars/jsmith.png",
  "bio": "Knowledge architect specializing in partnership analysis",
  "org": "Acme Corp",
  "plan": "pro",
  "created_at": "2025-12-01T10:00:00Z",
  "stats": {
    "tez_count": 42,
    "vault_count": 5,
    "total_interrogations_received": 1580,
    "total_forks": 15
  },
  "urls": {
    "self": "https://tezit.com/api/v1/user",
    "tez": "https://tezit.com/api/v1/user/jsmith/tez",
    "vaults": "https://tezit.com/api/v1/vaults",
    "web": "https://tezit.com/jsmith"
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/user \
  -H "Authorization: Bearer eyJhbGci..."
```

### 10.2 Get Public User Profile

```
GET /api/v1/user/{username}
```

**Required Scope:** `user:read` (or no authentication for public profiles)

**Response: `200 OK`**

```json
{
  "id": "usr_abc123",
  "username": "jsmith",
  "name": "Jane Smith",
  "avatar_url": "https://tezit.com/avatars/jsmith.png",
  "bio": "Knowledge architect specializing in partnership analysis",
  "org": "Acme Corp",
  "created_at": "2025-12-01T10:00:00Z",
  "stats": {
    "public_tez_count": 12,
    "total_interrogations_received": 1580,
    "total_forks": 15
  },
  "urls": {
    "tez": "https://tezit.com/api/v1/user/jsmith/tez",
    "web": "https://tezit.com/jsmith"
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/user/jsmith
```

### 10.3 List User's Public Tezits

```
GET /api/v1/user/{username}/tez
```

**Required Scope:** `tez:read` (or no authentication for public tezits)

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort` | string | `updated_at` | Sort by `title`, `created_at`, or `updated_at` |
| `order` | string | `desc` | `asc` or `desc` |
| `profile` | string | (all) | Filter by Tez profile |
| `limit` | integer | 25 | Items per page |
| `cursor` | string | (none) | Pagination cursor |

**Response: `200 OK`**

Returns a paginated list of Tez summary objects (same structure as Section 8.6).

**Example:**

```bash
curl https://tezit.com/api/v1/user/jsmith/tez
```

### 10.4 List User's Organizations

```
GET /api/v1/orgs
```

**Required Scope:** `org:read`

**Response: `200 OK`**

```json
{
  "organizations": [
    {
      "id": "org_acme",
      "slug": "acme",
      "name": "Acme Corp",
      "avatar_url": "https://tezit.com/avatars/orgs/acme.png",
      "role": "admin",
      "member_count": 45,
      "tez_count": 320,
      "vault_count": 12,
      "plan": "enterprise",
      "created_at": "2025-11-15T08:00:00Z"
    }
  ]
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/orgs \
  -H "Authorization: Bearer eyJhbGci..."
```

### 10.5 List Organization's Tezits

```
GET /api/v1/orgs/{org}/tez
```

**Required Scope:** `org:read`

**Query Parameters:** Same as Section 10.3.

**Response: `200 OK`**

Returns a paginated list of Tez summary objects accessible to the authenticated user within the organization.

**Example:**

```bash
curl https://tezit.com/api/v1/orgs/acme/tez \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 11. Webhooks

Webhooks allow external systems to receive real-time notifications when events occur on tezits.

### 11.1 Register Webhook

```
POST /api/v1/webhooks
```

**Required Scope:** `webhook:manage`

**Request Body:**

```json
{
  "url": "https://your-server.com/webhooks/tezit",
  "events": ["tez.created", "tez.updated", "tez.shared", "tez.interrogated", "tez.forked"],
  "secret": "whsec_your-webhook-signing-secret",
  "scope": {
    "vault_id": "partnership-research"
  },
  "active": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | HTTPS endpoint to receive webhook payloads |
| `events` | array | Yes | Event types to subscribe to |
| `secret` | string | Yes | Signing secret for payload verification |
| `scope` | object | No | Limit to specific vault or Tez |
| `active` | boolean | No | Whether the webhook is active (default: `true`) |

**Available Events:**

| Event | Trigger |
|-------|---------|
| `tez.created` | A new Tez is created |
| `tez.updated` | A Tez is updated (new version) |
| `tez.deleted` | A Tez is deleted |
| `tez.shared` | A Tez is shared with a new recipient |
| `tez.interrogated` | An interrogation session is started |
| `tez.forked` | A Tez is forked |
| `tez.published` | A Tez is published publicly |
| `vault.created` | A vault is created |
| `vault.updated` | A vault is updated |
| `context.uploaded` | A context item is uploaded |
| `context.indexed` | A context item finishes indexing |

**Response: `201 Created`**

```json
{
  "id": "whk_abc123def456",
  "url": "https://your-server.com/webhooks/tezit",
  "events": ["tez.created", "tez.updated", "tez.shared", "tez.interrogated", "tez.forked"],
  "scope": {
    "vault_id": "partnership-research"
  },
  "active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "last_delivery": null,
  "delivery_stats": {
    "total": 0,
    "successful": 0,
    "failed": 0
  }
}
```

**Webhook Payload Format:**

All webhook deliveries use the following envelope:

```json
{
  "id": "evt_abc123def456",
  "event": "tez.updated",
  "timestamp": "2026-01-28T09:15:00Z",
  "data": {
    "tez_id": "acme-analysis-2026-01",
    "version": 3,
    "update_type": "manual",
    "actor": {
      "id": "usr_abc123",
      "username": "jsmith"
    }
  }
}
```

**Webhook Signature Verification:**

Payloads are signed using HMAC-SHA256. The signature is included in the `X-Tezit-Signature` header:

```
X-Tezit-Signature: sha256=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

Verify by computing `HMAC-SHA256(webhook_secret, request_body)` and comparing with the header value.

**Example:**

```bash
curl -X POST https://tezit.com/api/v1/webhooks \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/tezit",
    "events": ["tez.created", "tez.updated"],
    "secret": "whsec_your-webhook-signing-secret"
  }'
```

### 11.2 List Webhooks

```
GET /api/v1/webhooks
```

**Required Scope:** `webhook:manage`

**Response: `200 OK`**

```json
{
  "webhooks": [
    {
      "id": "whk_abc123def456",
      "url": "https://your-server.com/webhooks/tezit",
      "events": ["tez.created", "tez.updated"],
      "active": true,
      "created_at": "2026-01-20T10:00:00Z",
      "last_delivery": "2026-01-28T09:15:00Z",
      "delivery_stats": {
        "total": 47,
        "successful": 45,
        "failed": 2
      }
    }
  ],
  "pagination": {
    "has_more": false
  }
}
```

**Example:**

```bash
curl https://tezit.com/api/v1/webhooks \
  -H "Authorization: Bearer eyJhbGci..."
```

### 11.3 Delete Webhook

```
DELETE /api/v1/webhooks/{id}
```

**Required Scope:** `webhook:manage`

**Response: `204 No Content`**

**Example:**

```bash
curl -X DELETE https://tezit.com/api/v1/webhooks/whk_abc123def456 \
  -H "Authorization: Bearer eyJhbGci..."
```

---

## 12. Error Responses

All error responses use a consistent JSON format.

### 12.1 Error Format

```json
{
  "error": {
    "code": "not_found",
    "message": "The requested Tez 'acme-analysis-2026-01' was not found.",
    "details": [
      {
        "field": "id",
        "issue": "No Tez exists with this identifier in your accessible scope."
      }
    ],
    "request_id": "req_abc123def456",
    "documentation_url": "https://tezit.com/docs/errors#not_found"
  }
}
```

| Field | Type | Always Present | Description |
|-------|------|---------------|-------------|
| `error.code` | string | Yes | Machine-readable error code |
| `error.message` | string | Yes | Human-readable description |
| `error.details` | array | No | Additional detail objects |
| `error.request_id` | string | Yes | Unique identifier for this request |
| `error.documentation_url` | string | No | Link to relevant documentation |

### 12.2 HTTP Status Codes

| Status | Usage |
|--------|-------|
| **200 OK** | Successful read or update |
| **201 Created** | Successful resource creation |
| **202 Accepted** | Request accepted for asynchronous processing |
| **204 No Content** | Successful deletion or action with no response body |
| **400 Bad Request** | Malformed request syntax or invalid parameters |
| **401 Unauthorized** | Missing, expired, or invalid authentication token |
| **403 Forbidden** | Valid token but insufficient permissions |
| **404 Not Found** | Resource does not exist or is not accessible |
| **405 Method Not Allowed** | HTTP method not supported for this endpoint |
| **409 Conflict** | Resource state conflict (e.g., duplicate ID, concurrent edit) |
| **413 Payload Too Large** | Request body or file exceeds size limit |
| **415 Unsupported Media Type** | Content-Type not supported |
| **422 Unprocessable Entity** | Request body fails validation |
| **429 Too Many Requests** | Rate limit exceeded |
| **500 Internal Server Error** | Unexpected server error |
| **502 Bad Gateway** | Upstream service failure |
| **503 Service Unavailable** | Service temporarily unavailable (maintenance, overload) |

### 12.3 Error Codes Reference

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | The request body is malformed or contains invalid values |
| `invalid_query` | 400 | The search or interrogation query is invalid |
| `invalid_file` | 400 | Uploaded file is corrupt or unreadable |
| `invalid_archive` | 400 | Tez archive is not valid |
| `invalid_manifest` | 400 | manifest.json is missing or does not validate |
| `invalid_recipient` | 400 | Share recipient format is not valid |
| `unauthorized` | 401 | Authentication required or token invalid |
| `invalid_grant` | 401 | OAuth grant is invalid or expired |
| `invalid_client` | 401 | OAuth client_id is unknown |
| `token_revoked` | 401 | Token has been revoked |
| `forbidden` | 403 | Authenticated but lacks required permissions |
| `interrogation_disabled` | 403 | Tez owner has disabled interrogation |
| `fork_disabled` | 403 | Tez owner has disabled forking |
| `reshare_disabled` | 403 | Cannot reshare a received Tez |
| `not_found` | 404 | Resource not found or not accessible |
| `method_not_allowed` | 405 | HTTP method not supported |
| `id_conflict` | 409 | Resource with this ID already exists |
| `item_id_conflict` | 409 | Context item with this ID already exists |
| `conflict` | 409 | Concurrent modification conflict |
| `has_forks` | 409 | Cannot delete Tez that has active forks |
| `not_indexed` | 409 | Context is still being indexed |
| `build_in_progress` | 409 | Archive build is in progress |
| `file_too_large` | 413 | File exceeds maximum size |
| `unsupported_type` | 415 | File or content type not supported |
| `unsupported_version` | 422 | Protocol version not supported |
| `validation_error` | 422 | Request body fails schema validation |
| `rate_limited` | 429 | Rate limit exceeded |
| `model_unavailable` | 503 | AI model temporarily unavailable |
| `internal_error` | 500 | Unexpected server error |

### 12.4 Validation Error Details

When the error code is `validation_error`, the `details` array contains per-field issues:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request body contains validation errors.",
    "details": [
      {
        "field": "synthesis.type",
        "issue": "Must be one of: general, recommendation, proposal, analysis, summary, comparison, review, tutorial, custom",
        "value": "invalid_type"
      },
      {
        "field": "id",
        "issue": "Must be 3-100 characters, lowercase alphanumeric and hyphens only",
        "value": "A!"
      }
    ],
    "request_id": "req_def456ghi789"
  }
}
```

---

## 13. Rate Limiting

### 13.1 Rate Limit Tiers

| Tier | Requests/min | Interrogations/day | Max Upload Size | Max Context Items |
|------|-------------|--------------------|-----------------|--------------------|
| **Free** | 60 | 50 | 25 MB | 20 per Tez |
| **Pro** | 300 | 500 | 100 MB | 100 per Tez |
| **Enterprise** | 1,000 | 5,000 | 500 MB | Unlimited |

### 13.2 Rate Limit Headers

Every response includes rate limit information:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 247
X-RateLimit-Reset: 1706187600
```

### 13.3 Rate Limit Exceeded Response

When the rate limit is exceeded, the server returns `429 Too Many Requests`:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706187600
X-RateLimit-RetryAfter: 45
Retry-After: 45
```

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded. Please retry after 45 seconds.",
    "details": [
      {
        "field": "rate_limit",
        "issue": "60 requests per minute exceeded",
        "retry_after": 45
      }
    ],
    "request_id": "req_ghi789jkl012"
  }
}
```

### 13.4 Interrogation Rate Limits

Interrogation endpoints have separate, more restrictive rate limits due to AI compute costs:

| Tier | Queries/min | Queries/day | Max Concurrent Streams |
|------|------------|-------------|----------------------|
| **Free** | 5 | 50 | 1 |
| **Pro** | 20 | 500 | 5 |
| **Enterprise** | 100 | 5,000 | 20 |

Interrogation rate limit headers use the `X-RateLimit-Interrogation-*` prefix:

```
X-RateLimit-Interrogation-Limit: 20
X-RateLimit-Interrogation-Remaining: 15
X-RateLimit-Interrogation-Reset: 1706187600
```

---

## 14. Pagination

### 14.1 Cursor-Based Pagination

All list endpoints use opaque cursor-based pagination for stable, consistent results.

**Request:**

```bash
curl "https://tezit.com/api/v1/vaults/my-vault/tez?limit=10&cursor=eyJpZCI6InRlei0wMTAifQ==" \
  -H "Authorization: Bearer eyJhbGci..."
```

**Response:**

The response body includes a `pagination` object:

```json
{
  "tez": [ "..." ],
  "total_count": 87,
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJpZCI6InRlei0wMjAifQ==",
    "prev_cursor": "eyJpZCI6InRlei0wMDEifQ=="
  }
}
```

**Link Headers:**

Responses also include RFC 8288 `Link` headers for discoverability:

```
Link: <https://tezit.com/api/v1/vaults/my-vault/tez?limit=10&cursor=eyJpZCI6InRlei0wMjAifQ==>; rel="next",
      <https://tezit.com/api/v1/vaults/my-vault/tez?limit=10&cursor=eyJpZCI6InRlei0wMDEifQ==>; rel="prev"
```

### 14.2 Pagination Rules

1. Cursors are opaque strings. Clients MUST NOT parse or construct them.
2. Cursors are valid for 24 hours after issuance. Expired cursors return `400 Bad Request`.
3. The `total_count` field is an approximation for large result sets. It MAY lag behind real-time counts.
4. The maximum `limit` value is 100. Values above 100 are clamped to 100.
5. When `has_more` is `false`, there is no `next_cursor`.
6. The first page is requested without a `cursor` parameter.

### 14.3 Pagination Example

Fetching all tezits in a vault page by page:

```bash
# Page 1
curl "https://tezit.com/api/v1/vaults/my-vault/tez?limit=10"

# Page 2 (using next_cursor from page 1)
curl "https://tezit.com/api/v1/vaults/my-vault/tez?limit=10&cursor=eyJpZCI6InRlei0wMTAifQ=="

# Page 3 (using next_cursor from page 2)
curl "https://tezit.com/api/v1/vaults/my-vault/tez?limit=10&cursor=eyJpZCI6InRlei0wMjAifQ=="
```

---

## 15. API Versioning

### 15.1 Strategy

The Tezit API uses URL path versioning. The version is embedded in the base URL:

```
https://{host}/api/v1/tez
https://{host}/api/v2/tez    (future)
```

### 15.2 Version Lifecycle

| Phase | Duration | Description |
|-------|----------|-------------|
| **Current** | Indefinite | The latest stable version; receives new features |
| **Supported** | Minimum 12 months after successor launch | Receives security fixes and critical bug fixes only |
| **Deprecated** | 6 months warning | Requests return `Sunset` and `Deprecation` headers |
| **Retired** | After deprecation period | Returns `410 Gone` for all requests |

### 15.3 Deprecation Headers

When an API version or specific endpoint is deprecated:

```
Deprecation: true
Sunset: Sat, 01 Jan 2028 00:00:00 GMT
Link: <https://tezit.com/docs/migration/v1-to-v2>; rel="successor-version"
```

### 15.4 Breaking vs. Non-Breaking Changes

**Non-breaking changes** (added within a version):
- Adding new optional fields to response bodies
- Adding new optional query parameters
- Adding new endpoints
- Adding new webhook event types
- Adding new error codes

**Breaking changes** (require a new version):
- Removing or renaming existing fields
- Changing field types
- Changing required/optional status of request fields
- Removing endpoints
- Changing authentication mechanisms
- Changing error response structure

### 15.5 Content Negotiation

Clients MAY include the `X-Tezit-Version` header to indicate the protocol version they support. This is informational and does not affect API version routing.

```
X-Tezit-Version: 1.0
```

The server includes the protocol version it supports in responses:

```
X-Tezit-Version: 1.1
```

---

## Appendix A: Quick Reference

### Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| **Authentication** | | |
| `POST` | `/api/v1/auth/token` | Obtain access token |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `DELETE` | `/api/v1/auth/token` | Revoke token |
| **Tez CRUD** | | |
| `POST` | `/api/v1/tez` | Create a new Tez |
| `GET` | `/api/v1/tez/{id}` | Get Tez metadata |
| `GET` | `/api/v1/tez/{id}/synthesis` | Get synthesis document |
| `GET` | `/api/v1/tez/{id}/context` | List context items |
| `GET` | `/api/v1/tez/{id}/context/{item_id}` | Download context item |
| `PUT` | `/api/v1/tez/{id}` | Update Tez (new version) |
| `DELETE` | `/api/v1/tez/{id}` | Delete Tez |
| `GET` | `/api/v1/tez/{id}/versions` | List versions |
| `GET` | `/api/v1/tez/{id}/versions/{v}` | Get specific version |
| **Upload & Build** | | |
| `POST` | `/api/v1/tez/{id}/context` | Upload context file |
| `DELETE` | `/api/v1/tez/{id}/context/{item_id}` | Remove context item |
| `POST` | `/api/v1/tez/{id}/build` | Build .tez archive |
| `GET` | `/api/v1/tez/{id}/archive` | Download .tez archive |
| `POST` | `/api/v1/tez/import` | Import .tez archive |
| **Interrogation** | | |
| `POST` | `/api/v1/tez/{id}/interrogate` | Ask a question |
| `POST` | `/api/v1/tez/{id}/interrogate/stream` | Ask with SSE streaming |
| `GET` | `/api/v1/tez/{id}/interrogate/sessions` | List sessions |
| `GET` | `/api/v1/tez/{id}/interrogate/sessions/{sid}` | Get session history |
| `DELETE` | `/api/v1/tez/{id}/interrogate/sessions/{sid}` | End session |
| **Forking** | | |
| `POST` | `/api/v1/tez/{id}/fork` | Fork a Tez |
| `GET` | `/api/v1/tez/{id}/forks` | List forks |
| `GET` | `/api/v1/tez/{id}/lineage` | Get fork tree |
| **Sharing & Permissions** | | |
| `POST` | `/api/v1/tez/{id}/share` | Share Tez |
| `GET` | `/api/v1/tez/{id}/shares` | List shares |
| `DELETE` | `/api/v1/tez/{id}/shares/{share_id}` | Revoke share |
| `PUT` | `/api/v1/tez/{id}/permissions` | Update permissions |
| `POST` | `/api/v1/tez/{id}/capability-url` | Generate capability URL |
| **Vaults** | | |
| `POST` | `/api/v1/vaults` | Create vault |
| `GET` | `/api/v1/vaults` | List vaults |
| `GET` | `/api/v1/vaults/{id}` | Get vault details |
| `PUT` | `/api/v1/vaults/{id}` | Update vault |
| `DELETE` | `/api/v1/vaults/{id}` | Delete vault |
| `GET` | `/api/v1/vaults/{id}/tez` | List tezits in vault |
| `POST` | `/api/v1/vaults/{id}/tez` | Add Tez to vault |
| **Search & Discovery** | | |
| `GET` | `/api/v1/search` | Search tezits |
| `GET` | `/api/v1/discover` | Trending / featured |
| `GET` | `/api/v1/discover/topics` | Topic categories |
| **User & Organization** | | |
| `GET` | `/api/v1/user` | Current user profile |
| `GET` | `/api/v1/user/{username}` | Public user profile |
| `GET` | `/api/v1/user/{username}/tez` | User's public tezits |
| `GET` | `/api/v1/orgs` | User's organizations |
| `GET` | `/api/v1/orgs/{org}/tez` | Organization's tezits |
| **Webhooks** | | |
| `POST` | `/api/v1/webhooks` | Register webhook |
| `GET` | `/api/v1/webhooks` | List webhooks |
| `DELETE` | `/api/v1/webhooks/{id}` | Delete webhook |

### Authentication Scopes Summary

| Scope | Grants |
|-------|--------|
| `tez:read` | Read Tez metadata, synthesis, context |
| `tez:write` | Create, update, delete tezits |
| `tez:admin` | Manage shares, permissions, capability URLs |
| `interrogate` | Submit interrogation queries |
| `vault:read` | List and read vaults |
| `vault:write` | Create, update, delete vaults |
| `user:read` | Read user profiles |
| `user:write` | Update user profile |
| `org:read` | Read organization data |
| `org:write` | Manage organization settings |
| `webhook:manage` | Create, list, delete webhooks |

---

## Appendix B: Webhook Event Payloads

### tez.created

```json
{
  "id": "evt_abc123",
  "event": "tez.created",
  "timestamp": "2026-01-25T14:30:00Z",
  "data": {
    "tez_id": "acme-analysis-2026-01",
    "title": "Acme Partnership Analysis",
    "profile": "knowledge",
    "vault_id": "partnership-research",
    "actor": {"id": "usr_abc123", "username": "jsmith"}
  }
}
```

### tez.updated

```json
{
  "id": "evt_def456",
  "event": "tez.updated",
  "timestamp": "2026-01-28T09:15:00Z",
  "data": {
    "tez_id": "acme-analysis-2026-01",
    "version": 3,
    "previous_version": 2,
    "update_type": "manual",
    "actor": {"id": "usr_abc123", "username": "jsmith"}
  }
}
```

### tez.shared

```json
{
  "id": "evt_ghi789",
  "event": "tez.shared",
  "timestamp": "2026-01-26T09:00:00Z",
  "data": {
    "tez_id": "acme-analysis-2026-01",
    "share_id": "shr_abc123def456",
    "recipient": "legal@lawfirm.com",
    "recipient_type": "email",
    "permissions": {"interrogate": true, "fork": false},
    "actor": {"id": "usr_abc123", "username": "jsmith"}
  }
}
```

### tez.interrogated

```json
{
  "id": "evt_jkl012",
  "event": "tez.interrogated",
  "timestamp": "2026-01-27T14:00:00Z",
  "data": {
    "tez_id": "acme-analysis-2026-01",
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "query_count": 1,
    "classification": "grounded",
    "actor": {"id": "usr_def456", "username": "mjones"}
  }
}
```

### tez.forked

```json
{
  "id": "evt_mno345",
  "event": "tez.forked",
  "timestamp": "2026-02-01T10:00:00Z",
  "data": {
    "parent_tez_id": "acme-analysis-2026-01",
    "fork_tez_id": "acme-analysis-counter-2026-02",
    "reason": "Different market assumptions based on Q4 actuals",
    "actor": {"id": "usr_def456", "username": "mjones"}
  }
}
```

---

## Appendix C: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-05 | Initial HTTP API specification |

---

*This specification is licensed under CC BY 4.0. It is designed to be implemented independently by any Tezit-compatible platform.*
