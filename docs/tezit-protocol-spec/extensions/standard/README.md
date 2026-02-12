# Standard Extensions

Standard extensions are officially part of the Tezit Protocol. They use the `tezit-*` prefix and have been through the full proposal and review process. Their schemas are stable; breaking changes require a new major version.

Implementations MAY support any combination of standard extensions. Unsupported extensions MUST be ignored gracefully.

## Registry

| Extension | Description | Status |
|-----------|-------------|--------|
| [`tezit-facts`](#tezit-facts) | Structured facts extraction with provenance | Standard |
| [`tezit-relationships`](#tezit-relationships) | Entity relationship mapping | Standard |
| [`tezit-analytics`](#tezit-analytics) | Usage analytics and interrogation tracking | Standard |
| [`tezit-signing`](#tezit-signing) | Cryptographic signatures for bundle integrity | Standard |
| [`tezit-encryption`](#tezit-encryption) | End-to-end encryption for sensitive tezits | Standard |
| [`tezit-eval`](#tezit-eval) | Interrogation quality metrics | Proposed |
| [`tezit-coordination`](#tezit-coordination) | Coordination items: tasks, decisions, questions, blockers with state machines | Proposed |

---

### `tezit-facts`

**Status:** Standard
**Since:** v1.1

Enables structured extraction of claims from context with provenance tracking. Each fact records the assertion, a confidence score, the source type (stated, inferred, verified, assumed), and citations back to specific context items.

Use cases include due diligence documents where claims must be traceable, research synthesis requiring confidence levels, and automated fact-checking pipelines.

**Schema:** See [Appendix C.1](https://github.com/tezit-protocol/spec/blob/main/TEZIT_PROTOCOL_SPEC.md#c1-facts-extension-tezit-facts) of the protocol spec.

**Note:** Reference implementation available from Ragu Platform (Python, `extensions.py`).

---

### `tezit-relationships`

**Status:** Standard
**Since:** v1.1

Maps connections between a Tez and external entities -- people, organizations, projects, events. Each relationship records the entity, its type, the nature of the relationship, and a strength score indicating relevance.

Useful for organizational knowledge graphs, stakeholder mapping, and understanding how tezits relate to the broader context of an organization or project.

**Schema:** See [Appendix C.2](https://github.com/tezit-protocol/spec/blob/main/TEZIT_PROTOCOL_SPEC.md#c2-relationships-extension-tezit-relationships) of the protocol spec.

**Note:** Reference implementation available from Ragu Platform (Python, `extensions.py`).

---

### `tezit-analytics`

**Status:** Standard
**Since:** v1.0

Tracks usage analytics for a Tez: how many times it has been interrogated, by whom, which context items were referenced most frequently, and aggregate interrogation patterns over time. Analytics data is always scoped to what the Tez owner has permitted.

Enables creators to understand how their tezits are being used, which parts of the context are most valuable, and whether the synthesis is effectively answering recipient questions.

---

### `tezit-signing`

**Status:** Standard
**Since:** v1.0

Provides cryptographic signatures for Tez bundle integrity. A signed Tez includes a detached signature over the manifest and all referenced files, allowing recipients to verify that the bundle has not been tampered with after creation.

Supports standard signing algorithms (Ed25519, RSA-PSS). Key distribution and trust are outside the scope of this extension -- implementations integrate with their own PKI or use well-known keyservers.

---

### `tezit-encryption`

**Status:** Standard
**Since:** v1.0

Enables end-to-end encryption for sensitive tezits. When applied, context files and synthesis are encrypted at rest within the bundle. Only authorized recipients with the correct decryption key can access the content.

Supports hybrid encryption (X25519 key agreement + AES-256-GCM symmetric encryption). The manifest remains unencrypted so that implementations can identify the Tez and determine whether the recipient has access before attempting decryption.

---

### `tezit-eval`

**Status:** Proposed
**Proposed by:** Ragu Platform

Defines metrics for evaluating interrogation quality against a Tez. Captures scores such as groundedness (are answers supported by context?), relevance (did the response address the question?), and faithfulness (does the answer avoid hallucinating beyond the source material?).

Originally developed as `com.ragu.eval-metrics`, this extension was proposed for standardization because interrogation quality measurement is broadly useful across all Tezit implementations. Full specification is now in the TIP Enterprise Addendum Section 8, with 5 defined metrics: relevance, faithfulness, citation_accuracy, completeness, and abstention_rate.

**Proposal:** See [`extensions/proposed/tezit-eval/`](../proposed/tezit-eval/) (forthcoming).

**Note:** Reference implementation available from Ragu Platform. JSON Schema: `schemas/enterprise-tip-eval.schema.json`.

---

### `tezit-coordination`

**Status:** Proposed
**Proposed by:** Ragu Platform

Full coordination profile for team coordination items -- tasks, decisions, questions, and blockers. Includes status state machine with enforced transitions, role-based recipient model, dependency modeling with cycle detection, periodic review cadence, escalation patterns, context trails linking items to originating communication, and dashboard aggregation. Derived from production patterns in the Ragu Platform orchestrator.

**Specification:** See `TEZ_COORDINATION_PROFILE.md` companion document.
