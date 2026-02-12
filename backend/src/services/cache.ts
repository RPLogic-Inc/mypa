/**
 * Simple in-memory cache with TTL support
 * For production, replace with Redis for multi-server support
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set a value in the cache with TTL (in milliseconds)
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Delete a value from the cache
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete all values matching a pattern (prefix)
   */
  deletePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Singleton instance
export const cache = new Cache();

// Cache key builders for consistency
export const cacheKeys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  teamMembers: (teamId: string) => `team:${teamId}:members`,
  cardRecipients: (cardId: string) => `card:${cardId}:recipients`,
};

// Default TTLs (in milliseconds)
export const cacheTTL = {
  user: 5 * 60 * 1000,           // 5 minutes
  teamMembers: 5 * 60 * 1000,    // 5 minutes
  cardRecipients: 2 * 60 * 1000, // 2 minutes
};

/**
 * Cached user lookup
 */
import { db, users } from "../db/index.js";
import { eq } from "drizzle-orm";

export async function getCachedUser(userId: string) {
  const cacheKey = cacheKeys.user(userId);

  // Check cache first
  const cached = cache.get<typeof users.$inferSelect>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from database
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = result[0];
  if (user) {
    cache.set(cacheKey, user, cacheTTL.user);
  }

  return user || null;
}

/**
 * Cached user lookup by email
 */
export async function getCachedUserByEmail(email: string) {
  const cacheKey = cacheKeys.userByEmail(email);

  // Check cache first
  const cached = cache.get<typeof users.$inferSelect>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from database
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  const user = result[0];
  if (user) {
    cache.set(cacheKey, user, cacheTTL.user);
    // Also cache by ID
    cache.set(cacheKeys.user(user.id), user, cacheTTL.user);
  }

  return user || null;
}

/**
 * Invalidate user cache when user is updated
 */
export function invalidateUserCache(userId: string, email?: string): void {
  cache.delete(cacheKeys.user(userId));
  if (email) {
    cache.delete(cacheKeys.userByEmail(email));
  }
}

/**
 * Invalidate all caches related to a team
 */
export function invalidateTeamCache(teamId: string): void {
  cache.delete(cacheKeys.teamMembers(teamId));
}
