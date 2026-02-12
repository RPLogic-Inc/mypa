/**
 * PA Workspace Configuration
 *
 * Environment-driven config. No hardcoded app names — the parent app's
 * identity is determined by APP_API_URL and JWT_SECRET shared between systems.
 */

export const config = {
  /** Server port */
  port: parseInt(process.env.PORT || "3003", 10),

  /** Node environment */
  nodeEnv: process.env.NODE_ENV || "development",

  /** Database URL */
  databaseUrl: process.env.DATABASE_URL || "file:./pa-workspace.db",

  /** App backend API URL (the parent app this module serves) */
  appApiUrl: process.env.APP_API_URL || "http://localhost:3001",

  /** Service token for app backend API calls */
  appServiceToken: process.env.APP_SERVICE_TOKEN || "",

  /** CORS allowed origins */
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:5173",
    "http://localhost:3001",
  ],

  /** Logging */
  logLevel: process.env.LOG_LEVEL || "info",
  logToFile: process.env.LOG_TO_FILE === "true" || process.env.NODE_ENV === "production",
  logDir: process.env.LOG_DIR || "./logs",
} as const;
