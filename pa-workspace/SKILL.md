# PA Workspace — OpenClaw Skill

> Give every PA a real digital identity: their own Google Workspace account
> with email, calendar, drive, and phone number.

## What This Skill Does

PA Workspace manages **Google Workspace accounts for PAs**. When an admin sets
up a team, this module provisions a pool of dedicated PA accounts — each PA
gets a real email, calendar, and Google Voice number. The trust model mirrors
hiring a real PA: users control what they share with their PA.

**This skill is complementary to the `gog` skill.** `gog` manages the
*user's own* Google account via per-user OAuth. PA Workspace manages
*PA-owned* accounts via a service account with domain-wide delegation.

## Tezit Protocol Integration

PA Workspace extends the [Tezit Protocol](https://github.com/tezit-protocol/spec)
with **email as a transport mechanism**. Every PA email address is a Tezit Protocol
endpoint. Cross-group communication happens via PA emails carrying Tez bundles.

Tezit emails include:
- `X-Tezit-Protocol: 1.2` header
- Inline Tez markdown in the body
- `.tez.json` attachment (Portable Tez bundle)
- `tez://{id}` deep link

## API Base

```
PA_WORKSPACE_URL (default: http://localhost:3003)
```

All endpoints require JWT Bearer authentication (shared secret with the app backend).

## Available Commands

### Admin Setup

```bash
# Initialize workspace for a team
curl -X POST $PA_WORKSPACE_URL/api/admin/setup \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamId": "team-1", "appApiUrl": "http://localhost:3001"}'

# Configure Google Workspace credentials
curl -X PATCH $PA_WORKSPACE_URL/api/admin/config \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamId": "team-1", "googleDomain": "pa.company.com", "googleServiceAccountJson": "...", "googleAdminEmail": "admin@company.com"}'

# Test connectivity
curl -X POST $PA_WORKSPACE_URL/api/admin/config/test-workspace \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamId": "team-1"}'

# List all PA identities
curl $PA_WORKSPACE_URL/api/admin/identities?teamId=team-1 \
  -H "Authorization: Bearer $TOKEN"

# Batch-provision PA accounts for all team members
curl -X POST $PA_WORKSPACE_URL/api/admin/provision-all \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"teamId": "team-1"}'
# Returns: { data: [{userId, name, paEmail, status}], meta: {total, succeeded, failed, skipped} }

# List Google Workspace domain users (debugging/admin)
curl "$PA_WORKSPACE_URL/api/admin/domain-users?teamId=team-1" \
  -H "Authorization: Bearer $TOKEN"
```

### PA Identity Management

```bash
# Provision a PA account for a user
curl -X POST $PA_WORKSPACE_URL/api/identity/provision \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId": "user-1", "teamId": "team-1", "clientName": "Alice", "clientEmail": "alice@company.com"}'

# Get PA identity
curl $PA_WORKSPACE_URL/api/identity/user-1 \
  -H "Authorization: Bearer $TOKEN"

# Suspend PA (client leaving)
curl -X POST $PA_WORKSPACE_URL/api/identity/user-1/suspend \
  -H "Authorization: Bearer $TOKEN"

# Reactivate a suspended PA
curl -X POST $PA_WORKSPACE_URL/api/identity/user-1/reactivate \
  -H "Authorization: Bearer $TOKEN"

# Delete PA permanently
curl -X DELETE $PA_WORKSPACE_URL/api/identity/user-1 \
  -H "Authorization: Bearer $TOKEN"
```

#### Identity Lifecycle States

```
pending → provisioning → active → suspended → active (reactivate)
                                 → deleted
provisioning → pending (on Google API failure)
```

- **provision**: Creates real Google Workspace account (Gmail + Calendar + Drive)
- **suspend**: Disables Google account (preserves data, stops email delivery)
- **reactivate**: Re-enables a suspended account
- **delete**: Permanently removes Google account and marks identity as deleted

### PA Action Logging (Timesheet)

Actions are logged to both **local SQLite** (always available) and the **PA's Google Calendar** (when workspace is configured). Calendar events are color-coded by action type and marked as "transparent" (don't block time).

```bash
# Log a PA action (auto-syncs to Google Calendar if workspace is ready)
curl -X POST $PA_WORKSPACE_URL/api/calendar/log-action \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "actionType": "email_read", "summary": "Read 3 forwarded emails", "durationMs": 5000}'

# Query timesheet (with optional date filtering)
curl "$PA_WORKSPACE_URL/api/calendar/timesheet?paEmail=alice-pa@pa.company.com&from=2026-02-01&to=2026-02-28" \
  -H "Authorization: Bearer $TOKEN"

# Get summary stats (aggregated by action type)
curl "$PA_WORKSPACE_URL/api/calendar/timesheet/summary?paEmail=alice-pa@pa.company.com" \
  -H "Authorization: Bearer $TOKEN"

# Export as CSV
curl -X POST $PA_WORKSPACE_URL/api/calendar/timesheet/export \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "from": "2026-02-01", "to": "2026-02-28"}'

# Export as ICS (iCalendar)
curl -X POST $PA_WORKSPACE_URL/api/calendar/timesheet/export \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "format": "ics"}'
```

#### Action Types & Calendar Colors

| Action Type | Color | Calendar Color ID |
|-------------|-------|-------------------|
| card_created | Blueberry | 9 |
| email_read | Peacock | 7 |
| email_sent | Banana | 5 |
| tez_received | Basil | 10 |
| tez_sent | Tangerine | 6 |
| calendar_checked | Grape | 3 |
| briefing_generated | Lavender | 1 |
| general | Graphite | 8 |

### PA Email (Gmail API)

Email operations use the Gmail API via domain-wide delegation to read/send from the PA's real Gmail inbox. Inbound emails are automatically classified as normal emails (→ cards) or Tezit Protocol messages (→ tez import).

```bash
# Read PA inbox (default: unread messages; use q= for custom Gmail queries)
curl "$PA_WORKSPACE_URL/api/email/inbox?paEmail=alice-pa@pa.company.com&maxResults=20" \
  -H "Authorization: Bearer $TOKEN"

# Read with custom query (Gmail search syntax)
curl "$PA_WORKSPACE_URL/api/email/inbox?paEmail=alice-pa@pa.company.com&q=from:boss@company.com" \
  -H "Authorization: Bearer $TOKEN"

# Send email from PA (supports replyTo, custom headers, attachments)
curl -X POST $PA_WORKSPACE_URL/api/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "to": "bob@other.com", "subject": "Meeting notes", "body": "Here are the notes...", "replyTo": "alice@company.com"}'

# Process unread emails → creates cards or imports tezits in the app backend
curl -X POST $PA_WORKSPACE_URL/api/email/process \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "maxResults": 10}'
# Returns: { data: [{messageId, subject, from, processedAs, cardId}], meta: {total, cards, tezImports, ignored} }

# Email processing log
curl "$PA_WORKSPACE_URL/api/email/log?paEmail=alice-pa@pa.company.com" \
  -H "Authorization: Bearer $TOKEN"
```

#### Email Processing Flow

```
Inbound email → PA's Gmail inbox
  → POST /api/email/process reads unread messages
  → Detects Tezit Protocol markers:
      - X-Tezit-Protocol header
      - .tez.json attachment
      - Inline tezit_version: marker
  → If Tez: imports via app backend POST /api/tez/import
  → If normal: creates card via app backend POST /api/webhooks/email
  → Marks message as read
  → Logs to email_log + PA timesheet
```

### Tez Transport (Tezit Protocol Email)

Every PA email address is a **Tezit Protocol endpoint**. Tez bundles can be sent between PAs (or to any email) with full protocol headers, human-readable body, and `.tez.json` attachment.

```bash
# Send a Tez by ID (fetches bundle from app backend, then sends via PA email)
curl -X POST $PA_WORKSPACE_URL/api/tez-transport/send \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tezId": "tez-123", "fromPaEmail": "alice-pa@pa.company.com", "toEmail": "bob-pa@other-pa.com"}'

# Send a raw Tez bundle directly (no app backend lookup)
curl -X POST $PA_WORKSPACE_URL/api/tez-transport/send \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"fromPaEmail": "alice-pa@pa.company.com", "toEmail": "bob@other.com", "bundle": {"tezit_version": "1.2", "id": "tez-456", "title": "Project Update", "type": "knowledge", "content": "..."}, "subject": "Custom Subject Line"}'

# View Tez transport history (filtered from email_log where isTezit=true)
curl "$PA_WORKSPACE_URL/api/tez-transport/log?paEmail=alice-pa@pa.company.com" \
  -H "Authorization: Bearer $TOKEN"
```

#### Outbound Tez Email Format

When sending a Tez, the composed email includes:

| Component | Content |
|-----------|---------|
| Header | `X-Tezit-Protocol: 1.2` |
| Header | `X-Tezit-Id: {tez-id}` |
| Header | `X-Tezit-Type: {knowledge\|message\|...}` |
| Body | Human-readable summary (title, type, author, content, deep link) |
| Attachment | `{tez-id}.tez.json` — full Portable Tez bundle as JSON |

#### Inbound Tez Detection (during email processing)

When `POST /api/email/process` reads unread messages, it detects Tez emails by:
1. `X-Tezit-Protocol` header (most reliable)
2. `.tez.json` attachment filename
3. `tezit_version:` marker in body text (inline YAML frontmatter)

Extraction priority: attachment JSON → inline YAML frontmatter → body wrapped as minimal bundle.

Detected Tez bundles are imported into the app backend via `POST /api/tez/import`.

### Shared Calendar Read

When a user shares their Google Calendar with their PA email, the PA can read those events. This enables the PA to know about meetings, prep needed, and scheduling context.

```bash
# List calendars shared with the PA
curl "$PA_WORKSPACE_URL/api/calendar/shared-calendars?paEmail=alice-pa@pa.company.com" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: [{calendarId, summary, description, accessRole}], meta: {total} }

# Read events from all shared calendars (with optional date filtering)
curl "$PA_WORKSPACE_URL/api/calendar/shared-events?paEmail=alice-pa@pa.company.com&from=2026-02-07&to=2026-02-08" \
  -H "Authorization: Bearer $TOKEN"
# Returns events tagged with source calendar name in description

# Get team availability (busy slots from all PAs' shared calendars)
curl "$PA_WORKSPACE_URL/api/calendar/team-availability?teamId=team-1&from=2026-02-07T08:00:00Z&to=2026-02-07T18:00:00Z" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: {"alice-pa@pa.com": [{start, end}, ...], ...}, meta: {teamId, paCount, busyPaCount} }
```

#### How Shared Calendars Work

1. User shares their personal Google Calendar with `alice-pa@pa.company.com` (standard Google sharing)
2. The shared calendar appears in the PA's calendar list
3. `GET /shared-calendars` lists all non-primary calendars visible to the PA
4. `GET /shared-events` reads events from all shared calendars (sorted by time)
5. `GET /team-availability` uses Calendar freebusy API to aggregate busy slots across all team PAs

### Google Voice (Phone Identity)

Each PA can have a Google Voice number (included with Google Workspace). This gives the PA a real phone number for SMS notifications and receiving voicemails.

**Note:** Google Voice number assignment is done through the Google Admin Console. The API tracks and uses the assigned number.

```bash
# Get PA's Voice number (returns stored number, or auto-detects from Gmail)
curl "$PA_WORKSPACE_URL/api/voice/number?paEmail=alice-pa@pa.company.com" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: {paEmail, voiceNumber, source: "stored"|"detected"|"not_found"} }

# Manually set Voice number (after admin assigns in Google Admin Console)
curl -X PATCH $PA_WORKSPACE_URL/api/voice/number \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "voiceNumber": "+15551234567"}'

# Read SMS/voicemail messages from Voice (via Gmail)
curl "$PA_WORKSPACE_URL/api/voice/sms?paEmail=alice-pa@pa.company.com&maxResults=10" \
  -H "Authorization: Bearer $TOKEN"
# Returns: { data: [{gmailMessageId, from, body, timestamp, isVoicemail}], meta: {total} }

# Send SMS via Voice
curl -X POST $PA_WORKSPACE_URL/api/voice/sms \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"paEmail": "alice-pa@pa.company.com", "toNumber": "+15559999999", "body": "Your meeting is in 15 minutes."}'
# Requires PA to have a voiceNumber configured
```

#### Voice Setup Flow

1. Admin assigns a Google Voice number to the PA account in Google Admin Console
2. Set the number via `PATCH /api/voice/number` or let it auto-detect on first `GET /api/voice/number`
3. User links their personal phone to the PA's Voice number (forwarding)
4. Inbound SMS/voicemails appear in the PA's Gmail (readable via `GET /api/voice/sms`)
5. PA can send urgent SMS notifications via `POST /api/voice/sms`

## Response Format

```json
// Success
{"data": {...}, "meta": {"total": 10}}

// Error
{"error": {"code": "VALIDATION_ERROR", "message": "..."}}
```

## Health Check

```bash
curl $PA_WORKSPACE_URL/health/ready
```
