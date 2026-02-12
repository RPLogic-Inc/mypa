/**
 * PM2 Ecosystem Configuration
 * Production deployment config for MyPA backend
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs
 *   pm2 stop ecosystem.config.cjs
 */

module.exports = {
  apps: [
    {
      name: "mypa-api",
      script: "./dist/index.js",
      cwd: __dirname,

      // Single instance (SQLite doesn't support concurrent writes from multiple processes)
      instances: 1,
      exec_mode: "fork",

      // Auto-restart on failure
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,

      // Memory management
      max_memory_restart: "500M",

      // Watch for changes (development only)
      watch: false,
      ignore_watch: ["node_modules", "logs", "*.db", "*.db-journal"],

      // Graceful shutdown
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 10000,

      // Logging
      log_file: "./logs/pm2-combined.log",
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Environment variables
      env: {
        NODE_ENV: "development",
        PORT: 3001,
        LOG_LEVEL: "debug",
        LOG_TO_FILE: "false",
      },
      env_staging: {
        NODE_ENV: "staging",
        PORT: 3001,
        LOG_LEVEL: "info",
        LOG_TO_FILE: "true",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
        LOG_LEVEL: "info",
        LOG_TO_FILE: "true",
        LOG_CONSOLE: "false",
        APP_NAME: "MyPA",
        APP_SLUG: "mypa",
      },
    },

    // Backup service (runs periodically via cron)
    {
      name: "mypa-backup",
      script: "./scripts/backup-db.sh",
      cwd: __dirname,

      // Run as a one-time job via cron
      cron_restart: "0 */6 * * *", // Every 6 hours
      autorestart: false,
      watch: false,

      // Logging
      log_file: "./logs/backup.log",
      error_file: "./logs/backup-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      env: {
        NODE_ENV: "production",
        BACKUP_RETENTION_DAYS: 30,
      },
    },
  ],

};
