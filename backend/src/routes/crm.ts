import { Request, Response as ExpressResponse, Router } from "express";
import {
  buildTezContextLayerFromTwenty,
  createTwentyEntity,
  getTwentyConnectionStatus,
  getTwentyEntityById,
  listTwentyEntities,
  normalizeServiceBaseUrl,
  type TwentyEntityType,
  updateTwentyEntity,
  verifyTwentyConnection,
} from "../services/twentyClient.js";
import { authenticate, logger, schemas, standardRateLimit, validate } from "../middleware/index.js";

export const crmRoutes = Router();

crmRoutes.use(standardRateLimit);
crmRoutes.use(authenticate);
// Policy: CRM is a team-shared resource in single-tenant-per-team deployments.

const DEFAULT_TIMEOUT_MS = 8000;

type RelayContextLayerType = "background" | "fact" | "artifact" | "relationship" | "constraint" | "hint";
type RelayContextSource = "stated" | "inferred" | "verified";

interface RelayContextLayer {
  layer: RelayContextLayerType;
  content: string;
  source?: RelayContextSource;
}

interface OpenClawPlanResult {
  available: boolean;
  generated: boolean;
  message: string;
  model?: string;
  summary?: string;
}

interface WorkspaceCallResult {
  attempted: boolean;
  success: boolean;
  status?: number;
  message: string;
  payload?: unknown;
}

type RelayTezType = "note" | "decision" | "handoff" | "question" | "update";

function normalizeRelayTezType(value: unknown): RelayTezType {
  if (value === "note" || value === "decision" || value === "handoff" || value === "question" || value === "update") {
    return value;
  }
  // "escalation" is accepted at workflow-input level and mapped to a relay-compatible type.
  if (value === "escalation") {
    return "handoff";
  }
  return "handoff";
}

function getPaWorkspaceStatus(): { configured: boolean; baseUrl?: string; reason?: string } {
  const raw = process.env.PA_WORKSPACE_API_URL || "";
  if (!raw) {
    return {
      configured: false,
      reason: "PA_WORKSPACE_API_URL is not set",
    };
  }

  const baseUrl = normalizeServiceBaseUrl(raw);
  if (!baseUrl) {
    return {
      configured: false,
      reason: "Invalid PA_WORKSPACE_API_URL",
    };
  }

  return {
    configured: true,
    baseUrl,
  };
}

function notConfiguredResponse(res: ExpressResponse): ExpressResponse {
  const status = getTwentyConnectionStatus();
  return res.status(503).json({
    error: {
      code: "TWENTY_NOT_CONFIGURED",
      message: status.reason || "Twenty CRM is not configured",
    },
  });
}

function summarizeEntity(entityType: TwentyEntityType, record: unknown): Record<string, unknown> {
  const entity = (record && typeof record === "object" ? record : {}) as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = entity[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  };

  if (entityType === "person") {
    // Twenty uses structured name: { firstName, lastName }
    const nameObj = entity["name"];
    let personName = pick("name", "displayName", "fullName");
    if (!personName && nameObj && typeof nameObj === "object") {
      const n = nameObj as Record<string, unknown>;
      const parts = [n.firstName, n.lastName].filter((p) => typeof p === "string" && p.trim().length > 0);
      personName = parts.join(" ") || null;
    }
    if (!personName) {
      personName = [pick("firstName"), pick("lastName")].filter(Boolean).join(" ") || null;
    }

    // Twenty uses structured emails: { primaryEmail }
    const emailsObj = entity["emails"];
    let email: string | null = pick("email", "primaryEmail");
    if (!email && emailsObj && typeof emailsObj === "object") {
      const e = (emailsObj as Record<string, unknown>).primaryEmail;
      if (typeof e === "string" && e.trim().length > 0) email = e.trim();
    }

    // Twenty uses structured phones: { primaryPhoneNumber }
    const phonesObj = entity["phones"];
    let phone: string | null = pick("phone", "primaryPhoneNumber");
    if (!phone && phonesObj && typeof phonesObj === "object") {
      const p = (phonesObj as Record<string, unknown>).primaryPhoneNumber;
      if (typeof p === "string" && p.trim().length > 0) phone = p.trim();
    }

    return {
      id: pick("id"),
      name: personName,
      email,
      phone,
      company: pick("company", "companyName", "accountName"),
      city: pick("city"),
      jobTitle: pick("jobTitle"),
      status: pick("status", "stage", "lifecycleStage"),
      updatedAt: pick("updatedAt", "updated_at"),
    };
  }

  if (entityType === "opportunity") {
    return {
      id: pick("id"),
      title: pick("title", "name"),
      stage: pick("stage", "status"),
      amount: pick("amount", "value", "estimatedValue"),
      closeDate: pick("closeDate", "targetCloseDate", "target_date"),
      updatedAt: pick("updatedAt", "updated_at"),
    };
  }

  return {
    id: pick("id"),
    title: pick("title", "name"),
    status: pick("status", "state"),
    dueDate: pick("dueDate", "dueAt", "due_at"),
    assignee: pick("assigneeName", "ownerName", "assignedTo"),
    updatedAt: pick("updatedAt", "updated_at"),
  };
}

function summaryLabel(summary: Record<string, unknown>): string {
  const candidates = ["name", "title", "id"];
  for (const key of candidates) {
    const value = summary[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "CRM record";
}

function buildRelayContextLayers(content: string, query?: string): RelayContextLayer[] {
  const layers: RelayContextLayer[] = [
    {
      layer: "artifact",
      content,
      source: "verified",
    },
  ];

  if (query && query.trim().length > 0) {
    layers.push({
      layer: "hint",
      content: query.trim(),
      source: "inferred",
    });
  }

  return layers;
}

function buildTezSurfaceText(
  entityType: TwentyEntityType,
  summary: Record<string, unknown>,
  objective: string,
  openClawSummary?: string,
): string {
  const baseLabel = summaryLabel(summary);
  const head = `CRM ${entityType} handoff for ${baseLabel}: ${objective.trim()}`;
  if (openClawSummary && openClawSummary.trim().length > 0) {
    return `${head}\n\nOpenClaw plan:\n${openClawSummary.trim()}`.slice(0, 5000);
  }
  return head.slice(0, 5000);
}

function extractOpenClawText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const choice = choices[0];
  if (!choice || typeof choice !== "object") return null;

  const message = (choice as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return null;

  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const text = (item as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim().length > 0) {
        parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n").trim();
  }

  return null;
}

async function generateOpenClawPlan(params: {
  entityType: TwentyEntityType;
  entitySummary: Record<string, unknown>;
  contextLayerContent: string;
  objective: string;
  model?: string;
  temperature?: number;
  enabled: boolean;
}): Promise<OpenClawPlanResult> {
  if (!params.enabled) {
    return {
      available: !!process.env.OPENCLAW_TOKEN,
      generated: false,
      message: "OpenClaw planning disabled by request",
    };
  }

  const openclawToken = process.env.OPENCLAW_TOKEN;
  if (!openclawToken) {
    return {
      available: false,
      generated: false,
      message: "OpenClaw is not configured",
    };
  }

  const openclawUrl = process.env.OPENCLAW_URL || "http://localhost:18789";
  const model = params.model || process.env.OPENCLAW_DEFAULT_MODEL || "gpt-4.1-mini";
  const temperature = typeof params.temperature === "number" ? params.temperature : 0.2;

  const prompt = [
    `Objective: ${params.objective}`,
    `Entity type: ${params.entityType}`,
    `Entity summary: ${JSON.stringify(params.entitySummary)}`,
    `Context: ${params.contextLayerContent}`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${openclawUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openclawToken}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature,
        messages: [
          {
            role: "system",
            content:
              "You are an operations planner. Return concise action guidance for PA workflow orchestration. Keep response under 140 words.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        available: true,
        generated: false,
        model,
        message: `OpenClaw request failed (${response.status})`,
      };
    }

    const summary = extractOpenClawText(payload);
    if (!summary) {
      return {
        available: true,
        generated: false,
        model,
        message: "OpenClaw response did not include assistant text",
      };
    }

    return {
      available: true,
      generated: true,
      model,
      summary,
      message: "OpenClaw plan generated",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      available: true,
      generated: false,
      model,
      message: `OpenClaw request failed: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload) return "";
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== "object") return null;
  const message = (error as Record<string, unknown>).message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message.trim();
  }
  return null;
}

async function parseHttpPayload(response: globalThis.Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callPaWorkspace(
  req: Request,
  path: string,
  body: Record<string, unknown>,
): Promise<WorkspaceCallResult> {
  const status = getPaWorkspaceStatus();
  if (!status.configured || !status.baseUrl) {
    return {
      attempted: false,
      success: false,
      message: status.reason || "PA Workspace is not configured",
    };
  }

  const incomingAuth = typeof req.headers.authorization === "string" ? req.headers.authorization : null;
  const serviceToken = process.env.PA_WORKSPACE_SERVICE_TOKEN;
  const authHeader = incomingAuth || (serviceToken ? `Bearer ${serviceToken}` : null);

  if (!authHeader) {
    return {
      attempted: false,
      success: false,
      message: "No auth token available for PA Workspace call",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${status.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await parseHttpPayload(response);

    if (!response.ok) {
      const message = extractErrorMessage(payload) || `PA Workspace call failed (${response.status})`;
      return {
        attempted: true,
        success: false,
        status: response.status,
        message,
        payload,
      };
    }

    return {
      attempted: true,
      success: true,
      status: response.status,
      message: "PA Workspace action completed",
      payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      attempted: true,
      success: false,
      message: `PA Workspace call failed: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyPaWorkspaceConnection(): Promise<{ configured: boolean; reachable: boolean; message: string }> {
  const status = getPaWorkspaceStatus();
  if (!status.configured || !status.baseUrl) {
    return {
      configured: false,
      reachable: false,
      message: status.reason || "PA Workspace not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${status.baseUrl}/health/ready`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        message: `PA Workspace health check failed (${response.status})`,
      };
    }

    return {
      configured: true,
      reachable: true,
      message: "PA Workspace reachable",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      configured: true,
      reachable: false,
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

function handleUpstreamError(
  res: ExpressResponse,
  entityType: TwentyEntityType,
  operation: string,
  error: unknown,
): ExpressResponse {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalized = message.toLowerCase();
  if (normalized.includes("not found") || message.includes("(404)")) {
    return res.status(404).json({
      error: {
        code: "CRM_ENTITY_NOT_FOUND",
        message: "CRM entity not found",
      },
    });
  }

  logger.error(`CRM ${entityType} ${operation} error`, error as Error);
  return res.status(502).json({
    error: {
      code: "CRM_UPSTREAM_ERROR",
      message: `Failed to ${operation} ${entityType} in Twenty CRM`,
      details: stringifyPayload({ message }),
    },
  });
}

/**
 * GET /api/crm/status
 * Returns configuration and connectivity health for Twenty CRM + coordination integrations.
 */
crmRoutes.get("/status", async (_req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    const paWorkspace = await verifyPaWorkspaceConnection();
    const openclawConfigured = !!process.env.OPENCLAW_TOKEN;

    if (!status.configured) {
      return res.json({
        data: {
          configured: false,
          reachable: false,
          reason: status.reason,
          openclawConfigured,
          paWorkspaceConfigured: paWorkspace.configured,
          paWorkspaceReachable: paWorkspace.reachable,
          paWorkspaceMessage: paWorkspace.message,
        },
      });
    }

    const check = await verifyTwentyConnection();
    res.json({
      data: {
        configured: true,
        reachable: check.success,
        message: check.message,
        openclawConfigured,
        paWorkspaceConfigured: paWorkspace.configured,
        paWorkspaceReachable: paWorkspace.reachable,
        paWorkspaceMessage: paWorkspace.message,
      },
    });
  } catch (error) {
    logger.error("CRM status error", error as Error);
    res.status(500).json({
      error: {
        code: "CRM_STATUS_ERROR",
        message: "Failed to check CRM status",
      },
    });
  }
});

/**
 * GET /api/crm/workflows/status
 * Dedicated status endpoint for orchestration UX.
 */
crmRoutes.get("/workflows/status", async (_req, res) => {
  try {
    const twenty = getTwentyConnectionStatus();
    const paWorkspace = await verifyPaWorkspaceConnection();
    res.json({
      data: {
        twenty: {
          configured: twenty.configured,
          reason: twenty.reason || null,
        },
        openclaw: {
          configured: !!process.env.OPENCLAW_TOKEN,
        },
        paWorkspace: {
          configured: paWorkspace.configured,
          reachable: paWorkspace.reachable,
          message: paWorkspace.message,
        },
      },
    });
  } catch (error) {
    logger.error("CRM workflow status error", error as Error);
    res.status(500).json({
      error: {
        code: "CRM_STATUS_ERROR",
        message: "Failed to check workflow integration status",
      },
    });
  }
});

/**
 * GET /api/crm/people
 * List/search contacts from Twenty CRM.
 */
crmRoutes.get("/people", validate({ query: schemas.crmListQuery }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);

    const result = await listTwentyEntities("person", { q, limit, offset });
    const items = result.items.map((item) => summarizeEntity("person", item));

    res.json({
      data: {
        items,
      },
      meta: {
        q: q || null,
        count: items.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error("CRM people list error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_UPSTREAM_ERROR",
        message: "Failed to fetch people from Twenty CRM",
      },
    });
  }
});

/**
 * POST /api/crm/people
 * Create a contact in Twenty CRM.
 */
crmRoutes.post("/people", validate({ body: schemas.crmWriteBody }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);
    const payload = normalizePayload(req.body.payload);
    const entity = await createTwentyEntity("person", payload);
    res.status(201).json({
      data: {
        entityType: "person",
        summary: summarizeEntity("person", entity),
        entity,
      },
    });
  } catch (error) {
    return handleUpstreamError(res, "person", "create", error);
  }
});

/**
 * PATCH /api/crm/people/:entityId
 * Update a contact in Twenty CRM.
 */
crmRoutes.patch(
  "/people/:entityId",
  validate({ params: schemas.crmEntityIdParam, body: schemas.crmWriteBody }),
  async (req, res) => {
    try {
      const status = getTwentyConnectionStatus();
      if (!status.configured) return notConfiguredResponse(res);
      const entityId = req.params.entityId as string;
      const payload = normalizePayload(req.body.payload);
      const entity = await updateTwentyEntity("person", entityId, payload);
      res.json({
        data: {
          entityType: "person",
          entityId,
          summary: summarizeEntity("person", entity),
          entity,
        },
      });
    } catch (error) {
      return handleUpstreamError(res, "person", "update", error);
    }
  },
);

/**
 * GET /api/crm/opportunities
 * List/search opportunities from Twenty CRM.
 */
crmRoutes.get("/opportunities", validate({ query: schemas.crmListQuery }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);

    const result = await listTwentyEntities("opportunity", { q, limit, offset });
    const items = result.items.map((item) => summarizeEntity("opportunity", item));

    res.json({
      data: {
        items,
      },
      meta: {
        q: q || null,
        count: items.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error("CRM opportunities list error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_UPSTREAM_ERROR",
        message: "Failed to fetch opportunities from Twenty CRM",
      },
    });
  }
});

/**
 * POST /api/crm/opportunities
 * Create an opportunity in Twenty CRM.
 */
crmRoutes.post("/opportunities", validate({ body: schemas.crmWriteBody }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);
    const payload = normalizePayload(req.body.payload);
    const entity = await createTwentyEntity("opportunity", payload);
    res.status(201).json({
      data: {
        entityType: "opportunity",
        summary: summarizeEntity("opportunity", entity),
        entity,
      },
    });
  } catch (error) {
    return handleUpstreamError(res, "opportunity", "create", error);
  }
});

/**
 * PATCH /api/crm/opportunities/:entityId
 * Update an opportunity in Twenty CRM.
 */
crmRoutes.patch(
  "/opportunities/:entityId",
  validate({ params: schemas.crmEntityIdParam, body: schemas.crmWriteBody }),
  async (req, res) => {
    try {
      const status = getTwentyConnectionStatus();
      if (!status.configured) return notConfiguredResponse(res);
      const entityId = req.params.entityId as string;
      const payload = normalizePayload(req.body.payload);
      const entity = await updateTwentyEntity("opportunity", entityId, payload);
      res.json({
        data: {
          entityType: "opportunity",
          entityId,
          summary: summarizeEntity("opportunity", entity),
          entity,
        },
      });
    } catch (error) {
      return handleUpstreamError(res, "opportunity", "update", error);
    }
  },
);

/**
 * GET /api/crm/tasks
 * List/search tasks from Twenty CRM.
 */
crmRoutes.get("/tasks", validate({ query: schemas.crmListQuery }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);

    const result = await listTwentyEntities("task", { q, limit, offset });
    const items = result.items.map((item) => summarizeEntity("task", item));

    res.json({
      data: {
        items,
      },
      meta: {
        q: q || null,
        count: items.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error("CRM tasks list error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_UPSTREAM_ERROR",
        message: "Failed to fetch tasks from Twenty CRM",
      },
    });
  }
});

/**
 * POST /api/crm/tasks
 * Create a task in Twenty CRM.
 */
crmRoutes.post("/tasks", validate({ body: schemas.crmWriteBody }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);
    const payload = normalizePayload(req.body.payload);
    const entity = await createTwentyEntity("task", payload);
    res.status(201).json({
      data: {
        entityType: "task",
        summary: summarizeEntity("task", entity),
        entity,
      },
    });
  } catch (error) {
    return handleUpstreamError(res, "task", "create", error);
  }
});

/**
 * PATCH /api/crm/tasks/:entityId
 * Update a task in Twenty CRM.
 */
crmRoutes.patch(
  "/tasks/:entityId",
  validate({ params: schemas.crmEntityIdParam, body: schemas.crmWriteBody }),
  async (req, res) => {
    try {
      const status = getTwentyConnectionStatus();
      if (!status.configured) return notConfiguredResponse(res);
      const entityId = req.params.entityId as string;
      const payload = normalizePayload(req.body.payload);
      const entity = await updateTwentyEntity("task", entityId, payload);
      res.json({
        data: {
          entityType: "task",
          entityId,
          summary: summarizeEntity("task", entity),
          entity,
        },
      });
    } catch (error) {
      return handleUpstreamError(res, "task", "update", error);
    }
  },
);

/**
 * POST /api/crm/workflows/coordinate
 * Build a cross-system coordination bundle:
 * - CRM summary + Tez context layers
 * - OpenClaw planning output
 * - Optional Google Workspace actions through pa-workspace
 */
crmRoutes.post("/workflows/coordinate", validate({ body: schemas.crmWorkflowBody }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const entityType = req.body.entityType as TwentyEntityType;
    const entityId = req.body.entityId as string;
    const objective = req.body.objective as string;

    const entity = await getTwentyEntityById(entityType, entityId);
    const summary = summarizeEntity(entityType, entity);
    const tezContextLayer = buildTezContextLayerFromTwenty(entityType, entity);
    const relayContext = buildRelayContextLayers(tezContextLayer.content, tezContextLayer.query);
    const requestedTezType = req.body.tez?.type;
    const relayTezType = normalizeRelayTezType(requestedTezType);
    if (requestedTezType === "escalation") {
      relayContext.unshift({
        layer: "hint",
        content: "Escalation intent requested by sender.",
        source: "stated",
      });
    }

    const openClawPlan = await generateOpenClawPlan({
      entityType,
      entitySummary: summary,
      contextLayerContent: tezContextLayer.content,
      objective,
      model: req.body.openclaw?.model as string | undefined,
      temperature: req.body.openclaw?.temperature as number | undefined,
      enabled: req.body.openclaw?.enabled !== false,
    });

    const recipients = Array.isArray(req.body.tez?.recipients)
      ? (req.body.tez?.recipients as string[])
      : [];
    const surfaceText =
      typeof req.body.tez?.surfaceText === "string" && req.body.tez.surfaceText.trim().length > 0
        ? req.body.tez.surfaceText.trim()
        : buildTezSurfaceText(entityType, summary, objective, openClawPlan.generated ? openClawPlan.summary : undefined);

    const tezDraft = {
      teamId: (req.body.tez?.teamId as string | undefined) || null,
      recipients,
      type: relayTezType,
      urgency: (req.body.tez?.urgency as string | undefined) || "normal",
      visibility: (req.body.tez?.visibility as string | undefined) || (recipients.length > 0 ? "dm" : "team"),
      surfaceText,
      context: relayContext,
    };

    const workspaceEnabled = req.body.googleWorkspace?.enabled === true;
    const workspaceDryRun = req.body.googleWorkspace?.dryRun !== false;
    const workspaceStatus = getPaWorkspaceStatus();
    const workspaceLabel = summaryLabel(summary);

    const emailDraft = {
      paEmail: (req.body.googleWorkspace?.paEmail as string | undefined) || null,
      to: (req.body.googleWorkspace?.emailTo as string | undefined) || null,
      subject: (req.body.googleWorkspace?.emailSubject as string | undefined) || `Follow-up: ${workspaceLabel}`,
      body:
        (req.body.googleWorkspace?.emailBody as string | undefined) ||
        [
          `Objective: ${objective}`,
          `CRM ${entityType}: ${JSON.stringify(summary)}`,
          openClawPlan.summary ? `Plan: ${openClawPlan.summary}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
    };

    const calendarAction = {
      paEmail: (req.body.googleWorkspace?.paEmail as string | undefined) || null,
      summary:
        (req.body.googleWorkspace?.calendarSummary as string | undefined) ||
        `CRM follow-up: ${workspaceLabel}`,
      durationMs: (req.body.googleWorkspace?.durationMs as number | undefined) || 5 * 60 * 1000,
    };

    let emailResult: WorkspaceCallResult | null = null;
    let calendarResult: WorkspaceCallResult | null = null;

    if (workspaceEnabled && !workspaceDryRun && req.body.googleWorkspace?.sendEmail) {
      if (emailDraft.paEmail && emailDraft.to) {
        emailResult = await callPaWorkspace(req, "/api/email/send", {
          paEmail: emailDraft.paEmail,
          to: emailDraft.to,
          subject: emailDraft.subject,
          body: emailDraft.body,
        });
      } else {
        emailResult = {
          attempted: false,
          success: false,
          message: "paEmail and emailTo are required to send email",
        };
      }
    }

    if (workspaceEnabled && !workspaceDryRun && req.body.googleWorkspace?.logCalendar) {
      if (calendarAction.paEmail) {
        calendarResult = await callPaWorkspace(req, "/api/calendar/log-action", {
          paEmail: calendarAction.paEmail,
          actionType: "crm_follow_up",
          summary: calendarAction.summary,
          durationMs: calendarAction.durationMs,
        });
      } else {
        calendarResult = {
          attempted: false,
          success: false,
          message: "paEmail is required to log calendar action",
        };
      }
    }

    res.json({
      data: {
        entityType,
        entityId,
        summary,
        contextLayers: [tezContextLayer],
        relayContext,
        tezDraft,
        openclaw: openClawPlan,
        googleWorkspace: {
          enabled: workspaceEnabled,
          configured: workspaceStatus.configured,
          dryRun: workspaceDryRun,
          reason: workspaceStatus.reason || null,
          emailDraft,
          calendarAction,
          emailResult,
          calendarResult,
        },
      },
      meta: {
        usage:
          "Use tezDraft with relay /tez/share (team) or /conversations/:id/messages (dm). Toggle dryRun=false to execute workspace actions.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({
        error: {
          code: "CRM_ENTITY_NOT_FOUND",
          message: "CRM entity not found",
        },
      });
    }

    logger.error("CRM coordination workflow error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_WORKFLOW_ERROR",
        message: "Failed to build CRM coordination workflow",
      },
    });
  }
});

/**
 * POST /api/crm/tez-context
 * Build a context layer payload that can be attached to /api/cards/team or /api/cards/personal.
 */
crmRoutes.post("/tez-context", validate({ body: schemas.crmTezContext }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const entityType = req.body.entityType as TwentyEntityType;
    const entityId = req.body.entityId as string;

    const entity = await getTwentyEntityById(entityType, entityId);
    const tezContextLayer = buildTezContextLayerFromTwenty(entityType, entity);
    const summary = summarizeEntity(entityType, entity);
    const relayContext = buildRelayContextLayers(tezContextLayer.content, tezContextLayer.query);

    res.json({
      data: {
        entityType,
        entityId,
        summary,
        contextLayers: [tezContextLayer],
        relayContext,
      },
      meta: {
        usage: "Pass contextLayers to /api/cards/team|personal, or relayContext to relay /tez/share|/conversations/:id/messages",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({
        error: {
          code: "CRM_ENTITY_NOT_FOUND",
          message: "CRM entity not found",
        },
      });
    }

    logger.error("CRM tez-context build error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_UPSTREAM_ERROR",
        message: "Failed to build Tez context from CRM",
      },
    });
  }
});

/**
 * GET /api/crm/:entityType/:entityId
 * Fetch one CRM entity and return Tez + relay context suggestions.
 */
crmRoutes.get("/:entityType/:entityId", validate({ params: schemas.crmEntityParam }), async (req, res) => {
  try {
    const status = getTwentyConnectionStatus();
    if (!status.configured) return notConfiguredResponse(res);

    const entityType = req.params.entityType as TwentyEntityType;
    const entityId = req.params.entityId as string;

    const entity = await getTwentyEntityById(entityType, entityId);
    const contextLayer = buildTezContextLayerFromTwenty(entityType, entity);
    const summary = summarizeEntity(entityType, entity);
    const relayContext = buildRelayContextLayers(contextLayer.content, contextLayer.query);

    res.json({
      data: {
        entityType,
        entityId,
        summary,
        tezContextLayer: contextLayer,
        relayContext,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("not found")) {
      return res.status(404).json({
        error: {
          code: "CRM_ENTITY_NOT_FOUND",
          message: "CRM entity not found",
        },
      });
    }

    logger.error("CRM entity fetch error", error as Error);
    res.status(502).json({
      error: {
        code: "CRM_UPSTREAM_ERROR",
        message: "Failed to fetch CRM entity",
      },
    });
  }
});
