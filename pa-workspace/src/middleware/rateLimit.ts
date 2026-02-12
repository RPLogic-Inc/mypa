import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Per-IP rate limiter (in-memory, single-process).
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.headers["x-forwarded-for"] as string || "unknown";
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: { code: "RATE_LIMITED", message: "Too many requests" },
      });
    }

    next();
  };
}
