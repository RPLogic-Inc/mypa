# Tezit Protocol Specification

**Version**: 1.1
**Status**: Draft
**Last Updated**: February 5, 2026
**Website**: [tezit.com/spec](https://tezit.com/spec)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the Tezit Protocol, an open standard for bundling and transmitting knowledge artifacts that preserve reasoning context alongside synthesis.

### 1.2 Scope

This specification covers:
- Tez bundle format and structure
- Manifest schema
- Context packaging
- Conversation format
- Parameter specification
- Versioning and compatibility
- Extension mechanisms

This specification does NOT cover:
- Specific AI models or implementations
- Authentication/authorization protocols (use existing standards)
- Storage backends (implementation-specific)
- UI/UX guidelines

**Non-normative note**: The 19-week RAGU plan implements internal Tez assembly and enterprise sharing only. External Tezit.com connectivity is out of scope for that plan.

### 1.3 Conformance Levels

The Tezit protocol recognizes three conformance levels to support progressive adoption. The practice of sharing context with synthesis ("teziting") does not require tooling or formal structure.

#### 1.3.1 Tez (Informal)

**Definition:** Any bundle of context and synthesis shared with the intention of enabling recipient understanding or interrogation.

**Requirements:** None. A Tez is defined by intent, not structure.

**Valid examples:**
- A Dropbox folder containing research PDFs and a Word doc summarizing findings
- A git repository with code and a README explaining the analysis
- A zip file attached to an email with "here's my analysis and the sources I used"
- A Google Drive folder shared with a colleague
- A Claude Project exported and sent as a folder
- A Notion page that links to its sources

**No manifest required. No tooling required.** The value comes from the practice, not the format.

**Platform support:** Tezit.com can import informal Tezzes. The platform will:
1. Detect files and infer structure
2. Identify the likely synthesis document (README, tez.md, or largest markdown/doc file)
3. Generate a manifest automatically
4. Enable interrogation against the imported context

**Interoperability:** Informal Tezzes are not portable between platforms without manual intervention, but they represent the natural starting point for the practice.

#### 1.3.2 Portable Tez

**Definition:** A Tez with minimal manifest enabling tool recognition and basic interoperability.

**Requirements:** A `manifest.json` file with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tezit_version` | string | Yes | Protocol version (e.g., "1.0") |
| `id` | string | Yes | Unique identifier |
| `title` | string | Yes | Human-readable name |
| `created_at` | string | Yes | ISO 8601 timestamp |
| `synthesis.file` | string | Yes | Path to synthesis document |

**Minimal manifest example:**
```json
{
  "tezit_version": "1.0",
  "id": "acme-analysis-2026-01",
  "title": "Acme Partnership Analysis",
  "created_at": "2026-01-25T14:30:00Z",
  "synthesis": {
    "file": "tez.md"
  }
}
```

**Context items:** Files in the bundle are automatically detected. Explicit `context.items` array is optional but recommended for large bundles.

**Platform support:** Any Tezit-compatible tool can:
- Recognize the bundle as a Tez
- Display the title and metadata
- Render the synthesis
- Index available context for interrogation

**Interoperability:** Portable Tezzes can be moved between compatible platforms with basic functionality preserved.

#### 1.3.3 Platform Tez

**Definition:** A fully-specified Tez conforming to the complete manifest schema (Section 3), enabling all platform features.

**Requirements:** Full manifest per Section 3.1, including:
- Complete creator metadata
- Typed context items with hashes
- Conversation record (if applicable)
- Parameters (if applicable)
- Permissions and lineage

**Platform support:** Full feature access including:
- Grounded interrogation with citation verification
- Fork tracking and lineage visualization
- Version history
- Access analytics
- Collaboration features

**When to use:** Platform Tezzes are generated automatically when using Tezit.com or compatible tools. Manual creation is not expected.

#### 1.3.4 Upgrade Path

Tezzes naturally upgrade as they move through the ecosystem:

```
Informal Tez          →  Import to platform  →  Platform Tez
(folder + intent)        (auto-manifest)        (full features)
     ↓
Export for sharing    →  Portable Tez
(minimal manifest)       (cross-platform)
```

The protocol is designed so that users never need to manually write manifests. The practice ("I'll send you my analysis with the sources") comes first; formalization happens through tooling.

### 1.4 Conformance Validation

An implementation is **Tezit-conformant** if it:
1. Produces bundles that validate against this specification (at any conformance level)
2. Consumes bundles that conform to this specification (at any conformance level)
3. Preserves all present fields during round-trip operations
4. Handles unknown extensions gracefully
5. Clearly indicates which conformance level a bundle meets

### 1.5 Terminology

- **MUST**, **MUST NOT**, **REQUIRED**: Absolute requirements
- **SHOULD**, **SHOULD NOT**, **RECOMMENDED**: Best practices
- **MAY**, **OPTIONAL**: Truly optional features

### 1.6 Core Principles

The Tezit Protocol is built on several foundational principles:

#### 1.6.1 The Library of Context

**Original content is preserved forever. Display is regenerable.**

When source materials are added to a Tez—voice recordings, documents, raw data—these **artifacts** are sacred and immutable. The exact words chosen, the original formatting, the raw data values should never be discarded or modified.

However, how this content is **displayed** to recipients can be regenerated, reformatted, summarized, or expanded based on their needs. The synthesis (tez.md) interprets artifacts; the artifacts themselves remain pristine.

This principle enables:
- Recipients can always access original sources
- Summaries can be regenerated with different AI models
- Audit trails maintain provenance
- "Trust but verify" through source access

#### 1.6.2 Context Travels with Synthesis

A Tez is not a document with attachments. It is a **complete unit of understanding** where synthesis and supporting context are inseparable. When you share a Tez, recipients receive not just your conclusion but the evidence that supports it.

#### 1.6.3 Interrogation Over Trust

The defining feature of a Tez is that recipients can **interrogate** it—asking questions that AI answers from the transmitted context alone. This transforms communication from "trust my summary" to "verify against my sources."

#### 1.6.4 Grounded Responses

When interrogating a Tez, AI responses MUST be grounded in transmitted context with verifiable citations. Claims without citations are flagged. Information not in context is explicitly noted as unavailable.

### 1.7 Tez Profiles

The Tez protocol supports multiple **profiles**—consumption patterns optimized for different use cases. The same underlying structure (context, artifacts, synthesis) serves different communication needs.

#### 1.7.1 Knowledge Profile (Default)

**Use case**: Transmitting analysis, research, recommendations, proposals

**Characteristics**:
- `tez.md` is a substantive synthesis document with citations
- **Interrogation** is the primary consumption model
- Recipients verify claims against transmitted context
- Forking creates counter-arguments with additional evidence
- Living documents with linked sources common

**Example**: Legal memo, financial analysis, research synthesis, SOW proposal

**Manifest indicator**:
```json
{
  "profile": "knowledge",
  "synthesis": {
    "type": "recommendation",
    "file": "tez.md"
  }
}
```

#### 1.7.2 Messaging Profile

**Use case**: Human communication with rich context—from team coordination to personal plans

**Characteristics**:
- Surface message is concise (like a text/Slack/WhatsApp message)
- Context provides depth *beneath* the message
- **Absorption** into recipient's PA/memory is common consumption
- Recipient's PA can use context to help formulate response
- Threading for conversation flow
- Real-time or near-real-time exchange

**Example 1 - Personal**:

Surface: *"Want to see a movie this weekend?"*

Context beneath:
- Sender's availability: Saturday after 5pm, Sunday anytime
- Movies interested in: Dune 3, the new Pixar film, "that thriller you mentioned"
- Acceptable theaters: AMC Downtown, Regal Westside, the indie theater on 5th
- Showtimes cross-referenced with availability
- Preference: IMAX if Dune, regular for others
- Note: "I'll drive if we go to AMC"

The recipient sees a simple text. Their PA sees the full context and can instantly surface: *"They're free Saturday after 5. Dune 3 plays at 7:15 at AMC in IMAX—that works for both of you and they'll drive."*

**Example 2 - Professional**:

Surface: *"Can you review the budget proposal?"*

Context beneath:
- Why asking: Budget deadline Friday, CFO watching closely
- What to focus on: Infrastructure costs, "miscellaneous" line items
- Background: Follows August planning meeting commitments
- Why this recipient: They caught the infrastructure overrun last quarter

**Manifest indicator**:
```json
{
  "profile": "messaging",
  "surface": {
    "message": "Want to see a movie this weekend?",
    "tone": "casual",
    "urgency": "low",
    "actionRequested": "Let me know what works"
  }
}
```

**The key insight**: Both sender and recipient just want to exchange *"want to see a movie?" / "sure, how about Saturday?"*—the natural human conversation. But beneath that surface, their PAs are negotiating availability, preferences, and logistics. The Tez carries the context that makes the simple exchange actionable.

**Transport compatibility**: Messaging-profile Tezzes can travel via:
- Native Tez-aware apps (full context inline)
- Existing platforms (SMS, WhatsApp, iMessage) with context as:
  - A retrievable link (`tez.it/m/abc123`)
  - A companion packet via PA-to-PA channel
  - Embedded metadata (where platform supports)
- Email with context attachment or link

The surface message remains human-readable in any medium. Context availability degrades gracefully—a recipient without a PA still gets a normal text message.

**Key differences from Knowledge profile**:

| Aspect | Knowledge Profile | Messaging Profile |
|--------|-------------------|-------------------|
| Primary content | `tez.md` synthesis document | `surface.message` (brief) |
| Primary consumption | Interrogation | Absorption + threading |
| Context role | Evidence for claims | Background for understanding |
| Typical size | Multi-page analysis | Single message + layers |
| Lifetime | Long-lived artifact | Conversational |

#### 1.7.3 Profile Interoperability

Profiles are **hints**, not barriers. A Messaging-profile Tez can still be interrogated. A Knowledge-profile Tez can be absorbed into PA memory. The profile indicates the *intended* consumption pattern, not a restriction.

Implementations SHOULD:
- Support both profiles
- Default UI based on profile (interrogation for knowledge, threading for messaging)
- Allow users to switch consumption modes

#### 1.7.4 Future Profiles

The protocol is extensible to additional profiles:
- **Decision**: Structured choices with trade-offs and parameters
- **Handoff**: Responsibility transfer with full context
- **Learning**: Educational content with interrogable depth
- **Negotiation**: Deal terms with parameters and counter-Tez support

Profile specifications are maintained in the extension registry.

---

## 2. Bundle Structure

### 2.1 Overview

A Tez bundle is a directory (or archive) containing:

```
{tez-id}/
├── manifest.json          # REQUIRED
├── tez.md                  # REQUIRED
├── context/                # REQUIRED (may be empty)
│   └── {item-id}.{ext}
├── conversation.json       # OPTIONAL
├── params.json             # OPTIONAL
└── extensions/             # OPTIONAL
    └── {extension-id}/
```

### 2.2 Bundle Identifier

The `tez-id` MUST:
- Be unique within its scope (vault, organization, or global)
- Contain only: lowercase letters, numbers, hyphens
- Be 3-100 characters
- Not start or end with a hyphen

RECOMMENDED format: `{topic}-{date}-{sequence}`

Example: `acme-analysis-2026-01-15-001`

### 2.3 Archive Format

When distributed as a single file, bundles SHOULD use:
- **Extension**: `.tez`
- **Format**: ZIP with no compression or DEFLATE
- **Structure**: Bundle root at archive root

Example: `acme-analysis-2026-01.tez`

---

## 3. Manifest Schema

### 3.1 Full Schema

```json
{
  "$schema": "https://tezit.com/spec/v1/manifest.schema.json",
  "tezit_version": "1.0",
  "id": "string (REQUIRED)",
  "version": "integer (REQUIRED, >= 1)",
  "created_at": "ISO 8601 datetime (REQUIRED)",
  "updated_at": "ISO 8601 datetime (OPTIONAL)",

  "creator": {
    "id": "string (OPTIONAL)",
    "name": "string (REQUIRED)",
    "email": "string (OPTIONAL)",
    "org": "string (OPTIONAL)",
    "url": "string (OPTIONAL)"
  },

  "profile": "string (OPTIONAL: 'knowledge' | 'messaging' | 'decision' | 'handoff')",

  "surface": {
    "message": "string (OPTIONAL, for messaging profile)",
    "tone": "string (OPTIONAL: 'formal' | 'casual' | 'urgent' | 'friendly' | 'neutral')",
    "urgency": "string (OPTIONAL: 'critical' | 'high' | 'normal' | 'low' | 'fyi')",
    "actionRequested": "string (OPTIONAL)"
  },

  "synthesis": {
    "title": "string (REQUIRED)",
    "type": "string (REQUIRED)",
    "file": "string (REQUIRED, relative path)",
    "abstract": "string (OPTIONAL, max 500 chars)",
    "language": "string (OPTIONAL, BCP 47 tag)"
  },

  "context": {
    "scope": "string (REQUIRED: 'full' | 'focused' | 'private' | 'custom')",
    "item_count": "integer (REQUIRED)",
    "total_size_bytes": "integer (OPTIONAL)",
    "items": [
      {
        "id": "string (REQUIRED)",
        "type": "string (REQUIRED)",
        "title": "string (REQUIRED)",
        "source": "string (OPTIONAL)",
        "file": "string (REQUIRED, relative path)",
        "mime_type": "string (OPTIONAL)",
        "size_bytes": "integer (OPTIONAL)",
        "hash": "string (OPTIONAL, format: 'algorithm:hex')",
        "metadata": "object (OPTIONAL)"
      }
    ]
  },

  "conversation": {
    "model": "string (OPTIONAL)",
    "turn_count": "integer (REQUIRED if file present)",
    "file": "string (OPTIONAL, relative path)"
  },

  "parameters": {
    "negotiable": "boolean (REQUIRED if file present)",
    "count": "integer (OPTIONAL)",
    "file": "string (OPTIONAL, relative path)"
  },

  "lineage": {
    "forked_from": "string (OPTIONAL, parent tez-id or URI)",
    "fork_count": "integer (OPTIONAL)",
    "related": ["array of tez-ids or URIs (OPTIONAL)"]
  },

  "permissions": {
    "interrogate": "boolean (default: true)",
    "fork": "boolean (default: true)",
    "reshare": "boolean (default: false)",
    "commercial_use": "boolean (default: false)",
    "license": "string (OPTIONAL, SPDX identifier)"
  },

  "extensions": {
    "{extension-id}": "object (extension-specific)"
  }
}
```

### 3.2 Required Fields

The following fields MUST be present:
- `tezit_version`
- `id`
- `version`
- `created_at`
- `creator.name`
- `synthesis.title`
- `synthesis.type`
- `synthesis.file`
- `context.scope`
- `context.item_count`
- `context.items` (array, may be empty)

### 3.3 Synthesis Types

Standard synthesis types:
- `general`: General-purpose analysis
- `recommendation`: Actionable recommendation
- `proposal`: Formal proposal
- `analysis`: Deep-dive analysis
- `summary`: Summarization
- `comparison`: Comparative analysis
- `review`: Review or critique
- `tutorial`: Educational content
- `custom`: Implementation-defined

### 3.4 Context Scopes

- `full`: All accessible materials were searched
- `focused`: Auto-expanded from entities/topics
- `private`: Only explicitly provided items
- `custom`: Implementation-defined scoping

### 3.5 Context Item Types

Standard item types:
- `document`: PDF, Word, text documents
- `email`: Email messages
- `spreadsheet`: Excel, CSV, data files
- `presentation`: Slides
- `image`: Images, diagrams
- `audio`: Audio files
- `video`: Video files
- `code`: Source code files
- `data`: Structured data (JSON, XML)
- `webpage`: Web page captures
- `message`: Chat messages
- `note`: Notes, memos
- `custom`: Implementation-defined

---

## 4. Synthesis Format (tez.md)

### 4.1 Structure

The synthesis file MUST be valid Markdown (CommonMark).

RECOMMENDED structure:
```markdown
# {Title}

## Executive Summary
{Brief overview}

## {Section 1}
{Content with citations}

## {Section 2}
{Content with citations}

## Conclusion/Recommendation
{Final synthesis}

---
*Tezit v{version} | Context: {count} items | {date}*
```

### 4.2 Citations

Citations reference context items using double-bracket syntax:

```markdown
According to the report [[doc-001]], revenue increased by 15%.
```

Citation formats:
- `[[item-id]]`: Reference to context item
- `[[item-id:page]]`: Page-specific reference
- `[[item-id:p12]]`: Page 12
- `[[item-id:p12-15]]`: Pages 12-15
- `[[item-id:section]]`: Section reference
- `[[item-id:timestamp]]`: Time-specific (audio/video)

### 4.3 Metadata Block

Optional YAML frontmatter:
```markdown
---
title: Acme Analysis
type: recommendation
author: Jane Smith
date: 2026-01-15
tags: [partnership, analysis, acme]
---

# Acme Analysis
...
```

---

## 5. Conversation Format

### 5.1 Schema

```json
{
  "$schema": "https://tezit.com/spec/v1/conversation.schema.json",
  "model": "string (OPTIONAL)",
  "model_version": "string (OPTIONAL)",
  "system_prompt": "string (OPTIONAL)",
  "turns": [
    {
      "role": "string (REQUIRED: 'user' | 'assistant' | 'system' | 'tool')",
      "content": "string (REQUIRED)",
      "timestamp": "ISO 8601 datetime (OPTIONAL)",
      "name": "string (OPTIONAL, for tool calls)",
      "citations": ["array of item-ids (OPTIONAL)"],
      "tool_calls": [
        {
          "id": "string",
          "name": "string",
          "arguments": "object"
        }
      ],
      "tool_results": [
        {
          "id": "string",
          "content": "string"
        }
      ],
      "metadata": "object (OPTIONAL)"
    }
  ],
  "total_tokens": "integer (OPTIONAL)",
  "duration_seconds": "number (OPTIONAL)"
}
```

### 5.2 Roles

- `user`: Human input
- `assistant`: AI response
- `system`: System instructions
- `tool`: Tool call results

### 5.3 Conversation Privacy Controls

The conversation that produced a synthesis may contain sensitive information that the creator doesn't want to share with recipients. The protocol supports flexible privacy controls.

#### Sharing Modes

```json
{
  "conversation": {
    "sharing": "full" | "summary" | "redacted" | "excluded",
    "file": "conversation.json"
  }
}
```

| Mode | Behavior |
|------|----------|
| `full` | Complete conversation included |
| `summary` | AI-generated summary of reasoning (original excluded) |
| `redacted` | Conversation with sensitive turns removed |
| `excluded` | No conversation included (synthesis only) |

#### Per-Turn Redaction

Individual turns MAY be redacted while preserving conversation flow:

```json
{
  "turns": [
    {
      "role": "user",
      "content": "Analyze our cost structure for this project",
      "timestamp": "2026-01-25T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "[REDACTED - Internal analysis]",
      "redacted": true,
      "redaction_reason": "Contains proprietary cost calculations"
    },
    {
      "role": "user",
      "content": "Now generate the client-facing estimate",
      "timestamp": "2026-01-25T10:02:00Z"
    },
    {
      "role": "assistant",
      "content": "Based on the analysis, the estimated cost is $127,500...",
      "citations": ["internal-costs", "client-specs"]
    }
  ]
}
```

#### Bulk Redaction

For redacting multiple turns:

```json
{
  "redactions": [
    {
      "turn_indices": [1, 2, 5],
      "reason": "Contains internal pricing discussion"
    },
    {
      "turn_indices": [8],
      "reason": "Contains PII"
    }
  ]
}
```

#### Summary Mode

When `sharing: "summary"`, implementations SHOULD generate a reasoning summary:

```json
{
  "conversation": {
    "sharing": "summary",
    "summary": "The synthesis was developed through analysis of the client's technical specifications and comparison with similar past projects. Key considerations included integration complexity, data migration volume, and security requirements. The AI identified three primary cost drivers which informed the timeline and budget estimates.",
    "turn_count_original": 15,
    "file": null
  }
}
```

#### Privacy Recommendation

Creators SHOULD consider:
- **Exclude** conversations with competitive intelligence or internal strategy
- **Redact** turns containing PII, credentials, or proprietary calculations
- **Summarize** when reasoning is valuable but specifics are sensitive
- **Include full** when transparency strengthens trust

---

## 6. Parameters Format

### 6.1 Schema

```json
{
  "$schema": "https://tezit.com/spec/v1/params.schema.json",
  "parameters": [
    {
      "name": "string (REQUIRED)",
      "type": "string (REQUIRED)",
      "label": "string (OPTIONAL, display name)",
      "description": "string (OPTIONAL)",
      "value": "any (REQUIRED)",
      "constraints": "object (type-specific)",
      "preference": "any (OPTIONAL)",
      "rationale": "string (OPTIONAL)",
      "citations": ["array of item-ids (OPTIONAL)"]
    }
  ]
}
```

### 6.2 Parameter Types

#### range

Numeric range:
```json
{
  "name": "revenue_share",
  "type": "range",
  "value": 0.15,
  "constraints": {
    "min": 0.10,
    "max": 0.25,
    "step": 0.01,
    "unit": "percent"
  },
  "preference": 0.15
}
```

#### options

Discrete choices:
```json
{
  "name": "payment_terms",
  "type": "options",
  "value": "net-30",
  "constraints": {
    "choices": ["net-15", "net-30", "net-45", "net-60"]
  }
}
```

#### boolean

True/false:
```json
{
  "name": "include_warranty",
  "type": "boolean",
  "value": true
}
```

#### date

Date or date range:
```json
{
  "name": "start_date",
  "type": "date",
  "value": "2026-03-01",
  "constraints": {
    "min": "2026-02-01",
    "max": "2026-06-01"
  }
}
```

#### text

Free-form text:
```json
{
  "name": "special_terms",
  "type": "text",
  "value": "",
  "constraints": {
    "max_length": 1000
  }
}
```

---

## 7. Context Packaging

### 7.1 File Organization

Context items MUST be stored in the `context/` directory:
```
context/
├── doc-001.pdf
├── doc-002.docx
├── email-001.eml
├── data-001.json
└── image-001.png
```

### 7.2 File Naming

Item files MUST be named `{item-id}.{extension}` where:
- `item-id` matches the manifest entry
- `extension` reflects the actual file type

### 7.3 Large Files

For bundles with large context:
- Files over 10MB SHOULD be compressed
- Files over 100MB MAY be stored externally with URI reference
- External files MUST include hash for integrity

External reference example:
```json
{
  "id": "video-001",
  "type": "video",
  "title": "Product Demo",
  "file": null,
  "external_uri": "https://storage.example.com/video-001.mp4",
  "hash": "sha256:abc123...",
  "size_bytes": 524288000
}
```

### 7.4 Integrity Verification

Content hashes SHOULD use SHA-256:
```json
{
  "id": "doc-001",
  "hash": "sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b"
}
```

---

## 8. Extensions

### 8.1 Extension Mechanism

Extensions allow protocol enhancement without breaking compatibility.

Extension structure:
```
extensions/
└── {extension-id}/
    ├── manifest.json    # Extension manifest
    └── {files}          # Extension-specific files
```

### 8.2 Extension Manifest

```json
{
  "extension_id": "string",
  "extension_version": "string",
  "name": "string",
  "description": "string",
  "author": "string",
  "url": "string"
}
```

### 8.3 Standard Extensions

Reserved extension IDs:
- `tezit-analytics`: Usage analytics
- `tezit-collaboration`: Multi-author support
- `tezit-presentation`: Slide generation
- `tezit-signing`: Cryptographic signatures
- `tezit-encryption`: End-to-end encryption
- `tezit-facts`: Structured facts extraction
- `tezit-relationships`: Entity relationship mapping

#### 8.3.1 Facts Extension (`tezit-facts`)

The Facts extension enables structured extraction of claims from context with provenance tracking.

**Schema** (`extensions/tezit-facts/facts.json`):

```json
{
  "$schema": "https://tezit.com/spec/v1/extensions/facts.schema.json",
  "facts": [
    {
      "id": "fact-001",
      "claim": "Revenue increased 23% year-over-year",
      "confidence": 0.95,
      "source": "verified",
      "citations": ["revenue-report:p3"],
      "verifiedBy": "financial-data-extraction",
      "verifiedAt": "2026-01-25T10:00:00Z",
      "category": "financial",
      "contradicts": [],
      "supports": ["fact-002"]
    }
  ]
}
```

**Field definitions**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier within this Tez |
| `claim` | string | The factual assertion |
| `confidence` | number | 0.0 to 1.0 confidence score |
| `source` | enum | `stated` (explicit in source), `inferred` (derived), `verified` (cross-checked), `assumed` |
| `citations` | array | References to context items supporting this fact |
| `verifiedBy` | string | What system/process verified this fact |
| `category` | string | Optional classification (financial, legal, technical, etc.) |
| `contradicts` | array | IDs of facts this conflicts with |
| `supports` | array | IDs of facts this evidence supports |

**Use cases**:
- Due diligence documents where claims must be traceable
- Research synthesis requiring confidence levels
- Automated fact-checking pipelines

#### 8.3.2 Relationships Extension (`tezit-relationships`)

The Relationships extension maps connections between the Tez and external entities (people, organizations, projects, events).

**Schema** (`extensions/tezit-relationships/relationships.json`):

```json
{
  "$schema": "https://tezit.com/spec/v1/extensions/relationships.schema.json",
  "relationships": [
    {
      "entity": "CFO Margaret Wong",
      "entityType": "person",
      "entityId": "person:margaret-wong",
      "relationship": "stakeholder",
      "strength": 0.8,
      "context": "Executive sponsor tracking this initiative",
      "bidirectional": false,
      "citations": ["email-thread-001"]
    },
    {
      "entity": "Q4 Budget Initiative",
      "entityType": "project",
      "entityId": "project:q4-budget-2026",
      "relationship": "primary_subject",
      "strength": 1.0
    }
  ]
}
```

**Field definitions**:

| Field | Type | Description |
|-------|------|-------------|
| `entity` | string | Human-readable entity name |
| `entityType` | enum | `person`, `organization`, `project`, `document`, `event`, `concept` |
| `entityId` | string | Optional stable identifier for entity resolution |
| `relationship` | string | Nature of the relationship (stakeholder, subject, reference, etc.) |
| `strength` | number | 0.0 to 1.0 relevance to this Tez |
| `context` | string | Why this relationship matters here |
| `bidirectional` | boolean | Whether the entity also relates back |
| `citations` | array | Context items that establish this relationship |

**Use cases**:
- Knowledge graphs connecting related Tezzes
- Stakeholder mapping in complex projects
- Entity disambiguation across organizational knowledge

### 8.4 Custom Extensions

Custom extensions SHOULD use reverse-domain naming:
- `com.example.custom-feature`
- `org.company.internal-tool`

---

## 9. Interrogation

Interrogation is the process by which a recipient asks questions about a Tez and receives answers grounded in the transmitted context. This is the core consumption mechanism that enables "trust but verify."

### 9.1 Grounded Response Requirement

When interrogating a Tez, AI responses MUST be grounded in the transmitted context:

1. **Context-only answering**: The AI MUST answer from the context items in the Tez bundle, not from general training knowledge
2. **Explicit limitations**: If the context doesn't contain information to answer a question, the AI MUST say so explicitly
3. **No hallucination**: Factual claims MUST be verifiable against transmitted context

### 9.2 Citation Requirements

All interrogation responses MUST include citations to source materials:

**Citation format in responses**:
```markdown
The timeline is driven by three integration requirements:

1. **Legacy auth adapter** (2 weeks) - Custom SAML implementation requires adapter work [[client-specs:p12]]
2. **Data migration** (2 weeks) - 340K CRM records require validation [[client-specs:p23]], [[analysis:migration]]
3. **Security review** (2 weeks) - InfoSec policy mandates penetration testing [[client-specs:p47]]
```

**Citation syntax**:
- `[[item-id]]` - General reference to context item
- `[[item-id:p12]]` - Page-specific reference
- `[[item-id:p12-15]]` - Page range
- `[[item-id:section-name]]` - Named section
- `[[item-id:L42]]` - Line number (for code)
- `[[item-id:L42-50]]` - Line range
- `[[item-id:00:15:30]]` - Timestamp (for audio/video)

### 9.3 Interrogation Protocol

```
┌─────────────────────────────────────────────────────────────┐
│                    Interrogation Flow                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. RECEIVE QUESTION                                         │
│     └─ User asks about the Tez                              │
│                                                              │
│  2. INDEX CONTEXT                                            │
│     └─ Build retrieval index ONLY from context/ items       │
│     └─ Do NOT include external knowledge                    │
│                                                              │
│  3. RETRIEVE RELEVANT CHUNKS                                 │
│     └─ Search context index for relevant passages           │
│     └─ Track source item-id and location for each chunk     │
│                                                              │
│  4. GENERATE GROUNDED RESPONSE                               │
│     └─ Answer using ONLY retrieved context                  │
│     └─ Include citations for all factual claims             │
│     └─ State "Context doesn't contain..." if unsupported    │
│                                                              │
│  5. VERIFY CITATIONS                                         │
│     └─ Confirm all citations reference real context items   │
│     └─ Confirm cited locations exist in those items         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 Implementation Requirements

Implementations providing interrogation MUST:

1. **Isolate context**: Index only the `context/` folder from the specific Tez being interrogated
2. **Track provenance**: Maintain mapping from retrieved chunks to source items and locations
3. **Enforce grounding**: System prompts MUST instruct the AI to answer only from provided context
4. **Verify citations**: Post-process responses to confirm all citations are valid
5. **Surface uncertainty**: Clearly distinguish "the context says X" from "I believe X"

**Example system prompt for interrogation**:
```
You are answering questions about a Tez bundle. You have access ONLY to the
context items provided in this bundle.

RULES:
1. Answer ONLY from the provided context. Do not use your general knowledge.
2. Every factual claim MUST include a citation: [[item-id:location]]
3. If the context doesn't contain information to answer, say: "The transmitted
   context doesn't include information about [topic]. The context contains:
   [list what IS available]."
4. Never guess or infer beyond what the context explicitly states.
5. If asked about the synthesis itself, reference tez.md citations.
```

### 9.5 Citation Verification Requirements

Interrogation responses MUST include verifiable citations. Implementations MUST verify citations before returning responses to users.

#### Citation Format

Citations use double-bracket syntax with optional location specifier:

| Format | Meaning | Example |
|--------|---------|---------|
| `[[item-id]]` | Reference to entire item | `[[client-specs]]` |
| `[[item-id:pN]]` | Page N | `[[client-specs:p12]]` |
| `[[item-id:pN-M]]` | Pages N through M | `[[client-specs:p12-15]]` |
| `[[item-id:LN]]` | Line N (code) | `[[auth.py:L42]]` |
| `[[item-id:LN-M]]` | Lines N through M | `[[auth.py:L42-89]]` |
| `[[item-id:#section]]` | Named section | `[[readme:#installation]]` |
| `[[item-id:tN:MM:SS]]` | Timestamp (audio/video) | `[[interview:t0:12:45]]` |

#### Verification Process

Implementations MUST perform post-generation verification:

1. **Extract citations** from generated response
2. **Validate item existence**: Verify `item-id` exists in `context.items`
3. **Validate location existence**: Verify the location specifier refers to content that exists (page number within document page count, line number within file line count, etc.)
4. **Flag or remove** any citations that fail verification
5. **Disclose uncertainty** if response contains claims without valid citations

#### Handling Unsupported Questions

When context does not contain sufficient information:

**Acceptable response:**
> "The context does not include information about pricing history. The SOW [[sow-draft:p3]] mentions the total cost of $127,500 but does not explain how this figure was calculated. You may want to ask the sender for their pricing model."

**Unacceptable response:**
> "Based on industry standards, this pricing is typical for enterprise deployments of this scale." [No citation, claim from general knowledge]

#### Format-Specific Chunking

Implementations SHOULD use format-appropriate chunking strategies:

| Format | Chunking Strategy | Location Granularity |
|--------|-------------------|---------------------|
| PDF | Page-based with paragraph boundaries | Page (pN) |
| Word/DOCX | Section/heading-based | Section or page |
| Markdown | Header-based sections | Section (#name) |
| Source code | Function/class boundaries | Line (LN) |
| Email (EML) | Full message | Message ID |
| Spreadsheet | Sheet + row ranges | Sheet:Range |
| Audio/Video | Transcript segments | Timestamp |
| JSON/Data | Key paths | JSON path |

Implementations MAY provide finer granularity (paragraph within page, statement within function) but MUST NOT provide coarser granularity than specified above.

### 9.6 Interrogation vs. General Chat

| Aspect | Interrogation | General Chat |
|--------|---------------|--------------|
| Knowledge source | Context items only | Full model training |
| Citations | Required | Optional |
| "I don't know" | Expected when context lacks info | Rare |
| Trust model | Verifiable | Trust the AI |
| Purpose | Recipient verification | General assistance |

### 9.7 Reframing

Reframing is a specialized form of interrogation that re-synthesizes the Tez from a different perspective:

**Example reframe request**:
> "Reframe this from the legal team's perspective, focusing on liability and compliance."

**Reframing requirements**:
- MUST use only transmitted context
- MUST maintain citations
- SHOULD preserve parameter structures
- MAY produce a new synthesis document
- MUST NOT introduce new factual claims

### 9.8 Interrogation Hosting

When a Tez is shared, recipients need compute resources to interrogate it. The protocol supports multiple hosting models to balance convenience, cost, and control.

#### Hosting Models

| Model | Description | Use Case |
|-------|-------------|----------|
| **Sender-Hosted** | Sender's platform provides compute for recipients | Convenience for external recipients (e.g., lawyers, clients) |
| **Recipient-Hosted** | Recipient uses their own platform/compute | Organizations with their own AI infrastructure |
| **Platform-Hosted** | Tezit.com or similar platform hosts interrogation | Public Tezzes, individual users |

#### Sender-Hosted Interrogation

When a sender shares a Tez with `hosting: "sender"`, recipients can interrogate using the sender's compute resources without needing their own account or infrastructure.

**Manifest extension:**
```json
{
  "sharing": {
    "hosting": "sender",
    "hosting_url": "https://company.ragu.ai/tez/abc123/interrogate",
    "hosting_limits": {
      "interrogations_per_recipient": 100,
      "max_tokens_per_query": 4000,
      "expires_at": "2026-03-01T00:00:00Z"
    },
    "inherit_settings": true
  }
}
```

**Benefits:**
- External recipients (lawyers, clients, partners) need no setup
- Recipient uses sender's powerful AI infrastructure (RAG, embeddings, models)
- Sender controls costs and access
- Settings and context organization inherited automatically

**Security considerations:**
- Sender bears compute costs; rate limiting MUST be enforced
- Recipient identity SHOULD be captured for audit
- Sender MAY revoke hosting at any time

#### Recipient-Hosted Interrogation

When a recipient has their own Tezit-compatible platform, they can download the Tez bundle and interrogate locally.

**Manifest extension:**
```json
{
  "sharing": {
    "hosting": "portable",
    "allow_download": true,
    "bundle_url": "https://tezit.com/t/abc123/download"
  }
}
```

**Benefits:**
- Recipient uses their own AI infrastructure and models
- No dependency on sender's availability
- Recipient controls their own costs
- Works offline once downloaded

**Requirements:**
- Recipient platform MUST implement interrogation per Section 9.1-9.6
- Recipient platform SHOULD honor sender's permission settings
- Downloaded bundles MUST include all context (no external references)

#### Dual-Mode Hosting

Senders MAY offer both options, allowing recipients to choose:

```json
{
  "sharing": {
    "hosting": "dual",
    "sender_hosted": {
      "url": "https://company.ragu.ai/tez/abc123/interrogate",
      "limits": { "interrogations": 100 }
    },
    "portable": {
      "allow_download": true,
      "bundle_url": "https://tezit.com/t/abc123/download"
    }
  }
}
```

**Recipient experience:**
1. Click share link → see Tez with interrogation interface
2. Option A: "Ask questions here" (sender-hosted, immediate)
3. Option B: "Download for your platform" (recipient-hosted)

#### Settings Inheritance

When `inherit_settings: true`, recipients interrogating via sender-hosted mode receive:
- Sender's AI model configuration
- Sender's RAG/retrieval settings
- Sender's context chunking strategy
- Sender's citation format preferences

This ensures recipients get the same quality interrogation experience the sender used when creating the synthesis.

#### Cost Attribution

Implementations SHOULD track interrogation costs:

```json
{
  "interrogation_log": {
    "recipient_id": "external:legal@lawfirm.com",
    "queries": 15,
    "tokens_used": 45000,
    "model": "claude-sonnet-4",
    "cost_usd": 0.85,
    "timestamp": "2026-01-25T14:30:00Z"
  }
}
```

Senders MAY set budgets and receive alerts when approaching limits.

---

## 10. Versioning

### 10.1 Protocol Versioning

Protocol version format: `{major}.{minor}`

- **Major**: Breaking changes
- **Minor**: Backward-compatible additions

### 10.2 Bundle Versioning

Bundle version is an incrementing integer starting at 1.

When updating a Tez:
1. Increment `version`
2. Update `updated_at`
3. Preserve `id` and `created_at`

### 10.3 Living Document Versioning

Tezzes MAY be configured as **living documents** with linked context sources that update automatically.

#### Linked Source Schema

```json
{
  "context": {
    "items": [
      {
        "id": "revenue-model",
        "type": "spreadsheet",
        "title": "Q1 Revenue Projections",
        "source": "linked",
        "linked_source": {
          "type": "google_sheets",
          "resource_id": "1abc123...",
          "range": "Revenue!A1:F100",
          "sync_frequency": "hourly",
          "last_synced": "2026-01-25T14:00:00Z",
          "sync_hash": "sha256:abc123..."
        },
        "file": "context/revenue-model.xlsx"
      }
    ]
  }
}
```

#### Supported Linked Source Types

| Type | Description | Sync Methods |
|------|-------------|--------------|
| `google_sheets` | Google Sheets spreadsheet | Polling, Webhook |
| `google_docs` | Google Docs document | Polling, Webhook |
| `onedrive` | Microsoft OneDrive file | Polling, Webhook |
| `sharepoint` | SharePoint document | Polling, Webhook |
| `dropbox` | Dropbox file | Polling, Webhook |
| `api` | REST API endpoint | Polling |
| `database` | Database query result | Polling |
| `s3` | AWS S3 object | Event notification |

#### Sync Frequencies

| Frequency | Meaning |
|-----------|---------|
| `manual` | Only sync when owner requests |
| `hourly` | Sync every hour |
| `daily` | Sync once per day |
| `weekly` | Sync once per week |
| `realtime` | Webhook-triggered on every change |

#### Auto-Versioning Behavior

When a linked source updates:

1. **Detect Change**: Compare `sync_hash` to previous
2. **Fetch Content**: Download updated source
3. **Re-index**: Update embeddings and chunks
4. **Create Version**: Increment `version`, set `update_type: "auto"`
5. **Notify**: Alert owner and watchers (if configured)

**Auto-version manifest entry:**
```json
{
  "version": 5,
  "updated_at": "2026-01-25T15:00:00Z",
  "update_type": "auto",
  "update_source": "revenue-model",
  "update_reason": "Linked source sync",
  "previous_version": 4
}
```

#### Synthesis Staleness

When context updates significantly, the synthesis MAY become stale:

```json
{
  "synthesis": {
    "file": "tez.md",
    "generated_at": "2026-01-20T10:00:00Z",
    "based_on_version": 3,
    "staleness": {
      "is_stale": true,
      "stale_since": "2026-01-25T15:00:00Z",
      "changed_items": ["revenue-model"],
      "recommendation": "Consider regenerating synthesis"
    }
  }
}
```

Implementations SHOULD warn users when interrogating stale Tezzes.

### 10.4 Version Pinning

Recipients MAY pin to a specific version:

```json
{
  "sharing": {
    "version_policy": "latest",  // or "pinned"
    "pinned_version": 3          // if pinned
  }
}
```

| Policy | Behavior |
|--------|----------|
| `latest` | Recipients always see current version |
| `pinned` | Recipients see specific version until explicitly updated |

### 10.5 Compatibility

Implementations MUST:
- Reject bundles with unsupported major version
- Process bundles with unknown minor version (ignoring unknown fields)
- Preserve unknown fields during round-trip

---

## 11. Security Considerations

### 11.1 Content Integrity

- All context items SHOULD include cryptographic hashes
- Manifests MAY be signed (see `tezit-signing` extension)
- Implementations SHOULD verify hashes on consumption

### 11.2 Sensitive Content

- Implementations MUST NOT include credentials in bundles
- PII SHOULD be redacted when appropriate
- Conversation redaction SHOULD be supported

### 11.3 Access Control

- Permission fields are advisory, not enforceable
- Implementations SHOULD respect permissions
- Authentication is out of scope (use existing standards)

### 11.4 External References

- External URIs SHOULD use HTTPS
- External content MUST be verified by hash
- Implementations MAY refuse external references

---

## 12. MIME Type

### 12.1 Registration

- **Type**: `application/vnd.tezit+zip`
- **Extension**: `.tez`

### 12.2 Usage

```
Content-Type: application/vnd.tezit+zip
Content-Disposition: attachment; filename="analysis.tez"
```

---

## 13. Conformance Testing

### 13.1 Test Suite

The reference test suite is available at:
[github.com/tezit-protocol/spec/tests](https://github.com/tezit-protocol/spec/tests)

### 13.2 Validation

Implementations SHOULD validate:
1. Manifest JSON schema
2. Required files present
3. Context item references valid
4. Hash integrity (if present)
5. Citation references valid

### 13.3 Certification

Conformant implementations may apply for certification at [tezit.com/certification](https://tezit.com/certification).

---

## Appendix A: JSON Schemas

Full JSON schemas are available at:
- [tezit.com/spec/v1/manifest.schema.json](https://tezit.com/spec/v1/manifest.schema.json)
- [tezit.com/spec/v1/conversation.schema.json](https://tezit.com/spec/v1/conversation.schema.json)
- [tezit.com/spec/v1/params.schema.json](https://tezit.com/spec/v1/params.schema.json)

## Appendix B: Example Bundle

A complete example bundle is available at:
[github.com/tezit-protocol/spec/examples/acme-analysis](https://github.com/tezit-protocol/spec/examples/acme-analysis)

## Appendix C: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2026-02-05 | Added Section 1.6 Core Principles. Added Section 1.7 Tez Profiles (knowledge, messaging, decision, handoff). Added `profile` and `surface` fields to manifest schema. Added `tezit-facts` and `tezit-relationships` standard extensions (Section 8.3.1, 8.3.2). |
| 1.0 | 2026-01-26 | Initial specification |

---

*This specification is licensed under CC BY 4.0.*
