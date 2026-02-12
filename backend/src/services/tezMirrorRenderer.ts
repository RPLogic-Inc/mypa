import { APP_NAME, APP_SLUG } from "../config/app.js";
import { buildTezUri } from "./tezUri.js";

export type MirrorTemplate = "teaser" | "surface" | "surface_facts";

export interface MirrorInput {
  cardId: string;
  content: string;
  summary?: string | null;
  senderName: string;
  createdAt: Date;
  contextHighlights?: string[]; // from card_context.displayBullets
  appendDeepLink: boolean;
}

export interface MirrorOutput {
  rendered: string;
  template: MirrorTemplate;
  deepLink: string | null;
  charCount: number;
}

function buildDeepLink(cardId: string): string {
  return buildTezUri({ platform: APP_SLUG, cardId });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "\u2026";
}

const FOOTER = `[Shared via ${APP_NAME} \u2014 this is a simplified mirror]`;

/**
 * Teaser (~50 chars): Push notifications, SMS preview.
 */
function renderTeaser(input: MirrorInput): MirrorOutput {
  const deepLink = input.appendDeepLink ? buildDeepLink(input.cardId) : null;
  const body = `${input.senderName}: ${truncate(input.summary || input.content, 40)}`;
  const rendered = deepLink ? `${body}\n${deepLink}` : body;
  return { rendered, template: "teaser", deepLink, charCount: rendered.length };
}

/**
 * Surface (~200 chars): Email, group chat sharing.
 */
function renderSurface(input: MirrorInput): MirrorOutput {
  const deepLink = input.appendDeepLink ? buildDeepLink(input.cardId) : null;
  const dateStr = formatDate(input.createdAt);
  const text = input.summary || truncate(input.content, 150);
  let rendered = `From ${input.senderName} (${dateStr}):\n${text}`;
  if (deepLink) rendered += `\n\n\ud83d\udcce Full context: ${deepLink}`;
  rendered += `\n\n${FOOTER}`;
  return { rendered, template: "surface", deepLink, charCount: rendered.length };
}

/**
 * Surface + Facts (~500 chars): Sharing with someone who needs background.
 */
function renderSurfaceFacts(input: MirrorInput): MirrorOutput {
  const deepLink = input.appendDeepLink ? buildDeepLink(input.cardId) : null;
  const dateStr = formatDate(input.createdAt);
  const text = input.summary || truncate(input.content, 200);
  let rendered = `From ${input.senderName} (${dateStr}):\n${text}`;

  if (input.contextHighlights && input.contextHighlights.length > 0) {
    const highlights = input.contextHighlights.slice(0, 5).map(h => `\u2022 ${h}`).join("\n");
    rendered += `\n\nContext highlights:\n${highlights}`;
  }

  if (deepLink) rendered += `\n\n\ud83d\udcce Full context: ${deepLink}`;
  rendered += `\n\n${FOOTER}`;
  return { rendered, template: "surface_facts", deepLink, charCount: rendered.length };
}

export function renderMirror(template: MirrorTemplate, input: MirrorInput): MirrorOutput {
  switch (template) {
    case "teaser": return renderTeaser(input);
    case "surface": return renderSurface(input);
    case "surface_facts": return renderSurfaceFacts(input);
    default: throw new Error(`Unknown mirror template: ${template}`);
  }
}
