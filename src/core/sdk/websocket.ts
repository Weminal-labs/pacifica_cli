// ---------------------------------------------------------------------------
// Pacifica DEX SDK -- WebSocket Client
// ---------------------------------------------------------------------------

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type {
  WsPriceUpdate,
  WsPositionUpdate,
  WsOrderUpdate,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WebSocketConfig {
  network: "testnet" | "mainnet";
  account?: string; // Wallet address for account-level subscriptions
}

const WS_URLS = {
  testnet: "wss://test-ws.pacifica.fi/ws",
  mainnet: "wss://ws.pacifica.fi/ws",
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Subscription tracking
// ---------------------------------------------------------------------------

/** Serialised subscription for tracking and replay on reconnect. */
interface Subscription {
  source: string;
  params: Record<string, unknown>;
}

function subscriptionKey(sub: Subscription): string {
  // Deterministic key: source + sorted params.
  const sortedParams = Object.keys(sub.params)
    .sort()
    .map((k) => `${k}=${String(sub.params[k])}`)
    .join("&");
  return `${sub.source}|${sortedParams}`;
}

// ---------------------------------------------------------------------------
// Typed event map
// ---------------------------------------------------------------------------

export interface PacificaWebSocketEvents {
  prices: [data: WsPriceUpdate[]];
  book: [data: { symbol: string; bids: unknown[]; asks: unknown[]; timestamp: number }];
  trade: [data: Record<string, unknown>];
  position: [data: WsPositionUpdate];
  order: [data: WsOrderUpdate];
  connected: [];
  disconnected: [reason: string];
  reconnecting: [attempt: number];
  error: [error: Error];
}

// ---------------------------------------------------------------------------
// PacificaWebSocket
// ---------------------------------------------------------------------------

export class PacificaWebSocket extends EventEmitter {
  private readonly wsUrl: string;
  private readonly account?: string;

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private pongTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private reconnectAttempt = 0;
  private intentionalClose = false;

  /** Active subscriptions, keyed for dedup. Replayed on reconnect. */
  private readonly subscriptions = new Map<string, Subscription>();

  constructor(config: WebSocketConfig) {
    super();
    this.wsUrl = WS_URLS[config.network];
    this.account = config.account;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Open a WebSocket connection. Resolves once the connection is established.
   * Rejects if the initial connection fails.
   */
  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.intentionalClose = false;
      this.ws = new WebSocket(this.wsUrl);

      const onOpen = (): void => {
        cleanup();
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        this.resubscribeAll();
        this.emit("connected");
        resolve();
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      const onClose = (): void => {
        cleanup();
        reject(new Error("WebSocket closed before opening"));
      };

      const cleanup = (): void => {
        this.ws?.removeListener("open", onOpen);
        this.ws?.removeListener("error", onError);
        this.ws?.removeListener("close", onClose);
        // Attach persistent listeners after initial connection.
        this.attachListeners();
      };

      this.ws.once("open", onOpen);
      this.ws.once("error", onError);
      this.ws.once("close", onClose);
    });
  }

  /**
   * Cleanly close the WebSocket connection. No reconnect will be attempted.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      // Remove all listeners to avoid firing events after intentional close.
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }
  }

  /**
   * Returns true if the WebSocket is currently open.
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // -----------------------------------------------------------------------
  // Public subscription methods
  // -----------------------------------------------------------------------

  /**
   * Subscribe to all-market price updates.
   */
  subscribePrices(): void {
    this.subscribe("prices", {});
  }

  /**
   * Subscribe to order book updates for a symbol.
   */
  subscribeBook(symbol: string, aggLevel?: number): void {
    const params: Record<string, unknown> = { symbol };
    if (aggLevel !== undefined) {
      params.agg_level = aggLevel;
    }
    this.subscribe("book", params);
  }

  /**
   * Subscribe to trade updates for a symbol.
   */
  subscribeTrades(symbol: string): void {
    this.subscribe("trades", { symbol });
  }

  /**
   * Subscribe to position updates for the configured account.
   */
  subscribeAccountPositions(): void {
    const account = this.requireAccount();
    this.subscribe("account_positions", { account });
  }

  /**
   * Subscribe to order updates for the configured account.
   */
  subscribeAccountOrders(): void {
    const account = this.requireAccount();
    this.subscribe("account_order_updates", { account });
  }

  /**
   * Subscribe to trade fills for the configured account.
   */
  subscribeAccountTrades(): void {
    const account = this.requireAccount();
    this.subscribe("account_trades", { account });
  }

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(source: string, params?: Record<string, unknown>): void {
    const fullParams = params ?? {};
    const sub: Subscription = { source, params: fullParams };
    const key = subscriptionKey(sub);
    this.subscriptions.delete(key);

    this.send({
      method: "unsubscribe",
      params: { source, ...fullParams },
    });
  }

  // -----------------------------------------------------------------------
  // Private: subscription management
  // -----------------------------------------------------------------------

  private subscribe(source: string, params: Record<string, unknown>): void {
    const sub: Subscription = { source, params };
    const key = subscriptionKey(sub);
    this.subscriptions.set(key, sub);

    this.send({
      method: "subscribe",
      params: { source, ...params },
    });
  }

  /**
   * Replay all tracked subscriptions. Called after a reconnect.
   */
  private resubscribeAll(): void {
    for (const sub of this.subscriptions.values()) {
      this.send({
        method: "subscribe",
        params: { source: sub.source, ...sub.params },
      });
    }
  }

  // -----------------------------------------------------------------------
  // Private: message sending
  // -----------------------------------------------------------------------

  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Silently drop -- subscriptions will be replayed on reconnect.
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      this.emit(
        "error",
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: message handling
  // -----------------------------------------------------------------------

  private attachListeners(): void {
    if (!this.ws) return;

    this.ws.on("message", (raw: WebSocket.RawData) => {
      this.handleMessage(raw);
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      const reasonStr = reason.toString("utf-8") || `code=${code}`;
      this.stopHeartbeat();
      this.emit("disconnected", reasonStr);

      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: Record<string, unknown>;

    try {
      let text: string;
      if (typeof raw === "string") {
        text = raw;
      } else if (Buffer.isBuffer(raw)) {
        text = raw.toString("utf-8");
      } else if (raw instanceof ArrayBuffer) {
        text = Buffer.from(raw).toString("utf-8");
      } else {
        // Buffer[] -- concatenate before decoding.
        text = Buffer.concat(raw).toString("utf-8");
      }
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Malformed message -- skip without crashing.
      return;
    }

    const channel = parsed.channel as string | undefined;

    if (!channel) {
      // Could be a subscription confirmation or an error -- skip silently.
      return;
    }

    // Heartbeat pong.
    if (channel === "pong") {
      this.handlePong();
      return;
    }

    // Route by channel name.
    const data = parsed.data;

    switch (channel) {
      case "prices":
        if (Array.isArray(data)) {
          this.emit("prices", data as WsPriceUpdate[]);
        }
        break;

      case "book":
        if (data && typeof data === "object") {
          this.emit("book", this.parseBookUpdate(data as Record<string, unknown>));
        }
        break;

      case "trades":
        if (data && typeof data === "object") {
          this.emit("trade", data as Record<string, unknown>);
        }
        break;

      case "account_positions":
        if (data && typeof data === "object") {
          this.emit("position", data as WsPositionUpdate);
        }
        break;

      case "account_order_updates":
        if (data && typeof data === "object") {
          this.emit("order", data as WsOrderUpdate);
        }
        break;

      case "account_trades":
        if (data && typeof data === "object") {
          this.emit("trade", data as Record<string, unknown>);
        }
        break;

      default:
        // Unknown channel -- ignore gracefully.
        break;
    }
  }

  /**
   * Parse a raw book WS update into the shape emitted to listeners.
   */
  private parseBookUpdate(raw: Record<string, unknown>): {
    symbol: string;
    bids: unknown[];
    asks: unknown[];
    timestamp: number;
  } {
    const levels = raw.l as [unknown[], unknown[]] | undefined;
    return {
      symbol: (raw.s as string) ?? "",
      bids: levels?.[0] ?? [],
      asks: levels?.[1] ?? [],
      timestamp: (raw.t as number) ?? 0,
    };
  }

  // -----------------------------------------------------------------------
  // Private: heartbeat
  // -----------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, HEARTBEAT_INTERVAL_MS);

    // Allow the process to exit despite the interval.
    if (this.heartbeatTimer && typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
      this.heartbeatTimer.unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    this.clearPongTimer();
  }

  private sendPing(): void {
    this.send({ method: "ping" });

    // Start the pong timeout.
    this.clearPongTimer();
    this.pongTimer = setTimeout(() => {
      // No pong received in time -- force close and reconnect.
      this.emit("error", new Error("Heartbeat pong timeout"));
      if (this.ws) {
        this.ws.close(4000, "Pong timeout");
      }
    }, PONG_TIMEOUT_MS);

    if (this.pongTimer && typeof this.pongTimer === "object" && "unref" in this.pongTimer) {
      this.pongTimer.unref();
    }
  }

  private handlePong(): void {
    this.clearPongTimer();
  }

  private clearPongTimer(): void {
    if (this.pongTimer !== undefined) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Private: reconnection
  // -----------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.emit(
        "error",
        new Error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`),
      );
      return;
    }

    this.reconnectAttempt++;
    this.emit("reconnecting", this.reconnectAttempt);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s.
    const delayMs = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt - 1),
      RECONNECT_MAX_MS,
    );

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.performReconnect();
    }, delayMs);

    if (this.reconnectTimer && typeof this.reconnectTimer === "object" && "unref" in this.reconnectTimer) {
      this.reconnectTimer.unref();
    }
  }

  private performReconnect(): void {
    // Clean up old socket if still lingering.
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.close();
      } catch {
        // Best-effort cleanup.
      }
      this.ws = null;
    }

    this.connect().catch((err) => {
      this.emit(
        "error",
        err instanceof Error ? err : new Error(String(err)),
      );

      // Schedule next attempt unless we've given up.
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Private: validation
  // -----------------------------------------------------------------------

  private requireAccount(): string {
    if (!this.account) {
      throw new Error(
        "This subscription requires an account address. " +
        "Provide 'account' in the WebSocketConfig constructor.",
      );
    }
    return this.account;
  }
}
