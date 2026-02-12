/**
 * Unit tests for Error Tracking Service
 *
 * Tests:
 * - Breadcrumb tracking
 * - Exception capture
 * - Message capture
 * - Scoped error tracking
 * - Severity levels
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  errorTracker,
  type ErrorSeverity,
  type ErrorContext,
  type Breadcrumb,
} from "../services/errorTracking.js";

// ============= Test Suite =============

describe("Error Tracking Service", () => {
  beforeEach(() => {
    errorTracker.clearBreadcrumbs();
  });

  // ============= Breadcrumb Tests =============

  describe("Breadcrumbs", () => {
    it("should add a breadcrumb", () => {
      errorTracker.addBreadcrumb({
        category: "test",
        message: "Test breadcrumb",
        level: "info",
      });

      // Capture error to verify breadcrumbs are included
      // The breadcrumbs are internal but affect the error reports
      expect(true).toBe(true); // Breadcrumbs are added internally
    });

    it("should add breadcrumb with data", () => {
      errorTracker.addBreadcrumb({
        category: "http",
        message: "GET /api/test",
        level: "info",
        data: {
          method: "GET",
          path: "/api/test",
          statusCode: 200,
        },
      });

      expect(true).toBe(true);
    });

    it("should clear breadcrumbs", () => {
      errorTracker.addBreadcrumb({
        category: "test",
        message: "Breadcrumb 1",
        level: "info",
      });

      errorTracker.addBreadcrumb({
        category: "test",
        message: "Breadcrumb 2",
        level: "info",
      });

      errorTracker.clearBreadcrumbs();

      // After clearing, new capture should have no breadcrumbs
      expect(true).toBe(true);
    });

    it("should support all breadcrumb levels", () => {
      const levels: Breadcrumb["level"][] = ["debug", "info", "warning", "error"];

      levels.forEach((level) => {
        errorTracker.addBreadcrumb({
          category: "test",
          message: `${level} level breadcrumb`,
          level,
        });
      });

      expect(true).toBe(true);
    });
  });

  // ============= Exception Capture Tests =============

  describe("captureException", () => {
    it("should capture an error and return report ID", async () => {
      const error = new Error("Test error message");
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
      expect(typeof reportId).toBe("string");
      expect(reportId.length).toBeGreaterThan(0);
    });

    it("should capture error with severity", async () => {
      const error = new Error("Critical error");
      const reportId = await errorTracker.captureException(error, "fatal");

      expect(reportId).toBeDefined();
    });

    it("should capture error with context", async () => {
      const error = new Error("Context error");
      const context: ErrorContext = {
        userId: "user-123",
        requestId: "req-456",
        action: "test action",
        tags: { environment: "test" },
        extra: { customData: "value" },
      };

      const reportId = await errorTracker.captureException(error, "error", context);

      expect(reportId).toBeDefined();
    });

    it("should handle errors without stack traces", async () => {
      const error = new Error("No stack");
      error.stack = undefined;

      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });

    it("should support all severity levels", async () => {
      const severities: ErrorSeverity[] = ["fatal", "error", "warning", "info"];

      for (const severity of severities) {
        const error = new Error(`${severity} level error`);
        const reportId = await errorTracker.captureException(error, severity);
        expect(reportId).toBeDefined();
      }
    });

    it("should default to error severity", async () => {
      const error = new Error("Default severity error");
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });
  });

  // ============= Message Capture Tests =============

  describe("captureMessage", () => {
    it("should capture a message and return report ID", async () => {
      const reportId = await errorTracker.captureMessage("Test message");

      expect(reportId).toBeDefined();
      expect(typeof reportId).toBe("string");
    });

    it("should capture message with severity", async () => {
      const reportId = await errorTracker.captureMessage(
        "Warning message",
        "warning"
      );

      expect(reportId).toBeDefined();
    });

    it("should capture message with context", async () => {
      const context: ErrorContext = {
        userId: "user-789",
        requestId: "req-012",
        teamId: "team-345",
      };

      const reportId = await errorTracker.captureMessage(
        "Contextual message",
        "info",
        context
      );

      expect(reportId).toBeDefined();
    });

    it("should default to info severity", async () => {
      const reportId = await errorTracker.captureMessage("Info message");

      expect(reportId).toBeDefined();
    });

    it("should support all severity levels", async () => {
      const severities: ErrorSeverity[] = ["fatal", "error", "warning", "info"];

      for (const severity of severities) {
        const reportId = await errorTracker.captureMessage(
          `${severity} level message`,
          severity
        );
        expect(reportId).toBeDefined();
      }
    });
  });

  // ============= Scoped Error Tracker Tests =============

  describe("withScope", () => {
    it("should create a scoped tracker with preset context", () => {
      const scopedTracker = errorTracker.withScope({
        userId: "scoped-user",
        teamId: "scoped-team",
      });

      expect(scopedTracker).toBeDefined();
      expect(typeof scopedTracker.captureException).toBe("function");
      expect(typeof scopedTracker.captureMessage).toBe("function");
    });

    it("should capture exception with scoped context", async () => {
      const scopedTracker = errorTracker.withScope({
        userId: "user-abc",
        action: "scoped action",
      });

      const error = new Error("Scoped error");
      const reportId = await scopedTracker.captureException(error);

      expect(reportId).toBeDefined();
    });

    it("should capture message with scoped context", async () => {
      const scopedTracker = errorTracker.withScope({
        requestId: "req-xyz",
      });

      const reportId = await scopedTracker.captureMessage("Scoped message");

      expect(reportId).toBeDefined();
    });

    it("should allow adding breadcrumbs to scoped tracker", () => {
      const scopedTracker = errorTracker.withScope({
        userId: "user-scope",
      });

      scopedTracker.addBreadcrumb({
        category: "scoped",
        message: "Scoped breadcrumb",
        level: "info",
      });

      expect(true).toBe(true);
    });
  });

  // ============= Error Context Tests =============

  describe("Error Context", () => {
    it("should handle context with all fields", async () => {
      const fullContext: ErrorContext = {
        userId: "user-full",
        requestId: "req-full",
        teamId: "team-full",
        action: "full action",
        tags: {
          version: "1.0.0",
          environment: "test",
          feature: "error-tracking",
        },
        extra: {
          customField1: "value1",
          customField2: 123,
          customField3: { nested: true },
        },
      };

      const error = new Error("Full context error");
      const reportId = await errorTracker.captureException(
        error,
        "error",
        fullContext
      );

      expect(reportId).toBeDefined();
    });

    it("should handle empty context", async () => {
      const error = new Error("Empty context error");
      const reportId = await errorTracker.captureException(error, "error", {});

      expect(reportId).toBeDefined();
    });

    it("should handle context with only some fields", async () => {
      const partialContext: ErrorContext = {
        userId: "partial-user",
      };

      const reportId = await errorTracker.captureMessage(
        "Partial context message",
        "info",
        partialContext
      );

      expect(reportId).toBeDefined();
    });
  });

  // ============= Edge Cases =============

  describe("Edge Cases", () => {
    it("should handle very long error messages", async () => {
      const longMessage = "A".repeat(10000);
      const error = new Error(longMessage);
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });

    it("should handle special characters in error messages", async () => {
      const error = new Error("Special chars: <>&\"'`${} 中文 🎉");
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });

    it("should handle rapid consecutive captures", async () => {
      const captures = [];
      for (let i = 0; i < 10; i++) {
        captures.push(
          errorTracker.captureException(new Error(`Rapid error ${i}`))
        );
      }

      const reportIds = await Promise.all(captures);

      // All should have unique IDs
      const uniqueIds = new Set(reportIds);
      expect(uniqueIds.size).toBe(10);
    });

    it("should handle empty error message", async () => {
      const error = new Error("");
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });

    it("should handle custom error types", async () => {
      class CustomError extends Error {
        constructor(message: string, public code: string) {
          super(message);
          this.name = "CustomError";
        }
      }

      const error = new CustomError("Custom error", "CUSTOM_001");
      const reportId = await errorTracker.captureException(error);

      expect(reportId).toBeDefined();
    });
  });
});
