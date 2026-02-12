/**
 * JWT Authentication Service
 * Handles token generation, verification, refresh with rotation, and revocation.
 *
 * Refresh token rotation:
 * - Each refresh token belongs to a "family" (set of related tokens from one login)
 * - On refresh, the old token is revoked and a new one issued in the same family
 * - If a revoked token is reused (theft detected), ALL tokens in the family are revoked
 * - Logout revokes the specific refresh token
 */

import * as jose from "jose";
import bcrypt from "bcryptjs";
import { db, users, userRoles, refreshTokens as refreshTokensTable } from "../db/index.js";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { logger } from "../middleware/logging.js";

// JWT Configuration
// Lazy getters: env vars must be read at call time, not import time,
// because dotenv config() runs after ES module imports are evaluated.
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  if (!secret) {
    logger.warn("JWT_SECRET not set - using insecure dev-only fallback. DO NOT use in production.");
  }
  return new TextEncoder().encode(secret || "dev-only-not-for-production");
}

import { APP_SLUG } from "../config/app.js";

const JWT_ISSUER = APP_SLUG;
const JWT_AUDIENCE = `${APP_SLUG}-api`;
const ACCESS_TOKEN_EXPIRY = "15m";  // 15 minutes
const REFRESH_TOKEN_EXPIRY = "7d";   // 7 days
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export interface TokenPayload {
  sub: string;        // User ID
  email: string;
  name: string;
  type: "access" | "refresh";
  fam?: string;       // Token family ID (refresh tokens only)
  jti?: string;       // Unique token ID (refresh tokens only)
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // seconds until access token expires
}

/**
 * Hash a refresh token for storage (we never store raw tokens).
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate access and refresh tokens for a user.
 * Stores the refresh token hash in the database for rotation/revocation.
 *
 * @param familyId - Reuse an existing family (for rotation) or omit for a new login
 */
export async function generateTokens(user: {
  id: string;
  email: string;
  name: string;
}, familyId?: string): Promise<AuthTokens> {
  const tokenId = randomUUID();
  const family = familyId || randomUUID();

  // Access token - short lived
  const accessToken = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());

  // Refresh token - long lived, includes family and token ID
  const refreshToken = await new jose.SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    type: "refresh",
    fam: family,
    jti: tokenId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getJwtSecret());

  // Store refresh token hash in DB
  await db.insert(refreshTokensTable).values({
    id: tokenId,
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId: family,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      type: payload.type as "access" | "refresh",
      fam: payload.fam as string | undefined,
      jti: payload.jti as string | undefined,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      logger.warn("JWT token expired");
    } else {
      logger.warn("JWT verification failed", { errorMessage: String(error) });
    }
    return null;
  }
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Register a new user
 */
export async function registerUser(data: {
  email: string;
  password: string;
  name: string;
  department: string;
}): Promise<{ user: typeof users.$inferSelect; tokens: AuthTokens } | { error: string }> {
  // Bootstrap: if no admin exists yet, promote the next successfully-registered user to admin so the system can be configured.
  let hasAdmin = false;
  try {
    const adminRow = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.role, "admin"))
      .limit(1);
    hasAdmin = adminRow.length > 0;
  } catch {
    // Ignore: table may not exist yet during migrations or local dev.
  }

  if (!hasAdmin) {
    try {
      const roleRows = await db.select({ roles: users.roles }).from(users);
      hasAdmin = roleRows.some((r) => {
        const roles = typeof r.roles === "string" ? JSON.parse(r.roles) : (r.roles || []);
        return Array.isArray(roles) && roles.includes("admin");
      });
    } catch {
      // Ignore and fall through: we'll treat as no admin.
    }
  }

  const bootstrapRoles = hasAdmin ? [] : ["admin"];

  // Check if user already exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return { error: "User with this email already exists" };
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user
  const userId = randomUUID();
  const now = new Date();

  const newUser = {
    id: userId,
    email: data.email.toLowerCase(),
    name: data.name,
    department: data.department,
    passwordHash,
    roles: bootstrapRoles as string[],
    skills: [] as string[],
    notificationPrefs: { urgentPush: true },
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(users).values(newUser);

  // Keep roles in sync with the junction table (used by PA context + admin settings).
  for (const role of bootstrapRoles) {
    try {
      await db.insert(userRoles).values({ userId, role });
    } catch {
      // Ignore duplicate role errors
    }
  }

  // Generate tokens (new family for new login)
  const tokens = await generateTokens({
    id: userId,
    email: newUser.email,
    name: newUser.name,
  });

  // Return user without password hash
  const { passwordHash: _, ...userWithoutPassword } = newUser;

  return {
    user: userWithoutPassword as typeof users.$inferSelect,
    tokens,
  };
}

/**
 * Login a user
 */
export async function loginUser(
  email: string,
  password: string
): Promise<{ user: typeof users.$inferSelect; tokens: AuthTokens } | { error: string }> {
  // Find user
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (result.length === 0) {
    return { error: "Invalid email or password" };
  }

  const user = result[0];

  // Reject login if user has no password set (must register or reset password)
  if (!user.passwordHash) {
    return { error: "Account requires password setup. Please register or use password reset." };
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return { error: "Invalid email or password" };
  }

  // Generate tokens (new family for new login)
  const tokens = await generateTokens({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  // Strip passwordHash before returning
  const { passwordHash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword as typeof users.$inferSelect, tokens };
}

/**
 * Refresh tokens using a refresh token (with rotation).
 *
 * Token rotation security:
 * 1. Verify the JWT signature and claims
 * 2. Look up the token in the DB by its hash
 * 3. If the token was already revoked → theft detected! Revoke the entire family
 * 4. If valid, revoke this token and issue a new one in the same family
 */
export async function refreshTokens(
  refreshToken: string
): Promise<AuthTokens | { error: string }> {
  // Verify JWT signature and claims
  const payload = await verifyToken(refreshToken);

  if (!payload) {
    return { error: "Invalid or expired refresh token" };
  }

  if (payload.type !== "refresh") {
    return { error: "Invalid token type" };
  }

  const tokenHash = hashToken(refreshToken);
  const tokenId = payload.jti;
  const familyId = payload.fam;

  // Look up the token record in the database
  const tokenRecords = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (tokenRecords.length === 0) {
    // Token not found in DB - could be from before rotation was implemented
    // Fall back to stateless verification for backward compatibility
    logger.warn("Refresh token not found in DB (pre-rotation token?)", { userId: payload.sub });
  } else {
    const tokenRecord = tokenRecords[0];

    // Check if this token was already revoked (theft detection!)
    if (tokenRecord.revokedAt) {
      logger.warn("Reuse of revoked refresh token detected - revoking entire family", {
        userId: payload.sub,
        familyId: tokenRecord.familyId,
      });

      // Revoke ALL tokens in this family
      await db
        .update(refreshTokensTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokensTable.familyId, tokenRecord.familyId),
            isNull(refreshTokensTable.revokedAt),
          )
        );

      return { error: "Token reuse detected. All sessions revoked for security." };
    }

    // Revoke the current token (it's being rotated)
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.id, tokenRecord.id));
  }

  // Check user still exists
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (result.length === 0) {
    return { error: "User not found" };
  }

  const user = result[0];

  // Generate new tokens in the same family
  return generateTokens({
    id: user.id,
    email: user.email,
    name: user.name,
  }, familyId);
}

/**
 * Revoke a specific refresh token (for logout).
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);

  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokensTable.tokenHash, tokenHash));
}

/**
 * Revoke all refresh tokens for a user (for password change, account compromise, etc.).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        isNull(refreshTokensTable.revokedAt),
      )
    );
}

/**
 * Generate a password reset token (JWT, 1 hour expiry).
 * No DB table needed — the token is self-contained and short-lived.
 */
export async function generatePasswordResetToken(user: {
  id: string;
  email: string;
}): Promise<string> {
  return new jose.SignJWT({
    sub: user.id,
    email: user.email,
    type: "password_reset",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("1h")
    .sign(getJwtSecret());
}

/**
 * Verify a password reset token. Returns user ID + email if valid, null otherwise.
 */
export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.type !== "password_reset" || !payload.sub || !payload.email) {
      return null;
    }
    return { userId: payload.sub, email: payload.email as string };
  } catch {
    return null;
  }
}

/**
 * Generate an email verification token (JWT, 24 hour expiry).
 * Self-contained — no DB table needed.
 */
export async function generateEmailVerificationToken(user: {
  id: string;
  email: string;
}): Promise<string> {
  return new jose.SignJWT({
    sub: user.id,
    email: user.email,
    type: "email_verification",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime("24h")
    .sign(getJwtSecret());
}

/**
 * Verify an email verification token. Returns user ID + email if valid, null otherwise.
 */
export async function verifyEmailVerificationToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.type !== "email_verification" || !payload.sub || !payload.email) {
      return null;
    }
    return { userId: payload.sub, email: payload.email as string };
  } catch {
    return null;
  }
}
