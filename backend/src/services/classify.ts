/**
 * Message Intent Classification
 *
 * Deterministic keyword-based classification of message intent.
 * Extracted from the former openclaw.ts routing service.
 */

interface TeamMember {
  id: string;
  name: string;
  roles: string[];
  skills: string[];
  department: string;
}

export interface ClassificationResult {
  intent: "self" | "dm" | "broadcast";
  recipientId?: string;
  recipientName?: string;
  confidence: number; // 0-100
  reason: string;
}

// Patterns that strongly indicate the user wants to message someone specific
const DIRECTIVE_PATTERNS = [
  /\b(?:tell|ask|let|message|notify|remind)\s+(\w+)/i,
  /^(?:for|to)\s+(\w+)\s*:/i,
  /\bsend\s+(?:to\s+)?(\w+)/i,
];

// Patterns that strongly indicate self-directed intent
const SELF_PATTERNS = [
  /\bremind\s+me\b/i,
  /\bnote\s+to\s+self\b/i,
  /\bi\s+need\s+to\b/i,
  /\btodo\b/i,
  /\bmy\s+(?:task|todo|reminder|note)\b/i,
  /\bdon'?t\s+(?:forget|let\s+me)\b/i,
];

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(Boolean);
}

/**
 * Classify a message's intent: self-directed, DM to a specific person, or broadcast.
 * Deterministic keyword-based -- no AI calls.
 * Returns confidence 0-100 indicating how sure we are about the routing.
 */
export function classifyMessageIntent(
  message: string,
  sender: TeamMember,
  teamMembers: TeamMember[]
): ClassificationResult {
  const lowerMessage = message.toLowerCase();
  const messageTokens = new Set(tokenizeWords(lowerMessage));

  // Check for self-directed patterns first
  for (const pattern of SELF_PATTERNS) {
    if (pattern.test(lowerMessage)) {
      return { intent: "self", confidence: 100, reason: "Self-directed pattern detected" };
    }
  }

  // Check for directive patterns that name a specific person
  let directedName: string | null = null;
  for (const pattern of DIRECTIVE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      directedName = match[1].toLowerCase();
      break;
    }
  }

  // Find matching team members by name
  const matches: Array<{ member: TeamMember; matchType: "full" | "first" }> = [];

  for (const member of teamMembers) {
    if (member.id === sender.id) continue;
    const nameTokens = tokenizeWords(member.name);
    const first = nameTokens[0];
    const fullMatch =
      nameTokens.length > 1 && nameTokens.every((t) => messageTokens.has(t));
    const firstMatch = first ? messageTokens.has(first) : false;

    if (fullMatch) {
      matches.push({ member, matchType: "full" });
    } else if (firstMatch) {
      matches.push({ member, matchType: "first" });
    }
  }

  // No name matches -- default to self
  if (matches.length === 0) {
    return { intent: "self", confidence: 100, reason: "No team member names detected" };
  }

  // Single match
  if (matches.length === 1) {
    const match = matches[0];
    let confidence: number;
    let reason: string;

    if (match.matchType === "full" && directedName) {
      confidence = 99;
      reason = `Full name match "${match.member.name}" with directive`;
    } else if (match.matchType === "first" && directedName) {
      confidence = 98;
      reason = `First name match "${match.member.name}" with directive`;
    } else if (match.matchType === "full") {
      confidence = 85;
      reason = `Full name match "${match.member.name}" mentioned (no directive)`;
    } else {
      // First name only, no directive -- low confidence, could be coincidental
      confidence = 70;
      reason = `First name "${match.member.name}" mentioned (no directive)`;
    }

    return {
      intent: "dm",
      recipientId: match.member.id,
      recipientName: match.member.name,
      confidence,
      reason,
    };
  }

  // Multiple matches -- ambiguous, low confidence
  // Prefer the one with a directive match if any
  const directedMatch = directedName
    ? matches.find((m) => tokenizeWords(m.member.name)[0] === directedName)
    : null;

  const best = directedMatch || matches[0];
  return {
    intent: "dm",
    recipientId: best.member.id,
    recipientName: best.member.name,
    confidence: 50,
    reason: `Multiple name matches (${matches.length}), ambiguous routing`,
  };
}

export const classifyService = {
  classifyMessageIntent,
};
