import { Request, Response, NextFunction } from "express";
import { db, users, userRoles, userSkills } from "../db/index.js";
import { eq } from "drizzle-orm";
import { logger } from "./logging.js";
import { verifyToken } from "../services/jwt.js";
import { validateShareToken } from "../services/tezShareToken.js";

// Extend Express Request to include validated user and/or share token
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        department: string;
        roles: string[];
        skills: string[];
      };
      shareToken?: {
        id: string;
        cardId: string;
        createdByUserId: string;
        contextScope: string;
        contextItemIds: string[];
        maxInterrogations: number | null;
        interrogationCount: number;
        expiresAt: Date | null;
      };
    }
  }
}

/**
 * Authentication middleware
 * Requires JWT Bearer token (Authorization: Bearer <token>)
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Bearer token required",
      },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired token",
        },
      });
    }

    if (payload.type !== "access") {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN_TYPE",
          message: "Invalid token type",
        },
      });
    }

    // Fetch full user from database
    const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

    if (user.length === 0) {
      logger.warn("JWT auth failed - user not found", {
        requestId: req.requestId,
        userId: payload.sub,
      });

      return res.status(401).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    // Attach user to request (roles/skills may exist in legacy JSON fields and/or junction tables).
    const userRow = user[0];

    const rolesFromJson = typeof userRow.roles === "string"
      ? JSON.parse(userRow.roles)
      : (userRow.roles || []);
    const skillsFromJson = typeof userRow.skills === "string"
      ? JSON.parse(userRow.skills)
      : (userRow.skills || []);

    const [roleRows, skillRows] = await Promise.all([
      db.select().from(userRoles).where(eq(userRoles.userId, userRow.id)),
      db.select().from(userSkills).where(eq(userSkills.userId, userRow.id)),
    ]);

    const roles = Array.from(new Set([
      ...(Array.isArray(rolesFromJson) ? rolesFromJson : []),
      ...roleRows.map((r) => r.role),
    ]));
    const skills = Array.from(new Set([
      ...(Array.isArray(skillsFromJson) ? skillsFromJson : []),
      ...skillRows.map((s) => s.skill),
    ]));

    req.user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      department: userRow.department,
      roles,
      skills,
    };

    return next();
  } catch (error) {
    logger.error("JWT authentication error", error as Error, {
      requestId: req.requestId,
    });

    return res.status(401).json({
      error: {
        code: "AUTH_ERROR",
        message: "Authentication failed",
      },
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user to request if valid JWT Bearer token is provided, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token);

    if (payload && payload.type === "access") {
      const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

      if (user.length > 0) {
        const userRow = user[0];

        const rolesFromJson = typeof userRow.roles === "string"
          ? JSON.parse(userRow.roles)
          : (userRow.roles || []);
        const skillsFromJson = typeof userRow.skills === "string"
          ? JSON.parse(userRow.skills)
          : (userRow.skills || []);

        const [roleRows, skillRows] = await Promise.all([
          db.select().from(userRoles).where(eq(userRoles.userId, userRow.id)),
          db.select().from(userSkills).where(eq(userSkills.userId, userRow.id)),
        ]);

        const roles = Array.from(new Set([
          ...(Array.isArray(rolesFromJson) ? rolesFromJson : []),
          ...roleRows.map((r) => r.role),
        ]));
        const skills = Array.from(new Set([
          ...(Array.isArray(skillsFromJson) ? skillsFromJson : []),
          ...skillRows.map((s) => s.skill),
        ]));

        req.user = {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          department: userRow.department,
          roles,
          skills,
        };
      }
    }
  } catch (error) {
    logger.warn("Optional JWT auth failed", {
      requestId: req.requestId,
    });
  }

  next();
}

/**
 * Require specific role middleware
 * Must be used after authenticate middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
        },
      });
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: {
          code: "INSUFFICIENT_PERMISSIONS",
          message: "You do not have permission to perform this action",
        },
      });
    }

    next();
  };
}

/**
 * Share token authentication middleware
 * Validates a share token from query param (?token=) or X-Tez-Share-Token header.
 * Attaches shareToken to request if valid. Also validates the token's cardId matches the route param.
 */
export async function authenticateShareToken(req: Request, res: Response, next: NextFunction) {
  const rawToken = (req.query.token as string) || req.headers["x-tez-share-token"] as string;

  if (!rawToken) {
    return res.status(401).json({
      error: {
        code: "SHARE_TOKEN_REQUIRED",
        message: "Share token required. Provide ?token= query param or X-Tez-Share-Token header.",
      },
    });
  }

  try {
    const result = await validateShareToken(rawToken);

    if (!result) {
      return res.status(401).json({
        error: {
          code: "INVALID_SHARE_TOKEN",
          message: "Invalid, expired, or revoked share token",
        },
      });
    }

    // Verify the token's card matches the route param (prevent token reuse across cards)
    const routeCardId = req.params.cardId;
    if (routeCardId && routeCardId !== result.token.cardId) {
      return res.status(403).json({
        error: {
          code: "TOKEN_CARD_MISMATCH",
          message: "Share token is not valid for this card",
        },
      });
    }

    req.shareToken = {
      id: result.token.id,
      cardId: result.token.cardId,
      createdByUserId: result.token.createdByUserId,
      contextScope: result.token.contextScope,
      contextItemIds: result.token.contextItemIds || [],
      maxInterrogations: result.token.maxInterrogations ?? null,
      interrogationCount: result.token.interrogationCount ?? 0,
      expiresAt: result.token.expiresAt ?? null,
    };

    return next();
  } catch (error) {
    logger.error("Share token authentication error", error as Error, {
      requestId: req.requestId,
    });

    return res.status(401).json({
      error: {
        code: "AUTH_ERROR",
        message: "Share token authentication failed",
      },
    });
  }
}
