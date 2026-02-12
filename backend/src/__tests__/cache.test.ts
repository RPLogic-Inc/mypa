/**
 * Unit tests for Cache Service (Phase 4C)
 *
 * Tests:
 * - Basic cache operations (get, set, delete)
 * - TTL expiration
 * - Pattern deletion
 * - Cache statistics
 * - Key builders
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cache,
  cacheKeys,
  cacheTTL,
  invalidateUserCache,
  invalidateTeamCache,
} from "../services/cache.js";

// ============= Test Suite =============

describe("Cache Service", () => {
  beforeEach(() => {
    cache.clear();
  });

  afterEach(() => {
    cache.clear();
  });

  // ============= Basic Operations Tests =============

  describe("Basic Operations", () => {
    it("should set and get a value", () => {
      cache.set("test-key", "test-value", 60000);

      const value = cache.get<string>("test-key");

      expect(value).toBe("test-value");
    });

    it("should return undefined for non-existent key", () => {
      const value = cache.get<string>("non-existent-key");

      expect(value).toBeUndefined();
    });

    it("should delete a value", () => {
      cache.set("delete-key", "value", 60000);

      cache.delete("delete-key");

      expect(cache.get<string>("delete-key")).toBeUndefined();
    });

    it("should clear all values", () => {
      cache.set("key1", "value1", 60000);
      cache.set("key2", "value2", 60000);
      cache.set("key3", "value3", 60000);

      cache.clear();

      expect(cache.get<string>("key1")).toBeUndefined();
      expect(cache.get<string>("key2")).toBeUndefined();
      expect(cache.get<string>("key3")).toBeUndefined();
    });

    it("should handle various data types", () => {
      // String
      cache.set("string-key", "string-value", 60000);
      expect(cache.get<string>("string-key")).toBe("string-value");

      // Number
      cache.set("number-key", 42, 60000);
      expect(cache.get<number>("number-key")).toBe(42);

      // Object
      const obj = { name: "test", count: 10 };
      cache.set("object-key", obj, 60000);
      expect(cache.get<typeof obj>("object-key")).toEqual(obj);

      // Array
      const arr = [1, 2, 3];
      cache.set("array-key", arr, 60000);
      expect(cache.get<number[]>("array-key")).toEqual(arr);

      // Null
      cache.set("null-key", null, 60000);
      expect(cache.get("null-key")).toBeNull();

      // Boolean
      cache.set("bool-key", true, 60000);
      expect(cache.get<boolean>("bool-key")).toBe(true);
    });

    it("should overwrite existing values", () => {
      cache.set("overwrite-key", "original", 60000);
      cache.set("overwrite-key", "updated", 60000);

      expect(cache.get<string>("overwrite-key")).toBe("updated");
    });
  });

  // ============= TTL Tests =============

  describe("TTL Expiration", () => {
    it("should expire values after TTL", async () => {
      vi.useFakeTimers();

      cache.set("expiring-key", "value", 1000); // 1 second TTL

      // Value should exist immediately
      expect(cache.get<string>("expiring-key")).toBe("value");

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Value should be expired
      expect(cache.get<string>("expiring-key")).toBeUndefined();

      vi.useRealTimers();
    });

    it("should keep values before TTL expires", async () => {
      vi.useFakeTimers();

      cache.set("not-expired-key", "value", 5000); // 5 second TTL

      // Advance time but not past TTL
      vi.advanceTimersByTime(3000);

      // Value should still exist
      expect(cache.get<string>("not-expired-key")).toBe("value");

      vi.useRealTimers();
    });

    it("should handle zero TTL", () => {
      vi.useFakeTimers();

      cache.set("zero-ttl-key", "value", 0);

      // Advance time slightly
      vi.advanceTimersByTime(1);

      // Value should be expired immediately
      expect(cache.get<string>("zero-ttl-key")).toBeUndefined();

      vi.useRealTimers();
    });
  });

  // ============= Pattern Deletion Tests =============

  describe("Pattern Deletion", () => {
    it("should delete keys matching prefix", () => {
      cache.set("user:1", "value1", 60000);
      cache.set("user:2", "value2", 60000);
      cache.set("user:3", "value3", 60000);
      cache.set("team:1", "team-value", 60000);

      cache.deletePattern("user:");

      expect(cache.get<string>("user:1")).toBeUndefined();
      expect(cache.get<string>("user:2")).toBeUndefined();
      expect(cache.get<string>("user:3")).toBeUndefined();
      expect(cache.get<string>("team:1")).toBe("team-value");
    });

    it("should handle no matching keys", () => {
      cache.set("key1", "value1", 60000);
      cache.set("key2", "value2", 60000);

      // Should not throw
      cache.deletePattern("nonexistent:");

      // Original keys should still exist
      expect(cache.get<string>("key1")).toBe("value1");
      expect(cache.get<string>("key2")).toBe("value2");
    });
  });

  // ============= Statistics Tests =============

  describe("Cache Statistics", () => {
    it("should return size and keys", () => {
      cache.set("stat-key-1", "value1", 60000);
      cache.set("stat-key-2", "value2", 60000);
      cache.set("stat-key-3", "value3", 60000);

      const stats = cache.stats();

      expect(stats.size).toBe(3);
      expect(stats.keys).toContain("stat-key-1");
      expect(stats.keys).toContain("stat-key-2");
      expect(stats.keys).toContain("stat-key-3");
    });

    it("should return empty stats for empty cache", () => {
      const stats = cache.stats();

      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  // ============= Key Builders Tests =============

  describe("Cache Key Builders", () => {
    it("should generate user key", () => {
      const key = cacheKeys.user("user-123");
      expect(key).toBe("user:user-123");
    });

    it("should generate user by email key", () => {
      const key = cacheKeys.userByEmail("Test@Example.COM");
      expect(key).toBe("user:email:test@example.com");
    });

    it("should generate team members key", () => {
      const key = cacheKeys.teamMembers("team-456");
      expect(key).toBe("team:team-456:members");
    });

    it("should generate card recipients key", () => {
      const key = cacheKeys.cardRecipients("card-789");
      expect(key).toBe("card:card-789:recipients");
    });
  });

  // ============= TTL Constants Tests =============

  describe("Cache TTL Constants", () => {
    it("should have correct user TTL (5 minutes)", () => {
      expect(cacheTTL.user).toBe(5 * 60 * 1000);
    });

    it("should have correct team members TTL (5 minutes)", () => {
      expect(cacheTTL.teamMembers).toBe(5 * 60 * 1000);
    });

    it("should have correct card recipients TTL (2 minutes)", () => {
      expect(cacheTTL.cardRecipients).toBe(2 * 60 * 1000);
    });
  });

  // ============= Invalidation Helper Tests =============

  describe("Cache Invalidation Helpers", () => {
    it("should invalidate user cache by ID", () => {
      cache.set("user:user-123", { id: "user-123", name: "Test" }, 60000);

      invalidateUserCache("user-123");

      expect(cache.get("user:user-123")).toBeUndefined();
    });

    it("should invalidate user cache by ID and email", () => {
      cache.set("user:user-123", { id: "user-123", name: "Test" }, 60000);
      cache.set("user:email:test@example.com", { id: "user-123", name: "Test" }, 60000);

      invalidateUserCache("user-123", "test@example.com");

      expect(cache.get("user:user-123")).toBeUndefined();
      expect(cache.get("user:email:test@example.com")).toBeUndefined();
    });

    it("should invalidate team cache", () => {
      cache.set("team:team-456:members", ["user-1", "user-2"], 60000);

      invalidateTeamCache("team-456");

      expect(cache.get("team:team-456:members")).toBeUndefined();
    });

    it("should handle invalidating non-existent user", () => {
      // Should not throw
      invalidateUserCache("nonexistent-user");
      expect(true).toBe(true);
    });

    it("should handle invalidating non-existent team", () => {
      // Should not throw
      invalidateTeamCache("nonexistent-team");
      expect(true).toBe(true);
    });
  });
});

// ============= Cached User Lookup Tests =============
// Note: These tests focus on cache behavior when data is pre-populated
// The actual database integration is tested via route tests

describe("Cached User Lookups (Cache Layer Only)", () => {
  beforeEach(() => {
    cache.clear();
  });

  describe("User cache key behavior", () => {
    it("should return cached user value when present", () => {
      // Pre-populate cache
      const mockUser = { id: "cached-user-1", name: "Alice", email: "alice@test.com" };
      cache.set(cacheKeys.user("cached-user-1"), mockUser, 60000);

      const result = cache.get(cacheKeys.user("cached-user-1"));
      expect(result).toEqual(mockUser);
    });

    it("should return undefined when user not in cache", () => {
      const result = cache.get(cacheKeys.user("missing-user"));
      expect(result).toBeUndefined();
    });

    it("should expire cached user after TTL", async () => {
      vi.useFakeTimers();

      const mockUser = { id: "expiring-user", name: "Temp" };
      cache.set(cacheKeys.user("expiring-user"), mockUser, 1000);

      // Should exist initially
      expect(cache.get(cacheKeys.user("expiring-user"))).toEqual(mockUser);

      // Advance past TTL
      vi.advanceTimersByTime(1500);

      // Should be expired
      expect(cache.get(cacheKeys.user("expiring-user"))).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe("User by email cache key behavior", () => {
    it("should return cached user by email when present", () => {
      const mockUser = { id: "cached-user-2", name: "Bob", email: "bob@test.com" };
      cache.set(cacheKeys.userByEmail("bob@test.com"), mockUser, 60000);

      const result = cache.get(cacheKeys.userByEmail("bob@test.com"));
      expect(result).toEqual(mockUser);
    });

    it("should normalize email keys to lowercase", () => {
      const mockUser = { id: "cached-user-3", name: "Charlie", email: "charlie@test.com" };

      // Set with lowercase key
      cache.set(cacheKeys.userByEmail("charlie@test.com"), mockUser, 60000);

      // Key builder normalizes uppercase to lowercase
      const key = cacheKeys.userByEmail("CHARLIE@TEST.COM");
      expect(key).toBe("user:email:charlie@test.com");

      // Should find the same entry
      const result = cache.get(key);
      expect(result).toEqual(mockUser);
    });

    it("should return undefined when email not in cache", () => {
      const result = cache.get(cacheKeys.userByEmail("missing@test.com"));
      expect(result).toBeUndefined();
    });
  });

  describe("Team members cache key behavior", () => {
    it("should cache and retrieve team members", () => {
      const members = [{ id: "user-1" }, { id: "user-2" }];
      cache.set(cacheKeys.teamMembers("team-123"), members, 60000);

      const result = cache.get(cacheKeys.teamMembers("team-123"));
      expect(result).toEqual(members);
    });
  });

  describe("Card recipients cache key behavior", () => {
    it("should cache and retrieve card recipients", () => {
      const recipients = ["user-a", "user-b", "user-c"];
      cache.set(cacheKeys.cardRecipients("card-456"), recipients, 60000);

      const result = cache.get(cacheKeys.cardRecipients("card-456"));
      expect(result).toEqual(recipients);
    });
  });
});
