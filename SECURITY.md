# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MyPA, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **GitHub Security Advisories (Preferred):** Go to the [Security tab](https://github.com/RPLogic-Inc/mypa/security/advisories) and click "Report a vulnerability."

2. **Email:** Send details to **security@mypa.chat**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected component (backend, relay, pa-workspace, canvas)
- Potential impact

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 1 week
- **Fix:** Depends on severity (critical: ASAP, high: 1 week, medium: 2 weeks)

## Scope

The following components are in scope:

| Component | Description |
|-----------|-------------|
| `backend/` | API server (Express, SQLite, JWT auth) |
| `relay/` | Messaging relay (federation, teams, contacts) |
| `pa-workspace/` | Google Workspace integration |
| `canvas/` | React frontend |
| `extensions/` | OpenClaw plugins |
| `skills/` | OpenClaw skill definitions |

## Security Architecture

- **Auth:** JWT with shared secret (access: 15min, refresh: 7 days)
- **Database:** SQLite with parameterized queries via Drizzle ORM (no raw SQL injection surface)
- **Input validation:** Zod schemas on all API endpoints
- **CORS:** Configurable allowed origins
- **Rate limiting:** Per-endpoint rate limits (auth: 30/min, API: 10/s)
- **Content sanitization:** HTML/script stripping on Tez content
- **OpenClaw proxy:** Gateway token never exposed to clients — server-side only

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | Yes |
| Older releases | Best effort |
