/**
 * CRM Connectivity Checker
 *
 * Deep TypeScript-level verification of Twenty CRM and PA Workspace.
 * Uses the actual client code paths to validate configuration and connectivity.
 *
 * Usage:
 *   npm run crm:check        # check all integrations
 *
 * Exit codes:
 *   0  All configured services are reachable
 *   1  Twenty CRM not configured
 *   2  Twenty CRM configured but unreachable
 *   3  Unexpected error
 */
import 'dotenv/config';
import {
  getTwentyConnectionStatus,
  verifyTwentyConnection,
  normalizeServiceBaseUrl,
} from '../src/services/twentyClient.ts';

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const C = '\x1b[36m';
const N = '\x1b[0m';

function ok(msg: string) { console.log(`${G}[OK]${N}    ${msg}`); }
function warn(msg: string) { console.log(`${Y}[WARN]${N}  ${msg}`); }
function fail(msg: string) { console.error(`${R}[FAIL]${N}  ${msg}`); }
function info(msg: string) { console.log(`${C}[INFO]${N}  ${msg}`); }

async function checkTwenty(): Promise<boolean> {
  info('Checking Twenty CRM...');

  const status = getTwentyConnectionStatus();
  if (!status.configured) {
    fail(`Twenty CRM not configured: ${status.reason ?? 'Unknown reason'}`);
    return false;
  }

  ok(`Twenty configured at ${status.baseUrl}`);

  const probe = await verifyTwentyConnection();
  if (!probe.success) {
    fail(`Twenty unreachable: ${probe.message}`);
    return false;
  }

  ok(`Twenty reachable: ${probe.message}`);
  return true;
}

async function checkPAWorkspace(): Promise<boolean> {
  info('Checking PA Workspace...');

  const raw = process.env.PA_WORKSPACE_API_URL || '';
  if (!raw) {
    warn('PA_WORKSPACE_API_URL not set — email/calendar features unavailable');
    return false;
  }

  const baseUrl = normalizeServiceBaseUrl(raw);
  if (!baseUrl) {
    fail(`Invalid PA_WORKSPACE_API_URL: ${raw}`);
    return false;
  }

  ok(`PA Workspace configured at ${baseUrl}`);

  // Probe health endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    for (const path of ['/health', '/api/health']) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        ok(`PA Workspace reachable (${path} → HTTP ${res.status})`);
        return true;
      } catch {
        // Try next path
      }
    }

    clearTimeout(timeout);
    fail('PA Workspace not reachable (no health endpoint responded)');
    return false;
  } catch (err) {
    fail(`PA Workspace check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  console.log('');
  console.log('  CRM Connectivity Check (TypeScript-level)');
  console.log('  ─────────────────────────────────────────');
  console.log('');

  const twentyOk = await checkTwenty();

  console.log('');

  const paOk = await checkPAWorkspace();

  console.log('');
  console.log('  ─────────────────────────────────────────');

  if (twentyOk && paOk) {
    ok('All integrations operational');
  } else if (twentyOk) {
    warn('Twenty CRM OK — PA Workspace unavailable (optional)');
  } else {
    fail('Twenty CRM not operational — CRM features disabled');
  }

  console.log('');

  // Exit code based on Twenty (required) — PA is optional
  if (!twentyOk) {
    const status = getTwentyConnectionStatus();
    process.exit(status.configured ? 2 : 1);
  }
}

main().catch((err) => {
  fail(`CRM CHECK FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
});
