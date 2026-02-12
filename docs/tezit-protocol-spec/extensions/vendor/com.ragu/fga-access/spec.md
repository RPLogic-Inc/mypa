# com.ragu.fga-access

| Field | Value |
|-------|-------|
| **Extension ID** | `com.ragu.fga-access` |
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Ragu Platform |
| **Minimum Protocol Version** | 1.2 |
| **Standardization Target** | Under consideration |
| **TIP Enterprise Addendum** | Section 3 |

## Purpose

The Tezit Protocol treats a Tez as an atomic unit -- all recipients see the same context, synthesis, and citations. This works well for many use cases, but enterprise environments frequently require **differential access**: a board member sees the full financial model, a department lead sees only their division's data, and an external auditor sees redacted summaries. Without fine-grained access control at the Tez level, platforms must maintain separate copies of the same analysis for different audiences, leading to version drift and duplication.

The `com.ragu.fga-access` extension integrates [OpenFGA](https://openfga.dev/) (an open-source implementation of Google's Zanzibar authorization model) directly into tezits. It enables:

- **Per-context-item access control:** Individual context items within a Tez can have distinct access rules. A financial model may be restricted to `owner` and `editor` relations, while a public market report is accessible to all `viewer` relations.
- **Per-section access control:** Synthesis sections can be gated independently, allowing the same Tez to present different levels of detail to different recipients.
- **Per-finding access control:** Individual findings or conclusions can be restricted based on sensitivity classification.
- **Relation-based authorization:** Uses OpenFGA's tuple-based model (`user#relation@object`) to express arbitrarily complex authorization rules, including role hierarchies, team membership, and conditional access.
- **Configurable enforcement modes:** Platforms can operate in `strict` mode (unauthorized content is hidden), `permissive` mode (unauthorized content is shown with warnings), or `audit_only` mode (all content is shown but access violations are logged).

This extension is particularly valuable for:

- **Regulated industries** where information barriers (Chinese walls) must be enforced within shared analysis
- **Multi-stakeholder tezits** where different recipients have different clearance levels
- **Audit compliance** where access patterns must be logged and reviewable
- **Cross-functional teams** where financial, legal, and technical content has different distribution rules

## Schema

The extension data is stored in `fga-access.json` within the extension directory of a Tez bundle:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── com.ragu.fga-access/
        ├── manifest.json
        └── fga-access.json
```

### Extension Manifest

```json
{
  "extension_id": "com.ragu.fga-access",
  "extension_version": "1.0.0",
  "name": "FGA Access",
  "description": "Fine-grained access control within tezits using OpenFGA relation-based authorization",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/vendor/com.ragu/fga-access"
}
```

### JSON Schema: `fga-access.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.fga-access/1.0.0",
  "title": "FGA Access",
  "description": "Fine-grained access control within tezits using OpenFGA.",
  "type": "object",
  "required": [
    "authorization_model_id",
    "store_id",
    "access_rules",
    "enforcement_mode"
  ],
  "properties": {
    "authorization_model_id": {
      "type": "string",
      "description": "The OpenFGA authorization model ID that defines the type system and relations used by this Tez's access rules. This model must be registered in the platform's OpenFGA store."
    },
    "store_id": {
      "type": "string",
      "description": "The OpenFGA store ID where authorization tuples are maintained. Each platform instance typically has one store."
    },
    "access_rules": {
      "type": "array",
      "description": "Ordered list of access rules governing content within this Tez. Rules are evaluated in order; the first matching rule applies.",
      "items": {
        "type": "object",
        "required": ["resource_type", "resource_id", "relation"],
        "properties": {
          "resource_type": {
            "type": "string",
            "enum": ["context_item", "section", "finding"],
            "description": "The type of resource this rule applies to. 'context_item' targets individual context files; 'section' targets synthesis sections; 'finding' targets individual findings or conclusions."
          },
          "resource_id": {
            "type": "string",
            "description": "Identifier of the specific resource. For context_item, this matches the item ID in the Tez manifest. For section, this matches the section identifier in the synthesis. For finding, this matches the finding ID."
          },
          "relation": {
            "type": "string",
            "enum": ["viewer", "editor", "owner"],
            "description": "The minimum OpenFGA relation required to access this resource. Relations form a hierarchy: owner > editor > viewer. A user with 'owner' relation can access resources requiring 'viewer' or 'editor'."
          },
          "conditions": {
            "type": "object",
            "description": "Optional conditions that further restrict access beyond the relation check. Conditions are evaluated as a conjunction (all must be true).",
            "properties": {
              "time_bound": {
                "type": "object",
                "description": "Time-based access restriction.",
                "properties": {
                  "not_before": {
                    "type": "string",
                    "format": "date-time",
                    "description": "Access is denied before this ISO 8601 timestamp."
                  },
                  "not_after": {
                    "type": "string",
                    "format": "date-time",
                    "description": "Access is denied after this ISO 8601 timestamp."
                  }
                },
                "additionalProperties": false
              },
              "ip_allowlist": {
                "type": "array",
                "description": "Access is only granted from these CIDR ranges.",
                "items": {
                  "type": "string"
                }
              },
              "mfa_required": {
                "type": "boolean",
                "description": "Whether multi-factor authentication is required for this access rule."
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    },
    "context_item_access": {
      "type": "object",
      "description": "Mapping of context item IDs to their resolved access metadata. This is a denormalized view for efficient runtime lookups.",
      "additionalProperties": {
        "type": "object",
        "required": ["allowed_relations", "tuple_key"],
        "properties": {
          "allowed_relations": {
            "type": "array",
            "description": "List of OpenFGA relations that grant access to this context item.",
            "items": {
              "type": "string",
              "enum": ["viewer", "editor", "owner"]
            }
          },
          "tuple_key": {
            "type": "object",
            "description": "The OpenFGA tuple key used to check authorization for this item.",
            "required": ["object", "relation"],
            "properties": {
              "object": {
                "type": "string",
                "description": "The OpenFGA object identifier (e.g., 'context_item:ctx-financial-model')."
              },
              "relation": {
                "type": "string",
                "description": "The OpenFGA relation to check (e.g., 'viewer')."
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    },
    "enforcement_mode": {
      "type": "string",
      "enum": ["strict", "permissive", "audit_only"],
      "description": "How access rules are enforced. 'strict': unauthorized content is hidden entirely. 'permissive': unauthorized content is shown with a warning banner indicating the user lacks full access. 'audit_only': all content is shown but access violations are logged for compliance review."
    }
  },
  "additionalProperties": false
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorization_model_id` | string | Yes | OpenFGA authorization model ID |
| `store_id` | string | Yes | OpenFGA store ID |
| `access_rules` | array | Yes | Ordered list of access rules |
| `access_rules[].resource_type` | enum | Yes | `context_item`, `section`, or `finding` |
| `access_rules[].resource_id` | string | Yes | Resource identifier matching Tez manifest |
| `access_rules[].relation` | enum | Yes | Minimum relation: `viewer`, `editor`, `owner` |
| `access_rules[].conditions` | object | No | Additional access conditions |
| `access_rules[].conditions.time_bound` | object | No | Temporal access restriction |
| `access_rules[].conditions.ip_allowlist` | array | No | Allowed CIDR ranges |
| `access_rules[].conditions.mfa_required` | boolean | No | MFA requirement |
| `context_item_access` | object | No | Denormalized per-item access metadata |
| `context_item_access.{id}.allowed_relations` | array | Yes | Relations granting access |
| `context_item_access.{id}.tuple_key` | object | Yes | OpenFGA tuple key for auth checks |
| `enforcement_mode` | enum | Yes | `strict`, `permissive`, or `audit_only` |

## Examples

### Example 1: Multi-stakeholder due diligence Tez

A due diligence tez where the financial model is restricted to partners, the market report is available to all analysts, and the customer data requires MFA:

```json
{
  "authorization_model_id": "01HXYZ-model-dd-2026",
  "store_id": "01HXYZ-store-ragu-prod",
  "access_rules": [
    {
      "resource_type": "context_item",
      "resource_id": "ctx-financial-model",
      "relation": "owner",
      "conditions": {
        "mfa_required": true
      }
    },
    {
      "resource_type": "context_item",
      "resource_id": "ctx-customer-data",
      "relation": "editor",
      "conditions": {
        "mfa_required": true,
        "ip_allowlist": ["10.0.0.0/8", "172.16.0.0/12"]
      }
    },
    {
      "resource_type": "context_item",
      "resource_id": "ctx-market-report",
      "relation": "viewer"
    },
    {
      "resource_type": "section",
      "resource_id": "section-executive-summary",
      "relation": "viewer"
    },
    {
      "resource_type": "section",
      "resource_id": "section-financial-analysis",
      "relation": "owner"
    },
    {
      "resource_type": "finding",
      "resource_id": "finding-valuation-range",
      "relation": "owner"
    }
  ],
  "context_item_access": {
    "ctx-financial-model": {
      "allowed_relations": ["owner"],
      "tuple_key": {
        "object": "context_item:ctx-financial-model",
        "relation": "owner"
      }
    },
    "ctx-customer-data": {
      "allowed_relations": ["editor", "owner"],
      "tuple_key": {
        "object": "context_item:ctx-customer-data",
        "relation": "editor"
      }
    },
    "ctx-market-report": {
      "allowed_relations": ["viewer", "editor", "owner"],
      "tuple_key": {
        "object": "context_item:ctx-market-report",
        "relation": "viewer"
      }
    }
  },
  "enforcement_mode": "strict"
}
```

### Example 2: Audit-only mode for compliance review

A tez where all content is visible but access violations are logged:

```json
{
  "authorization_model_id": "01HXYZ-model-audit-2026",
  "store_id": "01HXYZ-store-ragu-prod",
  "access_rules": [
    {
      "resource_type": "context_item",
      "resource_id": "ctx-sensitive-report",
      "relation": "editor"
    },
    {
      "resource_type": "context_item",
      "resource_id": "ctx-public-data",
      "relation": "viewer"
    }
  ],
  "enforcement_mode": "audit_only"
}
```

### Example 3: Time-bounded access

A tez where access to findings expires after a specific date:

```json
{
  "authorization_model_id": "01HXYZ-model-temp-2026",
  "store_id": "01HXYZ-store-ragu-prod",
  "access_rules": [
    {
      "resource_type": "finding",
      "resource_id": "finding-preliminary-valuation",
      "relation": "viewer",
      "conditions": {
        "time_bound": {
          "not_before": "2026-01-01T00:00:00Z",
          "not_after": "2026-06-30T23:59:59Z"
        }
      }
    }
  ],
  "enforcement_mode": "strict"
}
```

### Example 4: Extension directory in a Tez bundle

```
quarterly-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   ├── financial-model.xlsx
│   ├── customer-data.csv
│   └── market-report.md
└── extensions/
    └── com.ragu.fga-access/
        ├── manifest.json
        └── fga-access.json
```

## Compatibility Notes

- **Minimum protocol version:** 1.2. This extension uses context item identifiers and section identifiers introduced in protocol version 1.2.
- **Graceful degradation:** Implementations that do not support this extension ignore the `com.ragu.fga-access/` directory entirely. The Tez remains fully functional -- **all content is accessible to all recipients** as if no access rules were defined. This is by design: the extension restricts access on platforms that support it, but does not break portability. Platforms receiving a Tez with FGA access rules that they cannot enforce SHOULD log a warning.
- **Conflicts:** This extension may interact with `tezit-encryption`. If both are present, the encryption extension gates access at the cryptographic layer while FGA gates access at the authorization layer. Implementations SHOULD enforce both: a user must have both the decryption key (via `tezit-encryption`) AND the required relation (via `com.ragu.fga-access`).
- **Dependencies:** Requires an OpenFGA-compatible authorization service at runtime. The extension data is self-contained within the Tez bundle, but enforcement requires connectivity to the OpenFGA store identified by `store_id`.

## Migration Notes

This extension is under consideration for standardization. The migration path is more complex than other Ragu vendor extensions because FGA access depends on OpenFGA, which is a specific authorization system. Standardization would likely require:

1. **Abstraction:** The standard extension would define access rules in a vendor-neutral format, with OpenFGA as one supported backend. Other backends (OPA, Cedar, custom RBAC) would be supported through adapter interfaces.
2. **Core schema preservation:** The `access_rules` array structure and `enforcement_mode` enum would be preserved in the standard extension. The `authorization_model_id`, `store_id`, and `tuple_key` fields would move into a vendor-specific adapter configuration.
3. **Intermediate step:** Platforms implementing OpenFGA can adopt the standard extension with an OpenFGA adapter, preserving full compatibility with existing `com.ragu.fga-access` data.
4. **A Tez bundle SHOULD NOT include both** `com.ragu.fga-access` and its future standard equivalent simultaneously.
