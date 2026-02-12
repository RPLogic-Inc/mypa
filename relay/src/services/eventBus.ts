/**
 * Event Bus — in-process pub/sub for real-time SSE notifications.
 *
 * Pattern: eventBus.emit(`user:<userId>`, { type, data })
 * SSE clients subscribe to their own `user:<userId>` channel.
 *
 * This is a single-process EventEmitter.  If the relay ever moves to
 * multi-process (cluster / horizontal), replace with Redis pub/sub.
 */

import { EventEmitter } from "node:events";

export interface SSEEvent {
  type: "new_tez" | "tez_updated" | "new_reply" | "unread_update" | "new_message";
  data: Record<string, unknown>;
}

export const eventBus = new EventEmitter();

// Support many concurrent SSE connections without noisy warnings
eventBus.setMaxListeners(1000);
