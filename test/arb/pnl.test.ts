import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateNetPnl,
  calculateAnnualizedReturn,
  expectedFundingPerInterval,
  checkDailyLossLimit,
  recordDailyLoss,
  buildPnlSummary,
} from "../../src/core/arb/pnl.js";
import type { ArbPosition, ArbLifetimeStats } from "../../src/core/arb/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePosition(overrides: Partial<ArbPosition> = {}): ArbPosition {
  return {
    id: "test-id",
    strategy: "single_sided",
    symbol: "BTC",
    status: "closed",
    leg: {
      side: "ask",
      amount: 0.007,
      entryPrice: 71000,
      clientOrderId: "uuid-1",
      fees: 0,
    },
    openedAt: "2026-04-12T00:00:00.000Z",
    closedAt: "2026-04-12T08:00:00.000Z",
    entryRate: 0.001,
    entryApr: 109.5,
    notionalUsd: 500,
    fundingIntervalsHeld: 1,
    realizedFundingUsd: 0.5,
    realizedPnlUsd: 0,
    totalFeesUsd: 0.5,
    ...overrides,
  };
}

function makeLifetime(overrides: Partial<ArbLifetimeStats> = {}): ArbLifetimeStats {
  return {
    totalFundingCollectedUsd: 0,
    totalFeesPaidUsd: 0,
    totalNetPnlUsd: 0,
    positionsOpened: 0,
    positionsClosed: 0,
    dailyLossUsd: 0,
    dailyLossResetDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateNetPnl
// ---------------------------------------------------------------------------

describe("calculateNetPnl", () => {
  it("returns funding + pnl - fees", () => {
    const pos = makePosition({
      realizedFundingUsd: 0.5,
      realizedPnlUsd: 0,
      totalFeesUsd: 0.5,
    });
    expect(calculateNetPnl(pos)).toBe(0);
  });

  it("is positive when funding exceeds fees", () => {
    const pos = makePosition({
      realizedFundingUsd: 2,
      realizedPnlUsd: 0,
      totalFeesUsd: 0.5,
    });
    expect(calculateNetPnl(pos)).toBeCloseTo(1.5);
  });

  it("is negative when fees exceed funding", () => {
    const pos = makePosition({
      realizedFundingUsd: 0.1,
      realizedPnlUsd: 0,
      totalFeesUsd: 0.5,
    });
    expect(calculateNetPnl(pos)).toBeCloseTo(-0.4);
  });

  it("includes realizedPnlUsd in calculation", () => {
    const pos = makePosition({
      realizedFundingUsd: 1,
      realizedPnlUsd: -0.5,
      totalFeesUsd: 0.25,
    });
    expect(calculateNetPnl(pos)).toBeCloseTo(0.25);
  });
});

// ---------------------------------------------------------------------------
// calculateAnnualizedReturn
// ---------------------------------------------------------------------------

describe("calculateAnnualizedReturn", () => {
  it("returns null for open positions", () => {
    const pos = makePosition({ status: "active", closedAt: undefined });
    expect(calculateAnnualizedReturn(pos)).toBeNull();
  });

  it("returns null for zero notional", () => {
    const pos = makePosition({ notionalUsd: 0 });
    expect(calculateAnnualizedReturn(pos)).toBeNull();
  });

  it("calculates APR for 8-hour hold with net profit", () => {
    // Net profit of $0.5 on $500 over 8h
    const pos = makePosition({
      realizedFundingUsd: 1,
      realizedPnlUsd: 0,
      totalFeesUsd: 0.5,
      notionalUsd: 500,
      openedAt: "2026-04-12T00:00:00.000Z",
      closedAt: "2026-04-12T08:00:00.000Z",
    });
    const result = calculateAnnualizedReturn(pos);
    expect(result).not.toBeNull();
    // net = 0.5 / 500 over 1/3 day → daily return = 0.3%, annual = ~109.5%
    expect(result!).toBeGreaterThan(100);
    expect(result!).toBeLessThan(120);
  });
});

// ---------------------------------------------------------------------------
// expectedFundingPerInterval
// ---------------------------------------------------------------------------

describe("expectedFundingPerInterval", () => {
  it("calculates funding for positive rate", () => {
    const pos = makePosition({ notionalUsd: 1000, entryRate: 0.001 });
    expect(expectedFundingPerInterval(pos)).toBeCloseTo(1.0);
  });

  it("calculates funding for negative rate (abs value)", () => {
    const pos = makePosition({ notionalUsd: 1000, entryRate: -0.002 });
    expect(expectedFundingPerInterval(pos)).toBeCloseTo(2.0);
  });

  it("returns zero for zero rate", () => {
    const pos = makePosition({ notionalUsd: 1000, entryRate: 0 });
    expect(expectedFundingPerInterval(pos)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkDailyLossLimit
// ---------------------------------------------------------------------------

describe("checkDailyLossLimit", () => {
  it("returns exceeded=false when under limit", () => {
    const stats = makeLifetime({ dailyLossUsd: 50 });
    const { exceeded } = checkDailyLossLimit(stats, 200);
    expect(exceeded).toBe(false);
  });

  it("returns exceeded=true at exactly the limit", () => {
    const stats = makeLifetime({ dailyLossUsd: 200 });
    const { exceeded } = checkDailyLossLimit(stats, 200);
    expect(exceeded).toBe(true);
  });

  it("resets counter when date changes", () => {
    const stats = makeLifetime({
      dailyLossUsd: 199,
      dailyLossResetDate: "2026-01-01",
    });
    const { exceeded, stats: updated } = checkDailyLossLimit(stats, 200);
    expect(exceeded).toBe(false);
    expect(updated.dailyLossUsd).toBe(0);
  });

  it("preserves counter on same day", () => {
    const today = new Date().toISOString().slice(0, 10);
    const stats = makeLifetime({ dailyLossUsd: 150, dailyLossResetDate: today });
    const { stats: updated } = checkDailyLossLimit(stats, 200);
    expect(updated.dailyLossUsd).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// recordDailyLoss
// ---------------------------------------------------------------------------

describe("recordDailyLoss", () => {
  it("increments daily loss", () => {
    const stats = makeLifetime({ dailyLossUsd: 100 });
    const result = recordDailyLoss(stats, 50);
    expect(result.dailyLossUsd).toBe(150);
  });

  it("ignores non-positive amounts", () => {
    const stats = makeLifetime({ dailyLossUsd: 100 });
    expect(recordDailyLoss(stats, 0).dailyLossUsd).toBe(100);
    expect(recordDailyLoss(stats, -10).dailyLossUsd).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// buildPnlSummary
// ---------------------------------------------------------------------------

describe("buildPnlSummary", () => {
  it("computes win rate from closed positions", () => {
    const positions: ArbPosition[] = [
      makePosition({ realizedFundingUsd: 2, totalFeesUsd: 0.5 }), // +1.5 winner
      makePosition({ realizedFundingUsd: 0.1, totalFeesUsd: 0.5 }), // -0.4 loser
    ];
    const lifetime = makeLifetime({
      totalFundingCollectedUsd: 2.1,
      totalFeesPaidUsd: 1,
      totalNetPnlUsd: 1.1,
      positionsClosed: 2,
    });
    const summary = buildPnlSummary(positions, lifetime);
    expect(summary.winRate).toBeCloseTo(50);
    expect(summary.positionsClosed).toBe(2);
    expect(summary.activePositions).toBe(0);
  });

  it("counts active positions", () => {
    const positions: ArbPosition[] = [
      makePosition({ status: "active" }),
      makePosition({ status: "pending" }),
      makePosition({ status: "closed" }),
    ];
    const summary = buildPnlSummary(positions, makeLifetime());
    expect(summary.activePositions).toBe(2);
  });

  it("returns 0 win rate when no closed positions", () => {
    const summary = buildPnlSummary([], makeLifetime());
    expect(summary.winRate).toBe(0);
  });
});
