/**
 * Unit tests for classifyMessageIntent()
 *
 * Tests the deterministic keyword-based intent classification logic
 * that decides whether a message is self-directed, a DM to a specific
 * team member, or a broadcast.
 */

import { describe, it, expect } from "vitest";
import { classifyMessageIntent } from "../services/classify.js";

// ============= Test Fixtures =============

const sender = {
  id: "user1",
  name: "Alice Johnson",
  roles: ["member"],
  skills: [],
  department: "eng",
};

const teamMembers = [
  sender,
  { id: "user2", name: "Tom Smith", roles: ["member"], skills: [], department: "eng" },
  { id: "user3", name: "Sarah Chen", roles: ["member"], skills: [], department: "design" },
  { id: "user4", name: "Bob Wilson", roles: ["member"], skills: [], department: "eng" },
];

// ============= Test Suite =============

describe("classifyMessageIntent", () => {
  // ============= Self-directed patterns =============

  describe("Self-directed patterns", () => {
    it("should classify 'remind me to buy milk' as self intent with 100% confidence", () => {
      const result = classifyMessageIntent("remind me to buy milk", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
      expect(result.reason).toMatch(/self-directed/i);
    });

    it("should classify 'note to self: check docs' as self intent", () => {
      const result = classifyMessageIntent("note to self: check docs", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should classify 'I need to review PRs' as self intent", () => {
      const result = classifyMessageIntent("I need to review PRs", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should classify 'todo: fix the bug' as self intent", () => {
      const result = classifyMessageIntent("todo: fix the bug", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should classify 'my task for today is to update docs' as self intent", () => {
      const result = classifyMessageIntent("my task for today is to update docs", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should classify 'don't forget to submit the report' as self intent", () => {
      const result = classifyMessageIntent("don't forget to submit the report", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });
  });

  // ============= Directive + name patterns =============

  describe("Directive + name (DM intent)", () => {
    it("should classify 'tell Tom the API is ready' as dm intent for Tom with high confidence", () => {
      const result = classifyMessageIntent("tell Tom the API is ready", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });

    it("should classify 'ask Sarah about the design' as dm intent for Sarah", () => {
      const result = classifyMessageIntent("ask Sarah about the design", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user3");
      expect(result.recipientName).toBe("Sarah Chen");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });

    it("should classify 'let Bob know about the meeting' as dm intent for Bob", () => {
      const result = classifyMessageIntent("let Bob know about the meeting", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user4");
      expect(result.recipientName).toBe("Bob Wilson");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });

    it("should classify 'message Sarah with the update' as dm intent for Sarah", () => {
      const result = classifyMessageIntent("message Sarah with the update", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user3");
      expect(result.recipientName).toBe("Sarah Chen");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });

    it("should classify 'send Tom the latest build' as dm intent for Tom", () => {
      const result = classifyMessageIntent("send Tom the latest build", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });
  });

  // ============= "for <name>:" pattern =============

  describe('"for <name>:" pattern', () => {
    it("should classify 'for Tom: the deployment is done' as dm intent for Tom", () => {
      const result = classifyMessageIntent("for Tom: the deployment is done", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });

    it("should classify 'to Bob: here are the logs' as dm intent for Bob", () => {
      const result = classifyMessageIntent("to Bob: here are the logs", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user4");
      expect(result.recipientName).toBe("Bob Wilson");
      expect(result.confidence).toBeGreaterThanOrEqual(98);
    });
  });

  // ============= Name mention without directive =============

  describe("Name mention without directive", () => {
    it("should classify a message mentioning Tom without directive as dm with 70% confidence", () => {
      const result = classifyMessageIntent("Tom's PR looks good", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBe(70);
    });

    it("should have lower confidence than directive-based matches", () => {
      const withDirective = classifyMessageIntent("tell Tom the API is ready", sender, teamMembers);
      const withoutDirective = classifyMessageIntent("Tom's PR looks good", sender, teamMembers);

      expect(withDirective.confidence).toBeGreaterThan(withoutDirective.confidence);
    });
  });

  // ============= Full name match =============

  describe("Full name match", () => {
    it("should classify 'Tell Tom Smith about it' as dm with 99% confidence", () => {
      const result = classifyMessageIntent("Tell Tom Smith about it", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBe(99);
    });

    it("should give full name match higher confidence than first name match with same directive", () => {
      const fullName = classifyMessageIntent("Tell Tom Smith about it", sender, teamMembers);
      const firstName = classifyMessageIntent("Tell Tom about it", sender, teamMembers);

      expect(fullName.confidence).toBeGreaterThan(firstName.confidence);
    });

    it("should classify full name mention without directive with 85% confidence", () => {
      const result = classifyMessageIntent("I saw Tom Smith updated the repo", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.recipientName).toBe("Tom Smith");
      expect(result.confidence).toBe(85);
    });
  });

  // ============= No name found =============

  describe("No name found", () => {
    it("should default to self intent with 100% confidence when no names match", () => {
      const result = classifyMessageIntent("the deployment is done", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
      expect(result.reason).toMatch(/no team member/i);
    });

    it("should not match the sender's own name", () => {
      const result = classifyMessageIntent("Alice should review the PR", sender, teamMembers);

      // "Alice" is the sender, so it should be skipped; no other names match
      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });
  });

  // ============= Multiple name matches =============

  describe("Multiple name matches", () => {
    it("should return dm with 50% confidence when multiple names are mentioned", () => {
      const result = classifyMessageIntent(
        "Tom and Sarah should review this together",
        sender,
        teamMembers
      );

      expect(result.intent).toBe("dm");
      expect(result.confidence).toBe(50);
      expect(result.reason).toMatch(/multiple/i);
    });

    it("should prefer the directed match when multiple names exist with a directive", () => {
      const result = classifyMessageIntent(
        "tell Tom that Sarah approved the design",
        sender,
        teamMembers
      );

      // "tell Tom" is the directive, so Tom should be preferred
      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
      expect(result.confidence).toBe(50);
    });
  });

  // ============= Edge cases =============

  describe("Edge cases", () => {
    it("should handle empty message gracefully", () => {
      const result = classifyMessageIntent("", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should handle empty team members list", () => {
      const result = classifyMessageIntent("tell Tom about it", sender, [sender]);

      // No non-sender members to match against
      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });

    it("should be case-insensitive for name matching", () => {
      const result = classifyMessageIntent("tell TOM the build passed", sender, teamMembers);

      expect(result.intent).toBe("dm");
      expect(result.recipientId).toBe("user2");
    });

    it("should handle self-directed patterns taking priority over name mentions", () => {
      // "remind me" is a self-pattern -- even if a name appears, self wins
      const result = classifyMessageIntent("remind me to tell Tom about it", sender, teamMembers);

      expect(result.intent).toBe("self");
      expect(result.confidence).toBe(100);
    });
  });
});
