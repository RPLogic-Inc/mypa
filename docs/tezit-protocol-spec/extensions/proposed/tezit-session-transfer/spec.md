# tezit-session-transfer: Interrogation Session Transfer

**Extension ID:** `tezit-session-transfer`
**Extension Version:** 1.0
**Status:** Proposed
**Proposed by:** Ragu Platform
**Minimum Protocol Version:** Tezit Protocol v1.3

---

## Purpose

When a recipient interrogates a Tez and then reshares it, the next recipient benefits from knowing what questions were already asked. Without session transfer, every new recipient starts from scratch -- asking the same foundational questions, exploring the same lines of inquiry, and duplicating effort that has already been done.

Session transfer solves this by allowing interrogation sessions to travel with a Tez as it is reshared. The key scenarios are:

1. **Analyst handoff.** An analyst interrogates a research Tez, forms conclusions, then passes the Tez to a colleague. The colleague can see what was already asked, skip redundant questions, and focus on unexplored areas.
2. **Multi-hop sharing.** A Tez passes through several people in a chain. Each person's interrogation builds on the previous, creating a cumulative knowledge trail.
3. **Team onboarding.** A team lead interrogates a Tez to extract key insights, then shares it with the team. Team members benefit from the lead's curated interrogation without repeating it.

Session transfer is **consent-gated** -- the original interrogator must explicitly grant permission for their session to be transferred. The extension supports three scopes of transfer (full transcripts, summaries only, or questions only) and includes privacy controls for metadata stripping and attribution.

---

## Schema

### Extension Manifest

The extension manifest file is placed at `extensions/tezit-session-transfer/manifest.json` within the Tez bundle:

```json
{
  "extension_id": "tezit-session-transfer",
  "extension_version": "1.0",
  "name": "Interrogation Session Transfer",
  "description": "Share interrogation sessions when resharing tezits",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/proposed/tezit-session-transfer"
}
```

### Session Transfer Object

The session transfer data is stored in `manifest.session_transfer` within the Tez's root `manifest.json`. The complete JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TezitSessionTransfer",
  "description": "Interrogation session transfer for reshared tezits",
  "type": "object",
  "required": ["scope", "consent", "sessions"],
  "properties": {
    "scope": {
      "type": "string",
      "enum": ["full", "summary", "questions_only"],
      "description": "The level of detail included in transferred sessions. 'full' includes complete query/response transcripts. 'summary' includes a generated summary of each session. 'questions_only' includes only the query text without responses."
    },
    "consent": {
      "type": "object",
      "required": ["granted_by", "granted_at"],
      "properties": {
        "granted_by": {
          "type": "string",
          "description": "Identifier of the person or system that granted consent for session transfer. Format is implementation-defined (email, username, or opaque ID)."
        },
        "granted_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when consent was granted."
        },
        "revocable": {
          "type": "boolean",
          "default": true,
          "description": "Whether the consent can be revoked after transfer. If true, the original interrogator can request that downstream copies remove the session data. Revocation is best-effort -- implementations SHOULD honor revocation requests but cannot guarantee removal from all copies."
        }
      },
      "description": "Consent metadata proving that the session owner authorized the transfer."
    },
    "sessions": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/TransferredSession"
      },
      "minItems": 1,
      "description": "Array of transferred interrogation sessions."
    },
    "privacy": {
      "type": "object",
      "properties": {
        "strip_metadata": {
          "type": "boolean",
          "default": false,
          "description": "If true, implementation-specific metadata (IP addresses, client info, timing data) has been stripped from the session data before transfer."
        },
        "attribution": {
          "type": "string",
          "enum": ["none", "pseudonymous", "named"],
          "default": "named",
          "description": "How the interrogator is identified in the transferred session. 'none' removes all identity. 'pseudonymous' uses a stable but non-identifying label. 'named' includes the interrogator's display name."
        }
      },
      "description": "Privacy controls governing how session data is presented to downstream recipients."
    },
    "transfer_chain": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["transferred_at"],
        "properties": {
          "from": {
            "type": "string",
            "description": "Identifier of the sender in this transfer hop. May be omitted if privacy.attribution is 'none'."
          },
          "to": {
            "type": "string",
            "description": "Identifier of the recipient in this transfer hop. May be omitted if privacy.attribution is 'none'."
          },
          "transferred_at": {
            "type": "string",
            "format": "date-time",
            "description": "ISO 8601 timestamp of when this transfer occurred."
          },
          "scope_at_transfer": {
            "type": "string",
            "enum": ["full", "summary", "questions_only"],
            "description": "The scope that was active at the time of this transfer. Scope can only be narrowed (full -> summary -> questions_only), never widened."
          }
        }
      },
      "description": "Ordered array tracking each reshare hop. The first entry is the original transfer; subsequent entries record downstream reshares. Used for audit trails and understanding provenance."
    }
  },
  "additionalProperties": false,
  "$defs": {
    "TransferredSession": {
      "type": "object",
      "required": ["session_id", "query_count", "created_at"],
      "properties": {
        "session_id": {
          "type": "string",
          "description": "Unique identifier for this interrogation session. Format is implementation-defined (UUID recommended)."
        },
        "query_count": {
          "type": "integer",
          "minimum": 0,
          "description": "Total number of queries in this session."
        },
        "created_at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when the session was created."
        },
        "interrogator": {
          "type": "string",
          "description": "Display name or pseudonym of the person who conducted this session. Omitted when privacy.attribution is 'none'."
        },
        "summary": {
          "type": "string",
          "description": "Human-readable summary of the session's interrogation. Present when scope is 'summary'. Typically 2-5 sentences describing what was explored and what was concluded."
        },
        "queries": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/TransferredQuery"
          },
          "description": "Array of individual queries from the session. Present when scope is 'full' or 'questions_only'."
        }
      }
    },
    "TransferredQuery": {
      "type": "object",
      "required": ["query_text"],
      "properties": {
        "query_text": {
          "type": "string",
          "description": "The question or prompt that was submitted during interrogation."
        },
        "response_text": {
          "type": "string",
          "description": "The response generated by the interrogation system. Omitted when scope is 'questions_only'."
        },
        "classification": {
          "type": "string",
          "enum": ["factual", "analytical", "exploratory", "clarification", "meta"],
          "description": "The type of query. 'factual' seeks specific facts. 'analytical' requests analysis or comparison. 'exploratory' probes new areas. 'clarification' follows up on a previous response. 'meta' asks about the Tez itself."
        },
        "citations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "context_item_id": {
                "type": "string",
                "description": "ID of the context item that was cited in the response."
              },
              "excerpt": {
                "type": "string",
                "description": "Brief excerpt from the cited context item."
              }
            }
          },
          "description": "Context items cited in the response. Helps downstream recipients understand which parts of the context have been explored."
        }
      }
    }
  }
}
```

### Field Summary

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | enum | Yes | Transfer detail level: `full`, `summary`, or `questions_only`. |
| `consent` | object | Yes | Proof of transfer authorization. |
| `consent.granted_by` | string | Yes | Who authorized the transfer. |
| `consent.granted_at` | string (ISO 8601) | Yes | When consent was given. |
| `consent.revocable` | boolean | No | Whether consent can be withdrawn (default: true). |
| `sessions` | array | Yes | The transferred interrogation sessions. |
| `privacy` | object | No | Privacy controls for the transfer. |
| `privacy.strip_metadata` | boolean | No | Whether implementation metadata was stripped (default: false). |
| `privacy.attribution` | enum | No | Identity level: `none`, `pseudonymous`, or `named` (default: named). |
| `transfer_chain` | array | No | Ordered record of each reshare hop. |

### Scope Narrowing Rule

Scope can only be **narrowed** on reshare, never widened:
- `full` can be narrowed to `summary` or `questions_only`
- `summary` can be narrowed to `questions_only`
- `questions_only` cannot be narrowed further

This ensures that downstream recipients never see more detail than the original consent permitted. Implementations MUST enforce this rule when a recipient reshares with session transfer.

---

## Examples

### Example 1: Full Scope Transfer

A complete transcript is shared, including questions, responses, classifications, and citations:

```json
{
  "session_transfer": {
    "scope": "full",
    "consent": {
      "granted_by": "alex.thompson@acme.com",
      "granted_at": "2026-01-20T14:30:00Z",
      "revocable": true
    },
    "sessions": [
      {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "query_count": 3,
        "created_at": "2026-01-20T10:00:00Z",
        "interrogator": "Alex Thompson",
        "queries": [
          {
            "query_text": "What were the key revenue drivers in Q4?",
            "response_text": "Based on the earnings report, Q4 revenue was primarily driven by three factors: (1) a 23% increase in enterprise subscription renewals, (2) expansion into the APAC market contributing $4.2M in new revenue, and (3) the launch of the Pro tier which converted 15% of free users.",
            "classification": "factual",
            "citations": [
              {
                "context_item_id": "q4-report",
                "excerpt": "Enterprise renewals increased 23% YoY..."
              },
              {
                "context_item_id": "q4-report",
                "excerpt": "APAC expansion contributed $4.2M..."
              }
            ]
          },
          {
            "query_text": "How does this compare to competitors in the same period?",
            "response_text": "The market comparison data shows Acme outperformed the sector average of 12% growth, with their 23% enterprise growth rate placing them second behind only TechCorp (31%). However, Acme's APAC expansion is unique in this cohort -- no direct competitor entered APAC in Q4.",
            "classification": "analytical",
            "citations": [
              {
                "context_item_id": "market-data",
                "excerpt": "Sector average growth: 12%. TechCorp: 31%, Acme: 23%..."
              }
            ]
          },
          {
            "query_text": "Are there any risks mentioned in the forward-looking statements?",
            "response_text": "The report identifies three key risks: (1) currency exposure from APAC revenue (JPY and AUD volatility), (2) potential enterprise churn if the economic slowdown continues into Q1, and (3) regulatory uncertainty around data localization requirements in the EU that could increase infrastructure costs.",
            "classification": "exploratory",
            "citations": [
              {
                "context_item_id": "q4-report",
                "excerpt": "Forward-looking risks include currency exposure..."
              }
            ]
          }
        ]
      }
    ],
    "privacy": {
      "strip_metadata": false,
      "attribution": "named"
    },
    "transfer_chain": [
      {
        "from": "alex.thompson@acme.com",
        "to": "maria.garcia@acme.com",
        "transferred_at": "2026-01-20T14:32:00Z",
        "scope_at_transfer": "full"
      }
    ]
  }
}
```

### Example 2: Summary Scope Transfer

Only a generated summary is included, without individual queries:

```json
{
  "session_transfer": {
    "scope": "summary",
    "consent": {
      "granted_by": "alex.thompson@acme.com",
      "granted_at": "2026-01-20T14:30:00Z",
      "revocable": true
    },
    "sessions": [
      {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "query_count": 3,
        "created_at": "2026-01-20T10:00:00Z",
        "interrogator": "Alex Thompson",
        "summary": "Alex explored three main areas: (1) Q4 revenue drivers, finding that enterprise renewals (+23%) and APAC expansion ($4.2M) were the primary contributors; (2) competitive positioning, noting Acme outperformed the 12% sector average but trailed TechCorp at 31%; (3) forward-looking risks, identifying currency exposure, potential enterprise churn, and EU data localization as the key concerns."
      }
    ],
    "privacy": {
      "strip_metadata": true,
      "attribution": "named"
    },
    "transfer_chain": [
      {
        "from": "alex.thompson@acme.com",
        "to": "finance-team@acme.com",
        "transferred_at": "2026-01-20T15:00:00Z",
        "scope_at_transfer": "summary"
      }
    ]
  }
}
```

### Example 3: Questions-Only Scope Transfer

Only the question text is included -- no responses, no summaries. This is the most privacy-preserving transfer mode while still communicating what areas have been explored:

```json
{
  "session_transfer": {
    "scope": "questions_only",
    "consent": {
      "granted_by": "user-7a3b",
      "granted_at": "2026-01-20T14:30:00Z",
      "revocable": false
    },
    "sessions": [
      {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "query_count": 3,
        "created_at": "2026-01-20T10:00:00Z",
        "queries": [
          {
            "query_text": "What were the key revenue drivers in Q4?",
            "classification": "factual"
          },
          {
            "query_text": "How does this compare to competitors in the same period?",
            "classification": "analytical"
          },
          {
            "query_text": "Are there any risks mentioned in the forward-looking statements?",
            "classification": "exploratory"
          }
        ]
      }
    ],
    "privacy": {
      "strip_metadata": true,
      "attribution": "pseudonymous"
    },
    "transfer_chain": [
      {
        "from": "user-7a3b",
        "to": "user-9c1d",
        "transferred_at": "2026-01-20T16:00:00Z",
        "scope_at_transfer": "questions_only"
      }
    ]
  }
}
```

### Example 4: Multi-Hop Transfer Chain

A Tez that has been reshared multiple times, with scope narrowing at each hop:

```json
{
  "session_transfer": {
    "scope": "questions_only",
    "consent": {
      "granted_by": "alex.thompson@acme.com",
      "granted_at": "2026-01-20T14:30:00Z",
      "revocable": true
    },
    "sessions": [
      {
        "session_id": "550e8400-e29b-41d4-a716-446655440000",
        "query_count": 3,
        "created_at": "2026-01-20T10:00:00Z",
        "queries": [
          {
            "query_text": "What were the key revenue drivers in Q4?",
            "classification": "factual"
          },
          {
            "query_text": "How does this compare to competitors in the same period?",
            "classification": "analytical"
          },
          {
            "query_text": "Are there any risks mentioned in the forward-looking statements?",
            "classification": "exploratory"
          }
        ]
      },
      {
        "session_id": "661f9511-f3ac-52e5-b827-557766551111",
        "query_count": 2,
        "created_at": "2026-01-21T09:00:00Z",
        "queries": [
          {
            "query_text": "What is the projected impact of EU data localization on margins?",
            "classification": "analytical"
          },
          {
            "query_text": "Which APAC markets showed the strongest traction?",
            "classification": "factual"
          }
        ]
      }
    ],
    "privacy": {
      "strip_metadata": true,
      "attribution": "none"
    },
    "transfer_chain": [
      {
        "transferred_at": "2026-01-20T14:32:00Z",
        "scope_at_transfer": "full"
      },
      {
        "transferred_at": "2026-01-21T11:00:00Z",
        "scope_at_transfer": "summary"
      },
      {
        "transferred_at": "2026-01-22T08:00:00Z",
        "scope_at_transfer": "questions_only"
      }
    ]
  }
}
```

Note: In this example, `privacy.attribution` is `"none"`, so the `from` and `to` fields are omitted from the transfer chain, and `interrogator` is omitted from sessions.

---

## Implementation Guidance

### Presenting Transferred Sessions to Recipients

Implementations SHOULD present transferred sessions in a way that clearly distinguishes them from the recipient's own interrogation:

- **Visual separation.** Transferred sessions should appear in a distinct section (e.g., "Previous Interrogation" or "Shared Questions") separate from the recipient's own session.
- **Scope indication.** The UI should clearly indicate the transfer scope so the recipient understands the level of detail available.
- **Exploration gaps.** Implementations MAY analyze transferred queries and suggest areas of the context that have not yet been interrogated, helping recipients identify unexplored territory.

### Consent Collection

When an interrogator reshares a Tez, the implementation MUST:

1. Ask whether to include session data in the transfer.
2. If yes, offer the three scope options (full, summary, questions_only).
3. Offer privacy controls (attribution level, metadata stripping).
4. Record the consent with a timestamp.

### Revocation

When `consent.revocable` is true and the original interrogator requests revocation:

1. The implementation SHOULD remove the session transfer data from its local copy of the Tez.
2. The implementation SHOULD propagate the revocation request to known downstream recipients.
3. Revocation is **best-effort** -- implementations cannot guarantee removal from all copies that have already been distributed.

---

## Compatibility Notes

### Minimum Protocol Version

This extension requires **Tezit Protocol v1.3** or later.

### Graceful Degradation

When an implementation does not support the `tezit-session-transfer` extension:

- The Tez remains fully functional. All context items, synthesis, and interrogation capabilities work without modification.
- The `session_transfer` field in the manifest is ignored as an unrecognized key.
- The `extensions/tezit-session-transfer/` directory within the bundle is ignored.
- Recipients can interrogate the Tez normally; they simply do not have access to prior session data.

### Conflicts

- **`tezit-analytics`:** Compatible. Session transfer data is separate from analytics tracking. However, implementations SHOULD NOT double-count transferred session queries in analytics metrics (transferred queries were generated by a different user on a different platform instance).
- **`tezit-encryption`:** Compatible. When both are present, session transfer data SHOULD be encrypted along with other bundle contents. Transferred sessions may contain sensitive interrogation details.
- **`tezit-signatures`:** Compatible. If the Tez is signed, adding session transfer data on reshare will invalidate the original signature. Implementations SHOULD re-sign the bundle after adding session transfer data, or clearly indicate that the signature applies to the original bundle without the session data.

### Migration

This is a new extension with no predecessor. Platforms that have proprietary session-sharing features should map their data model to this schema when exporting tezits.

### Privacy Considerations

Session transfer involves sharing one person's interrogation activity with another. Implementations MUST:

- Never transfer session data without explicit consent from the interrogator.
- Respect the attribution level chosen by the interrogator.
- Honor revocation requests on a best-effort basis.
- Clearly indicate to recipients that transferred sessions originated from another person.

Implementations SHOULD:

- Default to the most privacy-preserving options (questions_only scope, pseudonymous attribution).
- Provide a way for recipients to delete transferred session data from their local copy.
- Log transfer events for audit purposes.
