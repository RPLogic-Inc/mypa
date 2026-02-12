/**
 * App Backend HTTP Client
 *
 * Makes authenticated requests to the parent app backend API.
 * Used for:
 *  - Creating cards from processed emails
 *  - Importing Tez bundles
 *  - Fetching team member data for provisioning
 */

import { logger } from "../middleware/logging.js";

function getAppConfig() {
  return {
    baseUrl: process.env.APP_API_URL || "http://localhost:3001",
    serviceToken: process.env.APP_SERVICE_TOKEN || "",
  };
}

async function appFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { baseUrl, serviceToken } = getAppConfig();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
  }

  return fetch(url, { ...options, headers });
}

/**
 * Get team members from the app backend.
 */
export async function getTeamMembers(teamId: string): Promise<Array<{
  id: string;
  name: string;
  email: string;
}>> {
  try {
    const res = await appFetch(`/api/users?teamId=${teamId}`);
    if (!res.ok) {
      logger.warn("Failed to fetch team members", { teamId, status: res.status });
      return [];
    }
    const body = await res.json() as { data: Array<{ id: string; name: string; email: string }> };
    return body.data || [];
  } catch (error) {
    logger.error("App client error: getTeamMembers", error as Error, { teamId });
    return [];
  }
}

/**
 * Create a card in the app backend from an email.
 */
export async function createCardFromEmail(params: {
  content: string;
  summary: string;
  fromUserId: string;
  sourceType: string;
  sourceRef?: string;
}): Promise<{ id: string } | null> {
  try {
    const res = await appFetch("/api/webhooks/email", {
      method: "POST",
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      logger.warn("Failed to create card from email", { status: res.status });
      return null;
    }
    const body = await res.json() as { data: { id: string } };
    return body.data;
  } catch (error) {
    logger.error("App client error: createCardFromEmail", error as Error);
    return null;
  }
}

/**
 * Import a Tezit bundle into the app backend.
 */
export async function importTezBundle(bundle: unknown): Promise<{ id: string } | null> {
  try {
    const res = await appFetch("/api/tez/import", {
      method: "POST",
      body: JSON.stringify(bundle),
    });
    if (!res.ok) {
      logger.warn("Failed to import Tez bundle", { status: res.status });
      return null;
    }
    const body = await res.json() as { data: { id: string } };
    return body.data;
  } catch (error) {
    logger.error("App client error: importTezBundle", error as Error);
    return null;
  }
}

/**
 * Export a Tez from the app backend as a Portable Tez bundle.
 */
export async function exportTezBundle(tezId: string): Promise<unknown | null> {
  try {
    const res = await appFetch(`/api/tez/${tezId}/export/portable`);
    if (!res.ok) {
      logger.warn("Failed to export Tez bundle", { tezId, status: res.status });
      return null;
    }
    return await res.json();
  } catch (error) {
    logger.error("App client error: exportTezBundle", error as Error, { tezId });
    return null;
  }
}
