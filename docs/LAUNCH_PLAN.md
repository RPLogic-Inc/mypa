# MyPA Launch Execution Plan

## Vision
1. Website at mypa.chat
2. Signup/login area
3. Onboarding (PA name, invite/team, Google Workspace provisioning)
4. Workspace + CRM strapped onto OpenClaw assistant
5. Tez under Chat + Library under Agent in OpenClaw sidebar

## Phase 1: Server Configuration (Quick Win)
- [ ] Set TWENTY_API_URL and TWENTY_API_KEY in backend .env on server
- [ ] Set PA_WORKSPACE_API_URL in backend .env on server
- [ ] Restart PM2, verify /api/crm/workflows/status returns all green

## Phase 2: Registration UI
- [ ] Add "Create Account" tab/toggle to LoginScreen.tsx
- [ ] Fields: name, email, password, optional invite code
- [ ] Call POST /api/auth/register → auto-login on success
- [ ] Auto-register as relay contact after registration

## Phase 3: Onboarding Wizard
- [ ] New OnboardingWizard.tsx component (shown after first registration)
- [ ] Step 1: Choose PA display name (stored in user prefs)
- [ ] Step 2: Optional invite code / join team / create team
- [ ] Step 3: Google Workspace provisioning status (calls pa-workspace API)
- [ ] Store onboarding completion flag in localStorage + backend

## Phase 4: A2UI Panel Restructure
- [ ] Restructure Canvas build for A2UI embedding:
  - vite.config.ts: set base path to `/__openclaw__/canvas/` in A2UI mode
- [ ] Create two entry panel modes:
  - "Tez" panel (messaging: conversations, teams, send/receive)
  - "Library" panel (search across all context, FTS5 query)
- [ ] Update Sidebar to match OpenClaw nav expectations
- [ ] Build Library search panel (calls /api/library/search)

## Phase 5: Website Update
- [ ] Create website/ directory in monorepo (or find existing source)
- [ ] Build from WEBSITE_DRAFT.md copy
- [ ] Deploy to Vercel "landing" project → mypa.chat
- [ ] "Launch MyPA" CTA → oc.mypa.chat

## Execution Order
1. Phase 1 (5 min) — unblocks CRM workflows
2. Phase 2 (30 min) — users can sign up
3. Phase 3 (45 min) — guided first experience
4. Phase 4 (1-2 hr) — core UX transformation
5. Phase 5 (1 hr) — public-facing site
