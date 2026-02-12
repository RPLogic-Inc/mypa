# User Stories & Personas

How real people use MyPA day-to-day. Each persona demonstrates a different facet of the system — from the family group chat to the 10-person startup to the cross-company collaboration.

Notes:
- MyPA is intentionally "thin": Tez stream + team routing + Library of Context + Tezit Protocol. OpenClaw provides the PA brain (chat, web tools, memory, code/sandbox, multi-agent routing).
- Some stories reference a "PA Workspace" (email/calendar identity, timesheet). Treat those as optional integrations that can be delivered as OpenClaw skills or adjacent services; they are not required for MyPA core.

---

## Persona 1: The Family Hub

**Rob Price** — Dad, software engineer, family organizer
**Rosalind Price** — Mom, works from home, manages the household
**Team**: "The Prices" (2 members)

### Story 1.1: Morning Briefing

Rob opens MyPA at 7:15am while making coffee. He swipes to the **AI tab** and says:

> "Good morning, what's going on today?"

His PA (powered by OpenClaw) calls `GET /api/pa/briefing` and `GET /api/pa/context`, then responds:

> "Morning Rob. You have 3 pending tezits. Ros sent you one last night about Ella's school pickup — she needs to know by 9am. You also have a personal reminder about the dentist at 2pm, and a stale tez from 3 days ago about fixing the kitchen light."

**What happened under the hood:**
- OpenClaw agent used the `mypa` skill (SKILL.md) to call the briefing endpoint
- Briefing returned: `pendingCount: 3`, `staleCards: [{content: "Fix kitchen light"}]`, `upcomingDeadlines: [{content: "Dentist", dueDate: "2026-02-07T14:00:00Z"}]`
- The PA composed a natural-language summary from the structured data

### Story 1.2: Voice Message to Ros

Rob holds the compose button and says:

> "Tell Ros I'll pick up Ella at 3:30, no problem."

The app flow:
1. **VoiceRecorder** captures speech, sends text to `POST /api/cards/classify`
2. Classify returns: `{ intent: "dm", recipientName: "Rosalind Price", confidence: 98 }`
3. Rob has `autoSendDMs: true` and team size is 2 (under 10) and confidence is >= 97
4. **Auto-sent** — no confirmation dialog needed
5. Toast appears: "Sent to Rosalind"
6. `POST /api/cards/team` creates the tez with `recipients: ["ros-user-id"]`
7. Ros gets a push notification via ntfy.sh

**Library of Context**: Rob's original voice transcription is preserved forever in `card_context`. If either of them later asks "what did Rob say about pickup?", the PA can search the Library.

### Story 1.3: Ros Responds

Ros sees the notification, opens MyPA, taps the tez in her **Stream**. The TezExpanded view shows:
- Rob's message: "I'll pick up Ella at 3:30, no problem."
- Status: **pending** (orange dot)

She taps **Respond** and types: "Thank you! Can you also grab milk on the way home?"

This creates a response via `POST /api/cards/:id/respond` and transitions the card to **active** status.

### Story 1.4: Interrogating a Tez

Later that evening, Ros can't remember the details. She taps the tez and hits **"Ask about this"**, which navigates to the PA tab with context:

> "What time did Rob say he'd pick up Ella?"

The PA calls `POST /api/tez/:id/interrogate`, which uses the Tez Interrogation Protocol (TIP). The answer is **grounded** — answered strictly from the tez's transmitted context:

> "Rob said he'd pick up Ella at 3:30. [Source: voice message, 7:22am]"

The citation is verified and logged in `tez_citations`.

### Story 1.5: Sharing Outside the App (Mirror)

Rob wants to text his mom the school pickup plan. He opens the tez, taps **Mirror**, and selects the "surface" template:

> "Rob's picking up Ella at 3:30 today. (View full context in MyPA)"

`POST /api/tez/:id/mirror` renders a lossy, read-only summary. `POST /api/tez/:id/mirror/send` logs the share to `mirror_audit_log` with `destination: "sms"`. The full context stays in the app — the mirror is deliberately incomplete.

---

## Persona 2: The Startup Team

**Marcus Chen** — CEO, 10-person AI startup "NovaMind"
**Priya Sharma** — CTO, technical lead
**Leo Torres** — Designer, remote in Barcelona
**+ 7 other team members**
**Team**: "NovaMind" (10 members)
**PA Domain**: `pa.novamind.ai` (Google Workspace, $70/month for 10 PA accounts)

### Story 2.1: Admin Sets Up PA Workspace

Marcus is the admin. He:
1. Buys Google Workspace Business Starter for `pa.novamind.ai`
2. Creates a service account with domain-wide delegation
3. Configures pa-workspace:

```
POST /api/admin/setup → { teamId: "novamind-team", appApiUrl: "https://api.novamind.ai" }
PATCH /api/admin/config → { googleDomain: "pa.novamind.ai", googleServiceAccountJson: "...", googleAdminEmail: "admin@novamind.ai" }
POST /api/admin/config/test-workspace → { status: "ok", domain: "pa.novamind.ai", usersFound: 0 }
```

4. Batch-provisions PA accounts: `POST /api/admin/provision-all`

Each team member gets a real PA email:
- `marcus-pa@pa.novamind.ai`
- `priya-pa@pa.novamind.ai`
- `leo-pa@pa.novamind.ai`
- etc.

**What happened**: Google Admin SDK `users.insert` created real Workspace accounts. Each PA has Gmail, Calendar, and Drive.

### Story 2.2: Priya's PA Reads Her Calendar

Priya shares her personal Google Calendar with `priya-pa@pa.novamind.ai` (standard Google Calendar sharing). Now her PA can see her schedule.

She asks her PA:

> "What's on my calendar today?"

The PA calls pa-workspace:
```
GET /api/calendar/shared-events?paEmail=priya-pa@pa.novamind.ai&from=2026-02-07&to=2026-02-08
```

Returns events from all calendars Priya has shared with her PA:
- 9:00 Team Standup [Priya's Calendar]
- 11:00 Architecture Review [Priya's Calendar]
- 14:00 Investor Call [NovaMind Calendar]

The PA responds:

> "You have 3 meetings today: Team standup at 9, architecture review at 11, and the investor call at 2pm."

### Story 2.3: PA Processes Forwarded Email

Priya sets up a Gmail filter to forward emails from `investors@sequoia.com` to `priya-pa@pa.novamind.ai`. A new email arrives:

```
From: investors@sequoia.com
Subject: Q1 Follow-Up Questions
To: priya@novamind.ai → forwarded to priya-pa@pa.novamind.ai
```

The OpenClaw agent (or a scheduled job) calls:
```
POST /api/email/process → { paEmail: "priya-pa@pa.novamind.ai" }
```

pa-workspace:
1. Reads unread messages from the PA's Gmail via `gmail.users.messages.list`
2. Detects this is a **normal email** (no Tezit Protocol markers)
3. Creates a card in the app backend via `POST /api/webhooks/email`
4. Marks the Gmail message as read
5. Logs the action to the PA's calendar as a timesheet event:

```
POST /api/calendar/log-action → {
  paEmail: "priya-pa@pa.novamind.ai",
  actionType: "email_read",
  summary: "Processed: Q1 Follow-Up Questions from investors@sequoia.com"
}
```

A color-coded Peacock (teal) event appears on the PA's Google Calendar.

Priya sees a new tez in her Stream: "Q1 Follow-Up Questions from investors@sequoia.com" with `sourceType: "email"`.

### Story 2.4: Cross-Company Tez Transport

Marcus wants to share a product roadmap tez with their partner company's CEO (Dana, at `dana-pa@pa.partnercorp.com`). Both companies use MyPA with PA Workspace.

Marcus's PA calls:
```
POST /api/tez-transport/send → {
  tezId: "tez-roadmap-456",
  fromPaEmail: "marcus-pa@pa.novamind.ai",
  toEmail: "dana-pa@pa.partnercorp.com"
}
```

pa-workspace:
1. Exports the tez from the app backend: `GET /api/tez/tez-roadmap-456/export`
2. Composes an email with:
   - `X-Tezit-Protocol: 1.2` header
   - `X-Tezit-Id: tez-roadmap-456` header
   - Human-readable summary in the body
   - `tez-roadmap-456.tez.json` attachment (Portable Tez bundle)
3. Sends via Marcus's PA Gmail (real sender: `marcus-pa@pa.novamind.ai`)

On Dana's side, when her PA processes unread emails:
1. Detects `X-Tezit-Protocol` header
2. Extracts the `.tez.json` attachment
3. Imports via `POST /api/tez/import` on Dana's app backend
4. Dana sees a new tez in her Stream: "Product Roadmap from marcus-pa@pa.novamind.ai"
5. She can interrogate it — all the original context traveled with the tez

**Every PA email is a Tezit Protocol endpoint.** Cross-company knowledge sharing works through standard email infrastructure.

### Story 2.5: Team Availability Check

Marcus is scheduling a team offsite. He asks his PA:

> "When is the whole team free this Thursday afternoon?"

The PA calls:
```
GET /api/calendar/team-availability?teamId=novamind-team&from=2026-02-12T12:00:00Z&to=2026-02-12T18:00:00Z
```

pa-workspace aggregates freebusy data from all 10 PAs' shared calendars:
```json
{
  "marcus-pa@pa.novamind.ai": [{ "start": "13:00", "end": "14:00" }],
  "priya-pa@pa.novamind.ai": [{ "start": "14:00", "end": "15:00" }],
  "leo-pa@pa.novamind.ai": []
}
```

The PA synthesizes:

> "Thursday afternoon: everyone's free from 3pm to 6pm. Marcus has a 1-2pm block, Priya has 2-3pm. Leo and the rest are clear all afternoon."

### Story 2.6: PA Timesheet Audit

At month-end, Marcus reviews what his PA did:

```
GET /api/calendar/timesheet?paEmail=marcus-pa@pa.novamind.ai&from=2026-02-01&to=2026-02-28
GET /api/calendar/timesheet/summary?paEmail=marcus-pa@pa.novamind.ai
```

Returns:
```json
{
  "email_read": { "count": 47, "totalDurationMs": 235000 },
  "card_created": { "count": 12, "totalDurationMs": 60000 },
  "tez_sent": { "count": 3, "totalDurationMs": 15000 },
  "calendar_checked": { "count": 22, "totalDurationMs": 110000 },
  "briefing_generated": { "count": 28, "totalDurationMs": 140000 }
}
```

He can export as CSV: `POST /api/calendar/timesheet/export → { format: "csv" }`

Every action is also a color-coded event on the PA's Google Calendar — a visual timesheet.

---

## Persona 3: The Remote Worker

**Leo Torres** — Designer at NovaMind, works from Barcelona (6 hours ahead of US team)

### Story 3.1: Multi-Team Membership

Leo freelances across two teams. He's a member of both "NovaMind" (his main gig) and "Barcelona Design Collective" (a side collaboration of 4 designers).

When he opens MyPA, the **TeamSwitcher** in the header shows both teams. His active team is NovaMind.

```
GET /users/me/teams → [
  { id: "novamind-team", name: "NovaMind", role: "member", isActive: true, memberCount: 10 },
  { id: "bdc-team", name: "Barcelona Design Collective", role: "lead", memberCount: 4 }
]
```

He taps to switch to Barcelona Design Collective:
```
PATCH /teams/bdc-team/active
```

The tez stream refreshes to show only BDC tezits. Cards are team-scoped via `teamId`.

### Story 3.2: Asynchronous Handoff

It's 11pm in Barcelona (5pm in SF). Leo finishes a design mockup and wants to hand it off to Priya for review. He composes:

> "Priya, the new dashboard mockup is done. Check the Figma link in the doc. I moved the nav to the left based on our last conversation. Let me know if the color tokens work with the dark mode palette."

The flow:
1. `POST /api/cards/classify` → `{ intent: "dm", recipientName: "Priya Sharma", confidence: 95 }`
2. Confidence is 95 (below 97 auto-send threshold) → **SendConfirmDialog** appears: "Send to Priya Sharma?"
3. Leo confirms → `POST /api/cards/team` with `recipients: ["priya-id"]`
4. Priya gets a push notification at 5pm SF time
5. Leo's original words are preserved in the Library of Context

When Priya opens it the next morning (8am SF = 2pm Barcelona), she can respond, and Leo sees it when he wakes up. No messages lost, no Slack scroll.

### Story 3.3: Snoozing a Tez

Priya responds at 9am SF: "Love the nav placement! Need to check dark mode tokens — will get back to you after standup."

Leo sees it at 3pm Barcelona. He doesn't want to forget, so he snoozes the tez:

```
POST /api/cards/:id/snooze → { until: "2026-02-08T09:00:00Z" }
```

The tez disappears from his pending stream and reappears the next morning at 9am Barcelona time.

---

## Persona 4: The Power User

**Aisha Williams** — Operations lead, NovaMind. Uses every MyPA feature.

### Story 4.1: Voice-First Workflow

Aisha is walking to a meeting. She holds the compose button and rapid-fires:

> "Remind me to follow up with the landlord about the office lease. Also tell Marcus the Q1 budget spreadsheet is ready for review. And book a reminder for Friday to submit the expense report."

The VoiceRecorder captures this, and the backend's smart routing (`POST /api/cards/classify`) handles each intent. Behind the scenes, the classify endpoint identifies:
- "Remind me..." → `intent: "self"` → personal tez
- "Tell Marcus..." → `intent: "dm", recipientName: "Marcus Chen"` → team tez to Marcus
- "Book a reminder for Friday..." → `intent: "self"` with `dueDate` → personal tez with deadline

Three tezits created from one voice input. Each one's original transcription preserved in the Library of Context.

### Story 4.2: Library of Context Search

A month later, Aisha needs to find what she said about the lease. She taps the **Library** tab and searches:

```
GET /api/cards/library/search?q=landlord+lease
```

Returns all context items matching "landlord lease" — including the original voice transcription from her walking dictation. She taps through to the tez, sees the full history of responses, status changes, and reactions.

**Context never dies.** The original voice recording metadata, the raw transcription, and the AI-generated display bullets are all preserved separately.

### Story 4.3: Counter-Tez (Forking)

Marcus sends a tez to the team: "I think we should push the launch to April."

Aisha disagrees. She opens the tez and taps **Fork → Counter**:

```
POST /api/tez/:id/fork → {
  forkType: "counter",
  content: "I think March is still doable if we cut scope on the analytics dashboard. Here's why..."
}
```

This creates a new tez linked to Marcus's original via `forkedFromId`. The fork tree shows the dialectic reasoning — original claim and counter-argument side by side.

### Story 4.4: PA Sends SMS via Google Voice

Aisha's PA has a Google Voice number (`+14155551234`). She's expecting a delivery and wants an SMS alert when it arrives. She tells her PA:

> "Send a text to the delivery driver at 415-555-9876 saying I'll be at the loading dock."

The PA calls:
```
POST /api/voice/sms → {
  paEmail: "aisha-pa@pa.novamind.ai",
  toNumber: "+14155559876",
  body: "Hi, this is Aisha's assistant. Aisha will be at the loading dock for the delivery."
}
```

pa-workspace sends the SMS by emailing `+14155559876@txt.voice.google.com` via the PA's Gmail. The message goes out from the PA's real Google Voice number.

---

## Persona 5: The New Team Member

**Jordan Kim** — Just joined NovaMind as a junior engineer

### Story 5.1: Onboarding Flow

Jordan receives a join link from Marcus: `https://app.mypa.chat/join/VLVB3LQV`

1. **WelcomeScreen** renders with "Join NovaMind" messaging
2. Jordan registers: `POST /api/auth/register` → account created
3. Invite code auto-accepted: `POST /api/onboarding/accept-invite` → joins NovaMind team
4. **TeamSetupWizard** guides through profile setup
5. OpenClaw creates a PA agent for Jordan with team context seeded

Jordan's PA immediately has context: who's on the team, what roles everyone has, what skills are available. The `paPreferences` defaults are sensible — Jordan can customize tone, response style, and display name later.

### Story 5.2: First Day Catch-Up

Jordan asks their PA:

> "What's the team been working on this week?"

The PA fetches context: `GET /api/pa/context` returns all recent tezits the team has shared. The PA synthesizes a briefing from `recentCards` — no scrolling through old messages needed.

### Story 5.3: PA Gets a Workspace Account

Because Marcus set up PA Workspace, Jordan automatically gets:
- `jordan-pa@pa.novamind.ai` (real Gmail + Calendar)
- A PA that can read shared calendars, process forwarded emails, and keep a timesheet

Jordan shares their Google Calendar with their PA email, and immediately the PA knows about their meetings — just like having a real assistant join the company.

---

## Persona 6: The Admin

**Marcus Chen** — CEO and team admin

### Story 6.1: Managing Team Members

Marcus manages the team through the **TeamSettings** panel:
- Views all members and their roles
- Creates invite links with pre-configured roles and skills
- Sees the PA status for each team member (active/suspended)

When someone leaves, Marcus suspends their PA:
```
POST /api/identity/user-id/suspend
```

This disables the Google Workspace account (preserves data, stops email delivery). Clean separation — no shared passwords to rotate, no access to revoke across multiple systems.

### Story 6.2: Monitoring PA Activity

Marcus can see what every PA has been doing via the timesheet:

```
GET /api/calendar/timesheet/summary?paEmail=priya-pa@pa.novamind.ai
```

The PA's Google Calendar is a visual audit trail — color-coded events for every action:
- **Blueberry** (blue): Card created
- **Peacock** (teal): Email read
- **Banana** (yellow): Email sent
- **Basil** (green): Tez received
- **Tangerine** (orange): Tez sent
- **Grape** (purple): Calendar checked
- **Lavender** (light purple): Briefing generated
- **Graphite** (gray): General

### Story 6.3: Domain-Wide Setup Automation

Marcus configured everything through pa-workspace's admin API. The admin endpoints handle:
- `POST /api/admin/setup` — Initialize workspace for team
- `PATCH /api/admin/config` — Set Google Workspace credentials
- `POST /api/admin/config/test-workspace` — Verify connectivity
- `POST /api/admin/provision-all` — Batch-create PA accounts
- `GET /api/admin/identities` — List all PAs and their status
- `GET /api/admin/domain-users` — List Google Workspace users (debugging)

---

## Persona 7: The Team Lead (OpenClaw-First)

**Samir Patel** — Engineering Manager, 8-person product team
**Team**: "Shiproom" (8 members)

Samir is not looking for "another chat app." He wants a single place where:
- MyPA is the canonical team stream and audit trail (who said what, when, with context)
- OpenClaw does the thinking and execution (web, memory, code, multi-agent routing)

### Story 7.1: Standup In 60 Seconds

At 8:55am, Samir opens MyPA and taps the **AI tab**. He says:

> "Prep standup: what changed since yesterday, what is blocked, and what needs decisions."

The OpenClaw agent:
1. Fetches structured context from MyPA (`GET /api/pa/context` and `GET /api/cards/feed`)
2. Uses multi-agent routing:
   - Agent A: summarizes the last 24 hours of team tezits
   - Agent B: scans for blockers / urgent items
   - Agent C: proposes a standup agenda and 3 decision prompts
3. Posts a "Standup Brief" team tez so everyone sees the same source of truth:
   - `POST /api/cards/team` with the agenda + highlighted tez links

Samir does not paste Slack threads. Nobody scrolls. The briefing is a Tez with an interrogatable context iceberg.

### Story 7.2: Delegation Without Losing Context

Samir has a vague goal: "Reduce frontend bundle size." In OpenClaw, he asks:

> "Split this into 3 tracks: quick wins, medium refactors, long-term architecture. Assign an owner for each."

The OpenClaw agent uses multi-agent routing to produce three parallel work plans, then creates three team tezits:
- "Bundle size quick wins" -> routed to the frontend owner
- "Bundle size refactors" -> routed to a senior engineer
- "Bundle size architecture" -> routed to Samir + CTO

Each tez contains:
- A crisp surface message (what to do)
- The deeper plan in context entries (why, tradeoffs, references)

The team experiences "assignment" as communication, not as a separate project management tool.

### Story 7.3: Team Norms Live In Memory, Not Tribal Knowledge

Samir has a consistent communication style:
- Always include a "what I need from you" line
- Always include a deadline
- Never send vague "ping" messages

He stores these preferences in OpenClaw memory (so drafts always follow the team's norms). When he uses MyPA compose, the OpenClaw agent drafts a clean team tez automatically.

Result: consistent, high-signal tezits without Samir manually policing tone.

---

## Persona 8: The Incident Commander

**Nina Alvarez** — SRE Lead, on-call rotation for a production system
**Team**: "On-Call" (6 members)

### Story 8.1: The Incident Tez Becomes The Timeline

At 02:14, the monitoring system pages Nina. She opens MyPA, taps **Compose**, and dictates:

> "P0 incident: elevated 5xx in API. Starting investigation. Suspect db connection pool exhaustion."

The classify endpoint routes to the on-call team. A single "incident tez" is created with `priority: "critical"`.

All subsequent updates are responses to the same tez:
- "Mitigation applied"
- "Root cause"
- "Follow-ups"

No one is reconstructing the timeline later from a 200-message Slack thread.

### Story 8.2: OpenClaw Pulls External Context, MyPA Preserves It

Nina asks her OpenClaw agent:

> "Check status pages for our provider and summarize likely causes. Save anything relevant into this incident."

OpenClaw uses its web tools to search and fetch sources, summarizes them, and appends them as context entries on the incident tez.

MyPA becomes a durable incident record:
- the exact sources OpenClaw found
- the summary
- what the team decided
- who did what

### Story 8.3: Stakeholder Updates Are Mirrors, Not Leaks

Nina needs to send a summary outside the engineering team. She taps **Mirror** on the incident tez and shares the stakeholder-safe mirror link.

This preserves the right security boundary:
- External parties get a read-only summary
- The full incident context iceberg stays internal

---

## Persona 9: The Researcher (Tez As A Publishable Unit)

**Eli Chen** — Product researcher
**Team**: "Growth" (5 members)

### Story 9.1: A Research Tez With Sources And Interrogation

Eli is asked:

> "What are the top 3 competitor moves in the last 30 days?"

He opens the **AI tab** and requests a structured answer. OpenClaw uses web search + fetch, then produces:
- A clean surface summary
- Citations and excerpts stored as context entries

Eli publishes it as a team tez:
- "Competitor moves - last 30 days"

Now the team can:
- read the summary fast
- interrogate it ("What evidence supports #2?") without asking Eli
- fork a counter-Tez if they disagree

This turns research into a durable, queryable object.

### Story 9.2: Research Becomes Team Memory Automatically

Two months later, someone asks:

> "Didn't we see something about competitor pricing in Q1?"

The answer is not in someone's brain. It's in the Library of Context:
`GET /api/cards/library/search?q=pricing+competitor`

The "research Tez" is found instantly, with the original sources preserved.

---

## Persona 10: The Team That Lives In OpenClaw (And Still Needs MyPA)

**The "Ops Guild"** — 12 people who already use OpenClaw daily for coding, research, and task execution

They don't need MyPA to be another assistant. They need MyPA to be the team layer that OpenClaw doesn't try to be:
- a shared stream of durable communication (tezits)
- a team-scoped library of context
- a protocol for sharing context across trust boundaries (Tezit Protocol, Mirror)

### Story 10.1: The Team Uses OpenClaw For Thinking, MyPA For Publishing

In OpenClaw, someone explores options:
- drafts
- web research
- code experiments
- multi-agent "what should we do" deliberation

When the output matters to the team, they publish a Tez:
- "Decision: ship X, defer Y"
- "Incident: root cause and follow-ups"
- "Research: competitor summary"

OpenClaw becomes the workshop. MyPA becomes the record.

### Story 10.2: Team Context Lives In MyPA, Not In Everyone's Chat History

OpenClaw sessions are personal and ephemeral. MyPA makes "team memory" concrete.

When a new teammate joins:
- they don't need to import your OpenClaw sessions
- they don't need to scroll Slack history
- they read and interrogate the last month of key tezits

This is the difference between "assistant productivity" and "organizational knowledge."

---

## Persona 11: The Solo Consultant

**Maya Rodriguez** — Independent strategy consultant, 1-person operation
**Team**: "Maya Rodriguez Consulting" (1 member — she's the admin and only user)

Maya runs her own OpenClaw instance. She doesn't have an IT team — she IS the IT team. She uses AI for client research, proposal writing, meeting prep, and follow-up tracking. Every client engagement generates context she needs to retrieve months later.

### Story 11.1: Self-Admin Setup

Maya installs the platform and registers. As the first user, she's automatically admin. She configures her AI model preferences, enables web search, and sets up SMTP for email notifications. No team invite flow needed — she's solo.

### Story 11.2: Client Research Sprint

Maya has a new prospect call in 2 hours. She asks her PA to research the company, their recent news, competitive landscape, and key decision-makers. The PA uses web search + fetch, returns cited results. Maya publishes the research as a personal Tez so she can interrogate it during the call.

### Story 11.3: Voice-First, Everywhere

Between meetings, Maya dictates follow-up notes via hold-to-talk. Each note becomes a Tez with full context preserved. She never opens a laptop for quick captures — voice is her primary input.

### Story 11.4: Library as Client Memory

Six months later, a past client calls back. Maya searches her Library for everything related to that engagement — proposals, research, meeting notes, follow-ups. The AI has the context without Maya having to re-explain anything.

---

## Persona 12: The Creative Agency

**Kai Nakamura** — Creative Director at "Prism Studio" (6 people)
**Team**: "Prism Studio" (6 members)

Prism runs multiple client projects simultaneously. They need context isolation per client, AI for content research and competitive analysis, and a way to share deliverables externally without leaking internal strategy.

### Story 12.1: AI-Powered Content Research

Kai asks the PA to research trends in sustainable fashion for a client brief. The PA searches the web, fetches sources, and produces a cited summary. Kai publishes it as a team Tez tagged for the client project. The team interrogates it to pull specific data points for the brief.

### Story 12.2: Multi-Agent Brief Generation

Kai needs a competitive analysis, trend report, and creative direction memo — all by end of day. He asks the PA to split into parallel tracks. Three agents work simultaneously. The combined output becomes a team Tez with clear attribution of which agent produced what.

### Story 12.3: Client-Safe Sharing via Mirrors

The brief is ready. Kai creates a Mirror — a lossy, client-safe version — and shares the link. The client sees the polished output. The internal strategy notes, raw research, and team deliberation stay in the full Tez context, invisible to outsiders.

---

## Persona 13: The Sales Team

**Danielle Brooks** — VP Sales at NovaMind (3 SDRs + 1 AE)
**Team**: "NovaMind Sales" (5 members)

The sales team lives in CRM, email, and calendar. They need AI for prospect research, email drafting, call prep, and pipeline updates. Speed matters — every hour of delay is a lost deal.

### Story 13.1: Prospect Research Before Calls

An SDR asks the PA: "Research Acme Corp before my 2pm call." The PA pulls company info, recent news, LinkedIn presence, and competitive positioning via web search. The SDR gets a briefing Tez they can interrogate during the call.

### Story 13.2: CRM-Integrated Workflow

After the call, the SDR tells the PA: "Update the Acme deal to qualified, add notes from the call." The PA updates the CRM via integration and creates a team Tez summarizing the call outcome. The team sees pipeline movement in their stream without opening the CRM.

### Story 13.3: Team Pipeline Briefing

Every Monday, Danielle asks her PA for a pipeline summary. The PA pulls CRM data, recent tezits from the team, and upcoming calendar events. She publishes a "Weekly Pipeline" Tez that the team can interrogate for details on any deal.

---

## Persona 14: The IT/Security Admin

**Victor Okafor** — IT Director, responsible for AI governance
**Team**: "NovaMind" (admin role)

Victor doesn't use AI daily for his own work. His job is to ensure the team uses AI safely. He manages model allowlists, tool permissions, audit trails, and data policies. He needs visibility without being a bottleneck.

### Story 14.1: Model and Tool Governance

Victor configures the model allowlist — only approved models are available to the team. He enables web search but disables code execution. He sets token budgets so no single user can burn through the monthly AI spend.

### Story 14.2: Skill Approval Workflow

A team member requests a new skill (e.g., a Slack integration). Victor reviews it in the admin panel — what data it accesses, what actions it can take. He approves it with version pinning so it won't auto-update without review.

### Story 14.3: Audit and Compliance

Victor reviews the audit trail weekly: which users accessed what data, which tools the AI invoked, which external services were called. He exports the audit log for compliance reporting. He can see exactly what the AI did and when, for every team member.

---

## Persona 15: The Customer Support Lead

**Clara Jimenez** — Support team lead, 4-person team
**Team**: "Support" (5 members)

Clara's team handles customer issues across email, chat, and phone. They need AI to help with ticket triage, knowledge base search, and response drafting. Accuracy is critical — they can't send hallucinated information to customers.

### Story 15.1: Library as Knowledge Base

When a support ticket comes in, the agent searches the Library for past answers to similar questions. The Library's engagement scoring surfaces the most-cited and most-interrogated answers first — battle-tested responses, not random matches.

### Story 15.2: Channel-Unified Inbox

Customer messages arrive from Telegram, email, and WhatsApp. All inbound messages become Tez in a unified inbox. The support agent sees everything in one stream, replies from one place, and the response routes back to the original channel.

### Story 15.3: AI-Assisted Response Drafting

Clara asks the PA to draft a response to a complex technical question, grounded in Library context. The PA produces a draft with citations. Clara reviews, edits if needed, and sends. The citations ensure the response is traceable to verified information.

---

## Persona 16: The Non-Technical Executive

**Richard Tanaka** — CFO, rarely touches settings
**Team**: "NovaMind" (member role)

Richard wants AI to "just work." He won't configure models, learn prompt engineering, or navigate admin panels. He uses voice for everything — dictating questions, receiving briefings, delegating follow-ups. If it takes more than 2 taps, he won't use it.

### Story 16.1: Voice-Only Morning Briefing

Richard opens the app and taps the voice button: "What do I need to know today?" His PA pulls from the team stream, his calendar, and pending tezits. The response comes as TTS audio — he listens while driving. Zero reading required.

### Story 16.2: Delegation by Voice

"Tell Priya I need the Q1 numbers by Thursday. And ask Marcus about the board deck timeline." Two tezits created, routed to the right people, with deadlines attached. Richard never typed a word.

### Story 16.3: Decision Support

Richard asks: "Should we approve the new office lease? What are the financial implications?" The PA searches the Library for prior context on the lease discussion, does web research on market rates, and produces a decision brief. Richard interrogates it with follow-up questions — all via voice.

---

## Persona 17: The External Collaborator

**Sam Chen** — Client/partner with no account
**Team**: None (guest access only)

Sam receives share links and mirror summaries from people who use the platform. Sam has no account and doesn't want one. They need frictionless access to shared context with clear scope boundaries.

### Story 17.1: Interrogating a Shared Tez

Sam receives a Mirror link from Kai (Prism Studio). The link opens a read-only view of the shared summary. Sam taps "Ask about this" and uses TIP (Tez Interrogation Protocol) to ask questions — answered strictly from the transmitted context, using the sender's AI resources.

### Story 17.2: Scoped Access with Expiry

The share token Kai created has limits: 10 interrogations, expires in 7 days, read-only. Sam can ask questions within those bounds. After the token expires or the limit is reached, access ends. No account created, no data retained on Sam's side.

### Story 17.3: No Signup Required

Sam never registers. They never provide an email. The share token is the only credential. This is deliberate — external collaborators should be able to consume shared context without entering the trust boundary of the platform.

---

## How the Pieces Fit Together

```
User's Phone/Browser
    │
    ├── app.mypa.chat (Unified PWA)
    │     ├── TezStream (card feed)
    │     ├── VoiceRecorder (compose)
    │     ├── TezExpanded (detail + respond)
    │     ├── PAChat (AI assistant via OpenClaw)
    │     ├── LibrarySearch (context search)
    │     ├── TeamSwitcher (multi-team)
    │     └── MirrorSheet (external sharing)
    │
    ├── api.mypa.chat (Backend API)
    │     ├── Cards CRUD + Status Machine
    │     ├── Smart Routing (classify)
    │     ├── Library of Context
    │     ├── Tez Protocol (interrogate, fork, export)
    │     ├── PA Context + Briefing (pure data)
    │     ├── Team Management (multi-team)
    │     └── Notifications (ntfy.sh push)
    │
    ├── OpenClaw Gateway (AI Runtime)
    │     ├── Chat + voice + TTS
    │     ├── Memory + web search
    │     ├── SKILL.md (knows how to use MyPA API)
    │     └── Tool execution (calls API on user's behalf)
    │
    └── PA Workspace (PA Identity Module)
          ├── Google Admin SDK (provision PA accounts)
          ├── Gmail API (PA inbox, send email)
          ├── Calendar API (timesheet + shared calendars)
          ├── Tez Transport (email-based protocol)
          ├── Google Voice (SMS notifications)
          └── Action Logger (color-coded audit trail)
```

Every user interaction flows through this stack. The user talks to their PA (OpenClaw), the PA reads from MyPA (data), the PA uses its Workspace account (email, calendar) to take action in the real world, and everything is logged and searchable forever.

---

## Key Principles Demonstrated

1. **Cards, not threads** — Every item is a discrete, actionable tez. No infinite scroll.
2. **AI routes, humans decide** — The classify endpoint suggests; the user confirms (or auto-sends in trusted contexts).
3. **Context never dies** — Voice transcriptions, email bodies, response chains — all preserved in the Library of Context.
4. **Trust but verify** — Tez Interrogation Protocol ensures AI answers are grounded in transmitted context, with citations.
5. **"Hire a PA" trust model** — Users control what they share with their PA (calendar sharing, email forwarding). The PA operates in its own sandbox.
6. **Every PA action is logged** — Calendar timesheet, email logs, action history. Full transparency.
7. **Cross-company via email** — Tez Protocol rides on standard email infrastructure. No proprietary federation needed.
8. **Voice-first, text-always** — Compose by voice or keyboard. Original form preserved either way.

---

## OpenClaw Usage Patterns (Observed) And MyPA Fit

This section is a reality-check: what people use OpenClaw for today, and how MyPA should expose it with fewer clicks and clearer UX.

### Pattern A: Chat-First Everything (Low Clicks, High Cognitive Load)

OpenClaw excels at "ask anything" via chat. But for teams, chat alone has weaknesses:
- No canonical record: decisions get lost in personal session history
- No shared context boundaries: you paste content manually, or you leak too much
- No durable team stream with status + responses + audit trail

**MyPA fit:** make it easy to turn "chat output" into a published Tez:
- one-tap "Publish to Stream"
- one-tap "Publish to Team"
- one-tap "Attach citations/context"

### Pattern B: Memory As A Superpower

OpenClaw has real memory. People use it for:
- personal preferences and tone
- recurring project context ("how we deploy")
- "always do it this way" conventions

**MyPA fit:** treat MyPA as the team-readable projection of that memory:
- "Team Norms" Tez that the agent keeps updated
- "Onboarding" Tez for new members
- "Working agreements" that are interrogatable, not buried in Notion

### Pattern C: Web Tools For Research

People use OpenClaw's web tooling to:
- search quickly
- fetch sources
- summarize with citations

**MyPA fit:** default behavior should be:
1. research happens in OpenClaw
2. output is saved into MyPA as a research Tez
3. sources are preserved as context

### Pattern D: Multi-Agent Routing

OpenClaw can split work across multiple specialized agents. This matters for teams because it compresses time-to-answer.

**MyPA fit:** make multi-agent work visible and shareable:
- show which agent contributed what in context entries
- allow a team to "subscribe" to outputs (so results land in Stream)

### Pattern E: Canvas / A2UI Surfaces

OpenClaw Canvas exists so skills can ship real UIs. MyPA should behave like a first-class Canvas surface:
- installable PWA UX for humans
- a Canvas-friendly mode for OpenClaw-native clients

**MyPA fit:** keep the UI opinionated (Stream/AI/Library) but let OpenClaw handle the agent runtime.

### Pattern F: Teams In OpenClaw (Where MyPA Helps Most)

OpenClaw can be used by teams (multi-agent routing, group integrations, etc.), but teams still need:
- a shared stream
- durable context storage
- a protocol for transporting context between trust zones

MyPA is that missing layer.

### Pattern G: Broadcast Groups (Many Humans, Many Agents)

OpenClaw supports "broadcast group" style interactions (multiple agents responding in the same group conversation). This is a powerful team pattern:
- a "Research" agent answers with sources
- a "Planner" agent turns it into tasks
- a "Writer" agent drafts the team update

**The problem:** group chat is not a durable knowledge base. It's fast, but it dissolves.

**MyPA fit:** make MyPA the sink for anything important:
- the group chat can be the workshop
- MyPA is where outcomes get published as tezits
- Mirror links are the safe external boundary

---

## Click / Tap Audit (MyPA vs OpenClaw)

Click counts are not the full story (chat systems can have "1 click" while still being slow due to typing and ambiguity), but they help us find obvious friction.

Assumptions:
- Both apps are already open and authenticated.
- A "tap" is a deliberate UI interaction (not typing).
- Voice dictation counts as 1 tap to start (compose/voice).

Also track the invisible metric:
- **Cognitive clicks**: how many times the user has to think "what do I do next?"

OpenClaw tends to minimize taps but can increase cognitive clicks because the user must know what to ask, how to phrase it, and what the agent is capable of. MyPA should reduce cognitive clicks by making the next action obvious and safe.

| Task | OpenClaw (chat-only) taps | MyPA taps | Notes / Opportunities |
|---|---:|---:|---|
| Create a personal note ("remind me...") | 1 (focus input) + 1 (send) | 1 (compose) + 1 (send) | Similar. MyPA wins on discoverability + automatic Library preservation. |
| Send a DM to a teammate | 1 + 1 | 1 + 1 (auto-send) or 1 + 1 + 1 (confirm) | When classifier confidence < threshold, confirm adds 1 tap. We can reduce by showing confidence + recipient inline before sending. |
| Broadcast to team | 1 + 1 | 1 + 1 | MyPA routing makes this safer (less "who should see this?" uncertainty). |
| Ask "what should I focus on today?" | 1 + 1 | 1 (AI tab) + 1 (voice) | MyPA adds a tab tap, but can pre-load MyPA context automatically. |
| Ask a question about a specific Tez | (usually requires paste or tool call) | 1 (open Tez) + 1 (Ask) | MyPA is materially better because the Tez context is native. |
| Search for old context ("lease") | 1 (chat query) + 1 (send) | 1 (Library tab) + 1 (tap result) | MyPA is faster when you want browseable results. |
| Publish a research result to team | 1 + 1 (send) + extra manual copy/paste | 1 (Publish/create team Tez) | We should add a first-class "Publish to Tez" affordance inside AI tab to remove copy/paste entirely. |
| Create a counter-argument (fork) | manual | 1 (Fork) + 1 (send) | MyPA makes dialectic collaboration explicit. |
| Share externally (stakeholder safe) | manual | 1 (Mirror) + 1 (share) | MyPA provides a safer default boundary. |
| Switch teams | (not native) | 1 (team switcher) + 1 (select team) | MyPA has a first-class team model. OpenClaw teams are typically "social", not data-scoped. |
| Mark a Tez as acknowledged/completed | (chat instruction) | 1 (open Tez) + 1 (action) | Add inline swipe actions to make this 1 tap from Stream. |
| Ask AI from Stream without losing your place | 1 (chat) + 1 (send) | 1 (open Tez) + 1 (Ask) | Reduce to 1 tap with "Ask" on the row, plus a bottom-sheet AI overlay. |
| Start voice conversation with the assistant | 1 (mic) | 1 (AI tab) + 1 (voice) | Add a global "hold to talk" so this is always 1 tap. |

Key takeaway:
- OpenClaw can do almost everything with "2 taps" because it's chat-first.
- MyPA must win by removing ambiguity and making the "right next action" obvious, especially for teams.

### Click Budget Targets (Launch Heuristics)

If we accept that OpenClaw is the engine, MyPA's job is to reduce "navigation + uncertainty" to near-zero.

Targets to hold ourselves to:
- Create a Tez (voice or text): <= 2 taps
- Send a DM (high confidence): <= 2 taps
- Send a DM (needs confirmation): <= 3 taps, with a clear "why" (confidence and recipient preview)
- Ask AI about a Tez: <= 2 taps from Stream (goal: 1 tap with an overlay)
- Publish an AI answer to the team stream: <= 1 tap
- Find a past Tez via Library: <= 2 taps + typing
- Mirror and share externally: <= 2 taps
- Switch teams: <= 2 taps, with clear indication of active team in every surface

When a flow violates the budget, we either:
1) add a dedicated affordance (button/gesture), or
2) change the default surface (show proactive context so the user doesn't need the flow).

---

## UX Backlog: Reduce Clicks And Increase OpenClaw Discoverability

Ideas that directly address the parity problem (people should feel like MyPA contains OpenClaw, not the other way around):

1. **Global "Hold to Talk" button** (available on Stream + Library)
   - In OpenClaw mode, start talk mode immediately
   - Auto-route transcript based on intent: ask AI vs create Tez

2. **One-tap "Ask AI" from Stream items**
   - Skip open -> ask; allow "Ask" directly on list rows

3. **AI tab quick actions**
   - Buttons: Web, Memory, Code, Publish
   - Each button sends a structured prompt and/or toggles a mode

4. **One-tap "Publish to Team" from AI responses**
   - Turn an assistant answer into a team Tez with context attached

5. **Team AI**
   - A shared "team agent session" surfaced in the AI tab (opt-in)
   - Useful for planning and decision-making without every person re-prompting

6. **Explicit capability affordances**
   - The UI should visibly communicate: "This assistant can web search, remember, run code"
   - Today, those are invisible unless the user already knows OpenClaw

7. **Skill governance (team security + UX)**
   - A team should be able to see what skills are enabled
   - Only allow an approved list by default
   - Version pinning / audit for skill updates

---

## Team Parity Scorecard (What We Must Make Obvious)

This is the "does it feel like OpenClaw?" checklist, from a team user's perspective. The goal is not to clone OpenClaw, but to make OpenClaw's power discoverable inside MyPA.

- Web research is available (and cited) without the user knowing tool names
- Memory exists and is used ("you already know this about me/us")
- Multi-agent work is visible (who/what produced the output)
- Outputs can be published to the team stream in 1 tap
- Sharing has safe defaults (Mirror vs full context)
- Teams can govern skills (what is enabled, what data is touched)
- Sessions are understandable (where did this assistant state come from?)

If we don't make these obvious, people will say "MyPA is a worse OpenClaw" even if the agent underneath is fully capable.

Non-goal: we should not rebuild OpenClaw's Control UI inside MyPA. But we should provide clear in-app navigation and deep-links so a team can manage sessions/skills without hunting for a separate admin surface. This should be true on day one.

---

## Side-By-Side Journeys (OpenClaw Alone vs MyPA + OpenClaw)

These are the journeys where MyPA should feel materially better for teams, even if raw "tap count" looks similar.

### Journey 1: "We Need A Decision By 3pm"

Scenario: a product lead needs the team to decide whether to ship Feature A or delay it.

**OpenClaw alone (chat-first):**
1. Ask the assistant to analyze tradeoffs (fast)
2. Copy/paste the assistant output into wherever the team talks (Slack, email, WhatsApp)
3. People respond in threads with partial context
4. The final decision exists as "whatever message someone pinned"
5. Two weeks later: someone asks "why did we choose this?" and you reconstruct from scrollback

Taps are low. The failure mode is that the decision and its context are not a durable object.

**MyPA + OpenClaw (publish-first):**
1. Create a team tez: "Decision: ship A vs delay"
2. Tap **Ask about this** and have OpenClaw generate a decision brief grounded in the current project context
3. Team responds to the tez (same place, same object)
4. If disagreement: fork a counter-Tez and keep both arguments linked
5. When the decision is made: update the tez summary and mirror a stakeholder-safe version

The win is not taps. The win is that the decision is now a queryable unit with an attached iceberg.

### Journey 2: "Research That Shouldn't Be Re-Done"

Scenario: someone does a 45-minute research sprint and the team needs the result to stay available.

**OpenClaw alone:**
1. Research in chat
2. Paste a summary into a doc or message
3. Sources and nuance live in a personal session history

**MyPA + OpenClaw:**
1. Research in OpenClaw (web search + fetch)
2. Publish as a "Research Tez" with citations stored as context entries
3. The team interrogates it asynchronously instead of asking the researcher to repeat themselves
4. The Library makes it retrievable months later

### Journey 3: "Team Delegation With Accountability"

Scenario: a manager needs to hand off 3 threads of work and avoid coordination thrash.

**OpenClaw alone:**
1. Ask the assistant to draft assignments
2. Send them out in messages
3. Track progress manually across chats

**MyPA + OpenClaw:**
1. Ask OpenClaw to split the work into three tezits
2. Publish the three tezits to the team with explicit recipients
3. Responses (acknowledge / reply / complete) happen on the same object
4. Follow-ups are triggered by "pending/active/resolved" state, not by memory

If we can make this feel effortless, MyPA becomes the team's "assistantified" operating system.

---

## References (OpenClaw)

Useful starting points for product parity and UX design:
- Memory: OpenClaw documentation on how agents store and use memory
- Web tools: OpenClaw documentation on search/fetch
- Multi-agent routing: OpenClaw documentation on dispatching tasks to multiple agents
- Broadcast groups: OpenClaw documentation on group/team interaction patterns
- Canvas/A2UI: OpenClaw documentation on UI surfaces
- Control UI: OpenClaw documentation for managing sessions/skills
- OpenAI-compatible HTTP API: OpenClaw Gateway docs (useful for PWA + proxy setups)

Concrete URLs (for convenience):
```text
https://docs.openclaw.ai/concepts/memory
https://docs.openclaw.ai/tools/web
https://docs.openclaw.ai/concepts/multi-agent
https://docs.openclaw.ai/broadcast-groups
https://docs.openclaw.ai/mac/canvas
https://docs.openclaw.ai/a2ui
https://docs.openclaw.ai/control-ui
https://docs.openclaw.ai/gateway/openai-http-api
https://docs.openclaw.ai/gateway/security
https://docs.openclaw.ai/gateway/configuration
https://docs.openclaw.ai/web/webchat
https://docs.openclaw.ai/tools/skills
https://docs.openclaw.ai/tools/clawhub
```

Additional reference pages that matter for UX parity:
```text
https://docs.openclaw.ai/gateway/openai-http-api (PWA proxy integration)
https://docs.openclaw.ai/gateway/security (auth, default-off OpenAI API, pairing model)
https://docs.openclaw.ai/control-ui (sessions, skills, logs)
```

What we should extract from these docs (for MyPA UX):
- Which OpenClaw capabilities users expect to be "just there" (web, memory, tools, sessions)
- Which controls exist in OpenClaw UI today that we should surface or deep-link to (skills, sessions, logs)
