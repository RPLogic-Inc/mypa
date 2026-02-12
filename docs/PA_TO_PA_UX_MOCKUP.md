# PA-to-PA Communication UX Mockup

## The Environment

When a user goes to **oc.mypa.chat**, they see the OpenClaw Gateway interface.
This is a chat interface — like talking to an AI assistant. But this AI *is* their PA.

The Canvas (tezit-messenger) lives at `/__openclaw__/canvas/` and shows the
messaging data surface — inbox, teams, context. The PA can reference it,
open it, or the user can check it directly.

---

## Screen 1: User Opens oc.mypa.chat

```
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw                                        rob ▾  ⚙  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☀ Good morning, Rob. You have 3 unread messages.          │
│                                                             │
│  From Alice's PA:                                           │
│    "Decision: We're going with Option B for the API."       │
│    → 4 context layers attached                              │
│                                                             │
│  From Bob's PA:                                             │
│    "Question: Can we push the deadline to Friday?"          │
│    → 2 context layers attached                              │
│                                                             │
│  From Carol's PA:                                           │
│    "Update: Design review notes from yesterday"             │
│    → 6 context layers attached (artifact, background, ...)  │
│                                                             │
│  What would you like to do?                                 │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ Type a message...                              🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: The PA checked unread messages on startup (via SKILL.md →
`GET /unread` + `GET /tez/stream`) and presented a briefing. The user never
opened the Canvas — the PA brought the information to them.

---

## Screen 2: User Asks About a Message

```
┌─────────────────────────────────────────────────────────────┐
│  Rob:                                                       │
│  "What did Alice mean by Option B? What were the options?"  │
│                                                             │
│  PA:                                                        │
│  Based on Alice's context layers:                           │
│                                                             │
│  Option A was to build a REST API with versioned endpoints  │
│  (from the 'background' layer: "We discussed REST vs       │
│  GraphQL at Monday's standup").                              │
│                                                             │
│  Option B is a GraphQL gateway with schema stitching        │
│  (from the 'fact' layer: "GraphQL reduces client calls by   │
│  60% based on the prototype benchmarks").                    │
│                                                             │
│  The deciding constraint was: "Must support the mobile app  │
│  team's existing tooling" (from 'constraint' layer).        │
│                                                             │
│  Alice's PA marked this as a DECISION with HIGH urgency.    │
│                                                             │
│  Would you like to:                                         │
│  • Approve this decision                                    │
│  • Push back with a counter-argument                        │
│  • Ask Alice's PA for more detail                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ Type a message...                              🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: The PA fetched the full Tez (`GET /tez/:id`) with all
context layers, read them, and cited specific layers in its answer.
This is TIP (Tez Interrogation Protocol) happening naturally in conversation.

---

## Screen 3: User Instructs PA to Respond

```
┌─────────────────────────────────────────────────────────────┐
│  Rob:                                                       │
│  "Approve it, but note that we need to keep REST for the    │
│   billing API — the payment provider requires it."          │
│                                                             │
│  PA:                                                        │
│  I'll send this to Alice's PA. Here's what I'll send:       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📋 DECISION RESPONSE                               │    │
│  │                                                     │    │
│  │  Surface: "Approved. One exception: billing API     │    │
│  │  stays REST — payment provider requirement."        │    │
│  │                                                     │    │
│  │  Context attached:                                  │    │
│  │  • constraint: "Stripe webhook integration          │    │
│  │    requires REST endpoints per their docs"          │    │
│  │  • background: "Billing API serves 3 payment        │    │
│  │    providers, all expecting REST callbacks"          │    │
│  │  • hint: "Consider a REST→GraphQL adapter layer     │    │
│  │    so billing stays REST but internal calls use GQL" │    │
│  │                                                     │    │
│  │  Type: decision  |  Urgency: high                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Send this?                                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ "yes"                                          🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: The PA:
1. Drafted surface text from the user's intent
2. Generated context layers (constraint + background + hint) from its knowledge
3. Set type=decision, urgency=high (matching the original)
4. Shows preview for human approval (PA-first: `authored_by: human_approved`)

---

## Screen 4: User Confirms — PA Sends

```
┌─────────────────────────────────────────────────────────────┐
│  Rob:                                                       │
│  "yes"                                                      │
│                                                             │
│  PA:                                                        │
│  ✓ Sent to Alice's PA as a threaded reply.                  │
│                                                             │
│  Alice's PA will receive it and present it to her with      │
│  your context. She can interrogate your reasoning through   │
│  the constraint and background layers you attached.         │
│                                                             │
│  Anything else?                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ Type a message...                              🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: The PA called `POST /tez/:id/reply` with:
```json
{
  "surfaceText": "Approved. One exception: billing API stays REST...",
  "context": [
    { "layer": "constraint", "content": "Stripe webhook integration..." },
    { "layer": "background", "content": "Billing API serves 3 payment..." },
    { "layer": "hint", "content": "Consider a REST→GraphQL adapter..." }
  ]
}
```

---

## Screen 5: Meanwhile, on Alice's Side...

Alice opens oc.mypa.chat. Her PA greets her:

```
┌─────────────────────────────────────────────────────────────┐
│  OpenClaw                                      alice ▾  ⚙  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☀ Good morning, Alice. Rob's PA replied to your API        │
│  decision.                                                  │
│                                                             │
│  Summary: Rob approved Option B (GraphQL) with one          │
│  exception — the billing API must stay REST due to          │
│  payment provider requirements.                             │
│                                                             │
│  Key context from Rob:                                      │
│  • Stripe requires REST webhook endpoints                   │
│  • 3 payment providers expect REST callbacks                │
│  • He suggests a REST→GraphQL adapter layer as compromise   │
│                                                             │
│  This seems actionable. Would you like to:                  │
│  • Acknowledge and proceed with the hybrid approach         │
│  • Discuss the adapter idea with the team                   │
│  • Ask Rob's PA for the Stripe docs reference               │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ Type a message...                              🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: Alice's PA:
1. Received the reply notification (via polling `GET /unread`)
2. Fetched the full Tez with context (`GET /tez/:id`)
3. Generated a recipient-specific summary with suggested actions
4. Presented it as a briefing, not a raw message

**Alice never reads a "message" — her PA reads it and briefs her.**

---

## Screen 6: Proactive PA — Sending Without Being Asked

Rob is working in OpenClaw on a code review. The PA notices something:

```
┌─────────────────────────────────────────────────────────────┐
│  Rob:                                                       │
│  "Review the auth middleware in src/middleware/auth.ts"      │
│                                                             │
│  PA:                                                        │
│  I've reviewed auth.ts. Found two issues:                   │
│                                                             │
│  1. Token refresh doesn't invalidate old tokens (security)  │
│  2. Rate limiter uses in-memory store (won't survive        │
│     PM2 restarts)                                           │
│                                                             │
│  This is relevant to Carol's team — she's working on the    │
│  auth migration. Want me to send her PA a handoff with      │
│  these findings?                                            │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ "yes, send it to carol"                        🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│  PA:                                                        │
│  Sending to Carol's PA:                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  🔄 HANDOFF                                         │    │
│  │                                                     │    │
│  │  Surface: "Found 2 auth issues during code review   │    │
│  │  that affect your migration work."                  │    │
│  │                                                     │    │
│  │  Context:                                           │    │
│  │  • artifact: [full code snippets from auth.ts]      │    │
│  │  • fact: "Token refresh on line 47 doesn't call     │    │
│  │    revokeToken() — old tokens remain valid"         │    │
│  │  • fact: "Rate limiter at line 82 uses Map() which  │    │
│  │    resets on PM2 restart"                           │    │
│  │  • relationship: "These overlap with the auth       │    │
│  │    migration Carol started last Tuesday"            │    │
│  │  • hint: "Consider Redis for rate limiting if       │    │
│  │    moving to cluster mode"                          │    │
│  │                                                     │    │
│  │  Type: handoff  |  Urgency: normal                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ✓ Sent.                                                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ Type a message...                              🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**What happened**: The PA:
1. Reviewed actual code (OpenClaw tool use)
2. Identified findings
3. Knew Carol was relevant (from team context / PA knowledge)
4. Composed a handoff Tez with code artifacts + facts + relationship context
5. Got human approval before sending

---

## Screen 7: The Canvas — When You Want to Browse

If the user clicks the Canvas link or navigates to it:

```
┌──────────────────┬──────────────────────────────────────────┐
│  TEAMS           │                                          │
│                  │  Engineering  ·  3 messages today         │
│  ● Engineering 3 │                                          │
│    Design        │  ┌────────────────────────────────────┐  │
│    Marketing     │  │ Alice                    10:32 AM  │  │
│                  │  │ Decision: Going with GraphQL       │  │
│  DIRECT MESSAGES │  │ for the API.                       │  │
│                  │  │ 📎 4 context layers     💬 Reply   │  │
│    Alice         │  └────────────────────────────────────┘  │
│  ● Bob        1  │                                          │
│    Carol         │  ┌────────────────────────────────────┐  │
│                  │  │ Rob (you)                10:45 AM  │  │
│                  │  │ ↩ Reply to Alice                   │  │
│                  │  │ Approved. Billing API stays REST.   │  │
│                  │  │ 📎 3 context layers     💬 Reply   │  │
│                  │  └────────────────────────────────────┘  │
│                  │                                          │
│                  │  ┌────────────────────────────────────┐  │
│                  │  │ Bob                      11:02 AM  │  │
│                  │  │ Question: Can we push deadline     │  │
│                  │  │ to Friday?                         │  │
│                  │  │ 📎 2 context layers     💬 Reply   │  │
│                  │  └────────────────────────────────────┘  │
│                  │                                          │
│                  ├──────────────────────────────────────────┤
│                  │  ▸ Type a message...           📎  ⏎    │
│  [Logout]        │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

**This is the existing tezit-messenger Canvas.** It shows:
- Teams with unread badges
- DMs with unread badges
- Message thread with context layer counts
- Reply button, compose bar with context attachment

Users CAN compose directly here for quick messages. But for anything
with rich context, they go back to their PA in the main OpenClaw chat.

---

## Screen 8: Voice Mode — The 1-Tap Experience

User taps the microphone:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                        🎤                                   │
│                    (listening)                               │
│                                                             │
│  "Tell Bob I can't push the deadline because the client     │
│   demo is Monday and we need the weekend for QA"            │
│                                                             │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

         ↓ PA processes, composes, shows preview ↓

┌─────────────────────────────────────────────────────────────┐
│  PA:                                                        │
│  Sending to Bob's PA:                                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  📋 DECISION                                        │    │
│  │                                                     │    │
│  │  "Can't push to Friday. Client demo is Monday,      │    │
│  │   need the weekend for QA."                         │    │
│  │                                                     │    │
│  │  Context:                                           │    │
│  │  • constraint: "Client demo locked for Monday AM"   │    │
│  │  • background: "QA cycle typically needs 48 hours   │    │
│  │    for full regression suite"                       │    │
│  │  • hint: "Could scope down to critical path only    │    │
│  │    if Bob's blocked on something specific"          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Send this?                                                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▸ "send it"                                      🎤  ⏎    │
└─────────────────────────────────────────────────────────────┘
```

**The voice flow**: speak → PA drafts with context → approve → sent.
Two interactions total. The PA added context layers the user didn't
explicitly state (QA cycle duration, scope-down hint) from its knowledge.

---

## The Key UX Principles

### 1. Chat IS the interface
Users talk to their PA. They don't navigate tabs, click buttons, or fill
forms. "Send Alice a decision" is the entire UX.

### 2. PA reads messages for you
You never see raw messages. Your PA triages, summarizes, and presents
with suggested actions. "Alice's PA sent a decision" not "New message."

### 3. Context travels automatically
When the PA composes, it attaches relevant context layers. The user
doesn't manually select "background" or "constraint" — the PA knows.

### 4. Preview before send (always)
PA-first means the PA drafts, but humans approve. The preview card
shows exactly what will be sent including all context layers.

### 5. Canvas is the data surface
The Canvas shows the raw feed for when you want to browse. But the
PA is the primary way you interact with messages.

### 6. Voice is first-class
Every interaction can be voice. "Tell Bob..." is the natural entry point.

---

## What This Requires (Technical)

### Already built:
- OpenClaw Gateway chat + voice + tools
- tezit-messenger Canvas (teams, DMs, context, threading)
- tezit-relay backend (messaging API)
- mypa backend (library, TIP, auth)
- SKILL.md files (teach PA both APIs)

### Needs work:
1. **Merged SKILL.md** — one unified skill with briefing-on-open behavior
2. **nginx routing** — `/mypa/` proxy for library/TIP from oc.mypa.chat
3. **Sunrise behavior** — PA checks unread + presents briefing on first message
4. **Compose preview** — PA formats the preview card before sending (skill behavior)
5. **Recipient summaries** — PA summarizes incoming tez for recipient (skill behavior)

### NOT needed:
- New UI components (the Canvas works)
- ShareFromAISheet (PA handles compose)
- QuickCompose (PA handles compose)
- Library tab (PA searches via skill)
- AI tab (OpenClaw IS the AI)
