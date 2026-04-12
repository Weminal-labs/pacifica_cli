// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Trade Pattern Analyser
// ---------------------------------------------------------------------------
// Pure functions that operate on a slice of recent trade history.  No I/O,
// no side effects — all functions are safe to call from MCP tools, CLI
// commands, and unit tests.
//
// NOTE on side convention:
//   TradeHistory.side === "bid"  → buyer-initiated (buy pressure)
//   TradeHistory.side === "ask"  → seller-initiated (sell pressure)
// ---------------------------------------------------------------------------

import type { TradeHistory } from "../sdk/types.js";
import type {
  LargeOrder,
  MomentumSignal,
  TradePatternResult,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Buy pressure
// ---------------------------------------------------------------------------

/**
 * Compute the buy-pressure ratio for a set of trades.
 *
 * Returns a value in [0, 1] where 1.0 means all volume was buyer-initiated
 * and 0.0 means all volume was seller-initiated.  Returns 0.5 for empty
 * input (neutral assumption).
 *
 * @param trades - Array of recent trade fills.
 */
export function computeBuyPressure(trades: TradeHistory[]): number {
  if (trades.length === 0) return 0.5;

  let buyVol = 0;
  let totalVol = 0;

  for (const trade of trades) {
    const usdValue = trade.amount * trade.price;
    totalVol += usdValue;
    if (trade.side === "bid") {
      buyVol += usdValue;
    }
  }

  return totalVol > 0 ? buyVol / totalVol : 0.5;
}

// ---------------------------------------------------------------------------
// VWAP
// ---------------------------------------------------------------------------

/**
 * Compute the volume-weighted average price (VWAP) for a set of trades.
 *
 * Returns 0 when the trade list is empty or when total volume is zero.
 *
 * @param trades - Array of recent trade fills.
 */
export function computeVwap(trades: TradeHistory[]): number {
  if (trades.length === 0) return 0;

  let sumPriceVolume = 0;
  let sumVolume = 0;

  for (const trade of trades) {
    sumPriceVolume += trade.price * trade.amount;
    sumVolume += trade.amount;
  }

  return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
}

// ---------------------------------------------------------------------------
// Large order detection
// ---------------------------------------------------------------------------

/**
 * Identify trades whose USD notional value exceeds `thresholdUsd`.
 *
 * Results are sorted by size descending (largest whale order first).
 * The `side` field is normalised to "buy" / "sell" from the SDK's
 * "bid" / "ask" convention.
 *
 * @param trades       - Array of recent trade fills.
 * @param thresholdUsd - Minimum USD notional to qualify as a large order (default $50 k).
 */
export function detectLargeOrders(
  trades: TradeHistory[],
  thresholdUsd = 50_000,
): LargeOrder[] {
  return trades
    .filter((trade) => trade.price * trade.amount >= thresholdUsd)
    .map((trade): LargeOrder => ({
      price: trade.price,
      sizeBase: trade.amount,
      sizeUsd: trade.price * trade.amount,
      side: trade.side === "bid" ? "buy" : "sell",
      timestamp: trade.createdAt,
    }))
    .sort((a, b) => b.sizeUsd - a.sizeUsd);
}

// ---------------------------------------------------------------------------
// Momentum detection
// ---------------------------------------------------------------------------

/**
 * Detect directional momentum by comparing buy pressure in the first half of
 * the trade list versus the second half.
 *
 * A positive delta (more buying in the second half) indicates accelerating
 * buy pressure ("bullish").  A negative delta indicates accelerating sell
 * pressure ("bearish").  Anything within ±5 % is classified as "neutral".
 *
 * The momentum value is clamped to [–1, 1] and scaled by 5× the raw delta
 * so that small deltas produce intuitive output near zero.
 *
 * Returns `{ signal: "neutral", value: 0 }` when fewer than 4 trades are
 * available (not enough data for a reliable half-split).
 *
 * @param trades - Chronologically ordered trade fills (oldest → newest).
 */
export function detectMomentum(trades: TradeHistory[]): {
  signal: MomentumSignal;
  value: number;
} {
  if (trades.length < 4) return { signal: "neutral", value: 0 };

  const mid = Math.floor(trades.length / 2);
  const firstHalfPressure = computeBuyPressure(trades.slice(0, mid));
  const secondHalfPressure = computeBuyPressure(trades.slice(mid));

  // Positive delta → buying is accelerating in the most recent half.
  const delta = secondHalfPressure - firstHalfPressure;

  const signal: MomentumSignal =
    delta > 0.05 ? "bullish" : delta < -0.05 ? "bearish" : "neutral";

  // Clamp to [–1, 1]; scale by 5 so a 0.2 delta maps to ±1.
  const value = Math.max(-1, Math.min(1, delta * 5));

  return { signal, value };
}

// ---------------------------------------------------------------------------
// Full pattern analysis
// ---------------------------------------------------------------------------

/**
 * Run a full trade pattern analysis for a single symbol and return a
 * comprehensive result combining buy pressure, VWAP, large orders, and
 * momentum.
 *
 * @param symbol              - Trading symbol (e.g. "BTC").
 * @param trades              - Recent trade fills for that symbol.
 * @param currentPrice        - Latest mark or mid price for VWAP comparison.
 * @param largeOrderThresholdUsd - USD threshold for whale order detection (default $50 k).
 */
export function analyzeTradePatterns(
  symbol: string,
  trades: TradeHistory[],
  currentPrice: number,
  largeOrderThresholdUsd = 50_000,
): TradePatternResult {
  const buyPressure = computeBuyPressure(trades);
  const vwap = computeVwap(trades);
  const largeOrders = detectLargeOrders(trades, largeOrderThresholdUsd);
  const { signal, value } = detectMomentum(trades);

  // Guard: avoid division by zero when VWAP cannot be computed.
  const priceVsVwapPct = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;

  return {
    symbol,
    sampleSize: trades.length,
    buyPressure,
    vwap,
    currentPrice,
    priceVsVwapPct,
    largeOrders,
    momentumSignal: signal,
    momentum: value,
  };
}
