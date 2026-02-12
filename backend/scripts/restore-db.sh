#!/bin/bash
#
# SQLite Database Restore Script
# Restores from a backup file with safety checks
#
# Usage:
#   ./restore-db.sh path/to/backup.db.gz    # Restore from compressed backup
#   ./restore-db.sh path/to/backup.db       # Restore from uncompressed backup
#   ./restore-db.sh --list                  # List available backups
#   ./restore-db.sh --latest                # Restore from latest backup
#
# Environment variables:
#   DB_PATH     - Path to SQLite database (default: ../mypa.db)
#   BACKUP_DIR  - Backup directory for --list and --latest (default: ../backups)
#

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration with defaults
DB_PATH="${DB_PATH:-$BACKEND_DIR/mypa.db}"
BACKUP_DIR="${BACKUP_DIR:-$BACKEND_DIR/backups}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS] [BACKUP_FILE]"
    echo ""
    echo "Options:"
    echo "  --list      List available backups"
    echo "  --latest    Restore from the latest backup"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 backups/mypa_20240101_120000.db.gz"
    echo "  $0 --latest"
    echo "  $0 --list"
    exit 1
}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    echo ""

    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    # List backups sorted by date (newest first)
    find "$BACKUP_DIR" -name "mypa_*.db*" -type f -print0 | \
        xargs -0 ls -lt 2>/dev/null | \
        while read -r line; do
            echo "  $line"
        done

    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "mypa_*.db*" -type f | wc -l | tr -d ' ')
    echo ""
    log "Total backups: $BACKUP_COUNT"
}

# Get latest backup file
get_latest_backup() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    find "$BACKUP_DIR" -name "mypa_*.db*" -type f -print0 | \
        xargs -0 ls -t 2>/dev/null | \
        head -1
}

# Parse arguments
if [ $# -eq 0 ]; then
    usage
fi

case "$1" in
    --help|-h)
        usage
        ;;
    --list)
        list_backups
        exit 0
        ;;
    --latest)
        BACKUP_FILE=$(get_latest_backup)
        if [ -z "$BACKUP_FILE" ]; then
            log_error "No backups found in $BACKUP_DIR"
            exit 1
        fi
        log "Using latest backup: $BACKUP_FILE"
        ;;
    *)
        BACKUP_FILE="$1"
        ;;
esac

# Validate backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log "Starting restore process..."
log "  Source: $BACKUP_FILE"
log "  Target: $DB_PATH"

# Check if database currently exists
if [ -f "$DB_PATH" ]; then
    # Create a safety backup before restore
    SAFETY_BACKUP="${DB_PATH}.pre-restore.$(date +%Y%m%d_%H%M%S)"
    log "Creating safety backup: $SAFETY_BACKUP"
    cp "$DB_PATH" "$SAFETY_BACKUP"
fi

# Prepare backup file (decompress if needed)
RESTORE_SOURCE="$BACKUP_FILE"
TEMP_FILE=""

if [[ "$BACKUP_FILE" == *.gz ]]; then
    log "Decompressing backup..."
    TEMP_FILE=$(mktemp)
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    RESTORE_SOURCE="$TEMP_FILE"
fi

# Verify backup integrity before restore
log "Verifying backup integrity..."
INTEGRITY_CHECK=$(sqlite3 "$RESTORE_SOURCE" "PRAGMA integrity_check;" 2>&1)

if [ "$INTEGRITY_CHECK" != "ok" ]; then
    log_error "Backup integrity check failed: $INTEGRITY_CHECK"
    [ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"
    exit 1
fi

log "Backup integrity verified: OK"

# Check for active connections (optional warning)
if [ -f "${DB_PATH}-journal" ] || [ -f "${DB_PATH}-wal" ]; then
    log "WARNING: Database may have active connections"
    log "It is recommended to stop the application before restoring"
    echo ""
    read -p "Continue with restore? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restore cancelled"
        [ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"
        exit 1
    fi
fi

# Perform restore
log "Restoring database..."
cp "$RESTORE_SOURCE" "$DB_PATH"

# Clean up temp file
[ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"

# Verify restored database
log "Verifying restored database..."
RESTORE_CHECK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)

if [ "$RESTORE_CHECK" != "ok" ]; then
    log_error "Restored database integrity check failed: $RESTORE_CHECK"
    if [ -f "$SAFETY_BACKUP" ]; then
        log "Restoring from safety backup..."
        cp "$SAFETY_BACKUP" "$DB_PATH"
    fi
    exit 1
fi

# Show database info
TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")
DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo "unknown")

log "Restore complete!"
log "  - Database size: ${DB_SIZE} bytes"
log "  - Tables: $TABLE_COUNT"
log "  - Safety backup: ${SAFETY_BACKUP:-none}"

exit 0
