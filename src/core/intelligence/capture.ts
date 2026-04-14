// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Capture
// ---------------------------------------------------------------------------
// Silently captures market context at trade execution time and persists an
// IntelligenceRecord.  Never throws — all errors are suppressed to console
// warnings so that a capture failure can never interrupt a trade.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { PacificaClient } from "../sdk/client.js";
import { analyzeTradePatterns } from "./patterns.js";
import { appendRecord } from "./store.js";
import type { IntelligenceRecord, MarketContext } from "./schema.js";

// ---------------------------------------------------------------------------
// OI cache — compare current OI to a previous value to compute change %
// ---------------------------------------------------------------------------

/** In-memory cache of OI per symbol (persists across calls within a process). */
const oiCache = new Map<string, number>();

function computeOiChangePct(symbol: string, currentOi: number): number {
  const prev = oiCache.get(symbol);
  oiCache.set(symbol, currentOi);
  if (prev === undefined || prev === 0) return 0;
  return ((currentOi - prev) / prev) * 100;
}

// ---------------------------------------------------------------------------
// Pattern tag derivation
// ---------------------------------------------------------------------------

function derivePatternTags(ctx: MarketContext): string[] {
  const tags: string[] = [];
  if (ctx.funding_rate < -0.0003) tags.push("negative_funding");
  if (ctx.funding_rate > 0.0003)  tags.push("positive_funding");
  if (ctx.oi_change_4h_pct > 10)  tags.push("rising_oi");
  if (ctx.oi_change_4h_pct < -10) tags.push("falling_oi");
  if (ctx.buy_pressure > 0.65)    tags.push("high_buy_pressure");
  if (ctx.buy_pressure < 0.35)    tags.push("high_sell_pressure");
  if (ctx.momentum_signal === "bullish") tags.push("bullish_momentum");
  if (ctx.momentum_signal === "bearish") tags.push("bearish_momentum");
  if (ctx.large_orders_count >= 3)       tags.push("whale_activity");
  return tags;
}

// ---------------------------------------------------------------------------
// Trader ID hashing
// ---------------------------------------------------------------------------

function hashTraderId(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

// ---------------------------------------------------------------------------
// Main capture function
// ---------------------------------------------------------------------------

export interface CaptureParams {
  asset: string;
  direction: "long" | "short";
  size_usd: number;
  entry_price: number;
  /** Raw API key — hashed before storage, never persisted in plain text. */
  api_key: string;
}

/**
 * Capture market intelligence at trade execution time.
 *
 * This function is designed to be fire-and-forget:
 *   captureIntelligence(sdk, params).catch(() => {});
 *
 * It will never throw or surface an error to the caller.
 */
export async function captureIntelligence(
  sdk: PacificaClient,
  params: CaptureParams,
): Promise<void> {
  try {
    // Normalise symbol: "ETH" → "ETH-USDC-PERP" if needed
    const symbol = normaliseSymbol(params.asset);

    // Fetch market data concurrently
    const [markets, trades] = await Promise.all([
      sdk.getMarkets(),
      sdk.getRecentTrades(symbol).catch(() => []),
    ]);

    const market = markets.find(
      (m) => m.symbol.toUpperCase() === symbol.toUpperCase(),
    );

    if (!market) {
      console.warn(`[intelligence] market not found for symbol: ${symbol}`);
      return;
    }

    // Analyse trade patterns (buy pressure, VWAP, momentum, large orders)
    const patterns = analyzeTradePatterns(
      symbol,
      trades,
      market.markPrice,
      50_000, // $50k threshold for large order detection
    );

    // Compute OI change vs last capture
    const oiChangePct = computeOiChangePct(symbol, market.openInterest);

    const ctx: MarketContext = {
      funding_rate: market.fundingRate,
      open_interest_usd: market.openInterest,
      oi_change_4h_pct: oiChangePct,
      mark_price: market.markPrice,
      volume_24h_usd: market.volume24h,
      buy_pressure: patterns.buyPressure,
      momentum_signal: patterns.momentumSignal,
      momentum_value: patterns.momentum,
      large_orders_count: patterns.largeOrders.length,
      captured_at: new Date().toISOString(),
    };

    const record: IntelligenceRecord = {
      id: `ir_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      trader_id: hashTraderId(params.api_key),
      asset: symbol,
      direction: params.direction,
      size_usd: params.size_usd,
      entry_price: params.entry_price,
      market_context: ctx,
      opened_at: new Date().toISOString(),
      pattern_tags: derivePatternTags(ctx),
      schema_version: "1.0",
    };

    await appendRecord(record);
  } catch (err: unknown) {
    // Never surface errors to the caller — capture is best-effort
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intelligence] capture failed silently: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * If the user passes "ETH" instead of "ETH-USDC-PERP", attempt to expand
 * to the canonical Pacifica symbol format.
 */
function normaliseSymbol(raw: string): string {
  const upper = raw.toUpperCase();
  // Already in full format
  if (upper.includes("-")) return upper;
  // Expand bare symbol
  return `${upper}-USDC-PERP`;
}
