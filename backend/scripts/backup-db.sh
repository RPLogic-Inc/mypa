#!/bin/bash
#
# SQLite Database Backup Script
# Creates timestamped backups with configurable retention
#
# Usage:
#   ./backup-db.sh                    # Run with defaults
#   BACKUP_DIR=/custom/path ./backup-db.sh
#
# Environment variables:
#   DB_PATH              - Path to SQLite database (default: ../mypa.db)
#   BACKUP_DIR           - Backup directory (default: ../backups)
#   BACKUP_RETENTION_DAYS - Days to keep backups (default: 30)
#   BACKUP_COMPRESS      - Compress backups with gzip (default: true)
#

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration with defaults
DB_PATH="${DB_PATH:-$BACKEND_DIR/mypa.db}"
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_COMPRESS="${BACKUP_COMPRESS:-true}"

# Timestamp for backup file
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="mypa_${TIMESTAMP}.db"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    log_error "Database file not found: $DB_PATH"
    exit 1
fi

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
    log "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# Create backup using SQLite's backup command (safe for concurrent access)
log "Starting backup of $DB_PATH"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

# Use SQLite's .backup command for safe online backup
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

if [ $? -ne 0 ]; then
    log_error "Backup command failed"
    exit 1
fi

# Verify backup file was created
if [ ! -f "$BACKUP_PATH" ]; then
    log_error "Backup file was not created"
    exit 1
fi

# Get backup file size
BACKUP_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null || echo "unknown")
log "Backup created: $BACKUP_PATH (${BACKUP_SIZE} bytes)"

# Compress backup if enabled
if [ "$BACKUP_COMPRESS" = "true" ]; then
    log "Compressing backup..."
    gzip "$BACKUP_PATH"
    BACKUP_PATH="${BACKUP_PATH}.gz"
    COMPRESSED_SIZE=$(stat -f%z "$BACKUP_PATH" 2>/dev/null || stat -c%s "$BACKUP_PATH" 2>/dev/null || echo "unknown")
    log "Compressed backup: $BACKUP_PATH (${COMPRESSED_SIZE} bytes)"
fi

# Verify backup integrity
log "Verifying backup integrity..."
if [ "$BACKUP_COMPRESS" = "true" ]; then
    # For compressed files, decompress to temp and verify
    TEMP_DB=$(mktemp)
    gunzip -c "$BACKUP_PATH" > "$TEMP_DB"
    INTEGRITY_CHECK=$(sqlite3 "$TEMP_DB" "PRAGMA integrity_check;" 2>&1)
    rm -f "$TEMP_DB"
else
    INTEGRITY_CHECK=$(sqlite3 "$BACKUP_PATH" "PRAGMA integrity_check;" 2>&1)
fi

if [ "$INTEGRITY_CHECK" != "ok" ]; then
    log_error "Backup integrity check failed: $INTEGRITY_CHECK"
    exit 1
fi

log "Backup integrity verified: OK"

# Clean up old backups
log "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."
DELETED_COUNT=0

if [ "$(uname)" = "Darwin" ]; then
    # macOS
    find "$BACKUP_DIR" -name "mypa_*.db*" -mtime +$BACKUP_RETENTION_DAYS -type f | while read -r old_backup; do
        log "Deleting old backup: $old_backup"
        rm -f "$old_backup"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    done
else
    # Linux
    find "$BACKUP_DIR" -name "mypa_*.db*" -mtime +$BACKUP_RETENTION_DAYS -type f -delete -print | while read -r old_backup; do
        log "Deleted old backup: $old_backup"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    done
fi

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "mypa_*.db*" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")

log "Backup complete!"
log "  - Total backups: $BACKUP_COUNT"
log "  - Total backup size: $TOTAL_SIZE"
log "  - Latest backup: $(basename "$BACKUP_PATH")"

exit 0
