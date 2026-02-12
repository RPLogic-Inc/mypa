# Tezit Protocol Specification

**Version**: 1.2.4
**Status**: Draft
**Last Updated**: February 5, 2026
**Website**: [tezit.com/spec](https://tezit.com/spec)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the Tezit Protocol, an open standard for bundling and transmitting knowledge artifacts that preserve reasoning context alongside synthesis.

### 1.2 Scope

This specification covers:
- Tez bundle format and structure (including Inline Tez)
- Manifest schema
- Context packaging
- Synthesis and citation format
- Interrogation overview
- Forking and lineage
- Permissions and security
- Versioning and compatibility
- Extension mechanisms

This specification does NOT cover:
- Specific AI models or implementations
- Authentication/authorization protocols (use existing standards)
- Storage backends (implementation-specific)
- UI/UX guidelines

**Non-normative note**: The 19-week RAGU plan implements internal Tez assembly and enterprise sharing only. External Tezit.com connectivity is out of scope for that plan.

### 1.2.1 Known Implementers

The following platforms have implemented or are actively implementing the Tezit Protocol:

| Platform | Type | Status | Notes |
|----------|------|--------|-------|
| **MyPA.chat** | Personal AI assistant | v1.2 (active) | First implementer. Consumer-facing personal assistant with Tez creation and interrogation. |
| **Ragu Platform** | Enterprise AI orchestration | v1.0/1.1 (implemented), v1.2 (aligning). Contributed Coordination Profile, Code Review Profile, and TIP Enterprise Addendum specifications. Delivered 44-test conformance suite covering Levels 0-3, TIP compliance, and round-trip validation. Built production-grade reference implementations: tez:// URI scheme, tezit-facts, tezit-relationships, TIP session/citation/classification, and validation engine. Delivered 4 JSON Schema files for code review findings, code review surface, coordination surface, and enterprise TIP evaluation metrics. | Second implementer. Enterprise platform with 11 microservices, agentic RAG pipeline, fine-grained authorization (OpenFGA), and multi-model support. |

Implementers are encouraged to register at [tezit.com/implementers](https://tezit.com/implementers) for interoperability testing and specification feedback.

### 1.3 Companion Specifications

The following companion documents extend the Tezit Protocol with detailed protocol-level specifications:

| Document | Description | Status |
|----------|-------------|--------|
| **Tez Interrogation Protocol (TIP)** | Detailed wire protocol for interrogation sessions, including streaming, session management, and multi-turn grounded Q&A | Stable (v1.0.3) |
| **Tez HTTP API** | RESTful API specification for creating, sharing, interrogating, and managing tezits over HTTP | Stable (v1.0) |
| **`tez://` URI Scheme** | URI scheme for referencing tezits, context items, and specific locations within tezits (e.g., `tez://acme-analysis/context/doc-001:p12`) | Stable |
| **Coordination Profile Specification** | Full specification for the Coordination Profile (tasks, decisions, questions, blockers) with status state machine, dependency modeling, periodic review cadence, escalation patterns, and dashboard aggregation | v1.1-draft (Ragu Platform) |
| **Code Review Profile Specification** | Profile specification for code review workflows with structured findings, severity levels, code-specific citations, fork semantics, and integration guidance | v0.2.0 Proposed (Ragu Platform) |
| **TIP Enterprise Addendum** | Enterprise extensions to TIP: streaming SSE protocol, FGA-scoped interrogation, retrieval transparency, multi-pass retrieval, multi-tenant isolation, high-throughput guidance, and tezit-eval quality metrics | v1.1-draft (Ragu Platform) |

These companion specs build on the core protocol defined here. Implementations MAY support any combination of companion specs.

### 1.4 Conformance Levels

The Tezit protocol recognizes four conformance levels to support progressive adoption. The practice of sharing context with synthesis ("teziting") does not require tooling or formal structure.

#### 1.4.1 Level 0 -- Inline Tez

**Definition:** A single Markdown file with YAML frontmatter that contains synthesis, context references, and metadata. This is the simplest possible Tez -- someone can create one in 30 seconds with any text editor.

**Requirements:** A single `.md` file with valid YAML frontmatter containing at minimum:
- `tezit` version field
- `title`
- `profile`

**Format:**

```markdown
---
tezit: "1.2"
title: "Q4 Budget Analysis"
profile: knowledge
creator:
  name: "Jane Smith"
  email: "jane@company.com"
context:
  - url: "https://docs.google.com/spreadsheets/d/abc123"
    label: "Q4 Budget Spreadsheet"
  - file: "./email-thread.pdf"
    label: "CFO Email Thread"
permissions:
  interrogate: true
  fork: true
---

# Q4 Budget Analysis

Infrastructure costs exceeded target by 18% [[Q4 Budget Spreadsheet:Sheet2]].
The CFO flagged this concern in October [[CFO Email Thread:p2]]...
```

**YAML Frontmatter Schema (Inline Tez):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tezit` | string | Yes | Protocol version (e.g., "1.2") |
| `title` | string | Yes | Human-readable title |
| `profile` | string | Yes | Tez profile (`knowledge`, `messaging`, etc.) |
| `creator.name` | string | No | Creator's name |
| `creator.email` | string | No | Creator's email |
| `context` | array | No | List of context references |
| `context[].url` | string | No | URL to external context source |
| `context[].file` | string | No | Relative path to local file |
| `context[].label` | string | Yes (per item) | Human-readable label for the context item |
| `permissions.interrogate` | boolean | No | Whether recipients can interrogate (default: true) |
| `permissions.fork` | boolean | No | Whether recipients can fork (default: true) |
| `tags` | array | No | Classification tags |

> **Field naming note**: In `manifest.json`, the field is `tezit_version`. In Inline Tez YAML frontmatter, the abbreviated form `tezit` is used. Both refer to the protocol version and are semantically equivalent. The abbreviated form improves brevity in hand-authored Markdown; the explicit form improves clarity in machine-generated JSON.

**Citation in Inline Tez:** Citations use the same double-bracket syntax as other conformance levels, but reference context items by their `label` rather than by `item-id`:
- `[[Q4 Budget Spreadsheet]]` -- reference by label
- `[[Q4 Budget Spreadsheet:Sheet2]]` -- with location specifier
- `[[CFO Email Thread:p2]]` -- page reference by label

**Platform support:** Tezit.com and compatible tools can import Inline Tezits by:
1. Parsing YAML frontmatter for metadata
2. Treating the Markdown body as the synthesis
3. Resolving context references (fetching URLs, locating local files)
4. Generating a full manifest automatically if upgrading to Level 2+

**When to use:** Quick knowledge sharing, personal notes with context, lightweight analysis, email attachments, pasting into chat. This is the "curl | bash" of Tezit -- minimal ceremony, maximum accessibility.

#### 1.4.2 Level 1 -- Informal Tez

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

**Platform support:** Tezit.com can import informal tezits. The platform will:
1. Detect files and infer structure
2. Identify the likely synthesis document (README, tez.md, or largest markdown/doc file)
3. Generate a manifest automatically
4. Enable interrogation against the imported context

**Interoperability:** Informal tezits are not portable between platforms without manual intervention, but they represent the natural starting point for the practice.

#### 1.4.3 Level 2 -- Portable Tez

**Definition:** A Tez with minimal manifest enabling tool recognition and basic interoperability.

**Requirements:** A `manifest.json` file with these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tezit_version` | string | Yes | Protocol version (e.g., "1.2") |
| `id` | string | Yes | Unique identifier |
| `title` | string | Yes | Human-readable name |
| `created_at` | string | Yes | ISO 8601 timestamp |
| `synthesis.file` | string | Yes | Path to synthesis document |

**Minimal manifest example:**
```json
{
  "tezit_version": "1.2",
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

**Interoperability:** Portable tezits can be moved between compatible platforms with basic functionality preserved.

#### 1.4.4 Level 3 -- Platform Tez

**Definition:** A fully-specified Tez conforming to the complete manifest schema (Section 3), enabling all platform features.

**Requirements:** Full manifest per Section 3.1, including:
- Complete creator metadata
- Typed context items with hashes
- Conversation record (if applicable)
- Permissions and lineage

**Platform support:** Full feature access including:
- Grounded interrogation with citation verification
- Fork tracking and lineage visualization
- Version history
- Access analytics
- Collaboration features

**When to use:** Platform tezits are generated automatically when using Tezit.com or compatible tools. Manual creation is not expected.

#### 1.4.5 Upgrade Path

Tezits naturally upgrade as they move through the ecosystem:

```
Inline Tez (Level 0)  →  Import to platform  →  Platform Tez (Level 3)
(single .md file)         (auto-manifest)        (full features)

Informal Tez (Level 1) →  Import to platform  →  Platform Tez (Level 3)
(folder + intent)          (auto-manifest)        (full features)
     ↓
Export for sharing     →  Portable Tez (Level 2)
(minimal manifest)        (cross-platform)
```

The protocol is designed so that users never need to manually write manifests. The practice ("I'll tezit it over -- here's my analysis with the sources") comes first; formalization happens through tooling.

### 1.5 Conformance Validation

An implementation is **Tezit-conformant** if it:
1. Produces bundles that validate against this specification (at any conformance level)
2. Consumes bundles that conform to this specification (at any conformance level)
3. Preserves all present fields during round-trip operations
4. Handles unknown extensions gracefully
5. Clearly indicates which conformance level a bundle meets

### 1.6 Terminology

- **MUST**, **MUST NOT**, **REQUIRED**: Absolute requirements
- **SHOULD**, **SHOULD NOT**, **RECOMMENDED**: Best practices
- **MAY**, **OPTIONAL**: Truly optional features

#### 1.6.1 Naming Conventions

- **Tez**: A single knowledge bundle (singular noun)
- **tezits**: Multiple knowledge bundles (plural noun). Note: the plural is "tezits", NOT "tezzes"
- **Tezit**: The protocol, platform, and brand name. Also used as a verb: *"I'll tezit it over"* means to share context along with synthesis -- to send someone not just your conclusion but the evidence behind it
- **teziting**: The gerund form. The practice of sharing context-bundled knowledge. *"She was teziting the research to the legal team"*

### 1.7 Core Principles

The Tezit Protocol is built on several foundational principles:

#### 1.7.1 The Library of Context

**Original content is preserved forever. Display is regenerable.**

When source materials are added to a Tez -- voice recordings, documents, raw data -- these **artifacts** are sacred and immutable. The exact words chosen, the original formatting, the raw data values should never be discarded or modified.

However, how this content is **displayed** to recipients can be regenerated, reformatted, summarized, or expanded based on their needs. The synthesis (tez.md) interprets artifacts; the artifacts themselves remain pristine.

This principle enables:
- Recipients can always access original sources
- Summaries can be regenerated with different AI models
- Audit trails maintain provenance
- "Trust but verify" through source access

#### 1.7.2 Context Travels with Synthesis

A Tez is not a document with attachments. It is a **complete unit of understanding** where synthesis and supporting context are inseparable. When you share a Tez, recipients receive not just your conclusion but the evidence that supports it.

#### 1.7.3 Interrogation Over Trust

The defining feature of a Tez is that recipients can **interrogate** it -- asking questions that AI answers from the transmitted context alone. This transforms communication from "trust my summary" to "verify against my sources."

#### 1.7.4 Grounded Responses

When interrogating a Tez, AI responses MUST be grounded in transmitted context with verifiable citations. Claims without citations are flagged. Information not in context is explicitly noted as unavailable.

### 1.8 Tez Profiles

The Tez protocol supports multiple **profiles** -- consumption patterns optimized for different use cases. The same underlying structure (context, artifacts, synthesis) serves different communication needs.

#### 1.8.1 Knowledge Profile (Default)

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

#### 1.8.2 Coordination Profile

> See the **Coordination Profile Specification** companion document (`TEZ_COORDINATION_PROFILE.md`, Ragu Platform contribution) for the full specification including status state machines, dependency modeling, periodic review cadence, escalation patterns, context trails, and dashboard aggregation.

**Use case**: Team collaboration -- actionable items (tasks, decisions, questions, blockers) backed by the communication context that produced them.

**Characteristics**:
- **Surface** is an actionable item with structured metadata:
  - `item_type`: `task`, `decision`, `question`, or `blocker`
  - `status`: `pending`, `acknowledged`, or `completed`
  - `assignee`: person responsible for the item
  - `due_date`: optional deadline
- **Context** provides the communication history that produced the item (voice memos, chat messages, meeting notes, email threads)
- **Interrogation** focus: "what was decided?", "what's the background?", "what are the dependencies?"
- **Multiple recipients with roles**: `assignee` (owns the item), `reviewer` (approves or validates), `informed` (kept in the loop)
- **Status tracking** as first-class metadata -- updates to status are versioned and auditable

**Example**: A product team standup produces a blocker. The Tez captures the blocker as the surface item, with the voice memo from standup, related Slack thread, and sprint board screenshot as context. The assignee's PA can answer "why is this blocked?" and "what was the original decision that led here?" from the transmitted context.

**Manifest indicator**:
```json
{
  "profile": "coordination",
  "surface": {
    "item_type": "blocker",
    "title": "Auth service migration blocked on legacy SAML adapter",
    "status": "pending",
    "assignee": {
      "name": "Marcus Chen",
      "email": "marcus@company.com",
      "role": "assignee"
    },
    "due_date": "2026-02-14",
    "recipients": [
      { "name": "Marcus Chen", "role": "assignee" },
      { "name": "Priya Patel", "role": "reviewer" },
      { "name": "Engineering Leads", "role": "informed" }
    ]
  }
}
```

**Surface field schema (coordination profile)**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `surface.item_type` | string | Yes | `task`, `decision`, `question`, or `blocker` |
| `surface.title` | string | Yes | Human-readable description of the actionable item |
| `surface.status` | string | Yes | `pending`, `acknowledged`, or `completed` |
| `surface.assignee` | object | No | Primary person responsible (`name`, `email`, `role`) |
| `surface.due_date` | string | No | ISO 8601 date for the deadline |
| `surface.recipients` | array | No | List of recipients with `name` and `role` (`assignee`, `reviewer`, `informed`) |

#### 1.8.3 Code Review Profile (Draft Specification)

> **Status**: Draft Specification -- contributed by the Ragu Platform team. This profile is seeking implementer feedback and may evolve based on adoption experience. See the **Code Review Profile Specification** companion document (`TEZ_CODE_REVIEW_PROFILE.md`) for the complete profile including finding schemas, code-specific citation formats, fork semantics for review workflows, and integration guidance for GitHub/GitLab and IDEs.

**Use case**: AI-assisted code review and technical review workflows

**Characteristics**:
- **Surface** presents review findings, recommendations, and approval/rejection status
- **Context** includes source code files, AI dialogue (review conversation), git diffs, test results, and lint output
- **Interrogation** focus: "Why was this code flagged?", "What's the severity of this finding?", "What alternative was suggested?" -- answered from the review context
- Review findings are structured with severity, category, and file location
- Supports multi-reviewer workflows where each reviewer's findings are independently interrogable

**Example**: A pull request review where the AI flags a potential SQL injection vulnerability. The Tez captures the finding as the surface, with the source code diff, the AI's analysis conversation, existing test coverage, and lint output as context. A developer can interrogate: "Why was line 47 flagged?" and receive a grounded answer citing the specific code pattern and the security rule that triggered the finding.

**Manifest indicator**:
```json
{
  "profile": "review",
  "surface": {
    "review_type": "code_review",
    "status": "changes_requested",
    "findings_count": 3,
    "severity_summary": {
      "critical": 1,
      "warning": 2,
      "info": 0
    },
    "target": {
      "repository": "acme/auth-service",
      "pull_request": 142,
      "base_ref": "main",
      "head_ref": "feature/oauth-migration"
    }
  }
}
```

**Surface field schema (review profile)**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `surface.review_type` | string | Yes | `code_review`, `design_review`, `security_review`, `architecture_review` |
| `surface.status` | string | Yes | `approved`, `changes_requested`, `rejected`, `pending` |
| `surface.findings_count` | integer | No | Total number of review findings |
| `surface.severity_summary` | object | No | Count of findings by severity (`critical`, `warning`, `info`) |
| `surface.target` | object | No | What is being reviewed (repository, PR, document, etc.) |

#### 1.8.4 Profile Interoperability

Profiles are **hints**, not barriers. Any Tez can be interrogated regardless of profile. The profile indicates the *intended* consumption pattern, not a restriction.

Implementations SHOULD:
- Support all defined profiles
- Default UI based on profile (interrogation for knowledge, threading for messaging, action tracking for coordination)
- Allow users to switch consumption modes

#### 1.8.5 Future Profiles

The protocol is extensible to additional profiles:
- **Decision**: Structured choices with trade-offs and parameters
- **Handoff**: Responsibility transfer with full context
- **Learning**: Educational content with interrogable depth
- **Negotiation**: Deal terms with parameters and counter-Tez support

Profile specifications are maintained in the extension registry. See also **Appendix A** for the experimental Messaging Profile.

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
└── extensions/             # OPTIONAL
    └── {extension-id}/
```

Note: An Inline Tez (Level 0) does not use this directory structure -- it is a single `.md` file. See Section 1.4.1.

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

### 2.4 Validation

Machine-parseable JSON Schemas for validating Tez bundles are available at:
- **Manifest**: [`https://tezit.com/spec/v1.2/manifest.schema.json`](https://tezit.com/spec/v1.2/manifest.schema.json)
- **Conversation**: [`https://tezit.com/spec/v1.2/conversation.schema.json`](https://tezit.com/spec/v1.2/conversation.schema.json)
- **Parameters**: [`https://tezit.com/spec/v1.2/params.schema.json`](https://tezit.com/spec/v1.2/params.schema.json)
- **Inline Tez**: [`https://tezit.com/spec/v1.2/inline.schema.json`](https://tezit.com/spec/v1.2/inline.schema.json)

These schemas are also available in the `schemas/` directory of the [spec repository](https://github.com/tezit-protocol/spec). Implementations SHOULD validate bundles against these schemas during import and export. See also Appendix E for the full list.

---

## 3. Manifest Schema

### 3.1 Full Schema

```json
{
  "$schema": "https://tezit.com/spec/v1.2/manifest.schema.json",
  "tezit_version": "1.2",
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

  "profile": "string (OPTIONAL: 'knowledge' | 'messaging' | 'coordination' | 'code_review' | 'review' | 'decision' | 'handoff')",

  "surface": "object (OPTIONAL, profile-specific surface metadata; structure defined by profile)",

  "synthesis": {
    "title": "string (REQUIRED)",
    "type": "string (REQUIRED)",
    "file": "string (REQUIRED, relative path)",
    "abstract": "string (OPTIONAL, max 500 chars)",
    "language": "string (OPTIONAL, BCP 47 tag)",
    "supplementary": {
      "type": "object (OPTIONAL)",
      "description": "Additional machine-readable files associated with the synthesis (e.g., findings.json for code reviews)",
      "additionalProperties": "string (relative path)"
    }
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

Note: The `parameters` field from v1.1 is moved to an experimental extension. See Appendix B (Parameters & Negotiation). The `surface` field remains in the core schema as an optional, profile-specific object. Its structure varies by profile -- see Section 1.8.2 (Coordination), Section 1.8.3 (Code Review), and Appendix A (Messaging) for profile-specific surface schemas.

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
- `review`: Review, critique, or code review findings
- `coordination`: Coordination profile items (tasks, decisions, questions, blockers)
- `tutorial`: Educational content
- `custom`: Implementation-defined

### 3.4 Context Scopes

- `full`: All accessible materials were searched and relevant items included.
  *Example*: A legal due diligence Tez where the entire document room was indexed. The creator's platform searched every available document and included all items that matched relevance criteria. Recipients can trust that omissions reflect irrelevance, not oversight.
- `focused`: Context was auto-expanded from entities, topics, or relationships mentioned in the synthesis.
  *Example*: A team coordination card where related voice memos and messages were automatically pulled in based on mentioned people and topics. The platform started with a specific item and discovered related context by following entity and topic references.
- `private`: Only explicitly provided items are included.
  *Example*: A personal research Tez where the creator hand-picked specific papers and data sources. No automated discovery or expansion was performed. The context represents a deliberate, curated selection.
- `custom`: Implementation-defined scoping. Implementations using this value SHOULD document their scoping strategy in the synthesis or extension metadata.

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

#### 4.2.1 Extended Element References

Citations MAY include an additional element specifier to reference specific elements within a location. The general pattern is `[[item-id:location:element]]`.

**Element reference formats:**
- `[[item-id:p12:table-3]]`: Table 3 on page 12
- `[[item-id:p12:figure-1]]`: Figure 1 on page 12
- `[[item-id:section-3.2:para-4]]`: Paragraph 4 of section 3.2
- `[[item-id:p5:equation-2]]`: Equation 2 on page 5
- `[[item-id:p8:footnote-7]]`: Footnote 7 on page 8

**Standard element type prefixes:**

| Prefix | Element Type | Example |
|--------|-------------|---------|
| `table-` | Table | `[[report:p12:table-3]]` |
| `figure-` | Figure or image | `[[report:p12:figure-1]]` |
| `para-` | Paragraph | `[[report:section-3.2:para-4]]` |
| `equation-` | Equation | `[[report:p5:equation-2]]` |
| `footnote-` | Footnote | `[[report:p8:footnote-7]]` |
| `listing-` | Code listing | `[[report:p15:listing-1]]` |

Element references are OPTIONAL extensions. Implementations that do not support element-level resolution SHOULD fall back to the location-level reference (e.g., treat `[[item-id:p12:table-3]]` as equivalent to `[[item-id:p12]]`).

For Inline Tezits (Level 0), citations reference context items by their `label` field rather than by `item-id`. See Section 1.4.1.

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

## 5. Context Packaging

### 5.1 File Organization

Context items MUST be stored in the `context/` directory:
```
context/
├── doc-001.pdf
├── doc-002.docx
├── email-001.eml
├── data-001.json
└── image-001.png
```

### 5.2 File Naming

Item files MUST be named `{item-id}.{extension}` where:
- `item-id` matches the manifest entry
- `extension` reflects the actual file type

### 5.3 Large Files

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

### 5.4 Integrity Verification

Content hashes SHOULD use SHA-256:
```json
{
  "id": "doc-001",
  "hash": "sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b"
}
```

---

## 6. Interrogation

Interrogation is the process by which a recipient asks questions about a Tez and receives answers grounded in the transmitted context. This is the core consumption mechanism that enables "trust but verify."

For the full wire protocol, session management, and streaming specification, see the companion **Tez Interrogation Protocol (TIP)** document.

### 6.1 Grounded Response Requirement

When interrogating a Tez, AI responses MUST be grounded in the transmitted context:

1. **Context-only answering**: The AI MUST answer from the context items in the Tez bundle, not from general training knowledge
2. **Explicit limitations**: If the context doesn't contain information to answer a question, the AI MUST say so explicitly
3. **No hallucination**: Factual claims MUST be verifiable against transmitted context

### 6.2 Citation Requirements

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

### 6.3 Interrogation Protocol

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

### 6.4 Implementation Requirements

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

### 6.5 Citation Verification Requirements

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

### 6.6 Interrogation vs. General Chat

| Aspect | Interrogation | General Chat |
|--------|---------------|--------------|
| Knowledge source | Context items only | Full model training |
| Citations | Required | Optional |
| "I don't know" | Expected when context lacks info | Rare |
| Trust model | Verifiable | Trust the AI |
| Purpose | Recipient verification | General assistance |

### 6.7 Reframing

Reframing is a specialized form of interrogation that re-synthesizes the Tez from a different perspective:

**Example reframe request**:
> "Reframe this from the legal team's perspective, focusing on liability and compliance."

**Reframing requirements**:
- MUST use only transmitted context
- MUST maintain citations
- MAY produce a new synthesis document
- MUST NOT introduce new factual claims

### 6.8 Interrogation Hosting

When a Tez is shared, recipients need compute resources to interrogate it. The protocol supports multiple hosting models to balance convenience, cost, and control.

#### Hosting Models

| Model | Description | Use Case |
|-------|-------------|----------|
| **Sender-Hosted** | Sender's platform provides compute for recipients | Convenience for external recipients (e.g., lawyers, clients) |
| **Recipient-Hosted** | Recipient uses their own platform/compute | Organizations with their own AI infrastructure |
| **Platform-Hosted** | Tezit.com or similar platform hosts interrogation | Public tezits, individual users |

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
- Recipient platform MUST implement interrogation per Section 6.1-6.6
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
1. Click share link -- see Tez with interrogation interface
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

### 6.9 Multi-Model Considerations

Tezits are model-agnostic by design. Any AI model capable of grounded question-answering can power interrogation. However, implementations should account for the following when supporting multiple model backends.

#### Minimum Model Requirements

Models used for interrogation MUST:
- Support a context window of at least 32K tokens (to accommodate manifest, synthesis, and retrieved context chunks in a single prompt)
- Follow system prompt instructions reliably, particularly the grounding constraint (Section 6.4) that restricts answers to transmitted context

Models that do not meet these requirements SHOULD NOT be offered for interrogation, as grounding quality degrades significantly below these thresholds.

#### Recommended Models Hint

Senders MAY include a `recommended_models` field in the manifest as a non-binding hint to recipient platforms:

```json
{
  "interrogation": {
    "recommended_models": ["claude-sonnet-4", "gpt-4o", "gemini-2.0-pro"],
    "min_context_window": 32000
  }
}
```

This field is advisory. Recipient platforms are free to use any model that meets the minimum requirements. The hint helps platforms select an appropriate model when multiple are available.

#### Citation Accuracy Across Models

Citation accuracy varies across model families. Some models are more reliable at producing valid `[[item-id:location]]` references than others. To mitigate this:

- Platforms SHOULD post-process all interrogation responses to verify that cited item IDs exist in `context.items` and that location specifiers reference valid positions (see Section 6.5)
- Platforms SHOULD NOT expose unverified citations to recipients
- Platforms MAY maintain per-model accuracy metrics to inform model selection

#### Large Context Handling

When a Tez's context exceeds the model's context window, implementations SHOULD apply retrieval-augmented generation (RAG) and chunking strategies as specified in the companion **Tez Interrogation Protocol (TIP)** specification. Key considerations:

- Chunk context items using format-specific strategies (Section 6.5, Format-Specific Chunking table)
- Retrieve the most relevant chunks for each query via embedding similarity or keyword search
- Include the synthesis (`tez.md`) in every prompt to maintain grounding in the sender's framing
- When relevant context may span multiple chunks, implementations SHOULD use multi-pass retrieval

---

## 7. Forking

Forking creates a new Tez derived from an existing one, enabling counter-arguments, alternative analyses, and collaborative evolution.

### 7.1 Fork Metadata

When a Tez is forked, the new Tez MUST include lineage information:

```json
{
  "lineage": {
    "forked_from": "acme-analysis-2026-01",
    "fork_count": 0,
    "related": []
  }
}
```

### 7.2 Fork Types

- **Counter-Tez**: Challenges or rebuts the original synthesis with additional evidence
- **Extension**: Builds upon the original with new context or deeper analysis
- **Reframe**: Re-synthesizes from a different perspective (see Section 6.7)
- **Update**: Supersedes the original with updated information

### 7.3 Fork Permissions

Forking is controlled by the `permissions.fork` field. When `false`, implementations SHOULD NOT allow forking (advisory, not enforceable for downloaded bundles).

---

## 8. Versioning

### 8.1 Protocol Versioning

Protocol version format: `{major}.{minor}`

- **Major**: Breaking changes
- **Minor**: Backward-compatible additions

### 8.2 Bundle Versioning

Bundle version is an incrementing integer starting at 1.

When updating a Tez:
1. Increment `version`
2. Update `updated_at`
3. Preserve `id` and `created_at`

### 8.3 Living Document Versioning

Tezits MAY be configured as **living documents** with linked context sources that update automatically.

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

Implementations SHOULD warn users when interrogating stale tezits.

#### 8.3.1 Living Document Failure Modes

Linked sources may become unavailable or degrade over time. Implementations SHOULD handle these failure modes gracefully.

**Source Unavailable**

When a linked source is deleted, access is revoked, or the source endpoint becomes unreachable, the context item SHOULD report status `"unavailable"` with a `last_successful_sync` timestamp. The implementation SHOULD fall back to the last known good snapshot of the content.

**Degraded Context**

Tezits with one or more stale or unavailable linked sources SHOULD include a `context_freshness` assessment in the manifest, indicating which items are current and which are degraded.

**Freshness Warnings in TIP Responses**

Interrogation responses from tezits with stale or unavailable linked sources SHOULD include a freshness warning. This enables recipients to judge whether the information may be outdated before relying on it.

**Context item status schema:**

```json
{
  "context_item_status": {
    "revenue-model": {
      "source_status": "unavailable",
      "last_successful_sync": "2026-01-20T10:00:00Z",
      "fallback": "last_known_good",
      "degraded": true
    }
  }
}
```

**Source status values:**

| Status | Meaning |
|--------|---------|
| `current` | Source is reachable and content is up to date |
| `stale` | Source is reachable but content has not been synced within the expected frequency |
| `unavailable` | Source is unreachable (deleted, access revoked, endpoint down) |
| `error` | Sync attempted but failed due to an error |

**Fallback values:**

| Fallback | Meaning |
|----------|---------|
| `last_known_good` | Use the most recent successfully synced snapshot |
| `none` | No fallback available; context item is effectively missing |

### 8.4 Version Pinning

Recipients MAY pin to a specific version:

```json
{
  "sharing": {
    "version_policy": "latest",
    "pinned_version": 3
  }
}
```

| Policy | Behavior |
|--------|----------|
| `latest` | Recipients always see current version |
| `pinned` | Recipients see specific version until explicitly updated |

### 8.5 Compatibility

Implementations MUST:
- Reject bundles with unsupported major version
- Process bundles with unknown minor version (ignoring unknown fields)
- Preserve unknown fields during round-trip

---

## 9. Permissions

### 9.1 Permission Fields

Permissions are specified in the manifest:

```json
{
  "permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false,
    "commercial_use": false,
    "license": "CC-BY-4.0"
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `interrogate` | `true` | Whether recipients can interrogate the Tez |
| `fork` | `true` | Whether recipients can create derivative tezits |
| `reshare` | `false` | Whether recipients can share with others |
| `commercial_use` | `false` | Whether the Tez can be used commercially |
| `license` | none | SPDX license identifier |

### 9.2 Advisory Nature

Permission fields are **advisory**, not enforceable. Once a recipient has downloaded a Tez bundle, technical enforcement is not possible. Implementations SHOULD respect permissions and clearly display them to users.

---

## 10. Security Considerations

### 10.1 Content Integrity

- All context items SHOULD include cryptographic hashes
- Manifests MAY be signed (see `tezit-signing` extension)
- Implementations SHOULD verify hashes on consumption

### 10.2 Sensitive Content

- Implementations MUST NOT include credentials in bundles
- PII SHOULD be redacted when appropriate
- Conversation redaction SHOULD be supported

### 10.3 Access Control

- Permission fields are advisory, not enforceable
- Implementations SHOULD respect permissions
- Authentication is out of scope (use existing standards)

### 10.4 External References

- External URIs SHOULD use HTTPS
- External content MUST be verified by hash
- Implementations MAY refuse external references

---

## 11. Extensions

### 11.1 Extension Mechanism

Extensions allow protocol enhancement without breaking compatibility.

Extension structure:
```
extensions/
└── {extension-id}/
    ├── manifest.json    # Extension manifest
    └── {files}          # Extension-specific files
```

### 11.2 Extension Manifest

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

### 11.3 Standard Extensions

Reserved extension IDs:
- `tezit-analytics`: Usage analytics
- `tezit-collaboration`: Multi-author support
- `tezit-presentation`: Slide generation
- `tezit-signing`: Cryptographic signatures
- `tezit-encryption`: End-to-end encryption
- `tezit-facts`: Structured facts extraction
- `tezit-relationships`: Entity relationship mapping
- `tezit-messaging`: Messaging Profile support (see Appendix A)
- `tezit-parameters`: Parameters and negotiation (see Appendix B)

### 11.4 Custom Extensions

Custom extensions SHOULD use reverse-domain naming:
- `com.example.custom-feature`
- `org.company.internal-tool`

### 11.5 Extension Registry

The canonical extension registry is maintained at [github.com/tezit-protocol/spec/extensions/](https://github.com/tezit-protocol/spec/extensions/).

#### Contribution Process

Extensions are contributed via pull request to the spec repository. Each extension PR MUST include:

1. **Extension manifest** (`manifest.json`) per Section 11.2
2. **Specification document** describing the extension's schema, behavior, and use cases
3. **At least one example** demonstrating the extension in a Tez bundle
4. **Compatibility notes** indicating which conformance levels and profiles the extension applies to

#### Namespace Conventions

| Namespace Pattern | Usage | Example |
|-------------------|-------|---------|
| `tezit-*` | Standard extensions maintained by the Tezit Protocol community | `tezit-signing`, `tezit-facts` |
| `{reverse-domain}.*` | Vendor-specific extensions | `com.ragu.workflow`, `com.ragu.authorization` |

Vendor namespaces use reverse domain notation (e.g., `com.ragu.*` for extensions contributed by the Ragu Platform). Vendor extensions MAY be proposed for standardization through the lifecycle process below.

#### Extension Lifecycle

| Stage | Description | Requirements |
|-------|-------------|-------------|
| **Draft** | Initial proposal, under active development | PR opened with basic specification |
| **Proposed** | Specification complete, seeking implementer feedback | At least one reference implementation |
| **Standard** | Stable, widely implemented, part of the official registry | Two or more independent implementations, community review passed |
| **Deprecated** | Superseded or no longer recommended | Migration guide to replacement (if any) |

Extensions in the **draft** and **proposed** stages MAY change without notice. Extensions at the **standard** stage follow the same versioning guarantees as the core protocol (Section 8.1).

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
1. Manifest JSON schema (Level 2+) or YAML frontmatter (Level 0)
2. Required files present
3. Context item references valid
4. Hash integrity (if present)
5. Citation references valid

### 13.3 Certification

Conformant implementations may apply for certification at [tezit.com/certification](https://tezit.com/certification).

---

## 14. v1.3 Proposed Features

> **Non-normative note**: These proposals are accepted for design consideration in v1.3. They are not yet normative.

The following features have been proposed and accepted for design consideration in the next minor protocol version. Each was contributed by an active implementer and addresses a concrete gap identified during implementation.

### 14.1 Bundle Signature Verification

**Proposed by:** Ragu Platform

Introduces a `manifest.signature` field enabling recipients to verify bundle integrity without trusting transport.

**Mechanism:**
- **Algorithm**: ed25519
- **Fields**: `algorithm`, `public_key`, `signed_fields`
- **Signed content**: Manifest hash, context item hashes, synthesis hash

**Use case**: When tezits are shared across organizational boundaries or through untrusted channels, recipients need assurance that the bundle has not been tampered with in transit. This complements the existing `tezit-encryption` extension by providing integrity verification independent of encryption.

### 14.2 Interrogation Session Transfer

**Proposed by:** Ragu Platform

Introduces a `session_transfer` mechanism for sharing interrogation sessions when resharing tezits (with explicit consent).

**Mechanism:**
- **Scope options**: `full` (entire session), `summary` (AI-generated summary of session), `questions_only` (questions without answers)
- **Consent**: Requires explicit opt-in from the original interrogator
- **Privacy**: Sessions are stripped of identifying metadata unless the interrogator consents to attribution

**Use case**: When a recipient interrogates a Tez and then reshares it, the next recipient benefits from knowing what questions were already asked. This avoids redundant interrogation and surfaces the "path of inquiry" that led the previous recipient to their conclusions.

### 14.3 Context Item Versioning

**Proposed by:** Ragu Platform

Introduces per-item `version`, `previous_hash`, and `updated_at` fields within context items.

**Mechanism:**
- **Per-item fields**: `version` (integer), `previous_hash` (hash of prior version), `updated_at` (ISO 8601 timestamp)
- **Sync optimization**: Recipients can compare hashes and fetch only changed items
- **Diff visualization**: Platforms can show what changed between context item versions

**Use case**: For living document tezits (Section 8.3), context items update over time. Without per-item versioning, recipients must re-download the entire context on every sync. With versioning, platforms can perform efficient incremental sync and show recipients exactly what changed since their last view.

---

## Appendix A: Messaging Profile (Experimental)

> **Status**: Experimental -- this profile is under active development and may change significantly in future versions. It is not part of the core protocol and implementations are not required to support it.

### A.1 Overview

The Messaging Profile optimizes the Tez format for human communication with rich context -- from team coordination to personal plans.

### A.2 Characteristics

- Surface message is concise (like a text/Slack/WhatsApp message)
- Context provides depth *beneath* the message
- **Absorption** into recipient's PA/memory is common consumption
- Recipient's PA can use context to help formulate response
- Threading for conversation flow
- Real-time or near-real-time exchange

### A.3 Examples

**Example 1 -- Personal**:

Surface: *"Want to see a movie this weekend?"*

Context beneath:
- Sender's availability: Saturday after 5pm, Sunday anytime
- Movies interested in: Dune 3, the new Pixar film, "that thriller you mentioned"
- Acceptable theaters: AMC Downtown, Regal Westside, the indie theater on 5th
- Showtimes cross-referenced with availability
- Preference: IMAX if Dune, regular for others
- Note: "I'll drive if we go to AMC"

The recipient sees a simple text. Their PA sees the full context and can instantly surface: *"They're free Saturday after 5. Dune 3 plays at 7:15 at AMC in IMAX -- that works for both of you and they'll drive."*

**Example 2 -- Professional**:

Surface: *"Can you review the budget proposal?"*

Context beneath:
- Why asking: Budget deadline Friday, CFO watching closely
- What to focus on: Infrastructure costs, "miscellaneous" line items
- Background: Follows August planning meeting commitments
- Why this recipient: They caught the infrastructure overrun last quarter

### A.4 Manifest Extension

To use the Messaging Profile, include the `surface` field and set `profile: "messaging"`:

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

**Surface field schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `surface.message` | string | Yes (for messaging profile) | The human-readable surface message |
| `surface.tone` | string | No | `formal`, `casual`, `urgent`, `friendly`, `neutral` |
| `surface.urgency` | string | No | `critical`, `high`, `normal`, `low`, `fyi` |
| `surface.actionRequested` | string | No | What the sender wants the recipient to do |

### A.5 Key Insight

Both sender and recipient just want to exchange *"want to see a movie?" / "sure, how about Saturday?"* -- the natural human conversation. But beneath that surface, their PAs are negotiating availability, preferences, and logistics. The Tez carries the context that makes the simple exchange actionable.

### A.6 Transport Compatibility

Messaging-profile tezits can travel via:
- Native Tez-aware apps (full context inline)
- Existing platforms (SMS, WhatsApp, iMessage) with context as:
  - A retrievable link (`tez.it/m/abc123`)
  - A companion packet via PA-to-PA channel
  - Embedded metadata (where platform supports)
- Email with context attachment or link

The surface message remains human-readable in any medium. Context availability degrades gracefully -- a recipient without a PA still gets a normal text message.

### A.7 Knowledge vs. Messaging Comparison

| Aspect | Knowledge Profile | Messaging Profile |
|--------|-------------------|-------------------|
| Primary content | `tez.md` synthesis document | `surface.message` (brief) |
| Primary consumption | Interrogation | Absorption + threading |
| Context role | Evidence for claims | Background for understanding |
| Typical size | Multi-page analysis | Single message + layers |
| Lifetime | Long-lived artifact | Conversational |

---

## Appendix B: Parameters & Negotiation (Experimental)

> **Status**: Experimental -- parameters and negotiation are under active development and may change significantly in future versions. They are not part of the core protocol and implementations are not required to support them.

### B.1 Overview

Parameters allow tezits to include structured, potentially negotiable values -- deal terms, configuration options, budget ranges, timelines -- that recipients can adjust and counter-propose.

### B.2 Schema

```json
{
  "$schema": "https://tezit.com/spec/v1.2/params.schema.json",
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

### B.3 Manifest Integration

To include parameters, add a `parameters` field to the manifest:

```json
{
  "parameters": {
    "negotiable": true,
    "count": 4,
    "file": "params.json"
  }
}
```

And include a `params.json` file in the bundle root.

### B.4 Parameter Types

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

## Appendix C: Standard Extensions

### C.1 Facts Extension (`tezit-facts`)

The Facts extension enables structured extraction of claims from context with provenance tracking.

**Schema** (`extensions/tezit-facts/facts.json`):

```json
{
  "$schema": "https://tezit.com/spec/v1.2/extensions/facts.schema.json",
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

### C.2 Relationships Extension (`tezit-relationships`)

The Relationships extension maps connections between the Tez and external entities (people, organizations, projects, events).

**Schema** (`extensions/tezit-relationships/relationships.json`):

```json
{
  "$schema": "https://tezit.com/spec/v1.2/extensions/relationships.schema.json",
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
- Knowledge graphs connecting related tezits
- Stakeholder mapping in complex projects
- Entity disambiguation across organizational knowledge

---

## Appendix D: Conversation Format

### D.1 Schema

```json
{
  "$schema": "https://tezit.com/spec/v1.2/conversation.schema.json",
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

### D.2 Roles

- `user`: Human input
- `assistant`: AI response
- `system`: System instructions
- `tool`: Tool call results

### D.3 Conversation Privacy Controls

The conversation that produced a synthesis may contain sensitive information that the creator doesn't want to share with recipients. The protocol supports flexible privacy controls.

#### Sharing Modes

```json
{
  "conversation": {
    "sharing": "full",
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

## Appendix E: JSON Schemas

Full JSON schemas are available at:
- [tezit.com/spec/v1.2/manifest.schema.json](https://tezit.com/spec/v1.2/manifest.schema.json)
- [tezit.com/spec/v1.2/conversation.schema.json](https://tezit.com/spec/v1.2/conversation.schema.json)
- [tezit.com/spec/v1.2/params.schema.json](https://tezit.com/spec/v1.2/params.schema.json)
- [tezit.com/spec/v1.2/inline.schema.json](https://tezit.com/spec/v1.2/inline.schema.json)

**Companion specification schemas** (contributed by Ragu Platform):
- [`schemas/code-review-finding.schema.json`](schemas/code-review-finding.schema.json) -- Structured findings for code review workflows
- [`schemas/code-review-surface.schema.json`](schemas/code-review-surface.schema.json) -- Surface metadata for code review profile tezits
- [`schemas/coordination-surface.schema.json`](schemas/coordination-surface.schema.json) -- Surface metadata for coordination profile tezits
- [`schemas/enterprise-tip-eval.schema.json`](schemas/enterprise-tip-eval.schema.json) -- Evaluation metrics for enterprise TIP interrogation quality

## Appendix F: Example Bundle

A complete example bundle is available at:
[github.com/tezit-protocol/spec/examples/acme-analysis](https://github.com/tezit-protocol/spec/examples/acme-analysis)

## Appendix G: Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.2.4 | 2026-02-05 | Updated companion spec versions (Code Review Profile v0.2.0 Proposed, Coordination Profile v1.1-draft, TIP Enterprise Addendum v1.1-draft). Added 4 JSON Schema files for companion specifications. Updated Ragu implementer status with 44-test conformance suite, reference implementations, and schema deliverables. Added v1.3 Proposed Features section with three accepted proposals: bundle signature verification, interrogation session transfer, and context item versioning. |
| 1.2.3 | 2026-02-05 | Added companion spec references for Coordination Profile, Code Review Profile, and TIP Enterprise Addendum. Added `review` and `coordination` synthesis types. Added `synthesis.supplementary` field. Updated Ragu Platform implementer status. |
| 1.2.2 | 2026-02-05 | Extended citation syntax with element-type references (tables, figures, paragraphs). Living document failure modes (source unavailable, degraded context, freshness warnings). Extension registry process with PR-based contribution, vendor namespaces, and lifecycle stages. Code Review profile (proposed, contributed by Ragu Platform). Ragu Platform added as second implementer. |
| 1.2.1 | 2026-02-05 | Added coordination profile for team collaboration (tasks, decisions, questions, blockers). Clarified context scope semantics with concrete examples. Added multi-model interrogation guidance (minimum requirements, citation verification, large context handling). Added JSON Schema references and validation section. Standardized field naming across bundle formats (`tezit_version` in JSON, `tezit` in YAML). |
| 1.2 | 2026-02-05 | Added Inline Tez (Level 0) as new lowest conformance level. Simplified core protocol: moved Messaging Profile to Appendix A (experimental) and Parameters & Negotiation to Appendix B (experimental). Updated naming conventions: plural of Tez is "tezits" (not "tezzes"); "tezit" as a verb. Added companion specification references (TIP, HTTP API, tez:// URI). Reorganized sections for clarity. Renumbered conformance levels (0-3). |
| 1.1 | 2026-02-05 | Added Section 1.6 Core Principles. Added Section 1.7 Tez Profiles (knowledge, messaging, decision, handoff). Added `profile` and `surface` fields to manifest schema. Added `tezit-facts` and `tezit-relationships` standard extensions. |
| 1.0 | 2026-01-26 | Initial specification. |

---

*This specification is licensed under CC BY 4.0.*
