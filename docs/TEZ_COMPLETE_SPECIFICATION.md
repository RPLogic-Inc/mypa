# Tez: The Complete Specification

## A New Primitive for Human Communication

**Version:** 1.1.0-aligned
**Last Updated:** February 2026
**Status:** Aligning with Tezit Protocol v1.1
**Destination:** tezit.com
**Protocol Compatibility:** Tezit Protocol v1.1 (Messaging Profile)

> **Alignment Note:** This specification has been updated based on feedback from the
> Tezit Protocol Team. MyPA's implementation influenced the protocol—the Messaging
> Profile, Facts extension, and Relationships extension were adopted into the official spec.
> See `TEZ_PROTOCOL_ALIGNMENT.md` for implementation roadmap.

---

# Table of Contents

1. [Introduction: What is a Tez?](#part-1-introduction)
2. [The Philosophy of Context](#part-2-philosophy)
3. [Tez Structure & Anatomy](#part-3-structure)
4. [The Tez Protocol](#part-4-protocol)
5. [Implementation Reference: MyPA](#part-5-implementation)
6. [User Experience Patterns](#part-6-ux)
7. [Network & Federation](#part-7-network)
8. [Privacy, Security & Trust](#part-8-privacy)
9. [Adoption & Ecosystem](#part-9-ecosystem)
10. [Future Directions](#part-10-future)

---

# Part 1: Introduction {#part-1-introduction}

## What is a Tez?

A **Tez** (plural: *Tezzes*) is a new form of communication between people—one that includes rich context below the surface.

When you receive a text message today, you get words. Flat. One-dimensional. You infer tone, guess at intent, wonder about background. The sender had context in their mind when they wrote it, but that context evaporates the moment they hit send.

When you receive a **Tez**, you get the same surface message—but beneath it lies a **multidimensional understanding** available to explore. The context isn't hidden or lost; it's structured and accessible.

```
Traditional Message:
┌─────────────────────────────────┐
│  "Can you review the proposal?" │
└─────────────────────────────────┘

Tez:
┌─────────────────────────────────┐
│  "Can you review the proposal?" │  ← Surface (what you see first)
├─────────────────────────────────┤
│  Why: Budget deadline Friday    │  ← Intent (why they're asking)
│  Concern: Cloud spend section   │  ← Focus (what matters most)
│  History: Follows Aug meeting   │  ← Background (how we got here)
│  Relationship: You're the expert│  ← Context (why you specifically)
│  Attachment: proposal.pdf       │  ← Evidence (the actual thing)
│  Voice memo: 30 sec explanation │  ← Original (their actual words)
└─────────────────────────────────┘
```

## The Name

"Tez" evokes something small but complete—a quantum of understanding. Like a seed that contains the blueprint for an entire tree, a Tez contains the blueprint for complete comprehension.

The plural "Tezzes" follows standard English pluralization, ensuring broad accessibility and protocol compatibility.

## The Core Insight

Every message you send is the tip of an iceberg. Beneath it lies:
- **Why** you're saying this
- **What** led to this moment
- **Who** you're really talking to (and why them)
- **How** you hope they'll respond
- **What** you're not saying but wish you could

Until now, this subtext existed only in your head. AI assistants change this equation. Your Personal Assistant (PA) can observe, structure, and transmit this context *on your behalf*—creating communications that carry their full meaning.

A Tez is not a message with metadata attached. It's a **complete unit of understanding** that happens to have a surface you can read.

---

# Part 2: The Philosophy of Context {#part-2-philosophy}

## The Library of Context

A foundational principle: **Original content is preserved forever. Display is regenerable.**

When someone speaks to you, their words are sacred—the exact phrases they chose, the pauses, the emphasis. This original material should never be discarded. But how that content is *displayed* to you can be regenerated, reformatted, summarized, or expanded based on your needs.

A Tez implements this by maintaining distinct layers:
- **Artifacts**: The untouchable originals (voice recordings, original text, documents)
- **Facts**: Extracted, structured claims derived from artifacts
- **Context**: Interpretive layers that explain relationships and significance
- **Summary**: Regenerable surface presentation

You can always dive back to the original. You can always get a fresh summary. The understanding persists even as presentation adapts.

## The Iceberg Model

Most human communication is like an iceberg—the message is the tip, but understanding requires the mass beneath the surface:

```
           ╱╲
          ╱  ╲           ← Surface Message
         ╱────╲             "Review this"
        ╱      ╲
       ╱ Intent ╲        ← Why they're asking
      ╱──────────╲
     ╱  Context   ╲      ← Background, constraints
    ╱──────────────╲
   ╱  Relationships ╲    ← How this connects to everything
  ╱────────────────────╲
 │     Evidence         │ ← Original artifacts, sources
 └──────────────────────┘
```

Traditionally, that submerged context exists only in the sender's head, partially transmitted through tone, body language, shared history, and luck.

A Tez makes the iceberg **explicit and portable**. The recipient chooses how deep to go. Sometimes the surface is enough. Sometimes they need to understand the full depth. The choice is theirs, and the depth is always available.

## What Communication Technologies Lost

Each era's communication technology traded richness for reach:

| Era | Medium | What We Gained | What We Lost |
|-----|--------|----------------|--------------|
| Pre-history | Face-to-face | Full context, immediate feedback | Couldn't scale beyond presence |
| Ancient | Written letters | Distance, permanence | Tone, immediacy, most context |
| 1800s | Telegraph | Speed across distance | Length, nuance, personality |
| 1900s | Telephone | Voice, real-time connection | Visual cues, permanence |
| 2000s | Email | Asynchronous, attachments, searchable | Structure, priority, overwhelm |
| 2010s | Text/Chat | Immediacy, casual, mobile | Depth, formality, completeness |
| 2020s | AI Chat | Natural language, availability | Context continuity, relationship |

**Tez represents the first technology that *restores* what was lost without sacrificing what was gained.**

## The Gift Economy of Understanding

Sending a Tez is a **gift of understanding**. It says:
- "I value your time enough to structure my context"
- "I trust you with this background"
- "I want you to *truly* understand, not just receive words"

Receiving a Tez creates a **responsibility to engage**:
- You cannot claim "I didn't know the background"
- The depth is there; ignoring it is a choice you own
- Your reply carries the thread of understanding forward

This transforms communication from information transfer to **mutual understanding construction**.

---

# Part 3: Tez Structure & Anatomy {#part-3-structure}

## Complete Tez Schema

```typescript
interface Tez {
  // ══════════════════════════════════════════════════════════════
  // IDENTITY
  // ══════════════════════════════════════════════════════════════

  id: string;                      // Globally unique identifier (UUID v7 recommended)
  version: "1.0";                  // Tez protocol version
  type: TezType;                   // Classification of this Tez

  // ══════════════════════════════════════════════════════════════
  // ORIGIN - Who created this and when
  // ══════════════════════════════════════════════════════════════

  origin: {
    authorId: string;              // Human who authorized this Tez
    authorName: string;            // Display name
    agentId?: string;              // PA that helped construct it
    teamId?: string;               // Team context (if applicable)

    createdAt: ISO8601DateTime;    // When the Tez was created
    location?: GeoPoint;           // Optional: where it was created

    signature: string;             // Cryptographic proof of authorship
    publicKey: string;             // For signature verification
  };

  // ══════════════════════════════════════════════════════════════
  // LAYERS - The depth of understanding
  // ══════════════════════════════════════════════════════════════

  layers: {
    // ─────────────────────────────────────────────────────────────
    // SURFACE - What the recipient sees first
    // ─────────────────────────────────────────────────────────────

    surface: {
      summary: string;             // Human-readable summary (the "message")
      tone?: TezTone;              // Intended emotional register
      urgency?: TezUrgency;        // How time-sensitive
      actionRequested?: string;    // What you want them to do
    };

    // ─────────────────────────────────────────────────────────────
    // FACTS - Structured, verifiable claims
    // ─────────────────────────────────────────────────────────────

    facts: TezFact[];

    // ─────────────────────────────────────────────────────────────
    // CONTEXT - The interpretive layers
    // ─────────────────────────────────────────────────────────────

    context: {
      background?: string;         // Why this matters, how we got here
      constraints?: string[];      // Important limitations or boundaries
      preferences?: string[];      // How recipient should approach this
      assumptions?: string[];      // What sender is taking for granted
      risks?: string[];            // What could go wrong
    };

    // ─────────────────────────────────────────────────────────────
    // RELATIONSHIPS - Connections to entities
    // ─────────────────────────────────────────────────────────────

    relationships: TezRelation[];

    // ─────────────────────────────────────────────────────────────
    // ARTIFACTS - Original evidence (immutable)
    // ─────────────────────────────────────────────────────────────

    artifacts: TezArtifact[];
  };

  // ══════════════════════════════════════════════════════════════
  // THREADING - Connection to conversation
  // ══════════════════════════════════════════════════════════════

  thread?: {
    rootTezId: string;             // The conversation starter
    parentTezId?: string;          // Direct reply to this Tez
    position: number;              // Order in thread
  };

  // ══════════════════════════════════════════════════════════════
  // ROUTING - Who should receive this
  // ══════════════════════════════════════════════════════════════

  routing: {
    recipients: TezRecipient[];    // Explicit recipients
    visibility: TezVisibility;     // Who can see this
    routing_hints?: string[];      // For AI-assisted routing
  };

  // ══════════════════════════════════════════════════════════════
  // PERMISSIONS - What recipients can do
  // ══════════════════════════════════════════════════════════════

  permissions: {
    canForward: boolean;           // Can recipient share this Tez?
    canDerive: boolean;            // Can recipient create derivative Tez?
    canQuote: boolean;             // Can recipient quote in their Tez?
    canArchive: boolean;           // Can recipient permanently store?

    expiry?: ISO8601DateTime;      // When context becomes stale
    viewLimit?: number;            // Max times it can be viewed

    requiredAcknowledgment?: boolean;  // Must recipient confirm receipt?
  };

  // ══════════════════════════════════════════════════════════════
  // METADATA
  // ══════════════════════════════════════════════════════════════

  meta: {
    schema: "tez-v1";              // Schema identifier
    encoding: "json" | "cbor";     // Wire format
    compressed?: boolean;          // Is payload compressed?
    encrypted?: boolean;           // Is payload encrypted?

    size: number;                  // Total size in bytes
    checksum: string;              // Integrity verification

    extensions?: Record<string, unknown>;  // Plugin-specific data
  };
}
```

## Supporting Types

```typescript
// ══════════════════════════════════════════════════════════════
// TEZ TYPES - Classification of intent
// ══════════════════════════════════════════════════════════════

type TezType =
  | "request"        // Asking for something
  | "inform"         // Sharing information
  | "decision"       // Presenting choices
  | "update"         // Status on something ongoing
  | "introduction"   // Introducing context/people
  | "handoff"        // Transferring responsibility
  | "question"       // Seeking information
  | "response"       // Answering a previous Tez
  | "acknowledgment" // Confirming receipt/understanding
  | "escalation"     // Elevating urgency/scope
  | "delegation"     // Assigning to someone else
  | "celebration"    // Sharing positive news
  | "concern"        // Raising an issue
  | "custom";        // Extension point

// ══════════════════════════════════════════════════════════════
// FACTS - Structured claims with provenance
// ══════════════════════════════════════════════════════════════

interface TezFact {
  id: string;                      // Unique within this Tez
  claim: string;                   // The fact itself

  confidence: number;              // 0.0 to 1.0
  source: "stated" | "inferred" | "verified" | "assumed";

  citations?: string[];            // References to artifacts
  verifiedBy?: string;             // Who/what verified this
  verifiedAt?: ISO8601DateTime;

  contradicts?: string[];          // IDs of facts this conflicts with
  supportsFactId?: string;         // ID of fact this supports
}

// ══════════════════════════════════════════════════════════════
// RELATIONSHIPS - Connections to entities
// ══════════════════════════════════════════════════════════════

interface TezRelation {
  entity: string;                  // What/who this relates to
  entityType: "person" | "organization" | "project" | "document" | "event" | "concept";

  relationship: string;            // Nature of the relationship
  strength: number;                // 0.0 to 1.0 relevance

  context?: string;                // Why this relationship matters here
  bidirectional?: boolean;         // Does entity also relate back?
}

// ══════════════════════════════════════════════════════════════
// ARTIFACTS - Original evidence
// ══════════════════════════════════════════════════════════════

interface TezArtifact {
  id: string;
  type: "voice" | "text" | "image" | "document" | "video" | "link" | "data";

  // Content (one of these)
  content?: string;                // Inline content (base64 for binary)
  contentRef?: string;             // Reference URI
  contentHash?: string;            // For verification

  // Metadata
  mimeType: string;
  size: number;
  filename?: string;

  // For voice/video
  duration?: number;               // Seconds
  transcription?: string;

  // Provenance
  capturedAt?: ISO8601DateTime;
  capturedBy?: string;             // Device/method

  // Processing
  extracted?: {
    summary?: string;
    keyPoints?: string[];
    entities?: string[];
  };
}

// ══════════════════════════════════════════════════════════════
// RECIPIENTS & VISIBILITY
// ══════════════════════════════════════════════════════════════

interface TezRecipient {
  id: string;
  type: "user" | "team" | "role" | "ai-routed";

  // For AI routing
  routingCriteria?: string;        // "whoever handles billing"

  // Delivery
  deliveredAt?: ISO8601DateTime;
  readAt?: ISO8601DateTime;
  acknowledgedAt?: ISO8601DateTime;
}

type TezVisibility =
  | "private"          // Only explicit recipients
  | "team"             // All team members can see
  | "organization"     // Org-wide visibility
  | "public";          // Anyone can access

// ══════════════════════════════════════════════════════════════
// TONE & URGENCY
// ══════════════════════════════════════════════════════════════

type TezTone =
  | "formal"
  | "casual"
  | "urgent"
  | "friendly"
  | "apologetic"
  | "celebratory"
  | "concerned"
  | "neutral";

type TezUrgency =
  | "critical"         // Needs immediate attention
  | "high"             // Today
  | "normal"           // This week
  | "low"              // When convenient
  | "fyi";             // No action needed
```

## Example Tez

```json
{
  "id": "tez_01HN8KXQV9ABCDEFGHIJ",
  "version": "1.0",
  "type": "request",

  "origin": {
    "authorId": "user_sarah_chen",
    "authorName": "Sarah Chen",
    "agentId": "pa_sarah_openclaw",
    "teamId": "team_acme_engineering",
    "createdAt": "2026-02-05T14:30:00Z",
    "signature": "ed25519:abc123...",
    "publicKey": "ed25519:pub_xyz..."
  },

  "layers": {
    "surface": {
      "summary": "Can you review the Q4 budget proposal and flag any concerns about infrastructure costs?",
      "tone": "friendly",
      "urgency": "high",
      "actionRequested": "Review and provide feedback by Friday EOD"
    },

    "facts": [
      {
        "id": "fact_1",
        "claim": "Budget proposal deadline is Friday EOD",
        "confidence": 1.0,
        "source": "stated"
      },
      {
        "id": "fact_2",
        "claim": "Goal is to reduce cloud spend by 20%",
        "confidence": 1.0,
        "source": "stated",
        "citations": ["artifact_voice_1"]
      },
      {
        "id": "fact_3",
        "claim": "CFO is personally tracking this initiative",
        "confidence": 0.85,
        "source": "inferred"
      },
      {
        "id": "fact_4",
        "claim": "Recipient caught infrastructure overrun last quarter",
        "confidence": 1.0,
        "source": "verified"
      }
    ],

    "context": {
      "background": "This follows from our August planning meeting where we committed to cost optimization. The board is asking hard questions about cloud spend, and this proposal is our response.",
      "constraints": [
        "Cannot reduce headcount",
        "Must maintain current SLAs",
        "Any vendor changes need 60-day notice"
      ],
      "preferences": [
        "Focus on infrastructure line items over $50k",
        "Be skeptical of 'miscellaneous' categories",
        "Flag anything that seems like creative accounting"
      ],
      "assumptions": [
        "You have access to last quarter's actuals",
        "You remember the August discussion about reserved instances"
      ]
    },

    "relationships": [
      {
        "entity": "Q4 Budget Initiative",
        "entityType": "project",
        "relationship": "primary_subject",
        "strength": 1.0
      },
      {
        "entity": "August Planning Meeting",
        "entityType": "event",
        "relationship": "origin_context",
        "strength": 0.8,
        "context": "Where cost reduction targets were set"
      },
      {
        "entity": "CFO Margaret Wong",
        "entityType": "person",
        "relationship": "stakeholder",
        "strength": 0.7,
        "context": "Executive sponsor, high visibility"
      }
    ],

    "artifacts": [
      {
        "id": "artifact_doc_1",
        "type": "document",
        "contentRef": "tez://artifacts/budget_q4_v2.xlsx",
        "contentHash": "sha256:def456...",
        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "size": 245000,
        "filename": "Q4_Budget_Proposal_v2.xlsx",
        "extracted": {
          "summary": "Q4 budget proposal with 12% reduction target",
          "keyPoints": [
            "Total budget: $2.4M",
            "Infrastructure: $890k (37%)",
            "Proposed savings: $288k"
          ]
        }
      },
      {
        "id": "artifact_voice_1",
        "type": "voice",
        "contentRef": "tez://artifacts/sarah_context_note.m4a",
        "contentHash": "sha256:ghi789...",
        "mimeType": "audio/m4a",
        "size": 180000,
        "duration": 45,
        "transcription": "Hey, quick context on this budget review. I know you caught that infrastructure thing last quarter and I really need your eyes on this. The CFO is watching closely and I want to make sure we're not missing anything obvious. Focus on the cloud stuff especially - that's where I think we might have some creative accounting going on. Thanks!",
        "capturedAt": "2026-02-05T14:25:00Z"
      }
    ]
  },

  "thread": {
    "rootTezId": "tez_01HN8KXQV9ABCDEFGHIJ",
    "position": 0
  },

  "routing": {
    "recipients": [
      {
        "id": "user_david_kim",
        "type": "user"
      }
    ],
    "visibility": "private"
  },

  "permissions": {
    "canForward": false,
    "canDerive": true,
    "canQuote": true,
    "canArchive": true,
    "requiredAcknowledgment": true
  },

  "meta": {
    "schema": "tez-v1",
    "encoding": "json",
    "compressed": false,
    "encrypted": true,
    "size": 4250,
    "checksum": "sha256:final..."
  }
}
```

---

# Part 4: The Tez Protocol {#part-4-protocol}

## Protocol Overview

The Tez Protocol defines how Tezzes are created, transmitted, received, and processed between parties. It is designed to be:

- **Transport-agnostic**: Works over HTTP, WebSocket, P2P, or any reliable channel
- **Encryption-first**: End-to-end encrypted by default
- **Federated**: No central authority required
- **Backwards-compatible**: Graceful degradation for non-Tez recipients

## Protocol Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                        │
│         (MyPA, OpenClaw, Email Clients, etc.)         │
├─────────────────────────────────────────────────────────────┤
│                      TEZ LAYER                              │
│    (Tez creation, parsing, validation, context extraction) │
├─────────────────────────────────────────────────────────────┤
│                    EXCHANGE LAYER                           │
│        (Routing, delivery confirmation, threading)          │
├─────────────────────────────────────────────────────────────┤
│                    SECURITY LAYER                           │
│         (Encryption, signatures, key exchange)              │
├─────────────────────────────────────────────────────────────┤
│                   TRANSPORT LAYER                           │
│            (HTTP/2, WebSocket, P2P, SMTP bridge)           │
└─────────────────────────────────────────────────────────────┘
```

## Core Protocol Operations

### 1. TEZ.CREATE

Create a new Tez from inputs (user message, artifacts, PA context).

```typescript
interface TezCreateRequest {
  // The surface message from the user
  message: string;

  // Artifacts to include
  artifacts?: {
    type: string;
    content: string | Blob;
    metadata?: Record<string, unknown>;
  }[];

  // Explicit context (optional - PA can infer)
  context?: {
    background?: string;
    intent?: string;
    urgency?: TezUrgency;
  };

  // Recipients
  to: string | string[];         // User IDs, team IDs, or routing hints

  // Threading
  replyTo?: string;              // Tez ID if this is a reply

  // Permissions
  permissions?: Partial<TezPermissions>;
}

interface TezCreateResponse {
  tez: Tez;
  warnings?: string[];           // e.g., "Large attachment may slow delivery"
}
```

### 2. TEZ.SEND

Transmit a Tez to recipients.

```typescript
interface TezSendRequest {
  tez: Tez;

  // Delivery options
  options?: {
    priority?: "immediate" | "normal" | "batch";
    retryPolicy?: {
      maxAttempts: number;
      backoffMs: number;
    };
    offlineQueue?: boolean;      // Queue for offline recipients
  };
}

interface TezSendResponse {
  tezId: string;
  deliveryStatus: {
    recipientId: string;
    status: "delivered" | "queued" | "failed";
    timestamp?: ISO8601DateTime;
    error?: string;
  }[];
}
```

### 3. TEZ.RECEIVE

Handle incoming Tez.

```typescript
interface TezReceiveEvent {
  tez: Tez;

  // Delivery metadata
  receivedAt: ISO8601DateTime;
  channel: string;               // How it arrived

  // Verification
  signatureValid: boolean;
  senderVerified: boolean;
}

// Receiver must acknowledge
interface TezAcknowledgment {
  tezId: string;
  recipientId: string;
  status: "received" | "read" | "absorbed" | "rejected";
  timestamp: ISO8601DateTime;

  // Optional feedback
  feedback?: {
    contextHelpful?: boolean;
    missingContext?: string[];
  };
}
```

### 4. TEZ.ABSORB

Integrate Tez context into recipient's PA memory.

```typescript
interface TezAbsorbRequest {
  tezId: string;

  // What to absorb
  layers?: ("facts" | "context" | "relationships")[];

  // How long to retain
  retention?: "session" | "conversation" | "permanent";

  // Scoping
  scope?: {
    teamId?: string;             // Only relevant within this team
    projectId?: string;          // Only relevant to this project
  };
}

interface TezAbsorbResponse {
  absorbed: {
    facts: number;
    relationships: number;
    contextFragments: number;
  };

  conflicts?: {
    existingFact: string;
    incomingFact: string;
    resolution: "kept_existing" | "updated" | "flagged";
  }[];
}
```

### 5. TEZ.INTERROGATE

**Critical operation** — Ask questions answered from transmitted context only.

This is the core value proposition of Tez: recipients can verify claims by questioning
the transmitted context, with AI answering only from that context (not general training).

```typescript
interface TezInterrogateRequest {
  tezId: string;
  question: string;

  // Optional: constrain to specific artifacts
  artifactScope?: string[];          // Only search these artifact IDs

  // Optional: require citations
  requireCitations?: boolean;        // Default: true
}

interface TezInterrogateResponse {
  answer: string;

  // Where the answer came from
  citations: {
    artifactId: string;
    location?: string;               // Page, timestamp, paragraph
    excerpt: string;                 // The cited text
    relevance: number;               // 0.0 to 1.0
  }[];

  // Confidence assessment
  confidence: number;                // 0.0 to 1.0
  answeredFrom: "context" | "insufficient_context";

  // If context was insufficient
  missingContext?: string;           // What would be needed to answer
}
```

**Implementation requirements:**

1. AI MUST answer only from transmitted context
2. All answers MUST include verifiable citations
3. Citations MUST reference real artifacts in the Tez
4. If context is insufficient, respond honestly rather than hallucinating

**System prompt pattern:**
```
You are answering questions about a Tez (context bundle).
Answer ONLY from the provided context materials.
Include citations in format [[artifact-id:location]].
If the context doesn't contain the answer, say:
"This information is not contained in the transmitted context."
Never use your general training knowledge.
```

### 6. TEZ.THREAD

Manage conversation threads.

```typescript
interface TezThreadQuery {
  rootTezId: string;

  // Filters
  after?: ISO8601DateTime;
  participants?: string[];
  includeArchived?: boolean;

  // Pagination
  limit?: number;
  cursor?: string;
}

interface TezThread {
  rootTez: Tez;
  replies: Tez[];

  participants: {
    userId: string;
    messageCount: number;
    lastActive: ISO8601DateTime;
  }[];

  summary?: string;              // AI-generated thread summary

  pagination: {
    hasMore: boolean;
    nextCursor?: string;
  };
}
```

## Wire Format

### Standard Envelope

```typescript
interface TezEnvelope {
  // Protocol header
  protocol: "tez";
  version: "1.0";

  // Operation
  operation: "create" | "send" | "ack" | "query" | "sync";

  // Payload (encrypted)
  payload: string;               // Base64-encoded encrypted content

  // Encryption metadata
  encryption: {
    algorithm: "x25519-xsalsa20-poly1305";
    recipientPublicKey: string;
    nonce: string;
  };

  // Signature
  signature: {
    algorithm: "ed25519";
    publicKey: string;
    value: string;
  };

  // Routing (unencrypted for relay nodes)
  routing: {
    from: string;
    to: string[];
    timestamp: ISO8601DateTime;
    ttl: number;
  };
}
```

### Compact Binary Format (CBOR)

For efficiency in bandwidth-constrained environments, Tezzes can be encoded using CBOR with a defined schema mapping.

---

# Part 5: Implementation Reference - MyPA {#part-5-implementation}

## Overview

MyPA serves as the **reference implementation** for the Tez protocol. It demonstrates how Tezzes integrate with a real-world team coordination application.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                           MYPA                                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│  │   Frontend   │    │   Backend    │    │     OpenClaw PA      │ │
│  │   (React)    │◄──►│  (Express)   │◄──►│   (AI Assistant)     │ │
│  └──────────────┘    └──────────────┘    └──────────────────────┘ │
│         │                   │                      │               │
│         │                   ▼                      │               │
│         │           ┌──────────────┐               │               │
│         │           │   Database   │               │               │
│         │           │   (SQLite)   │               │               │
│         │           └──────────────┘               │               │
│         │                   │                      │               │
│         ▼                   ▼                      ▼               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    TEZ LAYER                                 │  │
│  │  ┌─────────┐  ┌─────────────┐  ┌──────────┐  ┌───────────┐ │  │
│  │  │ Create  │  │   Route     │  │  Store   │  │  Absorb   │ │  │
│  │  │ Service │  │   Service   │  │  Service │  │  Service  │ │  │
│  │  └─────────┘  └─────────────┘  └──────────┘  └───────────┘ │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Database Schema: Library of Context

MyPA implements the Library of Context principle through its database design:

### Cards Table (Tez Surface)

```typescript
// backend/src/db/schema.ts

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),

  // ─── SURFACE LAYER ───────────────────────────────────────────
  title: text("title"),                    // Summary/headline
  displayContent: text("display_content"), // Rendered content

  // ─── ORIGIN ──────────────────────────────────────────────────
  fromUserId: text("from_user_id").references(() => users.id),
  sourceType: text("source_type"),         // "voice" | "text" | "email" | "calendar"

  // ─── ROUTING ─────────────────────────────────────────────────
  tag: text("tag"),                        // "personal" | "team" | "decision"
  aiRoutingReason: text("ai_routing_reason"),

  // ─── CLASSIFICATION ──────────────────────────────────────────
  priority: text("priority"),              // "critical" | "high" | "normal" | "low"
  status: text("status"),                  // "pending" | "acknowledged" | "responded" | "completed"

  // ─── THREADING ───────────────────────────────────────────────
  parentCardId: text("parent_card_id"),

  // ─── TEMPORAL ────────────────────────────────────────────────
  createdAt: text("created_at"),
  snoozedUntil: text("snoozed_until"),
  dueDate: text("due_date"),

  // ─── EXTERNAL LINKS ──────────────────────────────────────────
  clickupTaskId: text("clickup_task_id"),  // Promoted to ClickUp

  // ─── METADATA ────────────────────────────────────────────────
  metadata: text("metadata", { mode: "json" }),
});
```

### Card Context Table (Tez Depth)

```typescript
// The Library of Context - original artifacts preserved forever

export const cardContext = sqliteTable("card_context", {
  id: text("id").primaryKey(),
  cardId: text("card_id").references(() => cards.id),

  // ─── LAYER TYPE ──────────────────────────────────────────────
  type: text("type"),  // "original_voice" | "original_text" | "transcription" |
                       // "ai_summary" | "ai_routing" | "user_edit" | "attachment"

  // ─── CONTENT ─────────────────────────────────────────────────
  content: text("content"),                // The actual content
  mimeType: text("mime_type"),            // For binary content

  // ─── PROVENANCE ──────────────────────────────────────────────
  createdAt: text("created_at"),
  createdBy: text("created_by"),          // User or "system"

  // ─── RELATIONSHIPS ───────────────────────────────────────────
  derivedFrom: text("derived_from"),      // Which context this came from

  // ─── METADATA ────────────────────────────────────────────────
  metadata: text("metadata", { mode: "json" }),
});
```

### Practical Example: Voice Message to Tez

When a user records a voice message in MyPA:

```typescript
// 1. Voice recorded → Original artifact preserved
await db.insert(cardContext).values({
  id: "ctx_voice_original",
  cardId: cardId,
  type: "original_voice",
  content: audioBase64,
  mimeType: "audio/webm",
  createdAt: new Date().toISOString(),
  createdBy: userId,
});

// 2. Whisper transcription → Derived artifact
const transcription = await whisperService.transcribe(audioBlob);
await db.insert(cardContext).values({
  id: "ctx_transcription",
  cardId: cardId,
  type: "transcription",
  content: transcription,
  derivedFrom: "ctx_voice_original",
  createdBy: "system",
});

// 3. AI extracts context → Understanding layer
const analysis = await openclawPA.analyzeMessage(transcription, userContext);
await db.insert(cardContext).values({
  id: "ctx_ai_analysis",
  cardId: cardId,
  type: "ai_summary",
  content: JSON.stringify({
    summary: analysis.summary,
    intent: analysis.intent,
    urgency: analysis.urgency,
    suggestedRecipients: analysis.routing,
    extractedFacts: analysis.facts,
    relationships: analysis.relationships,
  }),
  derivedFrom: "ctx_transcription",
  createdBy: "system",
});

// 4. Card surface updated → What user sees
await db.update(cards).set({
  title: analysis.summary,
  displayContent: analysis.formattedContent,
  priority: analysis.urgency,
  aiRoutingReason: analysis.routingExplanation,
});
```

## OpenClaw PA Integration

The PA service constructs Tez context from conversation:

```typescript
// backend/src/services/openclawPA.ts

export interface PAContext {
  // User context
  userId: string;
  userName: string;
  userRoles: string[];

  // Team context
  teamMembers?: TeamMember[];

  // Recent activity (for accumulated understanding)
  recentCards?: CardSummary[];
  pendingItems?: number;

  // Integration status
  integrations?: {
    clickupConnected: boolean;
    openclawConfigured: boolean;
    notificationsEnabled: boolean;
  };

  // Calendar context
  upcomingEvents?: CalendarEvent[];

  // Accumulated Tez context
  absorbedContext?: {
    facts: TezFact[];
    relationships: TezRelation[];
    lastUpdated: Date;
  };
}

export async function createTezFromMessage(
  message: string,
  artifacts: Artifact[],
  context: PAContext
): Promise<Tez> {

  // 1. Analyze the message
  const analysis = await analyzeWithOpenClaw(message, context);

  // 2. Extract facts
  const facts = extractFacts(message, analysis, context);

  // 3. Build relationships
  const relationships = buildRelationships(analysis, context);

  // 4. Determine routing
  const routing = await determineRouting(analysis, context);

  // 5. Construct the Tez
  return {
    id: generateTezId(),
    version: "1.0",
    type: analysis.tezType,

    origin: {
      authorId: context.userId,
      authorName: context.userName,
      agentId: "openclaw-pa",
      teamId: context.teamId,
      createdAt: new Date().toISOString(),
      signature: await signTez(context.userId),
      publicKey: await getPublicKey(context.userId),
    },

    layers: {
      surface: {
        summary: analysis.summary,
        tone: analysis.tone,
        urgency: analysis.urgency,
        actionRequested: analysis.actionRequested,
      },
      facts,
      context: {
        background: analysis.background,
        constraints: analysis.constraints,
        preferences: analysis.preferences,
      },
      relationships,
      artifacts: await processArtifacts(artifacts),
    },

    routing,
    permissions: defaultPermissions(),
    meta: buildMeta(),
  };
}
```

## Card-to-Tez Mapping

MyPA cards map to Tez as follows:

| Card Field | Tez Location | Notes |
|------------|--------------|-------|
| `title` | `layers.surface.summary` | Human-readable headline |
| `displayContent` | Regenerated from layers | Not stored in Tez directly |
| `fromUserId` | `origin.authorId` | |
| `sourceType` | `layers.artifacts[].type` | voice, text, email, etc. |
| `priority` | `layers.surface.urgency` | critical/high/normal/low |
| `tag` | `type` + `routing.visibility` | personal/team/decision |
| `aiRoutingReason` | `layers.context.background` | Why routed this way |
| `cardContext[]` | `layers.artifacts[]` | Original content preserved |
| `parentCardId` | `thread.parentTezId` | Threading |

## Swipe Gestures as Tez Operations

MyPA's swipe-based UI maps to Tez protocol operations:

| Gesture | Direction | Tez Operation |
|---------|-----------|---------------|
| View Feed | Swipe LEFT | `TEZ.QUERY` - Get priority-sorted Tezzes |
| View Timeline | Swipe RIGHT | `TEZ.QUERY` - Get chronological Tezzes |
| Open PA | Swipe UP | `TEZ.ABSORB` + `TEZ.CREATE` preparation |
| Quick Actions | Swipe DOWN | Batch `TEZ.UPDATE` (snooze, archive) |
| Acknowledge | Tap card | `TEZ.ACKNOWLEDGE` |
| Respond | Hold + speak | `TEZ.CREATE` with `thread.parentTezId` |
| Promote | "Send to ClickUp" | `TEZ.DERIVE` → external system |

---

# Part 6: User Experience Patterns {#part-6-ux}

## Receiving a Tez

When a Tez arrives, the recipient sees it first as a simple message:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 From: Sarah Chen                               2:30 PM

"Can you review the Q4 budget proposal?"

        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
        ↓ 3 layers of context available
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

[Reply]        [Explore Context]        [Ask PA]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The visual hint shows depth is available without forcing the recipient to engage with it.

## Exploring Context

Tapping "Explore Context" reveals the layers:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📨 From: Sarah Chen                               2:30 PM

"Can you review the Q4 budget proposal?"

┌─────────────────────────────────────────────────────────┐
│ WHY THIS MATTERS                                        │
│ Deadline is Friday EOD. Sarah needs your input          │
│ specifically on infrastructure costs—you caught         │
│ the overrun last quarter.                               │
├─────────────────────────────────────────────────────────┤
│ BACKGROUND                                              │
│ ◆ Follows the August planning meeting                   │
│ ◆ Goal: reduce cloud spend 20%                          │
│ ◆ CFO Margaret Wong is tracking closely                 │
├─────────────────────────────────────────────────────────┤
│ WHAT TO FOCUS ON                                        │
│ ▸ Infrastructure line items over $50k                   │
│ ▸ "Misc" categories—be skeptical                        │
│ ▸ Headcount assumptions                                 │
├─────────────────────────────────────────────────────────┤
│ ATTACHED                                                │
│ 📄 Q4_Budget_Proposal_v2.xlsx                          │
│ 🎤 Voice note (0:45) "Hey, quick context..."           │
└─────────────────────────────────────────────────────────┘

[Reply with Context]  [Just Reply]  [Absorb to Memory]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## PA-Assisted Actions

"Ask PA" invokes the personal assistant with the Tez pre-loaded:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 PA: I see Sarah's request about the Q4 budget.

Based on the context, she's asking because:
• You caught infrastructure issues before
• This is high-visibility (CFO watching)
• Deadline is Friday

Would you like me to:
▸ Open the spreadsheet and highlight infrastructure items
▸ Draft a quick acknowledgment to Sarah
▸ Block time on your calendar for this review
▸ Remind you Thursday morning
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Creating a Tez

When sending, the user starts simple:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: David Kim

┌─────────────────────────────────────────────────────────┐
│ Can you review the Q4 budget proposal?                  │
│                                                 🎤 ⌨️  │
└─────────────────────────────────────────────────────────┘

[Add Context]   [Add Attachment]   [Send as Plain Text]

                              [Send as Tez ➔]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Tapping "Add Context" or "Send as Tez" prompts for depth:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILDING YOUR TEZ

Message: "Can you review the Q4 budget proposal?"

┌─────────────────────────────────────────────────────────┐
│ Why are you sending this? (PA will help structure)      │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Budget deadline Friday, need David's eyes on the   │ │
│ │ infrastructure costs since he caught the issue     │ │
│ │ last quarter. CFO is watching this one.            │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                 🎤 ⌨️  │
└─────────────────────────────────────────────────────────┘

☑ Include voice note for context (0:45 recorded)
☑ Attach Q4_Budget_Proposal_v2.xlsx
☐ Include relationship context (who else is involved)

Urgency: [Low] [Normal] [High ●] [Critical]

                              [Preview Tez]  [Send ➔]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The PA structures this input into proper Tez layers automatically.

## Depth Presets

Users can choose how much context to include:

| Preset | What's Included |
|--------|-----------------|
| **Minimal** | Surface message only, no explorable depth |
| **Standard** | Surface + Intent + Background |
| **Full** | All layers including artifacts and relationships |
| **Custom** | User selects specific layers |

## Thread View

When Tezzes are threaded, the conversation shows accumulated understanding:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THREAD: Q4 Budget Review
3 participants · 5 messages · Started Feb 5

┌─ Sarah (Feb 5, 2:30 PM) ────────────────────────────────┐
│ "Can you review the Q4 budget proposal?"                │
│ ↳ 3 layers · 2 attachments                              │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─ David (Feb 5, 4:15 PM) ────────────────────────────────┐
│ "Looking now. Quick Q: should I compare against Q3     │
│  actuals or the original Q4 projections?"               │
│ ↳ 1 layer · references Sarah's context                  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─ Sarah (Feb 5, 4:22 PM) ────────────────────────────────┐
│ "Q3 actuals—that's what Margaret will compare to."     │
│ ↳ 1 layer · adds fact about CFO preference              │
└─────────────────────────────────────────────────────────┘

[View Thread Context]  Shows accumulated facts across thread
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

# Part 7: Network & Federation {#part-7-network}

## The Federated Vision

Rather than centralized servers holding all Tezzes, the network is **federated**:

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   Alice's   │◄────────►│    Bob's    │◄────────►│   Carol's   │
│  OpenClaw   │   Tez    │  OpenClaw   │   Tez    │  OpenClaw   │
│  Instance   │          │  Instance   │          │  Instance   │
└─────────────┘          └─────────────┘          └─────────────┘
      │                        │                        │
      │ Team Alpha             │ Team Alpha             │ Team Beta
      │ Team Beta              │ Team Beta              │
      ▼                        ▼                        ▼
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Local Tez   │          │ Local Tez   │          │ Local Tez   │
│   Store     │          │   Store     │          │   Store     │
└─────────────┘          └─────────────┘          └─────────────┘
```

Each user:
- Runs their own OpenClaw instance
- Stores their own Tezzes locally
- Can belong to multiple teams
- Exchanges Tezzes peer-to-peer or via relays

## Team Configuration (CRDT-based)

Teams are defined by shared configuration that syncs without a central server:

```typescript
interface TeamConfig {
  id: string;
  name: string;

  // Membership (Add-Wins Set - can't accidentally remove)
  members: AWSet<{
    userId: string;
    publicKey: string;
    roles: string[];
    joinedAt: Date;
  }>;

  // Settings (Last-Writer-Wins per key)
  settings: LWWMap<string, unknown>;

  // Invite management
  inviteCodes: LWWMap<string, {
    code: string;
    createdBy: string;
    expiresAt?: Date;
    usesRemaining?: number;
  }>;

  // Version vector for sync
  vectorClock: VectorClock;
}
```

When team members come online, they sync configurations:

```typescript
// Peer discovery
const peers = await discoverTeamPeers(teamId);

// Sync configuration
for (const peer of peers) {
  const theirConfig = await peer.getTeamConfig(teamId);
  localConfig = mergeConfigs(localConfig, theirConfig);  // CRDT merge
}

// Broadcast our state
await broadcastConfig(localConfig, peers);
```

## Tez Routing

### Direct Delivery

When both parties are online:

```
Alice                                              Bob
  │                                                 │
  │  1. Create Tez                                  │
  │  2. Encrypt for Bob's public key                │
  │  3. Sign with Alice's private key               │
  │                                                 │
  ├────────────── Tez Envelope ────────────────────►│
  │                                                 │
  │                        4. Verify Alice's signature
  │                        5. Decrypt with Bob's private key
  │                        6. Process Tez
  │                        7. Send acknowledgment
  │                                                 │
  │◄───────────── Acknowledgment ──────────────────┤
  │                                                 │
```

### Relay Delivery

When recipient is offline or unreachable:

```
Alice                    Relay                      Bob
  │                        │                         │
  │  Tez (encrypted)       │                         │
  ├───────────────────────►│                         │
  │                        │  Store until            │
  │                        │  Bob connects           │
  │                        │                         │
  │                        │◄──── Bob comes online ──┤
  │                        │                         │
  │                        │  Deliver Tez            │
  │                        ├────────────────────────►│
  │                        │                         │
  │◄─────── Acknowledgment (via relay) ─────────────┤
  │                        │                         │
```

Relays cannot read Tez content (end-to-end encrypted) but can see routing metadata.

### AI-Assisted Routing

When recipient is specified as a role or hint:

```typescript
// User sends to "whoever handles billing"
const tez = await createTez({
  message: "Invoice question",
  to: { type: "ai-routed", hint: "billing questions" }
});

// PA analyzes team members
const candidates = await analyzeRoutingCandidates(
  tez,
  teamMembers,
  {
    skills: true,
    currentWorkload: true,
    recentActivity: true,
    relationships: true
  }
);

// Suggest or auto-route
if (candidates.confidence > 0.9) {
  await sendTez(tez, candidates.best.userId);
} else {
  await promptUserForRouting(tez, candidates.top3);
}
```

## Multi-Team Context Isolation

Users can belong to multiple teams without context leaking:

```typescript
interface UserContextStore {
  // Personal context (always active)
  personal: ContextPool;

  // Per-team contexts (activated based on current scope)
  teams: Map<TeamId, ContextPool>;

  // Active scope
  activeScope: "personal" | TeamId;
}

// When processing a Tez
function getRelevantContext(tez: Tez): ContextPool {
  if (tez.origin.teamId) {
    return contextStore.teams.get(tez.origin.teamId);
  }
  return contextStore.personal;
}

// Context doesn't leak between teams
const teamAContext = contextStore.teams.get("team_a");
const teamBContext = contextStore.teams.get("team_b");
// These are completely separate pools
```

---

# Part 8: Privacy, Security & Trust {#part-8-privacy}

## Encryption Model

All Tezzes are encrypted end-to-end by default:

```
┌─────────────────────────────────────────────────────────────┐
│                     TEZ ENVELOPE                            │
├─────────────────────────────────────────────────────────────┤
│  Routing Header (unencrypted)                               │
│  ├── From: alice@tez.network                                │
│  ├── To: bob@tez.network                                    │
│  ├── Timestamp: 2026-02-05T14:30:00Z                        │
│  └── TTL: 86400                                             │
├─────────────────────────────────────────────────────────────┤
│  Encrypted Payload                                          │
│  ├── Algorithm: x25519-xsalsa20-poly1305                    │
│  ├── Recipient Public Key: ed25519:bob_pub_xyz...           │
│  ├── Nonce: random_24_bytes                                 │
│  └── Ciphertext: [encrypted Tez content]                    │
├─────────────────────────────────────────────────────────────┤
│  Signature                                                  │
│  ├── Algorithm: ed25519                                     │
│  ├── Signer Public Key: ed25519:alice_pub_abc...            │
│  └── Value: [signature over envelope]                       │
└─────────────────────────────────────────────────────────────┘
```

Only the recipient can decrypt. Relays see routing but not content.

## Key Management

Each user has:
- **Identity Key Pair**: Long-term, used for signatures and identity
- **Encryption Key Pairs**: Rotated regularly, used for message encryption
- **Team Key Shares**: For team-wide broadcasts (threshold encryption)

```typescript
interface UserKeys {
  identity: {
    publicKey: string;
    privateKey: string;  // Stored securely, never transmitted
    created: Date;
  };

  encryption: {
    current: KeyPair;
    previous: KeyPair[];  // For decrypting old messages
    rotationSchedule: "weekly" | "monthly";
  };

  teamKeys: Map<TeamId, {
    shareIndex: number;
    share: string;
    threshold: number;
    totalShares: number;
  }>;
}
```

## Permission Enforcement

Tez permissions are enforced at multiple levels:

### 1. Protocol Level

```typescript
// When receiving a forwarded Tez
if (!originalTez.permissions.canForward) {
  // Reject the forward
  throw new TezPermissionError("Original Tez does not permit forwarding");
}
```

### 2. Application Level

```typescript
// When user tries to copy Tez content
if (!tez.permissions.canQuote) {
  // Disable copy functionality in UI
  disableCopyButton();
  showTooltip("Sender has restricted quoting");
}
```

### 3. Social Level

Even if technically possible to screenshot, the Tez carries explicit permission metadata that establishes social norms.

## Expiration and Revocation

### Time-Based Expiration

```typescript
interface TezExpiration {
  // Absolute expiration
  expiresAt?: ISO8601DateTime;

  // Relative expiration
  ttlSeconds?: number;

  // View-based expiration
  maxViews?: number;
  currentViews?: number;

  // What happens on expiration
  onExpiry: "delete" | "archive" | "redact-artifacts" | "surface-only";
}
```

### Active Revocation

```typescript
// Sender can revoke a Tez
await revokeTez(tezId, {
  reason: "sent_in_error",
  replacement?: newTezId,  // Optional replacement
});

// Recipients receive revocation notice
// Their clients handle according to policy
```

## Audit Trail

Every Tez operation is logged locally:

```typescript
interface TezAuditEntry {
  timestamp: ISO8601DateTime;
  operation: "created" | "sent" | "received" | "read" | "absorbed" |
             "forwarded" | "quoted" | "expired" | "revoked";
  tezId: string;
  actor: string;
  details?: Record<string, unknown>;
}

// Example entries
[
  { op: "created", tezId: "tez_abc", actor: "alice", ts: "..." },
  { op: "sent", tezId: "tez_abc", actor: "alice", details: { to: "bob" } },
  { op: "received", tezId: "tez_abc", actor: "bob", ts: "..." },
  { op: "read", tezId: "tez_abc", actor: "bob", ts: "..." },
  { op: "absorbed", tezId: "tez_abc", actor: "bob", details: { facts: 3 } },
]
```

---

# Part 9: Adoption & Ecosystem {#part-9-ecosystem}

## Gradual Adoption Path

Tez is designed for incremental adoption:

### Level 1: Tez-Aware

User has a Tez-compatible client but doesn't actively use depth.
- Receives Tezzes as enhanced messages
- Can explore context when needed
- Replies are plain messages

### Level 2: Tez-Enabled

User actively sends Tezzes.
- Creates Tez with context for important communications
- PA helps structure context automatically
- Absorbs received context into memory

### Level 3: Tez-Native

User defaults to Tez for all meaningful communication.
- Plain text reserved for truly casual exchanges
- Rich context network with frequent contacts
- PA manages accumulated understanding

## Backwards Compatibility

### Email Bridge

Tezzes can be delivered via email for non-Tez recipients:

```
From: alice@company.com
To: bob@external.com
Subject: Budget Review Request

Can you review the Q4 budget proposal?

---
This message was sent as a Tez with additional context.
View the full Tez: https://tez.link/abc123
(Install Tez to see context in future messages)
---

[Attached: Q4_Budget_Proposal_v2.xlsx]
```

### SMS/Chat Bridge

For platforms without rich content:

```
From: Alice
Can you review the Q4 budget proposal?

📎 This is a Tez with 3 context layers.
Tap to expand: tez.link/abc123
```

### Progressive Enhancement

```typescript
// Check recipient capabilities
const capabilities = await getRecipientCapabilities(recipientId);

if (capabilities.tezVersion >= "1.0") {
  // Full Tez delivery
  await sendFullTez(tez);
} else if (capabilities.richContent) {
  // Degraded but enhanced
  await sendTezAsRichMessage(tez);
} else {
  // Plain text fallback
  await sendTezAsSMS(tez);
}
```

## Plugin Ecosystem

Third-party developers can extend Tez:

### Artifact Processors

```typescript
// Plugin that processes specific artifact types
const legalDocumentPlugin: TezArtifactPlugin = {
  id: "legal-document-processor",
  supportedTypes: ["application/pdf"],

  async process(artifact: TezArtifact): Promise<ArtifactExtraction> {
    // Extract clauses, parties, dates, obligations
    return {
      summary: "Service Agreement between...",
      keyPoints: ["Term: 2 years", "Auto-renewal clause"],
      entities: ["Acme Corp", "Widget Inc"],
      customFields: {
        contractType: "service_agreement",
        governingLaw: "Delaware",
        terminationClause: "30 days notice"
      }
    };
  }
};
```

### Context Enrichers

```typescript
// Plugin that adds context from external sources
const calendarEnricherPlugin: TezContextPlugin = {
  id: "calendar-enricher",

  async enrich(tez: Tez, userContext: PAContext): Promise<ContextEnrichment> {
    // Check if Tez mentions meetings or dates
    const mentions = extractDateMentions(tez.layers.surface.summary);

    if (mentions.length > 0) {
      const events = await getCalendarEvents(mentions);
      return {
        additionalFacts: events.map(e => ({
          claim: `Meeting "${e.title}" scheduled for ${e.date}`,
          confidence: 1.0,
          source: "verified"
        })),
        additionalRelationships: events.map(e => ({
          entity: e.title,
          entityType: "event",
          relationship: "scheduled_meeting",
          strength: 0.8
        }))
      };
    }

    return {};
  }
};
```

### Integration Bridges

```typescript
// Plugin that bridges Tez to external systems
const clickupBridgePlugin: TezBridgePlugin = {
  id: "clickup-bridge",
  targetSystem: "clickup",

  async exportTez(tez: Tez, options: ExportOptions): Promise<ExternalReference> {
    // Create ClickUp task from Tez
    const task = await clickup.createTask({
      name: tez.layers.surface.summary,
      description: renderTezAsMarkdown(tez),
      priority: mapUrgency(tez.layers.surface.urgency),
      attachments: tez.layers.artifacts
    });

    return {
      system: "clickup",
      id: task.id,
      url: task.url
    };
  },

  async importToTez(externalId: string): Promise<Partial<Tez>> {
    // Import ClickUp task as Tez context
    const task = await clickup.getTask(externalId);
    return {
      layers: {
        surface: { summary: task.name },
        context: { background: task.description },
        artifacts: task.attachments
      }
    };
  }
};
```

---

# Part 10: Future Directions {#part-10-future}

## Accumulated Understanding Networks

As Tezzes flow between people, networks of shared understanding emerge:

```
         Alice ←──────────────────→ Bob
           │ ╲                     ╱ │
           │   ╲    50 Tezzes    ╱   │
           │     ╲   shared   ╱     │
        30 │       ╲        ╱       │ 45
      Tezzes│         ╲    ╱         │Tezzes
           │           ╲╱           │
           │           ╱╲           │
           │         ╱    ╲         │
           │       ╱        ╲       │
           │     ╱   20      ╲      │
           │   ╱    Tezzes      ╲    │
           │ ╱                   ╲  │
           ▼                       ▼
         Carol ←────────────────→ David
                   35 Tezzes
```

Each edge represents accumulated shared context. The more Tezzes exchanged, the richer the mutual understanding.

## Organizational Memory

Teams build persistent context over time:

```typescript
interface TeamMemory {
  // Decisions and their reasoning
  decisions: {
    tezId: string;
    decision: string;
    reasoning: string;
    participants: string[];
    date: Date;
  }[];

  // Accumulated facts (deduplicated, conflict-resolved)
  factBase: TezFact[];

  // Relationship graph
  entityGraph: Graph<Entity, Relationship>;

  // Searchable archive
  archive: SearchableStore<Tez>;
}

// New team member onboarding
async function onboardNewMember(member: User, team: Team) {
  // Generate context summary from team memory
  const summary = await generateTeamContextSummary(team.memory);

  // Create onboarding Tez
  const onboardingTez = await createTez({
    type: "introduction",
    layers: {
      surface: { summary: `Welcome to ${team.name}` },
      context: {
        background: summary.history,
        keyDecisions: summary.decisions,
        currentProjects: summary.activeWork,
        teamNorms: summary.norms
      },
      relationships: summary.keyPeople.map(p => ({
        entity: p.name,
        entityType: "person",
        relationship: p.role,
        context: p.whatTheyWorkOn
      }))
    }
  });

  await sendTez(onboardingTez, member.id);
}
```

## Cross-Language Understanding

Tez structure enables better translation:

```typescript
interface MultilingualTez extends Tez {
  layers: {
    surface: {
      summary: string;
      translations?: {
        [languageCode: string]: {
          text: string;
          translator: "human" | "ai";
          confidence?: number;
        }
      }
    };
    // ... other layers
  };
}

// When receiving a Tez in another language
async function processMultilingualTez(tez: MultilingualTez, userLang: string) {
  if (tez.layers.surface.translations?.[userLang]) {
    // Use existing translation
    return tez.layers.surface.translations[userLang].text;
  }

  // Translate with context (much better than translating surface alone)
  return await translateWithContext(
    tez.layers.surface.summary,
    tez.layers.context,      // Intent, background help translation
    tez.layers.facts,        // Named entities, technical terms
    userLang
  );
}
```

## Ambient Tez

Future interfaces might create Tezzes from ambient context:

```typescript
// Smart meeting room creates Tez from meeting
interface AmbientTezSource {
  type: "meeting" | "conversation" | "observation";

  capture(): Promise<RawCapture>;

  processToTez(
    capture: RawCapture,
    participants: User[],
    context: EnvironmentContext
  ): Promise<Tez>;
}

// After a meeting
const meetingTez = await meetingRoom.processToTez(recording, attendees, {
  calendarEvent: meetingEvent,
  previousMeetings: relatedMeetings,
  activeProjects: teamProjects
});

// Automatically distributed to attendees as meeting summary
// with full depth: transcript, action items, decisions, context
```

## The Tez Network Effect

As adoption grows:

1. **Individual Value**: Even one person using Tez benefits from structured thinking
2. **Pair Value**: Two people exchanging Tezzes build shared understanding
3. **Team Value**: Teams accumulate institutional memory
4. **Network Value**: Cross-organization Tezzes create industry context fabrics

The more Tez flows through the network, the more valuable each node becomes.

---

# Appendices

## A. Glossary

| Term | Definition |
|------|------------|
| **Tez** | A communication primitive containing surface message and explorable context layers |
| **Tezzes** | Plural of Tez |
| **Surface** | The immediately visible part of a Tez (the "message") |
| **Depth** | The explorable context layers beneath the surface |
| **Artifact** | Original, immutable content (voice, document, etc.) |
| **Fact** | A structured, verifiable claim extracted from communication |
| **PA** | Personal Assistant - the AI agent that helps create/process Tezzes |
| **Absorb** | Integrate Tez context into PA memory |
| **Interrogate** | Ask questions answered only from transmitted Tez context (not AI training) |
| **Thread** | A linked sequence of related Tezzes |
| **Fork** | A counter-Tez that challenges or extends the original with new evidence |
| **Synthesis** | A Tez type containing an authored analysis document with citations |
| **Library of Context** | Principle that original content is preserved forever |
| **Hosting Model** | Who provides AI compute for interrogation (sender, recipient, or platform) |
| **Living Document** | Context item linked to an external source that auto-updates |
| **Parameter** | A negotiable term with defined constraints and rationale |

## B. Protocol Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0-draft | Feb 2026 | Initial specification |
| 1.1.0-aligned | Feb 2026 | Align with Tezit Protocol v1.1: pluralization (Tezzes), add TEZ.INTERROGATE, add hosting models, add synthesis type support |

## C. Tezit Protocol v1.1 Additions

The following features are being added to align with the official Tezit Protocol:

### Tez Types (Message vs Synthesis)

```typescript
type TezType = "message" | "synthesis";

// Message type: surface.summary is the content (MyPA current model)
// Synthesis type: tez.md document with cited analysis is the content
```

### Hosting Models for Interrogation

```typescript
interface TezHosting {
  mode: "sender" | "recipient" | "platform";

  senderHosted?: {
    endpoint: string;
    budget: { maxQueries: number; remainingQueries: number; expiresAt?: string };
  };

  platformHosted?: {
    tezitEndpoint: string;
    tezitTezId: string;
  };
}
```

### Living Documents (Linked Sources)

```typescript
interface LinkedContextItem {
  source: "linked";
  linkedSource: {
    type: "google_sheets" | "notion" | "airtable";
    resourceId: string;
    syncFrequency: "realtime" | "hourly" | "daily";
    lastSynced: string;
    versionHistory: { version: string; syncedAt: string }[];
  };
}
```

### Parameters (Negotiable Terms)

```typescript
interface TezParameter {
  name: string;
  type: "range" | "enum" | "boolean";
  value: number | string | boolean;
  constraints?: { min: number; max: number };
  rationale: string;
  history?: { proposedBy: string; value: any; timestamp: string }[];
}
```

### Forking as Counter-Argument

```typescript
interface TezFork {
  lineage: {
    originalTezId: string;
    forkType: "counter" | "amendment" | "extension";
    challenges?: { targetLayer: string; nature: string }[];
  };
}
```

See `TEZ_PROTOCOL_ALIGNMENT.md` for full implementation details.

## C. Reference Implementations

| Implementation | Language | Status | Repository |
|----------------|----------|--------|------------|
| MyPA | TypeScript | Reference | github.com/mypa |
| OpenClaw Plugin | TypeScript | In Development | - |
| tez-js | JavaScript | Planned | - |
| tez-py | Python | Planned | - |

---

*This document is a living specification. Contributions and feedback welcome.*

*For the latest version, visit: tezit.com/spec*
