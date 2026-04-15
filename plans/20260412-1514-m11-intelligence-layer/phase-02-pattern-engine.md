# Phase 02: Pattern Engine + MCP Tools

> Parent plan: [plan.md](./plan.md)
> Spec: [m11-intelligence-layer.md](../../context/features/m11-intelligence-layer.md)
> Depends on: Phase 01 (needs records in store)
> Priority: P1
> Status: todo

---

## Overview

Scan all closed IntelligenceRecords. Group by market condition clusters.
Compute win rates per cluster. Verify patterns above threshold.
Expose via 3 new MCP tools. Reputation scores computed as a side effect.

---

## Key Insights

- Pattern detection is pure computation over the local JSON store — no new API calls
- The condition "axes" are the keys of `MarketContext`: funding_rate, oi_change_4h_pct, buy_pressure, momentum_signal, large_orders_count
- For hackathon: use hardcoded condition thresholds (funding < -0.03, OI change > 10%, etc.) rather than learned thresholds — simpler, still demonstrable
- Reputation is a derived view over pattern accuracy per trader — recompute on demand, not event-driven
- The 3 MCP tools reuse existing MCP server infrastructure (`src/mcp/server.ts`)

---

## Requirements

- Pattern engine runs on-demand (CLI command or API call) — no background daemon in Phase 1
- Minimum sample size: 20 closed trades before a pattern is considered
- Minimum win rate: 60% for verification
- Patterns stored in `~/.pacifica/patterns-verified.json`
- Reputation stored in `~/.pacifica/reputation-scores.json`
- MCP tools return results in < 2 seconds

---

## Architecture

### New files

```
src/core/intelligence/
  engine.ts       ← pattern detection, win-rate calculation, verification
  reputation.ts   ← reputation score computation from closed records

src/mcp/tools/
  intelligence.ts ← 3 new MCP tool definitions (added to server.ts)
```

### Modified files

```
src/mcp/server.ts           ← register 3 new intelligence tools
src/cli/commands/index.ts   ← register `pacifica intelligence` command
src/cli/commands/intelligence.ts ← new CLI command: run engine, show patterns
```

---

## Pattern Detection Logic

### Condition axes and thresholds (Phase 1 — hardcoded)

```typescript
const CONDITION_AXES: PatternAxis[] = [
  { key: "funding_rate",       label: "negative_funding",  op: "lt", value: -0.0003 },
  { key: "funding_rate",       label: "positive_funding",  op: "gt", value: 0.0003  },
  { key: "oi_change_4h_pct",   label: "rising_oi",         op: "gt", value: 10      },
  { key: "oi_change_4h_pct",   label: "falling_oi",        op: "lt", value: -10     },
  { key: "buy_pressure",       label: "high_buy_pressure", op: "gt", value: 0.65    },
  { key: "buy_pressure",       label: "high_sell_pressure",op: "lt", value: 0.35    },
  { key: "momentum_signal",    label: "bullish_momentum",  op: "eq", value: "bullish"},
  { key: "momentum_signal",    label: "bearish_momentum",  op: "eq", value: "bearish"},
  { key: "large_orders_count", label: "whale_activity",    op: "gte",value: 3       },
];
```

### engine.ts core function

```typescript
export function detectPatterns(records: IntelligenceRecord[]): DetectedPattern[] {
  const closed = records.filter(r => r.outcome !== undefined);
  if (closed.length < 20) return [];

  const patterns: DetectedPattern[] = [];

  // Single-condition patterns
  for (const axis of CONDITION_AXES) {
    const matching = closed.filter(r => matchesCondition(r.market_context, axis));
    if (matching.length < 20) continue;

    const win_rate = matching.filter(r => r.outcome!.profitable).length / matching.length;
    if (win_rate < 0.6) continue;

    patterns.push(buildPattern([axis], matching));
  }

  // Two-condition combinations (most interesting)
  for (let i = 0; i < CONDITION_AXES.length; i++) {
    for (let j = i + 1; j < CONDITION_AXES.length; j++) {
      const axes = [CONDITION_AXES[i], CONDITION_AXES[j]];
      const matching = closed.filter(r =>
        axes.every(a => matchesCondition(r.market_context, a))
      );
      if (matching.length < 20) continue;

      const win_rate = matching.filter(r => r.outcome!.profitable).length / matching.length;
      if (win_rate < 0.6) continue;

      patterns.push(buildPattern(axes, matching));
    }
  }

  // Deduplicate: if two-condition pattern has same win_rate as single, prefer two-condition
  return deduplicatePatterns(patterns);
}
```

---

## Reputation Logic

```typescript
export function computeReputation(
  records: IntelligenceRecord[]
): Map<string, TraderReputation> {
  const byTrader = groupBy(records, r => r.trader_id);

  return new Map(
    Object.entries(byTrader).map(([trader_id, recs]) => {
      const closed = recs.filter(r => r.outcome !== undefined);
      const byCondition = groupByConditionTags(closed);

      const accuracy_by_condition: Record<string, ConditionAccuracy> = {};
      for (const [tag, tagRecs] of Object.entries(byCondition)) {
        const profitable = tagRecs.filter(r => r.outcome!.profitable);
        accuracy_by_condition[tag] = {
          condition_key: tag,
          total_trades: tagRecs.length,
          profitable_trades: profitable.length,
          win_rate: profitable.length / tagRecs.length,
          avg_pnl_pct: avg(tagRecs.map(r => r.outcome!.pnl_pct)),
          last_updated: new Date().toISOString(),
        };
      }

      const overall_win_rate = closed.filter(r => r.outcome!.profitable).length / (closed.length || 1);
      // Rep score: 50% win rate weight + 30% condition breadth + 20% trade count (log-scaled)
      const overall_rep_score = computeRepScore(overall_win_rate, Object.keys(accuracy_by_condition).length, closed.length);

      return [trader_id, {
        trader_id,
        total_trades: recs.length,
        closed_trades: closed.length,
        overall_win_rate,
        overall_rep_score,
        accuracy_by_condition,
        top_patterns: topPatternTags(accuracy_by_condition),
        last_updated: new Date().toISOString(),
      }];
    })
  );
}
```

---

## MCP Tools

### Tool 1: `pacifica_intelligence_patterns`

```typescript
{
  name: "pacifica_intelligence_patterns",
  description: "Returns verified market patterns and checks if current conditions match any.",
  inputSchema: {
    market: { type: "string", description: "Market symbol, e.g. ETH-USDC-PERP" },
    min_win_rate: { type: "number", default: 0.6 },
    min_sample_size: { type: "number", default: 20 },
  },
}
```

Handler:
1. Load `patterns-verified.json`
2. Fetch current market conditions via existing `get_market` + `funding_rates` + `pacifica_trade_patterns` tools
3. Match current conditions against each pattern's conditions
4. Return: `{ current_conditions, matching_patterns, all_verified_patterns }`

### Tool 2: `pacifica_intelligence_feed`

```typescript
{
  name: "pacifica_intelligence_feed",
  description: "Live intelligence feed: active patterns, whale activity, high-rep trader signals.",
  inputSchema: {
    limit: { type: "number", default: 20 },
  },
}
```

Handler:
1. Load patterns, reputation scores
2. Fetch whale activity via `pacifica_trade_patterns` on top markets
3. Find open records of traders with rep_score > 70
4. Return: `{ active_patterns, whale_activity, high_rep_signals, generated_at }`

### Tool 3: `pacifica_intelligence_reputation`

```typescript
{
  name: "pacifica_intelligence_reputation",
  description: "Anonymized trader reputation leaderboard, ranked by accuracy.",
  inputSchema: {
    limit: { type: "number", default: 10 },
    sort_by: { type: "string", enum: ["overall_rep_score","win_rate","total_trades"], default: "overall_rep_score" },
  },
}
```

Handler:
1. Load `reputation-scores.json`
2. Sort and limit
3. Return leaderboard with anonymized IDs (truncated hash)

---

## CLI Command: `pacifica intelligence`

```
pacifica intelligence patterns          # show verified patterns
pacifica intelligence patterns --json   # machine-readable
pacifica intelligence reputation        # show leaderboard
pacifica intelligence run               # re-run engine, recompute patterns + rep
pacifica intelligence seed              # (dev) seed mock records
```

---

## Todo

- [ ] Implement `engine.ts` with single + two-condition pattern detection
- [ ] Implement `reputation.ts` with rep score formula
- [ ] Implement `src/mcp/tools/intelligence.ts` (3 tools)
- [ ] Register tools in `server.ts`
- [ ] Implement `src/cli/commands/intelligence.ts`
- [ ] Register command in `index.ts`
- [ ] Test: pattern detection on seed data produces 3+ verified patterns
- [ ] Test: MCP tools return valid JSON
- [ ] Test: rep scores computed correctly for known seed data

---

## Success Criteria

- `pacifica intelligence run` on 80 seeded records produces 3+ verified patterns
- `pacifica_intelligence_patterns({ market: "ETH-USDC-PERP" })` returns matching pattern with win rate
- Patterns persisted to `patterns-verified.json`
- Rep scores persisted to `reputation-scores.json`
- MCP tools respond in < 2s

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Not enough real records for patterns | High (hackathon) | High | Seed data solves this for demo |
| Two-condition combos produce too many patterns | Medium | Low | Cap at 10 patterns, rank by win_rate × sample_size |
| Pattern detection too slow on large dataset | Low | Low | Simple iteration, < 1000 records in Phase 1 |

---

## Next Steps

Phase 03 (Web UI) can start with seed data from Phase 01 while this runs.
Pattern results feed directly into web UI via REST API built in Phase 03.
