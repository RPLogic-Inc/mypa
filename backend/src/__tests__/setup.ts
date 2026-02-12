/**
 * Test setup file
 * Runs before all tests to configure the test environment
 *
 * Note: OpenClaw service uses fallback routing when OPENCLAW_TOKEN is not set,
 * so we test with real fallback logic instead of mocking.
 */

// IMPORTANT: This file is loaded by Vitest before test modules.
// Set env vars at import time (not inside hooks) so any module-level DB
// initialization uses the test database.

process.env.DATABASE_URL = "file::memory:?cache=shared";
process.env.NODE_ENV = "test";

// JWT secrets for test token generation/verification
process.env.JWT_SECRET = "test-jwt-secret-for-testing";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-testing";

// Ensure OpenClaw uses fallback logic (no external API calls)
delete process.env.OPENCLAW_TOKEN;
