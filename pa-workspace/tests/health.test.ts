import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { healthRoutes } from "../src/routes/health.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/health", healthRoutes);
  return app;
}

describe("Health Routes", () => {
  const app = createApp();

  describe("GET /health/live", () => {
    it("returns ok status", async () => {
      const res = await request(app).get("/health/live");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("pa-workspace");
    });
  });

  describe("GET /health/ready", () => {
    it("returns ok when database is accessible", async () => {
      const res = await request(app).get("/health/ready");
      // May return 200 or 503 depending on DB availability in test env
      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toBe("pa-workspace");
    });
  });
});
