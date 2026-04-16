// ---------------------------------------------------------------------------
// Pattern matcher — evaluates a Pattern's `when:` / `exit:` against a
// MarketContext. This is the runtime bridge between user-authored patterns
// and the live market snapshot the intelligence capture layer produces.
// ---------------------------------------------------------------------------

import type { MarketContext } from "../intelligence/schema.js";
import type { Pattern, PatternCondition } from "./types.js";

export function evaluateCondition(
  ctx: MarketContext,
  cond: PatternCondition,
): boolean {
  const raw = ctx[cond.axis as keyof MarketContext];
  if (typeof raw !== "number") return false;
  switch (cond.op) {
    case "lt": return raw < cond.value;
    case "lte": return raw <= cond.value;
    case "gt": return raw > cond.value;
    case "gte": return raw >= cond.value;
    case "eq": return raw === cond.value;
  }
}

export interface PatternMatch {
  pattern: Pattern;
  matched: boolean;
  /** Per-condition result so the caller can explain the decision. */
  conditions: Array<{ cond: PatternCondition; passed: boolean; actual: number | undefined }>;
}

/** All `when:` must be true (AND). */
export function matchWhen(ctx: MarketContext, pattern: Pattern): PatternMatch {
  const conditions = pattern.when.map((cond) => {
    const actual = ctx[cond.axis as keyof MarketContext];
    return {
      cond,
      passed: evaluateCondition(ctx, cond),
      actual: typeof actual === "number" ? actual : undefined,
    };
  });
  return {
    pattern,
    matched: conditions.every((c) => c.passed),
    conditions,
  };
}

/** Any `exit:` true (OR) means exit. Returns false when no exit rules defined. */
export function shouldExit(ctx: MarketContext, pattern: Pattern): boolean {
  if (pattern.exit.length === 0) return false;
  return pattern.exit.some((cond) => evaluateCondition(ctx, cond));
}
