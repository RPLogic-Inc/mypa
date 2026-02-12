# Channel Connections Contract

## Purpose

Define a user-safe replacement for direct `oc.mypa.chat` channel setup, so end users can connect their own channels (Telegram, etc.) without getting access to the OpenClaw control plane.

This contract assumes:

- `oc.mypa.chat` is treated as admin/operator-only.
- End users live in `app.mypa.chat`.
- Privacy model is "private by default, explicit share."

## Scope

This contract covers:

- Team-level provider configuration (admin only)
- User-level channel connection and ownership
- Inbound webhook binding to the correct user
- Outbound channel routing behavior
- UI contract for Settings pages

This contract does not cover:

- Full connector implementation details for every provider SDK
- OpenClaw internals or direct Control UI features

## Roles and Permissions

- `admin` / `team_lead`:
  - Configure provider credentials for the team
  - Enable/disable provider availability for the team
  - Test and rotate provider secrets
- `member`:
  - Connect/disconnect only their own channel identity
  - View only their own channel status and diagnostics
  - Cannot view provider secrets or other users' identities

## Privacy Requirements

- User channel links are per-user, never team-global.
- A user cannot read or mutate another user's channel bindings.
- Team admins can see aggregate connection counts, not another user's secrets/tokens.
- All connect/disconnect and delivery actions are audited.

## Data Model

The current relay `contacts` table has routing fields (`channels`, `preferredChannel`, `phone`, `telegramId`), but we need explicit ownership and lifecycle state.

Add two tables (relay or backend service DB):

### `channel_provider_config`

- `team_id` (PK part)
- `provider` (`telegram`, `whatsapp`, `slack`, `imessage`, `sms`, `email`)
- `enabled` (boolean)
- `config_ref` (secret reference, never raw secret in row)
- `webhook_secret_ref` (secret reference)
- `created_by`
- `updated_by`
- `created_at`, `updated_at`

Unique: (`team_id`, `provider`)

### `user_channel_link`

- `id` (UUID PK)
- `team_id`
- `user_id`
- `provider`
- `status` (`pending`, `connected`, `failed`, `disconnected`)
- `external_user_id` (provider user id)
- `external_chat_id` (provider conversation id)
- `handle` (username/phone/display)
- `metadata` (provider-specific non-secret metadata)
- `last_verified_at`
- `failure_reason`
- `created_at`, `updated_at`

Unique: (`team_id`, `user_id`, `provider`)

## API Contract

All endpoints require bearer auth unless stated otherwise.

### Admin Endpoints

Base: `/api/channels/providers`

1. `GET /api/channels/providers`
   - Auth: `admin` or `team_lead`
   - Returns provider status for caller's active team
   - Response:
     - `provider`, `enabled`, `configured`, `healthy`, `connectionCount`

2. `PATCH /api/channels/providers/:provider`
   - Auth: `admin` or `team_lead`
   - Body:
     - `enabled?: boolean`
     - `credentialInput?: object` (written to secret manager; never echoed back)
   - Response:
     - `data: { provider, enabled, configured, updatedAt }`

3. `POST /api/channels/providers/:provider/test`
   - Auth: `admin` or `team_lead`
   - Response:
     - `data: { ok: boolean, message: string }`

4. `POST /api/channels/providers/:provider/rotate-webhook-secret`
   - Auth: `admin` or `team_lead`
   - Response:
     - `data: { rotated: true, updatedAt }`

### User Endpoints

Base: `/api/channels/me`

1. `GET /api/channels/me`
   - Auth: any authenticated user
   - Response:
     - list of providers for active team with:
       - `provider`
       - `providerEnabled`
       - `status` (`not_connected` if no row)
       - `handle`
       - `lastVerifiedAt`
       - `canConnect` (derived)

2. `POST /api/channels/me/:provider/connect/start`
   - Auth: any authenticated user
   - Body: optional provider-specific hints (for Telegram usually empty)
   - Response:
     - `data: { state, connectUrl, expiresAt }`
   - Notes:
     - Creates/updates `user_channel_link` as `pending`
     - `state` must bind to `team_id + user_id + provider`

3. `GET /api/channels/me/:provider/connect/status?state=...`
   - Auth: any authenticated user
   - Response:
     - `data: { status, handle, failureReason, lastVerifiedAt }`

4. `POST /api/channels/me/:provider/disconnect`
   - Auth: any authenticated user
   - Body:
     - `confirm: true`
   - Response:
     - `data: { disconnected: true }`
   - Notes:
     - Sets link status to `disconnected`
     - Removes provider from active routing for this user

5. `PATCH /api/channels/me/routing`
   - Auth: any authenticated user
   - Body:
     - `preferredChannel?: string | null`
     - `channels?: string[]` (ordered fallback)
   - Response:
     - `data: { preferredChannel, channels }`
   - Notes:
     - Only allows providers where this user is `connected`, except `tezit` and `email` if policy allows.

### Webhook Endpoint

Base: `/api/channels/webhooks/:provider`

1. `POST /api/channels/webhooks/:provider`
   - Auth: provider signature/secret validation (no user JWT)
   - Behavior:
     - Validate signature
     - Resolve callback `state` or external id -> `user_channel_link`
     - Mark link `connected` or `failed`
     - For inbound message events, write Tez with:
       - `sourceChannel`
       - `sourceAddress`
       - route to correct `team_id` + `user_id`
   - Response:
     - `200 { ok: true }`

## Error Contract

All errors follow existing shape:

- `error.code`
- `error.message`

Recommended codes:

- `CHANNEL_PROVIDER_DISABLED`
- `CHANNEL_PROVIDER_NOT_CONFIGURED`
- `CHANNEL_PROVIDER_UNHEALTHY`
- `CHANNEL_LINK_NOT_FOUND`
- `CHANNEL_ALREADY_CONNECTED`
- `CHANNEL_CONNECT_EXPIRED`
- `CHANNEL_CONNECT_FAILED`
- `CHANNEL_OWNERSHIP_VIOLATION`
- `CHANNEL_INVALID_STATE`
- `CHANNEL_WEBHOOK_INVALID_SIGNATURE`

## Audit Contract

Emit audit events:

- `channel.provider.updated`
- `channel.provider.tested`
- `channel.connect.started`
- `channel.connect.completed`
- `channel.connect.failed`
- `channel.disconnected`
- `channel.routing.updated`
- `channel.inbound.received`
- `channel.delivery.attempted`
- `channel.delivery.failed`

Minimum metadata:

- `teamId`
- `actorUserId` (or `system` for webhook)
- `provider`
- `targetUserId` (if applicable)
- `result`

## UI Contract

### User UI (`Settings > Channels`)

Show provider cards:

- Provider name/icon
- Team availability (`Enabled by admin` / `Unavailable`)
- User status (`Not connected`, `Pending`, `Connected`, `Error`)
- Primary action:
  - `Connect`
  - `Reconnect`
  - `Disconnect`
- Secondary action:
  - `Troubleshoot` (shows failure reason and retry path)

Show routing section:

- `Preferred channel` selector (only connected options)
- `Fallback order` drag-and-drop list
- Inline warning if preferred channel is disconnected

### Admin UI (`Settings > Team > Channel Providers`)

Show provider control rows:

- `Enabled` toggle
- `Configured` status
- `Health` check button
- `Connection count`
- `Configure credentials` action (secure form)
- `Rotate webhook secret`

No raw tokens/secrets should ever be rendered after save.

## Delivery Rules

For outbound user-targeted delivery:

1. Build candidate channels from recipient routing settings.
2. Keep only channels with `connected` link for recipient.
3. If none, fallback to `tezit`.
4. Record chosen channel in audit/event metadata.

For team broadcasts:

- Each recipient resolves independently through their own routing.

## Security Rules

- Never expose provider tokens to browser clients.
- All connection tokens/state values are short-lived and single-use.
- Webhook endpoints require signature validation and replay protection.
- Admin endpoints must not be callable by `member`.
- User endpoints always derive `user_id` from JWT, never body params.

## Migration Plan

1. Add tables and read-paths without changing existing routing.
2. Add user/admin endpoints behind feature flag `CHANNEL_CONNECTIONS_V1`.
3. Implement Telegram first.
4. Switch outbound routing to prefer `user_channel_link` state.
5. Deprecate direct use of `contacts.phone` / `contacts.telegramId` as source of truth.

## Minimum Feature Parity Without Direct `oc.mypa.chat`

End users retain:

- AI chat via app proxy
- Tez messaging and team comms
- Personal channel self-service connect/disconnect

Admins retain in app:

- provider setup and health checks

Only true control-plane operations stay in `oc`:

- low-level gateway internals
- global operator diagnostics

