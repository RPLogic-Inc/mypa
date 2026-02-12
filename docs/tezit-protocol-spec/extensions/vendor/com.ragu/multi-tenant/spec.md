# com.ragu.multi-tenant

| Field | Value |
|-------|-------|
| **Extension ID** | `com.ragu.multi-tenant` |
| **Version** | 1.0.0 |
| **Status** | Active |
| **Author** | Ragu Platform |
| **Minimum Protocol Version** | 1.2 |
| **Standardization Target** | Under consideration |
| **TIP Enterprise Addendum** | Section 6 |

## Purpose

Enterprise AI platforms are typically multi-tenant: multiple organizations share the same infrastructure while their data remains isolated. When tezits need to cross tenant boundaries -- a consulting firm shares analysis with a client, a parent company distributes insights to subsidiaries, or a platform vendor provides curated knowledge bundles to customers -- the Tez must carry metadata about its tenancy context. Without this metadata, receiving platforms cannot enforce isolation boundaries, track data provenance across organizations, or comply with data residency requirements.

The `com.ragu.multi-tenant` extension embeds tenant isolation metadata within tezits, enabling:

- **Source identification:** Every Tez explicitly declares which tenant created it, providing an immutable provenance record that survives sharing and replication.
- **Target access control:** The extension specifies which tenants may receive the Tez and at what access level (full content, filtered subset, or summary only).
- **Isolation boundary enforcement:** Platforms can enforce different isolation levels -- strict isolation (no shared state), shared context (context items may be referenced across tenants), or shared synthesis (synthesis may cite cross-tenant context).
- **Cross-tenant strategy:** When a Tez depends on data from another tenant's Tez, the extension specifies how that dependency is managed: accepted as a live reference, snapshot-replicated at share time, or replicated with ongoing synchronization.
- **Data residency compliance:** The extension records the geographic region and compliance framework governing the Tez's storage and processing, enabling platforms to enforce data sovereignty rules.

Use cases include:

- **Consulting firms** sharing analysis tezits with clients while maintaining firm-side context isolation
- **Platform vendors** distributing curated knowledge bundles across their customer base
- **Enterprise groups** where subsidiaries share tezits within a corporate hierarchy
- **Compliance-sensitive environments** where data residency (GDPR, SOC 2, HIPAA) must be tracked per-tez

## Schema

The extension data is stored in `multi-tenant.json` within the extension directory of a Tez bundle:

```
my-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   └── ...
└── extensions/
    └── com.ragu.multi-tenant/
        ├── manifest.json
        └── multi-tenant.json
```

### Extension Manifest

```json
{
  "extension_id": "com.ragu.multi-tenant",
  "extension_version": "1.0.0",
  "name": "Multi-Tenant",
  "description": "Tenant isolation metadata for multi-tenant platforms sharing tezits across organizational boundaries",
  "author": "Ragu Platform",
  "url": "https://github.com/tezit-protocol/spec/extensions/vendor/com.ragu/multi-tenant"
}
```

### JSON Schema: `multi-tenant.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/schemas/vendor/com.ragu.multi-tenant/1.0.0",
  "title": "Multi-Tenant",
  "description": "Tenant isolation metadata for multi-tenant platforms sharing tezits.",
  "type": "object",
  "required": [
    "source_tenant",
    "target_tenants",
    "isolation_boundary",
    "cross_tenant_strategy"
  ],
  "properties": {
    "source_tenant": {
      "type": "object",
      "description": "The tenant that created and owns this Tez.",
      "required": ["tenant_id", "tenant_name", "platform"],
      "properties": {
        "tenant_id": {
          "type": "string",
          "description": "Globally unique identifier for the source tenant. Format is platform-specific but must be stable across time."
        },
        "tenant_name": {
          "type": "string",
          "description": "Human-readable name of the source tenant organization."
        },
        "platform": {
          "type": "string",
          "description": "Identifier of the platform hosting the source tenant (e.g., 'ragu', 'mypa.chat', 'custom-enterprise'). Enables cross-platform tenant resolution."
        }
      },
      "additionalProperties": false
    },
    "target_tenants": {
      "type": "array",
      "description": "List of tenants authorized to receive this Tez, along with their access levels. An empty array means the Tez is private to the source tenant.",
      "items": {
        "type": "object",
        "required": ["tenant_id", "tenant_name", "access_level"],
        "properties": {
          "tenant_id": {
            "type": "string",
            "description": "Globally unique identifier for the target tenant."
          },
          "tenant_name": {
            "type": "string",
            "description": "Human-readable name of the target tenant organization."
          },
          "access_level": {
            "type": "string",
            "enum": ["full", "filtered", "summary"],
            "description": "Access level granted to this target tenant. 'full': complete Tez including all context and synthesis. 'filtered': context items are filtered based on the target tenant's access rules (typically via com.ragu.fga-access). 'summary': only the synthesis summary is shared; full context is withheld."
          }
        },
        "additionalProperties": false
      }
    },
    "isolation_boundary": {
      "type": "string",
      "enum": ["strict", "shared_context", "shared_synthesis"],
      "description": "The isolation level enforced when this Tez crosses tenant boundaries. 'strict': no data is shared between tenants; the Tez is fully replicated into each target tenant's isolated environment. 'shared_context': context items may be referenced (not copied) across tenants, but synthesis is generated per-tenant. 'shared_synthesis': both context and synthesis are shared; the same Tez instance is accessible to multiple tenants."
    },
    "cross_tenant_strategy": {
      "type": "string",
      "enum": ["accept_dependency", "snapshot_replication", "replicated_with_sync"],
      "description": "How cross-tenant data dependencies are managed. 'accept_dependency': the receiving tenant accepts a live reference to the source tenant's data (requires trust and connectivity). 'snapshot_replication': the Tez is snapshot-copied at share time; future changes to the source are not reflected. 'replicated_with_sync': the Tez is copied and periodically synchronized with the source, maintaining consistency within a defined sync interval."
    },
    "data_residency": {
      "type": "object",
      "description": "Data residency metadata governing where this Tez may be stored and processed.",
      "required": ["region", "compliance_framework"],
      "properties": {
        "region": {
          "type": "string",
          "description": "Geographic region where this Tez's data must reside. Uses ISO 3166-1 alpha-2 country codes or cloud provider region identifiers (e.g., 'US', 'EU', 'us-east-1', 'eu-west-1')."
        },
        "compliance_framework": {
          "type": "string",
          "description": "The compliance framework governing data handling for this Tez. Common values: 'GDPR', 'SOC2', 'HIPAA', 'FedRAMP', 'ISO27001', 'none'."
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_tenant` | object | Yes | Tenant that created this Tez |
| `source_tenant.tenant_id` | string | Yes | Unique tenant identifier |
| `source_tenant.tenant_name` | string | Yes | Human-readable tenant name |
| `source_tenant.platform` | string | Yes | Hosting platform identifier |
| `target_tenants` | array | Yes | Authorized receiving tenants |
| `target_tenants[].tenant_id` | string | Yes | Target tenant identifier |
| `target_tenants[].tenant_name` | string | Yes | Target tenant name |
| `target_tenants[].access_level` | enum | Yes | `full`, `filtered`, or `summary` |
| `isolation_boundary` | enum | Yes | `strict`, `shared_context`, or `shared_synthesis` |
| `cross_tenant_strategy` | enum | Yes | `accept_dependency`, `snapshot_replication`, or `replicated_with_sync` |
| `data_residency` | object | No | Geographic and compliance constraints |
| `data_residency.region` | string | Yes | Storage region (ISO 3166-1 or cloud region) |
| `data_residency.compliance_framework` | string | Yes | Governing compliance framework |

## Examples

### Example 1: Consulting firm sharing with a client

A consulting firm shares a due diligence tez with their client, providing full access while maintaining strict isolation:

```json
{
  "source_tenant": {
    "tenant_id": "tenant-ragu-consulting-001",
    "tenant_name": "Ragu Consulting Group",
    "platform": "ragu"
  },
  "target_tenants": [
    {
      "tenant_id": "tenant-acme-corp-042",
      "tenant_name": "Acme Corporation",
      "access_level": "full"
    }
  ],
  "isolation_boundary": "strict",
  "cross_tenant_strategy": "snapshot_replication",
  "data_residency": {
    "region": "US",
    "compliance_framework": "SOC2"
  }
}
```

### Example 2: Parent company distributing to subsidiaries

A corporate parent shares analysis across subsidiaries with different access levels and GDPR compliance:

```json
{
  "source_tenant": {
    "tenant_id": "tenant-globex-hq-001",
    "tenant_name": "Globex Corporation HQ",
    "platform": "ragu"
  },
  "target_tenants": [
    {
      "tenant_id": "tenant-globex-eu-010",
      "tenant_name": "Globex Europe GmbH",
      "access_level": "full"
    },
    {
      "tenant_id": "tenant-globex-apac-020",
      "tenant_name": "Globex Asia-Pacific Ltd",
      "access_level": "filtered"
    },
    {
      "tenant_id": "tenant-partner-ext-099",
      "tenant_name": "External Advisory Partner",
      "access_level": "summary"
    }
  ],
  "isolation_boundary": "shared_synthesis",
  "cross_tenant_strategy": "replicated_with_sync",
  "data_residency": {
    "region": "EU",
    "compliance_framework": "GDPR"
  }
}
```

### Example 3: Private Tez (no cross-tenant sharing)

A tez that stays within a single tenant:

```json
{
  "source_tenant": {
    "tenant_id": "tenant-internal-research-005",
    "tenant_name": "Internal Research Division",
    "platform": "ragu"
  },
  "target_tenants": [],
  "isolation_boundary": "strict",
  "cross_tenant_strategy": "snapshot_replication"
}
```

### Example 4: Extension directory in a Tez bundle

```
quarterly-analysis.tez/
├── manifest.json
├── synthesis.md
├── context/
│   ├── financial-model.xlsx
│   └── market-report.md
└── extensions/
    └── com.ragu.multi-tenant/
        ├── manifest.json
        └── multi-tenant.json
```

## Compatibility Notes

- **Minimum protocol version:** 1.2. This extension relies on context item identifiers and Tez manifest metadata introduced in protocol version 1.2.
- **Graceful degradation:** Implementations that do not support this extension ignore the `com.ragu.multi-tenant/` directory entirely. The Tez remains fully functional -- all content is accessible as if no tenant restrictions were defined. **However**, platforms that receive a Tez with multi-tenant metadata they cannot enforce SHOULD log a warning, as the source tenant may have intended access restrictions that are not being honored.
- **Conflicts:** This extension complements `com.ragu.fga-access`. When both are present, `multi-tenant` governs which tenants can receive the Tez, while `fga-access` governs which users within a tenant can see specific content. Implementations SHOULD enforce both layers.
- **Dependencies:** None at the protocol level. At runtime, enforcement of `cross_tenant_strategy: replicated_with_sync` requires platform-level synchronization infrastructure.

## Migration Notes

This extension is under consideration for standardization. Multi-tenancy is a broadly relevant concern for enterprise Tezit Protocol implementations. The migration path:

1. **Schema evolution:** A standard `tezit-multi-tenant` extension would likely adopt the core schema (`source_tenant`, `target_tenants`, `isolation_boundary`) while abstracting the `platform` field into a registry of known platform identifiers.
2. **Cross-platform interoperability:** The `platform` field in `source_tenant` enables cross-platform tenant resolution. A standard extension would formalize this into a platform registry, allowing tezits to be shared between different Tezit Protocol implementations (e.g., a Tez created on Ragu shared with a MyPA.chat workspace).
3. **Data residency standardization:** The `data_residency` object would benefit from a formal region taxonomy and compliance framework registry, rather than free-form strings.
4. **Backward compatibility:** Vendor `multi-tenant.json` files would be valid against the standard schema with minimal transformation (primarily the `platform` field mapping to a registered identifier).
5. **A Tez bundle SHOULD NOT include both** `com.ragu.multi-tenant` and its future standard equivalent simultaneously.
