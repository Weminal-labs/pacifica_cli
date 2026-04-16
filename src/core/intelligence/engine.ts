// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Pattern Detection Engine
// ---------------------------------------------------------------------------
// Analyses closed IntelligenceRecords to discover statistically significant
// market patterns, then persists them alongside updated trader reputations.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { loadRecords, savePatterns } from "./store.js";
import { analyzeTradePatterns } from "./patterns.js";
import type { PacificaClient } from "../sdk/client.js";
import type {
  IntelligenceRecord,
  DetectedPattern,
  MarketContext,
  PatternCondition,
  SocialContext,
  SignalConfidence,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Condition axes
// ---------------------------------------------------------------------------

const CONDITION_AXES = [
  { key: "funding_rate",       label: "negative_funding",   op: "lt",  value: -0.0003 },
  { key: "funding_rate",       label: "positive_funding",   op: "gt",  value: 0.0003  },
  { key: "oi_change_4h_pct",   label: "rising_oi",          op: "gt",  value: 10      },
  { key: "oi_change_4h_pct",   label: "falling_oi",         op: "lt",  value: -10     },
  { key: "buy_pressure",       label: "high_buy_pressure",  op: "gt",  value: 0.65    },
  { key: "buy_pressure",       label: "high_sell_pressure", op: "lt",  value: 0.35    },
  { key: "momentum_value",     label: "bullish_momentum",   op: "gt",  value: 0.3     },
  { key: "momentum_value",     label: "bearish_momentum",   op: "lt",  value: -0.3    },
  { key: "large_orders_count", label: "whale_activity",     op: "gte", value: 3       },
] as const;

type ConditionAxis = (typeof CONDITION_AXES)[number];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MIN_SAMPLE_SIZE = 20;
const MIN_WIN_RATE = 0.60;
const MAX_PATTERNS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Test whether a MarketContext satisfies one condition axis.
 */
export function matchesCondition(
  ctx: MarketContext,
  axis: ConditionAxis,
): boolean {
  const raw = ctx[axis.key as keyof MarketContext];
  if (typeof raw !== "number") return false;
  const val = raw;

  if (axis.op === "lt")  return val < axis.value;
  if (axis.op === "gt")  return val > axis.value;
  if (axis.op === "gte") return val >= axis.value;
  return false;
}

/** Compute top-N asset labels by frequency from a set of records. */
function topAssets(records: IntelligenceRecord[], n = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.asset, (counts.get(r.asset) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([asset]) => asset);
}

/** Build a DetectedPattern from a matched record set and its condition labels. */
function buildPattern(
  matching: IntelligenceRecord[],
  axes: readonly ConditionAxis[],
): DetectedPattern {
  const profitable = matching.filter((r) => r.outcome!.profitable);
  const win_rate = profitable.length / matching.length;
  const avg_pnl_pct =
    matching.reduce((s, r) => s + r.outcome!.pnl_pct, 0) / matching.length;
  const avg_duration_minutes =
    matching.reduce((s, r) => s + r.outcome!.duration_minutes, 0) /
    matching.length;

  const conditions: PatternCondition[] = axes.map((ax) => ({
    axis: ax.key,
    op: ax.op,
    value: ax.value,
    label: ax.label,
  }));

  const name = axes
    .map((ax) =>
      ax.label
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" + ");

  const lastSeen = matching.reduce((latest, r) => {
    return r.opened_at > latest ? r.opened_at : latest;
  }, matching[0]!.opened_at);

  const now = new Date().toISOString();

  return {
    id: `pat_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name,
    conditions,
    sample_size: matching.length,
    win_rate,
    avg_pnl_pct,
    avg_duration_minutes,
    primary_assets: topAssets(matching),
    verified: true,
    verified_at: now,
    last_seen_at: lastSeen,
  };
}

// ---------------------------------------------------------------------------
// Core detection logic
// ---------------------------------------------------------------------------

/**
 * Detect statistically significant patterns from a set of closed records.
 *
 * Algorithm:
 *   1. Single-condition sweep — each CONDITION_AXIS independently.
 *   2. Two-condition combination sweep — all unique axis pairs.
 *   3. Filter by MIN_SAMPLE_SIZE and MIN_WIN_RATE.
 *   4. Deduplicate: prefer the two-condition variant when both contain the
 *      same trader set as the single-condition version.
 *   5. Rank by win_rate * log(sample_size + 1), cap at MAX_PATTERNS.
 */
export function detectPatterns(
  records: IntelligenceRecord[],
): DetectedPattern[] {
  // Only closed records with an outcome contribute to analysis
  const closed = records.filter((r) => r.outcome !== undefined);

  if (closed.length === 0) return [];

  const candidates: DetectedPattern[] = [];

  // -------------------------------------------------------------------------
  // Single-condition patterns
  // -------------------------------------------------------------------------
  for (const axis of CONDITION_AXES) {
    const matching = closed.filter((r) => matchesCondition(r.market_context, axis));
    if (matching.length < MIN_SAMPLE_SIZE) continue;

    const profitable = matching.filter((r) => r.outcome!.profitable);
    const win_rate = profitable.length / matching.length;
    if (win_rate < MIN_WIN_RATE) continue;

    candidates.push(buildPattern(matching, [axis]));
  }

  // -------------------------------------------------------------------------
  // Two-condition patterns
  // -------------------------------------------------------------------------
  for (let i = 0; i < CONDITION_AXES.length; i++) {
    for (let j = i + 1; j < CONDITION_AXES.length; j++) {
      const axisA = CONDITION_AXES[i]!;
      const axisB = CONDITION_AXES[j]!;

      const matching = closed.filter(
        (r) =>
          matchesCondition(r.market_context, axisA) &&
          matchesCondition(r.market_context, axisB),
      );

      if (matching.length < MIN_SAMPLE_SIZE) continue;

      const profitable = matching.filter((r) => r.outcome!.profitable);
      const win_rate = profitable.length / matching.length;
      if (win_rate < MIN_WIN_RATE) continue;

      candidates.push(buildPattern(matching, [axisA, axisB]));
    }
  }

  // -------------------------------------------------------------------------
  // Deduplication: if a two-condition pattern subsumes a single-condition one
  // (i.e. the same label appears as a condition in both), keep the two-condition
  // version and drop the single one.
  // -------------------------------------------------------------------------
  const twoCondition = candidates.filter((p) => p.conditions.length === 2);
  const oneCondition = candidates.filter((p) => p.conditions.length === 1);

  const subsumedLabels = new Set<string>();
  for (const two of twoCondition) {
    for (const cond of two.conditions) {
      subsumedLabels.add(cond.label);
    }
  }

  const filteredOne = oneCondition.filter(
    (p) => !subsumedLabels.has(p.conditions[0]!.label),
  );

  const deduped = [...twoCondition, ...filteredOne];

  // -------------------------------------------------------------------------
  // Rank by win_rate * log(sample_size + 1)
  // -------------------------------------------------------------------------
  deduped.sort(
    (a, b) =>
      b.win_rate * Math.log(b.sample_size + 1) -
      a.win_rate * Math.log(a.sample_size + 1),
  );

  return deduped.slice(0, MAX_PATTERNS);
}

// ---------------------------------------------------------------------------
// Signal confidence scoring (onchain pattern + optional social confirmation)
// ---------------------------------------------------------------------------

/**
 * Score a detected pattern against optional social context to produce a
 * combined signal confidence level.
 *
 * Levels:
 *   high        — strong pattern (≥65%) + bullish social spike (≥2×) + high smart score
 *   medium      — pattern confirmed by at least one social signal
 *   low         — pattern below threshold or no social data
 *   unconfirmed — bearish social contradicts a sub-70% pattern
 */
export function scoreConfidence(
  pattern: DetectedPattern,
  social?: SocialContext,
): { confidence: SignalConfidence; reason: string } {
  // Onchain-only base (no social data)
  if (!social) {
    if (pattern.win_rate >= 0.70) {
      return {
        confidence: "medium",
        reason: `Pattern ${(pattern.win_rate * 100).toFixed(0)}% win rate (no social data)`,
      };
    }
    return {
      confidence: "low",
      reason: `Pattern ${(pattern.win_rate * 100).toFixed(0)}% win rate`,
    };
  }

  const socialBullish =
    social.sentiment === "bullish" && social.smart_follower_score > 0.5;
  const velocitySpike = social.mention_velocity > 2.0;

  // High: strong onchain pattern + both social signals confirm
  if (pattern.win_rate >= 0.65 && socialBullish && velocitySpike) {
    return {
      confidence: "high",
      reason: `Pattern ${(pattern.win_rate * 100).toFixed(0)}% + bullish social spike (${social.mention_velocity.toFixed(1)}×) + smart follower score ${(social.smart_follower_score * 100).toFixed(0)}%`,
    };
  }

  // Medium: pattern confirmed by at least one social signal
  if (pattern.win_rate >= 0.60 && (socialBullish || velocitySpike)) {
    return {
      confidence: "medium",
      reason: `Pattern ${(pattern.win_rate * 100).toFixed(0)}% + partial social confirmation`,
    };
  }

  // Unconfirmed: bearish social contradicts a sub-70% pattern
  if (social.sentiment === "bearish" && pattern.win_rate < 0.70) {
    return {
      confidence: "unconfirmed",
      reason: `Pattern valid but social sentiment bearish — wait for confirmation`,
    };
  }

  return {
    confidence: "medium",
    reason: `Pattern ${(pattern.win_rate * 100).toFixed(0)}% win rate`,
  };
}

// ---------------------------------------------------------------------------
// Live market scanner
// ---------------------------------------------------------------------------

export interface ActiveSignal {
  asset: string;
  direction: "long" | "short";
  pattern: DetectedPattern;
  fundingRate: number;
  matchedConditions: string[];
  /** true = all pattern conditions confirmed; false = funding matched, others unresolvable */
  fullMatch: boolean;
}

// Axes we can always compute from a single API snapshot
const SCAN_RELIABLE_AXES = new Set([
  "funding_rate",
  "buy_pressure",
  "momentum_value",
  "large_orders_count",
]);
// oi_change_4h_pct requires two readings — cannot be confirmed in a one-shot scan

/**
 * Fetch live market data and find which markets currently match verified patterns.
 *
 * - Fetches all markets; focuses on the top 25 by |fundingRate| (most interesting).
 * - For each, fetches recent trades to compute buy pressure, momentum, whale counts.
 * - Matches conditions against every verified pattern using the same logic as capture.
 * - Returns one signal per market+pattern match, sorted by pattern win_rate desc.
 */
export async function scanForActiveSignals(
  sdk: PacificaClient,
  patterns: DetectedPattern[],
): Promise<ActiveSignal[]> {
  if (patterns.length === 0) return [];

  const markets = await sdk.getMarkets();

  // Pick the most interesting markets by absolute funding rate
  const candidates = [...markets]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, 25);

  // Fetch recent trades for all candidates in parallel
  const tradeResults = await Promise.allSettled(
    candidates.map((m) => sdk.getRecentTrades(m.symbol).catch(() => [])),
  );

  const signals: ActiveSignal[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const market = candidates[i]!;
    const tradesResult = tradeResults[i];
    const trades =
      tradesResult?.status === "fulfilled" ? tradesResult.value : [];

    const tp = analyzeTradePatterns(
      market.symbol,
      trades,
      market.markPrice ?? market.price,
      50_000,
    );

    const ctx: MarketContext = {
      funding_rate: market.fundingRate,
      open_interest_usd: market.openInterest ?? 0,
      oi_change_4h_pct: 0, // requires two readings — not available in a one-shot scan
      mark_price: market.markPrice ?? market.price,
      volume_24h_usd: market.volume24h ?? 0,
      buy_pressure: tp.buyPressure,
      momentum_signal: tp.momentumSignal,
      momentum_value: tp.momentum,
      large_orders_count: tp.largeOrders.length,
      captured_at: new Date().toISOString(),
    };

    const hasTrades = trades.length >= 5;

    for (const pattern of patterns) {
      const matchedConditions: string[] = [];
      let hasReliableHit = false; // at least one funding condition confirmed
      let fullMatch = true;

      for (const cond of pattern.conditions) {
        const axis = {
          key: cond.axis,
          label: cond.label,
          op: cond.op,
          value: cond.value,
        } as Parameters<typeof matchesCondition>[1];

        const isReliable = SCAN_RELIABLE_AXES.has(cond.axis) &&
          (cond.axis !== "buy_pressure" || hasTrades) &&
          (cond.axis !== "momentum_value" || hasTrades) &&
          (cond.axis !== "large_orders_count" || hasTrades);

        if (!isReliable) {
          // Can't verify — treat as unresolved (don't fail the match)
          fullMatch = false;
          continue;
        }

        const ok = matchesCondition(ctx, axis);
        if (!ok) { fullMatch = false; hasReliableHit = false; break; }
        matchedConditions.push(cond.label);
        if (cond.axis === "funding_rate") hasReliableHit = true;
      }

      // Require at least one confirmed condition (funding is the minimum bar)
      if (matchedConditions.length === 0 || !hasReliableHit) continue;

      // Derive direction from pattern conditions
      const condLabels = pattern.conditions.map((c) => c.label);
      let direction: "long" | "short" = "long";
      if (condLabels.includes("positive_funding") && condLabels.includes("falling_oi")) {
        direction = "short";
      } else if (condLabels.includes("high_sell_pressure") || condLabels.includes("bearish_momentum")) {
        direction = "short";
      } else if (condLabels.includes("negative_funding")) {
        direction = "long";
      }

      signals.push({
        asset: market.symbol,
        direction,
        pattern,
        fundingRate: market.fundingRate,
        matchedConditions,
        fullMatch,
      });
    }
  }

  // One signal per asset — keep the best pattern match per market
  const seen = new Map<string, ActiveSignal>();
  for (const s of signals) {
    const existing = seen.get(s.asset);
    if (!existing || s.pattern.win_rate > existing.pattern.win_rate) {
      seen.set(s.asset, s);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => b.pattern.win_rate - a.pattern.win_rate,
  );
}

