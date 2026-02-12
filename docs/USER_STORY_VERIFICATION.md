# User Story Verification

Living document tracking persona-based user story verification against the MyPA.chat system.
Last updated: 2026-02-10

## Personas

| # | Persona | Description |
|---|---------|-------------|
| 1 | Solo Founder (Sarah) | First-time user, discovers MyPA from landing page, sets up for her startup |
| 2 | Invited Team Member (Marcus) | Joins via invite link Sarah sends over email/Slack |
| 3 | Active Daily User (Priya) | Uses MyPA daily for communication and context management |
| 4 | Team Admin (David) | Manages team settings, invites, and channel configuration |
| 5 | Cross-Team Communicator (Elena) | Shares context with people outside her team |
| 6 | Power User via OpenClaw (Rob) | Interacts entirely through the PA via OpenClaw Gateway chat |
| 7 | Guest Recipient (Taylor) | External user who receives a shared Tez link |
| 8 | CEO / Exec (Marcus) | Needs strict privacy-by-default with explicit sharing to team |
| 9 | Engineer (Eve) | Drafts code privately, shares intentionally with context |

---

## Workflows

### 1. Sign Up & Create Team (Sarah)
**Flow:** Landing → Register → Onboarding → Create Team → Main UI

| Step | Component | Status |
|------|-----------|--------|
| Landing CTA → Canvas | landing/index.html → app.mypa.chat | PASS |
| Register toggle | LoginScreen.tsx | PASS |
| Backend creates user | POST /api/auth/register | PASS |
| Relay contact auto-register | auth.ts fire-and-forget + useAuth belt-and-suspenders | PASS |
| Onboarding wizard | OnboardingScreen.tsx (welcome → team → done) | PASS |
| Team synced to backend | userSettings.registerTeam() | PASS |

**Result: PASS**

---

### 2. Send First Tez to Self (Sarah)
**Flow:** Open Chat → Compose → classify as "self" → Tez in Library

| Step | Component | Status |
|------|-----------|--------|
| Compose in MessageThread | MessageThread.tsx | PASS |
| Classify intent | POST /api/cards/classify | PASS |
| Create personal Tez | POST /api/cards/personal | PASS |
| Searchable in Library | FTS5 via /api/library/search | PASS |

**Result: PASS**

---

### 3. Join via Invite Link (Marcus)
**Flow:** Click ?invite=CODE → LoginScreen → Validate → Register → Skip team → Main UI

| Step | Component | Status |
|------|-----------|--------|
| Parse ?invite= from URL | LoginScreen.tsx | PASS |
| Validate invite code | teamInvitesApi.validate() | PASS |
| Show invite banner | LoginScreen.tsx (team name + banner) | PASS |
| Register with inviteCode | POST /api/auth/register { inviteCode } | PASS |
| Skip team creation step | OnboardingScreen checks teamsApi.list() | PASS |
| Onboarding record idempotent | acceptInvite() upsert (not duplicate insert) | PASS |

**Result: PASS**

---

### 4. Receive Tez from Teammate (Marcus)
**Flow:** Sarah sends team Tez → Marcus sees in feed + SSE notification

| Step | Component | Status |
|------|-----------|--------|
| Sarah composes team message | POST /tez/share with recipients | PASS |
| SSE emits to recipients | eventBus new_tez + unread_update | PASS |
| SSE emits to ALL team members when visibility=team | tez.ts team member broadcast | PASS |
| Canvas EventSource triggers refetch | useComms.ts SSE handlers | PASS |
| Unread badge updates | GET /unread | PASS |

**Result: PASS**

---

### 5. Search Library of Context (Priya)
**Flow:** Type query → FTS5 results → View full Tez

| Step | Component | Status |
|------|-----------|--------|
| Library search UI | LibraryPanel.tsx | PASS |
| FTS5 full-text search | GET /api/library/search | PASS |
| Engagement scoring | Backend FTS5 with scoring | PASS |
| SKILL.md path correct | /api/library/search (not /api/cards/library/search) | PASS |

**Result: PASS**

---

### 6. Thread Reply on Tez (Priya)
**Flow:** View Tez → Reply → Thread appears for all participants

| Step | Component | Status |
|------|-----------|--------|
| Reply button on TezBubble | TezBubble.tsx onReply | PASS |
| Send reply | POST /tez/:id/reply | PASS |
| SSE notifies parent sender + recipients | tez.ts reply SSE emission | PASS |

**Result: PASS**

---

### 7. Send DM to Contact (Priya)
**Flow:** Search contacts → Start conversation → Send message

| Step | Component | Status |
|------|-----------|--------|
| Search contacts | GET /contacts/search | PASS |
| Create DM conversation | POST /conversations | PASS |
| Send message | POST /conversations/:id/messages | PASS |
| SSE notification | new_message event | PASS |

**Result: PASS**

---

### 8. Manage Team Invites (David)
**Flow:** Settings → Team → Generate/Copy/Revoke invite codes

| Step | Component | Status |
|------|-----------|--------|
| Generate invite code | teamInvitesApi.create() | PASS |
| Copy invite link (?invite=CODE format) | SettingsPage.tsx copyInviteLink() | PASS |
| List active invites | teamInvitesApi.list() | PASS |
| Revoke invite | teamInvitesApi.revoke() | PASS |

**Result: PASS**

---

### 9. Configure Channel Connections (David)
**Flow:** Settings → Channels → Connect provider → Test → Save

| Step | Component | Status |
|------|-----------|--------|
| Channel management UI | SettingsPage.tsx channels section | PASS |
| List providers | channels.providers() | PASS |
| Connect flow | channels.connectStart() | PASS |
| Test provider | channels.testProvider() | PASS |
| Schema deployed | channelProviderConfig + userChannelLink | PASS |

**Result: PASS** (UI + schema ready; actual provider integrations are MVP-future)

---

### 10. Share Tez via TIP Link (Elena)
**Flow:** Create Tez → Generate share token → Send link → Recipient interrogates

| Step | Component | Status |
|------|-----------|--------|
| Generate share token | POST /api/tez/:id/share | PASS |
| Public TIP endpoint | GET /api/tez/public/:cardId | PASS |
| Guest interrogation | POST /api/tez/public/:cardId/interrogate | PASS |
| Scoped context (surface/full/selected) | share token contextScope field | PASS |
| Token revocation | DELETE /api/tez/:cardId/share/:tokenId | PASS |

**Result: PASS**

---

### 11. Interrogate a Received Tez In-Canvas (Elena)
**Flow:** View Tez context → Ask question → Get cited answer

| Step | Component | Status |
|------|-----------|--------|
| View context (iceberg) | ContextViewer.tsx | PASS |
| Ask TIP question | ContextViewer.tsx interrogation panel | PASS |
| Backend TIP endpoint | POST /api/tez/:cardId/interrogate | PASS |
| Cited answers with grounding | tezInterrogation.ts | PASS |

**Result: PASS**

---

### 12. Full PA Interaction via OpenClaw (Rob)
**Flow:** oc.mypa.chat → Chat with PA → PA uses SKILL.md → Results in chat

| Step | Component | Status |
|------|-----------|--------|
| Gateway dashboard | oc.mypa.chat (basic-auth locked) | PASS |
| SKILL.md tools | Library, Tez, TIP, contacts, teams | PASS |
| PA sends Tez on behalf | SKILL.md instructions | PASS |
| Library search path correct | /api/library/search in SKILL.md | PASS |
| CRM status check | GET /api/crm/status | PASS |

**Result: PASS**

---

### 13. Password Reset (Priya)
**Flow:** Login screen → Forgot password → Enter email → Receive link → Reset password → Sign in

| Step | Component | Status |
|------|-----------|--------|
| "Forgot password?" link on login | LoginScreen.tsx switchMode('forgot') | PASS |
| Submit email | POST /api/auth/forgot-password | PASS |
| Email enumeration prevention | Always returns 200 regardless of email match | PASS |
| JWT-based reset token (1hr expiry) | generatePasswordResetToken() in jwt.ts | PASS |
| Reset URL via ?reset=TOKEN | LoginScreen.tsx parses ?reset= on mount | PASS |
| Set new password | POST /api/auth/reset-password | PASS |
| All sessions revoked on reset | revokeAllUserTokens() called | PASS |
| Reset email sent (when PA Workspace configured) | Sends via PA Workspace /api/email/send | PASS |

**Result: PASS**

---

### 14. Team Broadcast via Comms (Sarah)
**Flow:** Select team → Set visibility to "team" → Send → All members receive

| Step | Component | Status |
|------|-----------|--------|
| Team selected in Comms sidebar | CommsPanel.tsx team list | PASS |
| Scope picker shows "Just me" / "Whole team" | MessageThread.tsx scope selector | PASS |
| Visibility passed to relay | useComms.ts tezApi.share({ visibility }) | PASS |
| Relay broadcasts to all team members | tez.ts SSE to all team_members | PASS |
| Backend cards/team shareToTeam flag | POST /api/cards/team { shareToTeam: true } | PASS |

**Result: PASS**

---

### 15. Send Tez via Email Transport (Rob)
**Flow:** PA identifies email-preferred contact → sends Tez as rich email with bundle

| Step | Component | Status |
|------|-----------|--------|
| Tez-transport proxy in backend | POST /api/tez-transport/send | PASS |
| SKILL.md documents $MYPA_API_URL path | $MYPA_API_URL/api/tez-transport/send | PASS |
| Proxy forwards to PA Workspace | tezTransport.ts → PA_WORKSPACE_API_URL | PASS |
| PA Workspace composes email | tez-transport.ts composeTezEmail() | PASS |
| X-Tezit-Protocol header + .tez.json attachment | tezEmail.ts | PASS |
| nginx routes /api/tez-transport/ to backend | openclaw-gateway.conf | PASS |

**Result: PASS**

---

### 16. Public Discovery (Taylor)
**Flow:** Browse trending tezits → View platform stats → View user profile

| Step | Component | Status |
|------|-----------|--------|
| Trending tezits (public only) | GET /api/discover/trending | PASS |
| Privacy: only visibility=public cards | discover.ts WHERE visibility='public' | PASS |
| Platform stats | GET /api/discover/stats | PASS |
| User profile (public cards only) | GET /api/discover/profile/:userId | PASS |
| Rate-limited (30 req/min per IP) | publicRateLimit middleware | PASS |
| nginx routes /api/discover/ to backend | openclaw-gateway.conf | PASS |

**Result: PASS**

---

### 17. CRM + Tez Workflow (Rob)
**Flow:** Check CRM status → Pull entity → Build Tez context → Share with team

| Step | Component | Status |
|------|-----------|--------|
| CRM status check | GET /api/crm/status | PASS |
| List CRM entities | GET /api/crm/people, /opportunities, /tasks | PASS |
| Build Tez context from CRM | POST /api/crm/tez-context | PASS |
| Cross-system coordination | POST /api/crm/workflows/coordinate | PASS |
| PA Workspace bridge (when configured) | PA_WORKSPACE_API_URL env var | PASS |

**Result: PASS** (requires TWENTY_API_URL + TWENTY_API_KEY to be configured)

---

### 18. Guest Interrogates Shared Tez (Taylor)
**Flow:** Click share link → View Tez surface → Ask TIP questions → Get cited answers

| Step | Component | Status |
|------|-----------|--------|
| Receive share URL with token | /tez/:cardId?token=... | PASS |
| Token validation + scope enforcement | tezShareToken.ts | PASS |
| Read public card details | GET /api/tez/public/:cardId | PASS |
| Ask question within scope | POST /api/tez/public/:cardId/interrogate | PASS |
| Max interrogation limit enforced | share token maxInterrogations field | PASS |
| Convert to full account | POST /api/auth/register (from share page) | PASS |

**Result: PASS**

---

### 19. Invite-Based PA Provisioning (David)
**Flow:** Send PA invite → Invitee accepts → Password set → PA auto-provisioned

| Step | Component | Status |
|------|-----------|--------|
| Admin sends invite | POST /api/invites/send | PASS |
| Invite email payload correct | { paEmail, to, subject, body } | PASS |
| Validate invite token | GET /api/invites/:token | PASS |
| Accept invite + set password | POST /api/invites/:token/accept | PASS |
| No hardcoded team UUID fallback | user.teamId or DEFAULT_TEAM_ID env | PASS |
| PA auto-provision (when PA Workspace up) | POST PA_WORKSPACE_API_URL/api/identity/provision | PASS |

**Result: PASS** (requires PA Workspace to be fully configured for auto-provisioning)

---

### 20. Mirror External Share (Elena)
**Flow:** View Tez → Generate mirror → Share via SMS/email → Audit logged

| Step | Component | Status |
|------|-----------|--------|
| Render mirror preview | POST /api/tez/:cardId/mirror | PASS |
| Template options (teaser/surface/surface_facts) | mirror templates | PASS |
| Log share to audit | POST /api/tez/:cardId/mirror/send | PASS |
| Mirror is lossy (no full context) | By design — context stays in app | PASS |

**Result: PASS**

---

### 21. CEO Secrets Stay Private By Default (Marcus)
**Flow:** AI chat stays private; team comms default to private; explicit sharing is intentional

| Step | Component | Status |
|------|-----------|--------|
| AI sessions are per-user on shared browsers | chatStorage.ts namespaces IndexedDB by userId | PASS |
| AI requests pinned to per-user agent+session | backend OpenClaw proxy overrides routing keys | PASS |
| Team sends default to private | MessageThread defaults to "Just me" | PASS |
| Team stream only shows authored or team-visible | relay /tez/stream filters by visibility/sender | PASS |

**Result: PASS**

---

### 22. Operator-Only OpenClaw Dashboard/Settings (Operator)
**Flow:** oc.mypa.chat is protected; end users use app.mypa.chat without seeing control plane

| Step | Component | Status |
|------|-----------|--------|
| oc requires operator credentials | nginx basic-auth on oc.mypa.chat | PASS |
| End-user AI chat works without gateway token | backend /api/openclaw proxy (token server-side) | PASS |
| End-user comms works | Canvas Comms tab → relay API | PASS |

**Result: PASS**

---

### 23. DM Isolation (Priya)
**Flow:** DM messages are readable only by conversation members (and sender)

| Step | Component | Status |
|------|-----------|--------|
| Create DM conversation | POST /conversations (dm) | PASS |
| Send message | POST /conversations/:id/messages | PASS |
| Outsiders blocked from reading by ID | GET /tez/:id enforced by assertTezAccess() | PASS |

**Result: PASS**

---

### 24. Member Connects Telegram End-To-End (Priya)
**Flow:** Settings → Channels → Connect Telegram → inbound/outbound works

| Step | Component | Status |
|------|-----------|--------|
| Self-serve Channels UI exists | SettingsPage.tsx channels section | PASS |
| Connection lifecycle tables exist | channelProviderConfig + userChannelLink | PASS |
| Provider-specific connect URL | /channels/me/:provider/connect/start returns connectUrl | PARTIAL |
| Provider webhook binds to correct user | /channels/webhooks/:provider | PARTIAL |
| Outbound routing uses user link | channel routing + delivery rules | PARTIAL |

**Result: PARTIAL** (contract + scaffolding are there; provider implementations remain)

---

### 25. Engineer Drafts Code Privately, Shares Intentionally (Eve)
**Flow:** Draft code in AI tab, then share excerpt/context to team as a Tez

| Step | Component | Status |
|------|-----------|--------|
| Draft in AI tab (private) | AIChatPanel + OpenClaw proxy | PASS |
| Attach code/context iceberg | MessageThread context layers | PASS |
| Broadcast intentionally | Scope picker → "Whole team" | PASS |
| AI writes to repo / runs tests | OpenClaw tools / code workspace | NOT YET |

**Result: PARTIAL**

---

### 26. Multiple Team Members Use Shared CRM (David)
**Flow:** Team sees the same Twenty CRM dataset as a shared resource

| Step | Component | Status |
|------|-----------|--------|
| CRM status + endpoints available when configured | GET /api/crm/status + /api/crm/* | PASS |
| Team members read/write same CRM | Single team-level Twenty config | PASS |
| Per-role permission gating | crm_access permissions | FUTURE |

**Result: PASS** (shared-by-design; permission gating can be added)

---

### 27. Export a Tez Bundle (Priya)
**Flow:** View Tez → Export as portable JSON bundle → Share externally or import elsewhere

| Step | Component | Status |
|------|-----------|--------|
| Export inline markdown | GET /api/tez/:cardId/export | PASS |
| Export portable Level 2 bundle | GET /api/tez/:cardId/export/portable | PASS |
| Export service | tezPortableExport.ts | PASS |
| Canvas UI export button | LibraryPanel.tsx export buttons | PASS |
| Export API client method | api.ts tezProtocol.exportInline/exportPortable | PASS |

**Result: PASS**

---

### 28. Archive a Tez (Priya)
**Flow:** View sent Tez → Archive/soft-delete → Tez hidden from feeds but preserved

| Step | Component | Status |
|------|-----------|--------|
| Schema status field (active/archived/deleted) | relay/src/db/schema.ts tez.status | PASS |
| Audit action types defined | tez.archived, tez.deleted | PASS |
| PATCH endpoint to change status | PATCH /tez/:id (relay/src/routes/tez.ts) | PASS |
| Canvas archive/delete UI | TezBubble.tsx menu | PASS |

**Result: PASS**

---

### 29. Fork a Tez (Elena)
**Flow:** View Tez → Fork as counter/extension/reframe/update → New Tez linked to original

| Step | Component | Status |
|------|-----------|--------|
| Fork endpoint | POST /api/tez/:cardId/fork | PASS |
| Fork types validated | counter, extension, reframe, update | PASS |
| Lineage tree endpoint | GET /api/tez/:cardId/lineage | PASS |
| Schema fields | forkedFromId, forkType on cards | PASS |
| Canvas fork UI | LibraryPanel.tsx fork modal | PASS |
| Fork API client method | api.ts tezProtocol.fork | PASS |

**Result: PASS**

---

### 30. View Full Thread (Priya)
**Flow:** See reply indicator → Click → View full threaded conversation

| Step | Component | Status |
|------|-----------|--------|
| Thread endpoint | GET /tez/:id/thread | PASS |
| Thread API client | tez.thread(id) in api.ts | PASS |
| MessageThread component | MessageThread.tsx renders messages + reply UI | PASS |
| Reply indicators | TezBubble.tsx parentTezId display | PASS |

**Result: PASS**

---

### 31. Edit User Profile (Sarah)
**Flow:** Settings → Profile → Change name → Save

| Step | Component | Status |
|------|-----------|--------|
| Backend PATCH /users/me | users.ts accepts name, avatarUrl | PASS |
| Canvas ProfileSection UI | SettingsPage.tsx name input + save | PASS |
| Avatar URL UI + preview | SettingsPage.tsx avatarUrl | PASS |
| Avatar upload UI | FUTURE | FUTURE |
| Relay contact sync on update | backend PATCH /users/me → relay /contacts/admin/upsert (fire-and-forget) | PASS |

**Result: PARTIAL** (name + avatar URL + relay sync work; avatar upload remains future)

---

### 32. Configure Notification Preferences (David)
**Flow:** Settings → Notifications → Toggle push → Set digest time → Test

| Step | Component | Status |
|------|-----------|--------|
| GET /users/me/notifications | returns prefs + ntfy topic | PASS |
| PATCH /users/me/notifications | update urgentPush, digestTime | PASS |
| POST /users/me/notifications/test | sends test notification | PASS |
| Canvas NotificationsSection UI | SettingsPage.tsx toggle + time + test button | PASS |

**Result: PASS**

---

### 33. Mark Conversation Read / Manage Unreads (Priya)
**Flow:** Select conversation → Auto-marks read → Unread badges update via SSE

| Step | Component | Status |
|------|-----------|--------|
| POST /conversations/:id/read | relay marks lastReadAt | PASS |
| GET /unread | returns team + conversation counts | PASS |
| Auto-mark on selection | useComms.ts markRead on load | PASS |
| Unread badges in sidebar | CommsPanel.tsx badge rendering | PASS |
| SSE-driven unread refresh | unread_update event handler | PASS |

**Result: PASS**

---

### 34. Silent Token Refresh (All Users)
**Flow:** Access token expires → 401 → Auto-refresh → Retry original request seamlessly

| Step | Component | Status |
|------|-----------|--------|
| POST /api/auth/refresh | returns new access + refresh tokens | PASS |
| fetchWithRefresh in api.ts | intercepts 401, refreshes, retries | PASS |
| Promise deduplication | prevents multiple simultaneous refreshes | PASS |
| Failure fallback | clears tokens, reloads page to force re-login | PASS |

**Result: PASS**

---

### 35. Create Group Conversation (David)
**Flow:** New chat → Select multiple contacts → Name the group → Send messages

| Step | Component | Status |
|------|-----------|--------|
| POST /conversations type=group | relay validates 2+ members, requires name | PASS |
| SSE broadcasts to all group members | conversations.ts new_message event | PASS |
| Group display in sidebar | CommsPanel shows group name | PASS |
| NewChatDialog group creation UI | NewChatDialog.tsx | PASS |
| Multi-select contact picker | NewChatDialog.tsx | PASS |

**Result: PASS**

---

### 36. Search Contacts and Start DM (Priya)
**Flow:** Click + New → Search → Select contact → DM conversation created

| Step | Component | Status |
|------|-----------|--------|
| GET /contacts/search | relay search with pagination | PASS |
| NewChatDialog search UI | search input, results, select | PASS |
| Auto-create DM on select | conversations.create({ type: 'dm' }) | PASS |
| New conversation appears in sidebar | CommsPanel refreshes | PASS |

**Result: PASS**

---

## Summary

| # | Workflow | Persona | Result |
|---|---------|---------|--------|
| 1 | Sign Up & Create Team | Solo Founder | PASS |
| 2 | Send First Tez (self) | Solo Founder | PASS |
| 3 | Join via Invite Link | Invited Member | PASS |
| 4 | Receive Tez from teammate | Invited Member | PASS |
| 5 | Search Library | Daily User | PASS |
| 6 | Thread Reply | Daily User | PASS |
| 7 | Send DM | Daily User | PASS |
| 8 | Manage Invites | Admin | PASS |
| 9 | Configure Channels | Admin | PASS |
| 10 | Share via TIP Link | Cross-Team | PASS |
| 11 | Interrogate Tez In-Canvas | Cross-Team | PASS |
| 12 | Full PA via OpenClaw | Power User | PASS |
| 13 | Password Reset | Daily User | PASS |
| 14 | Team Broadcast via Comms | Solo Founder | PASS |
| 15 | Send Tez via Email Transport | Power User | PASS |
| 16 | Public Discovery | Guest | PASS |
| 17 | CRM + Tez Workflow | Power User | PASS |
| 18 | Guest Interrogates Shared Tez | Guest | PASS |
| 19 | Invite-Based PA Provisioning | Admin | PASS |
| 20 | Mirror External Share | Cross-Team | PASS |
| 21 | CEO privacy-by-default | Invited Member | PASS |
| 22 | Operator-only OpenClaw dashboard | Power User | PASS |
| 23 | DM isolation | Daily User | PASS |
| 24 | Member connects Telegram end-to-end | Daily User | PARTIAL |
| 25 | Draft code privately, share intentionally | Daily User | PARTIAL |
| 26 | Team-shared CRM (multi-user) | Admin | PASS |
| 27 | Export Tez bundle | Daily User | PASS |
| 28 | Archive a Tez | Daily User | PASS |
| 29 | Fork a Tez | Cross-Team | PASS |
| 30 | View full thread | Daily User | PASS |
| 31 | Edit user profile | Solo Founder | PARTIAL |
| 32 | Notification preferences | Admin | PASS |
| 33 | Mark read / manage unreads | Daily User | PASS |
| 34 | Silent token refresh | All Users | PASS |
| 35 | Group conversations | Admin | PASS |
| 36 | Search contacts + start DM | Daily User | PASS |

**33 PASS, 3 PARTIAL, 0 NOT YET (36 total)**

---

## Real-World OpenClaw Team Use Cases (37–46)

OpenClaw-inspired backlog stories to pressure-test MyPA.chat in common agentic/team deployments (cron jobs, ClawHub skill installs, browser-based research, and multi-agent coordination).

Reference links:
- OpenClaw repo: https://github.com/openclaw/openclaw
- Cron jobs: https://docs.openclaw.ai/automation/cron-jobs
- Browser: https://docs.openclaw.ai/browsers/openclaw-managed-browser
- ClawHub: https://docs.openclaw.ai/tools/clawhub
- DigitalOcean example deployment: https://www.digitalocean.com/blog/moltbot-on-digitalocean

### 37. Scheduled Daily Briefing via Cron (David)
**Flow:** Admin configures "daily 9am briefing" → OpenClaw cron fires → PA gathers context (cards, unread, CRM) → Delivers briefing to each team member

| Step | Component | Status |
|------|-----------|--------|
| Briefing data endpoint | GET /api/pa/briefing (pa.ts:69-162) | PASS |
| SKILL.md documents briefing | SKILL.md:301-308 | PASS |
| User delivery preferences stored | paPreferences JSON on users table | PASS |
| Contact channel routing for delivery | SKILL.md:459-484 preferredChannel + fallback | PASS |
| Scheduled task infrastructure in backend | No cron, no node-schedule, no job queue | NOT YET (GitHub: #20) |
| Admin UI to configure briefing schedule | No scheduling config UI in Canvas | NOT YET (GitHub: #20) |

**Result: NOT YET** (briefing data + delivery routing ready; no scheduling infrastructure to trigger it automatically)

---

### 38. Voice Interaction with PA (Priya)
**Flow:** Team member speaks → PA transcribes → Responds with TTS → Context preserved in chat

| Step | Component | Status |
|------|-----------|--------|
| Audio upload endpoint | POST /api/audio/upload (audio.ts:24-79) | PASS |
| Canvas voice input (microphone button) | No mic button, no WebRTC, no MediaRecorder | NOT YET (GitHub: #21) |
| Canvas TTS output (speech playback) | No audio element, no ElevenLabs, no Web Speech API | NOT YET (GitHub: #21) |
| OpenClaw proxy supports streaming | openclawProxy.ts SSE streaming | PASS |
| Session context preserved | chatStorage.ts IndexedDB | PASS |

**Result: NOT YET** (backend audio upload exists; Canvas has zero voice input/output components)

---

### 39. Agent Remembers Context Across Sessions (Priya)
**Flow:** User tells PA "I prefer morning meetings" → Weeks later → PA schedules morning meeting without being reminded

| Step | Component | Status |
|------|-----------|--------|
| OpenClaw workspace memory (files) | OpenClaw responsibility — workspace/ files | PASS |
| User preferences persisted in DB | paPreferences JSON column, GET/PATCH /users/me/pa-preferences | PASS |
| PA context endpoint fetches fresh state | GET /api/pa/context returns cards, team, workload | PASS |
| Chat history persists locally | IndexedDB per-user, survives refresh | PASS |
| Chat history persists across devices | Client-side only — no server sync | NOT YET (GitHub: #25) |
| Explicit agent memory API | No /api/users/me/memory endpoint | NOT YET (GitHub: #26) |

**Result: PARTIAL** (preferences + local chat persist; no cross-device sync; no explicit agent memory store accessible from MyPA)

---

### 40. Agent Browses Web for Team Research (Elena)
**Flow:** "Research our competitor's pricing" → PA browses web → Creates Tez with findings as context layers → Team interrogates results

| Step | Component | Status |
|------|-----------|--------|
| OpenClaw has browser tool | OpenClaw built-in CDP browser control | PASS |
| Agent can create Tez from results | POST /api/cards/personal with contextLayers (SKILL.md:189-206) | PASS |
| Context layers support research data | 6 layer types: background, fact, artifact, etc. | PASS |
| SKILL.md documents web research workflow | SKILL.md lines 392+1261 (Web Research Pattern + full section) | PASS |
| Team can interrogate research results | POST /api/tez/:cardId/interrogate | PASS |

**Result: PASS** (SKILL.md fully documents browser → Tez context layer workflow; GitHub #27 closed)

---

### 41. GitHub Integration for Team Code (Eve)
**Flow:** PA monitors team repo → Creates issues from conversation → Opens PRs → Notifies team of CI failures

| Step | Component | Status |
|------|-----------|--------|
| GitHub API integration in backend | No GitHub API client, no OAuth, no repo schema | NOT YET (GitHub: #22) |
| GitHub skills in OpenClaw workspace | No github-integration skill installed | NOT YET (GitHub: #22) |
| SKILL.md documents GitHub operations | No mention of GitHub, repos, PRs, or code | NOT YET (GitHub: #22) |
| CI failure webhook handler | No /api/webhooks/github endpoint | NOT YET (GitHub: #22) |
| Team notification of CI events | SSE exists but no CI event type | NOT YET (GitHub: #22) |

**Result: NOT YET** (zero GitHub integration — neither in backend nor as OpenClaw skill)

---

### 42. Email Triage and Auto-Processing (Priya)
**Flow:** Twice daily → PA scans inbox → Categorizes by urgency → Archives newsletters → Flags action items → Sends summary

| Step | Component | Status |
|------|-----------|--------|
| PA can read inbox | GET /api/email/inbox (pa-workspace email.ts:60-115) | PASS |
| Process unread emails | POST /api/email/process filters is:unread (email.ts:191-325) | PASS |
| Mark emails as read | email.ts:281-289 marks processed as read | PASS |
| Urgency detection/scoring | No urgency logic, no keyword scoring | NOT YET (GitHub: #28) |
| Newsletter detection/archiving | No bulk mail filtering | NOT YET (GitHub: #28) |
| Scheduled trigger (twice daily) | No scheduler in backend | NOT YET (GitHub: #20) |
| Summary delivered as Tez | POST /api/cards/personal available | PASS |

**Result: PARTIAL** (inbox reading + processing pipeline exists; missing scheduling, urgency scoring, and newsletter filtering)

---

### 43. Per-Member Agent Isolation in Team (Marcus)
**Flow:** Team of 3 → Each gets isolated agent workspace → Alice can't see Bob's AI chats → Team conversations are shared

| Step | Component | Status |
|------|-----------|--------|
| Per-user agent ID generation | openclawProxy.ts:27-34 SHA256 hash of agent:{userId} | PASS |
| Unique session keys per user | openclawProxy.ts:36-61 deterministic hash | PASS |
| Isolation headers sent to Gateway | X-OpenClaw-User-Id, Agent-Id, Session-Key, Session-Scope | PASS |
| Private sessions can't leak | Session-Scope: "private" enforced | PASS |
| Team conversations shared | relay tez.visibility=team, shared via /tez/stream | PASS |

**Result: PASS**

---

### 44. Team Discovers and Installs ClawHub Skills (David)
**Flow:** Admin browses ClawHub → Finds useful skill → Installs for team → All members benefit

| Step | Component | Status |
|------|-----------|--------|
| ClawHub browsing API | No skill marketplace endpoint | NOT YET (GitHub: #23) |
| Skill installation endpoint | No /api/skills/install route | NOT YET (GitHub: #23) |
| List installed skills | No /api/skills list route | NOT YET (GitHub: #23) |
| Canvas skill management UI | No skill browsing/install UI | NOT YET (GitHub: #23) |
| SKILL.md is static deployment only | scp to server, no runtime install | NOT YET (GitHub: #23) |

**Result: NOT YET** (SKILL.md deployed statically; no ClawHub integration, no skill management API or UI)

---

### 45. Project Management via PA (David)
**Flow:** "Create a task for fixing the login bug, assign to Eve" → PA creates task → Assigns → Updates status when done

| Step | Component | Status |
|------|-----------|--------|
| Create tasks via PA | POST /api/crm/tasks (Twenty CRM only) | PASS |
| Assign to team member | Task payload supports assignee | PASS |
| Update task status | PATCH /api/crm/tasks/:entityId | PASS |
| Cross-system coordination | POST /api/crm/workflows/coordinate | PASS |
| External project tools (Linear, ClickUp, Notion) | Only Twenty CRM supported | NOT YET (GitHub: #29) |
| Auto-status on completion | No event-driven status update hooks | NOT YET (GitHub: #29) |

**Result: PARTIAL** (CRM task CRUD works via Twenty; no Linear/ClickUp/Notion; no auto-status)

---

### 46. CRM Auto-Enrichment on New Contact (David)
**Flow:** New contact added → PA auto-researches (LinkedIn, web) → Enriches CRM profile → Notifies team

| Step | Component | Status |
|------|-----------|--------|
| CRM contact creation | POST /api/crm/people | PASS |
| Post-create enrichment hook | No event trigger on contact creation | NOT YET (GitHub: #24) |
| PA web research capability | No browser/research integration documented | NOT YET (GitHub: #24, #27) |
| Auto-update CRM with findings | PATCH /api/crm/people/:id exists | PASS |
| Team notification of enrichment | SSE exists but no enrichment event type | NOT YET (GitHub: #24) |

**Result: NOT YET** (CRM CRUD works; no auto-enrichment pipeline, no research trigger, no event hooks)

---

## Updated Summary

| # | Workflow | Persona | Result |
|---|---------|---------|--------|
| 1 | Sign Up & Create Team | Solo Founder | PASS |
| 2 | Send First Tez (self) | Solo Founder | PASS |
| 3 | Join via Invite Link | Invited Member | PASS |
| 4 | Receive Tez from teammate | Invited Member | PASS |
| 5 | Search Library | Daily User | PASS |
| 6 | Thread Reply | Daily User | PASS |
| 7 | Send DM | Daily User | PASS |
| 8 | Manage Invites | Admin | PASS |
| 9 | Configure Channels | Admin | PASS |
| 10 | Share via TIP Link | Cross-Team | PASS |
| 11 | Interrogate Tez In-Canvas | Cross-Team | PASS |
| 12 | Full PA via OpenClaw | Power User | PASS |
| 13 | Password Reset | Daily User | PASS |
| 14 | Team Broadcast via Comms | Solo Founder | PASS |
| 15 | Send Tez via Email Transport | Power User | PASS |
| 16 | Public Discovery | Guest | PASS |
| 17 | CRM + Tez Workflow | Power User | PASS |
| 18 | Guest Interrogates Shared Tez | Guest | PASS |
| 19 | Invite-Based PA Provisioning | Admin | PASS |
| 20 | Mirror External Share | Cross-Team | PASS |
| 21 | CEO privacy-by-default | Invited Member | PASS |
| 22 | Operator-only OpenClaw dashboard | Power User | PASS |
| 23 | DM isolation | Daily User | PASS |
| 24 | Member connects Telegram end-to-end | Daily User | PARTIAL |
| 25 | Draft code privately, share intentionally | Daily User | PARTIAL |
| 26 | Team-shared CRM (multi-user) | Admin | PASS |
| 27 | Export Tez bundle | Daily User | PASS |
| 28 | Archive a Tez | Daily User | PASS |
| 29 | Fork a Tez | Cross-Team | PASS |
| 30 | View full thread | Daily User | PASS |
| 31 | Edit user profile | Solo Founder | PARTIAL |
| 32 | Notification preferences | Admin | PASS |
| 33 | Mark read / manage unreads | Daily User | PASS |
| 34 | Silent token refresh | All Users | PASS |
| 35 | Group conversations | Admin | PASS |
| 36 | Search contacts + start DM | Daily User | PASS |
| **37** | **Scheduled daily briefing (cron)** | **Admin** | **NOT YET** |
| **38** | **Voice interaction with PA** | **Daily User** | **NOT YET** |
| **39** | **Agent memory across sessions** | **Daily User** | **PARTIAL** |
| **40** | **Web research via browser agent** | **Cross-Team** | **PASS** |
| **41** | **GitHub integration for team code** | **Engineer** | **NOT YET** |
| **42** | **Email triage and auto-processing** | **Daily User** | **PARTIAL** |
| **43** | **Per-member agent isolation** | **CEO** | **PASS** |
| **44** | **ClawHub skill discovery + install** | **Admin** | **NOT YET** |
| **45** | **Project management via PA** | **Admin** | **PARTIAL** |
| **46** | **CRM auto-enrichment** | **Admin** | **NOT YET** |

**35 PASS, 6 PARTIAL, 5 NOT YET (46 total)**

---

## Security Audit Fixes (2026-02-10)

Issues found and resolved during workflow verification:

| Issue | Severity | Fix |
|-------|----------|-----|
| discover.ts exposed private/team cards | Critical | Added `visibility='public'` filter to all 3 endpoints + test |
| Onboarding duplicate insert on invite accept | High | Changed acceptInvite() to upsert pattern |
| Invite email payload field mismatch | High | Fixed to match PA Workspace contract (paEmail, to, body) |
| Hardcoded team UUID fallback in invite accept | Low | Replaced with user.teamId or env var, graceful skip |
| SKILL.md wrong library search path | Medium | Fixed /api/cards/library/search → /api/library/search |
| SKILL.md tez-transport uses PA_WORKSPACE_API_URL | Medium | Changed to $MYPA_API_URL (via new backend proxy) |
| /api/discover/ fell through to relay catch-all | Medium | Added nginx route for /api/discover/ → backend :3001 |

---

## Remaining Enhancement Opportunities

### Completed
- ~~**Password reset flow**~~ DONE (2026-02-10)
- ~~**Email verification**~~ DONE (2026-02-10) — JWT verification tokens, Canvas banner, ?verify=TOKEN
- ~~**Admin channel config UI**~~ DONE (2026-02-10) — SettingsPage ChannelProvidersSection
- ~~**Channel provider integrations**~~ CLOSED — OpenClaw channel plugin responsibility

### Open (from internal workflow gaps)
- **Archive/delete Tez** — endpoint done (`PATCH /tez/:id`), needs Canvas UI (GitHub: #13)
- **Export Tez from Canvas** — backend endpoints exist, no UI button (GitHub: #14)
- **Fork Tez from Canvas** — backend fork + lineage endpoints exist, no UI (GitHub: #15)
- **Group conversation creation UI** — backend supports groups, NewChatDialog only creates DMs (GitHub: #16)
- **Profile avatar upload** — relay sync done, needs avatar upload UI (GitHub: #17)
- **Audit trail viewer** — events recorded to DB, no retrieval endpoint or UI (GitHub: #18)

### Open (from real-world OpenClaw team use cases)
- **Scheduled tasks / cron** — no job scheduler in backend; blocks daily briefings, email triage automation (GitHub: #20)
- **Canvas voice UI** — audio upload endpoint exists, no mic input or TTS output in Canvas (GitHub: #21)
- **Cross-device chat sync** — sessions stored in IndexedDB (client-only), lost on device change (GitHub: #25)
- **Explicit per-user agent memory API** — no server-side memory store exposed to PA tools (GitHub: #26)
- ~~**Web research workflow docs**~~ CLOSED — SKILL.md fully documents browser → Tez workflow (GitHub: #27)
- **GitHub integration** — no GitHub API client, skill, OAuth, or webhook handler (GitHub: #22)
- **Email triage automation** — inbox reading works, missing urgency scoring + newsletter filtering (GitHub: #28)
- **ClawHub skill management** — SKILL.md is static deploy; no browsing, install, or management UI (GitHub: #23)
- **External project tools** — only Twenty CRM for tasks; no Linear, ClickUp, Notion integration (GitHub: #29)
- **CRM auto-enrichment** — no post-create hooks, no web research pipeline (GitHub: #24)

---

## Architecture Notes

### Service Endpoints (Production)

| Service | Port | Domain Path |
|---------|------|-------------|
| Backend API | 3001 | oc.mypa.chat/api/auth/, /api/cards/, /api/library/, /api/crm/, /api/tez-transport/, /api/discover/ |
| Tezit Relay | 3002 | oc.mypa.chat/api/* (catch-all, rewrite /api/ prefix) |
| PA Workspace | 3003 | Backend proxies to 127.0.0.1:3003 (not directly exposed) |
| OpenClaw Gateway | 18789 | oc.mypa.chat/ (dashboard + WebSocket) |

### Auth Flow

```
Login/Register → JWT access (15min) + refresh (7 days)
                 ↓
Shared secret across backend, relay, PA workspace
                 ↓
Password reset → JWT reset token (1hr, type=password_reset)
                 → Revokes all refresh tokens on success
```

### Canvas Deployment

```
Canvas build → /var/mypa/openclaw-canvas/ (oc.mypa.chat/__openclaw__/canvas/)
             → /var/mypa/app-canvas/ (app.mypa.chat/)
```
