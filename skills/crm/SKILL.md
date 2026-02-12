---
name: crm
description: Twenty CRM integration. List, create, and update contacts (people), opportunities, and tasks via the MyPA backend API. All CRM data lives in Twenty — never look for local files.
metadata: {"openclaw":{"requires":{"env":["MYPA_API_URL","MYPA_EMAIL","MYPA_PASSWORD"]},"emoji":"📇","primaryEnv":"MYPA_API_URL"}}
---

# CRM Skill (Twenty Integration)

This skill gives you access to the Twenty CRM system through the MyPA backend API. Twenty runs as a separate service — you interact with it via HTTP API calls, never by looking for local files or folders.

## CRITICAL: CRM is an API, not a file

- CRM data lives in Twenty CRM (a web service), **not** in your workspace filesystem.
- **NEVER** look for CRM files, folders, databases, or CSVs in your workspace.
- **NEVER** tell the user you can't find CRM data because no local file exists.
- **ALWAYS** use the API endpoints below to interact with CRM data.

## Authentication

All CRM endpoints require a JWT Bearer token from the MyPA backend.

**Login (do this first if you don't have a token):**
```bash
TOKEN=$(curl -s -X POST "$MYPA_API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$MYPA_EMAIL\", \"password\": \"$MYPA_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['tokens']['accessToken'])")
```

Then include on every request:
```
-H "Authorization: Bearer $TOKEN"
```

## Step 1: Always Check Status First

Before any CRM operation, verify the CRM is connected:

```bash
curl -s "$MYPA_API_URL/api/crm/status" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "data": {
    "configured": true,
    "reachable": true,
    "baseUrl": "http://127.0.0.1:3004"
  }
}
```

- If `configured: false` → Tell user: "Twenty CRM is not configured. An admin needs to set TWENTY_API_URL and TWENTY_API_KEY in the backend .env."
- If `reachable: false` → Tell user: "Twenty CRM is configured but not reachable. The Twenty service may be down."
- If both `true` → Proceed with CRM operations.

## List Contacts (People)

```bash
curl -s "$MYPA_API_URL/api/crm/people?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

Optional query params: `?q=search+term&limit=20&offset=0`

**Response:** `{ "data": { "items": [...], "total": N } }`

Each person has fields like:
```json
{
  "id": "uuid",
  "name": { "firstName": "John", "lastName": "Doe" },
  "emails": { "primaryEmail": "john@example.com" },
  "phones": { "primaryPhoneNumber": "+1234567890" },
  "company": { "name": "Acme Corp" },
  "city": "New York",
  "jobTitle": "CEO"
}
```

**Important:** Twenty uses structured name fields (`firstName`/`lastName`), not a flat string.

## Create a Contact

```bash
curl -s -X POST "$MYPA_API_URL/api/crm/people" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "name": { "firstName": "Jane", "lastName": "Smith" },
      "emails": { "primaryEmail": "jane@example.com" },
      "phones": { "primaryPhoneNumber": "+1555123456" },
      "city": "San Francisco",
      "jobTitle": "CTO"
    }
  }'
```

## Update a Contact

```bash
curl -s -X PATCH "$MYPA_API_URL/api/crm/people/<person-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "jobTitle": "VP Engineering",
      "company": { "name": "NewCo" }
    }
  }'
```

## List Opportunities (Deals)

```bash
curl -s "$MYPA_API_URL/api/crm/opportunities?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Create an Opportunity

```bash
curl -s -X POST "$MYPA_API_URL/api/crm/opportunities" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "name": "Acme Corp Renewal Q2",
      "stage": "NEGOTIATION",
      "amount": { "amountMicros": 50000000000, "currencyCode": "USD" },
      "closeDate": "2026-06-30"
    }
  }'
```

## Update an Opportunity

```bash
curl -s -X PATCH "$MYPA_API_URL/api/crm/opportunities/<opportunity-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "stage": "WON",
      "amount": { "amountMicros": 55000000000, "currencyCode": "USD" }
    }
  }'
```

## List Tasks

```bash
curl -s "$MYPA_API_URL/api/crm/tasks?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

## Create a Task

```bash
curl -s -X POST "$MYPA_API_URL/api/crm/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "title": "Follow up with client",
      "body": "Discuss renewal terms",
      "status": "TODO",
      "dueAt": "2026-03-01T09:00:00Z"
    }
  }'
```

## Update a Task

```bash
curl -s -X PATCH "$MYPA_API_URL/api/crm/tasks/<task-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "status": "DONE"
    }
  }'
```

## Get a Specific Entity

```bash
curl -s "$MYPA_API_URL/api/crm/person/<entity-id>" \
  -H "Authorization: Bearer $TOKEN"

curl -s "$MYPA_API_URL/api/crm/opportunity/<entity-id>" \
  -H "Authorization: Bearer $TOKEN"

curl -s "$MYPA_API_URL/api/crm/task/<entity-id>" \
  -H "Authorization: Bearer $TOKEN"
```

## Search Across CRM

Use the `q` parameter on any list endpoint:

```bash
# Find contacts named "Williams"
curl -s "$MYPA_API_URL/api/crm/people?q=Williams&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Find deals mentioning "renewal"
curl -s "$MYPA_API_URL/api/crm/opportunities?q=renewal&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

## Common Patterns

### "What names are in the CRM?"
1. Check status: `GET /api/crm/status`
2. List people: `GET /api/crm/people?limit=50`
3. Extract and present names from the response

### "Add [person] to CRM"
1. Check status
2. Parse the name into firstName/lastName
3. `POST /api/crm/people` with structured payload

### "Show me our deals" / "What opportunities do we have?"
1. Check status
2. `GET /api/crm/opportunities?limit=20`
3. Present with stage, amount, close date

### "Create a task to follow up with [person]"
1. Check status
2. Optionally search for the person first to get their ID
3. `POST /api/crm/tasks` with title, body, due date

## Error Handling

- **401 Unauthorized** → Token expired. Re-login using the auth flow above.
- **404 Not Found** → Entity doesn't exist. Check the ID.
- **400 Validation Error** → Check the payload format. `payload` must be a non-empty object.
- **503 TWENTY_NOT_CONFIGURED** → CRM not set up. Tell user to configure it.

## What This Skill Does NOT Do

- It does NOT access Twenty CRM directly — all calls go through MyPA backend (`/api/crm/*`)
- It does NOT store CRM data locally
- It does NOT require TWENTY_API_URL or TWENTY_API_KEY — the backend handles that
