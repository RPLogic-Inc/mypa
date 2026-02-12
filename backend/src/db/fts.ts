/**
 * FTS5 Full-Text Search for Library of Context
 *
 * This module manages a SQLite FTS5 virtual table for fast, scalable full-text search
 * across all card_context entries. Uses porter stemming for better matching.
 *
 * Architecture:
 * - FTS5 virtual table stores: context_id (UNINDEXED), card_id (UNINDEXED),
 *   original_type (UNINDEXED), user_id (UNINDEXED), original_raw_text, display_bullets_text
 * - Searchable columns: original_raw_text, display_bullets_text
 * - Metadata columns (UNINDEXED): context_id, card_id, original_type, user_id for joins
 * - Porter tokenizer for stemming (running → run)
 * - BM25 ranking for relevance
 */

import { type Client } from "@libsql/client";
import { logger } from "../middleware/index.js";

const FTS_TABLE_NAME = "card_context_fts";

function isMissingFTSTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("no such table") &&
    error.message.includes(FTS_TABLE_NAME)
  );
}

/**
 * Initialize FTS5 table (idempotent - safe to call on every startup)
 */
export async function initializeFTS(client: Client): Promise<void> {
  try {
    // Create FTS5 virtual table
    await client.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE_NAME} USING fts5(
        context_id UNINDEXED,
        card_id UNINDEXED,
        user_id UNINDEXED,
        user_name UNINDEXED,
        original_type UNINDEXED,
        captured_at UNINDEXED,
        original_raw_text,
        display_bullets_text,
        tokenize='porter unicode61'
      )
    `);

    logger.info("FTS5 table initialized");
  } catch (error) {
    logger.error("Failed to initialize FTS5", error as Error);
    throw error;
  }
}

/**
 * Rebuild FTS5 index from card_context table
 * Call this on app startup to ensure FTS is in sync
 */
export async function rebuildFTSIndex(client: Client): Promise<void> {
  try {
    // Clear existing FTS data
    await client.execute(`DELETE FROM ${FTS_TABLE_NAME}`);

    // Rebuild from card_context
    await client.execute(`
      INSERT INTO ${FTS_TABLE_NAME}
        (context_id, card_id, user_id, user_name, original_type, captured_at, original_raw_text, display_bullets_text)
      SELECT
        id,
        card_id,
        user_id,
        user_name,
        original_type,
        captured_at,
        original_raw_text,
        COALESCE(
          (SELECT json_group_array(value)
           FROM json_each(display_bullets)),
          '[]'
        ) as display_bullets_text
      FROM card_context
    `);

    const result = await client.execute(`SELECT COUNT(*) as count FROM ${FTS_TABLE_NAME}`);
    const count = (result.rows[0] as any).count;
    logger.info(`FTS5 index rebuilt: ${count} entries indexed`);
  } catch (error) {
    logger.error("Failed to rebuild FTS5 index", error as Error);
    throw error;
  }
}

/**
 * Insert a context entry into FTS5
 * Call this when creating new card_context entries
 */
export async function insertIntoFTS(
  client: Client,
  entry: {
    contextId: string;
    cardId: string;
    userId: string;
    userName: string;
    originalType: string;
    capturedAt: number;
    originalRawText: string;
    displayBullets?: string[];
  }
): Promise<void> {
  const displayBulletsText = entry.displayBullets
    ? JSON.stringify(entry.displayBullets)
    : '[]';

  const insertRow = async () => {
    await client.execute({
      sql: `INSERT INTO ${FTS_TABLE_NAME}
        (context_id, card_id, user_id, user_name, original_type, captured_at, original_raw_text, display_bullets_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entry.contextId,
        entry.cardId,
        entry.userId,
        entry.userName,
        entry.originalType,
        entry.capturedAt,
        entry.originalRawText,
        displayBulletsText,
      ],
    });
  };

  try {
    await insertRow();
  } catch (error) {
    if (isMissingFTSTableError(error)) {
      try {
        logger.warn("FTS5 table missing on insert; initializing and retrying", {
          contextId: entry.contextId,
        });
        await initializeFTS(client);
        await insertRow();
        return;
      } catch (retryError) {
        logger.error("Failed to initialize/retry FTS5 insert", retryError as Error, {
          contextId: entry.contextId,
        });
        return;
      }
    }

    logger.error("Failed to insert into FTS5", error as Error, {
      contextId: entry.contextId,
    });
    // Don't throw - FTS failure shouldn't block the main operation
  }
}

/**
 * Update FTS5 entry (used when display_bullets are regenerated)
 */
export async function updateFTSEntry(
  client: Client,
  contextId: string,
  displayBullets: string[]
): Promise<void> {
  try {
    const displayBulletsText = JSON.stringify(displayBullets);

    await client.execute({
      sql: `UPDATE ${FTS_TABLE_NAME}
        SET display_bullets_text = ?
        WHERE context_id = ?`,
      args: [displayBulletsText, contextId],
    });
  } catch (error) {
    logger.error("Failed to update FTS5 entry", error as Error, { contextId });
    // Don't throw - FTS failure shouldn't block the main operation
  }
}

/**
 * Delete a context entry from FTS5
 * Call this if card_context entries are ever deleted
 */
export async function deleteFromFTS(client: Client, contextId: string): Promise<void> {
  try {
    await client.execute({
      sql: `DELETE FROM ${FTS_TABLE_NAME} WHERE context_id = ?`,
      args: [contextId],
    });
  } catch (error) {
    logger.error("Failed to delete from FTS5", error as Error, { contextId });
    // Don't throw - FTS failure shouldn't block the main operation
  }
}

/**
 * Search FTS5 with filters and pagination
 * Returns context_id and metadata for joining with card_context
 */
export interface FTSSearchOptions {
  query: string;
  type?: string; // "voice" | "text" | "assistant"
  userId?: string; // Filter by content author
  afterDate?: number; // Unix timestamp
  beforeDate?: number; // Unix timestamp
  limit?: number;
  offset?: number;
}

export interface FTSSearchResult {
  context_id: string;
  card_id: string;
  user_id: string;
  user_name: string;
  original_type: string;
  captured_at: number;
  snippet: string;
  rank: number;
}

export async function searchFTS(
  client: Client,
  options: FTSSearchOptions
): Promise<FTSSearchResult[]> {
  try {
    const { query, type, userId, afterDate, beforeDate, limit = 20, offset = 0 } = options;

    // Build WHERE clause for filters
    const whereClauses: string[] = [`${FTS_TABLE_NAME} MATCH ?`];
    const args: any[] = [query];

    if (type) {
      whereClauses.push("original_type = ?");
      args.push(type);
    }

    if (userId) {
      whereClauses.push("user_id = ?");
      args.push(userId);
    }

    if (afterDate) {
      whereClauses.push("captured_at >= ?");
      args.push(afterDate);
    }

    if (beforeDate) {
      whereClauses.push("captured_at <= ?");
      args.push(beforeDate);
    }

    const whereClause = whereClauses.join(" AND ");

    // Execute search with BM25 ranking and snippet generation
    const sql = `
      SELECT
        context_id,
        card_id,
        user_id,
        user_name,
        original_type,
        captured_at,
        snippet(${FTS_TABLE_NAME}, 6, '<mark>', '</mark>', '...', 32) as snippet,
        bm25(${FTS_TABLE_NAME}) as rank
      FROM ${FTS_TABLE_NAME}
      WHERE ${whereClause}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;

    args.push(limit, offset);

    const result = await client.execute({ sql, args });

    return result.rows.map((row: any) => ({
      context_id: row.context_id,
      card_id: row.card_id,
      user_id: row.user_id,
      user_name: row.user_name,
      original_type: row.original_type,
      captured_at: row.captured_at,
      snippet: row.snippet,
      rank: row.rank,
    }));
  } catch (error) {
    logger.error("FTS5 search failed", error as Error, { query: options.query });
    throw error;
  }
}

/**
 * Get total count for a search query (for pagination metadata)
 */
export async function countFTSResults(
  client: Client,
  options: Omit<FTSSearchOptions, "limit" | "offset">
): Promise<number> {
  try {
    const { query, type, userId, afterDate, beforeDate } = options;

    const whereClauses: string[] = [`${FTS_TABLE_NAME} MATCH ?`];
    const args: any[] = [query];

    if (type) {
      whereClauses.push("original_type = ?");
      args.push(type);
    }

    if (userId) {
      whereClauses.push("user_id = ?");
      args.push(userId);
    }

    if (afterDate) {
      whereClauses.push("captured_at >= ?");
      args.push(afterDate);
    }

    if (beforeDate) {
      whereClauses.push("captured_at <= ?");
      args.push(beforeDate);
    }

    const whereClause = whereClauses.join(" AND ");

    const sql = `
      SELECT COUNT(*) as count
      FROM ${FTS_TABLE_NAME}
      WHERE ${whereClause}
    `;

    const result = await client.execute({ sql, args });
    return (result.rows[0] as any).count;
  } catch (error) {
    logger.error("FTS5 count failed", error as Error, { query: options.query });
    throw error;
  }
}
