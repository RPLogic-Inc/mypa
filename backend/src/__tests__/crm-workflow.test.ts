import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import cors from "cors";
import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "crypto";
import { generateTokens } from "../services/jwt.js";
import { clearRateLimitStore } from "../middleware/rateLimit.js";

let testClient: Client;
let app: Express;
let testAccessToken: string;

const originalTwentyApiUrl = process.env.TWENTY_API_URL;
const originalTwentyApiKey = process.env.TWENTY_API_KEY;
const originalPaWorkspaceApiUrl = process.env.PA_WORKSPACE_API_URL;
const originalOpenClawToken = process.env.OPENCLAW_TOKEN;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function parseRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

async function createTables(client: Client) {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      roles TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      department TEXT NOT NULL,
      team_id TEXT,
      manager_id TEXT,
      openclaw_agent_id TEXT,
      notification_prefs TEXT,
      pa_preferences TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      ai_consent_given INTEGER DEFAULT 0,
      ai_consent_date INTEGER,
      email_verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT NOT NULL REFERENCES users(id),
      skill TEXT NOT NULL,
      PRIMARY KEY (user_id, skill)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER
    );
  `);
}

async function createTestUser(client: Client): Promise<{ id: string; email: string; name: string }> {
  const userId = randomUUID();
  const email = "crm-workflow@test.com";
  const name = "CRM Workflow Tester";
  const now = Date.now();

  await client.execute({
    sql: `INSERT INTO users (id, name, email, department, roles, skills, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, name, email, "Operations", JSON.stringify(["member"]), JSON.stringify(["crm"]), now, now],
  });

  return { id: userId, email, name };
}

async function createTestApp(): Promise<Express> {
  const testApp = express();
  testApp.use(cors());
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    req.requestId = randomUUID();
    next();
  });

  const { crmRoutes } = await import("../routes/crm.js");
  testApp.use("/api/crm", crmRoutes);
  return testApp;
}

describe("CRM Workflow Routes", () => {
  beforeAll(async () => {
    process.env.TWENTY_API_URL = "https://twenty.example.com";
    process.env.TWENTY_API_KEY = "twenty-test-key";
    process.env.PA_WORKSPACE_API_URL = "https://workspace.example.com";
    delete process.env.OPENCLAW_TOKEN;

    testClient = createClient({ url: "file::memory:?cache=shared" });
    await createTables(testClient);
    app = await createTestApp();

    const user = await createTestUser(testClient);
    const tokens = await generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
    });
    testAccessToken = tokens.accessToken;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    testClient.close();
    process.env.TWENTY_API_URL = originalTwentyApiUrl;
    process.env.TWENTY_API_KEY = originalTwentyApiKey;
    process.env.PA_WORKSPACE_API_URL = originalPaWorkspaceApiUrl;
    if (originalOpenClawToken === undefined) {
      delete process.env.OPENCLAW_TOKEN;
    } else {
      process.env.OPENCLAW_TOKEN = originalOpenClawToken;
    }
  });

  beforeEach(() => {
    clearRateLimitStore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns coordination bundle in dry-run mode without executing workspace actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = parseRequestUrl(input);
      if (url === "https://twenty.example.com/rest/tasks/task_123") {
        return jsonResponse({
          data: {
            id: "task_123",
            title: "Follow up with ACME",
            status: "todo",
            dueDate: "2026-02-11",
          },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app)
      .post("/api/crm/workflows/coordinate")
      .set("Authorization", `Bearer ${testAccessToken}`)
      .send({
        entityType: "task",
        entityId: "task_123",
        objective: "Coordinate follow-up handoff",
        tez: {
          type: "escalation",
        },
        openclaw: {
          enabled: false,
        },
        googleWorkspace: {
          enabled: true,
          sendEmail: true,
          logCalendar: true,
          paEmail: "pa@myPA.chat",
          emailTo: "owner@example.com",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.entityType).toBe("task");
    expect(response.body.data.entityId).toBe("task_123");
    expect(response.body.data.tezDraft.type).toBe("handoff");
    expect(response.body.data.googleWorkspace.enabled).toBe(true);
    expect(response.body.data.googleWorkspace.dryRun).toBe(true);
    expect(response.body.data.googleWorkspace.emailResult).toBeNull();
    expect(response.body.data.googleWorkspace.calendarResult).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("executes workspace email and calendar actions when dryRun is false", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseRequestUrl(input);

      if (url === "https://twenty.example.com/rest/people/person_42") {
        return jsonResponse({
          data: {
            id: "person_42",
            name: "Taylor Ops",
            companyName: "MyPA",
            status: "active",
          },
        });
      }

      if (url === "https://workspace.example.com/api/email/send") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body.paEmail).toBe("assistant@myPA.chat");
        expect(body.to).toBe("teammate@example.com");
        expect(body.subject).toBe("CRM follow-up plan");
        expect(body.body).toContain("Objective:");
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${testAccessToken}`,
        });
        return jsonResponse({
          data: {
            messageId: "email_123",
          },
        });
      }

      if (url === "https://workspace.example.com/api/calendar/log-action") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body.paEmail).toBe("assistant@myPA.chat");
        expect(body.actionType).toBe("crm_follow_up");
        expect(body.summary).toBe("CRM sync call");
        expect(body.durationMs).toBe(900000);
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${testAccessToken}`,
        });
        return jsonResponse({
          data: {
            eventId: "event_123",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app)
      .post("/api/crm/workflows/coordinate")
      .set("Authorization", `Bearer ${testAccessToken}`)
      .send({
        entityType: "person",
        entityId: "person_42",
        objective: "Get aligned on next client touchpoint",
        openclaw: {
          enabled: false,
        },
        googleWorkspace: {
          enabled: true,
          dryRun: false,
          sendEmail: true,
          logCalendar: true,
          paEmail: "assistant@myPA.chat",
          emailTo: "teammate@example.com",
          emailSubject: "CRM follow-up plan",
          emailBody: "Objective: align and send recap",
          calendarSummary: "CRM sync call",
          durationMs: 900000,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.entityType).toBe("person");
    expect(response.body.data.entityId).toBe("person_42");
    expect(response.body.data.googleWorkspace.enabled).toBe(true);
    expect(response.body.data.googleWorkspace.dryRun).toBe(false);
    expect(response.body.data.googleWorkspace.emailResult.attempted).toBe(true);
    expect(response.body.data.googleWorkspace.emailResult.success).toBe(true);
    expect(response.body.data.googleWorkspace.calendarResult.attempted).toBe(true);
    expect(response.body.data.googleWorkspace.calendarResult.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
