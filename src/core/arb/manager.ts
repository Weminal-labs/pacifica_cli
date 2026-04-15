// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Funding Rate Arbitrage Manager
// ---------------------------------------------------------------------------
// Background polling loop that scans for opportunities, enters positions,
// monitors settlements, and exits. State persisted to ~/.pacifica/arb-state.json.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { PacificaClient } from "../sdk/client.js";
import type { ArbConfig } from "../config/types.js";
import type { ArbPosition, ArbState, ArbLifetimeStats, ArbOpportunity } from "./types.js";
import { detectOpportunities, scanAllMarkets } from "./scanner.js";
import type { MarketScanContext } from "./scanner.js";
import { fetchAllExternalRates } from "./external.js";
import { enterPosition, exitPosition, isFeeRatioAcceptable } from "./executor.js";
import {
  calculateNetPnl,
  checkDailyLossLimit,
  recordDailyLoss,
  rebuildLifetimeStats,
} from "./pnl.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = join(homedir(), ".pacifica");
const STATE_FILE = join(STATE_DIR, "arb-state.json");
const DEFAULT_POLL_MS = 5_000;
const BACKOFF_POLL_MS = 15_000;

const EMPTY_LIFETIME: ArbLifetimeStats = {
  totalFundingCollectedUsd: 0,
  totalFeesPaidUsd: 0,
  totalNetPnlUsd: 0,
  positionsOpened: 0,
  positionsClosed: 0,
  dailyLossUsd: 0,
  dailyLossResetDate: new Date().toISOString().slice(0, 10),
};

// ---------------------------------------------------------------------------
// ArbManager
// ---------------------------------------------------------------------------

export class ArbManager {
  private positions: ArbPosition[] = [];
  private lifetime: ArbLifetimeStats = { ...EMPTY_LIFETIME };
  private lastScanAt?: string;

  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private pollIntervalMs = DEFAULT_POLL_MS;
  private running = false;
  private pollCount = 0;

  /** Per-market cooldown: symbol → ISO timestamp until next allowed entry */
  private readonly cooldowns = new Map<string, number>();

  constructor(
    private readonly client: PacificaClient,
    private readonly config: ArbConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  load(): void {
    if (!existsSync(STATE_FILE)) {
      this.positions = [];
      this.lifetime = { ...EMPTY_LIFETIME };
      return;
    }

    try {
      const raw = readFileSync(STATE_FILE, "utf-8");
      const state = JSON.parse(raw) as ArbState;
      this.positions = state.positions ?? [];
      this.lifetime = state.lifetime ?? { ...EMPTY_LIFETIME };
      this.lastScanAt = state.lastScanAt;
    } catch {
      this.positions = [];
      this.lifetime = { ...EMPTY_LIFETIME };
    }
  }

  save(): void {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }

    const state: ArbState = {
      positions: this.positions,
      lifetime: this.lifetime,
      lastScanAt: this.lastScanAt,
      lastUpdated: new Date().toISOString(),
    };

    const tmpPath = STATE_FILE + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(tmpPath, STATE_FILE);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollIntervalMs = DEFAULT_POLL_MS;
    this.schedulePoll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Read API (for CLI and MCP)
  // -------------------------------------------------------------------------

  getPositions(filter?: { status?: string }): ArbPosition[] {
    let result = [...this.positions];
    if (filter?.status) {
      result = result.filter((p) => p.status === filter.status);
    }
    return result;
  }

  getPosition(id: string): ArbPosition | undefined {
    return this.positions.find((p) => p.id === id);
  }

  getLifetimeStats(): ArbLifetimeStats {
    return { ...this.lifetime };
  }

  getLastScanAt(): string | undefined {
    return this.lastScanAt;
  }

  getActiveCount(): number {
    return this.positions.filter(
      (p) => p.status === "active" || p.status === "pending",
    ).length;
  }

  /**
   * One-shot opportunity scan (no side effects — used by `arb scan` command).
   */
  async scanOpportunities(): Promise<ArbOpportunity[]> {
    const [markets, externalRates] = await Promise.all([
      this.client.getMarkets(),
      this.config.use_external_rates ? fetchAllExternalRates() : Promise.resolve([]),
    ]);

    const active = this.positions.filter(
      (p) => p.status === "active" || p.status === "pending",
    );
    return detectOpportunities(markets, this.config, active, externalRates);
  }

  /**
   * Full unfiltered scan — returns all eligible markets + market context.
   * Used by `arb scan` CLI for regime display and fallback rows.
   */
  async scanAllMarkets(): Promise<MarketScanContext> {
    const [markets, externalRates] = await Promise.all([
      this.client.getMarkets(),
      this.config.use_external_rates ? fetchAllExternalRates() : Promise.resolve([]),
    ]);

    const active = this.positions.filter(
      (p) => p.status === "active" || p.status === "pending",
    );
    return scanAllMarkets(markets, this.config, active, externalRates);
  }

  // -------------------------------------------------------------------------
  // Manual close (for CLI and MCP)
  // -------------------------------------------------------------------------

  async closePosition(id: string): Promise<{ success: boolean; error?: string }> {
    const position = this.positions.find((p) => p.id === id);
    if (!position) return { success: false, error: "Position not found" };
    if (position.status === "closed") return { success: false, error: "Already closed" };

    position.status = "closing";
    this.save();

    const result = await exitPosition(this.client, position);
    if (result.success) {
      position.status = "closed";
      position.closedAt = new Date().toISOString();
      position.exitReason = "manual_close";

      const netPnl = calculateNetPnl(position);
      this.lifetime.positionsClosed++;
      this.lifetime.totalFundingCollectedUsd += position.realizedFundingUsd;
      this.lifetime.totalFeesPaidUsd += position.totalFeesUsd;
      this.lifetime.totalNetPnlUsd += netPnl;

      if (netPnl < 0) {
        this.lifetime = recordDailyLoss(this.lifetime, Math.abs(netPnl));
      }
    } else {
      position.status = "error";
      position.errorMessage = result.error;
    }

    this.save();
    return result;
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

    if (
      this.pollTimer &&
      typeof this.pollTimer === "object" &&
      "unref" in this.pollTimer
    ) {
      (this.pollTimer as NodeJS.Timeout).unref();
    }
  }

  async pollOnce(): Promise<void> {
    this.pollCount++;

    try {
      // Monitor loop: check every poll
      await this.monitorActivePositions();

      // Scanner loop: every ~6 polls (30s at 5s interval)
      const scanEvery = Math.max(1, Math.round(this.config.scan_interval_ms / DEFAULT_POLL_MS));
      if (this.pollCount % scanEvery === 0) {
        await this.scanAndEnter();
      }

      this.pollIntervalMs = DEFAULT_POLL_MS;
    } catch {
      this.pollIntervalMs = BACKOFF_POLL_MS;
    }
  }

  // -------------------------------------------------------------------------
  // Monitor active positions
  // -------------------------------------------------------------------------

  private async monitorActivePositions(): Promise<void> {
    const active = this.positions.filter((p) => p.status === "active");
    if (active.length === 0) return;

    const [positions, markets] = await Promise.all([
      this.client.getPositions(),
      this.client.getMarkets(),
    ]);

    const marketMap = new Map(markets.map((m) => [m.symbol.toUpperCase(), m]));

    for (const arbPos of active) {
      const openSide = arbPos.leg.side === "bid" ? "long" : "short";
      const livePos = positions.find(
        (p) =>
          p.symbol.toUpperCase() === arbPos.symbol && p.side === openSide,
      );

      if (!livePos) {
        // Position closed externally — record full accounting
        arbPos.status = "closed";
        arbPos.closedAt = new Date().toISOString();
        arbPos.exitReason = "external_close";
        const netPnl = calculateNetPnl(arbPos);
        this.lifetime.positionsClosed++;
        this.lifetime.totalFundingCollectedUsd += arbPos.realizedFundingUsd;
        this.lifetime.totalFeesPaidUsd += arbPos.totalFeesUsd;
        this.lifetime.totalNetPnlUsd += netPnl;
        if (netPnl < 0) {
          this.lifetime = recordDailyLoss(this.lifetime, Math.abs(netPnl));
        }
        this.setCooldown(arbPos.symbol);
        continue;
      }

      // Check exit conditions with current market data
      const currentMarket = marketMap.get(arbPos.symbol);
      const exitReason = this.shouldExit(arbPos, currentMarket);
      if (exitReason) {
        await this.performExit(arbPos, exitReason);
      }
    }

    this.save();
  }

  private shouldExit(
    position: ArbPosition,
    currentMarket?: { fundingRate: number },
  ): ArbPosition["exitReason"] | null {
    const policy = this.config.exit_policy;

    // Daily loss limit always takes priority
    const { exceeded } = checkDailyLossLimit(this.lifetime, this.config.max_daily_loss_usd);
    if (exceeded) return "daily_loss_limit";

    if (policy === "settlement" && position.fundingIntervalsHeld >= 1) {
      return "settlement";
    }

    if (policy === "rate_inverted" && currentMarket) {
      // Exit when funding flipped sign since entry
      const entryPositive = position.entryRate > 0;
      const currentPositive = currentMarket.fundingRate > 0;
      if (entryPositive !== currentPositive) return "rate_inverted";
    }

    if (policy === "apr_below" && currentMarket) {
      const INTERVALS_PER_YEAR = 1095;
      const currentApr = Math.abs(currentMarket.fundingRate) * INTERVALS_PER_YEAR * 100;
      if (currentApr < this.config.exit_apr_floor) return "apr_below_floor";
    }

    return null;
  }

  private async performExit(
    position: ArbPosition,
    reason: NonNullable<ArbPosition["exitReason"]>,
  ): Promise<void> {
    position.status = "closing";
    position.exitReason = reason;
    this.save();

    const result = await exitPosition(this.client, position);

    if (result.success) {
      position.status = "closed";
      position.closedAt = new Date().toISOString();

      const netPnl = calculateNetPnl(position);
      this.lifetime.positionsClosed++;
      this.lifetime.totalFundingCollectedUsd += position.realizedFundingUsd;
      this.lifetime.totalFeesPaidUsd += position.totalFeesUsd;
      this.lifetime.totalNetPnlUsd += netPnl;

      if (netPnl < 0) {
        this.lifetime = recordDailyLoss(this.lifetime, Math.abs(netPnl));
      }

      this.setCooldown(position.symbol);
    } else {
      position.status = "error";
      position.errorMessage = result.error;
    }

    this.save();
  }

  // -------------------------------------------------------------------------
  // Scanner + entry
  // -------------------------------------------------------------------------

  private async scanAndEnter(): Promise<void> {
    // Daily loss gate
    const { exceeded, stats } = checkDailyLossLimit(
      this.lifetime,
      this.config.max_daily_loss_usd,
    );
    this.lifetime = stats;

    if (exceeded || !this.config.enabled) return;

    const [markets, externalRates] = await Promise.all([
      this.client.getMarkets(),
      this.config.use_external_rates ? fetchAllExternalRates() : Promise.resolve([]),
    ]);

    this.lastScanAt = new Date().toISOString();

    const active = this.positions.filter(
      (p) => p.status === "active" || p.status === "pending",
    );

    const opportunities = detectOpportunities(
      markets,
      this.config,
      active,
      externalRates,
    );

    for (const opportunity of opportunities) {
      if (!this.canEnter(opportunity)) continue;

      await this.openPosition(opportunity);
    }

    this.save();
  }

  // -------------------------------------------------------------------------
  // Arb-specific guardrails (T66)
  // -------------------------------------------------------------------------

  canEnter(opportunity: ArbOpportunity): boolean {
    // 1. Bot must be enabled
    if (!this.config.enabled) return false;

    // 2. Concurrent notional cap
    const activeNotional = this.positions
      .filter((p) => p.status === "active" || p.status === "pending")
      .reduce((sum, p) => sum + p.notionalUsd, 0);
    const maxNotional =
      this.config.max_concurrent_positions * this.config.position_size_usd;
    if (activeNotional + this.config.position_size_usd > maxNotional) return false;

    // 3. Per-market cooldown
    const cooldownUntil = this.cooldowns.get(opportunity.symbol) ?? 0;
    if (Date.now() < cooldownUntil) return false;

    // 4. Fee-to-funding ratio gate
    if (!isFeeRatioAcceptable(this.config.position_size_usd, opportunity.currentRate)) {
      return false;
    }

    // 5. Daily loss limit
    const { exceeded } = checkDailyLossLimit(
      this.lifetime,
      this.config.max_daily_loss_usd,
    );
    if (exceeded) return false;

    return true;
  }

  async openPosition(opportunity: ArbOpportunity): Promise<{ success: boolean; positionId?: string; error?: string }> {
    const positionId = randomUUID();
    const now = new Date().toISOString();

    // Persist as pending BEFORE placing order (idempotency)
    const pending: ArbPosition = {
      id: positionId,
      strategy: "single_sided",
      symbol: opportunity.symbol,
      status: "pending",
      leg: {
        side: opportunity.side === "short_collects" ? "ask" : "bid",
        amount: 0,
        entryPrice: opportunity.markPrice,
        clientOrderId: "", // set by executor
        fees: 0,
      },
      openedAt: now,
      entryRate: opportunity.currentRate,
      entryApr: opportunity.annualizedApr,
      notionalUsd: this.config.position_size_usd,
      fundingIntervalsHeld: 0,
      realizedFundingUsd: 0,
      realizedPnlUsd: 0,
      totalFeesUsd: 0,
    };

    this.positions.push(pending);
    this.save();

    const result = await enterPosition(this.client, opportunity, this.config);

    if (result.success && result.leg) {
      pending.status = "active";
      pending.leg = result.leg;
      pending.openedAt = new Date().toISOString();
      this.lifetime.positionsOpened++;
    } else {
      pending.status = "error";
      pending.errorMessage = result.error;
    }

    this.save();
    return result.success
      ? { success: true, positionId: positionId }
      : { success: false, error: result.error };
  }

  // -------------------------------------------------------------------------
  // Cooldown helpers
  // -------------------------------------------------------------------------

  private setCooldown(symbol: string): void {
    // 8h cooldown = one full funding interval
    const COOLDOWN_MS = 8 * 60 * 60 * 1000;
    this.cooldowns.set(symbol, Date.now() + COOLDOWN_MS);
  }
}
