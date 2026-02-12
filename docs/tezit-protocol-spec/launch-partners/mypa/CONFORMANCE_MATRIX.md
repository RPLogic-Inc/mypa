# Tezit Protocol Conformance Matrix - MyPA

**Implementation:** MyPA (https://app.mypa.chat)
**Protocol Version:** v1.2.4
**TIP Version:** v1.0.3
**Last Updated:** February 8, 2026

---

## Tezit Protocol v1.2.4 Conformance

| Feature | Status | Implementation Notes |
|---------|--------|---------------------|
| **Core Protocol** | | |
| Portable Tez bundles (.tez.json) | ✅ Full | Export: `GET /api/tez/:id/export`, Import: `POST /api/tez/import` |
| manifest.json structure | ✅ Full | Generated on export with protocol_version, id, created_at |
| tez.md markdown format | ✅ Full | Surface summary + full context iceberg |
| context/ directory structure | ✅ Full | Voice, text, assistant context preserved |
| tez:// URI scheme | ✅ Full | Format: `tez://mypa.chat/card/{uuid}` |
| **Context Preservation** | | |
| Voice context | ✅ Full | WebM audio + Whisper transcription + duration |
| Text context | ✅ Full | Raw text + display bullets + metadata |
| Assistant context | ✅ Full | Query + full response + tools used + sources + execution time |
| Context attribution | ✅ Full | user_id, user_name, captured_at on all entries |
| **Forking** | | |
| Fork creation | ✅ Full | 4 fork types: counter, extension, reframe, update |
| Fork lineage tracking | ✅ Full | `forkedFromId` + `forkType` in cards table |
| Fork discovery | ✅ Full | Query forks via `GET /api/cards/:id/forks` |
| **Transmission** | | |
| HTTP transport | ✅ Full | REST API for import/export |
| Email transport | ✅ Partial | Implemented but not yet in spec (see PROTOCOL_PROPOSALS.md) |
| Deep linking | ✅ Full | `tez://` URIs resolve to app.mypa.chat/tez/:id |
| **Protocol Profiles** | | |
| Knowledge profile | ✅ Full | TIP interrogation, citations, Library of Context |
| Messaging profile | ✅ Full | Responses, reactions, threading |
| Coordination profile | ✅ Full | Status tracking, snooze, due dates, recipients |

---

## TIP (Tez Interrogation Protocol) v1.0.3 Conformance

| Feature | Status | Implementation Notes |
|---------|--------|---------------------|
| **Core Interrogation** | | |
| Context-only responses | ✅ Full | OpenAI API with strict context windowing |
| Citation verification | ✅ Full | Every response includes verified citations with excerpts |
| Confidence scoring | ✅ Full | High/medium/low based on context quality |
| **Query Processing** | | |
| Natural language queries | ✅ Full | Free-form questions processed via LLM |
| Context disambiguation | ✅ Full | AI identifies which context entries are relevant |
| Multi-context synthesis | ✅ Full | Answers synthesized from multiple context items |
| **Citation Format** | | |
| contextItemId | ✅ Full | UUID linking to card_context entry |
| relevantExcerpt | ✅ Full | Exact text from context (max 500 chars) |
| verificationDetails | ✅ Full | Human-readable explanation of relevance |
| confidence | ✅ Full | Enum: "high" \| "medium" \| "low" |
| **Security** | | |
| Prompt injection defense | ✅ Enhanced | Multi-layer defense (see PRODUCTION_LEARNINGS.md) |
| Context isolation | ✅ Full | Each tez has isolated context scope |
| Citation authenticity | ✅ Full | Citations trace to immutable context entries |
| Rate limiting | ✅ Full | Per-user + per-tez limits |
| **Response Format** | | |
| answer field | ✅ Full | Natural language answer |
| citations array | ✅ Full | Array of TipCitation objects |
| confidence field | ✅ Full | Overall confidence in answer |
| interrogationId | ✅ Full | UUID for audit trail |

---

## Protocol Extensions (MyPA-Specific)

These features extend the Tezit Protocol beyond v1.2.4 and are candidates for future spec inclusion:

| Extension | Status | Proposal Doc |
|-----------|--------|--------------|
| **Discovery Protocol** | | |
| FTS5 full-text search | ✅ Implemented | PROTOCOL_PROPOSALS.md #1 |
| Engagement scoring | ✅ Implemented | PROTOCOL_PROPOSALS.md #2 |
| Browse mode (trending + recent) | ✅ Implemented | PROTOCOL_PROPOSALS.md #3 |
| **Email Transport** | | |
| X-Tezit-Protocol header | ✅ Implemented | PROTOCOL_PROPOSALS.md #4 |
| X-Tezit-ID header | ✅ Implemented | PROTOCOL_PROPOSALS.md #4 |
| .tez.json email attachments | ✅ Implemented | PROTOCOL_PROPOSALS.md #4 |
| **Fork Semantics** | | |
| Fork type taxonomy | ✅ Implemented | PROTOCOL_PROPOSALS.md #5 |
| Semantic relationship metadata | ✅ Implemented | PROTOCOL_PROPOSALS.md #5 |
| **Engagement Metadata** | | |
| Interrogation count portability | ⏳ Proposed | PROTOCOL_PROPOSALS.md #6 |
| Citation count portability | ⏳ Proposed | PROTOCOL_PROPOSALS.md #6 |
| **Mirror Protocol** | | |
| Mirror vs canonical distinction | ✅ Implemented | PROTOCOL_PROPOSALS.md #7 |
| Deep link requirement in mirrors | ✅ Implemented | PROTOCOL_PROPOSALS.md #7 |

---

## Profiles Supported

MyPA implements all three Tezit Protocol profiles:

### Knowledge Profile
- ✅ TIP interrogation with verified citations
- ✅ Library of Context (100K+ entries)
- ✅ FTS5 full-text search
- ✅ Engagement-based discovery
- ✅ Fork lineage tracking

### Messaging Profile
- ✅ Response threading
- ✅ Emoji reactions
- ✅ User attribution
- ✅ Read receipts
- ✅ Push notifications (ntfy.sh)

### Coordination Profile
- ✅ Status tracking (pending/active/resolved)
- ✅ Due dates
- ✅ Snooze functionality
- ✅ Recipient targeting (self/dm/broadcast)
- ✅ Team scoping

---

## Interoperability Testing

**Test user available for protocol interoperability validation:**

```
URL: https://app.mypa.chat
Email: test@test.com
Password: testtest1
```

**Interoperability capabilities:**
- Import .tez.json bundles via `POST /api/tez/import`
- Export tezits via `GET /api/tez/:id/export`
- Interrogate imported tezits via TIP
- Fork imported tezits
- Mirror tezits to external systems

**Known limitations:**
- Email transport requires MyPA PA Workspace setup (not enabled for test user)
- Cross-organization interrogation not yet implemented (federated TIP)

---

## Non-Conformance & Deviations

### Minor Deviations

1. **Context storage format**
   - **Spec:** Recommends file-based context/ directory
   - **MyPA:** SQLite database with card_context table
   - **Rationale:** Better performance at scale, easier indexing for FTS5
   - **Interoperability:** Export conforms to spec (generates proper context/ structure)

2. **Fork type taxonomy**
   - **Spec:** Mentions forking but doesn't specify types
   - **MyPA:** Four types: counter, extension, reframe, update
   - **Rationale:** Necessary for TIP to handle forks correctly
   - **Interoperability:** Fork type stored in metadata, doesn't break spec compliance

### Future Work

1. **Cross-system interrogation** - Not yet implemented (requires federated TIP)
2. **Version migration** - No automated migration from older protocol versions
3. **Distributed citations** - Citations currently local-only (no external tez citations)

---

## Compliance Verification

**Test suite:** 544 automated tests, 21 test files

**Protocol-specific tests:**
- ✅ Import/export round-trip (tez exported = tez imported)
- ✅ TIP response format validation
- ✅ Citation verification
- ✅ Context preservation across export/import
- ✅ Fork lineage integrity
- ✅ tez:// URI resolution

**Production validation:**
- ✅ 6+ months uptime
- ✅ 100K+ context entries
- ✅ 1000+ TIP interrogations
- ✅ Zero data loss incidents
- ✅ Sub-10ms query latency

---

## Contact & Collaboration

**Implementation repository:** https://github.com/ragurob/MyPA.chat

**Available for:**
- Interoperability testing with other implementers
- Protocol enhancement discussions
- Reference implementation reviews
- Production metrics sharing

**Maintainer:** Available via GitHub issues or protocol working group

---

**Document version:** 1.0
**Last updated:** February 8, 2026
**License:** CC-BY-4.0 (free to use with attribution)
