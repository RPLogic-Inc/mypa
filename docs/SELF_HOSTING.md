# Self-Hosting MyPA

This guide covers running MyPA on your own infrastructure.

## Quick Start (Docker Compose)

```bash
git clone https://github.com/mypa-chat/mypa.git
cd mypa
bash scripts/setup.sh
```

Open **http://localhost** and register your first account.

### What `setup.sh` Does

1. Copies `.env.example` to `.env`
2. Generates a random `JWT_SECRET`
3. Creates data directories for SQLite databases
4. Runs `docker compose up -d --build`

### Stopping and Starting

```bash
docker compose down          # Stop all services
docker compose up -d         # Start (no rebuild)
docker compose up -d --build # Start with rebuild
docker compose logs -f       # View logs
```

---

## Custom Domain + SSL

### With Caddy (simplest)

1. Install [Caddy](https://caddyserver.com/docs/install)
2. Create `Caddyfile`:

```
myteam.example.com {
    handle /api/auth/* {
        reverse_proxy localhost:3001
    }
    handle /api/users/* {
        reverse_proxy localhost:3001
    }
    handle /api/cards/* {
        reverse_proxy localhost:3001
    }
    handle /api/library/* {
        reverse_proxy localhost:3001
    }
    handle /api/pa/* {
        reverse_proxy localhost:3001
    }
    handle /api/settings/* {
        reverse_proxy localhost:3001
    }
    handle /api/openclaw/* {
        reverse_proxy localhost:3001
    }
    handle /api/invites/* {
        reverse_proxy localhost:3001
    }
    handle /api/onboarding/* {
        reverse_proxy localhost:3001
    }
    handle /api/tez/* {
        reverse_proxy localhost:3001
    }
    handle /api/files/* {
        reverse_proxy localhost:3001
    }
    handle /api/admin/* {
        reverse_proxy localhost:3001
    }
    handle /health/* {
        reverse_proxy localhost:3001
    }
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:3002
    }
    handle {
        reverse_proxy localhost:80
    }
}
```

3. Update `.env`:
```bash
APP_URL=https://myteam.example.com
VITE_BASE_DOMAIN=myteam.example.com
```

4. Rebuild canvas with the new domain:
```bash
docker compose up -d --build canvas
```

5. Start Caddy:
```bash
caddy run
```

Caddy automatically handles SSL via Let's Encrypt.

### With Nginx + certbot

See `deploy/nginx-configs/nginx-team-template.conf` for a production-ready nginx config template. Replace `${TEAM_DOMAIN}` with your domain and use certbot for SSL certificates.

---

## OpenClaw Setup

MyPA works without OpenClaw (pure data mode), but the AI PA features require it.

### Install OpenClaw

Follow the [official installation guide](https://docs.openclaw.ai/install).

Or use the DigitalOcean [1-Click Marketplace image](https://marketplace.digitalocean.com/apps/openclaw).

### Connect to MyPA

Add to your `.env`:

```bash
OPENCLAW_URL=http://localhost:18789   # or http://host.docker.internal:18789 in Docker
OPENCLAW_TOKEN=your-gateway-token     # from openclaw.json
```

### Install the MyPA Skill

Copy the skill to your OpenClaw workspace:

```bash
cp -r skills/mypa ~/.openclaw/workspace/skills/mypa
```

Set the skill's environment variables in OpenClaw's `.env`:

```bash
MYPA_API_URL=http://localhost:3001
MYPA_EMAIL=your-email@example.com
MYPA_PASSWORD=your-password
RELAY_URL=http://localhost:3002
```

---

## Email Configuration

MyPA sends emails for password reset, email verification, and team invites.

### Option 1: PA Workspace (Google Workspace)

If you have Google Workspace with domain-wide delegation:

1. Uncomment the `pa-workspace` service in `docker-compose.yml`
2. Configure the service account in `pa-workspace/.env`
3. Set `PA_WORKSPACE_API_URL=http://pa-workspace:3003` in backend `.env`

### Option 2: SMTP (coming soon)

SMTP support via nodemailer is planned.

### Option 3: Console (default)

Without email configuration, password reset tokens are logged to the console. Check `docker compose logs backend` to find them.

---

## Backup and Restore

MyPA uses SQLite. Backup is as simple as copying files.

### Backup

```bash
# Stop services to ensure consistency
docker compose stop

# Copy database files
cp -r data/ backup-$(date +%Y%m%d)/

# Restart
docker compose start
```

### Restore

```bash
docker compose stop
cp -r backup-20260212/* data/
docker compose start
```

### Automated Backups

For production, consider [Litestream](https://litestream.io/) for continuous SQLite replication to S3/DO Spaces.

---

## Federation

Federation allows multiple MyPA instances to communicate (like email servers).

### Enable Federation

In the relay `.env`:

```bash
FEDERATION_ENABLED=true
RELAY_HOST=myteam.example.com
```

### Connect to Another Instance

Federation uses the Tezit Protocol for server-to-server trust and message delivery. See [docs/tezit-protocol-spec/](tezit-protocol-spec/) for the full specification.

---

## Upgrading

```bash
cd mypa
git pull
docker compose up -d --build
```

SQLite schema migrations run automatically via Drizzle ORM on service startup.

---

## Troubleshooting

### Services won't start

Check logs: `docker compose logs backend` or `docker compose logs relay`

### Database locked errors

SQLite doesn't support concurrent writers. Ensure only one backend process runs per database file (no cluster mode).

### Canvas shows blank page

1. Check that backend and relay are healthy: `curl http://localhost:3001/health/live`
2. Check browser console for CORS errors
3. Verify `VITE_BASE_DOMAIN` matches your domain

### OpenClaw proxy returns 401

The gateway token rotates. Check `~/.openclaw/openclaw.json` for the current token and update `OPENCLAW_TOKEN` in `.env`.
