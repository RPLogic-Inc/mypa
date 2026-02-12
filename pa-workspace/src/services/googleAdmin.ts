/**
 * Google Workspace Admin SDK Service
 *
 * Uses domain-wide delegation via a service account to:
 *  - Test connectivity to the Workspace domain
 *  - List users in the domain
 *  - Provision PA accounts (create real Google Workspace users)
 *  - Suspend/reactivate/delete PA accounts
 */

import { google, admin_directory_v1 } from "googleapis";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";

// ============= Types =============

export interface WorkspaceCredentials {
  serviceAccountJson: string;
  adminEmail: string;
  domain: string;
}

export interface ProvisionParams extends WorkspaceCredentials {
  paEmail: string;
  displayName: string;
  clientName: string;
}

export interface AccountParams {
  serviceAccountJson: string;
  adminEmail: string;
  googleUserId: string;
}

export interface ConnectivityResult {
  success: boolean;
  domain: string;
  userCount?: number;
  message: string;
}

export interface ProvisionResult {
  googleUserId: string;
  paEmail: string;
}

export interface DomainUser {
  id: string;
  primaryEmail: string;
  name: string;
  suspended: boolean;
  creationTime?: string;
}

// ============= Auth Helpers =============

/**
 * Create an authenticated Admin SDK client using domain-wide delegation.
 * The service account impersonates the admin user to perform operations.
 */
function getAdminClient(creds: {
  serviceAccountJson: string;
  adminEmail: string;
}): admin_directory_v1.Admin {
  const sa = JSON.parse(creds.serviceAccountJson);

  const jwtClient = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      "https://www.googleapis.com/auth/admin.directory.user",
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
    ],
    subject: creds.adminEmail,
  });

  return google.admin({ version: "directory_v1", auth: jwtClient });
}

// ============= Connectivity =============

/**
 * Test connectivity to Google Workspace Admin SDK.
 * Lists users in the domain to verify credentials and delegation work.
 */
export async function testWorkspaceConnectivity(
  creds: WorkspaceCredentials
): Promise<ConnectivityResult> {
  logger.info("Testing Workspace connectivity", { domain: creds.domain });

  // Validate service account JSON structure first
  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(creds.serviceAccountJson);
  } catch {
    return {
      success: false,
      domain: creds.domain,
      message: "Invalid service account JSON — could not parse",
    };
  }

  if (!sa.client_email || !sa.private_key) {
    return {
      success: false,
      domain: creds.domain,
      message: "Service account JSON is missing client_email or private_key",
    };
  }

  try {
    const admin = getAdminClient(creds);
    const res = await admin.users.list({
      domain: creds.domain,
      maxResults: 1,
    });

    const userCount = res.data.users?.length ?? 0;

    return {
      success: true,
      domain: creds.domain,
      userCount,
      message: `Connected successfully. Found ${userCount} user(s) in domain.`,
    };
  } catch (error) {
    const msg = (error as Error).message || String(error);
    logger.error("Workspace connectivity test failed", error as Error, { domain: creds.domain });

    return {
      success: false,
      domain: creds.domain,
      message: `Admin SDK connection failed: ${msg}`,
    };
  }
}

// ============= User Listing =============

/**
 * List all users in the Workspace domain.
 * Handles pagination automatically.
 */
export async function listDomainUsers(
  creds: WorkspaceCredentials,
  options?: { maxResults?: number; showDeleted?: boolean }
): Promise<DomainUser[]> {
  const admin = getAdminClient(creds);
  const allUsers: DomainUser[] = [];
  let pageToken: string | undefined;

  do {
    const res = await admin.users.list({
      domain: creds.domain,
      maxResults: options?.maxResults ?? 100,
      pageToken,
      showDeleted: options?.showDeleted ? "true" : undefined,
      projection: "basic",
    });

    if (res.data.users) {
      for (const u of res.data.users) {
        allUsers.push({
          id: u.id!,
          primaryEmail: u.primaryEmail!,
          name: u.name?.fullName || `${u.name?.givenName ?? ""} ${u.name?.familyName ?? ""}`.trim(),
          suspended: u.suspended ?? false,
          creationTime: u.creationTime ?? undefined,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allUsers;
}

// ============= Provisioning =============

/**
 * Provision a PA Google Workspace account.
 * Creates a real user via Admin SDK users.insert.
 *
 * The PA gets:
 *  - A real Gmail inbox (paEmail)
 *  - A Google Calendar
 *  - Google Drive storage
 *  - A random password (not used — PA operates via service account delegation)
 */
export async function provisionPaAccount(params: ProvisionParams): Promise<ProvisionResult> {
  logger.info("Provisioning PA account", { paEmail: params.paEmail, displayName: params.displayName });

  const admin = getAdminClient(params);

  // Split display name into given/family for Google's name fields
  const nameParts = params.displayName.split("'s PA");
  const givenName = nameParts[0].trim() || params.clientName;
  const familyName = "PA";

  const res = await admin.users.insert({
    requestBody: {
      primaryEmail: params.paEmail,
      name: {
        givenName,
        familyName,
      },
      // Random password — PA never logs in directly; we use delegation
      password: randomUUID() + "!Aa1",
      changePasswordAtNextLogin: false,
      orgUnitPath: "/",
    },
  });

  const googleUserId = res.data.id!;

  logger.info("PA account created in Google Workspace", {
    paEmail: params.paEmail,
    googleUserId,
  });

  return {
    googleUserId,
    paEmail: params.paEmail,
  };
}

// ============= Suspend / Reactivate / Delete =============

/**
 * Suspend a PA Google Workspace account.
 * Prevents login and stops Gmail delivery, but preserves data.
 */
export async function suspendPaAccount(params: AccountParams): Promise<void> {
  logger.info("Suspending PA account", { googleUserId: params.googleUserId });

  const admin = getAdminClient(params);
  await admin.users.update({
    userKey: params.googleUserId,
    requestBody: { suspended: true },
  });

  logger.info("PA account suspended", { googleUserId: params.googleUserId });
}

/**
 * Reactivate a suspended PA Google Workspace account.
 */
export async function reactivatePaAccount(params: AccountParams): Promise<void> {
  logger.info("Reactivating PA account", { googleUserId: params.googleUserId });

  const admin = getAdminClient(params);
  await admin.users.update({
    userKey: params.googleUserId,
    requestBody: { suspended: false },
  });

  logger.info("PA account reactivated", { googleUserId: params.googleUserId });
}

/**
 * Delete a PA Google Workspace account permanently.
 * This removes the Gmail inbox, calendar, and all data.
 */
export async function deletePaAccount(params: AccountParams): Promise<void> {
  logger.info("Deleting PA account", { googleUserId: params.googleUserId });

  const admin = getAdminClient(params);
  await admin.users.delete({
    userKey: params.googleUserId,
  });

  logger.info("PA account deleted from Google Workspace", { googleUserId: params.googleUserId });
}

/**
 * Get a single user's details from Google Workspace.
 */
export async function getGoogleUser(params: AccountParams): Promise<DomainUser | null> {
  try {
    const admin = getAdminClient(params);
    const res = await admin.users.get({
      userKey: params.googleUserId,
      projection: "basic",
    });

    const u = res.data;
    return {
      id: u.id!,
      primaryEmail: u.primaryEmail!,
      name: u.name?.fullName || `${u.name?.givenName ?? ""} ${u.name?.familyName ?? ""}`.trim(),
      suspended: u.suspended ?? false,
      creationTime: u.creationTime ?? undefined,
    };
  } catch (error) {
    logger.warn("Failed to get Google user", { googleUserId: params.googleUserId, error: (error as Error).message });
    return null;
  }
}
