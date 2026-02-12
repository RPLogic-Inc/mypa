import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTezContextLayerFromTwenty,
  getTwentyConnectionStatus,
} from "../services/twentyClient.js";

describe("twentyClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getTwentyConnectionStatus", () => {
    it("returns not configured when env vars are missing", () => {
      vi.stubEnv("TWENTY_API_URL", "");
      vi.stubEnv("TWENTY_API_KEY", "");

      const status = getTwentyConnectionStatus();
      expect(status.configured).toBe(false);
      expect(status.reason).toContain("TWENTY_API_URL");
    });

    it("returns configured when URL and key are present", () => {
      vi.stubEnv("TWENTY_API_URL", "http://localhost:3000");
      vi.stubEnv("TWENTY_API_KEY", "test-key");

      const status = getTwentyConnectionStatus();
      expect(status.configured).toBe(true);
      expect(status.baseUrl).toBe("http://localhost:3000");
    });
  });

  describe("buildTezContextLayerFromTwenty", () => {
    it("builds a person context layer", () => {
      const layer = buildTezContextLayerFromTwenty("person", {
        id: "person_123",
        firstName: "Alice",
        lastName: "Moss",
        status: "active",
        companyName: "MyPA Labs",
      });

      expect(layer.type).toBe("text");
      expect(layer.content).toContain("CRM contact snapshot");
      expect(layer.content).toContain("person_123");
      expect(layer.query).toContain("follow-up");
    });

    it("builds an opportunity context layer", () => {
      const layer = buildTezContextLayerFromTwenty("opportunity", {
        id: "opp_456",
        title: "Q2 Expansion",
        stage: "negotiation",
        amount: "85000",
      });

      expect(layer.type).toBe("text");
      expect(layer.content).toContain("CRM opportunity snapshot");
      expect(layer.content).toContain("opp_456");
      expect(layer.query).toContain("blockers");
    });

    it("builds a task context layer", () => {
      const layer = buildTezContextLayerFromTwenty("task", {
        id: "task_789",
        title: "Call client",
        status: "todo",
        dueDate: "2026-02-10",
      });

      expect(layer.type).toBe("text");
      expect(layer.content).toContain("CRM task snapshot");
      expect(layer.content).toContain("task_789");
      expect(layer.query).toContain("urgency");
    });
  });
});
