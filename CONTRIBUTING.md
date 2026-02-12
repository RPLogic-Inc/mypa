# Contributing to MyPA

Thanks for your interest in contributing! MyPA is an open-source AI-powered team communication platform built on the Tez protocol.

## Getting Started

### Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm** (comes with Node.js)
- **Docker** (optional, for containerized development)

### Local Development (without Docker)

```bash
# Clone the repo
git clone https://github.com/RPLogic-Inc/mypa.git
cd mypa

# Install dependencies for all services
cd backend && npm install && cd ..
cd relay && npm install && cd ..
cd canvas && npm install && cd ..

# Copy example env files
cp backend/.env.example backend/.env
cp relay/.env.example relay/.env

# Start services (in separate terminals)
cd backend && npm run dev    # API server on :3001
cd relay && npm run dev      # Relay on :3002
cd canvas && npm run dev     # Canvas on :5174
```

### Local Development (with Docker)

```bash
bash scripts/setup.sh     # Generates .env, starts all services
# Canvas: http://localhost
```

### Running Tests

```bash
cd backend && npm test         # Backend tests (vitest)
cd relay && npm test           # Relay tests
cd pa-workspace && npm test    # PA Workspace tests (138 tests)
```

## Project Structure

```
mypa/
├── backend/        # API server (Express + Drizzle + SQLite)
├── relay/          # Messaging relay (teams, contacts, federation)
├── pa-workspace/   # Google Workspace integration (optional)
├── canvas/         # React frontend (Vite + Tailwind)
├── extensions/     # OpenClaw channel plugins
├── skills/         # OpenClaw skill definitions
├── docs/           # Architecture, self-hosting, protocol spec
└── deploy/         # Nginx configs, provisioning scripts
```

## Code Conventions

- **TypeScript** everywhere (strict mode)
- **ESM imports** with `.js` extensions in backend (required for Node.js ESM)
- **Zod** for all input validation (see `backend/src/middleware/validation.ts`)
- **Drizzle ORM** for database access (no raw SQL)
- **Vitest** for testing
- Use `APP_NAME` / `APP_SLUG` from config — never hardcode brand names
- Follow existing patterns in the codebase

## Making Changes

1. **Fork** the repo and create a feature branch
2. **Read** existing code before modifying — understand the patterns
3. **Add tests** for new endpoints or services
4. **Run tests** before submitting: `cd backend && npm test`
5. **Keep changes focused** — one feature or fix per PR

## Pull Request Process

1. Create a PR against `main`
2. Describe what changed and why
3. Link related issues
4. Ensure CI passes (tests + TypeScript compilation)
5. A maintainer will review and merge

## Key Concepts

- **Tez** (plural: tezits) — A message with a context iceberg. Surface text + layers of supporting information.
- **TIP** (Tez Interrogation Protocol) — Ask questions answered from transmitted context only.
- **Library** — FTS5 full-text search across all preserved context.
- **Federation** — Server-to-server communication between MyPA instances.
- **OpenClaw** — The AI runtime that powers the PA. MyPA is a data service; OpenClaw is the brain.

## Reporting Issues

- **Bugs:** Open a [GitHub Issue](https://github.com/RPLogic-Inc/mypa/issues)
- **Security:** See [SECURITY.md](SECURITY.md)
- **Questions:** Use [GitHub Discussions](https://github.com/RPLogic-Inc/mypa/discussions)

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
