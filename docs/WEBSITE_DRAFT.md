# MyPA Marketing Site Draft (2026-02-09)

Goal: sell a thoughtful Personal AI Assistant for work and team coordination, while highlighting (1) the world’s first PA-to-PA comms via the Tezit Protocol and (2) provisioned PA identity (email + calendar) with Twenty CRM included by default. Library of Context remains a core architectural asset, but is positioned primarily as a trust/safety and portability commitment.

---

## IA / Pages

Top nav (recommended): `Product`, `PA-to-PA`, `Integrations`, `Trust`, `Pricing`, CTA: `Launch` + secondary `Request demo`

Pages:
- `/` Home
- `/integrations/` Gmail + Calendar + Voice + Twenty
- `/pa-to-pa/` Tezit Protocol overview (product-level, not spec)
- `/trust/` Security + context controls
- `/pricing/` Packaging (no numbers required yet)
- `/privacy/`, `/terms/` (keep simple/legal)

---

## Homepage (`/`) — Draft Copy

### Hero
Kicker: **A thoughtful Personal AI Assistant for real work**

H1: **Your PA for communication, planning, and follow-through**

Subhead:
MyPA provisions a Personal AI Assistant for each user—complete with email and calendar—so your work runs through a consistent, accountable assistant identity. Coordinate with humans *and* other assistants using the Tezit Protocol: context-rich PA-to-PA messages that reduce back-and-forth and improve handoffs.

Primary CTA: **Launch MyPA**

Secondary CTA: **Request a demo**

Runtime note (small text under hero):
Powered by OpenClaw today, with runtime portability as the platform evolves.

Micro-trust line (under CTAs):
Built for teams: authenticated operations, strict isolation, auditable actions, and explicit human approval for high-impact sends.

### Section: What your PA does (3-up cards)
- **Write and route communication**  
Draft email/messages, propose next steps, and route work through your PA identity.
- **Run your calendar**  
Schedule, reschedule, prep agendas, and track decisions and follow-ups.
- **Keep work moving**  
Turn conversations into tasks, reminders, and updates—without losing the “why”.

### Section: The breakthrough — PA-to-PA communication (Tezit)
Title: **PA-to-PA communication, natively**

Body:
Most AI tools stop at “help me write this.” MyPA upgrades the workflow between people. When your PA contacts someone else’s PA, it sends a structured Tez: the message plus just-enough context so the recipient can triage, ask precise follow-ups, and surface a clean summary to their human.

Bullets:
- Less clarification: context travels with the ask.
- Better handoffs: decisions and constraints stay attached.
- Faster resolution: recipient PA can request more context when needed.

CTA link: **How PA-to-PA works** → `/pa-to-pa/`

### Section: Built-in identity + integrations
Title: **A real assistant needs a real identity**

Body:
Every MyPA user gets a provisioned PA identity with email + calendar built in. Add an optional voice number for routing, and keep all communication policy-controlled and auditable.

Integration callouts:
- **Email:** Gmail
- **Calendar:** Google Calendar
- **Voice (optional):** Google Voice number routing
- **CRM (default):** Twenty CRM

CTA link: **See integrations** → `/integrations/`

### Section: CRM by default (Twenty)
Title: **Your PA runs on a working CRM**

Body:
Twenty CRM is included by default so your PA can track relationships, deals, commitments, and follow-ups as first-class objects—not scattered notes. This is how a PA becomes operational, not just conversational.

Bullets:
- Capture context from calls and threads into the right record.
- Draft follow-ups and next-step proposals from deal state.
- Keep pipeline updates consistent without manual reporting.

### Section: Trust (short, sales-forward)
Title: **Trust-first by design**

Body:
Your context is sensitive. MyPA is designed so assistant operations are authenticated, scoped, and auditable—so teams can adopt it without losing control.

Bullets:
- Human approval gates for high-impact sends.
- Team isolation and policy boundaries.
- Audit events for share/edit/redact/export.

CTA link: **Read trust model** → `/trust/`

### Footer positioning (one-liner)
MyPA is the productivity layer for Personal AI Assistants: identity, integrations, and PA-to-PA communication on the open Tezit Protocol.

---

## PA-to-PA Page (`/pa-to-pa/`) — Draft Copy

H1: **The world’s first PA-to-PA communication workflow**

Lead:
Tezit defines a protocol for context-rich assistant communication. MyPA makes it practical: teams get better decisions, cleaner handoffs, and fewer clarification loops because the message and its context ship together—with controls.

Sections:
1. **What is a Tez?** (message + attached context + traceability)
2. **Progressive context sharing** (minimum necessary → request more)
3. **Human-in-the-loop controls** (approval, policy, audit)
4. **Open by design** (protocol partner; link to Tezit.com spec)

CTA: **Launch MyPA** / **Request demo**

---

## Integrations Page (`/integrations/`) — Draft Copy

H1: **Integrations that make a PA real**

Cards:
- Gmail (draft/send/triage with explicit approval)
- Google Calendar (scheduling, agendas, decision capture)
- Optional Voice number (routing + identity)
- Twenty CRM (records, pipeline, follow-ups)

Note:
Integrations are governed by least-privilege access and auditable actions.

---

## Trust Page (`/trust/`) — Draft Copy (sales + concrete)

H1: **Security, control, and context safety**

Positioning:
We treat user context as sacred. The job of MyPA is to deliver a useful assistant experience while keeping each user’s context safe—by default.

Commitments (bullet list):
- Per-user auth and strict team isolation.
- No unauthenticated public routes that consume model compute.
- Secrets via environment/secret store (no shared user-editable runtime tokens).
- Context controls: scope selection, progressive disclosure, and clear “what was shared” visibility.
- Audit events for share/edit/redact/export.
- Portability roadmap and release gates (export/import).

Honesty box (recommended):
If you share context with another party, they may retain it outside MyPA. Our goal is to make sharing explicit, minimal-by-default, and auditable—and to support redact/pullback policies where technically and contractually feasible.
