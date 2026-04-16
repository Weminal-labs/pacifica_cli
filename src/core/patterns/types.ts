// ---------------------------------------------------------------------------
// User-authored Pattern types
// ---------------------------------------------------------------------------
// A Pattern is a trader's rule encoded as YAML at ~/.pacifica/patterns/*.yaml.
// Distinct from DetectedPattern in src/core/intelligence/ — those are mined
// from trade history. A Pattern here is user code.
// ---------------------------------------------------------------------------

import { z } from "zod";

// ---------------------------------------------------------------------------
// Condition DSL — mirrors MarketContext axes used by the intelligence engine
// so a pattern's `when:` can be evaluated against any live MarketContext.
// ---------------------------------------------------------------------------

export const ConditionAxisSchema = z.enum([
  "funding_rate",
  "oi_change_4h_pct",
  "buy_pressure",
  "momentum_value",
  "large_orders_count",
  "open_interest_usd",
  "volume_24h_usd",
  "mark_price",
]);

export const ConditionOpSchema = z.enum(["lt", "lte", "gt", "gte", "eq"]);

export const PatternConditionSchema = z.object({
  axis: ConditionAxisSchema,
  op: ConditionOpSchema,
  value: z.number(),
  label: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Entry + exit blocks
// ---------------------------------------------------------------------------

export const PatternEntrySchema = z.object({
  side: z.enum(["long", "short"]),
  size_usd: z.number().positive(),
  leverage: z.number().min(1).max(50).default(3),
  stop_loss_pct: z.number().positive().optional(),
  take_profit_pct: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// Pattern (the whole artifact)
// ---------------------------------------------------------------------------

export const PatternSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "name must be lowercase kebab-case",
  }),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),

  /** Specific market symbol (e.g. "BTC-USDC-PERP") or "ANY" to scan all. */
  market: z.string().default("ANY"),

  /** Names of other patterns whose `when:` conditions are prepended to ours. */
  include: z.array(z.string()).default([]),

  /** All `when` conditions must be true for the pattern to trigger (AND). */
  when: z.array(PatternConditionSchema).min(1),

  entry: PatternEntrySchema,

  /** Exit conditions (OR — any one firing triggers exit). Optional. */
  exit: z.array(PatternConditionSchema).default([]),
});

export type Pattern = z.infer<typeof PatternSchema>;
export type PatternCondition = z.infer<typeof PatternConditionSchema>;
export type ConditionAxis = z.infer<typeof ConditionAxisSchema>;
export type ConditionOp = z.infer<typeof ConditionOpSchema>;
