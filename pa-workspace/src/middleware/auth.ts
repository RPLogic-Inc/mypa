import { Request, Response, NextFunction } from "express";
import * as jose from "jose";
import { logger } from "./logging.js";

/**
 * Extend Express Request to include the authenticated user.
 * pa-workspace shares JWT_SECRET with the parent app backend,
 * so access tokens are interchangeable.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        roles: string[];
      };
      /** True if the request was made with a service token (not a user JWT) */
      isServiceAuth?: boolean;
    }
  }
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  if (!secret) {
    logger.warn("JWT_SECRET not set - using insecure dev-only fallback");
  }
  return new TextEncoder().encode(secret || "dev-only-not-for-production");
}

/**
 * Authenticate via JWT Bearer token.
 * Tokens are issued by the parent app backend and verified here using the shared secret.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Check for service token first (service-to-service calls from the app backend)
  const serviceToken = process.env.APP_SERVICE_TOKEN;
  if (serviceToken && authHeader === `Bearer ${serviceToken}`) {
    req.isServiceAuth = true;
    return next();
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Bearer token required" },
    });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret());

    if (payload.type !== "access") {
      return res.status(401).json({
        error: { code: "INVALID_TOKEN_TYPE", message: "Invalid token type" },
      });
    }

    req.user = {
      id: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      roles: (payload.roles as string[]) || [],
    };

    return next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      logger.warn("JWT token expired", { requestId: req.requestId });
    } else {
      logger.warn("JWT verification failed", { requestId: req.requestId });
    }

    return res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Invalid or expired token" },
    });
  }
}

/**
 * Require specific role. Must be used after authenticate middleware.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Service tokens bypass role checks
    if (req.isServiceAuth) return next();

    if (!req.user) {
      return res.status(401).json({
        error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required" },
      });
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({
        error: { code: "INSUFFICIENT_PERMISSIONS", message: "You do not have permission" },
      });
    }

    next();
  };
}
