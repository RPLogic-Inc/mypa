import { Request, Response, NextFunction } from "express";
import { logger } from "./logging.js";

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyGenerator?: (req: Request) => string;  // Custom key generator
  skipFn?: (req: Request) => boolean;       // Skip rate limiting for certain requests
  message?: string;      // Custom error message
}

/**
 * In-memory rate limit store
 * For production, replace with Redis for multi-server support
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Default key generator - uses authenticated user ID or IP
 */
function defaultKeyGenerator(req: Request): string {
  // Use JWT-authenticated user ID (set by authenticate middleware)
  const userId = req.user?.id;
  if (userId) {
    return `user:${userId}`;
  }
  // Fall back to IP address
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipFn,
    message = "Too many requests, please try again later",
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting if configured
    if (skipFn && skipFn(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create entry
    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    // Check if over limit
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);

      logger.warn("Rate limit exceeded", {
        requestId: req.requestId,
        key,
        count: entry.count,
        limit: maxRequests,
        retryAfter,
      });

      return res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
          retryAfter,
        },
      });
    }

    next();
  };
}

/**
 * Pre-configured rate limiters for different endpoint types
 */

// Standard API rate limit: 100 requests per minute per user
export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: "Too many requests. Please slow down.",
});

// Strict rate limit for expensive operations: 10 requests per minute
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: "This operation is rate limited. Please wait before trying again.",
});

// AI/Transcription rate limit: 5 requests per minute
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  message: "AI processing is rate limited. Please wait before trying again.",
});

// Authentication rate limit: 5 requests per minute per IP
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `auth:${ip}`;
  },
  message: "Too many authentication attempts. Please wait before trying again.",
});

// Webhook rate limit: 60 requests per minute per IP (for external services)
export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const provider = req.headers["x-webhook-provider"] || "default";
    return `webhook:${ip}:${provider}`;
  },
  message: "Webhook rate limit exceeded.",
});

/**
 * Clear rate limit store (for testing)
 */
export function clearRateLimitStore() {
  rateLimitStore.clear();
}
