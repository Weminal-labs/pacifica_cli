# Phase 02: Core Intelligence Layer

**Parent plan:** [plan.md](./plan.md)
**Depends on:** Phase 01 (schema.ts interfaces defined)
**Status:** `[ ]` Not started
**Priority:** High — MCP tools and CLI both depend on this

---

## Overview

Create `src/core/intelligence/` with 4 modules. These are pure functions + a class-based alert manager. No new dependencies — uses existing `Market`, `OrderBook`, `TradeHistory` types from `src/core/sdk/types.ts`.

---

## Architecture

```
src/core/intelligence/
├── schema.ts       ← stable TypeScript interfaces (no logic)
├── filter.ts       ← pure functions: topGainers, topLosers, liquidityFilter, byOI, recipe
├── patterns.ts     ← pure functions: detectLargeOrders, computeBuyPressure, computeVwap, detectMomentum
└── alerts.ts       ← AlertManager class: CRUD + triage + checkAlerts
```

**Key design decisions:**
- All `filter.ts` and `patterns.ts` exports are pure functions (no side effects, easy to test)
- `alerts.ts` follows the same `JournalLogger` pattern: lazy-load data dir, read/write JSON
- No module-level singletons — consumers instantiate `AlertManager` and pass it around
- `schema.ts` has zero imports (pure types, no runtime code)

---

## `schema.ts` — Full Interface Definitions

```typescript
// src/core/intelligence/schema.ts

export const SCHEMA_VERSION = "1.0" as const;

export interface MarketSummary {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  score: number;      // computed sort score (0-100)
  rank: number;       // 1-based rank in result set
}

export interface LiquidityScan {
  symbol: string;
  volume24h: number;
  spreadPct: number;
  bidDepth10pct: number;    // total bid volume within 10% of mid price
  askDepth10pct: number;
  slippage10k: number;      // estimated slippage % for $10k market order
  slippage50k: number;
  slippage100k: number;
  liquidityScore: number;   // 0-100 composite
}

export interface LargeOrder {
  price: number;
  sizeBase: number;         // in base asset (e.g. ETH)
  sizeUsd: number;
  side: "buy" | "sell";
  timestamp: string;
}

export type MomentumSignal = "bullish" | "bearish" | "neutral";

export interface TradePatternResult {
  symbol: string;
  sampleSize: number;
  buyPressure: number;      // 0.0 – 1.0
  vwap: number;
  currentPrice: number;
  priceVsVwapPct: number;  // + means price above VWAP
  largeOrders: LargeOrder[];
  momentumSignal: MomentumSignal;
  momentum: number;         // -1.0 to +1.0
}

export type AlertType =
  | "price_above"
  | "price_below"
  | "funding_above"
  | "funding_below"
  | "volume_spike";

export type AlertStatus = "active" | "triggered" | "dismissed";
export type AlertUrgency = "triggered" | "near" | "dormant";

export interface Alert {
  id: string;
  symbol: string;
  type: AlertType;
  threshold: number;
  status: AlertStatus;
  createdAt: string;
  triggeredAt?: string;
  note?: string;
}

export interface AlertTriageResult {
  alert: Alert;
  currentValue: number;
  distancePct: number;      // negative = triggered/past threshold
  urgency: AlertUrgency;
}

export interface MarketIntelligenceSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  markets: MarketSummary[];
  topGainers: MarketSummary[];     // top 5
  topLosers: MarketSummary[];      // top 5
  highestFunding: MarketSummary[];  // top 5 by abs funding rate
  liquidityLeaders: LiquidityScan[]; // top 5 by liquidity score
  triggeredAlerts: AlertTriageResult[];
  nearAlerts: AlertTriageResult[];   // within 5% of threshold
}
```

---

## `filter.ts` — Market Filter Engine

```typescript
// src/core/intelligence/filter.ts
import type { Market } from "../sdk/types.js";
import type { MarketSummary, LiquidityScan } from "./schema.js";
import type { OrderBook } from "../sdk/types.js";

export function toMarketSummary(m: Market, rank: number, score: number): MarketSummary {
  return {
    symbol: m.symbol,
    price: m.markPrice,
    change24h: m.change24h,
    volume24h: m.volume24h,
    openInterest: m.openInterest,
    fundingRate: m.fundingRate,
    score,
    rank,
  };
}

/** Top N by 24h % change (descending). */
export function topGainers(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.change24h));
}

/** Top N by 24h % change (ascending — biggest losers first). */
export function topLosers(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => a.change24h - b.change24h)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.change24h));
}

/** Top N by open interest (descending). */
export function byOpenInterest(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, m.openInterest));
}

/** Top N by absolute funding rate (descending — most extreme funding). */
export function byFundingRate(markets: Market[], n = 10): MarketSummary[] {
  return [...markets]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, n)
    .map((m, i) => toMarketSummary(m, i + 1, Math.abs(m.fundingRate)));
}

/** Filter markets by minimum 24h volume (USD). */
export function liquidityFilter(markets: Market[], minVolumeUsd: number): Market[] {
  return markets.filter((m) => m.volume24h >= minVolumeUsd);
}

/**
 * Agent recipe: top gainers with liquidity gate.
 * Filters by min volume first, then returns top N gainers.
 */
export function topGainersWithLiquidityFilter(
  markets: Market[],
  n = 5,
  minVolumeUsd = 1_000_000,
): MarketSummary[] {
  return topGainers(liquidityFilter(markets, minVolumeUsd), n);
}

/** Compute liquidity scan for a single market + its order book. */
export function computeLiquidityScan(
  market: Market,
  orderBook: OrderBook,
): LiquidityScan {
  const mid = market.markPrice;
  if (mid === 0) {
    return zeroLiquidityScan(market.symbol, market.volume24h);
  }

  const bestBid = orderBook.bids[0]?.price ?? 0;
  const bestAsk = orderBook.asks[0]?.price ?? 0;
  const spreadPct = bestAsk > 0 && bestBid > 0
    ? ((bestAsk - bestBid) / mid) * 100
    : 0;

  const lowerBound = mid * 0.9;
  const upperBound = mid * 1.1;

  const bidDepth10pct = orderBook.bids
    .filter((l) => l.price >= lowerBound)
    .reduce((sum, l) => sum + l.price * l.amount, 0);

  const askDepth10pct = orderBook.asks
    .filter((l) => l.price <= upperBound)
    .reduce((sum, l) => sum + l.price * l.amount, 0);

  const totalDepth = bidDepth10pct + askDepth10pct;

  // Estimate slippage: how much price moves consuming $X of liquidity
  const slippage10k = estimateSlippage(orderBook.asks, 10_000, mid);
  const slippage50k = estimateSlippage(orderBook.asks, 50_000, mid);
  const slippage100k = estimateSlippage(orderBook.asks, 100_000, mid);

  // Liquidity score: composite (volume + depth + spread)
  const volumeScore = Math.min(market.volume24h / 10_000_000, 1) * 40;  // max 40 pts
  const depthScore = Math.min(totalDepth / 500_000, 1) * 40;             // max 40 pts
  const spreadScore = Math.max(0, (1 - spreadPct / 0.5)) * 20;           // max 20 pts
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

function estimateSlippage(
  asks: OrderBook["asks"],
  targetUsd: number,
  midPrice: number,
): number {
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
  return midPrice > 0 ? ((worstPrice - midPrice) / midPrice) * 100 : 0;
}

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
```

---

## `patterns.ts` — Trade Pattern Analyzer

```typescript
// src/core/intelligence/patterns.ts
import type { TradeHistory } from "../sdk/types.js";
import type { TradePatternResult, LargeOrder, MomentumSignal } from "./schema.js";

/** Compute buy/sell pressure ratio from a trade list. Returns 0-1 (1 = all buys). */
export function computeBuyPressure(trades: TradeHistory[]): number {
  if (trades.length === 0) return 0.5;
  let buyVol = 0, totalVol = 0;
  for (const t of trades) {
    const vol = t.amount * t.price;  // USD value
    totalVol += vol;
    if (t.side === "bid") buyVol += vol;
  }
  return totalVol > 0 ? buyVol / totalVol : 0.5;
}

/** Volume-weighted average price. */
export function computeVwap(trades: TradeHistory[]): number {
  if (trades.length === 0) return 0;
  let sumPV = 0, sumV = 0;
  for (const t of trades) {
    sumPV += t.price * t.amount;
    sumV += t.amount;
  }
  return sumV > 0 ? sumPV / sumV : 0;
}

/** Find trades above a USD size threshold (whale orders). */
export function detectLargeOrders(
  trades: TradeHistory[],
  thresholdUsd = 50_000,
): LargeOrder[] {
  return trades
    .filter((t) => t.price * t.amount >= thresholdUsd)
    .map((t) => ({
      price: t.price,
      sizeBase: t.amount,
      sizeUsd: t.price * t.amount,
      side: t.side === "bid" ? "buy" : "sell",
      timestamp: t.timestamp,
    }))
    .sort((a, b) => b.sizeUsd - a.sizeUsd);
}

/**
 * Detect momentum by comparing buy pressure in first vs. second half of trades.
 * Positive momentum = buy pressure accelerating. Returns -1 to +1.
 */
export function detectMomentum(trades: TradeHistory[]): {
  signal: MomentumSignal;
  value: number;
} {
  if (trades.length < 4) return { signal: "neutral", value: 0 };
  const mid = Math.floor(trades.length / 2);
  const first = computeBuyPressure(trades.slice(0, mid));
  const second = computeBuyPressure(trades.slice(mid));
  const delta = second - first;  // positive = accelerating buys
  const signal: MomentumSignal =
    delta > 0.05 ? "bullish" : delta < -0.05 ? "bearish" : "neutral";
  return { signal, value: Math.max(-1, Math.min(1, delta * 5)) };
}

/** Full trade pattern analysis for a symbol. */
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
```

---

## `alerts.ts` — Alert Manager

Follows identical pattern to `JournalLogger`:
- Lazy-resolve `~/.pacifica/` data dir via `getDataDir()`
- Read/write `alerts.json`
- File permissions 0o600 (sensitive)

```typescript
// src/core/intelligence/alerts.ts
// Key methods:
class AlertManager {
  async listAlerts(): Promise<Alert[]>
  async addAlert(alert: Omit<Alert, "id" | "createdAt" | "status">): Promise<Alert>
  async removeAlert(id: string): Promise<void>
  async dismissAlert(id: string): Promise<void>
  async checkAlerts(markets: Market[], fundingRates?: FundingRate[]): Promise<AlertTriageResult[]>
  async triage(includeDorant = false): Promise<AlertTriageResult[]>
    // reads alerts, calls checkAlerts with current market data
}
```

**`checkAlerts` logic:**
- `price_above`: triggered if `currentPrice >= threshold`
- `price_below`: triggered if `currentPrice <= threshold`
- `funding_above`: triggered if `fundingRate >= threshold`
- `funding_below`: triggered if `fundingRate <= threshold`
- `volume_spike`: triggered if `volume24h >= threshold` (threshold = USD value)
- `near` = within 5% of threshold (distancePct between -5% and 0%)
- `dormant` = more than 5% away from threshold

**Triage ordering:**
1. `triggered` (distancePct <= 0)
2. `near` (distancePct > 0 and < 5%)
3. `dormant` (distancePct >= 5%) — only if `includeDorant = true`

---

## Related Code Files

- `src/core/sdk/types.ts` — `Market`, `OrderBook`, `TradeHistory`, `FundingRate`
- `src/core/config/loader.ts` — `getDataDir()` function
- `src/core/journal/logger.ts` — pattern reference for file I/O
- `src/core/smart/types.ts` — pattern reference for local JSON storage

---

## Implementation Steps

1. Create `src/core/intelligence/schema.ts` — interfaces only, no imports
2. Create `src/core/intelligence/filter.ts` — pure functions + `computeLiquidityScan`
3. Create `src/core/intelligence/patterns.ts` — pure functions
4. Create `src/core/intelligence/alerts.ts` — `AlertManager` class
5. Verify TypeScript compiles: `pnpm tsc --noEmit`

---

## Success Criteria

- [ ] `schema.ts` compiles with zero imports
- [ ] `filter.ts` pure functions cover all 5 sort modes + recipe
- [ ] `patterns.ts` returns `TradePatternResult` matching schema
- [ ] `alerts.ts` CRUD + triage matches `JournalLogger` file I/O pattern
- [ ] `pnpm tsc --noEmit` passes with no errors
- [ ] All functions have JSDoc comments

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| TradeHistory `side` field might be "bid"/"ask" not "buy"/"sell" | Use existing `toOrderSide` mapping pattern from MCP server |
| `getDataDir()` import path — check exact export name | Read `src/core/config/loader.ts` before writing |
| Market `volume24h` might be 0 for low-liquidity markets | Guard division by zero in slippage calc |

## Security Considerations

- `alerts.json` written with 0o600 perms (same as journal.json)
- No eval or dynamic code execution
- All numeric inputs validated before arithmetic
