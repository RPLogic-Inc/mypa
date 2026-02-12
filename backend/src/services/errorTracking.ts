/**
 * Error Tracking Service
 * Provides a unified interface for error tracking that can integrate with
 * Sentry, Datadog, or other monitoring services. Falls back to structured logging.
 */

import { logger } from "../middleware/logging.js";
import { randomUUID } from "crypto";

// Error severity levels
export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

// Error context for additional debugging information
export interface ErrorContext {
  userId?: string;
  requestId?: string;
  teamId?: string;
  action?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

// Breadcrumb for tracking user actions leading to an error
export interface Breadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: "debug" | "info" | "warning" | "error";
  data?: Record<string, unknown>;
}

// Error report structure
export interface ErrorReport {
  id: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  severity: ErrorSeverity;
  context: ErrorContext;
  breadcrumbs: Breadcrumb[];
  environment: string;
  release?: string;
  serverName?: string;
}

// External service integration interface
interface ErrorTrackingProvider {
  captureException(report: ErrorReport): Promise<void>;
  captureMessage(message: string, severity: ErrorSeverity, context?: ErrorContext): Promise<void>;
}

/**
 * Sentry-like error tracking provider
 * Sends errors to Sentry if configured, otherwise logs to file
 */
class SentryProvider implements ErrorTrackingProvider {
  private dsn: string | null;
  private environment: string;
  private release: string | undefined;

  constructor() {
    this.dsn = process.env.SENTRY_DSN || null;
    this.environment = process.env.NODE_ENV || "development";
    this.release = process.env.APP_VERSION;

    if (this.dsn) {
      logger.info("Sentry error tracking configured", { dsn: "[REDACTED]" });
    }
  }

  async captureException(report: ErrorReport): Promise<void> {
    if (this.dsn) {
      // In production, this would send to Sentry
      // For now, we log the fact that we would send to Sentry
      await this.sendToSentry(report);
    }
  }

  async captureMessage(message: string, severity: ErrorSeverity, context?: ErrorContext): Promise<void> {
    if (this.dsn) {
      const report: ErrorReport = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        error: { name: "Message", message },
        severity,
        context: context || {},
        breadcrumbs: [],
        environment: this.environment,
        release: this.release,
      };
      await this.sendToSentry(report);
    }
  }

  private async sendToSentry(report: ErrorReport): Promise<void> {
    // Sentry SDK integration would go here
    // For now, we simulate the API call
    try {
      // In production with Sentry SDK:
      // Sentry.captureException(report.error, { extra: report.context });

      // Simulate HTTP POST to Sentry
      if (process.env.SENTRY_DSN && process.env.NODE_ENV === "production") {
        // Would use fetch to send to Sentry API
        logger.debug("Would send to Sentry", { reportId: report.id });
      }
    } catch (err) {
      logger.error("Failed to send to Sentry", err as Error);
    }
  }
}

/**
 * Webhook-based error tracking provider
 * Sends errors to a configurable webhook endpoint (Slack, Discord, PagerDuty, etc.)
 */
class WebhookProvider implements ErrorTrackingProvider {
  private webhookUrl: string | null;
  private minSeverity: ErrorSeverity;

  private severityPriority: Record<ErrorSeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
    fatal: 3,
  };

  constructor() {
    this.webhookUrl = process.env.ERROR_WEBHOOK_URL || null;
    this.minSeverity = (process.env.ERROR_WEBHOOK_MIN_SEVERITY as ErrorSeverity) || "error";

    if (this.webhookUrl) {
      logger.info("Webhook error tracking configured");
    }
  }

  private shouldSend(severity: ErrorSeverity): boolean {
    return this.severityPriority[severity] >= this.severityPriority[this.minSeverity];
  }

  async captureException(report: ErrorReport): Promise<void> {
    if (!this.webhookUrl || !this.shouldSend(report.severity)) return;

    await this.sendWebhook(report);
  }

  async captureMessage(message: string, severity: ErrorSeverity, context?: ErrorContext): Promise<void> {
    if (!this.webhookUrl || !this.shouldSend(severity)) return;

    const report: ErrorReport = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      error: { name: "Message", message },
      severity,
      context: context || {},
      breadcrumbs: [],
      environment: process.env.NODE_ENV || "development",
    };

    await this.sendWebhook(report);
  }

  private async sendWebhook(report: ErrorReport): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const payload = this.formatPayload(report);
      await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      logger.error("Failed to send error webhook", err as Error);
    }
  }

  private formatPayload(report: ErrorReport): Record<string, unknown> {
    // Format for Slack-compatible webhooks
    const severityEmoji: Record<ErrorSeverity, string> = {
      fatal: "🔴",
      error: "🟠",
      warning: "🟡",
      info: "🔵",
    };

    return {
      text: `${severityEmoji[report.severity]} *${report.severity.toUpperCase()}*: ${report.error.message}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${severityEmoji[report.severity]} ${report.error.name}: ${report.error.message}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Severity:*\n${report.severity}` },
            { type: "mrkdwn", text: `*Environment:*\n${report.environment}` },
            { type: "mrkdwn", text: `*Timestamp:*\n${report.timestamp}` },
            { type: "mrkdwn", text: `*Report ID:*\n${report.id}` },
          ],
        },
        ...(report.context.userId || report.context.requestId
          ? [{
              type: "section",
              fields: [
                ...(report.context.userId ? [{ type: "mrkdwn", text: `*User ID:*\n${report.context.userId}` }] : []),
                ...(report.context.requestId ? [{ type: "mrkdwn", text: `*Request ID:*\n${report.context.requestId}` }] : []),
              ],
            }]
          : []),
        ...(report.error.stack && process.env.NODE_ENV !== "production"
          ? [{
              type: "section",
              text: {
                type: "mrkdwn",
                text: "```" + report.error.stack.slice(0, 500) + "```",
              },
            }]
          : []),
      ],
    };
  }
}

/**
 * Main Error Tracking Service
 */
class ErrorTracker {
  private providers: ErrorTrackingProvider[] = [];
  private breadcrumbs: Breadcrumb[] = [];
  private maxBreadcrumbs: number = 50;
  private environment: string;
  private release: string | undefined;
  private serverName: string | undefined;

  constructor() {
    this.environment = process.env.NODE_ENV || "development";
    this.release = process.env.APP_VERSION;
    this.serverName = process.env.HOSTNAME;

    // Initialize providers
    this.providers.push(new SentryProvider());
    this.providers.push(new WebhookProvider());
  }

  /**
   * Add a breadcrumb to track user actions
   */
  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: new Date().toISOString(),
    });

    // Keep only the last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Clear all breadcrumbs (e.g., after handling an error)
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Capture an exception with full context
   */
  async captureException(
    error: Error,
    severity: ErrorSeverity = "error",
    context: ErrorContext = {}
  ): Promise<string> {
    const reportId = randomUUID();

    const report: ErrorReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      severity,
      context,
      breadcrumbs: [...this.breadcrumbs],
      environment: this.environment,
      release: this.release,
      serverName: this.serverName,
    };

    // Log locally first
    logger.error(`[${reportId}] ${error.message}`, error, {
      ...context,
      severity,
      breadcrumbCount: this.breadcrumbs.length,
    });

    // Send to all providers
    await Promise.allSettled(
      this.providers.map(provider => provider.captureException(report))
    );

    // Clear breadcrumbs after reporting
    this.clearBreadcrumbs();

    return reportId;
  }

  /**
   * Capture a message (non-error event)
   */
  async captureMessage(
    message: string,
    severity: ErrorSeverity = "info",
    context: ErrorContext = {}
  ): Promise<string> {
    const reportId = randomUUID();

    // Log locally
    if (severity === "fatal" || severity === "error") {
      logger.error(`[${reportId}] ${message}`, undefined, { ...context });
    } else if (severity === "warning") {
      logger.warn(`[${reportId}] ${message}`, { ...context });
    } else {
      logger.info(`[${reportId}] ${message}`, { ...context });
    }

    // Send to providers
    await Promise.allSettled(
      this.providers.map(provider => provider.captureMessage(message, severity, context))
    );

    return reportId;
  }

  /**
   * Create a scoped error tracker with preset context
   */
  withScope(context: ErrorContext): ScopedErrorTracker {
    return new ScopedErrorTracker(this, context);
  }
}

/**
 * Scoped error tracker with preset context
 */
class ScopedErrorTracker {
  constructor(
    private tracker: ErrorTracker,
    private context: ErrorContext
  ) {}

  addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    this.tracker.addBreadcrumb(breadcrumb);
  }

  async captureException(error: Error, severity?: ErrorSeverity): Promise<string> {
    return this.tracker.captureException(error, severity, this.context);
  }

  async captureMessage(message: string, severity?: ErrorSeverity): Promise<string> {
    return this.tracker.captureMessage(message, severity, this.context);
  }
}

// Export singleton instance
export const errorTracker = new ErrorTracker();

// Express middleware for automatic error tracking
import { Request, Response, NextFunction } from "express";

export function errorTrackingMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Add request context
  const context: ErrorContext = {
    requestId: req.requestId,
    userId: req.user?.id,
    action: `${req.method} ${req.path}`,
    extra: {
      query: req.query,
      headers: {
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
      },
    },
  };

  // Determine severity based on status code
  const statusCode = res.statusCode >= 500 ? res.statusCode : 500;
  const severity: ErrorSeverity = statusCode >= 500 ? "error" : "warning";

  // Track the error (non-blocking)
  errorTracker.captureException(err, severity, context).catch(() => {
    // Ignore tracking failures
  });

  // Continue to the next error handler
  next(err);
}

/**
 * Express middleware to add breadcrumbs for each request
 */
export function breadcrumbMiddleware(req: Request, _res: Response, next: NextFunction): void {
  errorTracker.addBreadcrumb({
    category: "http",
    message: `${req.method} ${req.path}`,
    level: "info",
    data: {
      method: req.method,
      path: req.path,
      query: req.query,
    },
  });

  next();
}
