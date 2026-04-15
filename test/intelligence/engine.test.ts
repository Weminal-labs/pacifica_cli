// ---------------------------------------------------------------------------
// Tests — Intelligence Pattern Detection Engine
// ---------------------------------------------------------------------------
// Covers: detectPatterns(), matchesCondition(), scanForActiveSignals()
// No API key required — PacificaClient is mocked throughout.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPatterns, matchesCondition, scanForActiveSignals } from "../../src/core/intelligence/engine.js";
import type { IntelligenceRecord, MarketContext, DetectedPattern } from "../../src/core/intelligence/schema.js";

// ---------------------------------------------------------------------------
// Mock store + patterns (engine internals persist to disk — skip that)
// ---------------------------------------------------------------------------

vi.mock("../../src/core/intelligence/store.js", () => ({
  loadRecords:    vi.fn(async () => []),
  savePatterns:   vi.fn(async () => {}),
  loadReputation: vi.fn(async () => new Map()),
  saveReputation: vi.fn(async () => {}),
}));

vi.mock("../../src/core/intelligence/reputation.js", () => ({
  computeReputation: vi.fn(() => new Map()),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    funding_rate:       0,
    open_interest_usd:  1_000_000,
    oi_change_4h_pct:   0,
    mark_price:         100,
    volume_24h_usd:     500_000,
    buy_pressure:       0.5,
    momentum_signal:    "neutral",
    momentum_value:     0,
    large_orders_count: 0,
    captured_at:        new Date().toISOString(),
    ...overrides,
  };
}

function makeRecord(overrides: Partial<IntelligenceRecord> = {}): IntelligenceRecord {
  return {
    id:          `ir_${Math.random().toString(36).slice(2, 10)}`,
    trader_id:   "trader_a",
    asset:       "ETH-USDC-PERP",
    direction:   "long",
    size_usd:    500,
    entry_price: 2000,
    market_context: makeCtx(),
    opened_at:   new Date().toISOString(),
    pattern_tags: [],
    schema_version: "1.0",
    ...overrides,
  };
}

function makeClosedRecord(profitable: boolean, ctx?: Partial<MarketContext>): IntelligenceRecord {
  return makeRecord({
    market_context: makeCtx(ctx),
    outcome: {
      closed_at:        new Date().toISOString(),
      exit_price:       profitable ? 2100 : 1900,
      pnl_usd:          profitable ? 50 : -50,
      pnl_pct:          profitable ? 5 : -5,
      profitable,
      duration_minutes: 240,
    },
  });
}

// ---------------------------------------------------------------------------
// matchesCondition
// ---------------------------------------------------------------------------

describe("matchesCondition", () => {
  it("lt: returns true when value is below threshold", () => {
    const ctx = makeCtx({ funding_rate: -0.001 });
    expect(matchesCondition(ctx, { key: "funding_rate", label: "negative_funding", op: "lt", value: -0.0003 })).toBe(true);
  });

  it("lt: returns false when value is above threshold", () => {
    const ctx = makeCtx({ funding_rate: 0.001 });
    expect(matchesCondition(ctx, { key: "funding_rate", label: "negative_funding", op: "lt", value: -0.0003 })).toBe(false);
  });

  it("gt: returns true when value exceeds threshold", () => {
    const ctx = makeCtx({ buy_pressure: 0.8 });
    expect(matchesCondition(ctx, { key: "buy_pressure", label: "high_buy_pressure", op: "gt", value: 0.65 })).toBe(true);
  });

  it("gt: returns false when value is below threshold", () => {
    const ctx = makeCtx({ buy_pressure: 0.5 });
    expect(matchesCondition(ctx, { key: "buy_pressure", label: "high_buy_pressure", op: "gt", value: 0.65 })).toBe(false);
  });

  it("gte: returns true when value equals threshold", () => {
    const ctx = makeCtx({ large_orders_count: 3 });
    expect(matchesCondition(ctx, { key: "large_orders_count", label: "whale_activity", op: "gte", value: 3 })).toBe(true);
  });

  it("gte: returns false when value is below threshold", () => {
    const ctx = makeCtx({ large_orders_count: 2 });
    expect(matchesCondition(ctx, { key: "large_orders_count", label: "whale_activity", op: "gte", value: 3 })).toBe(false);
  });

  it("returns false when the field is not a number", () => {
    const ctx = makeCtx();
    // momentum_signal is a string, not a number
    expect(matchesCondition(ctx, { key: "momentum_signal" as any, label: "x", op: "gt", value: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectPatterns
// ---------------------------------------------------------------------------

describe("detectPatterns", () => {
  it("returns empty array when no records provided", () => {
    expect(detectPatterns([])).toEqual([]);
  });

  it("returns empty array when all records are open (no outcome)", () => {
    const records = Array.from({ length: 30 }, () => makeRecord());
    expect(detectPatterns(records)).toEqual([]);
  });

  it("ignores records below MIN_SAMPLE_SIZE (20)", () => {
    // Only 10 records with negative funding — not enough to form a pattern
    const records = Array.from({ length: 10 }, () =>
      makeClosedRecord(true, { funding_rate: -0.005 }),
    );
    expect(detectPatterns(records)).toEqual([]);
  });

  it("detects a single-condition pattern when sample and win rate thresholds are met", () => {
    // 25 records: 20 profitable (80% win rate), all with negative funding
    const profitable   = Array.from({ length: 20 }, () => makeClosedRecord(true,  { funding_rate: -0.005 }));
    const unprofitable = Array.from({ length: 5 },  () => makeClosedRecord(false, { funding_rate: -0.005 }));
    const records = [...profitable, ...unprofitable];

    const patterns = detectPatterns(records);
    expect(patterns.length).toBeGreaterThan(0);
    const neg = patterns.find((p) => p.conditions.some((c) => c.label === "negative_funding"));
    expect(neg).toBeDefined();
    expect(neg!.win_rate).toBeCloseTo(20 / 25, 2);
    expect(neg!.sample_size).toBe(25);
  });

  it("does NOT detect a pattern when win rate is below 60%", () => {
    // 25 records, only 12 profitable (48%)
    const profitable   = Array.from({ length: 12 }, () => makeClosedRecord(true,  { funding_rate: -0.005 }));
    const unprofitable = Array.from({ length: 13 }, () => makeClosedRecord(false, { funding_rate: -0.005 }));
    const records = [...profitable, ...unprofitable];

    const patterns = detectPatterns(records);
    const neg = patterns.find((p) => p.conditions.some((c) => c.label === "negative_funding"));
    expect(neg).toBeUndefined();
  });

  it("detects a two-condition pattern when both conditions co-occur with high win rate", () => {
    // 25 records with both negative funding AND high buy pressure, highly profitable
    const ctx: Partial<MarketContext> = { funding_rate: -0.005, buy_pressure: 0.8 };
    const profitable   = Array.from({ length: 20 }, () => makeClosedRecord(true,  ctx));
    const unprofitable = Array.from({ length: 5 },  () => makeClosedRecord(false, ctx));
    const records = [...profitable, ...unprofitable];

    const patterns = detectPatterns(records);
    const twoCondition = patterns.filter((p) => p.conditions.length === 2);
    expect(twoCondition.length).toBeGreaterThan(0);
  });

  it("ranks patterns by win_rate * log(sample_size + 1)", () => {
    // Create two pattern groups: one with higher win rate but small sample
    const highWr = Array.from({ length: 20 }, () =>
      makeClosedRecord(true, { funding_rate: -0.005, buy_pressure: 0.8 }),
    );
    const largeSample = [
      ...Array.from({ length: 50 }, () => makeClosedRecord(true,  { funding_rate: -0.005 })),
      ...Array.from({ length: 15 }, () => makeClosedRecord(false, { funding_rate: -0.005 })),
    ];
    const records = [...highWr, ...largeSample];
    const patterns = detectPatterns(records);
    expect(patterns.length).toBeGreaterThan(0);

    // Check they are sorted descending by the ranking score
    for (let i = 1; i < patterns.length; i++) {
      const prev = patterns[i - 1]!;
      const curr = patterns[i]!;
      const scoreA = prev.win_rate * Math.log(prev.sample_size + 1);
      const scoreB = curr.win_rate * Math.log(curr.sample_size + 1);
      expect(scoreA).toBeGreaterThanOrEqual(scoreB);
    }
  });

  it("caps output at MAX_PATTERNS (10)", () => {
    // Create many distinct condition combinations that all qualify
    const makeGroup = (ctx: Partial<MarketContext>) => [
      ...Array.from({ length: 22 }, () => makeClosedRecord(true,  ctx)),
      ...Array.from({ length: 5 },  () => makeClosedRecord(false, ctx)),
    ];
    const records = [
      ...makeGroup({ funding_rate: -0.005 }),
      ...makeGroup({ buy_pressure: 0.8 }),
      ...makeGroup({ momentum_value: 0.5 }),
      ...makeGroup({ oi_change_4h_pct: 15 }),
      ...makeGroup({ large_orders_count: 4 }),
      ...makeGroup({ funding_rate: 0.005 }),
    ];
    const patterns = detectPatterns(records);
    expect(patterns.length).toBeLessThanOrEqual(10);
  });

  it("computes avg_pnl_pct as the mean of all matching records' pnl", () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({
        market_context: makeCtx({ funding_rate: -0.005 }),
        outcome: {
          closed_at: new Date().toISOString(),
          exit_price: 2100,
          pnl_usd: 10,
          pnl_pct: i % 2 === 0 ? 4 : 6, // alternates 4 and 6 → mean = 5
          profitable: true,
          duration_minutes: 120,
        },
      }),
    );
    const patterns = detectPatterns(records);
    const neg = patterns.find((p) => p.conditions.some((c) => c.label === "negative_funding"));
    expect(neg?.avg_pnl_pct).toBeCloseTo(5, 1);
  });
});

// ---------------------------------------------------------------------------
// scanForActiveSignals
// ---------------------------------------------------------------------------

describe("scanForActiveSignals", () => {
  function makeMockClient(
    fundingRate: number,
    trades: { side: "bid" | "ask"; price: number; size: number }[] = [],
  ) {
    return {
      getMarkets: vi.fn(async () => [
        {
          symbol: "ETH-USDC-PERP",
          fundingRate,
          markPrice: 2000,
          price: 2000,
          openInterest: 1_000_000,
          volume24h: 5_000_000,
        },
      ]),
      getRecentTrades: vi.fn(async () =>
        trades.map((t) => ({
          symbol: "ETH-USDC-PERP",
          side: t.side,
          price: t.price,
          amount: t.size,
          createdAt: new Date().toISOString(),
          pnl: 0, fee: 0, entryPrice: t.price,
        })),
      ),
    } as any;
  }

  it("returns empty array when no patterns provided", async () => {
    const client = makeMockClient(-0.01);
    expect(await scanForActiveSignals(client, [])).toEqual([]);
  });

  it("returns empty array when no market matches any pattern condition", async () => {
    // Pattern requires negative funding, but market has positive funding
    const patterns: DetectedPattern[] = [{
      id: "p1", name: "Negative Funding", conditions: [
        { axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" },
      ],
      sample_size: 50, win_rate: 0.72, avg_pnl_pct: 5, avg_duration_minutes: 200,
      primary_assets: ["ETH-USDC-PERP"], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }];
    const client = makeMockClient(0.005); // positive funding → won't match
    const signals = await scanForActiveSignals(client, patterns);
    expect(signals.length).toBe(0);
  });

  it("returns a LONG signal when negative_funding pattern matches", async () => {
    const patterns: DetectedPattern[] = [{
      id: "p1", name: "Negative Funding", conditions: [
        { axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" },
      ],
      sample_size: 50, win_rate: 0.72, avg_pnl_pct: 5, avg_duration_minutes: 200,
      primary_assets: ["ETH-USDC-PERP"], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }];
    const client = makeMockClient(-0.01); // strong negative funding → matches
    const signals = await scanForActiveSignals(client, patterns);
    expect(signals.length).toBe(1);
    expect(signals[0]!.direction).toBe("long");
    expect(signals[0]!.asset).toBe("ETH-USDC-PERP");
    expect(signals[0]!.pattern.id).toBe("p1");
  });

  it("returns a SHORT signal for positive_funding + falling_oi pattern", async () => {
    const patterns: DetectedPattern[] = [{
      id: "p2", name: "Positive Funding + Falling OI", conditions: [
        { axis: "funding_rate", op: "gt", value: 0.0003, label: "positive_funding" },
        { axis: "oi_change_4h_pct", op: "lt", value: -10, label: "falling_oi" },
      ],
      sample_size: 30, win_rate: 0.65, avg_pnl_pct: 4, avg_duration_minutes: 180,
      primary_assets: ["ETH-USDC-PERP"], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }];
    const client = makeMockClient(0.005); // positive funding → matches first cond
    // falling_oi (oi_change_4h_pct < -10) cannot be confirmed in one-shot → skipped
    const signals = await scanForActiveSignals(client, patterns);
    // funding condition confirmed → signal emitted, direction = short
    expect(signals.length).toBe(1);
    expect(signals[0]!.direction).toBe("short");
  });

  it("keeps only the best-pattern match per asset (highest win_rate)", async () => {
    const p1: DetectedPattern = {
      id: "p1", name: "Pattern A", conditions: [
        { axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" },
      ],
      sample_size: 50, win_rate: 0.65, avg_pnl_pct: 4, avg_duration_minutes: 150,
      primary_assets: [], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    };
    const p2: DetectedPattern = {
      ...p1, id: "p2", name: "Pattern B (better)", win_rate: 0.78,
    };
    const client = makeMockClient(-0.01);
    const signals = await scanForActiveSignals(client, [p1, p2]);
    // Both match, but only the best (p2, win_rate 0.78) is kept
    expect(signals.length).toBe(1);
    expect(signals[0]!.pattern.id).toBe("p2");
  });

  it("returns signals sorted by win_rate descending", async () => {
    // Two markets, different patterns, different win rates
    const mockClient = {
      getMarkets: vi.fn(async () => [
        { symbol: "ETH-USDC-PERP", fundingRate: -0.01, markPrice: 2000, price: 2000, openInterest: 1e6, volume24h: 5e6 },
        { symbol: "BTC-USDC-PERP", fundingRate: -0.005, markPrice: 70000, price: 70000, openInterest: 5e6, volume24h: 50e6 },
      ]),
      getRecentTrades: vi.fn(async () => []),
    } as any;

    const patterns: DetectedPattern[] = [
      {
        id: "p_low",  name: "Low WR",  conditions: [{ axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" }],
        sample_size: 30, win_rate: 0.62, avg_pnl_pct: 3, avg_duration_minutes: 100,
        primary_assets: [], verified: true, verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
      },
      {
        id: "p_high", name: "High WR", conditions: [{ axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" }],
        sample_size: 50, win_rate: 0.78, avg_pnl_pct: 6, avg_duration_minutes: 200,
        primary_assets: [], verified: true, verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
      },
    ];

    const signals = await scanForActiveSignals(mockClient, patterns);
    expect(signals.length).toBe(2); // one per market (best pattern each)
    expect(signals[0]!.pattern.win_rate).toBeGreaterThanOrEqual(signals[1]!.pattern.win_rate);
  });

  it("marks fullMatch=false when oi_change_4h_pct condition cannot be verified", async () => {
    const patterns: DetectedPattern[] = [{
      id: "p3", name: "Neg Funding + Rising OI", conditions: [
        { axis: "funding_rate",     op: "lt",  value: -0.0003, label: "negative_funding" },
        { axis: "oi_change_4h_pct", op: "gt",  value: 10,      label: "rising_oi" },
      ],
      sample_size: 40, win_rate: 0.74, avg_pnl_pct: 6, avg_duration_minutes: 300,
      primary_assets: [], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }];
    const client = makeMockClient(-0.01);
    const signals = await scanForActiveSignals(client, patterns);
    expect(signals.length).toBe(1);
    expect(signals[0]!.fullMatch).toBe(false); // oi condition unresolvable
  });

  it("handles getRecentTrades failure gracefully — still emits signal based on funding", async () => {
    const client = {
      getMarkets: vi.fn(async () => [
        { symbol: "ETH-USDC-PERP", fundingRate: -0.01, markPrice: 2000, price: 2000, openInterest: 1e6, volume24h: 5e6 },
      ]),
      getRecentTrades: vi.fn(async () => { throw new Error("API timeout"); }),
    } as any;

    const patterns: DetectedPattern[] = [{
      id: "p1", name: "Negative Funding", conditions: [
        { axis: "funding_rate", op: "lt", value: -0.0003, label: "negative_funding" },
      ],
      sample_size: 50, win_rate: 0.72, avg_pnl_pct: 5, avg_duration_minutes: 200,
      primary_assets: [], verified: true,
      verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }];

    const signals = await scanForActiveSignals(client, patterns);
    expect(signals.length).toBe(1);
    expect(signals[0]!.asset).toBe("ETH-USDC-PERP");
  });
});
