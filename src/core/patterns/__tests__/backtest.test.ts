import { describe, it, expect } from "vitest";
import { parsePattern } from "../loader.js";
import { runBacktest } from "../backtest.js";
import type { Candle } from "../candles.js";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

/** Build `n` flat candles at `price` starting at `t0`, 1h apart. */
function flatCandles(n: number, price: number, t0 = 0, vol = 1): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ t: t0 + i * 3600_000, o: price, h: price, l: price, c: price, v: vol });
  }
  return out;
}

/** Build candles with explicit OHLC values. */
function mk(
  rows: Array<[number, number, number, number, number?]>, // [o,h,l,c,v?]
  t0 = 0,
): Candle[] {
  return rows.map((r, i) => ({
    t: t0 + i * 3600_000,
    o: r[0], h: r[1], l: r[2], c: r[3],
    v: r[4] ?? 1,
  }));
}

// ---------------------------------------------------------------------------
// Price-axis patterns — these DO exercise the matcher with derivable axes
// ---------------------------------------------------------------------------

const priceAboveYaml = (threshold: number, opts: {
  sl?: number; tp?: number; exit?: number | null; side?: "long" | "short";
} = {}) => `
name: price-test-${threshold}
description: test
market: BTC-USDC-PERP
when:
  - axis: mark_price
    op: gt
    value: ${threshold}
entry:
  side: ${opts.side ?? "long"}
  size_usd: 1000
  leverage: 10
  ${opts.sl !== undefined ? `stop_loss_pct: ${opts.sl}` : ""}
  ${opts.tp !== undefined ? `take_profit_pct: ${opts.tp}` : ""}
${opts.exit != null ? `exit:
  - axis: mark_price
    op: lt
    value: ${opts.exit}
` : ""}
`;

// ---------------------------------------------------------------------------
// Pattern with only non-derivable axes (funding/buy_pressure/etc.)
// ---------------------------------------------------------------------------

const nonDerivableYaml = `
name: funding-only
description: test
market: BTC-USDC-PERP
when:
  - axis: funding_rate
    op: lt
    value: -0.0003
  - axis: buy_pressure
    op: gt
    value: 0.6
entry:
  side: long
  size_usd: 500
  leverage: 3
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runBacktest — no signal", () => {
  it("emits zero trades when the when-clause never matches", () => {
    const pattern = parsePattern(priceAboveYaml(200));
    const candles = flatCandles(48, 100);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(0);
    expect(r.summary.n_trades).toBe(0);
    expect(r.summary.total_pnl_usd).toBe(0);
  });
});

describe("runBacktest — single trade, closed at window end", () => {
  it("opens at next candle's open when when:matches and marks-to-market at end", () => {
    const pattern = parsePattern(priceAboveYaml(99));
    // Candle 0: price=100 (when-matches at close) → entry at candle 1 open
    // All candles flat at 100, no SL/TP → window_end exit at candle N-1 close
    const candles = flatCandles(10, 100);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.entry_price).toBe(100);
    expect(t.exit_reason).toBe("window_end");
    expect(t.exit_price).toBe(100);
    expect(t.pnl_usd).toBe(0);
    // Entry was at candle 1 (not candle 0) — no look-ahead.
    expect(new Date(t.entry_time).getTime()).toBe(candles[1].t);
  });
});

describe("runBacktest — stop-loss hit", () => {
  it("exits at SL price intra-candle when low breaches SL (long)", () => {
    // SL 2% below entry. Candle 0 close=100, candle 1 open=100,
    // candle 2 low=97 (breaches SL at 98).
    const pattern = parsePattern(priceAboveYaml(99, { sl: 2 }));
    // After the SL fires we drop close below the trigger (99) so the
    // pattern can't immediately re-enter — keeps the fixture single-trade.
    const candles = mk([
      [100, 100, 100, 100],  // 0: signal at close
      [100, 100, 100, 100],  // 1: entry at open 100
      [100, 101,  97,  97],  // 2: low 97 → SL hit at 98; close 97 (no re-signal)
      [ 97,  98,  97,  97],  // 3: no position, still below trigger
      [ 97,  98,  97,  97],  // 4
    ]);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.exit_reason).toBe("stop_loss");
    expect(t.exit_price).toBeCloseTo(98, 10);
    // pnl = ((98-100)/100) * 1000 * 1 = -20
    expect(t.pnl_usd).toBeCloseTo(-20, 10);
  });
});

describe("runBacktest — take-profit hit", () => {
  it("exits at TP price intra-candle when high breaches TP (long)", () => {
    const pattern = parsePattern(priceAboveYaml(99, { tp: 3 }));
    const candles = mk([
      [100, 100, 100, 100], // signal
      [100, 100, 100, 100], // entry at 100
      [100, 104, 100, 103], // hits TP at 103
      [100, 100, 100, 100],
    ]);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.exit_reason).toBe("take_profit");
    expect(t.exit_price).toBeCloseTo(103, 10);
    // pnl = ((103-100)/100) * 1000 = +30
    expect(t.pnl_usd).toBeCloseTo(30, 10);
  });
});

describe("runBacktest — exit clause fires at next candle open", () => {
  it("flags exit at close, executes at next open", () => {
    // Enter long when price > 99; exit when price < 95.
    const pattern = parsePattern(priceAboveYaml(99, { exit: 95 }));
    const candles = mk([
      [100, 100, 100, 100], // 0: entry signal
      [100, 100, 100, 100], // 1: entry at 100
      [100, 100, 100, 100], // 2: still in position
      [100, 100,  94,  94], // 3: close 94 → exit signal
      [ 96,  96,  96,  96], // 4: exit at open 96
    ]);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.exit_reason).toBe("exit_clause");
    expect(t.exit_price).toBe(96);
  });
});

describe("runBacktest — skipped axes surfaced", () => {
  it("emits zero trades and lists skipped axes when pattern uses only non-derivable conditions", () => {
    const pattern = parsePattern(nonDerivableYaml);
    const candles = flatCandles(30, 100);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(0);
    expect(r.all_conditions_skipped).toBe(true);
    expect(r.skipped_axes).toEqual(
      expect.arrayContaining(["funding_rate", "buy_pressure"]),
    );
  });

  it("runs when at least one when-condition is derivable, lists the rest as skipped", () => {
    // Hybrid pattern: price > 99 AND funding < 0 (second is skipped).
    // Since funding is skipped it evaluates false, AND short-circuits the match.
    // This is the documented behaviour — backtest is stricter than live.
    const yaml = `
name: hybrid
market: BTC-USDC-PERP
when:
  - axis: mark_price
    op: gt
    value: 99
  - axis: funding_rate
    op: lt
    value: 0
entry:
  side: long
  size_usd: 1000
  leverage: 5
`;
    const pattern = parsePattern(yaml);
    const candles = flatCandles(30, 100);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.skipped_axes).toContain("funding_rate");
    expect(r.all_conditions_skipped).toBe(false);
    // Funding condition always false → no entries
    expect(r.trades).toHaveLength(0);
  });
});

describe("runBacktest — no look-ahead guard", () => {
  it("entry time is strictly AFTER the candle that fired the signal", () => {
    const pattern = parsePattern(priceAboveYaml(99));
    const candles = flatCandles(10, 100);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    // Signal fired at candle 0 close; entry time must equal candle 1 open time
    expect(new Date(t.entry_time).getTime()).toBeGreaterThan(candles[0].t);
    expect(new Date(t.entry_time).getTime()).toBe(candles[1].t);
  });
});

describe("runBacktest — summary + cumulative P&L", () => {
  it("reports cumulative PnL, win rate, and drawdown correctly", () => {
    // Two trades: first +30 (TP), then -20 (SL). Win rate 50%, total +10.
    // Max drawdown = 20 (peak 30, trough 10).
    const pattern = parsePattern(priceAboveYaml(99, { sl: 2, tp: 3 }));
    const candles = mk([
      // Trade 1: win
      [100, 100, 100, 100], // 0: signal
      [100, 100, 100, 100], // 1: entry at 100
      [100, 104, 100, 103], // 2: TP hit at 103 → +30
      // flush signal so a new entry can fire
      [ 98,  98,  98,  98], // 3: price below trigger, no signal
      [100, 100, 100, 100], // 4: signal re-fires
      [100, 100, 100, 100], // 5: entry at 100
      [100, 100,  97,  97], // 6: SL hit at 98 → -20
    ]);
    const r = runBacktest(pattern, candles, "BTC-USDC-PERP");
    expect(r.trades).toHaveLength(2);
    expect(r.summary.n_wins).toBe(1);
    expect(r.summary.n_losses).toBe(1);
    expect(r.summary.win_rate).toBe(0.5);
    expect(r.summary.total_pnl_usd).toBeCloseTo(10, 10);
    expect(r.summary.max_drawdown_usd).toBeCloseTo(20, 10);
    expect(r.trades[0].cumulative_pnl_usd).toBeCloseTo(30, 10);
    expect(r.trades[1].cumulative_pnl_usd).toBeCloseTo(10, 10);
  });
});
