# com.ragu.streaming-interrogation

| Field | Value |
|-------|-------|
| **Extension ID** | `com.ragu.streaming-interrogation` |
| **Version** | 1.0.0 |
| **Status** | Active (standardizing) |
| **Author** | Ragu Platform |
| **Minimum Protocol Version** | 1.2 |
| **Standardization Target** | `tezit-streaming` (planned) |
| **TIP Enterprise Addendum** | Section 2 |

## Purpose

The Tezit Interrogation Protocol (TIP) defines how AI systems interrogate a Tez -- submitting queries and receiving responses grounded in the bundled context. The core protocol operates in a request-response pattern: the client sends a query and waits for a complete response. This works well for simple interrogations, but production enterprise environments require **real-time streaming** for:

- **Low latency perception:** Users see tokens arriving as they are generated, rather than waiting for the complete response. For complex interrogations that take several seconds, this dramatically improves the user experience.
- **Progressive citation disclosure:** Citations and source references are surfaced as the response unfolds, allowing users to verify claims in real time rather than at the end.
- **Live classification updates:** The tez classification (confidence level, finding type) may evolve as the model processes more context. Streaming enables the UI to reflect this evolution.
- **Error recovery:** If the stream is interrupted, the client can resume from the last received event using the `Last-Event-ID` mechanism, avoiding complete regeneration.
- **Resource efficiency:** The server can begin generating tokens before the full response is computed, reducing memory pressure and enabling concurrent stream processing.

The `com.ragu.streaming-interrogation` extension defines a **Server-Sent Events (SSE)** protocol for real-time TIP interrogation. It specifies:

- **Event types** for session lifecycle, content streaming, citation discovery, classification updates, completion, and errors
- **Data payloads** for each event type with strict JSON schemas
- **Connection lifecycle** including opening handshake, streaming, and clean closure
- **Reconnection semantics** using the SSE `Last-Event-ID` header for resumable streams
- **Heartbeat protocol** to maintain connections through proxies and load balancers

## Schema

Unlike the other `com.ragu.*` extensions, this extension defines a **protocol specification** rather than a data file stored within a Tez bundle. The extension's presence in a Tez manifest signals that the platform hosting this Tez supports SSE streaming for TIP interrogation.

### Extension Manifest (within a Tez bundle)

When included in a Tez bundle, the extension manifest signals streaming support:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── com.ragu.streaming-interrogation/
        └── manifest.json
```

```json
{
  "extension_id": "com.ragu.streaming-interrogation",
  "extension_version": "1.0.0",
  "name": "Streaming Interrogation",
  "description": "Production SSE streaming protocol for real-time TIP interrogation",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/vendor/com.ragu/streaming-interrogation"
}
```

### Event Types

The streaming protocol defines six event types. Each event is delivered as a standard SSE message with the `event` field set to the event type and the `data` field containing a JSON payload.

---

#### `tip.session.start`

Emitted once when the streaming session begins. Establishes the session context.

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "tez_id": "tez-quarterly-analysis",
  "query": "What are the key financial risks?",
  "model": "claude-opus-4-6",
  "started_at": "2026-02-05T14:30:00Z"
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.session.start",
  "title": "TIP Session Start Event",
  "type": "object",
  "required": ["session_id", "tez_id", "query", "model", "started_at"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Unique identifier for this TIP streaming session."
    },
    "tez_id": {
      "type": "string",
      "description": "Identifier of the Tez being interrogated."
    },
    "query": {
      "type": "string",
      "description": "The interrogation query that initiated this stream."
    },
    "model": {
      "type": "string",
      "description": "Identifier of the synthesis model processing this query."
    },
    "started_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the session started."
    }
  },
  "additionalProperties": false
}
```

---

#### `tip.stream.delta`

Emitted repeatedly as the synthesis model generates tokens. Each delta contains a fragment of the response text.

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "delta": "Based on the financial model",
  "sequence": 0,
  "finish_reason": null
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.stream.delta",
  "title": "TIP Stream Delta Event",
  "type": "object",
  "required": ["session_id", "delta", "sequence"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session identifier matching the session start event."
    },
    "delta": {
      "type": "string",
      "description": "Text fragment generated by the synthesis model. May be one or more tokens."
    },
    "sequence": {
      "type": "integer",
      "minimum": 0,
      "description": "Monotonically increasing sequence number for ordering deltas. Clients use this to detect gaps after reconnection."
    },
    "finish_reason": {
      "type": ["string", "null"],
      "enum": ["stop", "length", "content_filter", null],
      "description": "Reason the stream is finishing. Null while streaming is in progress. 'stop': natural completion. 'length': token limit reached. 'content_filter': content was filtered by safety systems."
    }
  },
  "additionalProperties": false
}
```

---

#### `tip.citation.found`

Emitted when the synthesis model references a specific context item. Enables progressive citation disclosure in the UI.

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "citation_id": "cite-001",
  "source_item_id": "ctx-financial-model",
  "source_item_title": "Q4 Financial Model",
  "excerpt": "Revenue concentration risk: top 3 clients represent 67% of ARR",
  "confidence": 0.94,
  "sequence": 2
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.citation.found",
  "title": "TIP Citation Found Event",
  "type": "object",
  "required": ["session_id", "citation_id", "source_item_id", "source_item_title", "confidence", "sequence"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session identifier."
    },
    "citation_id": {
      "type": "string",
      "description": "Unique identifier for this citation instance."
    },
    "source_item_id": {
      "type": "string",
      "description": "Context item ID from the Tez manifest that is being cited."
    },
    "source_item_title": {
      "type": "string",
      "description": "Human-readable title of the cited context item."
    },
    "excerpt": {
      "type": "string",
      "description": "Relevant excerpt from the source context item. May be omitted for brevity."
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Confidence that this citation is relevant to the current claim. Higher values indicate stronger relevance."
    },
    "sequence": {
      "type": "integer",
      "minimum": 0,
      "description": "Corresponds to the delta sequence number where this citation is referenced in the response."
    }
  },
  "additionalProperties": false
}
```

---

#### `tip.classification.update`

Emitted when the response classification changes during streaming. As the model processes more context, the classification may shift (e.g., from "preliminary" to "high_confidence").

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "classification": "high_confidence",
  "confidence": 0.89,
  "previous_classification": "preliminary",
  "reason": "Multiple corroborating sources found across financial model and market report"
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.classification.update",
  "title": "TIP Classification Update Event",
  "type": "object",
  "required": ["session_id", "classification", "confidence", "reason"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session identifier."
    },
    "classification": {
      "type": "string",
      "description": "Current classification label for the response (e.g., 'high_confidence', 'preliminary', 'insufficient_context')."
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Confidence in the current classification."
    },
    "previous_classification": {
      "type": ["string", "null"],
      "description": "The previous classification label, if this event represents a change. Null for the initial classification."
    },
    "reason": {
      "type": "string",
      "description": "Human-readable explanation for the classification or the reason it changed."
    }
  },
  "additionalProperties": false
}
```

---

#### `tip.stream.end`

Emitted once when the stream completes successfully. Contains final session metadata.

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "total_tokens": 87,
  "total_citations": 2,
  "duration_ms": 3420,
  "finish_reason": "stop",
  "ended_at": "2026-02-05T14:30:03.420Z"
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.stream.end",
  "title": "TIP Stream End Event",
  "type": "object",
  "required": ["session_id", "total_tokens", "total_citations", "duration_ms", "finish_reason", "ended_at"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session identifier."
    },
    "total_tokens": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of tokens generated during this stream."
    },
    "total_citations": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of citations found during this stream."
    },
    "duration_ms": {
      "type": "integer",
      "minimum": 0,
      "description": "Wall-clock duration of the complete stream in milliseconds."
    },
    "finish_reason": {
      "type": "string",
      "enum": ["stop", "length", "content_filter"],
      "description": "Reason the stream ended. 'stop': natural completion. 'length': token limit reached. 'content_filter': content was filtered."
    },
    "ended_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the stream ended."
    }
  },
  "additionalProperties": false
}
```

---

#### `tip.error`

Emitted when an error occurs during streaming. The stream may or may not continue after an error event, depending on the error type.

**Payload example:**

```json
{
  "session_id": "tip-sess-x1y2z3",
  "error_code": "rate_limited",
  "error_message": "Model rate limit exceeded. Please retry.",
  "recoverable": true,
  "retry_after_ms": 2000
}
```

**JSON Schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.streaming-interrogation/1.0.0/tip.error",
  "title": "TIP Error Event",
  "type": "object",
  "required": ["session_id", "error_code", "error_message", "recoverable"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session identifier."
    },
    "error_code": {
      "type": "string",
      "description": "Machine-readable error code. Standard codes: 'context_too_large', 'model_unavailable', 'rate_limited', 'authorization_failed', 'internal_error', 'timeout'."
    },
    "error_message": {
      "type": "string",
      "description": "Human-readable error description."
    },
    "recoverable": {
      "type": "boolean",
      "description": "Whether the error is recoverable. If true, the client SHOULD attempt reconnection using Last-Event-ID. If false, the session is terminated."
    },
    "retry_after_ms": {
      "type": ["integer", "null"],
      "minimum": 0,
      "description": "Suggested delay in milliseconds before the client retries. Null if the error is not recoverable."
    }
  },
  "additionalProperties": false
}
```

### Event Type Summary

| Event Type | Cardinality | Terminal | Description |
|------------|-------------|----------|-------------|
| `tip.session.start` | Exactly once | No | Session initialization |
| `tip.stream.delta` | One or more | No | Token content fragments |
| `tip.citation.found` | Zero or more | No | Citation discovery |
| `tip.classification.update` | Zero or more | No | Classification evolution |
| `tip.stream.end` | Exactly once | Yes | Successful completion |
| `tip.error` | Zero or more | Conditional | Error (terminal if `recoverable: false`) |

### Connection Lifecycle

The SSE connection follows a three-phase lifecycle:

#### 1. Open

The client opens an SSE connection to the TIP streaming endpoint:

```http
GET /tip/v1/stream?tez_id={tez_id}&query={query}
Accept: text/event-stream
Authorization: Bearer {token}
```

The server responds with:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-TIP-Session-Id: {session_id}
```

The first event is always `tip.session.start`.

#### 2. Stream

The server emits events in the following order:

1. `tip.session.start` (exactly once)
2. `tip.classification.update` (zero or more, as classification evolves)
3. `tip.stream.delta` (one or more, interleaved with citations and classifications)
4. `tip.citation.found` (zero or more, interleaved with deltas)
5. `tip.stream.end` (exactly once, terminal)

The server sends **heartbeat comments** every 15 seconds to keep the connection alive:

```
: heartbeat 2026-02-05T12:00:00Z
```

SSE comment lines (prefixed with `:`) are ignored by compliant clients but keep proxies and load balancers from closing idle connections.

#### 3. Close

The stream ends when the server emits `tip.stream.end` or `tip.error` with `recoverable: false`. The server then closes the connection. The client SHOULD NOT attempt reconnection after a clean `tip.stream.end`.

### Reconnection Protocol

If the connection drops unexpectedly (network failure, proxy timeout, server restart), the client reconnects using the standard SSE `Last-Event-ID` mechanism:

```http
GET /tip/v1/stream?tez_id={tez_id}&query={query}
Accept: text/event-stream
Authorization: Bearer {token}
Last-Event-ID: evt-042
```

The server MUST:

1. Locate the session associated with the original query
2. Resume the stream from the event **after** the `Last-Event-ID`
3. Replay any events the client missed, maintaining the original event IDs and sequence numbers

If the session has expired or cannot be resumed, the server responds with a `tip.error` event containing `error_code: "session_expired"` and `recoverable: false`.

**Reconnection backoff:** Clients SHOULD implement exponential backoff for reconnection attempts: 1s, 2s, 4s, 8s, up to a maximum of 30s. If the server provides `retry_after_ms` in a `tip.error` event, the client SHOULD use that value instead.

### Heartbeat Protocol

The server emits SSE comment lines as heartbeats at a fixed interval:

- **Default interval:** 15 seconds
- **Format:** `: heartbeat {ISO 8601 timestamp}`
- **Purpose:** Prevents intermediary proxies, load balancers, and firewalls from closing connections that appear idle

Clients SHOULD NOT rely on heartbeats for application logic. Heartbeats are purely a connection-keepalive mechanism.

If no heartbeat or data event is received within 45 seconds (3x the heartbeat interval), the client SHOULD assume the connection is dead and initiate reconnection.

## Examples

### Example 1: Complete streaming session

A full SSE event stream for a financial risk interrogation:

```
event: tip.session.start
id: evt-001
data: {"session_id":"tip-sess-x1y2z3","tez_id":"tez-quarterly-analysis","query":"What are the key financial risks?","model":"claude-opus-4-6","started_at":"2026-02-05T14:30:00Z"}

event: tip.classification.update
id: evt-002
data: {"session_id":"tip-sess-x1y2z3","classification":"preliminary","confidence":0.6,"previous_classification":null,"reason":"Initial classification based on query analysis"}

event: tip.stream.delta
id: evt-003
data: {"session_id":"tip-sess-x1y2z3","delta":"Based on the financial model","sequence":0,"finish_reason":null}

event: tip.stream.delta
id: evt-004
data: {"session_id":"tip-sess-x1y2z3","delta":" and market analysis, there are","sequence":1,"finish_reason":null}

event: tip.stream.delta
id: evt-005
data: {"session_id":"tip-sess-x1y2z3","delta":" three primary financial risks:","sequence":2,"finish_reason":null}

event: tip.citation.found
id: evt-006
data: {"session_id":"tip-sess-x1y2z3","citation_id":"cite-001","source_item_id":"ctx-financial-model","source_item_title":"Q4 Financial Model","excerpt":"Revenue concentration risk: top 3 clients represent 67% of ARR","confidence":0.94,"sequence":2}

event: tip.stream.delta
id: evt-007
data: {"session_id":"tip-sess-x1y2z3","delta":"\n\n1. **Revenue concentration** --","sequence":3,"finish_reason":null}

event: tip.stream.delta
id: evt-008
data: {"session_id":"tip-sess-x1y2z3","delta":" the top 3 clients represent 67% of ARR","sequence":4,"finish_reason":null}

: heartbeat 2026-02-05T14:30:15Z

event: tip.classification.update
id: evt-009
data: {"session_id":"tip-sess-x1y2z3","classification":"high_confidence","confidence":0.89,"previous_classification":"preliminary","reason":"Multiple corroborating sources found across financial model and market report"}

event: tip.citation.found
id: evt-010
data: {"session_id":"tip-sess-x1y2z3","citation_id":"cite-002","source_item_id":"ctx-market-report","source_item_title":"Market Analysis 2026","excerpt":"Market contraction expected in Q2 with 12% sector decline","confidence":0.87,"sequence":6}

event: tip.stream.delta
id: evt-011
data: {"session_id":"tip-sess-x1y2z3","delta":", creating significant exposure.\n\n2. **Market contraction**","sequence":5,"finish_reason":null}

event: tip.stream.delta
id: evt-012
data: {"session_id":"tip-sess-x1y2z3","delta":" -- a 12% sector decline is projected for Q2","sequence":6,"finish_reason":null}

event: tip.stream.delta
id: evt-013
data: {"session_id":"tip-sess-x1y2z3","delta":".\n\n3. **Regulatory risk** -- pending compliance requirements","sequence":7,"finish_reason":null}

event: tip.stream.delta
id: evt-014
data: {"session_id":"tip-sess-x1y2z3","delta":" may increase operating costs by 8-12%.","sequence":8,"finish_reason":"stop"}

event: tip.stream.end
id: evt-015
data: {"session_id":"tip-sess-x1y2z3","total_tokens":87,"total_citations":2,"duration_ms":3420,"finish_reason":"stop","ended_at":"2026-02-05T14:30:03.420Z"}
```

### Example 2: Error with recovery

A stream that encounters a rate limit and provides recovery instructions:

```
event: tip.session.start
id: evt-001
data: {"session_id":"tip-sess-err-demo","tez_id":"tez-large-corpus","query":"Summarize all findings","model":"claude-opus-4-6","started_at":"2026-02-05T15:00:00Z"}

event: tip.stream.delta
id: evt-002
data: {"session_id":"tip-sess-err-demo","delta":"The analysis reveals","sequence":0,"finish_reason":null}

event: tip.error
id: evt-003
data: {"session_id":"tip-sess-err-demo","error_code":"rate_limited","error_message":"Model rate limit exceeded. Please retry.","recoverable":true,"retry_after_ms":2000}
```

The client waits 2000ms and reconnects with `Last-Event-ID: evt-003`. The server resumes from `evt-004`.

### Example 3: Extension directory in a Tez bundle

```
quarterly-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   ├── financial-model.xlsx
│   └── market-report.md
└── extensions/
    └── com.ragu.streaming-interrogation/
        └── manifest.json
```

Note: This extension only includes `manifest.json` in the bundle (no data file), because it defines a protocol rather than stored data. Its presence signals that the hosting platform supports SSE streaming for TIP interrogation of this Tez.

## Compatibility Notes

- **Minimum protocol version:** 1.2. This extension builds on the TIP session model introduced in protocol version 1.2.
- **Graceful degradation:** Implementations that do not support this extension ignore the `com.ragu.streaming-interrogation/` directory entirely. The Tez remains fully functional -- interrogation falls back to the standard request-response TIP pattern. No content is lost. Clients SHOULD check for the extension's presence in the Tez manifest before attempting to open an SSE connection; if absent, use the standard synchronous TIP endpoint.
- **Conflicts:** None. This extension is an alternative transport for TIP interrogation, not a replacement. The same Tez can be interrogated via both the standard synchronous endpoint and the streaming endpoint.
- **Dependencies:** Requires an SSE-capable HTTP server and client. Most modern web frameworks and browsers support SSE natively. The extension does not require WebSocket support.
- **Proxy compatibility:** The heartbeat protocol is designed to work with reverse proxies (nginx, AWS ALB, Cloudflare) that may timeout idle connections. The 15-second heartbeat interval is well within the default idle timeouts of most proxies (typically 60-120 seconds).

## Migration Notes

This extension is a candidate for standardization as `tezit-streaming`. The migration path:

1. **Event type namespace:** The standard extension would rename event types from `tip.*` to `tezit.stream.*` to align with the standard extension naming convention (e.g., `tezit.stream.session.start`, `tezit.stream.delta`).
2. **Schema preservation:** The event payload schemas would be adopted with minimal changes. The `session_id` and `sequence` fields would be preserved as-is.
3. **Transport agnosticism:** The standard extension may define the event semantics independently of SSE, allowing implementations to use SSE, WebSocket, or other streaming transports. The vendor extension is SSE-specific; the standard extension would be transport-agnostic with SSE as the recommended default.
4. **Backward compatibility:** During the transition period, implementations SHOULD support both the `tip.*` and `tezit.stream.*` event type prefixes. Clients SHOULD prefer the standard prefix when available.
5. **A Tez bundle SHOULD NOT include both** `com.ragu.streaming-interrogation` and `tezit-streaming` simultaneously. During migration, prefer the standard extension.
