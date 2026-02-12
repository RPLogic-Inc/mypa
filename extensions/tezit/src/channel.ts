/**
 * Tezit Channel Plugin for OpenClaw Gateway
 *
 * Registers "tezit" as a native messaging channel. When OpenClaw loads this
 * plugin, tezit appears in the Dashboard Channels section.
 *
 * Outbound: Agent calls sendText → POST /tez/share to relay
 * Inbound:  Poller fetches new tezits from relay → injects into chat session
 *
 * Configuration lives in openclaw.json under channels.tezit:
 *   {
 *     "channels": {
 *       "tezit": {
 *         "enabled": true,
 *         "relayUrl": "http://localhost:3002",
 *         "jwtToken": "<service-jwt>",
 *         "teamId": "<default-team-uuid>",
 *         "userId": "<pa-owner-uuid>",
 *         "displayName": "My PA",
 *         "pollIntervalMs": 10000
 *       }
 *     }
 *   }
 */

import { RelayClient } from "./relay-client.js";
import { TezitPoller } from "./poller.js";
import type { TezRecord } from "./relay-client.js";

// ── Types for OpenClaw Plugin API ─────────────────────────────────────
// These mirror the Gateway's plugin contract. OpenClaw loads .ts files
// directly via jiti, so no compilation step is needed.

interface ChannelMeta {
  id: string;
  label: string;
  selectionLabel: string;
  docsPath?: string;
  blurb: string;
  aliases?: string[];
}

interface ChannelCapabilities {
  chatTypes: Array<"direct" | "group" | "thread">;
}

interface SendTextArgs {
  text: string;
  conversationId?: string;
  threadId?: string;
}

interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

interface ChannelPlugin {
  id: string;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  config: {
    listAccountIds: (cfg: any) => string[];
    resolveAccount: (cfg: any, accountId?: string) => any;
  };
  outbound: {
    deliveryMode: "direct";
    sendText: (args: SendTextArgs) => Promise<SendResult>;
    sendMedia?: (args: any) => Promise<SendResult>;
  };
  setup?: (api: any) => Promise<void>;
  teardown?: () => Promise<void>;
}

interface PluginAPI {
  registerChannel: (opts: { plugin: ChannelPlugin }) => void;
  onMessage?: (msg: { channelId: string; text: string; senderId: string; conversationId?: string; threadId?: string; metadata?: Record<string, unknown> }) => void;
}

// ── Plugin State ──────────────────────────────────────────────────────

let relayClient: RelayClient | null = null;
let poller: TezitPoller | null = null;
let pluginApi: PluginAPI | null = null;
let channelConfig: any = null;

// ── Channel Plugin Definition ─────────────────────────────────────────

function createPlugin(): ChannelPlugin {
  return {
    id: "tezit",

    meta: {
      id: "tezit",
      label: "Tezit",
      selectionLabel: "Tezit (Native PA-to-PA)",
      blurb: "Native Tez messaging via the Tezit Relay. Full context iceberg preserved.",
      aliases: ["tez"],
    },

    capabilities: {
      chatTypes: ["direct", "group", "thread"],
    },

    config: {
      listAccountIds(cfg: any): string[] {
        const tezitCfg = cfg?.channels?.tezit;
        if (!tezitCfg) return [];
        if (tezitCfg.accounts) return Object.keys(tezitCfg.accounts);
        // Single-account mode
        return tezitCfg.enabled !== false ? ["default"] : [];
      },

      resolveAccount(cfg: any, accountId?: string): any {
        const tezitCfg = cfg?.channels?.tezit;
        if (!tezitCfg) return {};
        if (tezitCfg.accounts) {
          return tezitCfg.accounts[accountId ?? "default"] ?? {};
        }
        return tezitCfg;
      },
    },

    outbound: {
      deliveryMode: "direct",

      async sendText(args: SendTextArgs): Promise<SendResult> {
        if (!relayClient || !channelConfig) {
          return { ok: false, error: "Tezit channel not initialized" };
        }

        try {
          const result = await relayClient.shareTez({
            teamId: channelConfig.teamId,
            surfaceText: args.text,
            type: "note",
            urgency: "normal",
            visibility: args.conversationId ? "dm" : "team",
            recipients: args.conversationId ? [args.conversationId] : [],
          });

          return {
            ok: true,
            messageId: result.data.id,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[tezit-channel] sendText error:", message);
          return { ok: false, error: message };
        }
      },
    },

    async setup(api: any): Promise<void> {
      pluginApi = api;

      // Resolve config from the gateway's configuration
      const cfg = this.config.resolveAccount(api.config, "default");
      channelConfig = cfg;

      if (!cfg.relayUrl || !cfg.jwtToken || !cfg.teamId || !cfg.userId) {
        console.warn(
          "[tezit-channel] Missing required config. Need: relayUrl, jwtToken, teamId, userId",
        );
        return;
      }

      // Initialize relay client
      relayClient = new RelayClient({
        relayUrl: cfg.relayUrl,
        jwtToken: cfg.jwtToken,
        teamId: cfg.teamId,
        userId: cfg.userId,
      });

      // Register contact on startup
      try {
        await relayClient.registerContact({
          displayName: cfg.displayName || "PA Agent",
          email: cfg.email,
        });
        console.log("[tezit-channel] Contact registered with relay");
      } catch (err) {
        console.warn("[tezit-channel] Contact registration failed:", err);
      }

      // Verify relay health
      try {
        const health = await relayClient.health();
        console.log(`[tezit-channel] Relay connected: ${health.service} v${health.version}`);
      } catch (err) {
        console.warn("[tezit-channel] Relay health check failed:", err);
      }

      // Start inbound poller
      poller = new TezitPoller(
        relayClient,
        {
          teamId: cfg.teamId,
          userId: cfg.userId,
          intervalMs: cfg.pollIntervalMs ?? 10_000,
        },
        (tez: TezRecord) => handleInbound(tez),
      );
      poller.start();
      console.log(
        `[tezit-channel] Inbound poller started (interval: ${cfg.pollIntervalMs ?? 10_000}ms)`,
      );
    },

    async teardown(): Promise<void> {
      if (poller) {
        poller.stop();
        poller = null;
        console.log("[tezit-channel] Inbound poller stopped");
      }
      relayClient = null;
      channelConfig = null;
    },
  };
}

// ── Inbound Message Handler ───────────────────────────────────────────

function handleInbound(tez: TezRecord): void {
  if (!pluginApi?.onMessage) {
    console.warn("[tezit-channel] No onMessage handler registered");
    return;
  }

  pluginApi.onMessage({
    channelId: "tezit",
    text: tez.surfaceText,
    senderId: tez.senderUserId,
    conversationId: tez.teamId ?? undefined,
    threadId: tez.threadId ?? undefined,
    metadata: {
      tezId: tez.id,
      type: tez.type,
      urgency: tez.urgency,
      visibility: tez.visibility,
      parentTezId: tez.parentTezId,
    },
  });
}

// ── Plugin Registration (Entry Point) ─────────────────────────────────

/**
 * OpenClaw calls this function to register the channel.
 * This is the single export that the Gateway looks for.
 */
export default function register(api: PluginAPI): void {
  const plugin = createPlugin();
  api.registerChannel({ plugin });
  console.log("[tezit-channel] Tezit channel plugin registered");
}
