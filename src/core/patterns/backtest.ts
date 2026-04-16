// ---------------------------------------------------------------------------
// Pattern backtest engine
// ---------------------------------------------------------------------------
// Replays a user-authored Pattern against historical OHLC candles and
// simulates every trade the pattern would have taken. Shared across:
//   - CLI (`pacifica backtest <name>`)
//   - MCP (`pacifica_backtest_pattern`)
//   - Web (`/backtest/[name]`)
//
// Semantics (documented here so callers can surface them honestly):
//
//  Entry:
//    - `when:` conditions are evaluated at each candle's CLOSE.
//    - If they become true and no position is open, ENTER at the NEXT
//      candle's OPEN price (no look-ahead).
//    - If `when:` re-fires while already in a position, it is ignored.
//
//  Exit priority (checked in order, each candle we're in a position):
//    1. Stop-loss: long → low ≤ SL price; short → high ≥ SL price.
//    2. Take-profit: long → high ≥ TP price; short → low ≤ TP price.
//    3. Liquidation: same intra-candle test as SL, using liq price.
//    4. `exit:` OR conditions evaluated at close → exit NEXT candle's open.
//    5. End of window with position open → mark-to-market at last close
//       and label `"open at end"`.
//
//  P&L per trade (USD):
//    ((exit - entry) / entry) * size_usd * (long ? +1 : -1)
//
//  Funding is NOT included — candle data does not carry funding history.
//  This is a product limitation; callers should surface it.
//
//  Skipped axes:
//    Conditions on axes we can't derive from candles
//    (funding_rate, oi_change_4h_pct, buy_pressure, momentum_value,
//    large_orders_count) are treated as FALSE rather than throwing.
//    The full set of skipped axes is returned so the UI can show
//    an "only price/volume validated" banner.
// ---------------------------------------------------------------------------

import type { MarketContext } from "../intelligence/schema.js";
import type { Pattern, PatternCondition, ConditionAxis } from "./types.js";
import type { Candle } from "./candles.js";

// ---------------------------------------------------------------------------
// Which axes can be derived from OHLC candles alone?
// ---------------------------------------------------------------------------

const CANDLE_DERIVABLE_AXES: ReadonlySet<ConditionAxis> = new Set<ConditionAxis>([
  "mark_price",
  // 24h volume is the only volume signal we can derive (rolling sum of last
  // 24 hourly candles). Everything else in the context needs live state.
  "volume_24h_usd",
]);

function isDerivable(axis: ConditionAxis): boolean {
  return CANDLE_DERIVABLE_AXES.has(axis);
}

// ---------------------------------------------------------------------------
// Per-candle context — subset of MarketContext we can fill from OHLC.
// Non-derivable fields are set to `NaN` so evaluateBacktestCondition can
// detect and skip them deterministically (NaN compares false to everything).
// ---------------------------------------------------------------------------

function buildContextAtIndex(candles: Candle[], i: number): MarketContext {
  // 24h rolling volume = sum of up to last 24 hourly candle volumes,
  // scaled by close price to approximate USD notional. This is an honest
  // estimate (volume field is base-asset quantity on most venues).
  const start = Math.max(0, i - 23);
  let vol24 = 0;
  for (let k = start; k <= i; k++) vol24 += candles[k].v * candles[k].c;

  return {
    funding_rate: NaN,
    open_interest_usd: NaN,
    oi_change_4h_pct: NaN,
    mark_price: candles[i].c,
    volume_24h_usd: vol24,
    buy_pressure: NaN,
    momentum_signal: "neutral",
    momentum_value: NaN,
    large_orders_count: NaN,
    captured_at: new Date(candles[i].t).toISOString(),
  };
}

function evaluateBacktestCondition(
  ctx: MarketContext,
  cond: PatternCondition,
): boolean {
  if (!isDerivable(cond.axis)) return false;
  const raw = ctx[cond.axis as keyof MarketContext];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
  switch (cond.op) {
    case "lt": return raw < cond.value;
    case "lte": return raw <= cond.value;
    case "gt": return raw > cond.value;
    case "gte": return raw >= cond.value;
    case "eq": return raw === cond.value;
  }
}

function matchAllWhen(ctx: MarketContext, pattern: Pattern): boolean {
  return pattern.when.every((c) => evaluateBacktestCondition(ctx, c));
}

function anyExit(ctx: MarketContext, pattern: Pattern): boolean {
  if (pattern.exit.length === 0) return false;
  return pattern.exit.some((c) => evaluateBacktestCondition(ctx, c));
}

// ---------------------------------------------------------------------------
// Liquidation math — identical to CLI + web simulate
// ---------------------------------------------------------------------------

const MAINTENANCE_MARGIN_RATE = 0.005;

export function liquidationPrice(
  side: "long" | "short",
  entry: number,
  leverage: number,
): number {
  return side === "long"
    ? entry * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE)
    : entry * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);
}

function pnlUsd(
  side: "long" | "short",
  entry: number,
  exit: number,
  sizeUsd: number,
): number {
  if (entry === 0) return 0;
  const delta = side === "long"
    ? (exit - entry) / entry
    : (entry - exit) / entry;
  return delta * sizeUsd;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ExitReason = "stop_loss" | "take_profit" | "liquidation" | "exit_clause" | "window_end";

export interface BacktestTrade {
  /** 1-based trade index for UI tables / sparkline x-axis. */
  index: number;
  side: "long" | "short";
  entry_time: string;   // ISO
  entry_price: number;
  exit_time: string;    // ISO
  exit_price: number;
  exit_reason: ExitReason;
  pnl_usd: number;
  pnl_pct_on_margin: number;
  /** Cumulative $ P&L across all trades up to and including this one. */
  cumulative_pnl_usd: number;
  /** Bars held (inclusive of entry candle). */
  bars_held: number;
}

export interface BacktestSummary {
  n_trades: number;
  n_wins: number;
  n_losses: number;
  win_rate: number;          // 0..1
  total_pnl_usd: number;
  avg_pnl_usd: number;
  avg_pnl_pct_on_margin: number;
  max_drawdown_usd: number;  // >= 0
  /** P&L of the best single trade. */
  best_trade_usd: number;
  /** P&L of the worst single trade. */
  worst_trade_usd: number;
}

export interface BacktestWindow {
  start: string;  // ISO of first candle
  end: string;    // ISO of last candle
  candle_count: number;
  interval: "1h";
}

export interface BacktestResult {
  pattern: string;
  market: string;
  window: BacktestWindow;
  trades: BacktestTrade[];
  summary: BacktestSummary;
  /**
   * Condition axes that this pattern uses but the backtest engine cannot
   * derive from candles alone. Empty = the pattern is fully validated by
   * this backtest. Non-empty = the UI MUST show the "directional-only"
   * warning banner.
   */
  skipped_axes: ConditionAxis[];
  /**
   * Warning surfaced when all `when:` conditions reference skipped axes —
   * the backtest will produce ZERO trades because no condition can ever
   * evaluate to true. Callers should render this prominently.
   */
  all_conditions_skipped: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function runBacktest(
  pattern: Pattern,
  candles: Candle[],
  market: string,
): BacktestResult {
  // Collect skipped axes (de-duplicated, preserving stable order).
  const skippedSet = new Set<ConditionAxis>();
  for (const c of [...pattern.when, ...pattern.exit]) {
    if (!isDerivable(c.axis)) skippedSet.add(c.axis);
  }
  const skipped_axes = Array.from(skippedSet);
  const all_conditions_skipped = pattern.when.every((c) => !isDerivable(c.axis));

  const trades: BacktestTrade[] = [];

  if (candles.length < 2 || all_conditions_skipped) {
    return {
      pattern: pattern.name,
      market,
      window: buildWindow(candles),
      trades,
      summary: emptySummary(),
      skipped_axes,
      all_conditions_skipped,
    };
  }

  const { side, size_usd, leverage, stop_loss_pct, take_profit_pct } = pattern.entry;
  const slPct = stop_loss_pct ?? null;
  const tpPct = take_profit_pct ?? null;

  // Position state
  let inPosition = false;
  let entryPrice = 0;
  let entryTimeMs = 0;
  let entryIdx = -1;
  let slPrice: number | null = null;
  let tpPrice: number | null = null;
  let liqPrice = 0;
  /** Exit has been SIGNALLED at close of candle i; execute at open of i+1. */
  let pendingExitReason: ExitReason | null = null;
  /** Entry has been SIGNALLED at close of candle i; execute at open of i+1. */
  let pendingEntry = false;
  let cumulativePnl = 0;

  const finishTrade = (
    exitPriceLocal: number,
    exitTimeMs: number,
    exitIdx: number,
    reason: ExitReason,
  ) => {
    const pnl = pnlUsd(side, entryPrice, exitPriceLocal, size_usd);
    const margin = size_usd / leverage;
    cumulativePnl += pnl;
    trades.push({
      index: trades.length + 1,
      side,
      entry_time: new Date(entryTimeMs).toISOString(),
      entry_price: entryPrice,
      exit_time: new Date(exitTimeMs).toISOString(),
      exit_price: exitPriceLocal,
      exit_reason: reason,
      pnl_usd: pnl,
      pnl_pct_on_margin: margin > 0 ? (pnl / margin) * 100 : 0,
      cumulative_pnl_usd: cumulativePnl,
      bars_held: exitIdx - entryIdx + 1,
    });
    inPosition = false;
    pendingExitReason = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // --- Step 1: execute any pending exit at this candle's OPEN ---
    if (inPosition && pendingExitReason) {
      finishTrade(candle.o, candle.t, i, pendingExitReason);
    }

    // --- Step 2: execute any pending entry at this candle's OPEN ---
    if (!inPosition && pendingEntry) {
      entryPrice = candle.o;
      entryTimeMs = candle.t;
      entryIdx = i;
      liqPrice = liquidationPrice(side, entryPrice, leverage);
      slPrice = slPct !== null
        ? (side === "long" ? entryPrice * (1 - slPct / 100) : entryPrice * (1 + slPct / 100))
        : null;
      tpPrice = tpPct !== null
        ? (side === "long" ? entryPrice * (1 + tpPct / 100) : entryPrice * (1 - tpPct / 100))
        : null;
      inPosition = true;
      pendingEntry = false;
    }

    // --- Step 3: if in position, check intra-candle stop/tp/liq FIRST ---
    if (inPosition) {
      // Tie-breaking: if both SL and TP are inside this candle's range,
      // we can't tell which came first from OHLC alone — we pessimistically
      // assume SL fires first (honest: worst-case for trader).
      let intraExit: { price: number; reason: ExitReason } | null = null;

      if (slPrice !== null) {
        const hit = side === "long" ? candle.l <= slPrice : candle.h >= slPrice;
        if (hit) intraExit = { price: slPrice, reason: "stop_loss" };
      }
      if (!intraExit && tpPrice !== null) {
        const hit = side === "long" ? candle.h >= tpPrice : candle.l <= tpPrice;
        if (hit) intraExit = { price: tpPrice, reason: "take_profit" };
      }
      if (!intraExit) {
        const hit = side === "long" ? candle.l <= liqPrice : candle.h >= liqPrice;
        if (hit) intraExit = { price: liqPrice, reason: "liquidation" };
      }

      if (intraExit) {
        finishTrade(intraExit.price, candle.t, i, intraExit.reason);
        continue; // don't evaluate entry on this same candle
      }
    }

    // --- Step 4: evaluate signals at candle close ---
    const ctx = buildContextAtIndex(candles, i);

    if (inPosition) {
      if (anyExit(ctx, pattern)) {
        // Exit at next candle's open
        pendingExitReason = "exit_clause";
      }
    } else {
      if (matchAllWhen(ctx, pattern)) {
        // Enter at next candle's open
        pendingEntry = true;
      }
    }
  }

  // --- End of window: mark-to-market any open position ---
  if (inPosition) {
    const last = candles[candles.length - 1];
    finishTrade(last.c, last.t, candles.length - 1, "window_end");
  }

  return {
    pattern: pattern.name,
    market,
    window: buildWindow(candles),
    trades,
    summary: summarise(trades),
    skipped_axes,
    all_conditions_skipped,
  };
}

// ---------------------------------------------------------------------------
// Summary + window helpers
// ---------------------------------------------------------------------------

function buildWindow(candles: Candle[]): BacktestWindow {
  if (candles.length === 0) {
    const iso = new Date(0).toISOString();
    return { start: iso, end: iso, candle_count: 0, interval: "1h" };
  }
  return {
    start: new Date(candles[0].t).toISOString(),
    end: new Date(candles[candles.length - 1].t).toISOString(),
    candle_count: candles.length,
    interval: "1h",
  };
}

function emptySummary(): BacktestSummary {
  return {
    n_trades: 0, n_wins: 0, n_losses: 0, win_rate: 0,
    total_pnl_usd: 0, avg_pnl_usd: 0, avg_pnl_pct_on_margin: 0,
    max_drawdown_usd: 0, best_trade_usd: 0, worst_trade_usd: 0,
  };
}

function summarise(trades: BacktestTrade[]): BacktestSummary {
  if (trades.length === 0) return emptySummary();

  let wins = 0, losses = 0, total = 0, totalPctMargin = 0;
  let best = -Infinity, worst = Infinity;
  let peak = 0, maxDd = 0;

  for (const t of trades) {
    total += t.pnl_usd;
    totalPctMargin += t.pnl_pct_on_margin;
    if (t.pnl_usd > 0) wins++;
    else if (t.pnl_usd < 0) losses++;
    if (t.pnl_usd > best) best = t.pnl_usd;
    if (t.pnl_usd < worst) worst = t.pnl_usd;

    // Drawdown tracked on cumulative equity curve
    if (t.cumulative_pnl_usd > peak) peak = t.cumulative_pnl_usd;
    const dd = peak - t.cumulative_pnl_usd;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    n_trades: trades.length,
    n_wins: wins,
    n_losses: losses,
    win_rate: trades.length > 0 ? wins / trades.length : 0,
    total_pnl_usd: total,
    avg_pnl_usd: total / trades.length,
    avg_pnl_pct_on_margin: totalPctMargin / trades.length,
    max_drawdown_usd: maxDd,
    best_trade_usd: best === -Infinity ? 0 : best,
    worst_trade_usd: worst === Infinity ? 0 : worst,
  };
}
