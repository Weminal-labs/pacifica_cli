// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Seed Data (DEV ONLY)
// ---------------------------------------------------------------------------
// Generates realistic mock IntelligenceRecords and pre-verified patterns for
// demo and development purposes.  Must never be called in production flows.
// ---------------------------------------------------------------------------

import { randomUUID, createHash } from "node:crypto";
import { savePatterns, saveReputation, appendRecord, loadRecords } from "./store.js";
import type {
  IntelligenceRecord,
  MarketContext,
  TradeOutcome,
  DetectedPattern,
  TraderReputation,
  ConditionAccuracy,
  SocialContext,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSETS = ["BTC-USDC-PERP", "ETH-USDC-PERP", "SOL-USDC-PERP"] as const;

/** Base prices per asset for realistic simulation. */
const BASE_PRICES: Record<string, number> = {
  "BTC-USDC-PERP": 84_000,
  "ETH-USDC-PERP": 2_850,
  "SOL-USDC-PERP": 145,
};

/** Five anonymised fake trader IDs. */
const TRADER_IDS = [
  createHash("sha256").update("trader_alpha_demo").digest("hex"),
  createHash("sha256").update("trader_beta_demo").digest("hex"),
  createHash("sha256").update("trader_gamma_demo").digest("hex"),
  createHash("sha256").update("trader_delta_demo").digest("hex"),
  createHash("sha256").update("trader_epsilon_demo").digest("hex"),
];

// ---------------------------------------------------------------------------
// Randomisation helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursOffset(base: Date, h: number): Date {
  return new Date(base.getTime() + h * 3_600_000);
}

// ---------------------------------------------------------------------------
// Market context generators
// ---------------------------------------------------------------------------

type ScenarioName = "negative_funding_rising_oi" | "whale_bullish" | "high_buy_pressure" | "neutral" | "bearish";

function makeContext(scenario: ScenarioName, basePrice: number): MarketContext {
  const now = new Date().toISOString();

  switch (scenario) {
    case "negative_funding_rising_oi":
      return {
        funding_rate: rand(-0.0008, -0.0003),
        open_interest_usd: rand(80_000_000, 200_000_000),
        oi_change_4h_pct: rand(10, 25),
        mark_price: basePrice * rand(0.98, 1.02),
        volume_24h_usd: rand(50_000_000, 300_000_000),
        buy_pressure: rand(0.52, 0.72),
        momentum_signal: "bullish",
        momentum_value: rand(0.2, 0.8),
        large_orders_count: Math.floor(rand(1, 5)),
        captured_at: now,
        social: Math.random() < 0.7 ? makeSocialContext("bullish_spike") : undefined,
      };

    case "whale_bullish":
      return {
        funding_rate: rand(-0.0005, 0.0001),
        open_interest_usd: rand(100_000_000, 250_000_000),
        oi_change_4h_pct: rand(5, 18),
        mark_price: basePrice * rand(0.97, 1.03),
        volume_24h_usd: rand(80_000_000, 400_000_000),
        buy_pressure: rand(0.55, 0.75),
        momentum_signal: "bullish",
        momentum_value: rand(0.3, 0.9),
        large_orders_count: Math.floor(rand(3, 8)),
        captured_at: now,
        social: Math.random() < 0.65 ? makeSocialContext("bullish_mild") : undefined,
      };

    case "high_buy_pressure":
      return {
        funding_rate: rand(-0.0006, -0.0002),
        open_interest_usd: rand(60_000_000, 150_000_000),
        oi_change_4h_pct: rand(-2, 8),
        mark_price: basePrice * rand(0.99, 1.04),
        volume_24h_usd: rand(40_000_000, 200_000_000),
        buy_pressure: rand(0.65, 0.85),
        momentum_signal: "bullish",
        momentum_value: rand(0.1, 0.6),
        large_orders_count: Math.floor(rand(0, 4)),
        captured_at: now,
        social: Math.random() < 0.5 ? makeSocialContext("bullish_mild") : undefined,
      };

    case "neutral":
      return {
        funding_rate: rand(-0.0001, 0.0001),
        open_interest_usd: rand(40_000_000, 100_000_000),
        oi_change_4h_pct: rand(-5, 5),
        mark_price: basePrice * rand(0.99, 1.01),
        volume_24h_usd: rand(20_000_000, 80_000_000),
        buy_pressure: rand(0.45, 0.55),
        momentum_signal: "neutral",
        momentum_value: rand(-0.1, 0.1),
        large_orders_count: Math.floor(rand(0, 2)),
        captured_at: now,
        social: Math.random() < 0.4 ? makeSocialContext("neutral") : undefined,
      };

    case "bearish":
    default:
      return {
        funding_rate: rand(0.0003, 0.0010),
        open_interest_usd: rand(30_000_000, 90_000_000),
        oi_change_4h_pct: rand(-20, -5),
        mark_price: basePrice * rand(0.95, 1.00),
        volume_24h_usd: rand(15_000_000, 60_000_000),
        buy_pressure: rand(0.25, 0.45),
        momentum_signal: "bearish",
        momentum_value: rand(-0.8, -0.2),
        large_orders_count: Math.floor(rand(0, 3)),
        captured_at: now,
        social: Math.random() < 0.5 ? makeSocialContext("bearish") : undefined,
      };
  }
}

// ---------------------------------------------------------------------------
// Mock social context generator (for seeded records)
// ---------------------------------------------------------------------------

type SocialScenario = "bullish_spike" | "bullish_mild" | "neutral" | "bearish";

function makeSocialContext(scenario: SocialScenario): SocialContext {
  const now = new Date().toISOString();

  switch (scenario) {
    case "bullish_spike":
      return {
        mention_velocity: rand(2.5, 4.5),
        sentiment: "bullish",
        smart_follower_score: rand(0.65, 0.90),
        narrative_tags: pick([
          ["negative funding setup", "accumulation phase"],
          ["Q2 unlock narrative", "ETH ETF inflows"],
          ["whale accumulation", "rising OI divergence"],
        ]),
        top_post_snippets: [
          "Structural setup looks bullish — negative funding with OI building",
          "Smart money has been loading positions for 3 weeks",
        ],
        fetched_at: now,
        source: "elfa",
      };

    case "bullish_mild":
      return {
        mention_velocity: rand(1.5, 2.5),
        sentiment: "bullish",
        smart_follower_score: rand(0.52, 0.68),
        narrative_tags: pick([
          ["buy the dip narrative"],
          ["institutional inflows"],
          ["momentum continuation"],
        ]),
        top_post_snippets: [
          "Good entry zone — watching for confirmation",
          "Volume picking up on the buy side",
        ],
        fetched_at: now,
        source: "elfa",
      };

    case "neutral":
      return {
        mention_velocity: rand(0.8, 1.5),
        sentiment: "neutral",
        smart_follower_score: rand(0.45, 0.55),
        narrative_tags: [],
        top_post_snippets: ["Range-bound — waiting for a clearer signal"],
        fetched_at: now,
        source: "elfa",
      };

    case "bearish":
    default:
      return {
        mention_velocity: rand(1.2, 2.2),
        sentiment: "bearish",
        smart_follower_score: rand(0.25, 0.45),
        narrative_tags: pick([
          ["distribution zone", "smart money selling"],
          ["resistance rejection", "lower highs forming"],
        ]),
        top_post_snippets: [
          "Distribution pattern forming — watching closely",
          "Resistance holding, could be a fade opportunity",
        ],
        fetched_at: now,
        source: "elfa",
      };
  }
}

// ---------------------------------------------------------------------------
// Pattern tag derivation (mirrors capture.ts)
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
// Record generator
// ---------------------------------------------------------------------------

function makeRecord(
  asset: string,
  scenario: ScenarioName,
  direction: "long" | "short",
  profitable: boolean,
  daysBack: number,
  traderId: string,
): IntelligenceRecord {
  const basePrice = BASE_PRICES[asset] ?? 1000;
  const entryCtx = makeContext(scenario, basePrice);
  const entryPrice = entryCtx.mark_price;

  const durationMinutes = Math.floor(rand(30, 1440));
  const pnlPct = profitable
    ? rand(1.5, 12.0) * (direction === "long" ? 1 : 1)
    : rand(-8.0, -0.5);
  const sizeUsd = rand(500, 50_000);
  const pnlUsd = (sizeUsd * Math.abs(pnlPct)) / 100 * (profitable ? 1 : -1);

  const exitPrice =
    direction === "long"
      ? entryPrice * (1 + pnlPct / 100)
      : entryPrice * (1 - pnlPct / 100);

  const openedAt = hoursOffset(daysAgo(daysBack), -Math.floor(rand(0, 20)));
  const closedAt = hoursOffset(openedAt, durationMinutes / 60);

  const exitCtx: MarketContext = {
    ...entryCtx,
    mark_price: exitPrice,
    captured_at: closedAt.toISOString(),
  };

  const outcome: TradeOutcome = {
    pnl_pct: pnlPct * (profitable ? 1 : -1),
    pnl_usd: pnlUsd,
    duration_minutes: durationMinutes,
    exit_price: exitPrice,
    exit_market_context: exitCtx,
    profitable,
    liquidated: false,
  };

  return {
    id: `ir_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    trader_id: traderId,
    asset,
    direction,
    size_usd: sizeUsd,
    entry_price: entryPrice,
    market_context: entryCtx,
    opened_at: openedAt.toISOString(),
    closed_at: closedAt.toISOString(),
    outcome,
    pattern_tags: derivePatternTags(entryCtx),
    schema_version: "1.0",
  };
}

// ---------------------------------------------------------------------------
// Pre-computed verified patterns
// ---------------------------------------------------------------------------

function makeVerifiedPatterns(): DetectedPattern[] {
  const now = new Date().toISOString();

  return [
    {
      id: `pat_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: "Negative Funding + Rising OI",
      conditions: [
        { axis: "funding_rate",     op: "lt", value: -0.0003, label: "funding < -0.03%" },
        { axis: "oi_change_4h_pct", op: "gt", value: 10,      label: "OI change > 10%" },
      ],
      sample_size: 34,
      win_rate: 0.723,
      avg_pnl_pct: 6.8,
      avg_duration_minutes: 420,
      primary_assets: ["ETH-USDC-PERP", "BTC-USDC-PERP"],
      verified: true,
      verified_at: now,
      last_seen_at: hoursOffset(new Date(), -2).toISOString(),
    },
    {
      id: `pat_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: "Whale Activity + Bullish Momentum",
      conditions: [
        { axis: "large_orders_count", op: "gte", value: 3,   label: "whale orders ≥ 3" },
        { axis: "momentum_value",     op: "gt",  value: 0.3, label: "momentum > 0.3" },
      ],
      sample_size: 27,
      win_rate: 0.681,
      avg_pnl_pct: 5.4,
      avg_duration_minutes: 280,
      primary_assets: ["BTC-USDC-PERP", "SOL-USDC-PERP"],
      verified: true,
      verified_at: now,
      last_seen_at: hoursOffset(new Date(), -5).toISOString(),
    },
    {
      id: `pat_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: "High Buy Pressure + Negative Funding",
      conditions: [
        { axis: "buy_pressure",  op: "gt", value: 0.65,   label: "buy pressure > 65%" },
        { axis: "funding_rate",  op: "lt", value: -0.0003, label: "funding < -0.03%" },
      ],
      sample_size: 19,
      win_rate: 0.656,
      avg_pnl_pct: 4.2,
      avg_duration_minutes: 190,
      primary_assets: ["ETH-USDC-PERP", "SOL-USDC-PERP"],
      verified: true,
      verified_at: now,
      last_seen_at: hoursOffset(new Date(), -8).toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Reputation builder
// ---------------------------------------------------------------------------

function buildReputation(records: IntelligenceRecord[]): Map<string, TraderReputation> {
  const repMap = new Map<string, TraderReputation>();

  for (const traderId of TRADER_IDS) {
    const traderRecords = records.filter((r) => r.trader_id === traderId);
    const closed = traderRecords.filter((r) => r.outcome !== undefined);

    const byCondition: Record<string, ConditionAccuracy> = {};
    const allTags = new Set<string>();
    for (const r of closed) {
      for (const tag of r.pattern_tags) allTags.add(tag);
    }

    for (const tag of allTags) {
      const matching = closed.filter((r) => r.pattern_tags.includes(tag));
      const profitable = matching.filter((r) => r.outcome!.profitable);
      byCondition[tag] = {
        condition_key: tag,
        total_trades: matching.length,
        profitable_trades: profitable.length,
        win_rate: matching.length > 0 ? profitable.length / matching.length : 0,
        avg_pnl_pct:
          matching.length > 0
            ? matching.reduce((s, r) => s + r.outcome!.pnl_pct, 0) / matching.length
            : 0,
        last_updated: new Date().toISOString(),
      };
    }

    const overallWinRate =
      closed.length > 0
        ? closed.filter((r) => r.outcome!.profitable).length / closed.length
        : 0;

    // Rep score formula: 50% win rate + 30% breadth + 20% trade count
    const breadthScore = Math.min(
      30,
      Object.keys(byCondition).length > 0
        ? (Math.log(Object.keys(byCondition).length) / Math.log(10)) * 30
        : 0,
    );
    const countScore = Math.min(
      20,
      closed.length > 0
        ? (Math.log10(Math.max(1, closed.length)) / Math.log10(500)) * 20
        : 0,
    );
    const repScore = Math.round(overallWinRate * 50 + breadthScore + countScore);

    repMap.set(traderId, {
      trader_id: traderId,
      total_trades: traderRecords.length,
      closed_trades: closed.length,
      overall_win_rate: overallWinRate,
      overall_rep_score: repScore,
      accuracy_by_condition: byCondition,
      top_patterns: Object.entries(byCondition)
        .sort((a, b) => b[1].win_rate - a[1].win_rate)
        .slice(0, 3)
        .map(([k]) => k),
      last_updated: new Date().toISOString(),
    });
  }

  return repMap;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

/**
 * Seed the intelligence store with realistic mock data.
 *
 * @param count   - Approximate number of records to generate (default: 80).
 * @param clear   - If true, replaces existing records; otherwise appends.
 */
export async function seedIntelligenceData(count = 80, clear = false): Promise<void> {
  if (!clear) {
    const existing = await loadRecords();
    if (existing.length > 0) {
      console.log(`[seed] Store already has ${existing.length} records. Use --clear to overwrite.`);
      return;
    }
  }

  // Scenario distribution for realistic data
  type ScenarioDef = { scenario: ScenarioName; direction: "long" | "short"; pWin: number; weight: number };
  const scenarios: ScenarioDef[] = [
    { scenario: "negative_funding_rising_oi", direction: "long",  pWin: 0.72, weight: 34 },
    { scenario: "whale_bullish",              direction: "long",  pWin: 0.68, weight: 27 },
    { scenario: "high_buy_pressure",          direction: "long",  pWin: 0.65, weight: 19 },
    { scenario: "neutral",                    direction: "long",  pWin: 0.50, weight: 10 },
    { scenario: "bearish",                    direction: "short", pWin: 0.55, weight: 10 },
  ];

  const records: IntelligenceRecord[] = [];
  let remaining = count;

  for (const def of scenarios) {
    const batchSize = Math.round((def.weight / 100) * count);
    const traderPool = TRADER_IDS.slice(0, 3 + Math.floor(Math.random() * 3));

    for (let i = 0; i < batchSize && remaining > 0; i++) {
      const asset = pick(ASSETS);
      const profitable = Math.random() < def.pWin;
      const daysBack = Math.floor(rand(0, 30));
      const traderId = pick(traderPool);

      records.push(
        makeRecord(asset, def.scenario, def.direction, profitable, daysBack, traderId),
      );
      remaining--;
    }
  }

  // Append all records
  for (const record of records) {
    await appendRecord(record);
  }

  // Save pre-verified patterns
  const patterns = makeVerifiedPatterns();
  await savePatterns(patterns);

  // Compute and save reputation
  const repMap = buildReputation(records);
  await saveReputation(repMap);

  console.log(`[seed] Generated ${records.length} intelligence records`);
  console.log(`[seed] Saved ${patterns.length} verified patterns`);
  console.log(`[seed] Computed reputation for ${repMap.size} traders`);
}
