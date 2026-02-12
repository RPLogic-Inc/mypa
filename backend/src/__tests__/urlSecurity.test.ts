import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateNtfyServerUrl } from "../services/urlSecurity.js";

describe("validateNtfyServerUrl", () => {
  const originalAllowlist = process.env.NTFY_ALLOWED_HOSTS;

  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.NTFY_ALLOWED_HOSTS;
  });

  afterEach(() => {
    if (originalAllowlist === undefined) {
      delete process.env.NTFY_ALLOWED_HOSTS;
    } else {
      process.env.NTFY_ALLOWED_HOSTS = originalAllowlist;
    }
  });

  it("accepts default ntfy host", () => {
    const result = validateNtfyServerUrl("https://ntfy.sh");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://ntfy.sh");
  });

  it("accepts allowlisted subdomains", () => {
    vi.stubEnv("NTFY_ALLOWED_HOSTS", "ntfy.sh,example.com");
    const result = validateNtfyServerUrl("https://updates.example.com");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://updates.example.com");
  });

  it("rejects non-https URLs", () => {
    const result = validateNtfyServerUrl("http://ntfy.sh");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("HTTPS");
  });

  it("rejects localhost URLs", () => {
    const result = validateNtfyServerUrl("https://localhost");
    expect(result.valid).toBe(false);
  });

  it("rejects private IPv4 URLs", () => {
    const result = validateNtfyServerUrl("https://10.0.0.15");
    expect(result.valid).toBe(false);
  });

  it("rejects private IPv6 URLs", () => {
    const result = validateNtfyServerUrl("https://[::1]");
    expect(result.valid).toBe(false);
  });

  it("rejects hosts outside allowlist", () => {
    vi.stubEnv("NTFY_ALLOWED_HOSTS", "ntfy.sh");
    const result = validateNtfyServerUrl("https://example.org");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("allowlisted");
  });
});
