# MyPA

**Open-source AI-powered team communication.** Every message is a Tez -- a unit of context with an interrogable iceberg of supporting information. Think "NotebookLM bundled with every text you send."

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](docker-compose.yml)

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/RPLogic-Inc/mypa/tree/main)

## What is MyPA?

MyPA is a self-hostable team communication platform where every message carries rich context that AI can interrogate. It's powered by [OpenClaw](https://openclaw.ai) and built on the Tez protocol.

**Key features:**
- **Tez messages** -- Every message carries context layers (background, facts, artifacts) that AI can search and answer questions from
- **Tez Interrogation Protocol (TIP)** -- Ask questions answered strictly from transmitted context, with verified citations
- **Library of Context** -- Full-text search across all preserved context, ranked by engagement
- **Federation** -- Server-to-server communication between MyPA instances (like email)
- **OpenClaw integration** -- Your AI PA handles classify, route, search, and interrogate
- **Team + Personal modes** -- Run as a team hub or a personal AI assistant

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/RPLogic-Inc/mypa.git
cd mypa
bash scripts/setup.sh
```

That's it. Open **http://localhost** and register your first account.

### Manual Setup (without Docker)

```bash
# Prerequisites: Node.js 20+

# Backend
cd backend && npm install && cp .env.example .env && npm run dev

# Relay (new terminal)
cd relay && npm install && cp .env.example .env && npm run dev

# Canvas (new terminal)
cd canvas && npm install && npm run dev
```

Canvas opens at **http://localhost:5174**.

## Architecture

```
Canvas (React SPA)
  │
  ├── /api/auth, /api/cards, /api/library, /api/pa → Backend (:3001)
  │     Express + Drizzle + SQLite
  │     Cards, Library, TIP, Auth, OpenClaw proxy
  │
  ├── /api/* (relay routes) → Relay (:3002)
  │     Express + Drizzle + SQLite
  │     Teams, Contacts, Conversations, Federation
  │
  └── OpenClaw Gateway (:18789, optional)
        AI brain, voice, TTS, memory, tools
```

All services use SQLite (no external database needed) and share a JWT secret for auth.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *(required)* | Shared JWT signing secret |
| `APP_NAME` | `MyPA` | Display name (white-label) |
| `APP_SLUG` | `mypa` | Lowercase slug for JWT issuer |
| `INSTANCE_MODE` | `team` | `team` (multi-user) or `personal` (single-user hub) |
| `OPENCLAW_URL` | -- | OpenClaw Gateway URL (optional) |
| `OPENCLAW_TOKEN` | -- | Gateway auth token (optional) |
| `OPENAI_API_KEY` | -- | For Whisper transcription + TIP (optional) |
| `RELAY_URL` | `http://localhost:3002` | Relay service URL |
| `APP_URL` | `http://localhost:5174` | Public URL (for invite links) |

See [`.env.example`](.env.example) for the full list.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| **Backend** | 3001 | API server -- cards, library, auth, TIP, OpenClaw proxy |
| **Relay** | 3002 | Messaging -- teams, contacts, conversations, federation |
| **PA Workspace** | 3003 | Google Workspace integration (optional) |
| **Canvas** | 80/5174 | React frontend |

## Self-Hosting

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for:
- Custom domain + SSL setup
- OpenClaw installation
- Email configuration
- Backup and restore
- Federation between instances

## Deploy to DigitalOcean

Click the button above or use the CLI:

```bash
doctl apps create --spec .do/app.yaml
```

For a VPS with OpenClaw included, DigitalOcean has a [1-Click OpenClaw Marketplace image](https://marketplace.digitalocean.com/apps/openclaw) you can install MyPA on top of.

## Development

```bash
# Run all tests
cd backend && npm test      # Backend (vitest)
cd relay && npm test        # Relay
cd pa-workspace && npm test # PA Workspace

# Type check
cd backend && npx tsc --noEmit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Project Structure

```
mypa/
├── backend/        # API server (Express + Drizzle + SQLite)
├── relay/          # Messaging relay (federation, teams, contacts)
├── pa-workspace/   # Google Workspace integration (optional)
├── canvas/         # React frontend (Vite + Tailwind)
├── extensions/     # OpenClaw channel plugins
├── skills/         # OpenClaw skill definitions
├── docs/           # Architecture, self-hosting, protocol spec
├── scripts/        # Setup and deployment helpers
└── deploy/         # Nginx configs, provisioning scripts
```

## License

[AGPL-3.0](LICENSE) -- Free to use, modify, and self-host. If you modify and offer MyPA as a network service, you must share your modifications under the same license.

## Links

- [Self-Hosting Guide](docs/SELF_HOSTING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Tezit Protocol Spec](docs/tezit-protocol-spec/)
