import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableFileLogging: boolean;
  logDir: string;
  maxFileSizeMB: number;
  maxFiles: number;
  enableConsole: boolean;
}

/**
 * File writer with rotation support
 */
class RotatingFileWriter {
  private stream: ReturnType<typeof createWriteStream> | null = null;
  private currentFile: string;
  private logDir: string;
  private baseName: string;
  private maxFileSizeBytes: number;
  private maxFiles: number;
  private bytesWritten: number = 0;

  constructor(logDir: string, baseName: string, maxFileSizeMB: number, maxFiles: number) {
    this.logDir = logDir;
    this.baseName = baseName;
    this.maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
    this.maxFiles = maxFiles;
    this.currentFile = this.getLogFileName();
    this.ensureLogDir();
    this.openStream();
  }

  private ensureLogDir() {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getLogFileName(): string {
    const date = new Date().toISOString().split("T")[0];
    return join(this.logDir, `${this.baseName}-${date}.log`);
  }

  private openStream() {
    this.currentFile = this.getLogFileName();

    // Check existing file size
    if (existsSync(this.currentFile)) {
      const stats = statSync(this.currentFile);
      this.bytesWritten = stats.size;
    } else {
      this.bytesWritten = 0;
    }

    this.stream = createWriteStream(this.currentFile, { flags: "a" });
  }

  private rotate() {
    if (this.stream) {
      this.stream.end();
    }

    // Rename current file with timestamp
    const timestamp = Date.now();
    const rotatedName = this.currentFile.replace(".log", `-${timestamp}.log`);
    if (existsSync(this.currentFile)) {
      renameSync(this.currentFile, rotatedName);
    }

    // Clean up old files
    this.cleanOldFiles();

    // Open new stream
    this.bytesWritten = 0;
    this.openStream();
  }

  private cleanOldFiles() {
    const files = readdirSync(this.logDir)
      .filter(f => f.startsWith(this.baseName) && f.endsWith(".log"))
      .map(f => ({
        name: f,
        path: join(this.logDir, f),
        mtime: statSync(join(this.logDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Remove files beyond maxFiles limit
    while (files.length > this.maxFiles) {
      const oldest = files.pop();
      if (oldest) {
        try {
          unlinkSync(oldest.path);
        } catch {
          // Ignore deletion errors
        }
      }
    }
  }

  write(data: string) {
    // Check if we need to rotate (new day or size limit)
    const expectedFile = this.getLogFileName();
    if (this.currentFile !== expectedFile || this.bytesWritten >= this.maxFileSizeBytes) {
      this.rotate();
    }

    const line = data + "\n";
    this.bytesWritten += Buffer.byteLength(line);
    this.stream?.write(line);
  }

  close() {
    this.stream?.end();
  }
}

/**
 * Structured logger that outputs JSON logs to console and/or files
 */
class Logger {
  private config: LoggerConfig;
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  private fileWriter: RotatingFileWriter | null = null;
  private errorFileWriter: RotatingFileWriter | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    // Get log directory relative to backend root
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const defaultLogDir = join(__dirname, "../../logs");

    this.config = {
      minLevel: (process.env.LOG_LEVEL as LogLevel) || "info",
      enableFileLogging: process.env.LOG_TO_FILE === "true" || process.env.NODE_ENV === "production",
      logDir: process.env.LOG_DIR || defaultLogDir,
      maxFileSizeMB: parseInt(process.env.LOG_MAX_SIZE_MB || "10", 10),
      maxFiles: parseInt(process.env.LOG_MAX_FILES || "30", 10),
      enableConsole: process.env.LOG_CONSOLE !== "false",
      ...config,
    };

    if (this.config.enableFileLogging) {
      this.initFileWriters();
    }
  }

  private initFileWriters() {
    this.fileWriter = new RotatingFileWriter(
      this.config.logDir,
      "app",
      this.config.maxFileSizeMB,
      this.config.maxFiles
    );
    this.errorFileWriter = new RotatingFileWriter(
      this.config.logDir,
      "error",
      this.config.maxFileSizeMB,
      this.config.maxFiles
    );
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.config.minLevel];
  }

  private formatLog(entry: LogEntry): string {
    // Redact sensitive fields
    const sanitized = { ...entry };

    // Redact passwords in paths
    if (sanitized.path?.includes("password")) {
      sanitized.path = "[REDACTED]";
    }

    // Redact any field that might contain sensitive data
    const sensitiveKeys = ["password", "token", "secret", "authorization", "apiKey", "api_key"];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return JSON.stringify(sanitized);
  }

  private log(level: LogLevel, message: string, meta: Partial<LogEntry> = {}) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };

    const output = this.formatLog(entry);

    // Console output
    if (this.config.enableConsole) {
      if (level === "error") {
        console.error(output);
      } else if (level === "warn") {
        console.warn(output);
      } else {
        console.log(output);
      }
    }

    // File output
    if (this.config.enableFileLogging) {
      this.fileWriter?.write(output);

      // Also write errors to separate error log
      if (level === "error") {
        this.errorFileWriter?.write(output);
      }
    }
  }

  debug(message: string, meta?: Partial<LogEntry>) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Partial<LogEntry>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Partial<LogEntry>) {
    this.log("warn", message, meta);
  }

  error(message: string, error?: Error, meta?: Partial<LogEntry>) {
    this.log("error", message, {
      ...meta,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
          }
        : undefined,
    });
  }

  /**
   * Gracefully close file writers
   */
  close() {
    this.fileWriter?.close();
    this.errorFileWriter?.close();
  }
}

// Export singleton logger
export const logger = new Logger();

/**
 * Request logging middleware
 * Adds requestId to each request and logs request/response
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate unique request ID
  req.requestId = req.headers["x-request-id"] as string || randomUUID();
  req.startTime = Date.now();

  // Set request ID in response header
  res.setHeader("x-request-id", req.requestId);

  // Log request (skip health checks to reduce noise)
  if (!req.path.startsWith("/health")) {
    logger.info("Request received", {
      requestId: req.requestId,
      userId: req.user?.id,
      method: req.method,
      path: req.path,
    });
  }

  // Log response when finished
  res.on("finish", () => {
    // Skip health check logging unless there's an error
    if (req.path.startsWith("/health") && res.statusCode < 400) {
      return;
    }

    const durationMs = Date.now() - req.startTime;
    const logMeta = {
      requestId: req.requestId,
      userId: req.user?.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error("Request failed", undefined, logMeta);
    } else if (res.statusCode >= 400) {
      logger.warn("Request completed with error", logMeta);
    } else {
      logger.info("Request completed", logMeta);
    }
  });

  next();
}

/**
 * Graceful shutdown helper - call this when shutting down the server
 */
export function closeLogger() {
  logger.close();
}
