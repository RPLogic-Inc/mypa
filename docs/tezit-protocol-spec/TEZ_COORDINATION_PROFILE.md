# Tezit Protocol: Coordination Profile Specification

**Version**: 1.1-draft
**Status**: Proposal
**Date**: February 5, 2026
**Authors**: Ragu Platform Team (Enterprise AI Orchestration)
**Extends**: Tezit Protocol Specification v1.2, Section 1.8.2
**Repository**: [github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)
**License**: CC BY 4.0

---

## Abstract

This document specifies the Coordination Profile for the Tezit Protocol. The
Coordination Profile defines a surface schema, state machine, dependency model,
periodic review cadence, escalation patterns, and dashboard aggregation rules
for tezits whose purpose is team coordination -- tasks, decisions, questions,
and blockers backed by communication context.

The Tezit Protocol v1.2 specification (Section 1.8.2) introduces the
Coordination Profile with a minimal surface schema (`item_type`, `status`,
`assignee`, `due_date`, `recipients`). This document provides the full
specification required for interoperable implementations, based on production
patterns from the Ragu Platform orchestrator system.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Conformance](#2-conformance)
3. [Terminology](#3-terminology)
4. [Surface Schema](#4-surface-schema)
5. [Item Type Schemas](#5-item-type-schemas)
6. [Status State Machine](#6-status-state-machine)
7. [Recipients and Roles](#7-recipients-and-roles)
8. [Dependency Modeling](#8-dependency-modeling)
9. [Periodic Review Cadence](#9-periodic-review-cadence)
10. [Escalation Patterns](#10-escalation-patterns)
11. [Context Trail](#11-context-trail)
12. [Interrogation Integration](#12-interrogation-integration)
13. [Dashboard Aggregation](#13-dashboard-aggregation)
14. [Manifest Extension](#14-manifest-extension)
15. [Security Considerations](#15-security-considerations)
16. [Implementation Guidance](#16-implementation-guidance)
17. [Examples](#17-examples)

Appendix A: [Full JSON Schema](#appendix-a-full-json-schema)
Appendix B: [Ragu Platform Production Patterns](#appendix-b-ragu-platform-production-patterns)
Appendix C: [Change Log](#appendix-c-change-log)

---

## 1. Introduction

### 1.1 Motivation

The Tezit Protocol defines tezits as bundles of synthesis and context. Most
tezit profiles (Research, Recommendation, Proposal) capture analytical
artifacts -- the output of thinking. The Coordination Profile captures a
fundamentally different class of artifact: **actionable items that emerge from
communication and require tracking through a lifecycle**.

When a team discusses work over voice memos, chat, email, or meeting notes,
actionable items emerge: tasks to complete, decisions to ratify, questions to
answer, blockers to resolve. Today these items are scattered across tools
(Jira, Asana, Slack, email) with their originating context severed. The
recipient of a task knows *what* to do but not *why it was decided* or *what
conversation produced it*.

The Coordination Profile solves this by treating each actionable item as a
tezit whose context is the communication that produced it. A task tezit
carries not just an assignee and due date, but the meeting recording, chat
thread, or voice memo where the task was identified. Recipients can
interrogate the tezit to ask "Why was this assigned to me?" or "What was
the original discussion about this?" and receive grounded answers from the
communication context.

### 1.2 Scope

This specification defines:

- Surface schema for coordination tezits (Section 4)
- Per-item-type schemas for tasks, decisions, questions, and blockers (Section 5)
- Status state machine with valid transitions and timestamp tracking (Section 6)
- Role-based recipient model (Section 7)
- Inter-item dependency modeling (Section 8)
- Periodic review cadence for coordination tezit management (Section 9)
- Escalation patterns and auto-escalation rules (Section 10)
- Context trail linking items to originating communication (Section 11)
- Integration with the Tez Interrogation Protocol (Section 12)
- Dashboard aggregation from multiple coordination tezits (Section 13)
- Manifest extension schema (Section 14)

This specification does NOT define:

- UI/UX for coordination dashboards (implementation-specific)
- Notification delivery mechanisms (use existing protocols)
- User identity or authentication (use Tezit Protocol core or external standards)
- Specific AI models for interrogation (use TIP)

### 1.3 Relationship to Tezit Protocol v1.2

This document extends Section 1.8.2 of the Tezit Protocol Specification v1.2.
Coordination tezits are valid tezits: they have a manifest, a synthesis
document, context items, and optionally a conversation record and parameters.
The Coordination Profile adds a `coordination` extension object to the manifest
and defines profile-specific semantics for the synthesis and context.

A conformant Tezit Protocol v1.2 implementation that does not support the
Coordination Profile MUST still be able to consume coordination tezits as
generic tezits, rendering the synthesis and listing context items. The
coordination-specific metadata (status, dependencies, escalation rules) will
appear in the extensions object and MAY be ignored by non-supporting
implementations.

### 1.4 Production Origin

The patterns in this specification are derived from the Ragu Platform
orchestrator system, a production AI coordination framework that manages
multi-agent software development across 29 packages, 2,500+ tests, and 21
build phases. The orchestrator tracks tasks, decisions, blockers, and status
updates with periodic review cadences (10-minute quick checks and 40-minute
deep refreshes), dependency modeling, escalation rules, and dashboard
aggregation. See Appendix B for a mapping of Ragu patterns to this
specification.

---

## 2. Conformance

### 2.1 Conformance Levels

The Coordination Profile defines two conformance levels:

**Level 1 (Basic Coordination)**: An implementation MUST support:
- All four item types (task, decision, question, blocker)
- The status state machine (Section 6)
- Role-based recipients (Section 7)
- The coordination manifest extension (Section 14)

**Level 2 (Full Coordination)**: An implementation MUST additionally support:
- Dependency modeling (Section 8)
- Periodic review cadence (Section 9)
- Escalation patterns (Section 10)
- Context trail (Section 11)
- Interrogation integration (Section 12)
- Dashboard aggregation (Section 13)

### 2.2 RFC 2119 Keywords

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be
interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

---

## 3. Terminology

| Term | Definition |
|------|-----------|
| **Coordination tezit** | A tezit conforming to the Coordination Profile |
| **Item** | A single actionable unit within a coordination tezit (task, decision, question, or blocker) |
| **Item type** | One of: `task`, `decision`, `question`, `blocker` |
| **Status** | The lifecycle state of an item |
| **Assignee** | The person or agent responsible for the item |
| **Reviewer** | A person or agent who must approve the item's completion |
| **Context trail** | The communication artifacts that produced the item |
| **Review cadence** | A periodic schedule for evaluating coordination state |
| **Escalation** | Automatic elevation of an item's urgency based on rules |
| **Dashboard** | An aggregated view of multiple coordination tezits |
| **Stale item** | An item that has not been updated within its expected cadence |

---

## 4. Surface Schema

### 4.1 Coordination Surface Object

Every coordination tezit MUST include a `coordination` object in its manifest
`extensions` field. This object is the surface schema for the profile.

```json
{
  "extensions": {
    "tezit-coordination": {
      "profile_version": "1.0",
      "item_type": "task",
      "status": "in_progress",
      "priority": "high",
      "assignee": {
        "id": "user-jane-001",
        "name": "Jane Smith",
        "email": "jane@example.com"
      },
      "created_by": {
        "id": "user-pm-001",
        "name": "Project Manager",
        "email": "pm@example.com"
      },
      "recipients": [],
      "due_date": "2026-02-10T17:00:00Z",
      "dependencies": [],
      "escalation": {},
      "review_cadence": {},
      "context_trail": [],
      "tags": [],
      "custom_fields": {}
    }
  }
}
```

### 4.2 Required Fields

The following fields MUST be present in every coordination surface object:

| Field | Type | Description |
|-------|------|-------------|
| `profile_version` | string | Version of this Coordination Profile spec (e.g., `"1.0"`) |
| `item_type` | string | One of: `task`, `decision`, `question`, `blocker` |
| `status` | string | Current lifecycle status (see Section 6) |
| `priority` | string | One of: `critical`, `high`, `medium`, `low` |
| `created_by` | object | The person or agent that created the item |

### 4.3 Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `assignee` | object | Person or agent responsible (REQUIRED for `task` items) |
| `recipients` | array | List of recipient objects with roles (Section 7) |
| `due_date` | string | ISO 8601 datetime for expected completion |
| `dependencies` | array | List of dependency objects (Section 8) |
| `escalation` | object | Escalation rules (Section 10) |
| `review_cadence` | object | Periodic review configuration (Section 9) |
| `context_trail` | array | Communication artifacts that produced this item (Section 11) |
| `tags` | array | String tags for categorization and filtering |
| `custom_fields` | object | Implementation-defined additional fields |

### 4.4 Person Object

Person references (used in `assignee`, `created_by`, and `recipients`) MUST
conform to the following schema:

```json
{
  "id": "string (REQUIRED)",
  "name": "string (REQUIRED)",
  "email": "string (OPTIONAL)",
  "role": "string (OPTIONAL, context-dependent)",
  "type": "string (OPTIONAL, default: 'human')"
}
```

The `type` field distinguishes human participants from AI agents:
- `human`: A human person (default)
- `agent`: An AI agent or automated system
- `group`: A group or team (the `id` references a group identifier)

---

## 5. Item Type Schemas

Each item type defines additional REQUIRED and OPTIONAL fields beyond the base
surface schema. The item-type-specific fields are nested under a key matching
the item type name within the coordination extension object.

### 5.1 Task

A task represents work to be performed by an assignee.

```json
{
  "extensions": {
    "tezit-coordination": {
      "item_type": "task",
      "status": "in_progress",
      "priority": "high",
      "assignee": { "id": "user-001", "name": "Jane Smith" },
      "created_by": { "id": "user-pm-001", "name": "PM" },
      "due_date": "2026-02-10T17:00:00Z",
      "task": {
        "description": "Implement rate limiting for the chat-api service",
        "acceptance_criteria": [
          "Rate limiter enforces 100 req/min per tenant",
          "429 responses include Retry-After header",
          "Tests cover normal, burst, and exceeded scenarios"
        ],
        "estimated_effort": "4h",
        "actual_effort": null,
        "deliverables": [
          "packages/ragu-rate-limit/src/",
          "packages/ragu-rate-limit/tests/"
        ],
        "phase": "Phase 20",
        "category": "implementation"
      }
    }
  }
}
```

**Task-specific REQUIRED fields:**

| Field | Type | Description |
|-------|------|-------------|
| `task.description` | string | Human-readable description of the work |

**Task-specific OPTIONAL fields:**

| Field | Type | Description |
|-------|------|-------------|
| `task.acceptance_criteria` | array of strings | Conditions that define completion |
| `task.estimated_effort` | string | Estimated effort (freeform, e.g., `"4h"`, `"2d"`, `"1 sprint"`) |
| `task.actual_effort` | string or null | Actual effort upon completion |
| `task.deliverables` | array of strings | File paths, URLs, or artifact identifiers |
| `task.phase` | string | Project phase or milestone this task belongs to |
| `task.category` | string | One of: `implementation`, `testing`, `review`, `documentation`, `infrastructure`, `investigation`, `custom` |

The `assignee` field is REQUIRED for task items. A task without an assignee
is invalid.

### 5.2 Decision

A decision represents a choice that has been made (or needs to be made) by a
responsible party, with the reasoning and alternatives preserved as context.

```json
{
  "extensions": {
    "tezit-coordination": {
      "item_type": "decision",
      "status": "completed",
      "priority": "high",
      "created_by": { "id": "user-pm-001", "name": "PM" },
      "decision": {
        "question": "Should we delete the legacy auth adapter or maintain it?",
        "chosen_option": "Delete and migrate",
        "options_considered": [
          {
            "id": "opt-1",
            "label": "Delete and migrate",
            "description": "Remove legacy adapter, migrate all consumers to new auth",
            "pros": ["Clean codebase", "No maintenance burden"],
            "cons": ["Migration effort", "Risk of missed consumers"]
          },
          {
            "id": "opt-2",
            "label": "Maintain both",
            "description": "Keep legacy adapter alongside new auth",
            "pros": ["No migration needed", "Zero consumer impact"],
            "cons": ["Double maintenance", "Confusion about which to use"]
          }
        ],
        "rationale": "Migration effort is bounded (3 consumers) and the maintenance burden of dual auth is unacceptable for a team of this size.",
        "decided_by": { "id": "user-pm-001", "name": "PM" },
        "decided_at": "2026-02-03T14:30:00Z",
        "reversible": true,
        "reversal_conditions": "If migration reveals more than 10 undocumented consumers"
      }
    }
  }
}
```

**Decision-specific REQUIRED fields:**

| Field | Type | Description |
|-------|------|-------------|
| `decision.question` | string | The question or choice being addressed |

**Decision-specific OPTIONAL fields:**

| Field | Type | Description |
|-------|------|-------------|
| `decision.chosen_option` | string | Label of the selected option (REQUIRED when status is `completed`) |
| `decision.options_considered` | array | Options that were evaluated |
| `decision.rationale` | string | Explanation for the chosen option |
| `decision.decided_by` | object | Person who made the final decision |
| `decision.decided_at` | string | ISO 8601 datetime of the decision |
| `decision.reversible` | boolean | Whether this decision can be reversed |
| `decision.reversal_conditions` | string | Conditions under which reversal is appropriate |

Each option object in `options_considered` MUST include `id` and `label`.
The `description`, `pros`, and `cons` fields are OPTIONAL.

### 5.3 Question

A question represents something that requires an answer from a specific person
or group before work can proceed.

```json
{
  "extensions": {
    "tezit-coordination": {
      "item_type": "question",
      "status": "pending",
      "priority": "medium",
      "created_by": { "id": "agent-coder-left", "name": "Claude Code (Left)", "type": "agent" },
      "question": {
        "text": "Should /chat/new be implemented as a separate route, or should the sidebar link point to /chat with a query parameter?",
        "context_summary": "NavSidebar links to /chat/new which currently 404s. See FRONTEND_ISSUES.md issue #3.",
        "directed_to": [
          { "id": "user-pm-001", "name": "PM" }
        ],
        "options": [
          "Implement /chat/new as a separate Next.js route",
          "Change link to /chat?new=true",
          "Remove link until feature is ready"
        ],
        "answer": null,
        "answered_by": null,
        "answered_at": null
      }
    }
  }
}
```

**Question-specific REQUIRED fields:**

| Field | Type | Description |
|-------|------|-------------|
| `question.text` | string | The question being asked |

**Question-specific OPTIONAL fields:**

| Field | Type | Description |
|-------|------|-------------|
| `question.context_summary` | string | Brief context for why the question arose |
| `question.directed_to` | array | Person(s) the question is directed to |
| `question.options` | array of strings | Suggested answer options |
| `question.answer` | string or null | The answer (REQUIRED when status is `completed`) |
| `question.answered_by` | object or null | Person who answered |
| `question.answered_at` | string or null | ISO 8601 datetime of the answer |

### 5.4 Blocker

A blocker represents an impediment that prevents one or more tasks from
proceeding. Blockers carry urgency semantics and are the primary trigger for
escalation rules.

```json
{
  "extensions": {
    "tezit-coordination": {
      "item_type": "blocker",
      "status": "acknowledged",
      "priority": "critical",
      "created_by": { "id": "agent-coder-right", "name": "Claude Code (Right)", "type": "agent" },
      "blocker": {
        "description": "CDK synth for prod environment fails: 'When providing vpc options you need to provide a subnet for each AZ you are using'",
        "impact": "Cannot deploy to production. Phase 19 completion blocked.",
        "affected_items": [
          { "tez_id": "task-deploy-prod-001", "title": "Deploy to production" },
          { "tez_id": "task-smoke-tests-002", "title": "Run production smoke tests" }
        ],
        "root_cause": "ElastiCache cluster configured with zone awareness but VPC only provides subnets in 2 of 3 AZs",
        "attempted_resolutions": [
          {
            "description": "Added onePerAz: true to subnet selection",
            "result": "Partial fix -- still fails for 3-AZ configuration",
            "timestamp": "2026-01-23T16:00:00Z"
          }
        ],
        "resolution": null,
        "resolved_by": null,
        "resolved_at": null
      }
    }
  }
}
```

**Blocker-specific REQUIRED fields:**

| Field | Type | Description |
|-------|------|-------------|
| `blocker.description` | string | What is blocked and why |
| `blocker.impact` | string | Impact assessment on the project or workflow |

**Blocker-specific OPTIONAL fields:**

| Field | Type | Description |
|-------|------|-------------|
| `blocker.affected_items` | array | Items blocked by this blocker |
| `blocker.root_cause` | string | Identified root cause |
| `blocker.attempted_resolutions` | array | Resolutions already tried |
| `blocker.resolution` | string or null | How the blocker was resolved (REQUIRED when status is `completed`) |
| `blocker.resolved_by` | object or null | Person who resolved it |
| `blocker.resolved_at` | string or null | ISO 8601 datetime of resolution |

Each object in `affected_items` MUST include a `tez_id` referencing the
blocked coordination tezit. The `title` field is OPTIONAL but RECOMMENDED
for human readability.

Each object in `attempted_resolutions` MUST include `description` and `result`.
The `timestamp` field is OPTIONAL.

---

## 6. Status State Machine

### 6.1 Status Values

All coordination items use the following status values:

| Status | Description |
|--------|-------------|
| `pending` | Created but not yet acknowledged by the assignee or responsible party |
| `acknowledged` | The responsible party has seen and accepted the item |
| `in_progress` | Active work is underway |
| `blocked` | Work is impeded by an external dependency or blocker |
| `completed` | The item has been fulfilled or resolved |
| `cancelled` | The item has been withdrawn or is no longer relevant |

### 6.2 Valid Transitions

Implementations MUST enforce the following state transition rules. Any
transition not listed below is invalid and MUST be rejected.

```
                  +---> acknowledged ---> in_progress ---> completed
                  |         |                 |
  pending --------+         |                 +---> blocked ---> in_progress
                  |         |                                        |
                  |         +---> blocked ---> acknowledged          +---> completed
                  |         |
                  +---> cancelled
                  |
                  +---> completed (for trivial items)

  Any state -----> cancelled (administrative override)
```

**Transition table:**

| From | To | Condition |
|------|----|-----------|
| `pending` | `acknowledged` | Assignee or responsible party accepts |
| `pending` | `cancelled` | Creator or admin withdraws |
| `pending` | `completed` | Trivial items that require no work (e.g., informational decisions) |
| `acknowledged` | `in_progress` | Work begins |
| `acknowledged` | `blocked` | Impediment identified before work starts |
| `acknowledged` | `cancelled` | Item withdrawn after acknowledgment |
| `in_progress` | `completed` | Work finished and acceptance criteria met |
| `in_progress` | `blocked` | Impediment encountered during work |
| `in_progress` | `cancelled` | Item withdrawn during work |
| `blocked` | `acknowledged` | Blocker resolved, item returns to queue |
| `blocked` | `in_progress` | Blocker resolved, work resumes immediately |
| `blocked` | `cancelled` | Item withdrawn while blocked |
| `completed` | `pending` | Reopened (e.g., review rejection, regression) |

### 6.3 Transition Records

Every status transition MUST be recorded in a `status_history` array within
the coordination extension. Each record MUST include:

```json
{
  "status_history": [
    {
      "from": "pending",
      "to": "acknowledged",
      "timestamp": "2026-02-03T10:15:00Z",
      "actor": { "id": "user-jane-001", "name": "Jane Smith" },
      "reason": null
    },
    {
      "from": "acknowledged",
      "to": "in_progress",
      "timestamp": "2026-02-03T10:20:00Z",
      "actor": { "id": "user-jane-001", "name": "Jane Smith" },
      "reason": "Starting implementation"
    },
    {
      "from": "in_progress",
      "to": "blocked",
      "timestamp": "2026-02-03T14:00:00Z",
      "actor": { "id": "user-jane-001", "name": "Jane Smith" },
      "reason": "Waiting for decision on auth adapter approach"
    }
  ]
}
```

**Required fields per transition record:**

| Field | Type | Description |
|-------|------|-------------|
| `from` | string | Previous status |
| `to` | string | New status |
| `timestamp` | string | ISO 8601 datetime of the transition |
| `actor` | object | Person or agent that triggered the transition |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `reason` | string | Human-readable explanation for the transition |

### 6.4 Item-Type-Specific Status Semantics

While all item types share the same status values, the meaning of certain
statuses varies by item type:

| Status | Task | Decision | Question | Blocker |
|--------|------|----------|----------|---------|
| `pending` | Unassigned or unacknowledged | Awaiting deliberation | Awaiting response | Reported but unacknowledged |
| `acknowledged` | Assignee accepted | Under active deliberation | Recipient has seen the question | Investigation underway |
| `in_progress` | Work is happening | N/A (use `acknowledged`) | N/A (use `acknowledged`) | Resolution in progress |
| `blocked` | Blocked by external dep | Blocked by missing info | N/A | N/A (blockers do not self-block) |
| `completed` | Work done, criteria met | Decision made and recorded | Answer provided | Impediment resolved |
| `cancelled` | Withdrawn | Decision deferred indefinitely | Question no longer relevant | Blocker no longer applicable |

Implementations MUST NOT allow `in_progress` status for `decision` or
`question` items. For these types, `acknowledged` represents active work.

> **Rationale (v1.1):** In practice, `in_progress` decisions without
> assignment are where coordination tezits stall. A decision is either
> pending (awaiting input) or completed (resolved). The intermediate state
> adds no value and creates ambiguity about responsibility.

---

## 7. Recipients and Roles

### 7.1 Recipient Object

Each coordination tezit MAY include a `recipients` array. Each recipient
object MUST conform to:

```json
{
  "id": "string (REQUIRED)",
  "name": "string (REQUIRED)",
  "email": "string (OPTIONAL)",
  "type": "string (OPTIONAL, default: 'human')",
  "role": "string (REQUIRED)"
}
```

### 7.2 Standard Roles

| Role | Description | Responsibilities |
|------|-------------|-----------------|
| `assignee` | Responsible for completing the item | MUST complete the work or provide the answer |
| `reviewer` | Reviews and approves the item's completion | MUST verify acceptance criteria or correctness |
| `informed` | Notified of status changes | No action required; receives updates |
| `escalation_target` | Receives escalation when rules trigger | MUST act when escalation is received |
| `approver` | Must formally approve before item can be marked completed | MUST grant or deny approval |

### 7.3 Role Cardinality

| Role | Minimum | Maximum | Notes |
|------|---------|---------|-------|
| `assignee` | 1 (for tasks) | 1 | Single responsibility principle |
| `reviewer` | 0 | unbounded | Multiple reviewers allowed |
| `informed` | 0 | unbounded | Notification list |
| `escalation_target` | 0 | unbounded | Ordered by escalation level |
| `approver` | 0 | unbounded | All must approve (AND logic) |

An item MUST NOT have more than one `assignee`. If work is distributed across
multiple people, it SHOULD be split into multiple coordination tezits with
a dependency relationship (Section 8).

### 7.4 Role Inheritance

When a coordination tezit is forked, the fork MUST NOT inherit the original's
recipient list. The fork creator becomes the new `created_by` and MUST
explicitly assign recipients. This prevents unintended notification of parties
who are not involved in the forked work.

---

## 8. Dependency Modeling

### 8.1 Dependency Object

Coordination items MAY declare dependencies on other coordination tezits.
Dependencies are declared in the `dependencies` array of the coordination
extension.

```json
{
  "dependencies": [
    {
      "tez_id": "decision-auth-adapter-001",
      "type": "blocks",
      "title": "Decision: Auth adapter approach",
      "required_status": "completed",
      "description": "Cannot implement auth migration until approach is decided"
    }
  ]
}
```

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tez_id` | string | Identifier of the dependency tezit |
| `type` | string | Dependency type (see Section 8.2) |

**Optional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Human-readable title of the dependency |
| `required_status` | string | Status the dependency must reach (default: `completed`) |
| `description` | string | Why this dependency exists |

### 8.2 Dependency Types

| Type | Meaning |
|------|---------|
| `blocks` | This item cannot start until the dependency reaches `required_status` |
| `informs` | This item's approach depends on the outcome of the dependency, but work can begin |
| `follows` | This item should be done after the dependency, but is not strictly blocked |
| `related` | This item is related for tracking purposes; no sequencing constraint |

### 8.3 Cycle Detection

Implementations MUST detect and reject circular dependencies. A dependency
graph where item A depends on item B and item B depends on item A (directly
or transitively) is invalid.

Implementations SHOULD validate the dependency graph when a new dependency is
added and MUST report the cycle to the user with the full chain
(e.g., "A -> B -> C -> A").

### 8.4 Dependency Resolution

When a dependency reaches its `required_status`, the implementation SHOULD
automatically transition blocked items:

1. If the dependent item's status is `blocked` and the blocking dependency
   is the only remaining unresolved dependency, transition to `acknowledged`
   (or `in_progress` if it was previously in progress).
2. If the dependent item has multiple unresolved dependencies, it remains
   `blocked` until all are resolved.
3. Implementations MUST record the automatic transition in `status_history`
   with the `actor` set to the system (e.g., `{"id": "system", "name":
   "Dependency Resolution", "type": "agent"}`).

---

## 9. Periodic Review Cadence

### 9.1 Overview

Coordination tezits support periodic review cycles that ensure items do not
become stale. Review cadences define how often an item (or a collection of
items) should be evaluated, and what evaluation entails.

This pattern is derived from the Ragu Platform orchestrator, which uses
10-minute quick checks for immediate awareness and 40-minute deep refreshes
for comprehensive assessment. The Coordination Profile generalizes this into
a configurable cadence model.

### 9.2 Review Cadence Object

```json
{
  "review_cadence": {
    "quick_check": {
      "interval_minutes": 10,
      "actions": ["observe_status", "check_blockers", "act_on_stale"],
      "last_checked_at": "2026-02-05T10:00:00Z",
      "next_check_at": "2026-02-05T10:10:00Z"
    },
    "deep_refresh": {
      "interval_minutes": 40,
      "actions": [
        "refresh_context",
        "gather_evidence",
        "assess_dependencies",
        "update_status",
        "report"
      ],
      "last_refreshed_at": "2026-02-05T09:40:00Z",
      "next_refresh_at": "2026-02-05T10:20:00Z"
    },
    "staleness_threshold_minutes": 60
  }
}
```

### 9.3 Quick Check

A quick check is a lightweight review. Implementations SHOULD perform the
following steps:

1. **Observe**: Check the current status of the item and any related CI/CD or
   external system status.
2. **Check blockers**: Determine if any dependencies have been resolved or if
   new blockers have appeared.
3. **Act on stale**: If the item has not been updated since the last quick
   check and its status suggests active work (`in_progress`), flag it as
   potentially stale.

Quick checks SHOULD NOT modify the item's status without human or agent
confirmation. They are observational.

### 9.4 Deep Refresh

A deep refresh is a comprehensive assessment. Implementations SHOULD perform
the following steps:

1. **Refresh context**: Re-read the item's context trail (Section 11) to
   ensure the current understanding is accurate.
2. **Gather evidence**: Check external systems (CI status, test results,
   deployment status) for relevant updates.
3. **Assess dependencies**: Evaluate the dependency graph for changes.
4. **Update status**: If the assessment reveals the item's status should
   change (e.g., a blocker has been resolved), update it.
5. **Report**: Generate a status update for informed parties.

### 9.5 Staleness

An item is considered **stale** when the time since its last status transition
or update exceeds the `staleness_threshold_minutes` value. Stale items
SHOULD trigger a notification to the `assignee` and any `escalation_target`
recipients.

Implementations MUST track staleness independently from the item's status.
An `in_progress` item that has been active for 3 hours with no updates is
stale even though its status has not changed.

### 9.6 Cadence Configuration

Review cadences MAY be configured at three levels (from most specific to least
specific):

1. **Per-item**: Overrides all other levels.
2. **Per-project**: Applies to all items within a project or phase.
3. **Per-implementation**: Default cadence for the platform.

Implementations SHOULD provide sensible defaults. The following defaults are
RECOMMENDED:

| Check Type | Default Interval | Staleness Threshold |
|------------|-----------------|---------------------|
| Quick check | 10 minutes | N/A |
| Deep refresh | 40 minutes | N/A |
| Staleness | N/A | 60 minutes for `critical`, 4 hours for `high`, 24 hours for `medium`, 72 hours for `low` |

---

## 10. Escalation Patterns

### 10.1 Escalation Object

Items MAY define escalation rules that automatically elevate urgency or
notify additional parties when conditions are met.

```json
{
  "escalation": {
    "rules": [
      {
        "id": "esc-001",
        "trigger": {
          "type": "duration_in_status",
          "status": "pending",
          "threshold_hours": 4
        },
        "action": {
          "type": "notify",
          "targets": [
            { "id": "user-lead-001", "name": "Tech Lead", "role": "escalation_target" }
          ],
          "message": "Task has been pending for 4+ hours without acknowledgment"
        },
        "fired": false,
        "fired_at": null
      },
      {
        "id": "esc-002",
        "trigger": {
          "type": "duration_in_status",
          "status": "blocked",
          "threshold_hours": 24
        },
        "action": {
          "type": "escalate_priority",
          "new_priority": "critical",
          "notify_targets": [
            { "id": "user-director-001", "name": "Engineering Director", "role": "escalation_target" }
          ],
          "message": "Blocker unresolved for 24+ hours -- escalating to critical"
        },
        "fired": false,
        "fired_at": null
      }
    ],
    "escalation_history": []
  }
}
```

### 10.2 Trigger Types

| Type | Description | Required Parameters |
|------|-------------|---------------------|
| `duration_in_status` | Item has been in a specific status for longer than threshold | `status`, `threshold_hours` |
| `past_due_date` | Item's `due_date` has passed | `threshold_hours` (how long past due) |
| `dependency_stale` | A blocking dependency has been stale for longer than threshold | `dependency_tez_id`, `threshold_hours` |
| `review_missed` | A scheduled review cadence was missed | `missed_count` (number of consecutive misses) |
| `manual` | Triggered by explicit human or agent action | None (triggered directly) |

### 10.3 Action Types

| Type | Description | Required Parameters |
|------|-------------|---------------------|
| `notify` | Send notification to specified targets | `targets`, `message` |
| `escalate_priority` | Change the item's priority | `new_priority` |
| `reassign` | Change the item's assignee | `new_assignee` |
| `create_blocker` | Create a new blocker tezit | `blocker_description`, `blocker_impact` |
| `composite` | Execute multiple actions | `actions` (array of action objects) |

### 10.4 Escalation Levels

Implementations SHOULD support tiered escalation, where multiple rules fire
at increasing thresholds:

```
0-4 hours:   Stale notification to assignee
4-8 hours:   Notification to escalation_target (tech lead)
8-24 hours:  Priority escalated to critical + notification to director
24+ hours:   Reassignment considered + notification to VP
```

Escalation rules are evaluated during review cadence checks (Section 9).
Implementations MUST NOT evaluate escalation rules more frequently than the
quick check interval.

### 10.5 Escalation History

Every fired escalation rule MUST be recorded in `escalation_history`:

```json
{
  "escalation_history": [
    {
      "rule_id": "esc-001",
      "fired_at": "2026-02-03T14:15:00Z",
      "trigger_snapshot": {
        "status": "pending",
        "duration_hours": 4.2
      },
      "action_taken": "notify",
      "targets_notified": ["user-lead-001"]
    }
  ]
}
```

---

## 11. Context Trail

### 11.1 Overview

The context trail links a coordination item to the communication artifacts
that produced it. This is the core differentiator between a coordination
tezit and a conventional task tracker: the *why* travels with the *what*.

Context trail entries reference items in the tezit's `context/` directory,
preserving the originating communication (voice memos, chat messages, meeting
notes, email threads) alongside the actionable item.

### 11.2 Context Trail Entry

```json
{
  "context_trail": [
    {
      "id": "ctx-001",
      "type": "meeting_notes",
      "title": "Sprint planning 2026-02-03",
      "context_item_id": "meeting-notes-001",
      "timestamp": "2026-02-03T09:00:00Z",
      "excerpt": "PM: 'Rate limiting needs to ship before we open the beta. Jane, can you take this?'",
      "location": "p2:para-3"
    },
    {
      "id": "ctx-002",
      "type": "chat_message",
      "title": "Slack thread: #engineering",
      "context_item_id": "slack-thread-001",
      "timestamp": "2026-02-03T09:30:00Z",
      "excerpt": "Jane: 'Got it. Will start after the auth adapter decision.'",
      "location": null
    }
  ]
}
```

### 11.3 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for this trail entry |
| `type` | string | Communication type (see Section 11.4) |
| `context_item_id` | string | References a context item in the tezit bundle |

### 11.4 Communication Types

| Type | Description |
|------|-------------|
| `meeting_notes` | Notes from a meeting (text, audio transcription) |
| `voice_memo` | Voice recording or transcription |
| `chat_message` | Message from a chat platform (Slack, Teams, etc.) |
| `email` | Email message |
| `document_comment` | Comment on a shared document |
| `code_review` | Comment from a code review |
| `ci_output` | CI/CD pipeline output |
| `system_event` | Automated system notification |
| `custom` | Implementation-defined |

### 11.5 Context Completeness

Implementations SHOULD include all communication artifacts that contributed
to the creation of the coordination item. A context trail with a single entry
is valid but reduces the value of interrogation (Section 12).

Implementations MUST NOT fabricate context trail entries. If the originating
communication is unavailable (e.g., a verbal conversation with no recording),
the `context_trail` array MAY be empty, and the item's synthesis document
SHOULD note this.

---

## 12. Interrogation Integration

### 12.1 Overview

Coordination tezits support interrogation as defined by the Tez Interrogation
Protocol (TIP). The grounding boundary for interrogation is the coordination
tezit's context -- the communication artifacts in the context trail plus any
additional context items in the bundle.

Interrogation enables recipients to ask questions like:

- "Why was this task assigned to me?"
- "What was the original conversation that identified this blocker?"
- "What alternatives were considered before this decision was made?"
- "Who raised this question, and in what context?"

### 12.2 Synthesis Document for Coordination Tezits

The synthesis document (`tez.md`) in a coordination tezit MUST summarize the
item using the following structure:

```markdown
# [Item Type]: [Title]

## Summary
[One-paragraph summary of the item]

## Context
[How this item emerged from communication, with citations to context trail]

## Details
[Item-type-specific details: acceptance criteria for tasks, options for
decisions, full question text for questions, impact assessment for blockers]

## Status
[Current status and recent transitions]

## Dependencies
[List of dependencies and their statuses]

---
*Coordination Profile v1.0 | [item_type] | [status] | [priority]*
```

### 12.3 Interrogation Grounding Rules

When interrogating a coordination tezit, implementations MUST adhere to
standard TIP grounding rules (Tezit Protocol v1.2, TIP Section 10) with the
following additional constraints:

1. **Context trail priority**: When answering questions about *why* an item
   exists, the AI MUST prioritize context trail entries over other context
   items.

2. **Status history as context**: The `status_history` array SHOULD be
   available as implicit context for interrogation. Questions like "When did
   this become blocked?" MUST be answerable from the status history.

3. **Decision rationale grounding**: For decision items, questions about
   *why* a particular option was chosen MUST be grounded in the
   `decision.rationale` field and the context trail. The AI MUST NOT
   speculate about motivations beyond what the context provides.

4. **Cross-item interrogation**: When an item references dependencies, the
   implementation MAY load the dependent tezit's synthesis for context. The
   implementation MUST clearly indicate when answers draw from a dependent
   tezit rather than the current one.

### 12.4 Example Interrogation

**User**: "Why was rate limiting assigned to Jane instead of Bob?"

**Grounded response** (acceptable):
> According to the sprint planning notes [[meeting-notes-001:p2:para-3]],
> the PM assigned rate limiting to Jane directly during the meeting. The
> Slack thread [[slack-thread-001]] confirms Jane accepted the assignment.
> The context does not include discussion of alternative assignees or
> why Bob was not considered.

**Ungrounded response** (unacceptable):
> Jane was likely assigned because she has more experience with middleware
> and rate limiting patterns.

---

## 13. Dashboard Aggregation

### 13.1 Overview

Multiple coordination tezits compose into a project dashboard. A dashboard is
not a tezit itself; it is an aggregated view computed from a collection of
coordination tezits that share a common project, phase, or tag.

### 13.2 Dashboard Schema

Implementations SHOULD compute dashboards conforming to the following schema:

```json
{
  "dashboard": {
    "title": "Ragu Platform - Phase 20",
    "generated_at": "2026-02-05T10:00:00Z",
    "scope": {
      "filter_type": "tag",
      "filter_value": "phase-20"
    },
    "summary": {
      "total_items": 24,
      "by_type": {
        "task": 18,
        "decision": 3,
        "question": 2,
        "blocker": 1
      },
      "by_status": {
        "pending": 2,
        "acknowledged": 3,
        "in_progress": 8,
        "blocked": 1,
        "completed": 10,
        "cancelled": 0
      },
      "by_priority": {
        "critical": 1,
        "high": 8,
        "medium": 12,
        "low": 3
      }
    },
    "health": {
      "stale_items": 1,
      "overdue_items": 0,
      "blocked_items": 1,
      "escalations_fired": 2,
      "completion_rate": 0.417,
      "avg_time_to_complete_hours": 6.3
    },
    "workers": [
      {
        "person": { "id": "agent-coder-left", "name": "Claude Code (Left)", "type": "agent" },
        "current_task": "task-rate-limit-001",
        "status": "WORKING",
        "items_completed": 5,
        "items_in_progress": 1
      },
      {
        "person": { "id": "agent-coder-right", "name": "Claude Code (Right)", "type": "agent" },
        "current_task": "task-docs-001",
        "status": "WORKING",
        "items_completed": 3,
        "items_in_progress": 1
      }
    ],
    "recent_activity": [
      {
        "tez_id": "task-e2e-tests-003",
        "title": "Write E2E tests for chat flow",
        "event": "status_change",
        "from": "in_progress",
        "to": "completed",
        "timestamp": "2026-02-05T09:45:00Z",
        "actor": { "id": "agent-coder-left", "name": "Claude Code (Left)" }
      }
    ],
    "blockers": [
      {
        "tez_id": "blocker-cdk-synth-001",
        "title": "CDK synth fails for prod environment",
        "priority": "critical",
        "status": "acknowledged",
        "age_hours": 18.5,
        "affected_count": 2
      }
    ],
    "ci_status": {
      "latest_run": "CI #194",
      "result": "passed",
      "timestamp": "2026-02-05T09:00:00Z",
      "recent_runs": [
        { "id": "CI #197", "result": "failed", "timestamp": "2026-02-05T08:16:00Z" },
        { "id": "CI #196", "result": "failed", "timestamp": "2026-02-05T08:11:00Z" },
        { "id": "CI #195", "result": "failed", "timestamp": "2026-02-05T07:00:00Z" },
        { "id": "CI #194", "result": "passed", "timestamp": "2026-02-05T06:00:00Z" }
      ]
    }
  }
}
```

### 13.3 Dashboard Scope

Dashboards aggregate coordination tezits based on a scope filter:

| Filter Type | Description | Example |
|-------------|-------------|---------|
| `tag` | Items sharing a tag | `"phase-20"` |
| `project` | Items in a project | `"ragu-platform"` |
| `assignee` | Items assigned to a person | `"user-jane-001"` |
| `creator` | Items created by a person | `"user-pm-001"` |
| `priority` | Items at a priority level | `"critical"` |
| `status` | Items in a status | `"blocked"` |
| `custom` | Implementation-defined filter | Arbitrary query |

### 13.4 Health Metrics

Dashboards SHOULD compute the following health metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `stale_items` | integer | Items exceeding their staleness threshold |
| `overdue_items` | integer | Items past their `due_date` |
| `blocked_items` | integer | Items in `blocked` status |
| `escalations_fired` | integer | Escalation rules triggered in the current period |
| `completion_rate` | number | Ratio of `completed` items to total items (0.0 to 1.0) |
| `avg_time_to_complete_hours` | number | Mean hours from `pending` to `completed` |

### 13.5 Worker Status

When coordination involves multiple agents (human or AI), dashboards SHOULD
track per-worker status:

| Field | Type | Description |
|-------|------|-------------|
| `person` | object | The worker (person object) |
| `current_task` | string or null | Tez ID of the worker's current in-progress task |
| `status` | string | One of: `WORKING`, `IDLE`, `BLOCKED` |
| `items_completed` | integer | Count of items completed in the current period |
| `items_in_progress` | integer | Count of items currently in progress |

### 13.6 Refresh Frequency

Dashboards SHOULD be recomputed at the deep refresh cadence interval
(default: 40 minutes). Implementations MAY offer real-time dashboards that
recompute on every status change, but this is not required.

---

## 14. Manifest Extension

### 14.1 Extension Identifier

The Coordination Profile uses the extension identifier `tezit-coordination`.

### 14.2 Registration in Manifest

Coordination tezits MUST register the extension in the manifest's `extensions`
object:

```json
{
  "tezit_version": "1.2",
  "id": "task-rate-limit-001",
  "version": 1,
  "created_at": "2026-02-03T09:00:00Z",
  "creator": {
    "name": "Project Manager",
    "email": "pm@ragu.ai",
    "org": "Ragu Platform"
  },
  "synthesis": {
    "title": "Task: Implement rate limiting for chat-api",
    "type": "coordination",
    "file": "tez.md"
  },
  "context": {
    "scope": "focused",
    "item_count": 3,
    "items": [
      {
        "id": "meeting-notes-001",
        "type": "note",
        "title": "Sprint planning 2026-02-03",
        "file": "context/meeting-notes-001.md"
      },
      {
        "id": "slack-thread-001",
        "type": "message",
        "title": "Slack: #engineering rate-limit discussion",
        "file": "context/slack-thread-001.json"
      },
      {
        "id": "spec-section",
        "type": "document",
        "title": "RAGU_PLATFORM_BUILD.md - Phase 20 excerpt",
        "file": "context/spec-section.md"
      }
    ]
  },
  "extensions": {
    "tezit-coordination": {
      "profile_version": "1.0",
      "item_type": "task",
      "status": "in_progress",
      "priority": "high",
      "assignee": {
        "id": "user-jane-001",
        "name": "Jane Smith",
        "email": "jane@ragu.ai"
      },
      "created_by": {
        "id": "user-pm-001",
        "name": "Project Manager"
      },
      "recipients": [
        { "id": "user-jane-001", "name": "Jane Smith", "role": "assignee" },
        { "id": "user-bob-001", "name": "Bob Chen", "role": "reviewer" },
        { "id": "user-lead-001", "name": "Tech Lead", "role": "escalation_target" }
      ],
      "due_date": "2026-02-10T17:00:00Z",
      "task": {
        "description": "Implement rate limiting for the chat-api service",
        "acceptance_criteria": [
          "Rate limiter enforces 100 req/min per tenant",
          "429 responses include Retry-After header",
          "25+ tests covering normal, burst, and exceeded scenarios"
        ],
        "estimated_effort": "4h",
        "actual_effort": null,
        "deliverables": [],
        "phase": "Phase 20",
        "category": "implementation"
      },
      "dependencies": [
        {
          "tez_id": "decision-auth-adapter-001",
          "type": "informs",
          "title": "Decision: Auth adapter approach",
          "required_status": "completed"
        }
      ],
      "escalation": {
        "rules": [
          {
            "id": "esc-001",
            "trigger": {
              "type": "past_due_date",
              "threshold_hours": 0
            },
            "action": {
              "type": "notify",
              "targets": [
                { "id": "user-lead-001", "name": "Tech Lead", "role": "escalation_target" }
              ],
              "message": "Task is past due"
            },
            "fired": false,
            "fired_at": null
          }
        ],
        "escalation_history": []
      },
      "review_cadence": {
        "quick_check": {
          "interval_minutes": 10,
          "actions": ["observe_status", "check_blockers"],
          "last_checked_at": "2026-02-05T10:00:00Z",
          "next_check_at": "2026-02-05T10:10:00Z"
        },
        "deep_refresh": {
          "interval_minutes": 40,
          "actions": ["refresh_context", "gather_evidence", "update_status", "report"],
          "last_refreshed_at": "2026-02-05T09:40:00Z",
          "next_refresh_at": "2026-02-05T10:20:00Z"
        },
        "staleness_threshold_minutes": 240
      },
      "context_trail": [
        {
          "id": "ctx-001",
          "type": "meeting_notes",
          "title": "Sprint planning 2026-02-03",
          "context_item_id": "meeting-notes-001",
          "timestamp": "2026-02-03T09:00:00Z",
          "excerpt": "PM: 'Rate limiting needs to ship before we open the beta.'",
          "location": "p2:para-3"
        }
      ],
      "status_history": [
        {
          "from": null,
          "to": "pending",
          "timestamp": "2026-02-03T09:00:00Z",
          "actor": { "id": "user-pm-001", "name": "Project Manager" },
          "reason": "Created during sprint planning"
        },
        {
          "from": "pending",
          "to": "acknowledged",
          "timestamp": "2026-02-03T09:15:00Z",
          "actor": { "id": "user-jane-001", "name": "Jane Smith" },
          "reason": null
        },
        {
          "from": "acknowledged",
          "to": "in_progress",
          "timestamp": "2026-02-03T10:00:00Z",
          "actor": { "id": "user-jane-001", "name": "Jane Smith" },
          "reason": "Starting implementation"
        }
      ],
      "tags": ["phase-20", "rate-limiting", "chat-api"],
      "custom_fields": {}
    }
  }
}
```

### 14.3 Synthesis Type

Coordination tezits MUST set `synthesis.type` to `"coordination"` in the
manifest. This enables non-Coordination-Profile-aware implementations to
identify the tezit as coordination-related even without parsing the extension.

### 14.4 Context Items

Coordination tezits use standard Tezit Protocol context items. The
`context_trail` entries in the coordination extension reference these items
by `context_item_id`. Implementations MUST ensure that every
`context_item_id` in the context trail corresponds to a valid entry in
`context.items`.

---

## 15. Security Considerations

### 15.1 Sensitive Communication

Coordination tezits carry communication context that may contain sensitive
information (personnel discussions, strategic decisions, salary data, legal
advice). Implementations MUST support the conversation privacy controls
defined in the Tezit Protocol v1.2 (Section 5.3) and SHOULD extend them to
context trail entries:

- Context trail entries MAY be redacted while preserving the trail structure.
- Redacted entries MUST include `"redacted": true` and SHOULD include a
  `"redaction_reason"` field.
- Implementations MUST NOT include the original content of redacted entries
  in any form (including embeddings or search indices).

### 15.2 Escalation Target Privacy

Escalation targets may not want their identity visible to all recipients.
Implementations SHOULD support visibility controls on the `recipients` array:

```json
{
  "id": "user-director-001",
  "name": "Engineering Director",
  "role": "escalation_target",
  "visibility": "escalation_only"
}
```

When `visibility` is `"escalation_only"`, the recipient MUST NOT appear in
the recipients list rendered to non-escalation roles. Implementations MUST
still include the recipient in the stored data for escalation processing.

### 15.3 Status History Integrity

Status history records MUST be append-only. Implementations MUST NOT allow
deletion or modification of historical status transitions. This ensures an
auditable record of item lifecycle.

### 15.4 Cross-Tezit References

When coordination tezits reference each other through dependencies or
affected_items, implementations MUST enforce access control: a user who can
view item A but not item B MUST NOT see the content of item B through a
dependency reference from item A. The dependency SHOULD appear as a reference
with title only, not with full content.

---

## 16. Implementation Guidance

### 16.1 Minimum Viable Implementation

An implementation targeting Level 1 (Basic Coordination) conformance needs:

1. A manifest generator that produces the `tezit-coordination` extension with
   all required fields.
2. A status transition engine that validates transitions per Section 6.2 and
   records them per Section 6.3.
3. A recipient model supporting the five standard roles.
4. A synthesis generator that produces a tez.md conforming to Section 12.2.

### 16.2 Recommended Implementation Order

For Level 2 (Full Coordination), the RECOMMENDED implementation order is:

1. **Surface schema and item types** (Sections 4-5)
2. **Status state machine** (Section 6)
3. **Recipients and roles** (Section 7)
4. **Context trail** (Section 11) -- high value, enables interrogation
5. **Interrogation integration** (Section 12)
6. **Dependencies** (Section 8)
7. **Dashboard aggregation** (Section 13)
8. **Periodic review cadence** (Section 9)
9. **Escalation patterns** (Section 10)

### 16.3 Storage Considerations

Coordination tezits are typically small (context trail entries plus a short
synthesis) but may be numerous. A single project sprint could produce 50-200
coordination tezits. Implementations SHOULD:

- Use efficient storage for the coordination extension (e.g., a single JSON
  document per item rather than a full tez bundle directory).
- Support batch operations for dashboard aggregation.
- Index the `tags`, `status`, `priority`, `assignee.id`, and `due_date`
  fields for efficient filtering.

### 16.4 AI Agent Compatibility

Coordination tezits are designed to work with AI agents as both producers and
consumers. The Ragu Platform orchestrator, for example, uses AI agents as
coders that create blocker and question items, and an AI orchestrator that
creates task items and processes escalations.

When an AI agent creates or transitions a coordination item, the `actor`
object MUST set `type` to `"agent"`. Implementations SHOULD track whether
transitions were initiated by humans or agents for audit purposes.

### 16.5 Consumer Compatibility Guidance

The Coordination Profile is designed to serve both enterprise orchestration
systems and consumer platforms. This section provides guidance for consumer
platform adoption.

**Design principle:** Every REQUIRED field must be justifiable for a 3-person
team coordinating a weekend project.

#### 16.5.1 Minimum Viable Coordination Tez

The smallest useful coordination tezit is a single task with:

- An **assignee** and a **due date**
- One **voice memo** as context (in the context trail)
- A **three-state status machine**: `pending`, `in_progress`, `completed`

This minimum is fully conformant with Level 1 (Basic Coordination). Consumer
platforms need not implement the full six-state machine for their initial
integration; however, they MUST accept tezits that use the full state set and
SHOULD map unsupported states gracefully (e.g., treating `acknowledged` as
`pending` and `blocked` as `in_progress` for display purposes).

#### 16.5.2 Level 1 (Basic) for Consumer Platforms

Level 1 (Basic Coordination) conformance is explicitly designed for consumer
platforms such as personal assistant apps (e.g., MyPA.chat), family
coordination tools, and small-team project trackers. These platforms benefit
from the coordination tezit's core value proposition -- actionable items
with communication context attached -- without requiring enterprise
infrastructure.

A Level 1 consumer implementation needs:

1. A manifest generator for the `tezit-coordination` extension.
2. A status transition engine (the three-state subset is sufficient for UX;
   the full six-state set MUST be accepted on ingest).
3. Support for the `assignee` and `informed` roles (the minimum useful
   subset of the five standard roles).
4. A synthesis document linking the item to its originating voice memo or
   message.

#### 16.5.3 What Consumer Platforms Can Safely Ignore

The following features are either non-normative or restricted to Level 2
(Full Coordination) conformance. Consumer platforms MAY omit them without
affecting interoperability:

- **Dashboard aggregation** (Section 13): Non-normative. Dashboards are
  computed views, not part of the tezit format. Consumer platforms may
  present coordination items however suits their UX.
- **Dependency modeling with cycle detection** (Section 8): Level 2 only.
  Consumer platforms MAY store dependency references for display but are
  not required to implement cycle detection or automatic unblocking.
- **Escalation patterns** (Section 10): Level 2 only. Consumer platforms
  are not expected to implement tiered escalation rules or automatic
  priority elevation.
- **Periodic review cadence** (Section 9): Level 2 only. Consumer platforms
  may use their own notification and reminder mechanisms.

#### 16.5.4 Voice-First Workflows

A coordination tezit created from a voice memo is a first-class citizen of
this specification. The minimum schema accommodates voice-first workflows
without requiring enterprise infrastructure:

1. A user records a voice memo describing a task.
2. An AI assistant transcribes the memo and extracts the coordination item
   (item type, assignee, due date).
3. The voice memo becomes a context trail entry (`type: "voice_memo"`).
4. The synthesis document summarizes the task with a citation to the voice
   memo.
5. The recipient can interrogate the tezit to hear or read the original
   request.

This workflow produces a fully conformant coordination tezit using only
Level 1 features. The voice memo is both the originating communication and
the primary context -- no meeting notes, chat threads, or CI systems
required.

---

## 17. Examples

### 17.1 Sprint Planning Meeting Produces Tasks

A project manager records a sprint planning meeting. The recording is
transcribed and analyzed by an AI assistant, which identifies 8 tasks,
2 decisions, and 1 question. Each becomes a coordination tezit with the
meeting transcription as context.

**Meeting context item** (shared across all 11 tezits):
```json
{
  "id": "sprint-planning-recording",
  "type": "audio",
  "title": "Sprint Planning 2026-02-03 Recording",
  "file": "context/sprint-planning-recording.m4a",
  "mime_type": "audio/mp4",
  "metadata": {
    "duration_seconds": 2700,
    "transcription_file": "context/sprint-planning-transcript.md"
  }
}
```

**Task tezit synthesis** (one of 8):
```markdown
# Task: Implement rate limiting for chat-api

## Summary
Rate limiting for the chat-api service was identified as a pre-beta
requirement during the February 3rd sprint planning meeting
[[sprint-planning-transcript:t0:12:30]].

## Context
The PM stated that rate limiting must ship before the beta opens to
prevent abuse from untrusted external users
[[sprint-planning-transcript:t0:12:30]]. Jane volunteered to take
the task, estimating 4 hours [[sprint-planning-transcript:t0:13:15]].

## Details
### Acceptance Criteria
- Rate limiter enforces 100 req/min per tenant
- 429 responses include Retry-After header
- 25+ tests covering normal, burst, and exceeded scenarios

### Estimated Effort
4 hours

## Status
In Progress (since 2026-02-03T10:00:00Z)

---
*Coordination Profile v1.0 | task | in_progress | high*
```

### 17.2 Blocker Escalation Chain

A blocker is created when a CDK deployment fails. After 24 hours unresolved,
the escalation chain fires.

**Initial state** (hour 0):
```json
{
  "item_type": "blocker",
  "status": "pending",
  "priority": "high",
  "escalation": {
    "rules": [
      {
        "id": "esc-001",
        "trigger": { "type": "duration_in_status", "status": "pending", "threshold_hours": 2 },
        "action": { "type": "notify", "targets": [{"id": "user-lead-001", "name": "Tech Lead"}], "message": "Blocker unacknowledged for 2+ hours" },
        "fired": false
      },
      {
        "id": "esc-002",
        "trigger": { "type": "duration_in_status", "status": "acknowledged", "threshold_hours": 8 },
        "action": { "type": "escalate_priority", "new_priority": "critical" },
        "fired": false
      },
      {
        "id": "esc-003",
        "trigger": { "type": "duration_in_status", "status": "acknowledged", "threshold_hours": 24 },
        "action": {
          "type": "composite",
          "actions": [
            { "type": "notify", "targets": [{"id": "user-director-001", "name": "Director"}], "message": "Blocker unresolved for 24+ hours" },
            { "type": "reassign", "new_assignee": {"id": "user-senior-001", "name": "Senior Engineer"} }
          ]
        },
        "fired": false
      }
    ]
  }
}
```

**After 2 hours** (esc-001 fires): Tech lead notified.
**After 8 hours** (esc-002 fires): Priority escalated to critical.
**After 24 hours** (esc-003 fires): Director notified and item reassigned.

### 17.3 Decision with Full Interrogation

A decision tezit about whether to use PostgreSQL or MongoDB for a new service.
The context includes benchmark results, team expertise survey, and a Slack
discussion thread.

**Interrogation example**:

**User**: "Why was PostgreSQL chosen over MongoDB?"

**Response** (grounded in context):
> The decision rationale [[decision-rationale:p1]] cites three factors:
>
> 1. **Benchmark results**: PostgreSQL outperformed MongoDB for the read-heavy
>    query pattern identified in the requirements [[benchmarks:table-3]],
>    achieving 2.3x throughput for joins across the tenant and document tables.
>
> 2. **Team expertise**: The team survey [[team-survey:results]] showed 4 of
>    5 engineers rated PostgreSQL proficiency as "strong" versus 1 of 5 for
>    MongoDB.
>
> 3. **Existing infrastructure**: The Slack discussion [[slack-db-thread:msg-12]]
>    noted that the platform already runs Aurora PostgreSQL Serverless v2,
>    avoiding the operational overhead of introducing a new database engine.
>
> The context does not include cost comparison data between the two options.

---

## Appendix A: Full JSON Schema

The complete JSON Schema for the `tezit-coordination` extension is provided
below for validation purposes.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tezit.com/spec/v1/extensions/coordination.schema.json",
  "title": "Tezit Coordination Profile Extension",
  "description": "Schema for the tezit-coordination manifest extension",
  "type": "object",
  "required": ["profile_version", "item_type", "status", "priority", "created_by"],
  "properties": {
    "profile_version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+$",
      "description": "Version of the Coordination Profile specification"
    },
    "item_type": {
      "type": "string",
      "enum": ["task", "decision", "question", "blocker"]
    },
    "status": {
      "type": "string",
      "enum": ["pending", "acknowledged", "in_progress", "blocked", "completed", "cancelled"]
    },
    "priority": {
      "type": "string",
      "enum": ["critical", "high", "medium", "low"]
    },
    "assignee": { "$ref": "#/$defs/person" },
    "created_by": { "$ref": "#/$defs/person" },
    "recipients": {
      "type": "array",
      "items": { "$ref": "#/$defs/recipient" }
    },
    "due_date": {
      "type": "string",
      "format": "date-time"
    },
    "task": { "$ref": "#/$defs/task_fields" },
    "decision": { "$ref": "#/$defs/decision_fields" },
    "question": { "$ref": "#/$defs/question_fields" },
    "blocker": { "$ref": "#/$defs/blocker_fields" },
    "dependencies": {
      "type": "array",
      "items": { "$ref": "#/$defs/dependency" }
    },
    "escalation": { "$ref": "#/$defs/escalation" },
    "review_cadence": { "$ref": "#/$defs/review_cadence" },
    "context_trail": {
      "type": "array",
      "items": { "$ref": "#/$defs/context_trail_entry" }
    },
    "status_history": {
      "type": "array",
      "items": { "$ref": "#/$defs/status_transition" }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "custom_fields": {
      "type": "object",
      "additionalProperties": true
    }
  },
  "$defs": {
    "person": {
      "type": "object",
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "type": { "type": "string", "enum": ["human", "agent", "group"], "default": "human" }
      }
    },
    "recipient": {
      "type": "object",
      "required": ["id", "name", "role"],
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "type": { "type": "string", "enum": ["human", "agent", "group"], "default": "human" },
        "role": { "type": "string", "enum": ["assignee", "reviewer", "informed", "escalation_target", "approver"] },
        "visibility": { "type": "string", "enum": ["full", "escalation_only"], "default": "full" }
      }
    },
    "task_fields": {
      "type": "object",
      "required": ["description"],
      "properties": {
        "description": { "type": "string" },
        "acceptance_criteria": { "type": "array", "items": { "type": "string" } },
        "estimated_effort": { "type": "string" },
        "actual_effort": { "type": ["string", "null"] },
        "deliverables": { "type": "array", "items": { "type": "string" } },
        "phase": { "type": "string" },
        "category": {
          "type": "string",
          "enum": ["implementation", "testing", "review", "documentation", "infrastructure", "investigation", "custom"]
        }
      }
    },
    "decision_fields": {
      "type": "object",
      "required": ["question"],
      "properties": {
        "question": { "type": "string" },
        "chosen_option": { "type": ["string", "null"] },
        "options_considered": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label"],
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "description": { "type": "string" },
              "pros": { "type": "array", "items": { "type": "string" } },
              "cons": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "rationale": { "type": "string" },
        "decided_by": { "$ref": "#/$defs/person" },
        "decided_at": { "type": "string", "format": "date-time" },
        "reversible": { "type": "boolean" },
        "reversal_conditions": { "type": "string" }
      }
    },
    "question_fields": {
      "type": "object",
      "required": ["text"],
      "properties": {
        "text": { "type": "string" },
        "context_summary": { "type": "string" },
        "directed_to": { "type": "array", "items": { "$ref": "#/$defs/person" } },
        "options": { "type": "array", "items": { "type": "string" } },
        "answer": { "type": ["string", "null"] },
        "answered_by": {
          "oneOf": [{ "$ref": "#/$defs/person" }, { "type": "null" }]
        },
        "answered_at": { "type": ["string", "null"], "format": "date-time" }
      }
    },
    "blocker_fields": {
      "type": "object",
      "required": ["description", "impact"],
      "properties": {
        "description": { "type": "string" },
        "impact": { "type": "string" },
        "affected_items": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["tez_id"],
            "properties": {
              "tez_id": { "type": "string" },
              "title": { "type": "string" }
            }
          }
        },
        "root_cause": { "type": "string" },
        "attempted_resolutions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["description", "result"],
            "properties": {
              "description": { "type": "string" },
              "result": { "type": "string" },
              "timestamp": { "type": "string", "format": "date-time" }
            }
          }
        },
        "resolution": { "type": ["string", "null"] },
        "resolved_by": {
          "oneOf": [{ "$ref": "#/$defs/person" }, { "type": "null" }]
        },
        "resolved_at": { "type": ["string", "null"], "format": "date-time" }
      }
    },
    "dependency": {
      "type": "object",
      "required": ["tez_id", "type"],
      "properties": {
        "tez_id": { "type": "string" },
        "type": { "type": "string", "enum": ["blocks", "informs", "follows", "related"] },
        "title": { "type": "string" },
        "required_status": { "type": "string", "default": "completed" },
        "description": { "type": "string" }
      }
    },
    "escalation": {
      "type": "object",
      "properties": {
        "rules": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "trigger", "action"],
            "properties": {
              "id": { "type": "string" },
              "trigger": {
                "type": "object",
                "required": ["type"],
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": ["duration_in_status", "past_due_date", "dependency_stale", "review_missed", "manual"]
                  },
                  "status": { "type": "string" },
                  "threshold_hours": { "type": "number" },
                  "dependency_tez_id": { "type": "string" },
                  "missed_count": { "type": "integer" }
                }
              },
              "action": {
                "type": "object",
                "required": ["type"],
                "properties": {
                  "type": {
                    "type": "string",
                    "enum": ["notify", "escalate_priority", "reassign", "create_blocker", "composite"]
                  },
                  "targets": { "type": "array", "items": { "$ref": "#/$defs/recipient" } },
                  "message": { "type": "string" },
                  "new_priority": { "type": "string" },
                  "new_assignee": { "$ref": "#/$defs/person" },
                  "blocker_description": { "type": "string" },
                  "blocker_impact": { "type": "string" },
                  "actions": { "type": "array" }
                }
              },
              "fired": { "type": "boolean", "default": false },
              "fired_at": { "type": ["string", "null"], "format": "date-time" }
            }
          }
        },
        "escalation_history": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["rule_id", "fired_at", "action_taken"],
            "properties": {
              "rule_id": { "type": "string" },
              "fired_at": { "type": "string", "format": "date-time" },
              "trigger_snapshot": { "type": "object" },
              "action_taken": { "type": "string" },
              "targets_notified": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    },
    "review_cadence": {
      "type": "object",
      "properties": {
        "quick_check": {
          "type": "object",
          "properties": {
            "interval_minutes": { "type": "integer", "minimum": 1 },
            "actions": { "type": "array", "items": { "type": "string" } },
            "last_checked_at": { "type": "string", "format": "date-time" },
            "next_check_at": { "type": "string", "format": "date-time" }
          }
        },
        "deep_refresh": {
          "type": "object",
          "properties": {
            "interval_minutes": { "type": "integer", "minimum": 1 },
            "actions": { "type": "array", "items": { "type": "string" } },
            "last_refreshed_at": { "type": "string", "format": "date-time" },
            "next_refresh_at": { "type": "string", "format": "date-time" }
          }
        },
        "staleness_threshold_minutes": { "type": "integer", "minimum": 1 }
      }
    },
    "context_trail_entry": {
      "type": "object",
      "required": ["id", "type", "context_item_id"],
      "properties": {
        "id": { "type": "string" },
        "type": {
          "type": "string",
          "enum": ["meeting_notes", "voice_memo", "chat_message", "email", "document_comment", "code_review", "ci_output", "system_event", "custom"]
        },
        "title": { "type": "string" },
        "context_item_id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" },
        "excerpt": { "type": "string" },
        "location": { "type": ["string", "null"] },
        "redacted": { "type": "boolean", "default": false },
        "redaction_reason": { "type": "string" }
      }
    },
    "status_transition": {
      "type": "object",
      "required": ["from", "to", "timestamp", "actor"],
      "properties": {
        "from": { "type": ["string", "null"] },
        "to": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" },
        "actor": { "$ref": "#/$defs/person" },
        "reason": { "type": ["string", "null"] }
      }
    }
  }
}
```

---

## Appendix B: Ragu Platform Production Patterns

The following table maps Ragu Platform orchestrator concepts to Coordination
Profile specification sections. These patterns were developed during a
19-week build cycle managing 29 packages, 2,500+ tests, and 21 build phases
with AI agent coders.

| Ragu Pattern | Source File | Spec Section | Notes |
|-------------|------------|-------------|-------|
| Quick status dashboard | `.orchestrator/CURRENT_STATE.md` | Section 13 (Dashboard) | CI status, test counts, phase tracking, worker status |
| Phase tracking table | `.orchestrator/CURRENT_STATE.md` | Section 4 (tags), Section 13.3 (scope) | Phases map to dashboard scope filters |
| Per-worker status | `.orchestrator/CURRENT_STATE.md` | Section 13.5 (Worker Status) | WORKING/IDLE/BLOCKED states |
| CI run history | `.orchestrator/CURRENT_STATE.md` | Section 13.2 (ci_status) | Recent pass/fail tracking |
| 10-minute pings | `.cowork/ping-instructions.md` | Section 9.3 (Quick Check) | Observe -> Think -> Act |
| 40-minute refreshes | `.cowork/refresh-instructions.md` | Section 9.4 (Deep Refresh) | Refresh context -> Gather evidence -> Assess -> Update -> Report |
| Decision framework | `.orchestrator/ORCHESTRATOR_PROMPTS.md` | Section 5.2 (Decision) | "Delete file? Commit? Push? Install?" |
| Task templates | `.orchestrator/ORCHESTRATOR_PROMPTS.md` | Section 5.1 (Task) | Context-rich instructions with acceptance criteria |
| Separate concerns | `.orchestrator/ORCHESTRATOR_PROMPTS.md` | Section 7 (Roles) | One builds, one reviews/tests |
| Issue tracking | `.orchestrator/FRONTEND_ISSUES.md` | Section 5.4 (Blocker) | Priority levels, file:line references, fix options |
| Blocker tracking | `.orchestrator/CURRENT_STATE.md` | Section 5.4, Section 10 | Technical debt and blocker sections |
| Phase context guide | `.orchestrator/PHASE_CONTEXT_GUIDE.md` | Section 11 (Context Trail) | Mapping items to reference documentation |

### Key Design Decisions from Production

1. **Quick checks are observational, deep refreshes are interventional.**
   In production, we found that frequent lightweight checks (10 minutes)
   catch problems early, while less frequent deep assessments (40 minutes)
   provide the context needed to make good decisions. The spec reflects
   this by making quick check actions advisory and deep refresh actions
   capable of triggering status transitions.

2. **AI agents as first-class participants.** The Ragu orchestrator manages
   AI coder agents that create blockers, ask questions, and report progress.
   The spec's `type: "agent"` field on person objects is essential for
   tracking whether a human or AI performed an action.

3. **Communication context is the differentiator.** Without the context
   trail, a coordination tezit is just a task tracker. The Ragu orchestrator's
   `.orchestrator/` files are valuable precisely because they capture *why*
   decisions were made, not just *what* was decided. The context trail
   (Section 11) and interrogation integration (Section 12) formalize this.

4. **Dashboards are computed, not stored.** The Ragu `CURRENT_STATE.md` is
   regenerated every 40 minutes from live data. The spec's dashboard
   (Section 13) follows this pattern -- dashboards are views over
   coordination tezits, not separate artifacts.

---

## Appendix C: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.1-draft | 2026-02 | Elevated `in_progress` restriction for decision and question items from SHOULD NOT to MUST NOT (normative). Added Section 16.5 Consumer Compatibility Guidance defining minimum viable coordination tez and design principles for consumer platform adoption. Level 1 (Basic) conformance explicitly targets consumer platforms. |
| 1.0-draft | 2026-02-05 | Initial proposal based on Ragu Platform production patterns |

---

*This specification is a contribution from the Ragu Platform Team to the
Tezit Protocol. It is licensed under CC BY 4.0.*

*Ragu Platform -- Enterprise AI Orchestration*
*[github.com/tezit-protocol/spec](https://github.com/tezit-protocol/spec)*
