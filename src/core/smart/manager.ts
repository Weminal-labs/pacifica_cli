// ---------------------------------------------------------------------------
// Smart Order Manager
// ---------------------------------------------------------------------------
// Background polling loop that monitors positions and triggers smart orders.
// Persists state to ~/.pacifica/smart-orders.json for resume on restart.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SmartOrder, SmartOrderState, TrailingStopConfig, PartialTpConfig } from "./types.js";
import type { PacificaClient } from "../sdk/client.js";
import type { Market, Position } from "../sdk/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = join(homedir(), ".pacifica");
const STATE_FILE = join(STATE_DIR, "smart-orders.json");
const DEFAULT_POLL_MS = 5_000;
const BACKOFF_POLL_MS = 15_000;

// ---------------------------------------------------------------------------
// SmartOrderManager
// ---------------------------------------------------------------------------

export class SmartOrderManager {
  private orders: SmartOrder[] = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private pollIntervalMs = DEFAULT_POLL_MS;
  private running = false;

  constructor(private readonly client: PacificaClient) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Load persisted state from disk. */
  load(): void {
    if (!existsSync(STATE_FILE)) {
      this.orders = [];
      return;
    }

    try {
      const raw = readFileSync(STATE_FILE, "utf-8");
      const state = JSON.parse(raw) as SmartOrderState;
      // Only restore active orders
      this.orders = (state.orders ?? []).filter((o) => o.status === "active");
    } catch {
      this.orders = [];
    }
  }

  /** Save current state to disk. */
  save(): void {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }

    const state: SmartOrderState = {
      orders: this.orders,
      lastUpdated: new Date().toISOString(),
    };

    const tmpPath = STATE_FILE + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmpPath, STATE_FILE);
  }

  /** Start the background polling loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollIntervalMs = DEFAULT_POLL_MS;
    this.schedulePoll();
  }

  /** Stop the polling loop. */
  stop(): void {
    this.running = false;
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** Check if the manager is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Smart order CRUD
  // -------------------------------------------------------------------------

  /** Add a trailing stop smart order. */
  addTrailingStop(config: TrailingStopConfig): SmartOrder {
    const now = new Date().toISOString();
    const order: SmartOrder = {
      id: randomUUID(),
      type: "trailing_stop",
      status: "active",
      symbol: config.symbol.toUpperCase(),
      positionSide: config.positionSide,
      createdAt: now,
      updatedAt: now,
      distancePercent: config.distancePercent,
      extremePrice: 0, // Will be set on first poll
      triggerPrice: 0,
    };

    this.orders.push(order);
    this.save();
    return order;
  }

  /** Add a partial take-profit smart order. */
  addPartialTp(config: PartialTpConfig): SmartOrder {
    const now = new Date().toISOString();
    const order: SmartOrder = {
      id: randomUUID(),
      type: "partial_tp",
      status: "active",
      symbol: config.symbol.toUpperCase(),
      positionSide: config.positionSide,
      createdAt: now,
      updatedAt: now,
      distancePercent: 0,
      extremePrice: 0,
      triggerPrice: 0,
      levels: config.levels.map((l) => ({ ...l, triggered: false })),
    };

    this.orders.push(order);
    this.save();
    return order;
  }

  /** Cancel a smart order by ID. */
  cancel(id: string): SmartOrder | undefined {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.status !== "active") return undefined;

    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();
    this.save();
    return order;
  }

  /** Get all smart orders, optionally filtered. */
  getOrders(filter?: { status?: string; symbol?: string }): SmartOrder[] {
    let result = [...this.orders];
    if (filter?.status) {
      result = result.filter((o) => o.status === filter.status);
    }
    if (filter?.symbol) {
      const upper = filter.symbol.toUpperCase();
      result = result.filter((o) => o.symbol === upper);
    }
    return result;
  }

  /** Get a single smart order by ID. */
  getOrder(id: string): SmartOrder | undefined {
    return this.orders.find((o) => o.id === id);
  }

  /** Get count of active orders. */
  getActiveCount(): number {
    return this.orders.filter((o) => o.status === "active").length;
  }

  // -------------------------------------------------------------------------
  // Poll loop
  // -------------------------------------------------------------------------

  private schedulePoll(): void {
    if (!this.running) return;

    this.pollTimer = setTimeout(async () => {
      await this.pollOnce();
      this.schedulePoll();
    }, this.pollIntervalMs);

    // Allow Node to exit even if timer is pending
    if (this.pollTimer && typeof this.pollTimer === "object" && "unref" in this.pollTimer) {
      this.pollTimer.unref();
    }
  }

  /** Execute one poll cycle: check all active orders against current prices. */
  async pollOnce(): Promise<SmartOrder[]> {
    const activeOrders = this.orders.filter((o) => o.status === "active");
    if (activeOrders.length === 0) return [];

    try {
      // Fetch positions and market data
      const [positions, markets] = await Promise.all([
        this.client.getPositions(),
        this.client.getMarkets(),
      ]);

      this.pollIntervalMs = DEFAULT_POLL_MS; // Reset backoff on success

      const triggered: SmartOrder[] = [];

      for (const order of activeOrders) {
        const result = await this.processOrder(order, positions, markets);
        if (result === "triggered") {
          triggered.push(order);
        }
      }

      if (triggered.length > 0) {
        this.save();
      }

      return triggered;
    } catch {
      // Rate-limited or network error: back off
      this.pollIntervalMs = BACKOFF_POLL_MS;
      return [];
    }
  }

  /** Process a single active order against current market state. */
  private async processOrder(
    order: SmartOrder,
    positions: Position[],
    markets: Market[],
  ): Promise<"ok" | "triggered" | "cancelled"> {
    // Check if position still exists
    const position = positions.find(
      (p) => p.symbol.toUpperCase() === order.symbol && p.side === order.positionSide,
    );

    if (!position) {
      // Position closed externally
      order.status = "cancelled";
      order.updatedAt = new Date().toISOString();
      order.errorMessage = "Position closed externally";
      return "cancelled";
    }

    // Get current mark price
    const market = markets.find((m) => m.symbol.toUpperCase() === order.symbol);
    if (!market) return "ok";

    const markPrice = market.markPrice;

    if (order.type === "trailing_stop") {
      return this.processTrailingStop(order, markPrice);
    }

    if (order.type === "partial_tp") {
      return this.processPartialTp(order, position, markPrice);
    }

    return "ok";
  }

  /** Process trailing stop logic. */
  private async processTrailingStop(
    order: SmartOrder,
    markPrice: number,
  ): Promise<"ok" | "triggered"> {
    const now = new Date().toISOString();

    // Initialize extreme price on first poll
    if (order.extremePrice === 0) {
      order.extremePrice = markPrice;
    }

    if (order.positionSide === "long") {
      // Track highest price
      if (markPrice > order.extremePrice) {
        order.extremePrice = markPrice;
        order.updatedAt = now;
      }

      // Calculate trigger: extreme drops by distance%
      order.triggerPrice = order.extremePrice * (1 - order.distancePercent / 100);

      // Check if triggered
      if (markPrice <= order.triggerPrice) {
        return this.triggerClose(order);
      }
    } else {
      // Short: track lowest price
      if (markPrice < order.extremePrice) {
        order.extremePrice = markPrice;
        order.updatedAt = now;
      }

      // Calculate trigger: extreme rises by distance%
      order.triggerPrice = order.extremePrice * (1 + order.distancePercent / 100);

      // Check if triggered
      if (markPrice >= order.triggerPrice) {
        return this.triggerClose(order);
      }
    }

    return "ok";
  }

  /** Process partial take-profit logic. */
  private async processPartialTp(
    order: SmartOrder,
    position: Position,
    markPrice: number,
  ): Promise<"ok" | "triggered"> {
    if (!order.levels) return "ok";

    const now = new Date().toISOString();
    let anyTriggered = false;

    for (const level of order.levels) {
      if (level.triggered) continue;

      const shouldTrigger =
        order.positionSide === "long"
          ? markPrice >= level.price
          : markPrice <= level.price;

      if (!shouldTrigger) continue;

      // Calculate close amount
      const closeAmount = position.amount * (level.percent / 100);
      if (closeAmount <= 0) continue;

      try {
        const closeSide = order.positionSide === "long" ? "ask" : "bid";
        await this.client.placeMarketOrder({
          symbol: order.symbol,
          amount: String(closeAmount),
          side: closeSide,
          slippage_percent: "1",
          reduce_only: true,
        });

        level.triggered = true;
        anyTriggered = true;
        order.updatedAt = now;
      } catch {
        // Skip this level on error, try again next poll
      }
    }

    // Check if all levels are triggered
    const allTriggered = order.levels.every((l) => l.triggered);
    if (allTriggered) {
      order.status = "triggered";
      order.triggeredAt = now;
      order.updatedAt = now;
      this.save();
      return "triggered";
    }

    if (anyTriggered) {
      this.save();
    }

    return "ok";
  }

  /** Execute position close when a smart order triggers. */
  private async triggerClose(order: SmartOrder): Promise<"triggered"> {
    const now = new Date().toISOString();

    try {
      const closeSide = order.positionSide === "long" ? "ask" : "bid";

      // Get current position to know the size
      const positions = await this.client.getPositions();
      const position = positions.find(
        (p) => p.symbol.toUpperCase() === order.symbol && p.side === order.positionSide,
      );

      if (!position) {
        order.status = "cancelled";
        order.updatedAt = now;
        order.errorMessage = "Position already closed";
        return "triggered";
      }

      await this.client.placeMarketOrder({
        symbol: order.symbol,
        amount: String(position.amount),
        side: closeSide,
        slippage_percent: "1",
        reduce_only: true,
      });

      order.status = "triggered";
      order.triggeredAt = now;
      order.updatedAt = now;
    } catch (err) {
      order.status = "error";
      order.updatedAt = now;
      order.errorMessage = err instanceof Error ? err.message : String(err);
    }

    this.save();
    return "triggered";
  }
}

