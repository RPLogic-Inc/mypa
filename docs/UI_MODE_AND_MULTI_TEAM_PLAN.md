# UI Mode Toggle + Multi-Team Deployment Plan

**Date:** 2026-02-08
**Features:** (1) OpenClaw ↔ MyPA UI mode toggle, (2) Multi-team membership (already built)

---

## Architecture Finding (2026-02-12): Shared Gateway Is Team-Scoped, Not User-Isolated

This project currently behaves like a **single team assistant** with per-user request filtering, not true per-user runtime isolation.

### What Is Isolated Today

| Layer | Current mechanism |
|---|---|
| OpenClaw sessions | Proxy routes by `X-OpenClaw-User-Id`, `X-OpenClaw-Agent-Id`, `X-OpenClaw-Session-Key` |
| Chat history | Browser IndexedDB namespaced by user ID |
| API data | JWT auth + query filtering by user/team scope |
| Relay conversations | JWT-scoped request access |

### What Is Shared Today (Risk Areas)

| Layer | Current behavior | Risk |
|---|---|---|
| OpenClaw Gateway process | Single process, single workspace, one `.openclaw/` | Cross-user/tool-state bleed risk |
| Cron / background jobs | Not implemented; if added naively, would run in shared gateway context | Jobs can run as service identity, not user identity |
| OpenClaw memory/tools | Shared runtime on same gateway | Weak tenant boundaries |
| File storage | Shared `/uploads` | No hard per-user/per-team segregation |
| In-memory cache | Singleton map with key prefixes | Prefixing is not true isolation |

### Cron Scenario Decision

If User A asks for a daily reminder, a shared gateway cron would execute as the gateway service and not as User A's authenticated context.  
**Decision:** do not implement gateway-native shared cron. Use one of:

1. Per-user OpenClaw runtime (strongest isolation, highest cost), or
2. Tenant-aware scheduler service that executes with explicit `{scopeType, scopeId, actorUserId}` and mints scoped auth at run time.

### Multi-Team User Model (You in 5 Teams)

A single personal instance talking directly to every team can work as a coordinator, but should not hold unrestricted team credentials in one shared runtime.

Recommended structure:

| Scope | What to run | Owner | Purpose |
|---|---|---|---|
| Personal hub (1 per user) | Lightweight MyPA/OpenClaw runtime + personal scheduler | User | Private reminders, drafts, personal CRM/tasks |
| Team hub (1 per team) | Team-scoped runtime, team memory/tools, team scheduler | Team admins | Shared stream, workflows, team automations |
| Federation layer (shared) | Membership graph + policy engine + cross-hub relay | Platform | Lets personal hub coordinate across teams safely |

For one user in 5 teams, target setup is:
1. **1 personal hub** for private work.
2. **5 team memberships** mapped to **5 team hubs** (or 5 strict tenants if using multi-tenant runtime).
3. Cross-team requests routed through policy checks and explicit team context selection.

### Can One App Be Both Hub And Spoke?

Yes, UI can remain one app if scope is explicit in every action:

1. Global scope switcher: `Personal` vs `Team: <name>`.
2. Per-action scope badges in chat, artifacts, automations.
3. Scheduler creation requires scope selection and shows "runs as" identity.
4. Admin-only controls for team integrations; personal users cannot silently bind team secrets.

### Execution Plan

#### Phase 0: Guardrails (Now)
1. Block/shared-disable background jobs in gateway runtime.
2. Add `scopeType` + `scopeId` + `actorUserId` fields to automation data model.
3. Require explicit scope in UI for automations and tool calls.

#### Phase 1: Scoped Scheduling (Near Term)
1. Build tenant-aware scheduler service (separate from gateway process).
2. Store jobs with ownership + scope + policy snapshot.
3. At trigger time, mint short-lived scoped token and run action in correct user/team context.

#### Phase 2: Runtime Isolation Upgrade (Mid Term)
1. Choose deployment profile:
   - Profile A: per-team runtimes + personal runtime.
   - Profile B: shared runtime with hard namespace isolation + sandboxed tools.
2. Segregate storage: files, memory, cache, logs by tenant key.
3. Add audit trail: "who scheduled", "who executed", "which scope", "which credentials".

#### Phase 3: Cross-Team Coordination (Later)
1. Add "Personal Chief-of-Staff" workflow that delegates to team hubs via explicit API contracts.
2. Support aggregate briefings across selected teams without exposing raw cross-team memory.
3. Add policy templates for multi-team leaders (founder, operator, executive assistant).

### Architectural Conclusion

The product should evolve into **one unified UI + multiple scoped runtimes**:
- Users experience one app.
- Execution is isolated by personal vs team scope.
- Scheduling/automation is never run in ambiguous shared gateway context.
- Team admins retain control of team-level security and configuration.

### Related Docs

- `docs/OPENCLAW_BOUNDARY.md`
- `docs/OPENCLAW_BOUNDARY_EXECUTION.md`
- `docs/USER_STORY_VERIFICATION.md`
- `docs/USER_STORIES_AND_PERSONAS.md`
- **`docs/HUB_AND_SPOKE_ARCHITECTURE.md`** — Full architecture plan for personal instances + team hubs (resolves the cron and multi-team problems identified above)

---

## Feature 1: Multi-Team Membership (Deploy Existing Code)

### Status: ✅ ALREADY BUILT, NOT YET DEPLOYED

**What exists:**
- ✅ `user_teams` junction table (up to 5 teams per user)
- ✅ `users.teamId` = "active team" (backward compat)
- ✅ Backend endpoints:
  - `GET /api/users/me/teams` - List user's teams
  - `POST /api/teams/:id/join` - Join a team
  - `DELETE /api/teams/:id/leave` - Leave a team
  - `PATCH /api/teams/:id/active` - Switch active team
- ✅ `TeamSwitcher` component in `frontend/src/components/home/TeamSwitcher.tsx`
- ✅ Backfill script: `backend/src/scripts/backfill-user-teams.ts`

**What needs deployment:**
1. Run backfill script on production (one-time)
2. Wire up TeamSwitcher in AppHeader
3. Test team switching

### Deployment Steps

#### 1. Verify Schema in Production

```bash
# SSH to production
ssh root@192.241.135.43

# Check if user_teams table exists
cd /var/mypa/backend
sqlite3 /var/mypa/data/mypa.db "SELECT name FROM sqlite_master WHERE type='table' AND name='user_teams';"

# If exists, check data
sqlite3 /var/mypa/data/mypa.db "SELECT COUNT(*) FROM user_teams;"
```

**Expected:** Table exists from previous migration, may be empty.

#### 2. Run Backfill Script

```bash
# On production server
cd /var/mypa/backend

# Run backfill (creates user_teams entries for all existing users)
node dist/scripts/backfill-user-teams.js

# Verify results
sqlite3 /var/mypa/data/mypa.db "SELECT COUNT(*) FROM user_teams;"
# Should equal number of users (each user in their current team)
```

#### 3. Deploy Frontend with TeamSwitcher

**Already integrated in AppHeader!** Just needs to be visible.

Check if `AppHeader.tsx` imports and uses `TeamSwitcher`:

```typescript
import TeamSwitcher from "../home/TeamSwitcher";

// In render:
{teams.length > 1 && (
  <TeamSwitcher
    teams={teams}
    activeTeamId={user?.teamId || null}
    onSwitchTeam={handleSwitchTeam}
  />
)}
```

If not present, add it. Then deploy frontend (already in wave 3 of boundary hardening).

#### 4. Test Multi-Team

**Test flow:**
1. Create second test team via API
2. Add user to second team via `POST /api/teams/:id/join`
3. Refresh UI - should see team switcher in header
4. Click switcher - should show dropdown with both teams
5. Switch teams - active team changes, cards filtered by team

**Verification:**
```bash
# User's teams
curl -H "Authorization: Bearer $JWT" https://app.mypa.chat/api/users/me/teams

# Switch active team
curl -X PATCH -H "Authorization: Bearer $JWT" \
  https://app.mypa.chat/api/teams/TEAM_ID/active

# Verify cards are filtered
curl -H "Authorization: Bearer $JWT" https://app.mypa.chat/api/cards/feed
# Should only show cards for active team
```

---

## Feature 2: UI Mode Toggle (New Implementation)

### Concept

Users can toggle between two UI modes:

**1. MyPA Mode (Default)**
- Stream/AI/Library tabs
- Team-focused, communication-oriented
- Proactive context (quick actions, voice quick-send)
- Optimized for fast Tez workflows

**2. OpenClaw Mode**
- Full Canvas UI (power-user interface)
- Rich agent interaction, tool orchestration
- Memory search, multi-session management
- Opens OpenClaw Gateway's Canvas interface

### Design Approach

**Option A: Redirect Toggle (Simplest)**
- Toggle button in AppHeader or Settings
- Clicking redirects to `oc.mypa.chat` (OpenClaw Gateway Canvas)
- "Return to MyPA" link in Canvas brings user back
- **Pros:** Clean separation, uses existing Canvas
- **Cons:** Full page reload, loses app state

**Option B: Embedded Canvas (iframe)**
- MyPA embeds Canvas in a fourth "Canvas" tab
- Toggle switches between MyPA tabs and Canvas tab
- **Pros:** No page reload, seamless experience
- **Cons:** iframe security/auth complexity, double UI chrome

**Option C: Deep Link (Native)**
- Toggle opens OpenClaw desktop app (if installed)
- Falls back to web redirect if not installed
- **Pros:** Best experience for desktop users
- **Cons:** Platform detection needed

### Recommended: **Hybrid Approach**

1. **Toggle button** in AppHeader (next to TeamSwitcher)
2. **Detect environment:**
   - If native app (`window.__openclaw` exists): Switch to native Canvas view
   - If web + Gateway configured: Redirect to `oc.mypa.chat`
   - If web + no Gateway: Show "OpenClaw not configured" message

3. **Return path:**
   - Canvas has "MyPA" link that redirects back to `app.mypa.chat`
   - Or use URL param: `oc.mypa.chat?returnTo=app.mypa.chat`

### Implementation Plan

#### Phase 1: Add Toggle Button (Frontend)

**File:** `frontend/src/components/navigation/AppHeader.tsx`

```typescript
import { useState } from 'react';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';

// Add state for UI mode
const [uiMode, setUiMode] = useState<'mypa' | 'openclaw'>('mypa');

// Detect if OpenClaw is available
const openclawAvailable = typeof window !== 'undefined' &&
  (window.__openclaw || /* check if Gateway configured */);

const handleToggleUI = () => {
  if (typeof window !== 'undefined' && window.__openclaw) {
    // Native app: Show Canvas view (implement Canvas component)
    setUiMode(uiMode === 'mypa' ? 'openclaw' : 'mypa');
  } else {
    // Web: Redirect to Gateway Canvas
    const gatewayUrl = import.meta.env.VITE_OPENCLAW_GATEWAY_URL || 'https://oc.mypa.chat';
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${gatewayUrl}?returnTo=${returnUrl}`;
  }
};

// In render (next to TeamSwitcher):
{openclawAvailable && (
  <button
    onClick={handleToggleUI}
    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs text-white/80"
    title={uiMode === 'mypa' ? 'Switch to OpenClaw view' : 'Switch to MyPA view'}
  >
    <ArrowsRightLeftIcon className="w-4 h-4" />
    <span>{uiMode === 'mypa' ? 'Canvas' : 'MyPA'}</span>
  </button>
)}
```

#### Phase 2: Canvas View Component (Optional, for Native)

**File:** `frontend/src/components/canvas/CanvasView.tsx`

```typescript
/**
 * CanvasView - Embeds OpenClaw Canvas UI
 * Only used in native app mode (when window.__openclaw exists)
 */

export default function CanvasView() {
  // Use openclawBridge native mode to render Canvas
  // This is essentially the full OpenClaw UI within MyPA chrome

  return (
    <div className="fixed inset-0 bg-black">
      {/* Embed Canvas iframe or native rendering */}
      <iframe
        src="/__openclaw__/canvas/"
        className="w-full h-full border-0"
        title="OpenClaw Canvas"
      />
    </div>
  );
}
```

#### Phase 3: Gateway Return Link

**On OpenClaw Gateway side** (modify Canvas UI):

Add a "Return to MyPA" button if `?returnTo=` param is present:

```html
<!-- In Gateway Canvas UI -->
<script>
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('returnTo');

  if (returnUrl) {
    // Show return link
    document.getElementById('return-link').href = decodeURIComponent(returnUrl);
    document.getElementById('return-link').style.display = 'block';
  }
</script>

<a id="return-link" style="display:none;" href="#">
  ← Return to MyPA
</a>
```

**Note:** This requires modifying OpenClaw Gateway Canvas UI, which may not be feasible if Gateway is upstream read-only.

**Alternative:** Use browser history back button or bookmarks.

#### Phase 4: Settings Toggle (Optional)

**File:** `frontend/src/components/settings/UISettings.tsx`

```typescript
export default function UISettings() {
  const [defaultMode, setDefaultMode] = useState<'mypa' | 'openclaw'>('mypa');

  // Save preference to localStorage
  const handleModeChange = (mode: 'mypa' | 'openclaw') => {
    setDefaultMode(mode);
    localStorage.setItem('preferredUIMode', mode);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Default UI Mode</h3>

      <div className="space-y-2">
        <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
          <input
            type="radio"
            name="uiMode"
            value="mypa"
            checked={defaultMode === 'mypa'}
            onChange={() => handleModeChange('mypa')}
          />
          <div>
            <div className="font-medium">MyPA Mode</div>
            <div className="text-sm text-gray-600">
              Stream-focused, team communication, quick actions
            </div>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
          <input
            type="radio"
            name="uiMode"
            value="openclaw"
            checked={defaultMode === 'openclaw'}
            onChange={() => handleModeChange('openclaw')}
          />
          <div>
            <div className="font-medium">OpenClaw Canvas Mode</div>
            <div className="text-sm text-gray-600">
              Full agent interface, power-user tools, memory search
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
```

---

## Combined Implementation Timeline

### Immediate (Already Built)
**Multi-Team:** Deploy existing code
- Duration: 30 minutes
- Steps: Backfill script + frontend deploy
- Risk: Low (feature already tested)

### Short-Term (New Feature)
**UI Toggle:** Basic redirect implementation
- Duration: 2-3 hours
- Steps: Add toggle button + redirect logic
- Risk: Low (simple redirect)

### Medium-Term (Enhancement)
**Native Canvas View:** Full embedded experience
- Duration: 1-2 days
- Steps: Canvas component + native integration
- Risk: Medium (UI chrome complexity)

### Long-Term (Polish)
**Seamless Mode Switching:** State preservation, smart defaults
- Duration: 3-5 days
- Steps: State sync, preferences, return paths
- Risk: Medium (cross-app coordination)

---

## Security Considerations

**UI Toggle:**
- ✅ No security impact (redirect only)
- ✅ Uses existing openclawBridge authentication
- ✅ Gateway access already secured by boundary hardening

**Multi-Team:**
- ✅ Already secured via team_id scoping
- ✅ API endpoints check team membership
- ✅ Cards filtered by active team
- ⚠️ Need to verify cross-team data leakage in PA context

---

## Testing Plan

### Multi-Team Testing

**Scenario 1: Single Team User**
1. User in one team
2. TeamSwitcher shows static badge (no dropdown)
3. All features work as before

**Scenario 2: Multi-Team User**
1. User joins second team
2. TeamSwitcher shows dropdown
3. Switch teams → card feed updates
4. PA context reflects active team
5. Notifications scoped to active team

**Scenario 3: Team Isolation**
1. Create card in Team A
2. Switch to Team B
3. Card from Team A not visible in feed
4. PA context doesn't leak Team A data

### UI Toggle Testing

**Scenario 1: Native App**
1. Toggle button visible
2. Click → switches to Canvas view
3. All features accessible in both modes
4. Toggle back → returns to MyPA tabs

**Scenario 2: Web (Gateway Configured)**
1. Toggle button visible
2. Click → redirects to oc.mypa.chat
3. Return link brings back to app.mypa.chat

**Scenario 3: Web (No Gateway)**
1. Toggle button disabled/hidden
2. Settings show "Configure OpenClaw to enable Canvas mode"

---

## UI/UX Design Notes

**Visual Treatment:**
- Toggle button uses `ArrowsRightLeftIcon` (Heroicons)
- Placed in AppHeader next to TeamSwitcher
- Same visual style (rounded pill, white/10 bg)
- Shows current mode label

**User Communication:**
- Tooltip explains what each mode is for
- First-time toggle shows brief info modal:
  - "MyPA Mode: Fast team communication"
  - "Canvas Mode: Full AI assistant interface"
- Settings page has mode comparison table

**Default Behavior:**
- New users default to MyPA mode
- Power users can set Canvas as default
- Last-used mode remembered in localStorage

---

## Documentation Updates Needed

1. **User Guide:** Add "UI Modes" section
   - When to use MyPA mode
   - When to use Canvas mode
   - How to toggle between them

2. **CLAUDE.md:** Update architecture section
   - Document UI mode toggle
   - Explain mode differences
   - Link to Canvas documentation

3. **SKILL.md:** Update PA context
   - PA should know which UI mode user prefers
   - Can suggest mode switch for certain tasks

---

## Next Steps

**Immediate Actions:**
1. ✅ Deploy multi-team (backfill + frontend)
2. ✅ Test multi-team with 2 teams
3. 🔄 Implement basic UI toggle (redirect approach)
4. 🔄 Test UI toggle in native + web modes

**Future Enhancements:**
- Embedded Canvas view (no redirect)
- Smart mode suggestions ("This task works better in Canvas mode")
- Mode-specific keyboard shortcuts
- Sync mode preference across devices

---

## Questions to Resolve

1. **Gateway Canvas Customization:**
   - Can we modify Gateway Canvas to add "Return to MyPA" link?
   - If not, use browser back button or bookmarks

2. **State Preservation:**
   - Should we preserve chat history when toggling modes?
   - Probably yes - use openclawBridge session continuity

3. **Default Mode:**
   - Should admins set org-wide default UI mode?
   - Or always per-user preference?

4. **Mobile:**
   - Does UI toggle make sense on mobile?
   - Probably hide on mobile (Canvas is desktop-focused)

5. **Multi-Team + PA Context:**
   - Should PA have access to all user's teams?
   - Or only active team? (Recommend: all teams, filtered by active)
