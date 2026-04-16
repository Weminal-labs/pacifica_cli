import { describe, it, expect } from "vitest";
import { parsePattern, resolveIncludes, PatternParseError } from "../loader.js";
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

// ---------------------------------------------------------------------------
// resolveIncludes
// ---------------------------------------------------------------------------

const basePatternYaml = `
name: base-pattern
description: base
when:
  - axis: mark_price
    op: gt
    value: 70000
entry:
  side: long
  size_usd: 1000
  leverage: 3
`;

const secondBaseYaml = `
name: second-base
description: second
when:
  - axis: buy_pressure
    op: gt
    value: 0.6
entry:
  side: long
  size_usd: 500
  leverage: 2
`;

const composedYaml = `
name: composed-pattern
description: composed
include:
  - base-pattern
when:
  - axis: funding_rate
    op: lt
    value: 0
entry:
  side: long
  size_usd: 500
  leverage: 3
`;

const multiIncludeYaml = `
name: multi-include
description: multi
include:
  - base-pattern
  - second-base
when:
  - axis: funding_rate
    op: lt
    value: 0
entry:
  side: long
  size_usd: 500
  leverage: 3
`;

describe("resolveIncludes", () => {
  it("returns pattern unchanged when no includes", () => {
    const p = parsePattern(validYaml);
    const all = [p];
    const resolved = resolveIncludes(p, all);
    expect(resolved.when).toEqual(p.when);
    expect(resolved).toBe(p); // same reference — no copy needed
  });

  it("prepends included pattern's when conditions", () => {
    const base = parsePattern(basePatternYaml);
    const composed = parsePattern(composedYaml);
    const resolved = resolveIncludes(composed, [base, composed]);

    // base has 1 condition (mark_price), composed has 1 (funding_rate)
    expect(resolved.when).toHaveLength(2);
    expect(resolved.when[0].axis).toBe("mark_price"); // from base
    expect(resolved.when[1].axis).toBe("funding_rate"); // own
  });

  it("composes multiple includes correctly", () => {
    const base = parsePattern(basePatternYaml);
    const second = parsePattern(secondBaseYaml);
    const multi = parsePattern(multiIncludeYaml);
    const resolved = resolveIncludes(multi, [base, second, multi]);

    // base(1) + second(1) + own(1) = 3
    expect(resolved.when).toHaveLength(3);
    expect(resolved.when[0].axis).toBe("mark_price");    // from base-pattern
    expect(resolved.when[1].axis).toBe("buy_pressure");   // from second-base
    expect(resolved.when[2].axis).toBe("funding_rate");   // own
  });

  it("throws PatternParseError for missing include", () => {
    const composed = parsePattern(composedYaml);
    expect(() => resolveIncludes(composed, [composed])).toThrow(PatternParseError);
    expect(() => resolveIncludes(composed, [composed])).toThrow(/unknown pattern "base-pattern"/);
  });

  it("throws PatternParseError for circular include", () => {
    // A includes B, B includes A
    const aYaml = `
name: pattern-a
description: a
include:
  - pattern-b
when:
  - axis: funding_rate
    op: lt
    value: 0
entry:
  side: long
  size_usd: 500
  leverage: 3
`;
    const bYaml = `
name: pattern-b
description: b
include:
  - pattern-a
when:
  - axis: mark_price
    op: gt
    value: 70000
entry:
  side: long
  size_usd: 500
  leverage: 3
`;
    const a = parsePattern(aYaml);
    const b = parsePattern(bYaml);
    expect(() => resolveIncludes(a, [a, b])).toThrow(PatternParseError);
    expect(() => resolveIncludes(a, [a, b])).toThrow(/circular include/);
  });

  it("resolution is flat — included pattern's includes are NOT recursively resolved", () => {
    // grandparent -> parent -> child
    // child includes parent, parent includes grandparent
    // resolving child should only get parent's own conditions, not grandparent's
    const grandparentYaml = `
name: grandparent
description: gp
when:
  - axis: volume_24h_usd
    op: gt
    value: 1000000000
entry:
  side: long
  size_usd: 500
  leverage: 2
`;
    const parentYaml = `
name: parent
description: p
include:
  - grandparent
when:
  - axis: mark_price
    op: gt
    value: 70000
entry:
  side: long
  size_usd: 500
  leverage: 3
`;
    const childYaml = `
name: child
description: c
include:
  - parent
when:
  - axis: funding_rate
    op: lt
    value: 0
entry:
  side: long
  size_usd: 500
  leverage: 3
`;
    const gp = parsePattern(grandparentYaml);
    const parent = parsePattern(parentYaml);
    const child = parsePattern(childYaml);
    const resolved = resolveIncludes(child, [gp, parent, child]);

    // Should only have parent's own when (mark_price) + child's own (funding_rate)
    // NOT grandparent's volume_24h_usd
    expect(resolved.when).toHaveLength(2);
    expect(resolved.when[0].axis).toBe("mark_price");    // from parent (own)
    expect(resolved.when[1].axis).toBe("funding_rate");   // child's own
  });
});
