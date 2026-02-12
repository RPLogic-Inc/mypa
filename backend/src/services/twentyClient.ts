import { logger } from "../middleware/logging.js";

export type TwentyEntityType = "person" | "opportunity" | "task";

export interface TwentyClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface TwentyConnectionStatus {
  configured: boolean;
  baseUrl?: string;
  reason?: string;
}

export interface TwentyListResult {
  items: unknown[];
  total: number;
}

export interface TezContextLayerSuggestion {
  type: "text";
  content: string;
  query: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
export const TWENTY_ENTITY_ENDPOINTS: Record<TwentyEntityType, string> = {
  person: "/rest/people",
  opportunity: "/rest/opportunities",
  task: "/rest/tasks",
};

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function normalizeServiceBaseUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }

    // Preserve sub-paths for reverse-proxy deployments.
    const path = parsed.pathname === "/" ? "" : trimTrailingSlash(parsed.pathname);
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}

export function getTwentyConnectionStatus(): TwentyConnectionStatus {
  const rawBase = process.env.TWENTY_API_URL || "";
  const apiKey = process.env.TWENTY_API_KEY || "";

  if (!rawBase || !apiKey) {
    return {
      configured: false,
      reason: "TWENTY_API_URL and TWENTY_API_KEY must both be set",
    };
  }

  const baseUrl = normalizeServiceBaseUrl(rawBase);
  if (!baseUrl) {
    return {
      configured: false,
      reason: "Invalid TWENTY_API_URL",
    };
  }

  return { configured: true, baseUrl };
}

export function getTwentyClientConfig(): TwentyClientConfig {
  const status = getTwentyConnectionStatus();
  if (!status.configured || !status.baseUrl) {
    throw new Error(status.reason || "Twenty CRM is not configured");
  }

  const apiKey = process.env.TWENTY_API_KEY || "";
  return {
    baseUrl: status.baseUrl,
    apiKey,
  };
}

function extractListItems(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  if (typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    if (Array.isArray(value.data)) return value.data;
    if (value.data && typeof value.data === "object") {
      const nested = value.data as Record<string, unknown>;
      if (Array.isArray(nested.items)) return nested.items;
      if (Array.isArray(nested.records)) return nested.records;
      if (Array.isArray(nested.people)) return nested.people;
      if (Array.isArray(nested.opportunities)) return nested.opportunities;
      if (Array.isArray(nested.tasks)) return nested.tasks;
    }
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.records)) return value.records;
    if (Array.isArray(value.people)) return value.people;
    if (Array.isArray(value.opportunities)) return value.opportunities;
    if (Array.isArray(value.tasks)) return value.tasks;
  }

  return [];
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function extractListTotal(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const root = payload as Record<string, unknown>;
  const directCandidates = [root.total, root.totalCount, root.count];
  for (const candidate of directCandidates) {
    const parsed = toPositiveInteger(candidate);
    if (parsed !== null) {
      return Math.max(parsed, fallback);
    }
  }

  const nestedCandidates = [root.data, root.meta, root.pagination];
  for (const nested of nestedCandidates) {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const value = nested as Record<string, unknown>;
    for (const candidate of [value.total, value.totalCount, value.count]) {
      const parsed = toPositiveInteger(candidate);
      if (parsed !== null) {
        return Math.max(parsed, fallback);
      }
    }
  }

  return fallback;
}

function extractEntity(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;

  if (typeof payload === "object" && !Array.isArray(payload)) {
    const root = payload as Record<string, unknown>;
    if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
      return root.data as Record<string, unknown>;
    }
    return root;
  }

  return null;
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      params.set(key, `${value}`);
    }
  }

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function twentyRequest(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
  } = {},
): Promise<{
  status: number;
  ok: boolean;
  payload: unknown;
}> {
  const method = options.method || "GET";
  const cfg = getTwentyClientConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const url = `${cfg.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    let payload: unknown = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      payload = await response.text().catch(() => null);
    }

    return {
      status: response.status,
      ok: response.ok,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listTwentyEntities(
  entityType: TwentyEntityType,
  options: { q?: string; limit?: number; offset?: number } = {}
): Promise<TwentyListResult> {
  const endpoint = TWENTY_ENTITY_ENDPOINTS[entityType];

  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const offset = Math.max(0, options.offset || 0);
  const q = options.q?.trim();

  const requestPath = withQuery(endpoint, {
    limit,
    offset,
    q,
    search: q,
  });

  const response = await twentyRequest(requestPath);
  if (!response.ok) {
    throw new Error(`Twenty ${entityType} list failed (${response.status})`);
  }

  const items = extractListItems(response.payload);
  const total = extractListTotal(response.payload, items.length);
  return {
    items,
    total,
  };
}

export async function getTwentyEntityById(entityType: TwentyEntityType, entityId: string): Promise<Record<string, unknown>> {
  const endpoint = TWENTY_ENTITY_ENDPOINTS[entityType];
  const response = await twentyRequest(`${endpoint}/${encodeURIComponent(entityId)}`);

  if (response.status === 404) {
    throw new Error(`Twenty ${entityType} not found`);
  }
  if (!response.ok) {
    throw new Error(`Twenty ${entityType} fetch failed (${response.status})`);
  }

  const entity = extractEntity(response.payload);
  if (!entity) {
    throw new Error(`Invalid Twenty ${entityType} payload`);
  }
  return entity;
}

export async function createTwentyEntity(
  entityType: TwentyEntityType,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = TWENTY_ENTITY_ENDPOINTS[entityType];
  const response = await twentyRequest(endpoint, {
    method: "POST",
    body: payload,
  });

  if (response.status === 404) {
    throw new Error(`Twenty ${entityType} not found`);
  }
  if (!response.ok) {
    throw new Error(`Twenty ${entityType} create failed (${response.status})`);
  }

  const entity = extractEntity(response.payload);
  if (!entity) {
    throw new Error(`Invalid Twenty ${entityType} create payload`);
  }
  return entity;
}

export async function updateTwentyEntity(
  entityType: TwentyEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const endpoint = TWENTY_ENTITY_ENDPOINTS[entityType];
  const response = await twentyRequest(`${endpoint}/${encodeURIComponent(entityId)}`, {
    method: "PATCH",
    body: payload,
  });

  if (response.status === 404) {
    throw new Error(`Twenty ${entityType} not found`);
  }
  if (!response.ok) {
    throw new Error(`Twenty ${entityType} update failed (${response.status})`);
  }

  const entity = extractEntity(response.payload);
  if (!entity) {
    throw new Error(`Invalid Twenty ${entityType} update payload`);
  }
  return entity;
}

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function summarizePerson(entity: Record<string, unknown>): { content: string; query: string } {
  const id = getString(entity, ["id"]) || "unknown";
  const name =
    getString(entity, ["name", "displayName", "fullName"]) ||
    [getString(entity, ["firstName"]), getString(entity, ["lastName"])].filter(Boolean).join(" ").trim() ||
    "Unnamed contact";
  const company = getString(entity, ["company", "companyName", "accountName"]);
  const stage = getString(entity, ["stage", "status", "lifecycleStage"]);
  const nextStep = getString(entity, ["nextStep", "nextAction", "next_action"]);

  const fields = [
    `contact_id=${id}`,
    `name=${name}`,
    company ? `company=${company}` : undefined,
    stage ? `status=${stage}` : undefined,
    nextStep ? `next_step=${nextStep}` : undefined,
  ].filter(Boolean);

  return {
    content: `CRM contact snapshot: ${fields.join(", ")}`,
    query: "Summarize this contact context, current status, and best next follow-up for the recipient PA.",
  };
}

function summarizeOpportunity(entity: Record<string, unknown>): { content: string; query: string } {
  const id = getString(entity, ["id"]) || "unknown";
  const title = getString(entity, ["name", "title"]) || "Untitled opportunity";
  const stage = getString(entity, ["stage", "status"]) || "unknown";
  const amount = getString(entity, ["amount", "value", "estimatedValue"]);
  const closeDate = getString(entity, ["closeDate", "targetCloseDate", "target_date"]);
  const nextStep = getString(entity, ["nextStep", "nextAction", "next_action"]);

  const fields = [
    `opportunity_id=${id}`,
    `title=${title}`,
    `stage=${stage}`,
    amount ? `amount=${amount}` : undefined,
    closeDate ? `close_date=${closeDate}` : undefined,
    nextStep ? `next_step=${nextStep}` : undefined,
  ].filter(Boolean);

  return {
    content: `CRM opportunity snapshot: ${fields.join(", ")}`,
    query: "Explain blockers, leverage points, and immediate actions to move this opportunity forward.",
  };
}

function summarizeTask(entity: Record<string, unknown>): { content: string; query: string } {
  const id = getString(entity, ["id"]) || "unknown";
  const title = getString(entity, ["title", "name"]) || "Untitled task";
  const status = getString(entity, ["status", "state"]) || "unknown";
  const dueDate = getString(entity, ["dueDate", "due_at", "dueAt"]);
  const assignee = getString(entity, ["assigneeName", "ownerName", "assignedTo"]);

  const fields = [
    `task_id=${id}`,
    `title=${title}`,
    `status=${status}`,
    dueDate ? `due_date=${dueDate}` : undefined,
    assignee ? `assignee=${assignee}` : undefined,
  ].filter(Boolean);

  return {
    content: `CRM task snapshot: ${fields.join(", ")}`,
    query: "Summarize urgency, owner responsibilities, and recommended completion plan.",
  };
}

export function buildTezContextLayerFromTwenty(
  entityType: TwentyEntityType,
  entity: Record<string, unknown>
): TezContextLayerSuggestion {
  let summary: { content: string; query: string };
  switch (entityType) {
    case "person":
      summary = summarizePerson(entity);
      break;
    case "opportunity":
      summary = summarizeOpportunity(entity);
      break;
    case "task":
      summary = summarizeTask(entity);
      break;
    default:
      summary = {
        content: "CRM snapshot available.",
        query: "Summarize this CRM context.",
      };
  }

  const content = summary.content.slice(0, 4000);
  return {
    type: "text",
    content,
    query: summary.query,
  };
}

export async function verifyTwentyConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const result = await listTwentyEntities("person", { limit: 1 });
    return {
      success: true,
      message: `Twenty CRM reachable (${result.total} record(s) in sample query)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("Twenty connection check failed", { message });
    return {
      success: false,
      message,
    };
  }
}
