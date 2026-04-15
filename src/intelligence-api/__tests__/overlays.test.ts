import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DetectedPattern, IntelligenceRecord, TraderReputation } from "../../core/intelligence/schema.js";
import type { PacificaPosition, PacificaFundingPoint } from "../pacifica-client.js";

// Mock the store module before importing the module under test.
// Vitest hoists vi.mock() calls so this runs before the module is loaded.
vi.mock("../../core/intelligence/store.js", () => ({
  loadPatterns: vi.fn(),
  loadRecords: vi.fn(),
  loadReputation: vi.fn(),
}));

import { computeFundingTrend, computeOverlay } from "../overlays.js";
import { loadPatterns, loadRecords, loadReputation } from "../../core/intelligence/store.js";

// ── Typed mock helpers ────────────────────────────────────────────────────────

const mockLoadPatterns = vi.mocked(loadPatterns);
const mockLoadRecords = vi.mocked(loadRecords);
const mockLoadReputation = vi.mocked(loadReputation);

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeFundingPoint(rate: string): PacificaFundingPoint {
  return { t: Date.now(), rate };
}

function makePosition(symbol: string, side: "long" | "short" = "long"): PacificaPosition {
  return {
    symbol,
    side,
    size: "1.0",
    entry_price: "50000",
    mark_price: "51000",
    unrealized_pnl: "1000",
    liquidation_price: "40000",
    leverage: "5",
    margin_mode: "cross",
  };
}

function makePattern(overrides: Partial<DetectedPattern> = {}): DetectedPattern {
  return {
    id: "pat_001",
    name: "Test Pattern",
    conditions: [],
    sample_size: 100,
    win_rate: 0.72,
    avg_pnl_pct: 3.5,
    avg_duration_minutes: 120,
    primary_assets: ["BTC"],
    verified: true,
    last_seen_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<IntelligenceRecord> = {}): IntelligenceRecord {
  return {
    id: "ir_001",
    trader_id: "trader_abc",
    asset: "BTC-USDC-PERP",
    direction: "long",
    size_usd: 10_000,
    entry_price: 50_000,
    market_context: {
      funding_rate: 0.01,
      open_interest_usd: 1_000_000,
      oi_change_4h_pct: 0,
      mark_price: 50_000,
      volume_24h_usd: 5_000_000,
      buy_pressure: 0.6,
      momentum_signal: "bullish",
      momentum_value: 0.5,
      large_orders_count: 2,
      captured_at: "2026-04-01T00:00:00Z",
    },
    opened_at: "2026-04-01T00:00:00Z",
    pattern_tags: [],
    schema_version: "1.0",
    ...overrides,
  };
}

function makeReputation(trader_id: string, score: number): TraderReputation {
  return {
    trader_id,
    total_trades: 50,
    closed_trades: 45,
    overall_win_rate: 0.7,
    overall_rep_score: score,
    accuracy_by_condition: {},
    top_patterns: [],
    last_updated: "2026-04-01T00:00:00Z",
  };
}

// ── computeFundingTrend ───────────────────────────────────────────────────────

describe("computeFundingTrend", () => {
  it("returns 'flat' when given fewer than 2 points", () => {
    expect(computeFundingTrend([])).toBe("flat");
    expect(computeFundingTrend([makeFundingPoint("0.01")])).toBe("flat");
  });

  it("returns 'flat' when there are only recent points and no older window to compare", () => {
    // With 3 or fewer points, the older slice (slice(-6, -3)) will be empty
    const points = [
      makeFundingPoint("0.01"),
      makeFundingPoint("0.02"),
      makeFundingPoint("0.03"),
    ];
    expect(computeFundingTrend(points)).toBe("flat");
  });

  it("returns 'rising' when the recent 3-point average exceeds the older 3-point average", () => {
    // older: 0.01, 0.01, 0.01 → avg 0.01
    // recent: 0.05, 0.06, 0.07 → avg ~0.06
    const points = [
      makeFundingPoint("0.01"),
      makeFundingPoint("0.01"),
      makeFundingPoint("0.01"),
      makeFundingPoint("0.05"),
      makeFundingPoint("0.06"),
      makeFundingPoint("0.07"),
    ];
    expect(computeFundingTrend(points)).toBe("rising");
  });

  it("returns 'falling' when the recent 3-point average is below the older 3-point average", () => {
    // older: 0.08, 0.07, 0.06 → avg 0.07
    // recent: 0.01, 0.01, 0.01 → avg 0.01
    const points = [
      makeFundingPoint("0.08"),
      makeFundingPoint("0.07"),
      makeFundingPoint("0.06"),
      makeFundingPoint("0.01"),
      makeFundingPoint("0.01"),
      makeFundingPoint("0.01"),
    ];
    expect(computeFundingTrend(points)).toBe("falling");
  });

  it("returns 'flat' when recent and older averages differ by less than 0.00001", () => {
    // Identical rates across both windows
    const points = Array.from({ length: 6 }, () => makeFundingPoint("0.0300000"));
    expect(computeFundingTrend(points)).toBe("flat");
  });

  it("handles negative funding rates correctly", () => {
    // older: -0.05, -0.05, -0.05 → avg -0.05
    // recent: -0.01, -0.01, -0.01 → avg -0.01 (higher = rising)
    const points = [
      makeFundingPoint("-0.05"),
      makeFundingPoint("-0.05"),
      makeFundingPoint("-0.05"),
      makeFundingPoint("-0.01"),
      makeFundingPoint("-0.01"),
      makeFundingPoint("-0.01"),
    ];
    expect(computeFundingTrend(points)).toBe("rising");
  });
});

// ── computeOverlay ────────────────────────────────────────────────────────────

describe("computeOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null overlays when preloaded data is empty", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const overlay = await computeOverlay(
      position,
      [],                      // no funding points
      [],                      // no patterns
      [],                      // no records
      new Map(),               // no reputation
    );

    expect(overlay.pattern_match).toBeNull();
    expect(overlay.rep_signal).toBeNull();
    expect(overlay.funding_watch).toBeNull();
  });

  it("does NOT call loadPatterns/loadRecords/loadReputation when all preloaded data is provided", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const patterns: DetectedPattern[] = [];
    const records: IntelligenceRecord[] = [];
    const rep = new Map<string, TraderReputation>();

    await computeOverlay(position, [], patterns, records, rep);

    expect(mockLoadPatterns).not.toHaveBeenCalled();
    expect(mockLoadRecords).not.toHaveBeenCalled();
    expect(mockLoadReputation).not.toHaveBeenCalled();
  });

  it("calls loadPatterns/loadRecords/loadReputation when preloaded data is omitted", async () => {
    mockLoadPatterns.mockResolvedValue([]);
    mockLoadRecords.mockResolvedValue([]);
    mockLoadReputation.mockResolvedValue(new Map());

    const position = makePosition("BTC-USDC-PERP", "long");
    await computeOverlay(position, []);

    expect(mockLoadPatterns).toHaveBeenCalledOnce();
    expect(mockLoadRecords).toHaveBeenCalledOnce();
    expect(mockLoadReputation).toHaveBeenCalledOnce();
  });

  it("returns a pattern_match when a verified pattern matches the position asset", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const pattern = makePattern({
      id: "pat_btc",
      name: "BTC Breakout",
      primary_assets: ["BTC"],
      win_rate: 0.75,
      verified: true,
    });

    const overlay = await computeOverlay(
      position,
      [],
      [pattern],
      [],
      new Map(),
    );

    expect(overlay.pattern_match).not.toBeNull();
    expect(overlay.pattern_match!.pattern_id).toBe("pat_btc");
    expect(overlay.pattern_match!.pattern_name).toBe("BTC Breakout");
    expect(overlay.pattern_match!.win_rate).toBe(0.75);
  });

  it("does not return a pattern_match for unverified patterns", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const pattern = makePattern({
      primary_assets: ["BTC"],
      verified: false,
    });

    const overlay = await computeOverlay(position, [], [pattern], [], new Map());

    expect(overlay.pattern_match).toBeNull();
  });

  it("selects the highest win-rate verified pattern when multiple match", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const lowWinRate = makePattern({ id: "pat_low", name: "Low", primary_assets: ["BTC"], win_rate: 0.50 });
    const highWinRate = makePattern({ id: "pat_high", name: "High", primary_assets: ["BTC"], win_rate: 0.85 });

    const overlay = await computeOverlay(position, [], [lowWinRate, highWinRate], [], new Map());

    expect(overlay.pattern_match!.pattern_id).toBe("pat_high");
  });

  it("returns a rep_signal when high-rep traders have open positions in the same direction and asset", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");

    // A high-rep trader with an open long BTC position
    const record = makeRecord({
      trader_id: "trader_alpha",
      asset: "BTC-USDC-PERP",
      direction: "long",
      closed_at: undefined,
    });
    const rep = new Map([["trader_alpha", makeReputation("trader_alpha", 85)]]);

    const overlay = await computeOverlay(position, [], [], [record], rep);

    expect(overlay.rep_signal).not.toBeNull();
    expect(overlay.rep_signal!.count).toBe(1);
    expect(overlay.rep_signal!.top_traders).toContain("trader_alpha");
  });

  it("does not return a rep_signal when the matching trader's rep score is 70 or below", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const record = makeRecord({ trader_id: "trader_low", asset: "BTC-USDC-PERP", direction: "long" });
    const rep = new Map([["trader_low", makeReputation("trader_low", 70)]]);

    const overlay = await computeOverlay(position, [], [], [record], rep);

    expect(overlay.rep_signal).toBeNull();
  });

  it("does not include closed records in rep_signal", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const record = makeRecord({
      trader_id: "trader_closed",
      asset: "BTC-USDC-PERP",
      direction: "long",
      closed_at: "2026-04-01T12:00:00Z", // closed
    });
    const rep = new Map([["trader_closed", makeReputation("trader_closed", 90)]]);

    const overlay = await computeOverlay(position, [], [], [record], rep);

    expect(overlay.rep_signal).toBeNull();
  });

  it("does not return a rep_signal for opposite-direction traders", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const record = makeRecord({ trader_id: "trader_short", asset: "BTC-USDC-PERP", direction: "short" });
    const rep = new Map([["trader_short", makeReputation("trader_short", 90)]]);

    const overlay = await computeOverlay(position, [], [], [record], rep);

    expect(overlay.rep_signal).toBeNull();
  });

  it("returns funding_watch with current rate and trend when funding points are provided", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const fundingPoints: PacificaFundingPoint[] = [
      { t: 1, rate: "0.01" },
      { t: 2, rate: "0.01" },
      { t: 3, rate: "0.01" },
      { t: 4, rate: "0.05" },
      { t: 5, rate: "0.06" },
      { t: 6, rate: "0.07" },
    ];

    const overlay = await computeOverlay(position, fundingPoints, [], [], new Map());

    expect(overlay.funding_watch).not.toBeNull();
    expect(overlay.funding_watch!.current_rate).toBeCloseTo(0.07);
    expect(overlay.funding_watch!.trend).toBe("rising");
    expect(overlay.funding_watch!.next_settlement_ms).toBeGreaterThan(Date.now());
  });

  it("returns null funding_watch when no funding points are provided", async () => {
    const position = makePosition("BTC-USDC-PERP", "long");
    const overlay = await computeOverlay(position, [], [], [], new Map());
    expect(overlay.funding_watch).toBeNull();
  });

  it("matches asset case-insensitively between position symbol and pattern primary_assets", async () => {
    // Position symbol is "btc-usdc-perp" (lowercase), pattern has "BTC"
    const position = makePosition("btc-usdc-perp", "long");
    const pattern = makePattern({ id: "pat_case", primary_assets: ["BTC"], verified: true });

    const overlay = await computeOverlay(position, [], [pattern], [], new Map());

    expect(overlay.pattern_match).not.toBeNull();
    expect(overlay.pattern_match!.pattern_id).toBe("pat_case");
  });
});
