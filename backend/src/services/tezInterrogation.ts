/**
 * Tez Interrogation Protocol (TIP) Service
 *
 * Implements the core interrogation engine for Tezit Protocol v1.2.
 * Questions are answered ONLY from transmitted context materials.
 * Every factual claim must be cited with [[context-item-id:location]] references.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { cardContext, tezInterrogations, tezCitations, users } from "../db/schema.js";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";
import {
  checkPromptSecurity,
  wrapUserContent,
  buildHardenedSystemPrompt,
  logSecurityEvent,
  type ThreatLevel,
} from "./promptSecurity.js";

// Lazy getters: env vars must be read at call time, not import time,
// because dotenv config() runs after ES module imports are evaluated.
function getOpenClawUrl(): string { return process.env.OPENCLAW_URL || "http://localhost:18789"; }
function getOpenClawToken(): string { return process.env.OPENCLAW_TOKEN || ""; }
function getOpenAIKey(): string { return process.env.OPENAI_API_KEY || ""; }

// ============= Types =============

export interface InterrogationRequest {
  cardId: string;
  question: string;
  userId: string;
  sessionId?: string;
  /** Share token ID when interrogation is from a guest (for audit trail). */
  guestTokenId?: string;
  /** Filter which context items are available for interrogation. */
  contextFilter?: {
    scope: "surface" | "full" | "selected";
    contextItemIds?: string[];
  };
}

// ============= PII Redaction =============

/**
 * Redact personally identifiable information from text before sending to external AI APIs.
 * Defense-in-depth: reduces impact of prompt injection + data leakage.
 */
function redactPII(text: string): string {
  let redacted = text;

  // Redact email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');

  // Redact phone numbers (various formats)
  redacted = redacted.replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');

  // Redact SSN-like patterns
  redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

  // Redact credit card-like patterns (basic check)
  redacted = redacted.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');

  return redacted;
}

/**
 * Pseudonymize user names to prevent identity leakage.
 * Maps real names to User_A, User_B, etc. within a single interrogation session.
 */
function pseudonymizeUserName(userName: string, nameMap: Map<string, string>): string {
  if (!nameMap.has(userName)) {
    const nextId = String.fromCharCode(65 + nameMap.size); // A, B, C, ...
    nameMap.set(userName, `User_${nextId}`);
  }
  return nameMap.get(userName)!;
}

export interface InterrogationResponse {
  question: string;
  answer: string;
  classification: "grounded" | "inferred" | "partial" | "abstention";
  confidence: "high" | "medium" | "low";
  citations: Citation[];
  sessionId: string;
  contextScope: string;
  responseTimeMs: number;
  modelUsed: string;
  tipLite?: boolean; // TIP Lite optimization was used (context < 32K tokens)
}

export interface Citation {
  contextItemId: string;
  location?: string;
  excerpt: string;
  claim: string;
  confidence: "high" | "medium" | "low";
  verificationStatus: "verified" | "unverified" | "failed";
  excerptVerified?: boolean;
}

interface ParsedCitation {
  contextItemId: string;
  location?: string;
}

interface ContextItem {
  id: string;
  cardId: string;
  originalType: string;
  originalRawText: string;
  userName: string;
  capturedAt: Date | null;
}

// ============= Token Counting & TIP Lite Detection =============

/**
 * Estimate token count for text using a simple heuristic.
 * Approximation: ~4 characters per token (conservative estimate for English text).
 * More accurate than character count, faster than full tokenization.
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total token count for all context items.
 */
function calculateContextTokenCount(contextItems: ContextItem[]): number {
  return contextItems.reduce((sum, item) => sum + estimateTokenCount(item.originalRawText), 0);
}

/**
 * TIP Lite Threshold per Section 1.5.2 of the Tez Interrogation Protocol:
 * - MINIMUM threshold: 32,768 tokens
 * - RECOMMENDED: 25% of model context window
 *
 * For OpenClaw (typically GPT-4 with 128K window), we use the minimum threshold.
 * Future: Could be made configurable based on the model being used.
 */
const TIP_LITE_THRESHOLD_TOKENS = 32768;

/**
 * Determine if TIP Lite optimization should be used.
 * TIP Lite bypasses RAG and loads all context inline when total context < threshold.
 */
function shouldUseTipLite(tokenCount: number): boolean {
  return tokenCount < TIP_LITE_THRESHOLD_TOKENS;
}

// ============= Fetch with Timeout =============

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ============= Direct AI API Call =============

/**
 * Call AI directly via OpenAI-compatible API.
 * Used when OpenClaw gateway HTTP endpoint is unavailable (e.g. WS-only mode).
 * Falls back through: OpenClaw HTTP → OpenAI direct → keyword fallback.
 */
async function callAIDirect(
  messages: Array<{ role: string; content: string }>,
): Promise<{ content: string } | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    }, 30000);

    if (!response.ok) {
      logger.error(`OpenAI direct call failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return { content: data.choices[0].message.content };
  } catch (error) {
    logger.error("OpenAI direct call error", error as Error);
    return null;
  }
}

// ============= TIP System Prompt =============

export function buildTIPSystemPrompt(contextItems: ContextItem[]): string {
  // Create pseudonym mapping for privacy
  const nameMap = new Map<string, string>();

  const contextBlock = contextItems.map((item, idx) => {
    const capturedDate = item.capturedAt ? new Date(item.capturedAt).toISOString() : "unknown";
    const pseudonym = pseudonymizeUserName(item.userName, nameMap);
    const sanitizedContent = redactPII(item.originalRawText);

    return `--- Context Item [${item.id}] ---
Type: ${item.originalType}
Author: ${pseudonym}
Captured: ${capturedDate}
Content:
${sanitizedContent}
--- End [${item.id}] ---`;
  }).join("\n\n");

  // Wrap context with delimiter isolation (defense against context poisoning)
  const isolatedContext = wrapUserContent(contextBlock, 'context');

  const basePrompt = `You are the Tezit Interrogation Protocol (TIP) engine. You must follow these 10 normative rules EXACTLY:

1. Answer ONLY from the provided context materials below. Do not use general training knowledge for factual claims.
2. Never use your general training knowledge to answer factual questions about the context.
3. Include citations in format [[context-item-id:location]] for every factual claim. The location can be a line reference, section, or "general" if the whole item is relevant.
4. If the context does not contain the answer, respond with an abstention: state clearly that the provided context does not address this question.
5. Clearly distinguish between what the context explicitly states (grounded) and what can be inferred from it (inferred).
6. If the answer requires inference, mark the response as "inferred" and explain the reasoning chain.
7. Each citation must reference a real context item ID provided in this prompt.
8. Use exact quotes when possible, paraphrases when necessary.
9. Provide a confidence level for the overall answer: high (directly stated), medium (strongly implied), or low (loosely related).
10. Maintain session context for follow-up questions within the same session.

IMPORTANT: Structure your response as JSON with this exact format:
{
  "answer": "Your answer text with [[item-id:location]] citations inline",
  "classification": "grounded|inferred|partial|abstention",
  "confidence": "high|medium|low",
  "citations": [
    {
      "contextItemId": "the-context-item-id",
      "location": "line or section reference",
      "excerpt": "exact quote from the context",
      "claim": "the claim this citation supports"
    }
  ]
}

${isolatedContext}`;

  // Apply hardened prompt structure with instruction hierarchy
  return buildHardenedSystemPrompt(basePrompt);
}

// ============= Citation Parsing =============

export function parseCitations(responseText: string): ParsedCitation[] {
  const citations: ParsedCitation[] = [];
  const regex = /\[\[([^\]]+?)(?::([^\]]*))?\]\]/g;
  let match;

  while ((match = regex.exec(responseText)) !== null) {
    citations.push({
      contextItemId: match[1].trim(),
      location: match[2]?.trim() || undefined,
    });
  }

  return citations;
}

// ============= Citation Verification =============

/**
 * Verify citations according to TIP Section 5.5:
 * 1. The item-id MUST correspond to an actual context item
 * 2. The location specifier MUST reference a location that exists
 * 3. The content at the cited location MUST support the claim
 *
 * This function performs automated verification of all three requirements.
 * For requirement (3), we use fuzzy string matching at 80% similarity threshold.
 */
export function verifyCitations(
  parsedCitations: ParsedCitation[],
  contextItems: ContextItem[],
  answerText: string,
): Citation[] {
  const contextMap = new Map<string, ContextItem>();
  for (const item of contextItems) {
    contextMap.set(item.id, item);
  }

  return parsedCitations.map((parsed) => {
    const contextItem = contextMap.get(parsed.contextItemId);

    // Requirement 1: Verify item-id exists
    if (!contextItem) {
      return {
        contextItemId: parsed.contextItemId,
        location: parsed.location,
        excerpt: "",
        claim: "Referenced context item not found",
        confidence: "low" as const,
        verificationStatus: "failed" as const,
        excerptVerified: false,
      };
    }

    // Requirement 2 & 3: Extract content at specified location and verify excerpt
    const locationData = extractContentAtLocation(
      contextItem.originalRawText,
      parsed.location || "general"
    );

    if (!locationData.exists) {
      // Location specifier is invalid (e.g., :p99 when doc only has 10 pages)
      return {
        contextItemId: parsed.contextItemId,
        location: parsed.location,
        excerpt: "",
        claim: `Location ${parsed.location} does not exist in context item`,
        confidence: "low" as const,
        verificationStatus: "failed" as const,
        excerptVerified: false,
      };
    }

    // Try to find the AI's claimed excerpt in the answer text
    const claimedExcerpt = extractClaimedExcerpt(answerText, parsed);

    // Verify the claimed excerpt appears in the actual location content
    const excerptVerified = claimedExcerpt
      ? verifyExcerptMatch(claimedExcerpt, locationData.content)
      : false;

    // Degrade confidence if excerpt verification fails
    let confidence: "high" | "medium" | "low" = "medium";
    let verificationStatus: "verified" | "unverified" | "failed" = "verified";

    if (claimedExcerpt && !excerptVerified) {
      // AI cited this location but the excerpt doesn't match
      confidence = "low";
      verificationStatus = "unverified";
    } else if (!claimedExcerpt) {
      // No explicit excerpt to verify (just a citation marker)
      confidence = "medium";
      verificationStatus = "unverified";
    } else {
      // Excerpt verified successfully
      confidence = "high";
      verificationStatus = "verified";
    }

    return {
      contextItemId: parsed.contextItemId,
      location: parsed.location,
      excerpt: locationData.content.slice(0, 300),
      claim: `Claim references ${contextItem.originalType} content from ${contextItem.userName}`,
      confidence,
      verificationStatus,
      excerptVerified,
    };
  });
}

/**
 * Extract content from a context item at a specific location.
 *
 * Supported location formats (TIP Section 5.3.2):
 * - "general" - entire document
 * - "p12" or ":p12" - page 12
 * - "L42" or ":L42" - line 42
 * - "L42-67" or ":L42-67" - lines 42-67
 * - "sec-intro" or ":sec-intro" - section named "intro"
 * - "2:15" or ":2:15" - timestamp 2 minutes 15 seconds (for audio/video)
 *
 * @returns Object with exists=true and content if location is valid, exists=false otherwise
 */
function extractContentAtLocation(
  fullText: string,
  location: string
): { exists: boolean; content: string } {
  const loc = location.startsWith(":") ? location.slice(1) : location;

  // Handle "general" - return entire text
  if (loc === "general" || loc === "") {
    return { exists: true, content: fullText };
  }

  const lines = fullText.split("\n");

  // Handle line references: L42 or L42-67
  const lineMatch = loc.match(/^L(\d+)(?:-(\d+))?$/i);
  if (lineMatch) {
    const startLine = parseInt(lineMatch[1], 10);
    const endLine = lineMatch[2] ? parseInt(lineMatch[2], 10) : startLine;

    if (startLine < 1 || startLine > lines.length || endLine > lines.length) {
      return { exists: false, content: "" };
    }

    const extractedLines = lines.slice(startLine - 1, endLine);
    return { exists: true, content: extractedLines.join("\n") };
  }

  // Handle page references: p12 (approximate - 50 lines per page)
  const pageMatch = loc.match(/^p(\d+)$/i);
  if (pageMatch) {
    const pageNum = parseInt(pageMatch[1], 10);
    const linesPerPage = 50;
    const startLine = (pageNum - 1) * linesPerPage;
    const endLine = pageNum * linesPerPage;

    if (startLine >= lines.length) {
      return { exists: false, content: "" };
    }

    const extractedLines = lines.slice(startLine, Math.min(endLine, lines.length));
    return { exists: true, content: extractedLines.join("\n") };
  }

  // Handle section references: sec-intro (simple search for section header)
  const sectionMatch = loc.match(/^sec-(.+)$/i);
  if (sectionMatch) {
    const sectionName = sectionMatch[1].toLowerCase();
    const sectionIndex = lines.findIndex((line) =>
      line.toLowerCase().includes(sectionName)
    );

    if (sectionIndex === -1) {
      return { exists: false, content: "" };
    }

    // Extract from section header to next section or end (max 20 lines)
    const extractedLines = lines.slice(sectionIndex, sectionIndex + 20);
    return { exists: true, content: extractedLines.join("\n") };
  }

  // Handle timestamp references: 2:15 (for audio context - just search nearby text)
  const timestampMatch = loc.match(/^(\d+):(\d+)$/);
  if (timestampMatch) {
    // For text transcripts, we can't precisely locate timestamps
    // Return first 500 chars as approximation
    return { exists: true, content: fullText.slice(0, 500) };
  }

  // Unrecognized location format - treat as general reference
  return { exists: true, content: fullText };
}

/**
 * Extract the excerpt that the AI claimed to cite from the answer text.
 *
 * This looks for quoted text near the citation marker [[item-id:location]]
 * or paraphrased content between the citation and surrounding sentence boundaries.
 *
 * @returns The excerpt string if found, or null if no clear excerpt
 */
function extractClaimedExcerpt(
  answerText: string,
  citation: ParsedCitation
): string | null {
  const citationMarker = citation.location
    ? `[[${citation.contextItemId}:${citation.location}]]`
    : `[[${citation.contextItemId}]]`;

  const citationIndex = answerText.indexOf(citationMarker);
  if (citationIndex === -1) {
    return null;
  }

  // Look backwards for quoted text before the citation
  const textBeforeCitation = answerText.slice(0, citationIndex);

  // Pattern 1: "quoted text" [[citation]]
  const quoteMatch = textBeforeCitation.match(/"([^"]{10,200})"[^"]{0,20}$/);
  if (quoteMatch) {
    return quoteMatch[1].trim();
  }

  // Pattern 2: Sentence ending with citation
  // Extract text after the last sentence boundary OR last citation marker
  // This handles multiple citations correctly
  const lastPeriod = textBeforeCitation.lastIndexOf('.');
  const lastExclaim = textBeforeCitation.lastIndexOf('!');
  const lastQuestion = textBeforeCitation.lastIndexOf('?');
  const lastCitation = textBeforeCitation.lastIndexOf(']]');

  const lastSentenceBoundary = Math.max(lastPeriod, lastExclaim, lastQuestion, lastCitation);

  let relevantText = lastSentenceBoundary >= 0
    ? textBeforeCitation.slice(lastSentenceBoundary + 1).trim()
    : textBeforeCitation.trim();

  // If we sliced after ]], we need to skip the ] characters
  if (lastSentenceBoundary === lastCitation) {
    relevantText = relevantText.replace(/^[\]\s]+/, '');
  }

  // Only use if it's a substantial claim (at least 3 words) and not too long
  const words = relevantText.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 3 && words.length < 50) {
    return relevantText;
  }

  // Pattern 3: Start of answer or short text before citation (no other delimiters)
  if (citationIndex < 500 && textBeforeCitation.trim().length > 10 && !textBeforeCitation.includes('[[')) {
    return textBeforeCitation.trim();
  }

  return null;
}

/**
 * Verify that a claimed excerpt appears in the actual location content.
 *
 * Uses fuzzy string matching with 80% similarity threshold as specified in TIP.
 * This allows for minor paraphrasing while catching fabricated citations.
 *
 * Algorithm: Word-based overlap ratio with stemming-like matching
 * - Exact word matches (full credit)
 * - Prefix matches for word variations (e.g., "improve" matches "improvement", "improved")
 *
 * @param claimedExcerpt - What the AI said it was citing
 * @param locationContent - Actual content at the cited location
 * @returns true if excerpt similarity >= 80%, false otherwise
 */
function verifyExcerptMatch(claimedExcerpt: string, locationContent: string): boolean {
  const claimed = claimedExcerpt.toLowerCase().trim();
  const location = locationContent.toLowerCase().trim();

  // Exact substring match - instant pass
  if (location.includes(claimed) || claimed.includes(location)) {
    return true;
  }

  // Extract significant words (length > 3), stripping punctuation
  const claimedWords = claimed.split(/\s+/)
    .map((w) => w.replace(/[.,!?;:"'()[\]{}]/g, ''))
    .filter((w) => w.length > 3);
  const locationWords = location.split(/\s+/)
    .map((w) => w.replace(/[.,!?;:"'()[\]{}]/g, ''))
    .filter((w) => w.length > 3);

  if (claimedWords.length === 0) {
    return false;
  }

  // Count matches using fuzzy word matching (allows for word variations)
  let matchingWords = 0;
  for (const claimedWord of claimedWords) {
    // Check for exact match or prefix match (min 5 chars for prefix)
    const hasMatch = locationWords.some((locWord) => {
      if (locWord === claimedWord) return true; // exact match
      if (claimedWord.length >= 5 && locWord.startsWith(claimedWord.slice(0, 5))) return true; // prefix match
      if (locWord.length >= 5 && claimedWord.startsWith(locWord.slice(0, 5))) return true; // reverse prefix
      return false;
    });
    if (hasMatch) matchingWords++;
  }

  const wordMatchRatio = matchingWords / claimedWords.length;

  // 80% of significant words must appear in location content (with fuzzy matching)
  return wordMatchRatio >= 0.8;
}

/**
 * Extract the most relevant excerpt from context text based on the answer.
 * Simple keyword overlap approach for the fallback engine.
 */
function extractRelevantExcerpt(contextText: string, answerText: string): string {
  // Split context into sentences
  const sentences = contextText.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);

  if (sentences.length === 0) {
    return contextText.slice(0, 200);
  }

  // Score each sentence by keyword overlap with the answer
  const answerWords = new Set(
    answerText.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  );

  let bestScore = 0;
  let bestSentence = sentences[0];

  for (const sentence of sentences) {
    const sentenceWords = sentence.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const overlap = sentenceWords.filter((w) => answerWords.has(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestSentence = sentence;
    }
  }

  return bestSentence.trim().slice(0, 300);
}

// ============= Fallback Interrogation (No AI) =============

function fallbackInterrogate(
  question: string,
  contextItems: ContextItem[],
): { answer: string; classification: "grounded" | "inferred" | "partial" | "abstention"; confidence: "high" | "medium" | "low"; citations: Citation[] } {
  const questionLower = question.toLowerCase();
  const questionWords = questionLower.split(/\W+/).filter((w) => w.length > 3);

  if (contextItems.length === 0) {
    return {
      answer: "No context materials are available for this card. Unable to answer the question.",
      classification: "abstention",
      confidence: "high",
      citations: [],
    };
  }

  // Score each context item by keyword relevance
  const scoredItems = contextItems.map((item) => {
    const textLower = item.originalRawText.toLowerCase();
    const matchCount = questionWords.filter((w) => textLower.includes(w)).length;
    return { item, score: matchCount };
  }).sort((a, b) => b.score - a.score);

  const topItems = scoredItems.filter((s) => s.score > 0);

  if (topItems.length === 0) {
    return {
      answer: "The provided context materials do not contain information relevant to this question. The context covers: " +
        contextItems.map((item) => `${item.originalType} content from ${item.userName}`).join(", ") + ".",
      classification: "abstention",
      confidence: "high",
      citations: [],
    };
  }

  // Build answer from matching context
  const answerParts: string[] = [];
  const citations: Citation[] = [];

  for (const { item, score } of topItems.slice(0, 3)) {
    const excerpt = extractRelevantExcerpt(item.originalRawText, question);
    answerParts.push(
      `Based on ${item.originalType} content from ${item.userName}: "${excerpt}" [[${item.id}:general]]`
    );
    citations.push({
      contextItemId: item.id,
      location: "general",
      excerpt,
      claim: `Relevant ${item.originalType} content from ${item.userName}`,
      confidence: score >= 3 ? "high" : score >= 2 ? "medium" : "low",
      verificationStatus: "verified",
    });
  }

  const classification = topItems[0].score >= 3 ? "grounded" : "inferred";
  const confidence = topItems[0].score >= 3 ? "high" : topItems[0].score >= 2 ? "medium" : "low";

  return {
    answer: answerParts.join("\n\n"),
    classification,
    confidence,
    citations,
  };
}

// ============= Main Interrogation Function =============

export async function interrogate(request: InterrogationRequest): Promise<InterrogationResponse> {
  const startTime = Date.now();
  const sessionId = request.sessionId || `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 1. Security check: Detect prompt injection in user question
  const securityCheck = await checkPromptSecurity(request.question, request.userId, { strict: true });

  if (!securityCheck.isSafe) {
    logSecurityEvent({
      eventType: 'injection_blocked',
      userId: request.userId,
      threatLevel: securityCheck.threatLevel,
      matchedPatterns: securityCheck.matchedPatterns,
      inputLength: request.question.length,
      timestamp: new Date(),
      metadata: { cardId: request.cardId, endpoint: 'tez-interrogate' },
    });

    // Block HIGH threat interrogations, allow medium/low with sanitized input
    if (securityCheck.threatLevel === 'high') {
      return {
        question: request.question,
        answer: "This question contains patterns that may be attempting to manipulate the interrogation system. For security reasons, it cannot be processed. Please rephrase your question.",
        classification: "abstention",
        confidence: "high",
        citations: [],
        sessionId,
        contextScope: "security_blocked",
        responseTimeMs: Date.now() - startTime,
        modelUsed: "security-filter",
      };
    }
  }

  // 2. Load context items for the card (filtered if guest access)
  let items: ContextItem[];

  if (request.contextFilter?.scope === "surface") {
    // Surface-only: no context items loaded — interrogation answers from card content alone
    items = [];
  } else {
    const contextItems = await db
      .select()
      .from(cardContext)
      .where(eq(cardContext.cardId, request.cardId))
      .orderBy(desc(cardContext.capturedAt));

    const allItems: ContextItem[] = contextItems.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      originalType: row.originalType,
      originalRawText: row.originalRawText,
      userName: row.userName,
      capturedAt: row.capturedAt,
    }));

    if (request.contextFilter?.scope === "selected" && request.contextFilter.contextItemIds?.length) {
      // Selected: only expose specific context items
      const allowedIds = new Set(request.contextFilter.contextItemIds);
      items = allItems.filter((item) => allowedIds.has(item.id));
    } else {
      // Full access (default for authenticated users, or explicit "full" scope)
      items = allItems;
    }
  }

  // Calculate total context size and determine if TIP Lite should be used
  const contextTokenCount = calculateContextTokenCount(items);
  const useTipLite = shouldUseTipLite(contextTokenCount);

  // 3. Check AI consent for external API calls (OpenAI)
  // Guest access via share token implies consent — the card owner explicitly chose to share.
  const isGuestAccess = !!request.guestTokenId;

  let hasAIConsent = isGuestAccess; // Guest access = implicit consent
  if (!isGuestAccess) {
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    hasAIConsent = userRows.length > 0 && !!userRows[0].aiConsentGiven;
  }

  // If user hasn't consented to AI, use fallback (no external API calls)
  if (!hasAIConsent) {
    logger.info('User has not granted AI consent, using fallback interrogation', { userId: request.userId });
    const fallback = fallbackInterrogate(request.question, items);

    const responseTimeMs = Date.now() - startTime;
    const interrogationId = `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(tezInterrogations).values({
      id: interrogationId,
      cardId: request.cardId,
      userId: request.userId,
      sessionId,
      question: request.question,
      answer: fallback.answer,
      classification: fallback.classification,
      confidence: fallback.confidence,
      contextScope: useTipLite ? "tip_lite" : "full",
      contextTokenCount,
      modelUsed: "fallback-no-consent",
      responseTimeMs,
      guestTokenId: request.guestTokenId || null,
    });

    for (const citation of fallback.citations) {
      await db.insert(tezCitations).values({
        id: `cit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        interrogationId,
        contextItemId: citation.contextItemId,
        location: citation.location || null,
        excerpt: citation.excerpt,
        claim: citation.claim,
        verificationStatus: citation.verificationStatus,
        confidence: citation.confidence,
      });
    }

    return {
      question: request.question,
      answer: fallback.answer + "\n\n_Note: AI-powered interrogation requires your consent to send data to external services. Grant consent in settings to enable advanced features._",
      classification: fallback.classification,
      confidence: fallback.confidence,
      citations: fallback.citations,
      sessionId,
      contextScope: useTipLite ? "tip_lite" : "full",
      responseTimeMs,
      modelUsed: "fallback-no-consent",
      tipLite: useTipLite,
    };
  }

  let answer: string;
  let classification: "grounded" | "inferred" | "partial" | "abstention";
  let confidence: "high" | "medium" | "low";
  let citations: Citation[];
  let modelUsed = "fallback-keyword";

  // 4. Try OpenClaw AI, fallback to keyword matching
  if (getOpenClawToken()) {
    try {
      const systemPrompt = buildTIPSystemPrompt(items);

      // Get session history for follow-ups
      const sessionHistory = request.sessionId
        ? await getSessionHistory({ sessionId: request.sessionId, cardId: request.cardId, userId: request.userId })
        : [];

      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      // Add session history for follow-ups (question/answer pairs)
      for (const prev of sessionHistory) {
        messages.push({ role: "user", content: wrapUserContent(prev.question, 'question') });
        messages.push({ role: "assistant", content: prev.answer });
      }

      // Wrap current question with delimiter isolation
      const sanitizedQuestion = securityCheck.sanitizedInput || request.question;
      messages.push({ role: "user", content: wrapUserContent(sanitizedQuestion, 'question') });

      // Try OpenClaw HTTP first, then direct OpenAI, then keyword fallback
      let aiContent: string | null = null;

      // Attempt 1: OpenClaw HTTP
      try {
        const response = await fetchWithTimeout(`${getOpenClawUrl()}/v1/agents/interrogator/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getOpenClawToken()}`,
          },
          body: JSON.stringify({
            messages,
            response_format: { type: "json_object" },
          }),
        }, 15000);

        if (response.ok) {
          const data = await response.json();
          aiContent = data.choices[0].message.content;
          modelUsed = "openclaw-interrogator";
        }
      } catch {
        // OpenClaw HTTP failed (expected if gateway is WS-only)
      }

      // Attempt 2: Direct OpenAI API
      if (!aiContent) {
        const directResult = await callAIDirect(messages);
        if (directResult) {
          aiContent = directResult.content;
          modelUsed = "openai-direct";
        }
      }

      if (aiContent) {
        const result = JSON.parse(aiContent);

        answer = result.answer || "No answer available.";
        classification = result.classification || "abstention";
        confidence = result.confidence || "low";

        // Parse and verify citations from the AI response
        const parsedCitations = parseCitations(answer);
        const aiCitations: Citation[] = (result.citations || []).map((c: { contextItemId: string; location?: string; excerpt: string; claim: string }) => ({
          contextItemId: c.contextItemId,
          location: c.location,
          excerpt: c.excerpt || "",
          claim: c.claim || "",
          confidence: "medium" as const,
          verificationStatus: "unverified" as const,
        }));

        // Verify all citations
        citations = verifyCitations(
          [
            ...parsedCitations,
            ...aiCitations.map((c: Citation) => ({ contextItemId: c.contextItemId, location: c.location })),
          ],
          items,
          answer,
        );

        // Update classification based on verification
        const failedCount = citations.filter((c) => c.verificationStatus === "failed").length;
        if (failedCount > 0 && failedCount < citations.length) {
          classification = "partial";
        } else if (failedCount === citations.length && citations.length > 0) {
          classification = "abstention";
          confidence = "low";
        }
      } else {
        // All AI paths failed, use keyword fallback
        const fallback = fallbackInterrogate(request.question, items);
        answer = fallback.answer;
        classification = fallback.classification;
        confidence = fallback.confidence;
        citations = fallback.citations;
      }
    } catch (error) {
      // Unexpected error, use fallback
      const fallback = fallbackInterrogate(request.question, items);
      answer = fallback.answer;
      classification = fallback.classification;
      confidence = fallback.confidence;
      citations = fallback.citations;
    }
  } else {
    // No OpenClaw configured, use fallback
    const fallback = fallbackInterrogate(request.question, items);
    answer = fallback.answer;
    classification = fallback.classification;
    confidence = fallback.confidence;
    citations = fallback.citations;
  }

  const responseTimeMs = Date.now() - startTime;

  // 3. Store interrogation record
  const interrogationId = `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(tezInterrogations).values({
    id: interrogationId,
    cardId: request.cardId,
    userId: request.userId,
    sessionId,
    question: request.question,
    answer,
    classification,
    confidence,
    contextScope: request.contextFilter?.scope || (useTipLite ? "tip_lite" : "full"),
    contextTokenCount,
    modelUsed,
    responseTimeMs,
    guestTokenId: request.guestTokenId || null,
  });

  // Log security event for audit trail
  logSecurityEvent({
    eventType: 'api_call',
    userId: request.userId,
    threatLevel: securityCheck.threatLevel,
    matchedPatterns: securityCheck.matchedPatterns,
    inputLength: request.question.length,
    timestamp: new Date(),
    metadata: {
      cardId: request.cardId,
      endpoint: 'tez-interrogate',
      modelUsed,
      classification,
      confidence,
    },
  });

  // 4. Store citations
  for (const citation of citations) {
    await db.insert(tezCitations).values({
      id: `cit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      interrogationId,
      contextItemId: citation.contextItemId,
      location: citation.location || null,
      excerpt: citation.excerpt,
      claim: citation.claim,
      verificationStatus: citation.verificationStatus,
      confidence: citation.confidence,
    });
  }

  return {
    question: request.question,
    answer,
    classification,
    confidence,
    citations,
    sessionId,
    contextScope: useTipLite ? "tip_lite" : "full",
    responseTimeMs,
    modelUsed,
    tipLite: useTipLite,
  };
}

// ============= Session History =============

export async function getSessionHistory(params: { sessionId: string; cardId: string; userId: string }): Promise<InterrogationResponse[]> {
  const rows = await db
    .select()
    .from(tezInterrogations)
    .where(and(
      eq(tezInterrogations.sessionId, params.sessionId),
      eq(tezInterrogations.cardId, params.cardId),
      eq(tezInterrogations.userId, params.userId),
    ))
    .orderBy(tezInterrogations.createdAt);

  const results: InterrogationResponse[] = [];

  for (const row of rows) {
    // Load citations for each interrogation
    const citationRows = await db
      .select()
      .from(tezCitations)
      .where(eq(tezCitations.interrogationId, row.id));

    results.push({
      question: row.question,
      answer: row.answer,
      classification: row.classification as InterrogationResponse["classification"],
      confidence: row.confidence as InterrogationResponse["confidence"],
      citations: citationRows.map((c) => ({
        contextItemId: c.contextItemId,
        location: c.location || undefined,
        excerpt: c.excerpt,
        claim: c.claim,
        confidence: c.confidence as Citation["confidence"],
        verificationStatus: c.verificationStatus as Citation["verificationStatus"],
      })),
      sessionId: row.sessionId,
      contextScope: row.contextScope,
      responseTimeMs: row.responseTimeMs || 0,
      modelUsed: row.modelUsed || "unknown",
    });
  }

  return results;
}

// ============= Get Citations for Card =============

export async function getCitationsForCard(cardId: string): Promise<Citation[]> {
  const rows = await db
    .select({
      id: tezCitations.id,
      contextItemId: tezCitations.contextItemId,
      location: tezCitations.location,
      excerpt: tezCitations.excerpt,
      claim: tezCitations.claim,
      confidence: tezCitations.confidence,
      verificationStatus: tezCitations.verificationStatus,
    })
    .from(tezCitations)
    .innerJoin(tezInterrogations, eq(tezCitations.interrogationId, tezInterrogations.id))
    .where(eq(tezInterrogations.cardId, cardId));

  return rows.map((r) => ({
    contextItemId: r.contextItemId,
    location: r.location || undefined,
    excerpt: r.excerpt,
    claim: r.claim,
    confidence: r.confidence as Citation["confidence"],
    verificationStatus: r.verificationStatus as Citation["verificationStatus"],
  }));
}

export const tezInterrogationService = {
  interrogate,
  getSessionHistory,
  getCitationsForCard,
  verifyCitations,
  parseCitations,
  buildTIPSystemPrompt,
};
