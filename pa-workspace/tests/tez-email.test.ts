import { describe, it, expect, vi } from "vitest";

vi.mock("../src/middleware/logging.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  detectTezitContent,
  extractTezBundle,
  composeTezEmail,
  TEZIT_PROTOCOL_HEADER,
  TEZIT_PROTOCOL_VERSION,
  TEZ_BUNDLE_FILENAME,
} from "../src/services/tezEmail.js";

describe("Tez Email Transport", () => {
  describe("detectTezitContent", () => {
    it("detects X-Tezit-Protocol header", () => {
      expect(detectTezitContent({
        headers: { [TEZIT_PROTOCOL_HEADER]: TEZIT_PROTOCOL_VERSION },
      })).toBe(true);
    });

    it("detects .tez.json attachment", () => {
      expect(detectTezitContent({
        attachments: [{ filename: "bundle.tez.json" }],
      })).toBe(true);
    });

    it("detects inline Tez markdown", () => {
      expect(detectTezitContent({
        body: "---\ntezit_version: 1.2\ntitle: Test\n---\n# Content",
      })).toBe(true);
    });

    it("returns false for normal email", () => {
      expect(detectTezitContent({
        headers: { Subject: "Hello" },
        body: "Just a normal email",
        attachments: [{ filename: "photo.jpg" }],
      })).toBe(false);
    });

    it("returns false for empty email", () => {
      expect(detectTezitContent({})).toBe(false);
    });
  });

  describe("extractTezBundle", () => {
    it("extracts from .tez.json attachment (plain JSON)", async () => {
      const bundle = {
        tezit_version: "1.2",
        id: "tez-100",
        title: "Attachment Bundle",
        type: "knowledge",
        content: "Knowledge content",
      };

      const result = await extractTezBundle({
        attachments: [{
          filename: "tez-100.tez.json",
          content: JSON.stringify(bundle),
        }],
        body: "See attached tez bundle.",
      });

      expect(result).not.toBeNull();
      expect(result!.tezit_version).toBe("1.2");
      expect(result!.id).toBe("tez-100");
      expect(result!.title).toBe("Attachment Bundle");
    });

    it("extracts from base64url-encoded attachment (Gmail API format)", async () => {
      const bundle = {
        tezit_version: "1.2",
        id: "tez-b64",
        title: "Base64 Bundle",
      };

      const base64url = Buffer.from(JSON.stringify(bundle))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const result = await extractTezBundle({
        attachments: [{
          filename: "tez-b64.tez.json",
          content: base64url,
        }],
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe("tez-b64");
      expect(result!.title).toBe("Base64 Bundle");
    });

    it("extracts from inline YAML frontmatter with content", async () => {
      const body = `---
tezit_version: 1.2
id: tez-inline
title: Inline Tez
type: message
author: Alice
---
This is the content of the inline tez.`;

      const result = await extractTezBundle({ body });

      expect(result).not.toBeNull();
      expect(result!.tezit_version).toBe("1.2");
      expect(result!.id).toBe("tez-inline");
      expect(result!.title).toBe("Inline Tez");
      expect(result!.type).toBe("message");
      expect(result!.content).toBe("This is the content of the inline tez.");
    });

    it("extracts from YAML frontmatter without content section", async () => {
      const body = `---
tezit_version: 1.2
title: Header Only
type: notification
---`;

      const result = await extractTezBundle({ body });

      expect(result).not.toBeNull();
      expect(result!.tezit_version).toBe("1.2");
      expect(result!.title).toBe("Header Only");
      expect(result!.content).toBeUndefined();
    });

    it("wraps body as minimal bundle when X-Tezit-Protocol header present", async () => {
      const result = await extractTezBundle({
        headers: { [TEZIT_PROTOCOL_HEADER]: "1.2" },
        body: "This is just a text body with tez context.",
        from: "sender@test.com",
        subject: "Tez Message",
      });

      expect(result).not.toBeNull();
      expect(result!.tezit_version).toBe("1.2");
      expect(result!.title).toBe("Tez Message");
      expect(result!.type).toBe("message");
      expect(result!.author).toBe("sender@test.com");
      expect(result!.content).toBe("This is just a text body with tez context.");
    });

    it("prefers attachment over inline frontmatter", async () => {
      const attachmentBundle = {
        tezit_version: "1.2",
        id: "attachment-wins",
        title: "From Attachment",
      };

      const result = await extractTezBundle({
        attachments: [{
          filename: "bundle.tez.json",
          content: JSON.stringify(attachmentBundle),
        }],
        body: "---\ntezit_version: 1.2\ntitle: From Inline\n---\nContent",
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe("attachment-wins");
      expect(result!.title).toBe("From Attachment");
    });

    it("returns null for non-tez email", async () => {
      const result = await extractTezBundle({
        body: "Just a regular email body.",
        headers: { Subject: "Hello" },
      });
      expect(result).toBeNull();
    });

    it("falls through to inline when attachment is malformed", async () => {
      const result = await extractTezBundle({
        attachments: [{
          filename: "bad.tez.json",
          content: "not valid json",
        }],
        body: "---\ntezit_version: 1.2\ntitle: Fallback\n---\nContent",
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Fallback");
    });

    it("returns null when attachment is malformed and no other sources", async () => {
      const result = await extractTezBundle({
        attachments: [{
          filename: "bad.tez.json",
          content: "not valid json",
        }],
        body: "Regular body text",
      });
      expect(result).toBeNull();
    });
  });

  describe("composeTezEmail", () => {
    it("includes correct protocol headers", () => {
      const result = composeTezEmail({
        bundle: {
          tezit_version: "1.2",
          id: "tez-compose",
          title: "Composed Tez",
          type: "knowledge",
        },
        fromEmail: "alice-pa@pa.test.com",
        toEmail: "bob-pa@pa.other.com",
      });

      expect(result.headers[TEZIT_PROTOCOL_HEADER]).toBe("1.2");
      expect(result.headers["X-Tezit-Id"]).toBe("tez-compose");
      expect(result.headers["X-Tezit-Type"]).toBe("knowledge");
    });

    it("includes human-readable body with all fields", () => {
      const result = composeTezEmail({
        bundle: {
          tezit_version: "1.2",
          id: "tez-body",
          title: "Readable Tez",
          type: "knowledge",
          author: "Alice",
          created: "2026-02-06T10:00:00Z",
          content: "The actual content.",
        },
        fromEmail: "alice-pa@pa.test.com",
        toEmail: "bob@test.com",
      });

      expect(result.body).toContain("Tezit Protocol v1.2");
      expect(result.body).toContain("# Readable Tez");
      expect(result.body).toContain("Type: knowledge");
      expect(result.body).toContain("Author: Alice");
      expect(result.body).toContain("Created: 2026-02-06T10:00:00Z");
      expect(result.body).toContain("The actual content.");
      expect(result.body).toContain("tez://tez-body");
      expect(result.body).toContain("From: alice-pa@pa.test.com");
      expect(result.body).toContain("To: bob@test.com");
      expect(result.body).toContain(".tez.json file");
    });

    it("attaches .tez.json bundle as base64", () => {
      const bundle = {
        tezit_version: "1.2",
        id: "tez-att",
        title: "Attached",
      };

      const result = composeTezEmail({
        bundle,
        fromEmail: "alice@test.com",
        toEmail: "bob@test.com",
      });

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe("tez-att.tez.json");
      expect(result.attachments[0].mimeType).toBe("application/json");

      // Decode and verify
      const decoded = Buffer.from(result.attachments[0].content, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      expect(parsed.tezit_version).toBe("1.2");
      expect(parsed.id).toBe("tez-att");
    });

    it("uses generic filename when bundle has no id", () => {
      const result = composeTezEmail({
        bundle: { tezit_version: "1.2", title: "No ID" },
        fromEmail: "alice@test.com",
        toEmail: "bob@test.com",
      });

      expect(result.attachments[0].filename).toBe(TEZ_BUNDLE_FILENAME);
    });

    it("omits deep link when bundle has no id", () => {
      const result = composeTezEmail({
        bundle: { tezit_version: "1.2", title: "No ID" },
        fromEmail: "alice@test.com",
        toEmail: "bob@test.com",
      });

      expect(result.body).not.toContain("tez://");
    });

    it("uses default protocol version when bundle version is empty", () => {
      const result = composeTezEmail({
        bundle: { tezit_version: "" } as any,
        fromEmail: "alice@test.com",
        toEmail: "bob@test.com",
      });

      expect(result.headers[TEZIT_PROTOCOL_HEADER]).toBe(TEZIT_PROTOCOL_VERSION);
    });

    it("handles minimal bundle (version only)", () => {
      const result = composeTezEmail({
        bundle: { tezit_version: "1.2" },
        fromEmail: "alice@test.com",
        toEmail: "bob@test.com",
      });

      expect(result.headers[TEZIT_PROTOCOL_HEADER]).toBe("1.2");
      expect(result.attachments).toHaveLength(1);
      expect(result.body).toContain("Tezit Protocol v1.2");
    });
  });
});
