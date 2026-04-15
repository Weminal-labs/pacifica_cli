// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Arb Opportunity Scanner
// ---------------------------------------------------------------------------
// Pure function: no I/O, no side effects. Fully unit-testable.
// ---------------------------------------------------------------------------

import type { Market } from "../sdk/types.js";
import type { ArbOpportunity, ArbPosition, ExternalFundingRate } from "./types.js";
import type { ArbConfig } from "../config/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of 8-hour funding intervals per year */
const INTERVALS_PER_YEAR = 3 * 365; // = 1095

/** Hard blackout before settlement — don't enter within this window */
const ENTRY_BLACKOUT_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// Market scan context (full, unfiltered view)
// ---------------------------------------------------------------------------

export interface MarketScanContext {
  /** Total markets returned from API */
  totalMarkets: number;
  /** Markets that passed the liquidity gate */
  eligibleMarkets: number;
  /** Highest APR found among eligible markets */
  maxAprFound: number;
  /** Symbol with the highest APR */
  maxAprSymbol: string;
  /** Market temperature based on max APR */
  regime: "HOT" | "WARM" | "COLD";
  /** All eligible opportunities sorted by APR desc, no threshold filter */
  allOpportunities: ArbOpportunity[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildExtRateMap(externalRates: ExternalFundingRate[]): Map<string, ExternalFundingRate> {
  const map = new Map<string, ExternalFundingRate>();
  for (const r of externalRates) {
    if (!map.has(r.symbol) || r.source === "binance") {
      map.set(r.symbol, r);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full unfiltered scan — returns all eligible markets sorted by APR desc plus
 * market-wide context (count, max APR, regime). Used by `arb scan` for display.
 * Does NOT filter by min_apr_threshold or cap at available slots.
 */
export function scanAllMarkets(
  markets: Market[],
  config: ArbConfig,
  activePositions: ArbPosition[],
  externalRates: ExternalFundingRate[] = [],
): MarketScanContext {
  const activeSymbols = new Set(
    activePositions
      .filter((p) => p.status === "active" || p.status === "pending")
      .map((p) => p.symbol),
  );

  const extRateMap = buildExtRateMap(externalRates);
  const eligible: ArbOpportunity[] = [];

  for (const market of markets) {
    const symbol = market.symbol.toUpperCase();
    if (activeSymbols.has(symbol)) continue;
    if (!Number.isFinite(market.fundingRate) && !Number.isFinite(market.nextFundingRate)) continue;
    if (market.volume24h < config.min_market_volume_24h_usd) continue;

    const currentRate = market.fundingRate ?? 0;
    const predictedRate = market.nextFundingRate ?? currentRate;
    const effectiveRate = Math.abs(predictedRate) >= Math.abs(currentRate) ? predictedRate : currentRate;
    const annualizedApr = Math.abs(effectiveRate) * INTERVALS_PER_YEAR * 100;
    const bookSpreadBps = estimateSpreadBps(market);

    const extEntry = extRateMap.get(symbol);
    const divergenceBps = config.use_external_rates && extEntry
      ? Math.round((effectiveRate - extEntry.rate) * 10000)
      : undefined;

    const score = computeScore(annualizedApr, market.volume24h, bookSpreadBps, Infinity, divergenceBps, config);
    const side: ArbOpportunity["side"] = effectiveRate > 0 ? "short_collects" : "long_collects";

    eligible.push({
      symbol, currentRate, predictedRate, annualizedApr, side,
      markPrice: market.price, volume24hUsd: market.volume24h,
      bookSpreadBps, nextFundingAt: "", msToFunding: Infinity,
      score,
      externalRate: extEntry?.rate,
      externalSource: extEntry?.source,
      divergenceBps,
    });
  }

  eligible.sort((a, b) => b.annualizedApr - a.annualizedApr);

  const maxApr = eligible[0]?.annualizedApr ?? 0;
  const regime: MarketScanContext["regime"] = maxApr >= 40 ? "HOT" : maxApr >= 10 ? "WARM" : "COLD";

  return {
    totalMarkets: markets.length,
    eligibleMarkets: eligible.length,
    maxAprFound: maxApr,
    maxAprSymbol: eligible[0]?.symbol ?? "—",
    regime,
    allOpportunities: eligible,
  };
}

/**
 * Detect funding rate arb opportunities from the current market snapshot.
 *
 * Returns opportunities sorted by score descending, capped at the number of
 * slots available (max_concurrent_positions - active).
 */
export function detectOpportunities(
  markets: Market[],
  config: ArbConfig,
  activePositions: ArbPosition[],
  externalRates: ExternalFundingRate[] = [],
): ArbOpportunity[] {
  const activeSymbols = new Set(
    activePositions
      .filter((p) => p.status === "active" || p.status === "pending")
      .map((p) => p.symbol),
  );

  const availableSlots =
    config.max_concurrent_positions - activeSymbols.size;

  if (availableSlots <= 0) return [];

  const extRateMap = buildExtRateMap(externalRates);
  const opportunities: ArbOpportunity[] = [];
  const now = Date.now();

  for (const market of markets) {
    const symbol = market.symbol.toUpperCase();

    // 1. Dedupe — skip if we already have an active/pending position
    if (activeSymbols.has(symbol)) continue;

    // 2. Funding data required (both fields are always numeric — just ensure finite)
    if (!Number.isFinite(market.fundingRate) && !Number.isFinite(market.nextFundingRate)) continue;

    // 3. Liquidity gate
    if (market.volume24h < config.min_market_volume_24h_usd) continue;

    // 4. Rate gate — use the dominant of current vs predicted
    const currentRate = market.fundingRate ?? 0;
    const predictedRate = market.nextFundingRate ?? currentRate;
    const effectiveRate =
      Math.abs(predictedRate) >= Math.abs(currentRate)
        ? predictedRate
        : currentRate;

    const annualizedApr = Math.abs(effectiveRate) * INTERVALS_PER_YEAR * 100;
    if (annualizedApr < config.min_apr_threshold) continue;

    // 5. Settlement proximity veto — Pacifica uses 8h intervals
    // nextFundingAt is not in the market snapshot; we use a fixed 8h window
    // and will check proximity more precisely in the executor before placing.
    const msToFunding = Infinity; // conservative — no timestamp in snapshot

    // 6. Spread check (approximate — full book check in executor)
    const bookSpreadBps = estimateSpreadBps(market);
    if (bookSpreadBps > config.max_spread_bps) continue;
    const nextFundingAt = "";

    // 7. Cross-exchange divergence filter
    let externalRate: number | undefined;
    let externalSource: "binance" | "bybit" | undefined;
    let divergenceBps: number | undefined;

    const extEntry = extRateMap.get(symbol);
    if (config.use_external_rates && extEntry) {
      externalRate = extEntry.rate;
      externalSource = extEntry.source;
      divergenceBps = Math.round((effectiveRate - externalRate) * 10000);
      // If divergence is below threshold, score is penalised but not blocked
    }

    // 8. Score
    const score = computeScore(annualizedApr, market.volume24h, bookSpreadBps, msToFunding, divergenceBps, config);

    // 9. Side — who collects funding
    const side: ArbOpportunity["side"] =
      effectiveRate > 0 ? "short_collects" : "long_collects";

    opportunities.push({
      symbol,
      currentRate,
      predictedRate,
      annualizedApr,
      side,
      markPrice: market.price,
      volume24hUsd: market.volume24h,
      bookSpreadBps,
      nextFundingAt,
      msToFunding,
      score,
      externalRate,
      externalSource,
      divergenceBps,
    });
  }

  // Sort by score descending and return only available slots
  return opportunities.sort((a, b) => b.score - a.score).slice(0, availableSlots);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute a composite opportunity score.
 * Higher APR, higher liquidity, lower spread, and more time to settlement → higher score.
 */
function computeScore(
  apr: number,
  volume24h: number,
  spreadBps: number,
  msToFunding: number,
  divergenceBps: number | undefined,
  config: ArbConfig,
): number {
  // Liquidity factor: log10(volume / 1M), capped at 3
  const liquidityFactor = Math.min(Math.log10(Math.max(volume24h, 1e6) / 1e6) + 1, 3);

  // Spread penalty: 1 - spreadBps/100 (0 at 100 bps, 1 at 0 bps)
  const spreadFactor = Math.max(1 - spreadBps / 100, 0.1);

  // Time decay: ramp down linearly from 30 min remaining; flat above 30 min
  const RAMP_MS = 30 * 60 * 1000;
  const timeDecay = msToFunding === Infinity ? 1 : Math.min(msToFunding / RAMP_MS, 1);

  // External divergence bonus (if available)
  let divergenceBonus = 1;
  if (divergenceBps !== undefined) {
    if (Math.abs(divergenceBps) >= config.external_divergence_bps) {
      divergenceBonus = 1.2; // 20% bonus for significant divergence
    } else {
      divergenceBonus = 0.9; // 10% penalty for low divergence
    }
  }

  return apr * liquidityFactor * spreadFactor * timeDecay * divergenceBonus;
}

/**
 * Estimate book spread in bps from available market data.
 * The market snapshot doesn't include order book levels, so we use a
 * conservative default. The executor checks the live book before placing.
 */
function estimateSpreadBps(_market: Market): number {
  return 5; // conservative default; executor will verify before entry
}
