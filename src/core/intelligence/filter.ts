// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Market Filter Engine
// ---------------------------------------------------------------------------
// Pure functions for ranking and filtering markets.  No side effects —
// every function is safe to call from MCP tools, CLI commands, and tests.
// ---------------------------------------------------------------------------

import type { Market, OrderBook } from "../sdk/types.js";
import type { LiquidityScan, MarketSummary } from "./schema.js";

// ---------------------------------------------------------------------------
// Conversion helper
// ---------------------------------------------------------------------------

/**
 * Convert a raw Market into a ranked MarketSummary snapshot.
 *
 * @param market - The market to summarise.
 * @param rank   - 1-based rank in the result set.
 * @param score  - Numeric sort score for the chosen dimension (e.g. change24h).
 */
export function toMarketSummary(
  market: Market,
  rank: number,
  score: number,
): MarketSummary {
  return {
    symbol: market.symbol,
    price: market.markPrice,
    change24h: market.change24h,
    volume24h: market.volume24h,
    openInterest: market.openInterest,
    fundingRate: market.fundingRate,
    score,
    rank,
  };
}

// ---------------------------------------------------------------------------
// Single-dimension rankings
// ---------------------------------------------------------------------------

/**
 * Return the top N markets by 24 h percentage price change (descending).
 * Markets with the largest gains appear first.
 */
export function topGainers(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.change24h));
}

/**
 * Return the top N markets by 24 h percentage price change (ascending).
 * Markets with the largest losses appear first.
 */
export function topLosers(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => a.change24h - b.change24h)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.change24h));
}

/**
 * Return the top N markets sorted by open interest (descending).
 */
export function byOpenInterest(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.openInterest));
}

/**
 * Return the top N markets sorted by absolute funding rate (descending).
 * Surfaces the most extreme funding — both positive and negative.
 */
export function byFundingRate(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, Math.abs(m.fundingRate)));
}

/**
 * Return the top N markets sorted by 24 h volume (descending).
 */
export function byVolume(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.volume24h));
}

// ---------------------------------------------------------------------------
// Liquidity filter
// ---------------------------------------------------------------------------

/**
 * Filter the market list to only include markets whose 24 h volume
 * meets or exceeds `minVolumeUsd`.
 */
export function liquidityFilter(
  markets: Market[],
  minVolumeUsd: number,
): Market[] {
  return markets.filter((m) => m.volume24h >= minVolumeUsd);
}

// ---------------------------------------------------------------------------
// Composite recipe
// ---------------------------------------------------------------------------

/**
 * Agent recipe: return the top N gainers that pass a minimum-volume gate.
 *
 * Applies the liquidity filter first so that illiquid micro-caps with extreme
 * percentage moves do not dominate the result.
 *
 * @param markets      - Full market list.
 * @param n            - Number of results (default 5).
 * @param minVolumeUsd - Minimum 24 h volume in USD (default $1 M).
 */
export function topGainersWithLiquidityFilter(
  markets: Market[],
  n = 5,
  minVolumeUsd = 1_000_000,
): MarketSummary[] {
  return topGainers(liquidityFilter(markets, minVolumeUsd), n);
}

// ---------------------------------------------------------------------------
// Liquidity scan
// ---------------------------------------------------------------------------

/**
 * Compute a full liquidity profile for a single market using its live order book.
 *
 * Scoring (0–100):
 *   - Volume component (40 pts): saturates at $10 M / 24 h.
 *   - Depth component  (40 pts): saturates at $500 k total within ±10 %.
 *   - Spread component (20 pts): saturates at 0 % spread; zero points at ≥ 0.5 %.
 *
 * @param market    - Enriched market model (needs markPrice and volume24h).
 * @param orderBook - Live order book for the same symbol.
 */
export function computeLiquidityScan(
  market: Market,
  orderBook: OrderBook,
): LiquidityScan {
  const mid = market.markPrice;

  // Guard: mid price of zero makes percentage calculations meaningless.
  if (mid === 0) {
    return zeroLiquidityScan(market.symbol, market.volume24h);
  }

  // Spread
  const bestBid = orderBook.bids[0]?.price ?? 0;
  const bestAsk = orderBook.asks[0]?.price ?? 0;
  const spreadPct =
    bestAsk > 0 && bestBid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 0;

  // Depth within ±10 % of mid price
  const lowerBound = mid * 0.9;
  const upperBound = mid * 1.1;

  const bidDepth10pct = orderBook.bids
    .filter((level) => level.price >= lowerBound)
    .reduce((sum, level) => sum + level.price * level.amount, 0);

  const askDepth10pct = orderBook.asks
    .filter((level) => level.price <= upperBound)
    .reduce((sum, level) => sum + level.price * level.amount, 0);

  const totalDepth = bidDepth10pct + askDepth10pct;

  // Slippage estimates for three common order sizes
  const slippage10k = estimateSlippage(orderBook.asks, 10_000, mid);
  const slippage50k = estimateSlippage(orderBook.asks, 50_000, mid);
  const slippage100k = estimateSlippage(orderBook.asks, 100_000, mid);

  // Composite liquidity score
  const volumeScore = Math.min(market.volume24h / 10_000_000, 1) * 40; // max 40 pts
  const depthScore = Math.min(totalDepth / 500_000, 1) * 40; // max 40 pts
  const spreadScore = Math.max(0, 1 - spreadPct / 0.5) * 20; // max 20 pts
  const liquidityScore = Math.round(volumeScore + depthScore + spreadScore);

  return {
    symbol: market.symbol,
    volume24h: market.volume24h,
    spreadPct,
    bidDepth10pct,
    askDepth10pct,
    slippage10k,
    slippage50k,
    slippage100k,
    liquidityScore,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Walk the ask side of the order book to estimate how far the price moves
 * when consuming `targetUsd` of liquidity.
 *
 * Returns the slippage as a percentage of the mid price.
 * Returns 0 when mid price is 0 or the book is empty.
 */
function estimateSlippage(
  asks: OrderBook["asks"],
  targetUsd: number,
  midPrice: number,
): number {
  if (midPrice === 0 || asks.length === 0) return 0;

  let filled = 0;
  let worstPrice = midPrice;

  for (const level of asks) {
    const levelUsd = level.price * level.amount;
    if (filled + levelUsd >= targetUsd) {
      worstPrice = level.price;
      break;
    }
    filled += levelUsd;
    worstPrice = level.price;
  }

  return ((worstPrice - midPrice) / midPrice) * 100;
}

/**
 * Return a zeroed-out LiquidityScan for markets where the mid price is
 * unavailable (prevents division-by-zero in downstream consumers).
 */
function zeroLiquidityScan(symbol: string, volume24h: number): LiquidityScan {
  return {
    symbol,
    volume24h,
    spreadPct: 0,
    bidDepth10pct: 0,
    askDepth10pct: 0,
    slippage10k: 0,
    slippage50k: 0,
    slippage100k: 0,
    liquidityScore: 0,
  };
}
