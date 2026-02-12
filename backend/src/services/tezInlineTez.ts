/**
 * Inline Tez Import/Export Service
 *
 * Handles conversion between MyPA cards and Inline Tez format
 * (Markdown with YAML frontmatter per Tezit Protocol v1.2).
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { cards, cardContext, cardRecipients, responses, users } from "../db/schema.js";
import { randomUUID } from "crypto";
import {
  type CoordinationSurface,
  mapStatusToCoordination,
  timestampToISODate,
  validateCoordinationSurface,
  mapCoordinationToStatus,
  isoDateToTimestamp,
} from "../types/coordination-profile.js";
import Ajv from "ajv";
import { logger } from "../middleware/logging.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ============= Schema Validation =============

// Load and compile JSON schema for Inline Tez validation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, "..", "schemas", "inline-tez.schema.json");
const inlineTezSchema = JSON.parse(readFileSync(schemaPath, "utf-8"));

// Add custom URI format validator (instead of using ajv-formats which has vitest compatibility issues)
const ajv = new Ajv({
  allErrors: true,
  validateSchema: false, // Disable meta-schema validation to avoid $schema reference issues
});
ajv.addFormat("uri", {
  type: "string",
  validate: (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
});
ajv.addFormat("email", {
  type: "string",
  validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
});

const validateInlineTezSchema = ajv.compile(inlineTezSchema);

// ============= Simple YAML Frontmatter Parser =============

interface ParsedFrontmatter {
  [key: string]: unknown;
}

/**
 * Validate parsed frontmatter against the Inline Tez schema.
 * Provides detailed error messages for validation failures.
 */
function validateFrontmatter(frontmatter: ParsedFrontmatter): void {
  const valid = validateInlineTezSchema(frontmatter);

  if (!valid) {
    const errors = validateInlineTezSchema.errors || [];
    const errorMessages = errors.map((err) => {
      const path = (err as unknown as { instancePath?: string }).instancePath || "(root)";
      const message = err.message || "unknown error";
      const params = JSON.stringify(err.params);
      return `${path}: ${message} ${params}`;
    }).join("\n");

    throw new Error(`Inline Tez frontmatter validation failed:\n${errorMessages}`);
  }

  // Additional validation: check for duplicate labels in context array
  const context = frontmatter.context as Array<{ label?: string }> | undefined;
  if (context && Array.isArray(context)) {
    const labels = context.map(item => item.label).filter(Boolean);
    const labelSet = new Set<string>();

    for (const label of labels) {
      if (labelSet.has(label as string)) {
        throw new Error(`Duplicate context label: "${label}". Each context item must have a unique label.`);
      }
      labelSet.add(label as string);
    }

    // Validate URLs in context items
    for (const item of context) {
      if ("url" in item && item.url) {
        try {
          new URL(item.url as string);
        } catch {
          throw new Error(`Invalid URL in context item: "${item.url}"`);
        }
      }
    }
  }
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Improved parser that handles:
 * - Basic key-value pairs and arrays (original functionality)
 * - Multi-line strings with literal (|) and folded (>) block scalars
 * - Flow-style arrays and objects: [item1, item2] and {key: value}
 * - Duplicate key detection
 * - Better error messages
 */
function parseFrontmatter(markdown: string): { frontmatter: ParsedFrontmatter; body: string } | null {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = markdown.trim().match(fmRegex);

  if (!match) {
    return null;
  }

  const yamlBlock = match[1];
  const body = match[2];

  const frontmatter: ParsedFrontmatter = {};
  const lines = yamlBlock.split("\n");
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentObj: Record<string, string> | null = null;

  // Multi-line string tracking
  let multilineMode: "literal" | "folded" | null = null;
  let multilineContent: string[] = [];
  let multilineIndent = 0;

  // Track seen keys to detect duplicates
  const seenKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle multi-line content continuation
    if (multilineMode) {
      const lineIndent = line.match(/^(\s*)/)?.[1].length || 0;

      // Check if we're still in multi-line content (indented past the key)
      if (line.trim() !== "" && lineIndent > multilineIndent) {
        // Remove the base indentation
        const content = line.substring(multilineIndent);
        multilineContent.push(content);
        continue;
      } else {
        // End of multi-line block - save it
        if (currentKey) {
          const content = multilineMode === "literal"
            ? multilineContent.join("\n")
            : multilineContent.join(" ").trim();
          frontmatter[currentKey] = content;
          currentKey = null;
        }
        multilineMode = null;
        multilineContent = [];
        // Fall through to process current line normally
      }
    }
    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // Check for array item (indented with -)
    const arrayItemMatch = line.match(/^\s+-\s+(.*)/);
    if (arrayItemMatch && currentKey && currentArray) {
      // Save previous object if any
      if (currentObj) {
        currentArray.push(currentObj);
        currentObj = null;
      }
      const value = arrayItemMatch[1].trim();

      // Handle flow-style objects: - {key: value, key2: value2}
      if (value.startsWith("{") && value.endsWith("}")) {
        const objContent = value.slice(1, -1);
        const obj: Record<string, string> = {};
        const pairs = objContent.split(",").map(p => p.trim());
        for (const pair of pairs) {
          const [k, ...vParts] = pair.split(":");
          if (k && vParts.length > 0) {
            obj[k.trim()] = vParts.join(":").trim().replace(/^["']|["']$/g, "");
          }
        }
        currentArray.push(obj);
        continue;
      }

      // Check if it's an object-like array item (key: value pairs)
      if (value.includes(":")) {
        currentObj = {};
        const kvMatch = value.match(/^(\w[\w-]*):\s*"?([^"]*)"?$/);
        if (kvMatch) {
          currentObj[kvMatch[1]] = kvMatch[2];
        }
      } else {
        currentArray.push(value.replace(/^"(.*)"$/, "$1"));
      }
      continue;
    }

    // Check for continuation key-value in a block-style object array item
    // These are indented lines (without -) that belong to the current object
    const continuationMatch = line.match(/^\s{4,}(\w[\w-]*):\s*"?([^"]*)"?$/);
    if (continuationMatch && currentKey && currentArray && currentObj) {
      currentObj[continuationMatch[1]] = continuationMatch[2];
      continue;
    }

    // Check for key: value pair
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      // Save previous object into array if any
      if (currentObj && currentArray) {
        currentArray.push(currentObj);
        currentObj = null;
      }
      // Save previous array if any
      if (currentKey && currentArray) {
        frontmatter[currentKey] = currentArray;
        currentArray = null;
      }

      const key = kvMatch[1];
      const value = kvMatch[2].trim();

      // Check for duplicate keys
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate key in YAML frontmatter: "${key}"`);
      }
      seenKeys.add(key);

      currentKey = key;

      // Check for multi-line literal block (|) or folded block (>)
      if (value === "|" || value === ">") {
        multilineMode = value === "|" ? "literal" : "folded";
        multilineIndent = (line.match(/^(\s*)/)?.[1].length || 0) + 2; // Key indent + 2
        multilineContent = [];
        continue;
      }

      if (value === "" || value === undefined) {
        // Could be start of an array or nested object
        currentArray = [];
      } else {
        // Simple value
        frontmatter[currentKey] = value.replace(/^"(.*)"$/, "$1");
        currentKey = null;
      }
    }
  }

  // Handle any remaining multi-line content
  if (multilineMode && currentKey) {
    const content = multilineMode === "literal"
      ? multilineContent.join("\n")
      : multilineContent.join(" ").trim();
    frontmatter[currentKey] = content;
  }

  // Save last object into array if any
  if (currentObj && currentArray) {
    currentArray.push(currentObj);
  }

  // Save last array if any
  if (currentKey && currentArray) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body };
}

/**
 * Serialize an object to YAML frontmatter format.
 * Handles nested objects, arrays, and simple values.
 */
function serializeFrontmatter(data: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const indentStr = "  ".repeat(indent);

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${indentStr}${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item as Record<string, unknown>);
          if (entries.length > 0) {
            // Emit proper YAML block-style object array:
            //   - key1: "val1"
            //     key2: "val2"
            entries.forEach(([k, v], idx) => {
              if (idx === 0) {
                lines.push(`${indentStr}  - ${k}: "${v}"`);
              } else {
                lines.push(`${indentStr}    ${k}: "${v}"`);
              }
            });
          }
        } else {
          lines.push(`${indentStr}  - "${item}"`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      // Handle nested object (like surface)
      lines.push(`${indentStr}${key}:`);
      const nestedYaml = serializeFrontmatter(value as Record<string, unknown>, indent + 1);
      lines.push(nestedYaml);
    } else {
      lines.push(`${indentStr}${key}: "${value}"`);
    }
  }

  return lines.join("\n");
}

// ============= Export =============

/**
 * Export a card as Inline Tez markdown format with Coordination Profile metadata.
 */
export async function exportCardAsInlineTez(cardId: string): Promise<string> {
  // Load card
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  });

  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }

  // Load related data in parallel
  const [contextItems, cardResponses, sender, recipients] = await Promise.all([
    db.select().from(cardContext).where(eq(cardContext.cardId, cardId)).orderBy(desc(cardContext.capturedAt)),
    db.select().from(responses).where(eq(responses.cardId, cardId)).orderBy(desc(responses.createdAt)),
    db.query.users.findFirst({ where: eq(users.id, card.fromUserId) }),
    db.select().from(cardRecipients).where(eq(cardRecipients.cardId, cardId)),
  ]);

  // Build Coordination Surface object
  // Simplified: no tag/priority in schema, default to "task" item type
  const itemType = "task" as const;
  const coordinationSurface: CoordinationSurface = {
    item_type: itemType,
    title: card.summary || card.content.slice(0, 80),
    status: mapStatusToCoordination(card.status, itemType),
    due_date: timestampToISODate(card.dueDate),
  };

  // Add assignee (first recipient)
  if (recipients.length > 0) {
    const firstRecipient = await db.query.users.findFirst({
      where: eq(users.id, recipients[0].userId),
    });
    if (firstRecipient) {
      coordinationSurface.assignee = {
        id: firstRecipient.id,
        name: firstRecipient.name,
      };
    }
  }

  // Build context_trail from card_context
  if (contextItems.length > 0) {
    coordinationSurface.context_trail = contextItems.map((ctx) => ({
      source_type: ctx.originalType,
      source_id: ctx.id,
      excerpt: ctx.originalRawText.slice(0, 200) + (ctx.originalRawText.length > 200 ? "..." : ""),
    }));
  }

  // Validate the coordination surface
  validateCoordinationSurface(coordinationSurface);

  // Build YAML frontmatter
  const frontmatterData: Record<string, unknown> = {
    tezit: "1.2",
    tip: "1.0.3",
    title: card.summary || card.content.slice(0, 80),
    author: sender?.name || "Unknown",
    created: card.createdAt ? card.createdAt.toISOString() : new Date().toISOString(),
    type: "coordination", // Mark as coordination tezit
    profile: "coordination-surface", // Specify the profile
    surface: coordinationSurface, // Add the full coordination surface
  };

  // Keep context array for backward compatibility
  if (contextItems.length > 0) {
    frontmatterData.context = contextItems.map((ctx) => ({
      id: ctx.id,
      type: ctx.originalType,
      description: `${ctx.originalType} content from ${ctx.userName}`,
    }));
  }

  const frontmatter = serializeFrontmatter(frontmatterData);

  // Build markdown body
  const bodyParts: string[] = [];

  bodyParts.push(`# ${card.summary || card.content.slice(0, 80)}`);
  bodyParts.push("");
  bodyParts.push(card.content);

  if (contextItems.length > 0) {
    bodyParts.push("");
    bodyParts.push("## Context");
    bodyParts.push("");

    for (const ctx of contextItems) {
      bodyParts.push(`### ${ctx.originalType} from ${ctx.userName} [[${ctx.id}]]`);
      bodyParts.push("");
      bodyParts.push(ctx.originalRawText);
      bodyParts.push("");
    }
  }

  if (cardResponses.length > 0) {
    bodyParts.push("## Responses");
    bodyParts.push("");

    for (const resp of cardResponses) {
      bodyParts.push(`- ${resp.content}`);
    }
    bodyParts.push("");
  }

  return `---\n${frontmatter}\n---\n\n${bodyParts.join("\n")}`;
}

// ============= Import =============

/**
 * Import Inline Tez markdown and create a card.
 * Handles both legacy format and Coordination Profile format.
 */
export async function importInlineTez(
  markdown: string,
  userId: string,
): Promise<{ cardId: string }> {
  const parsed = parseFrontmatter(markdown);

  if (!parsed) {
    throw new Error("Invalid Inline Tez format: missing or malformed YAML frontmatter");
  }

  const { frontmatter, body } = parsed;

  // Validate frontmatter against Inline Tez schema
  // This checks required fields, data types, URL formats, etc.
  try {
    validateFrontmatter(frontmatter);
  } catch (error) {
    // Re-throw with more context about where validation failed
    throw new Error(
      `Inline Tez import failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check if this is a Coordination Profile tezit
  const surface = frontmatter.surface as CoordinationSurface | undefined;
  const isCoordinationProfile = surface !== undefined;

  // Extract card metadata (prefer surface fields if available)
  let title: string;
  let status: string;
  let dueDate: Date | undefined;
  let assigneeUserId: string | undefined;

  if (isCoordinationProfile && surface) {
    // Use Coordination Profile fields
    title = surface.title;
    status = mapCoordinationToStatus(surface.status);
    dueDate = isoDateToTimestamp(surface.due_date);
    assigneeUserId = surface.assignee?.id;
  } else {
    // Use legacy top-level fields
    title = (frontmatter.title as string) || "Imported Tez";
    status = (frontmatter.status as string) || "pending";
  }

  // Clean the body - extract main content (first section before ## headers)
  const mainContent = body.split(/\n##\s/)[0].replace(/^#\s.*\n/, "").trim() || title;

  // Create the card
  const cardId = randomUUID();
  const now = new Date();

  await db.insert(cards).values({
    id: cardId,
    content: mainContent,
    summary: title.slice(0, 100),
    fromUserId: userId,
    sourceType: "self",
    status,
    dueDate,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });

  // Add creator as recipient
  await db.insert(cardRecipients).values({
    cardId,
    userId,
  });

  // If there's an assignee (and it's not the creator), add them as a recipient
  if (assigneeUserId && assigneeUserId !== userId) {
    try {
      await db.insert(cardRecipients).values({
        cardId,
        userId: assigneeUserId,
      });
    } catch (error) {
      // Ignore if user doesn't exist or duplicate recipient
      logger.warn(`Could not add assignee ${assigneeUserId} as recipient`, { message: String(error) });
    }
  }

  // Extract and create context items from frontmatter
  const contextDefs = frontmatter.context as Array<{ id?: string; type?: string; description?: string }> | undefined;

  if (contextDefs && Array.isArray(contextDefs)) {
    // Try to extract context content from the body
    const contextSections = extractContextSections(body);

    // Look up the user name once (not per context item)
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    for (const ctxDef of contextDefs) {
      const ctxType = ctxDef.type || "text";
      const originalId = ctxDef.id || randomUUID();

      // Check for ID collision - if the context ID already exists, generate a new one
      let ctxId = originalId;
      if (ctxDef.id) {
        const existing = await db.query.cardContext.findFirst({
          where: eq(cardContext.id, ctxDef.id),
        });
        if (existing) {
          ctxId = randomUUID();
        }
      }

      // Find matching content from the body using the original ID (as referenced in markdown)
      const sectionContent = contextSections.get(originalId) || ctxDef.description || "Imported context";

      await db.insert(cardContext).values({
        id: ctxId,
        cardId,
        userId,
        userName: user?.name || "Unknown",
        originalType: ctxType,
        originalRawText: sectionContent,
        capturedAt: now,
      });
    }
  }

  return { cardId };
}

/**
 * Extract context sections from the markdown body.
 * Looks for [[context-id]] references in section headers.
 */
function extractContextSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const regex = /###?\s+.*?\[\[([^\]]+)\]\]\s*\n([\s\S]*?)(?=\n###?\s|\n##\s|$)/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const id = match[1].trim();
    const content = match[2].trim();
    sections.set(id, content);
  }

  return sections;
}

export const tezInlineTezService = {
  exportCardAsInlineTez,
  importInlineTez,
};
