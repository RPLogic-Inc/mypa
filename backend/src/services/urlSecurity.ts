import { isIP } from "node:net";

export const DEFAULT_NTFY_SERVER_URL = "https://ntfy.sh";
const DEFAULT_NTFY_ALLOWED_HOSTS = ["ntfy.sh"];

function getAllowedNtfyHosts(): string[] {
  const raw = process.env.NTFY_ALLOWED_HOSTS;
  if (!raw) return DEFAULT_NTFY_ALLOWED_HOSTS;
  const parsed = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_NTFY_ALLOWED_HOSTS;
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice("::ffff:".length);
    return isPrivateIPv4(mapped);
  }
  return false;
}

export function validateNtfyServerUrl(rawUrl: string | null | undefined): {
  valid: boolean;
  normalizedUrl?: string;
  message?: string;
} {
  const candidate = (rawUrl || DEFAULT_NTFY_SERVER_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, message: "Invalid ntfy server URL" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, message: "ntfy server must use HTTPS" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, message: "Credentials in ntfy server URL are not allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { valid: false, message: "Localhost ntfy servers are not allowed" };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    return { valid: false, message: "Private IPv4 ntfy servers are not allowed" };
  }
  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    return { valid: false, message: "Private IPv6 ntfy servers are not allowed" };
  }

  const allowedHosts = getAllowedNtfyHosts();
  const allowed = allowedHosts.some(
    (allowedHost) =>
      hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  );

  if (!allowed) {
    return {
      valid: false,
      message: `ntfy server host is not allowlisted (${allowedHosts.join(", ")})`,
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.origin,
  };
}
