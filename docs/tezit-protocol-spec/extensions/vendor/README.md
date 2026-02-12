# Vendor Extensions

Vendor extensions use reverse-domain naming to avoid conflicts with standard extensions and other vendors. Any organization implementing the Tezit Protocol can register a vendor namespace by opening a PR to this directory.

Vendor extensions are maintained by their respective organizations. This registry provides discoverability and prevents namespace collisions.

## Registered Namespaces

### `com.ragu.*` -- Ragu Platform

**Organization:** Ragu Platform
**Type:** Enterprise AI orchestration
**Website:** [ragu.ai](https://ragu.ai)

Ragu is an enterprise AI orchestration platform with 11 microservices, an agentic RAG pipeline, fine-grained authorization via OpenFGA, and multi-model support. Ragu's vendor extensions address enterprise-specific needs around access control, evaluation, retrieval transparency, and multi-tenancy.

| Extension | Description | Status |
|-----------|-------------|--------|
| `com.ragu.fga-access` | Fine-grained access control within tezits. Integrates with OpenFGA to enforce per-context-item and per-section authorization, enabling tezits where different recipients see different subsets of content. Formalized in TIP Enterprise Addendum Section 3. | Active |
| `com.ragu.eval-metrics` | Interrogation quality metrics. Captures groundedness, relevance, and faithfulness scores for interrogation sessions. Being proposed for standardization as `tezit-eval`. Full specification in TIP Enterprise Addendum Section 8. Reference implementation delivered. Registry submission pending. | Active (standardizing) |
| `com.ragu.retrieval-transparency` | Retrieval method and scoring data. Records which retrieval strategy was used (semantic search, keyword, hybrid, agentic), the similarity scores, and the ranking methodology -- making the RAG pipeline auditable. Formalized in TIP Enterprise Addendum Section 4. Reference implementation delivered in `extensions.py`. Registry submission pending. | Active (implemented) |
| `com.ragu.multi-tenant` | Tenant isolation metadata. Embeds tenant identifiers and isolation boundaries within tezits, ensuring that multi-tenant platforms can share tezits across organizational boundaries without leaking data between tenants. Formalized in TIP Enterprise Addendum Section 6. | Active |
| `com.ragu.streaming-interrogation` | Production SSE streaming protocol for real-time interrogation. Formalized in TIP Enterprise Addendum Section 2. | Active (standardizing) |
| `com.ragu.code-review` | Code review workflow profile with structured findings, severity levels, and fork semantics. Formalized as Code Review Profile v0.2.0 (Proposed). | Active (standardizing) |

Ragu has delivered a 44-test conformance suite and production-grade reference implementations for the tez:// URI scheme, standard extensions, TIP session management, and bundle validation.

---

### `chat.mypa.*` -- MyPA.chat

**Organization:** MyPA.chat
**Type:** Team coordination platform
**Website:** [mypa.chat](https://mypa.chat)

MyPA.chat is a personal AI assistant and team coordination platform. As the first implementer of the Tezit Protocol, MyPA.chat focuses on consumer-facing Tez creation, interrogation, and team-based knowledge sharing.

| Extension | Description | Status |
|-----------|-------------|--------|
| *(No extensions registered yet)* | MyPA.chat currently uses standard extensions only. Vendor extensions will be registered here as the platform develops team-specific capabilities. | -- |

---

## Registering a Namespace

To register a vendor namespace:

1. Open a PR adding your organization to this file
2. Use reverse-domain naming (e.g., `com.yourcompany.*`, `io.yourservice.*`)
3. Include: organization name, type, website, and initial extension list (if any)
4. One approval from a maintainer is sufficient for namespace registration

Namespace registration does not require a full extension proposal. It simply reserves the prefix to prevent conflicts.
