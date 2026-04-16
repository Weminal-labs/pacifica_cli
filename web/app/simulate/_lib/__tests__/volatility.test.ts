// ---------------------------------------------------------------------------
// Tests: volatility math — calcRealisedVol and volatilityScenarios
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  calcRealisedVol,
  volatilityScenarios,
} from "../volatility.js";
import type { Candle } from "../volatility.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a sequence of flat candles — all OHLC equal to `price`. */
function flatCandles(n: number, price: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 3_600_000,
    o: price,
    h: price,
    l: price,
    c: price,
    v: 1,
  }));
}

/**
 * Build candles whose closes follow an arithmetic sequence:
 * first close = `start`, each subsequent close += `step`.
 */
function trendingCandles(n: number, start: number, step: number): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const price = start + i * step;
    return { t: i * 3_600_000, o: price, h: price, l: price, c: price, v: 1 };
  });
}

// ---------------------------------------------------------------------------
// calcRealisedVol — edge cases
// ---------------------------------------------------------------------------

describe("calcRealisedVol — edge cases", () => {
  it("returns 0 for an empty candle array", () => {
    expect(calcRealisedVol([])).toBe(0);
  });

  it("returns 0 for a single candle (no returns can be computed)", () => {
    const candles: Candle[] = [{ t: 0, o: 100, h: 100, l: 100, c: 100, v: 1 }];
    expect(calcRealisedVol(candles)).toBe(0);
  });

  it("returns ~0 for flat candles (no price variation)", () => {
    const vol = calcRealisedVol(flatCandles(100, 50_000));
    expect(vol).toBeCloseTo(0, 8);
  });

  it("returns a positive number for trending (non-flat) candles", () => {
    const candles = trendingCandles(100, 100, 0.5);
    const vol = calcRealisedVol(candles);
    expect(vol).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calcRealisedVol — annualisation
// ---------------------------------------------------------------------------

describe("calcRealisedVol — annualisation", () => {
  it("returns a finite positive number for a realistic 168-candle window", () => {
    // Simulate a week of hourly candles with mild daily volatility.
    const candles = trendingCandles(168, 65_000, 10);
    const vol = calcRealisedVol(candles);
    expect(Number.isFinite(vol)).toBe(true);
    expect(vol).toBeGreaterThan(0);
  });

  it("higher price variance produces higher annualised vol", () => {
    const lowNoise  = trendingCandles(48, 100, 0.1);
    const highNoise = trendingCandles(48, 100, 5);
    expect(calcRealisedVol(highNoise)).toBeGreaterThan(calcRealisedVol(lowNoise));
  });

  it("skips candles with zero or negative closes without throwing", () => {
    const candles: Candle[] = [
      { t: 0,           o: 0,   h: 0,   l: 0,   c: 0,   v: 1 }, // invalid close
      { t: 3_600_000,   o: 100, h: 100, l: 100, c: 100, v: 1 },
      { t: 7_200_000,   o: 101, h: 101, l: 101, c: 101, v: 1 },
    ];
    // Should not throw; valid pair (100→101) contributes.
    expect(() => calcRealisedVol(candles)).not.toThrow();
    expect(calcRealisedVol(candles)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// volatilityScenarios — output shape
// ---------------------------------------------------------------------------

describe("volatilityScenarios — output shape", () => {
  const baseParams = {
    entryPrice:  65_000,
    side:        "long" as const,
    sizeUsd:     1_000,
    leverage:    10,
    realisedVol: 0.8, // 80% annualised — realistic for BTC
  };

  it("always returns exactly 6 scenarios", () => {
    const scenarios = volatilityScenarios(baseParams);
    expect(scenarios).toHaveLength(6);
  });

  it("generates scenarios labelled +1σ, +2σ, +3σ, -1σ, -2σ, -3σ", () => {
    const scenarios = volatilityScenarios(baseParams);
    const labels = scenarios.map((s) => s.label);
    expect(labels).toContain("+1σ");
    expect(labels).toContain("+2σ");
    expect(labels).toContain("+3σ");
    expect(labels).toContain("-1σ");
    expect(labels).toContain("-2σ");
    expect(labels).toContain("-3σ");
  });

  it("scenario prices are always positive", () => {
    const scenarios = volatilityScenarios(baseParams);
    expect(scenarios.every((s) => s.price > 0)).toBe(true);
  });

  it("pnlPct values are finite numbers", () => {
    const scenarios = volatilityScenarios(baseParams);
    expect(scenarios.every((s) => Number.isFinite(s.pnlPct))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// volatilityScenarios — P&L sign correctness
// ---------------------------------------------------------------------------

describe("volatilityScenarios — P&L sign for long positions", () => {
  const longParams = {
    entryPrice:  100,
    side:        "long" as const,
    sizeUsd:     1_000,
    leverage:    1,
    realisedVol: 0.5,
  };

  it("positive sigma scenarios produce positive P&L for a long", () => {
    const scenarios = volatilityScenarios(longParams);
    const up = scenarios.filter((s) => s.label.startsWith("+"));
    expect(up.every((s) => s.pnl > 0)).toBe(true);
  });

  it("negative sigma scenarios produce negative P&L for a long", () => {
    const scenarios = volatilityScenarios(longParams);
    const down = scenarios.filter((s) => s.label.startsWith("-"));
    expect(down.every((s) => s.pnl < 0)).toBe(true);
  });

  it("magnitude of P&L scales with sigma distance", () => {
    const scenarios = volatilityScenarios(longParams);
    const s1 = scenarios.find((s) => s.label === "+1σ")!;
    const s2 = scenarios.find((s) => s.label === "+2σ")!;
    const s3 = scenarios.find((s) => s.label === "+3σ")!;
    expect(s2.pnl).toBeGreaterThan(s1.pnl);
    expect(s3.pnl).toBeGreaterThan(s2.pnl);
  });
});

describe("volatilityScenarios — P&L sign for short positions", () => {
  const shortParams = {
    entryPrice:  100,
    side:        "short" as const,
    sizeUsd:     1_000,
    leverage:    1,
    realisedVol: 0.5,
  };

  it("positive sigma scenarios (price rises) produce negative P&L for a short", () => {
    const scenarios = volatilityScenarios(shortParams);
    const up = scenarios.filter((s) => s.label.startsWith("+"));
    expect(up.every((s) => s.pnl < 0)).toBe(true);
  });

  it("negative sigma scenarios (price falls) produce positive P&L for a short", () => {
    const scenarios = volatilityScenarios(shortParams);
    const down = scenarios.filter((s) => s.label.startsWith("-"));
    expect(down.every((s) => s.pnl > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// volatilityScenarios — leverage and size effects
// ---------------------------------------------------------------------------

describe("volatilityScenarios — leverage amplifies P&L", () => {
  it("10x leverage produces 10x the P&L of 1x leverage for identical notional", () => {
    const base = { entryPrice: 100, side: "long" as const, sizeUsd: 1_000, realisedVol: 0.5 };
    const lev1  = volatilityScenarios({ ...base, leverage: 1 });
    const lev10 = volatilityScenarios({ ...base, leverage: 10 });

    const s1at1x   = lev1.find((s) => s.label === "+1σ")!;
    const s1at10x  = lev10.find((s) => s.label === "+1σ")!;

    // pnlPct is relative to margin, so 10x leverage = 10x bigger pnlPct
    expect(s1at10x.pnlPct).toBeCloseTo(s1at1x.pnlPct * 10, 6);
  });
});

describe("volatilityScenarios — zero vol edge case", () => {
  it("produces zero P&L for all scenarios when realisedVol is 0", () => {
    const params = {
      entryPrice:  100,
      side:        "long" as const,
      sizeUsd:     1_000,
      leverage:    5,
      realisedVol: 0,
    };
    const scenarios = volatilityScenarios(params);
    expect(scenarios.every((s) => s.pnl === 0)).toBe(true);
    expect(scenarios.every((s) => s.pnlPct === 0)).toBe(true);
  });
});
