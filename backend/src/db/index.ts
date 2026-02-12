import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "./schema.js";
import { APP_SLUG } from "../config/app.js";

// Lazy initialization: env vars must be read at call time, not import time,
// because dotenv config() runs after ES module imports are evaluated.
let _client: Client | null = null;
function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.DATABASE_URL || `file:./${APP_SLUG}.db`,
    });
    // Enable WAL mode for better concurrent read performance
    _client.execute("PRAGMA journal_mode = WAL");
    _client.execute("PRAGMA busy_timeout = 5000");
    _client.execute("PRAGMA foreign_keys = ON");
  }
  return _client;
}

type DbType = ReturnType<typeof drizzle<typeof schema>>;
let _db: DbType | null = null;
function getDb(): DbType {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

// Proxy-based lazy db: looks like a direct drizzle instance but defers creation
export const db: DbType = new Proxy({} as DbType, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

// Export getClient for raw SQL access (FTS5, etc.)
export { getClient };

export * from "./schema.js";
