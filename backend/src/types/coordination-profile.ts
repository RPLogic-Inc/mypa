/**
 * TypeScript types for Tezit Coordination Profile (v1.2)
 *
 * Based on: coordination-surface.schema.json
 * Spec: https://tezit.com/spec/v1.2/coordination-surface.schema.json
 */

// ============= Coordination Surface Types =============

/**
 * The type of coordination item.
 */
export type CoordinationItemType = "task" | "decision" | "question" | "blocker";

/**
 * Current status of the coordination item.
 *
 * Note: Per v1.1-draft constraint, decisions and questions cannot have "in_progress" status.
 */
export type CoordinationStatus =
  | "pending"
  | "acknowledged"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

/**
 * Priority level of the coordination item.
 */
export type CoordinationPriority = "critical" | "high" | "medium" | "low";

/**
 * Nature of the dependency relationship.
 */
export type DependencyType = "blocks" | "requires" | "related";

/**
 * Person or entity assigned to this coordination item.
 */
export interface CoordinationAssignee {
  /** Unique identifier for the assignee */
  id: string;
  /** Human-readable name of the assignee */
  name: string;
}

/**
 * Dependency on another coordination item.
 */
export interface CoordinationDependency {
  /** Identifier of the dependency item */
  item_id: string;
  /** Nature of the dependency relationship */
  type: DependencyType;
}

/**
 * Context reference that informed or led to this coordination item.
 */
export interface CoordinationContextTrail {
  /** Type of the source that provided context */
  source_type: string;
  /** Identifier of the source */
  source_id: string;
  /** Relevant excerpt from the source */
  excerpt?: string;
}

/**
 * The surface object of a coordination profile tez.
 *
 * Represents a single coordination item (task, decision, question, or blocker)
 * with status tracking, assignments, dependencies, and context trail.
 */
export interface CoordinationSurface {
  /** The type of coordination item */
  item_type: CoordinationItemType;
  /** Human-readable title of the coordination item */
  title: string;
  /** Current status of the coordination item */
  status: CoordinationStatus;
  /** Person or entity assigned to this coordination item */
  assignee?: CoordinationAssignee;
  /** Target completion date (ISO 8601 date format: YYYY-MM-DD) */
  due_date?: string;
  /** Priority level of the coordination item */
  priority?: CoordinationPriority;
  /** Other coordination items this item depends on or relates to */
  dependencies?: CoordinationDependency[];
  /** Trail of context references that informed or led to this coordination item */
  context_trail?: CoordinationContextTrail[];
}

// ============= Helper Types =============

/**
 * Complete coordination profile metadata for a tezit.
 *
 * This is included in the YAML frontmatter of an Inline Tez export.
 */
export interface CoordinationProfileMetadata {
  surface: CoordinationSurface;
}

/**
 * Extended frontmatter for coordination tezits.
 *
 * Combines standard tezit metadata with coordination profile.
 */
export interface CoordinationTezitFrontmatter {
  /** Tezit protocol version */
  tezit: string;
  /** Human-readable title */
  title: string;
  /** Author name */
  author: string;
  /** Creation timestamp (ISO 8601) */
  created: string;
  /** Tezit type - should be "coordination" for coordination tezits */
  type: string;
  /** Profile type - should be "coordination-surface" */
  profile: string;
  /** Coordination surface metadata */
  surface: CoordinationSurface;
  /** Optional context references */
  context?: Array<{
    id: string;
    type: string;
    description?: string;
  }>;
}

// ============= Mapping Utilities =============

/**
 * Maps MyPA card tag to Coordination Profile item_type.
 */
export function mapTagToItemType(tag: string): CoordinationItemType {
  switch (tag) {
    case "task":
      return "task";
    case "question":
      return "question";
    case "decision":
      return "decision";
    case "blocker":
      return "blocker";
    case "update":
      return "task"; // Closest match
    case "recognition":
      return "task"; // No direct equivalent
    default:
      return "task"; // Safe default
  }
}

/**
 * Maps MyPA card status to Coordination Profile status.
 *
 * Handles the constraint that decisions and questions cannot be "in_progress".
 */
export function mapStatusToCoordination(
  status: string,
  itemType: CoordinationItemType,
): CoordinationStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "acknowledged":
      return "acknowledged";
    case "responded":
      // Decisions and questions cannot be "in_progress"
      if (itemType === "decision" || itemType === "question") {
        return "acknowledged";
      }
      return "in_progress";
    case "in_progress":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "completed":
      return "completed";
    case "snoozed":
      return "pending"; // Snoozed items are still pending
    case "cancelled":
      return "cancelled";
    case "archived":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Maps MyPA priority to Coordination Profile priority.
 */
export function mapPriorityToCoordination(priority: string): CoordinationPriority {
  switch (priority) {
    case "urgent":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Maps Coordination Profile item_type back to MyPA card tag.
 */
export function mapItemTypeToTag(itemType: CoordinationItemType): string {
  // Direct mapping (these are already aligned)
  return itemType;
}

/**
 * Maps Coordination Profile status back to MyPA card status.
 */
export function mapCoordinationToStatus(status: CoordinationStatus): string {
  switch (status) {
    case "pending":
      return "pending";
    case "acknowledged":
      return "acknowledged";
    case "in_progress":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Maps Coordination Profile priority back to MyPA priority.
 */
export function mapCoordinationToPriority(priority: CoordinationPriority): string {
  switch (priority) {
    case "critical":
      return "urgent";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Validates that a coordination surface object meets schema constraints.
 *
 * @throws Error if validation fails
 */
export function validateCoordinationSurface(surface: CoordinationSurface): void {
  // Validate required fields
  if (!surface.item_type) {
    throw new Error("item_type is required");
  }
  if (!surface.title || surface.title.trim().length === 0) {
    throw new Error("title is required and cannot be empty");
  }
  if (!surface.status) {
    throw new Error("status is required");
  }

  // Validate constraint: decisions and questions cannot have "in_progress" status
  if (
    (surface.item_type === "decision" || surface.item_type === "question") &&
    surface.status === "in_progress"
  ) {
    throw new Error(`${surface.item_type} items cannot have "in_progress" status`);
  }

  // Validate due_date format if present (YYYY-MM-DD)
  if (surface.due_date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(surface.due_date)) {
      throw new Error("due_date must be in YYYY-MM-DD format");
    }
  }

  // Validate assignee if present
  if (surface.assignee) {
    if (!surface.assignee.id || !surface.assignee.name) {
      throw new Error("assignee must have both id and name");
    }
  }

  // Validate dependencies if present
  if (surface.dependencies) {
    for (const dep of surface.dependencies) {
      if (!dep.item_id || !dep.type) {
        throw new Error("each dependency must have item_id and type");
      }
      if (!["blocks", "requires", "related"].includes(dep.type)) {
        throw new Error(`invalid dependency type: ${dep.type}`);
      }
    }
  }

  // Validate context_trail if present
  if (surface.context_trail) {
    for (const ctx of surface.context_trail) {
      if (!ctx.source_type || !ctx.source_id) {
        throw new Error("each context_trail entry must have source_type and source_id");
      }
    }
  }
}

/**
 * Converts a timestamp to ISO date string (YYYY-MM-DD).
 */
export function timestampToISODate(timestamp: Date | number | null | undefined): string | undefined {
  if (!timestamp) return undefined;

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toISOString().split("T")[0];
}

/**
 * Converts ISO date string (YYYY-MM-DD) to Date object.
 */
export function isoDateToTimestamp(isoDate: string | undefined): Date | undefined {
  if (!isoDate) return undefined;

  const parsed = new Date(isoDate);
  if (isNaN(parsed.getTime())) return undefined;

  return parsed;
}
