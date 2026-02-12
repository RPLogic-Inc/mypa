# The Tezit Manifesto

**Version**: 1.0
**Date**: January 26, 2026
**Website**: [tezit.com](https://tezit.com)
**Protocol Repository**: [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)

---

## All Work Is Becoming Vibe Work

> **Vibe work** is knowledge work where you direct AI to accomplish outcomes rather than manually performing each step—you manage context, intention, and quality rather than execution.

We are living through the most significant transformation of knowledge work since the invention of the spreadsheet. AI assistants are fundamentally changing how humans synthesize information, make decisions, and communicate ideas.

The 99% of workers who aren't developers—lawyers, analysts, project managers, executives—are discovering they can load documents into an AI, ask questions, and receive synthesis that would have taken hours to produce manually. This is vibe work: directing AI with intent rather than performing rote information processing.

But there's a problem.

**We have new tools for creation, but the same broken tools for transmission.**

When a knowledge worker uses AI to synthesize documents, emails, data, and conversations into an insight, they can only share the final output—a PDF, a slide deck, a summary email. The reasoning is lost. The sources are detached. The scaffolding that supported the conclusion is dismantled the moment the artifact is "done."

Recipients must trust the summary or reverse-engineer the work. Phone calls are scheduled to "walk through the thinking." Documents are revised sequentially, with context lost at each iteration. Negotiations become adversarial because parties can't examine each other's evidence.

**This is the fundamental bottleneck of modern knowledge work.**

---

## The Tezit Vision

**Tezit** is an open protocol for transmitting knowledge with its scaffolding intact.

A **Tez** (plural: **tezits**) is a bundle that carries:
- The **synthesis** (the insight, recommendation, or position)
- The **context** (the source materials that informed it)
- The **conversation** (the AI dialogue that produced it)
- The **parameters** (the negotiable assumptions)

When you share a Tez, recipients don't just read your conclusion—they can **interrogate** it. They can ask the AI the same questions you asked, against the same materials you used. They can **reframe** the synthesis for their perspective. They can **fork** it to create a counter-position with their own evidence.

**The Tez is the native artifact of AI-augmented knowledge work.**

---

## Why Now?

### The AI Moment

Large language models have crossed a threshold. They can:
- Synthesize multiple documents into coherent narratives
- Answer questions about complex material accurately
- Maintain context across extended reasoning chains
- Cite sources and explain reasoning

But every AI platform treats conversations as ephemeral. The synthesis happens, value is created, and then it evaporates into chat history. There's no **artifact** that captures the work.

### The Collaboration Crisis

Knowledge work is increasingly collaborative, but our collaboration tools assume linear documents:
- **Documents**: Single-threaded, no reasoning trail
- **Email**: Sequential, context lost in forwarding
- **Chat**: Real-time but ephemeral
- **Wikis**: Append-only, no dialectic

None of these support what knowledge workers actually need: the ability to **share reasoning** and **negotiate evidence**.

### The Trust Problem

In a world where AI can generate plausible-sounding content instantly, **provenance matters more than ever**. How do you know a summary accurately represents the source material? How do you verify that a recommendation is grounded in actual data?

Tezit solves this by keeping context attached. Recipients don't have to trust—they can verify.

### The Cautionary Tale: Why Interface Matters

This protocol exists because of a specific failure.

A company founder needed to prepare a Statement of Work for deploying an AI platform to a client. The traditional approach: manually estimate scope, draft a document, send to legal, answer clarifying questions via phone, revise, repeat.

Instead, the founder loaded the **actual codebase** into an AI assistant—not documentation, but the code itself. Added the **client's technical specifications**. Added the **company's SOW template**. The AI could see both sides of the integration and generate accurate estimates based on real complexity.

The result was a git repository containing the contract, the source materials, and the complete AI conversation. The instruction to legal:

> *"There's a contract in here, and enough information for you to ask any question you like and get a good answer without having to call me."*

**A Tez existed.** The concept worked perfectly. Context was assembled. Synthesis was produced. The bundle was transmitted with scaffolding intact.

**But legal had no idea what to do with a git repository.**

The paradigm succeeded; the interface failed. The lawyers couldn't clone a repo, navigate a file structure, or point an AI at a folder. The value was inaccessible because the affordance wasn't there.

**This is why Tezit.com exists.** The protocol describes *what* to transmit. The platform solves *how* non-technical recipients consume it. When a lawyer receives a Tez link, they see a formatted document with a chat interface—not a repository to clone.

The minimum viable Tez is the practice, not the format. But the practice can't spread until the interface exists for everyone.

---

## The Tezit Protocol

### Core Concepts

#### The Tez

A Tez is a structured bundle with a well-defined format:

```
{tez-id}/
├── manifest.json      # Bundle metadata and structure
├── tez.md             # The synthesis (human-readable)
├── context/           # Source materials
│   ├── doc-001.pdf
│   ├── email-002.eml
│   └── data-003.json
├── conversation.json  # AI dialogue (optional)
└── params.json        # Negotiable parameters (optional)
```

#### The Tezit (verb)

To **tezit** is to assemble context, synthesize with AI, and bundle for transmission. The tezit process has three phases:

1. **Context Discovery**: Gather and scope the relevant materials
2. **AI Synthesis**: Develop the position through dialogue
3. **Bundle & Transmit**: Package and share

#### The Interrogation

When you receive a Tez, you can **interrogate** it—ask questions that the AI answers from the transmitted context, not from its general training. This ensures the recipient can examine the same evidence the sender used.

#### The Fork

If you disagree with a Tez, you can **fork** it—creating a new Tez that starts with the original's context but adds your own materials and develops a counter-position. Forks create a tree of reasoning, not a flat document chain.

---

### Protocol Specification

#### manifest.json

The manifest describes the Tez structure:

```json
{
  "tezit_version": "1.0",
  "id": "acme-deal-analysis-2026-01",
  "version": 1,
  "created_at": "2026-01-15T14:30:00Z",
  "creator": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "org": "Acme Corp"
  },
  "synthesis": {
    "title": "Acme Partnership Analysis",
    "type": "recommendation",
    "file": "tez.md",
    "abstract": "Analysis of proposed partnership terms with risk assessment."
  },
  "context": {
    "scope": "focused",
    "item_count": 12,
    "items": [
      {
        "id": "doc-001",
        "type": "document",
        "title": "Partnership Agreement Draft v3",
        "source": "google_drive",
        "file": "context/doc-001.pdf",
        "hash": "sha256:abc123..."
      }
    ]
  },
  "conversation": {
    "turn_count": 15,
    "file": "conversation.json"
  },
  "parameters": {
    "negotiable": true,
    "file": "params.json"
  },
  "lineage": {
    "forked_from": null,
    "fork_count": 2
  },
  "permissions": {
    "interrogate": true,
    "fork": true,
    "reshare": false
  }
}
```

#### tez.md

The synthesis is Markdown with optional citation syntax:

```markdown
# Acme Partnership Analysis

## Executive Summary

Based on analysis of the proposed terms [[doc-001]], market comparables [[doc-003]],
and our internal projections [[data-005]], I recommend proceeding with the partnership
under modified terms.

## Key Findings

1. **Revenue share is below market** - Comparable deals show 15-20% [[doc-003:p12]],
   while this proposal offers 12%.

2. **Exclusivity clause is reasonable** - 18-month term aligns with industry standard.

3. **IP provisions need revision** - Current language creates risk [[email-007]].

## Recommendation

Accept with the following modifications:
- Increase revenue share to 15% (see params.json for range)
- Add termination clause for material breach
- Clarify IP ownership in Section 4.2

---
*Generated with Tezit v1.0 | Context items: 12 | Conversation turns: 15*
```

#### conversation.json

The AI dialogue that produced the synthesis:

```json
{
  "model": "claude-opus-4",
  "turns": [
    {
      "role": "user",
      "content": "Analyze the partnership agreement and compare to market standards.",
      "timestamp": "2026-01-15T14:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Looking at the partnership agreement [[doc-001]], I'll compare key terms...",
      "timestamp": "2026-01-15T14:00:15Z",
      "citations": ["doc-001", "doc-003"]
    }
  ]
}
```

#### params.json

Negotiable parameters for deal-oriented tezits:

```json
{
  "parameters": [
    {
      "name": "revenue_share",
      "type": "range",
      "value": 0.15,
      "constraints": {
        "min": 0.12,
        "max": 0.20,
        "step": 0.01
      },
      "preference": 0.15,
      "rationale": "Market data [[doc-003]] suggests 15-20% is standard."
    },
    {
      "name": "exclusivity_term_months",
      "type": "range",
      "value": 18,
      "constraints": {
        "min": 12,
        "max": 24
      },
      "preference": 18
    },
    {
      "name": "ip_ownership",
      "type": "options",
      "value": "joint",
      "constraints": {
        "choices": ["seller", "buyer", "joint", "split_by_type"]
      },
      "preference": "joint"
    }
  ]
}
```

---

## The Tezit Ecosystem

### Tezit.com — The Platform

**Tezit.com** is to knowledge work what GitHub is to code.

Just as GitHub provides:
- **Repositories** for code
- **Commits** for version history
- **Pull requests** for collaboration
- **Issues** for discussion
- **Forks** for divergent work

Tezit.com provides:
- **Vaults** for Tez storage
- **Versions** for Tez history
- **Interrogations** for AI-powered Q&A
- **Discussions** for context around tezits
- **Forks** for counter-arguments

#### For Individuals

- Store your tezits privately or publicly
- Build a portfolio of your analytical work
- Share tezits with specific people or via link
- Fork public tezits to learn from experts

#### For Teams

- Shared vaults with access controls
- Review workflows for sensitive tezits
- Audit trails for compliance
- Integration with existing tools (Slack, Teams, email)

#### For Organizations

- Enterprise vaults with SSO
- Fine-grained permissions (view, interrogate, fork, reshare)
- Data residency options
- API access for integration

### The Open Protocol

The Tezit protocol is **open source** and **vendor-neutral**.

Anyone can:
- Create tezits in any tool
- Host tezits on any storage
- Build Tezit-compatible applications
- Contribute to the protocol specification

Tezit.com is one implementation of the protocol, but not the only one. Organizations can self-host Tezit vaults, integrate Tezit into their own platforms, or use the protocol in ways we haven't imagined.

### Reference Implementation

The reference implementation is available at [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec):

```
tezit-protocol/
├── spec/                    # Protocol specification
│   ├── manifest.schema.json
│   ├── conversation.schema.json
│   └── params.schema.json
├── python/                  # Python SDK
│   └── tezit/
├── typescript/              # TypeScript SDK
│   └── @tezit/core
├── examples/                # Example tezits
└── tools/                   # CLI and validation tools
```

---

## Use Cases

### Business Negotiations

**Before Tezit**: Parties exchange term sheets. Each side builds their analysis independently. Negotiations happen through calls where people walk through spreadsheets. Misunderstandings arise from different assumptions. Deals take months to close.

**With Tezit**: Seller creates a Tez with their valuation model, comparable deals, and proposed terms. Buyer interrogates the Tez, identifies weak assumptions, forks with their counter-analysis. Both parties can see exactly where they diverge and why. Negotiations are grounded in shared evidence.

### Research & Analysis

**Before Tezit**: Analyst writes report. Reader must trust the summary accurately represents sources. If questions arise, analyst schedules a call to walk through their research. Updates require full revision.

**With Tezit**: Analyst creates Tez with synthesis and all source materials. Reader interrogates to understand methodology. If new data emerges, analyst forks their own Tez with updated context. The reasoning chain is always visible.

### Legal & Compliance

**Before Tezit**: Lawyer writes memo. Client reads conclusion but can't easily verify it against the actual regulations, precedents, and contracts cited. Compliance requires manually checking each reference.

**With Tezit**: Lawyer creates Tez with legal analysis and all relevant documents. Client (or auditor) interrogates to verify conclusions are supported. Context is immutable and timestamped for compliance records.

### Education & Learning

**Before Tezit**: Professor publishes paper. Students read conclusion but don't see the analytical process. Learning the methodology requires separate coursework.

**With Tezit**: Professor creates Tez showing how they developed their thesis. Students interrogate to understand methodology, fork to practice the approach with different data. The reasoning process is the curriculum.

### Knowledge Transfer

**Before Tezit**: Senior employee leaves. Knowledge transfer happens through hurried documentation and handoff meetings. Institutional knowledge is lost.

**With Tezit**: Senior employee creates tezits for key decisions and analyses. New employees interrogate to understand the reasoning. The organization's analytical heritage is preserved.

---

## Technical Architecture

### Storage

Tezits are self-contained bundles that can be stored anywhere:
- Local filesystem
- Cloud storage (S3, GCS, Azure Blob)
- Tezit.com vaults
- IPFS for decentralized storage
- Git repositories

The manifest includes content hashes for integrity verification.

### Authentication & Authorization

The protocol supports multiple auth models:
- **Password-protected links**: Simple sharing
- **OAuth/OIDC**: Enterprise SSO
- **Capability URLs**: Expiring access tokens
- **Blockchain attestation**: Decentralized identity (future)

### Encryption

Tezits can be encrypted at rest and in transit:
- **At rest**: AES-256-GCM per-bundle encryption
- **In transit**: TLS 1.3 minimum
- **End-to-end**: Optional recipient-specific encryption

### AI Integration

The protocol is AI-model agnostic. Interrogation can use:
- Commercial models (Claude, GPT, Gemini)
- Open models (Llama, Mistral)
- Self-hosted models
- Organization-specific fine-tuned models

The conversation.json records which model was used for synthesis, enabling reproducibility.

---

## Governance

### The Tezit Foundation

The Tezit protocol is governed by the **Tezit Foundation**, a non-profit organization dedicated to:
- Maintaining the protocol specification
- Certifying compatible implementations
- Funding open-source development
- Promoting adoption and best practices

### Protocol Evolution

Protocol changes follow a structured process:
1. **RFC**: Proposed changes are documented as Requests for Comments
2. **Discussion**: Community feedback period (minimum 30 days)
3. **Consensus**: Foundation board votes on adoption
4. **Implementation**: Reference implementation updated
5. **Transition**: Migration period for existing tezits

### Versioning

The protocol uses semantic versioning:
- **Major**: Breaking changes to bundle format
- **Minor**: New optional features
- **Patch**: Clarifications and bug fixes

Tezits include the protocol version, enabling tools to handle different versions.

---

## Comparison to Existing Approaches

### vs. Documents (PDF, Word, Slides)

| Aspect | Documents | Tezit |
|--------|-----------|-------|
| Synthesis | Yes | Yes |
| Attached context | No (links at best) | Yes (bundled) |
| AI interrogation | No | Yes |
| Forking | Manual copy | Native |
| Reasoning chain | Lost | Preserved |

### vs. Wikis & Knowledge Bases

| Aspect | Wikis | Tezit |
|--------|-------|-------|
| Collaboration | Append-only | Fork & merge |
| Citations | Text references | Live links to context |
| Dialectic | Not supported | Native (fork/counter) |
| AI integration | Bolted-on | Core architecture |

### vs. Chat/Email

| Aspect | Chat/Email | Tezit |
|--------|-----------|-------|
| Permanence | Ephemeral/scattered | Durable artifact |
| Context | Attached files | Integrated bundle |
| Structure | Unstructured | Defined schema |
| AI-native | No | Yes |

### vs. MCP (Model Context Protocol)

MCP and Tezit are complementary:
- **MCP**: Protocol for AI-to-tool communication during synthesis
- **Tezit**: Protocol for bundling and transmitting the result

A Tezit implementation might use MCP internally for tool calls during synthesis, then bundle the result as a Tez for transmission.

---

## Roadmap

### 2026 Q1: Foundation
- [x] Protocol specification v1.0
- [x] Reference implementation (Python, TypeScript)
- [ ] Tezit.com beta launch
- [ ] CLI tools for Tez creation and validation

### 2026 Q2: Adoption
- [ ] Integrations (Slack, Teams, email)
- [ ] Enterprise features (SSO, audit, compliance)
- [ ] Mobile apps (iOS, Android)
- [ ] VS Code extension

### 2026 Q3: Ecosystem
- [ ] Marketplace for Tez templates
- [ ] Public Tez discovery and search
- [ ] API for third-party integrations
- [ ] Certification program for tools

### 2026 Q4: Scale
- [ ] Protocol v1.1 (based on community feedback)
- [ ] Decentralized storage options (IPFS)
- [ ] Multi-language SDK expansion
- [ ] Enterprise multi-region deployment

---

## Getting Started

### Create Your First Tez

```bash
# Install the Tezit CLI
npm install -g @tezit/cli

# Initialize a new Tez
tezit init "My Analysis"

# Add context
tezit add-context ./documents/report.pdf
tezit add-context ./data/metrics.json

# Synthesize with AI
tezit synthesize --model claude-opus-4

# Export bundle
tezit bundle --output my-analysis.tez

# Share
tezit share --upload tezit.com
```

### Interrogate a Tez

```bash
# Open a Tez
tezit open https://tezit.com/jane/acme-analysis

# Ask questions
tezit interrogate "What assumptions drive the revenue projection?"
tezit interrogate "Show me the comparable deals referenced."

# Fork if you disagree
tezit fork --reason "Different market assumptions"
```

### Host Your Own Vault

```bash
# Deploy Tezit vault on your infrastructure
docker run -d tezit/vault:latest \
  -e STORAGE_BACKEND=s3 \
  -e S3_BUCKET=my-tez-vault \
  -e AUTH_PROVIDER=oidc \
  -p 8080:8080
```

---

## Join the Movement

**The way we work is changing. The way we share knowledge must change too.**

Tezit is an open invitation to rethink knowledge transmission for the AI era. We believe:
- **Context should travel with synthesis**
- **Recipients should be able to verify, not just trust**
- **Collaboration should be dimensional, not sequential**
- **AI augments human judgment, it doesn't replace it**

If you share these beliefs, join us:
- **Use Tezit**: Create and share tezits in your work
- **Build with Tezit**: Integrate the protocol into your tools
- **Contribute**: Help evolve the protocol specification
- **Spread the word**: Share this manifesto

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Tez** | A bundle containing synthesis, context, conversation, and parameters |
| **Tezit** (verb) | The act of assembling context and creating a Tez |
| **Tezit** (noun) | The protocol and ecosystem for knowledge transmission |
| **Synthesis** | The human-readable insight or recommendation |
| **Context** | The source materials that informed the synthesis |
| **Conversation** | The AI dialogue that produced the synthesis |
| **Parameters** | Negotiable assumptions or terms |
| **Interrogation** | AI-powered Q&A against transmitted context |
| **Fork** | Creating a new Tez from an existing one |
| **Vault** | A storage location for tezits |
| **Manifest** | The JSON file describing a Tez's structure |

## Appendix B: Protocol Schemas

See the full JSON schemas at [github.com/tezit-protocol/spec/spec](https://github.com/tezit-protocol/spec/spec).

## Appendix C: Security Considerations

### Content Integrity
- All context items are hashed (SHA-256)
- Manifest includes hashes for verification
- Tampering is detectable

### Access Control
- Permissions are explicit in manifest
- Capability URLs can expire
- Audit logs track access

### Privacy
- Tezits can be encrypted
- Context can be selectively redacted
- No analytics without consent

---

**"The Tez is the native artifact of AI-augmented knowledge work."**

*— The Tezit Foundation*

---

*This document is licensed under CC BY 4.0. You are free to share and adapt it with attribution.*
