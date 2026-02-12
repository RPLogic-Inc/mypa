/**
 * Portable Tez Export Service
 *
 * Implements Level 2 Portable Tez export for Tezit Protocol v1.2.4.
 * Generates a JSON bundle containing a manifest, the tez markdown,
 * context items, and dependency information.
 *
 * Note: Uses a JSON bundle format instead of ZIP to keep things
 * lightweight and consistent with our SQLite-based architecture.
 */

import { db } from "../db/index.js";
import { cards, cardContext, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { tezInlineTezService } from "./tezInlineTez.js";
import { logger } from "../middleware/logging.js";
import { APP_SLUG } from "../config/app.js";

// ============= Types =============

export interface PortableTezManifest {
  tezit_version: string;
  tip_version: string;
  exported_at: string;
  platform: string;
  card_id: string;
  title: string;
  files: string[];
}

export interface PortableTezBundle {
  manifest: PortableTezManifest;
  tez_markdown: string;
  context: Array<{
    id: string;
    type: string;
    user_name: string;
    raw_text: string;
    captured_at: string;
    audio_url?: string;
  }>;
  dependencies: Array<{
    card_id: string;
    depends_on_card_id: string;
    type: string;
  }>;
}

// ============= Export =============

/**
 * Export a card as a Portable Tez bundle (Level 2 export per Tezit Protocol v1.2.4).
 *
 * The bundle includes:
 * - A manifest with metadata and version info
 * - The full Inline Tez markdown (with YAML frontmatter)
 * - All context items (voice transcriptions, text, assistant responses)
 * - Card dependency relationships
 *
 * @param cardId - The ID of the card to export
 * @returns A PortableTezBundle object ready for JSON serialization
 * @throws Error if the card does not exist
 */
export async function exportPortableTez(cardId: string): Promise<PortableTezBundle> {
  logger.info("Starting portable tez export", { cardId } as Record<string, unknown>);

  // 1. Fetch the card from db
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  });

  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }

  // 2. Get all context items for the card
  const contextItems = await db
    .select()
    .from(cardContext)
    .where(eq(cardContext.cardId, cardId));

  // 3. Dependencies table removed in fork — no dependencies to export
  const deps: Array<{ cardId: string; dependsOnCardId: string; type: string }> = [];

  // 4. Generate the Inline Tez markdown
  const tezMarkdown = await tezInlineTezService.exportCardAsInlineTez(cardId);

  // 5. Build the file list for the manifest
  const files: string[] = ["manifest.json", "tez.md"];
  if (contextItems.length > 0) {
    files.push("context.json");
  }
  if (deps.length > 0) {
    files.push("dependencies.json");
  }

  // 6. Build the manifest
  const title = card.summary || card.content.slice(0, 80);
  const manifest: PortableTezManifest = {
    tezit_version: "1.2.4",
    tip_version: "1.0.3",
    exported_at: new Date().toISOString(),
    platform: APP_SLUG,
    card_id: cardId,
    title,
    files,
  };

  // 7. Build the context array
  const context = contextItems.map((ctx) => {
    const entry: PortableTezBundle["context"][number] = {
      id: ctx.id,
      type: ctx.originalType,
      user_name: ctx.userName,
      raw_text: ctx.originalRawText,
      captured_at: ctx.capturedAt ? ctx.capturedAt.toISOString() : new Date().toISOString(),
    };
    if (ctx.originalAudioUrl) {
      entry.audio_url = ctx.originalAudioUrl;
    }
    return entry;
  });

  // 8. Build the dependencies array
  const dependencies = deps.map((dep) => ({
    card_id: dep.cardId,
    depends_on_card_id: dep.dependsOnCardId,
    type: dep.type,
  }));

  // 9. Assemble and return the bundle
  const bundle: PortableTezBundle = {
    manifest,
    tez_markdown: tezMarkdown,
    context,
    dependencies,
  };

  logger.info("Portable tez export completed", {
    cardId,
    contextCount: contextItems.length,
    dependencyCount: deps.length,
  } as Record<string, unknown>);

  return bundle;
}
