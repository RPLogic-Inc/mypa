import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  return (process.env.LOG_LEVEL as LogLevel) || "info";
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[getMinLevel()];
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    service: "pa-workspace",
    message,
    ...meta,
  };

  // Redact sensitive fields
  const sensitiveKeys = ["password", "token", "secret", "authorization", "apiKey"];
  for (const key of Object.keys(entry)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      entry[key] = "[REDACTED]";
    }
  }

  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.log(formatEntry("debug", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(formatEntry("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatEntry("warn", message, meta));
  },
  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    if (shouldLog("error")) {
      console.error(
        formatEntry("error", message, {
          ...meta,
          error: error
            ? { name: error.name, message: error.message, stack: error.stack }
            : undefined,
        })
      );
    }
  },
};

/**
 * Request logging middleware.
 * Adds requestId and logs request/response timing.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.startTime = Date.now();

  res.setHeader("x-request-id", req.requestId);

  if (!req.path.startsWith("/health")) {
    logger.info("Request received", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
    });
  }

  res.on("finish", () => {
    if (req.path.startsWith("/health") && res.statusCode < 400) return;

    const durationMs = Date.now() - req.startTime;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error("Request failed", undefined, meta);
    } else if (res.statusCode >= 400) {
      logger.warn("Request completed with error", meta);
    } else {
      logger.info("Request completed", meta);
    }
  });

  next();
}
