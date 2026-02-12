/**
 * Tezit Inbound Poller
 *
 * Polls the Tezit Relay for new messages at a configurable interval.
 * When new tezits arrive, they are forwarded to OpenClaw as inbound messages
 * via the channel's onMessage callback.
 *
 * Design: No WebSocket support in relay — polling only.
 * Default interval: 10s (configurable). Backs off on errors.
 */

import type { RelayClient, TezRecord } from "./relay-client.js";

export interface PollerConfig {
  /** Poll interval in milliseconds (default: 10000) */
  intervalMs?: number;
  /** Max back-off interval on errors (default: 60000) */
  maxBackoffMs?: number;
  /** Team ID to poll */
  teamId: string;
  /** User ID of the PA owner — filter out own messages */
  userId: string;
}

export type InboundHandler = (tez: TezRecord) => void | Promise<void>;

/**
 * Polls the relay stream for new tezits and dispatches them.
 */
export class TezitPoller {
  private client: RelayClient;
  private config: Required<PollerConfig>;
  private handler: InboundHandler;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastSeenTimestamp: string | null = null;
  private consecutiveErrors = 0;
  private seenIds = new Set<string>();

  constructor(client: RelayClient, config: PollerConfig, handler: InboundHandler) {
    this.client = client;
    this.config = {
      intervalMs: config.intervalMs ?? 10_000,
      maxBackoffMs: config.maxBackoffMs ?? 60_000,
      teamId: config.teamId,
      userId: config.userId,
    };
    this.handler = handler;
  }

  /** Start polling. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(0); // first poll immediately
  }

  /** Stop polling. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Whether the poller is currently active. */
  get isRunning(): boolean {
    return this.running;
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const { data: items } = await this.client.getStream(this.config.teamId, {
        limit: 50,
      });

      // Filter: only new tezits we haven't seen, not from ourselves
      const newItems = items.filter((t) => {
        if (this.seenIds.has(t.id)) return false;
        if (t.senderUserId === this.config.userId) return false;
        if (this.lastSeenTimestamp && t.createdAt <= this.lastSeenTimestamp) return false;
        return true;
      });

      // Process newest-first (items come desc by createdAt), but dispatch oldest-first
      const sorted = newItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      for (const tez of sorted) {
        try {
          await this.handler(tez);
        } catch (err) {
          // Log but continue processing other messages
          console.error(`[tezit-poller] Error handling tez ${tez.id}:`, err);
        }
        this.seenIds.add(tez.id);
      }

      // Update watermark
      if (items.length > 0) {
        const newest = items.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
        this.lastSeenTimestamp = newest.createdAt;
      }

      // Trim seenIds to prevent unbounded growth (keep last 500)
      if (this.seenIds.size > 500) {
        const arr = Array.from(this.seenIds);
        this.seenIds = new Set(arr.slice(arr.length - 300));
      }

      this.consecutiveErrors = 0;
      this.scheduleNext(this.config.intervalMs);
    } catch (err) {
      this.consecutiveErrors++;
      const backoff = Math.min(
        this.config.intervalMs * Math.pow(2, this.consecutiveErrors),
        this.config.maxBackoffMs,
      );
      console.error(`[tezit-poller] Poll error (retry in ${backoff}ms):`, err);
      this.scheduleNext(backoff);
    }
  }
}
