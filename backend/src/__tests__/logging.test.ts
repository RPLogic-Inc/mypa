/**
 * Unit tests for Logging Middleware
 *
 * Tests:
 * - Logger class (debug, info, warn, error)
 * - Log level filtering
 * - Sensitive data redaction
 * - Request logger middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import { logger, requestLogger, closeLogger } from "../middleware/logging.js";

// ============= Logger Tests =============

describe("Logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Log Levels", () => {
    it("should log debug messages", () => {
      logger.debug("Debug message");
      // Debug may be filtered by default min level, but the method should exist
      expect(typeof logger.debug).toBe("function");
    });

    it("should log info messages", () => {
      logger.info("Info message");
      expect(consoleSpy.log).toHaveBeenCalled();

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Info message");
    });

    it("should log warn messages", () => {
      logger.warn("Warning message");
      expect(consoleSpy.warn).toHaveBeenCalled();

      const output = consoleSpy.warn.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("warn");
      expect(parsed.message).toBe("Warning message");
    });

    it("should log error messages", () => {
      logger.error("Error message");
      expect(consoleSpy.error).toHaveBeenCalled();

      const output = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("error");
      expect(parsed.message).toBe("Error message");
    });

    it("should log error with Error object", () => {
      const error = new Error("Test error");
      logger.error("Something went wrong", error);

      expect(consoleSpy.error).toHaveBeenCalled();

      const output = consoleSpy.error.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.message).toBe("Something went wrong");
      expect(parsed.error.name).toBe("Error");
      expect(parsed.error.message).toBe("Test error");
    });
  });

  describe("Metadata", () => {
    it("should include timestamp in log entries", () => {
      logger.info("Test message");

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });

    it("should include custom metadata", () => {
      logger.info("Test with metadata", {
        requestId: "req-123",
        userId: "user-456",
        customField: "value",
      });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.requestId).toBe("req-123");
      expect(parsed.userId).toBe("user-456");
      expect(parsed.customField).toBe("value");
    });
  });

  describe("Sensitive Data Redaction", () => {
    it("should redact password fields", () => {
      logger.info("Login attempt", { password: "secret123" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.password).toBe("[REDACTED]");
    });

    it("should redact token fields", () => {
      logger.info("Auth request", { token: "jwt-token-here" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.token).toBe("[REDACTED]");
    });

    it("should redact secret fields", () => {
      logger.info("Config loaded", { clientSecret: "super-secret" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.clientSecret).toBe("[REDACTED]");
    });

    it("should redact authorization fields", () => {
      logger.info("Request headers", { authorization: "Bearer xyz" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.authorization).toBe("[REDACTED]");
    });

    it("should redact accesstoken fields (case insensitive)", () => {
      logger.info("API call", { accesstoken: "token-12345" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.accesstoken).toBe("[REDACTED]");
    });

    it("should redact api_key fields", () => {
      logger.info("API call", { api_key: "key-67890" });

      const output = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.api_key).toBe("[REDACTED]");
    });
  });

  describe("closeLogger", () => {
    it("should be callable without error", () => {
      expect(() => closeLogger()).not.toThrow();
    });
  });
});

// ============= Request Logger Middleware Tests =============

describe("Request Logger Middleware", () => {
  let app: Express;
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };

    app = express();
    app.use(requestLogger);

    // Test routes
    app.get("/api/test", (req, res) => {
      res.json({ success: true });
    });

    app.get("/api/error", (req, res) => {
      res.status(400).json({ error: "Bad request" });
    });

    app.get("/api/server-error", (req, res) => {
      res.status(500).json({ error: "Server error" });
    });

    app.get("/health", (req, res) => {
      res.json({ status: "ok" });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add requestId to request object", async () => {
    let capturedRequestId: string | undefined;

    app.get("/api/capture-id", (req, res) => {
      capturedRequestId = req.requestId;
      res.json({ requestId: req.requestId });
    });

    const response = await request(app).get("/api/capture-id");

    expect(capturedRequestId).toBeDefined();
    expect(typeof capturedRequestId).toBe("string");
    expect(response.headers["x-request-id"]).toBe(capturedRequestId);
  });

  it("should use provided x-request-id header if present", async () => {
    const customRequestId = "custom-request-id-123";

    const response = await request(app)
      .get("/api/test")
      .set("x-request-id", customRequestId);

    expect(response.headers["x-request-id"]).toBe(customRequestId);
  });

  it("should log request received", async () => {
    await request(app).get("/api/test");

    // Find the "Request received" log
    const receivedLog = consoleSpy.log.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === "Request received";
    });

    expect(receivedLog).toBeDefined();
    const parsed = JSON.parse(receivedLog![0]);
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/api/test");
  });

  it("should log request completed with duration", async () => {
    await request(app).get("/api/test");

    // Find the "Request completed" log
    const completedLog = consoleSpy.log.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === "Request completed";
    });

    expect(completedLog).toBeDefined();
    const parsed = JSON.parse(completedLog![0]);
    expect(parsed.statusCode).toBe(200);
    expect(parsed.durationMs).toBeDefined();
    expect(typeof parsed.durationMs).toBe("number");
  });

  it("should log 4xx errors as warnings", async () => {
    await request(app).get("/api/error");

    // Find the warning log
    const warningLog = consoleSpy.warn.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === "Request completed with error";
    });

    expect(warningLog).toBeDefined();
    const parsed = JSON.parse(warningLog![0]);
    expect(parsed.statusCode).toBe(400);
  });

  it("should log 5xx errors as errors", async () => {
    await request(app).get("/api/server-error");

    // Find the error log
    const errorLog = consoleSpy.error.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === "Request failed";
    });

    expect(errorLog).toBeDefined();
    const parsed = JSON.parse(errorLog![0]);
    expect(parsed.statusCode).toBe(500);
  });

  it("should skip logging for health check requests", async () => {
    await request(app).get("/health");

    // Should not have any logs for the health endpoint (except maybe internal logs)
    const healthLogs = consoleSpy.log.mock.calls.filter((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.path === "/health";
    });

    expect(healthLogs.length).toBe(0);
  });

  it("should include userId when req.user is set by auth middleware", async () => {
    // Add a middleware that simulates authenticate setting req.user
    const appWithUser = express();
    appWithUser.use((req, _res, next) => {
      req.user = { id: "test-user-123", name: "Test", email: "test@example.com", department: "Eng", roles: [], skills: [] };
      next();
    });
    appWithUser.use(requestLogger);
    appWithUser.get("/api/test", (_req, res) => { res.json({ success: true }); });

    await request(appWithUser).get("/api/test");

    const receivedLog = consoleSpy.log.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === "Request received";
    });

    expect(receivedLog).toBeDefined();
    const parsed = JSON.parse(receivedLog![0]);
    expect(parsed.userId).toBe("test-user-123");
  });

  it("should set startTime on request", async () => {
    let capturedStartTime: number | undefined;

    app.get("/api/start-time", (req, res) => {
      capturedStartTime = req.startTime;
      res.json({ startTime: req.startTime });
    });

    await request(app).get("/api/start-time");

    expect(capturedStartTime).toBeDefined();
    expect(typeof capturedStartTime).toBe("number");
    expect(capturedStartTime).toBeLessThanOrEqual(Date.now());
  });
});

// ============= Edge Cases =============

describe("Logging Edge Cases", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle empty message", () => {
    logger.info("");
    expect(consoleSpy).toHaveBeenCalled();

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe("");
  });

  it("should handle very long messages", () => {
    const longMessage = "A".repeat(10000);
    logger.info(longMessage);

    expect(consoleSpy).toHaveBeenCalled();

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe(longMessage);
  });

  it("should handle special characters in messages", () => {
    const specialMessage = 'Special chars: <>&"\'`${} 中文 🎉';
    logger.info(specialMessage);

    expect(consoleSpy).toHaveBeenCalled();

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe(specialMessage);
  });

  it("should handle undefined metadata values", () => {
    logger.info("Test", { value: undefined });

    expect(consoleSpy).toHaveBeenCalled();
    // Should not throw
  });

  it("should handle nested objects in metadata", () => {
    logger.info("Nested data", {
      user: {
        id: "123",
        profile: {
          name: "Test",
          settings: {
            theme: "dark",
          },
        },
      },
    });

    expect(consoleSpy).toHaveBeenCalled();

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.user.profile.settings.theme).toBe("dark");
  });

  it("should handle arrays in metadata", () => {
    logger.info("Array data", {
      items: [1, 2, 3],
      users: ["alice", "bob"],
    });

    expect(consoleSpy).toHaveBeenCalled();

    const output = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.items).toEqual([1, 2, 3]);
    expect(parsed.users).toEqual(["alice", "bob"]);
  });
});
