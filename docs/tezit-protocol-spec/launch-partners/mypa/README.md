# MyPA.chat — Tezit Protocol Launch Partner

**Implementation:** MyPA.chat (https://app.mypa.chat)
**Status:** Production (6+ months)
**Protocol Version:** v1.2.4
**TIP Version:** v1.0.3
**Profiles:** knowledge, messaging, coordination
**Source:** [github.com/ragurob/MyPA.chat](https://github.com/ragurob/MyPA.chat) (monorepo)

---

## Overview

MyPA.chat is a production Tezit Protocol implementation with 6+ months of real-world deployment, 800+ automated tests across 4 services, and 100K+ context entries in production.

**Architecture:** Four services in a monorepo, powered by OpenClaw (AI runtime):
- **backend/** — API server: Tez CRUD, Library (FTS5), TIP interrogation, auth
- **relay/** — Messaging relay: teams, contacts, conversations, threading, context layers
- **pa-workspace/** — Google Workspace: PA email, calendar, drive, Tez email transport
- **canvas/** — Tezit Messenger: WhatsApp-style UI for teams, DMs, context

**Key capabilities:**
- Full TIP interrogation with citation verification
- FTS5 Discovery Protocol (sub-10ms at 100K+ entries)
- Fork semantics (counter, extension, reframe, update)
- Email transport (Tez via email with protocol headers)
- Multi-layer prompt injection defense
- Engagement scoring (interrogation-weighted)

---

## Documents in This Directory

### [CONTRIBUTION_OFFER.md](./CONTRIBUTION_OFFER.md)
Formal contribution offer to the Tezit ecosystem: new spec proposals (public TIP endpoints, email transport, discovery protocol), reference implementations, answers to TheAICoder's open questions, and interoperability testing.

### [PRODUCTION_LEARNINGS.md](./PRODUCTION_LEARNINGS.md)
Comprehensive learnings from 6+ months of production deployment covering discovery at scale, security and prompt injection defense, protocol extensions, and operational lessons.

### [CONFORMANCE_MATRIX.md](./CONFORMANCE_MATRIX.md)
Detailed conformance to Tezit Protocol v1.2.4 and TIP v1.0.3 specifications.

### [PROTOCOL_PROPOSALS.md](./PROTOCOL_PROPOSALS.md)
Seven specific proposals for Tezit Protocol v1.3 based on production experience: discovery protocol, security guidelines, email transport, fork semantics, engagement metadata, mirror distinction, and reference test fixtures.

---

## Production URLs

| URL | Purpose |
|-----|---------|
| https://app.mypa.chat | Production API |
| https://oc.mypa.chat | OpenClaw Gateway + Canvas UI |
| https://app.mypa.chat/.well-known/tezit.json | Protocol discovery |
| https://app.mypa.chat/health/live | Health check |

---

## Test Credentials (Production)

```
Email:    test@test.com
Password: testtest1
```

Available for other Tezit Protocol implementers to test interoperability.

Login: `POST https://app.mypa.chat/api/auth/login`

---

## Contact

**Repository:** [github.com/ragurob/MyPA.chat](https://github.com/ragurob/MyPA.chat)
**Available for:** Questions, collaboration, interoperability testing, code review
