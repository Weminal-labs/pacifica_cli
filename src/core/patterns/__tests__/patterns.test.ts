import { describe, it, expect } from "vitest";
import { parsePattern } from "../loader.js";
import { matchWhen, shouldExit, evaluateCondition } from "../matcher.js";
import type { MarketContext } from "../../intelligence/schema.js";

const baseCtx: MarketContext = {
  funding_rate: -0.0005,
  open_interest_usd: 100_000_000,
  oi_change_4h_pct: 8,
  mark_price: 65_000,
  volume_24h_usd: 5_000_000_000,
  buy_pressure: 0.7,
  momentum_signal: "bullish",
  momentum_value: 0.5,
  large_orders_count: 4,
  captured_at: new Date().toISOString(),
};

const validYaml = `
name: funding-carry-btc
description: test
tags: [funding]
market: BTC-USDC-PERP
when:
  - axis: funding_rate
    op: lt
    value: -0.0003
  - axis: oi_change_4h_pct
    op: gt
    value: 5
entry:
  side: long
  size_usd: 500
  leverage: 3
exit:
  - axis: funding_rate
    op: gt
    value: 0
`;

describe("Pattern parser", () => {
  it("parses a valid pattern", () => {
    const p = parsePattern(validYaml);
    expect(p.name).toBe("funding-carry-btc");
    expect(p.when).toHaveLength(2);
    expect(p.entry.side).toBe("long");
    expect(p.entry.leverage).toBe(3);
  });

  it("rejects non-kebab names", () => {
    expect(() => parsePattern(validYaml.replace("funding-carry-btc", "Funding_Carry_BTC"))).toThrow();
  });

  it("rejects missing when clause", () => {
    const bad = validYaml.replace(/when:[\s\S]+?entry:/, "entry:");
    expect(() => parsePattern(bad)).toThrow();
  });

  it("defaults market to ANY when omitted", () => {
    const noMarket = validYaml.replace(/market:.+\n/, "");
    const p = parsePattern(noMarket);
    expect(p.market).toBe("ANY");
  });
});

describe("evaluateCondition", () => {
  it("compares lt/gt/gte correctly", () => {
    expect(evaluateCondition(baseCtx, { axis: "funding_rate", op: "lt", value: 0 })).toBe(true);
    expect(evaluateCondition(baseCtx, { axis: "funding_rate", op: "gt", value: 0 })).toBe(false);
    expect(evaluateCondition(baseCtx, { axis: "large_orders_count", op: "gte", value: 4 })).toBe(true);
  });
});

describe("matchWhen", () => {
  it("matches when all conditions pass", () => {
    const p = parsePattern(validYaml);
    const result = matchWhen(baseCtx, p);
    expect(result.matched).toBe(true);
    expect(result.conditions.every((c) => c.passed)).toBe(true);
  });

  it("fails when any condition fails", () => {
    const p = parsePattern(validYaml);
    const result = matchWhen({ ...baseCtx, funding_rate: 0.001 }, p);
    expect(result.matched).toBe(false);
    expect(result.conditions[0].passed).toBe(false);
  });
});

describe("shouldExit", () => {
  it("fires when exit condition is true", () => {
    const p = parsePattern(validYaml);
    expect(shouldExit({ ...baseCtx, funding_rate: 0.0005 }, p)).toBe(true);
    expect(shouldExit(baseCtx, p)).toBe(false);
  });

  it("returns false when no exit rules", () => {
    const bare = validYaml.replace(/exit:[\s\S]+/, "");
    const p = parsePattern(bare);
    expect(shouldExit(baseCtx, p)).toBe(false);
  });
});
