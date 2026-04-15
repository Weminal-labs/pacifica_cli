# Phase 1: Intelligence-Connected Simulation

## Overview

| Field | Value |
|-------|-------|
| **Date** | 2026-04-15 |
| **Priority** | Critical — foundation for all other phases |
| **Status** | Planned |
| **Estimated effort** | 2–3 days |

### Context Links
- Master plan: [plan.md](./plan.md)
- Next phase: [phase-02-chart-history.md](./phase-02-chart-history.md)
- Simulate page: `web/app/simulate/page.tsx`
- Intelligence API server: `src/intelligence-api/server.ts`
- Intelligence store: `src/core/intelligence/store.ts`
- Schema types: `src/core/intelligence/schema.ts`

---

## Key Insight

`IntelligenceRecord` objects already encode the full condition → outcome loop.
Each record holds `market_context` (conditions at entry) and `outcome` (pnl_pct,
duration_minutes, profitable, liquidated) for closed trades. A "backtest" is nothing
more than filtering these records to match the user's current setup and running
statistics on the matched outcomes.

**No OHLCV data, no external data source, no additional ingestion pipeline is needed.**
Everything required already lives in `~/.pacifica/intelligence-records.json`.

---

## Requirements

### API (server.ts)

1. New endpoint: `GET /api/intelligence/backtest`
2. Query parameters:
   - `symbol` (required) — e.g. `ETH`, `BTC`
   - `direction` (required) — `long` | `short`
   - `funding_rate_min` (optional) — lower bound for funding rate filter
   - `funding_rate_max` (optional) — upper bound for funding rate filter
   - `leverage_min` (optional) — minimum leverage used in historical trades
   - `leverage_max` (optional) — maximum leverage
   - `buy_pressure_min` (optional) — minimum buy pressure ratio (0.0–1.0)
   - `buy_pressure_max` (optional) — maximum buy pressure ratio
   - `limit` (optional, default 200) — cap on records to scan
3. Response shape:
   ```typescript
   {
     symbol: string;
     direction: "long" | "short";
     matched: number;        // number of historical records matching filters
     win_rate: number;       // 0.0–1.0
     avg_pnl_pct: number;    // mean outcome pnl_pct across matched records
     median_pnl_pct: number;
     avg_duration_minutes: number;
     liquidation_rate: number; // fraction that ended in liquidation
     best_pnl_pct: number;
     worst_pnl_pct: number;
     outcomes: Array<{       // individual outcome points for charting
       pnl_pct: number;
       duration_minutes: number;
       profitable: boolean;
       liquidated: boolean;
       opened_at: string;    // for X-axis ordering
     }>;
     equity_curve: Array<{   // cumulative P&L for chart
       index: number;
       cumulative_pnl: number;
       trade_pnl: number;
     }>;
     generated_at: string;
   }
   ```
4. Return `{ matched: 0, ... }` (not 404) when no records match — the UI should
   show "No historical data for this setup" gracefully.
5. Response cached for 60 seconds per unique query fingerprint (re-use `cacheSet`/`cacheGet`).

### Web: BacktestPanel Component

6. New file: `web/components/BacktestPanel.tsx`
7. Rendered in the simulate results column, below the P&L scenarios card.
8. Fetches from `/api/intelligence/backtest` using the user's current symbol +
   direction whenever `result` (SimResult) is set.
9. Shows loading skeleton while fetching (match existing card border style).
10. When `matched < 5`, render a "Not enough history" notice (5 is minimum
    for meaningful statistics).

### Web: PatternMatch Panel

11. New file: `web/components/PatternMatchPanel.tsx`
12. Auto-queries `/api/intelligence/snapshot/:symbol` when symbol + direction are set
    (reuse the fetch already in `SimulateForm`).
13. Displays `matching_patterns` from the snapshot response.
14. Each pattern shown as a compact row: name, win rate percentage, sample size,
    link to pattern detail page (`/patterns/:id` if it exists, otherwise omit link).
15. Show "Best match" callout for the top pattern by win rate.

---

## Architecture

```
simulate/page.tsx
  └── SimulateForm
        ├── [existing] P&L calc → SimResult
        ├── [new] PatternMatchPanel
        │     └── GET /api/intelligence/snapshot/:sym   (existing endpoint)
        │           → matching_patterns[] + best_pattern_match
        └── [new] BacktestPanel  (renders when result != null)
              └── GET /api/intelligence/backtest?symbol&direction&...
                    └── server.ts: queryBacktest(records, filters)
                          └── loadRecords() → filter → compute stats → equity_curve
```

### Backtest query logic (server.ts)

```typescript
// Pseudocode for the backtest handler
const records = await loadRecords();

// 1. Filter by asset (case-insensitive contains match, same as snapshot endpoint)
let matched = records.filter(r =>
  r.asset.toLowerCase().includes(symbol.toLowerCase()) &&
  r.direction === direction &&
  r.outcome !== undefined   // only closed trades have outcome data
);

// 2. Optional context filters (market_context at entry)
if (funding_rate_min) matched = matched.filter(r => r.market_context.funding_rate >= funding_rate_min);
if (funding_rate_max) matched = matched.filter(r => r.market_context.funding_rate <= funding_rate_max);
if (buy_pressure_min) matched = matched.filter(r => r.market_context.buy_pressure >= buy_pressure_min);
// ...similar for leverage (stored on record as size_usd / margin — calculate ratio)

// 3. Sort by opened_at ascending for equity curve ordering
matched.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

// 4. Cap at limit
matched = matched.slice(0, limit);

// 5. Compute statistics
const outcomes = matched.map(r => ({
  pnl_pct: r.outcome!.pnl_pct,
  duration_minutes: r.outcome!.duration_minutes,
  profitable: r.outcome!.profitable,
  liquidated: r.outcome!.liquidated,
  opened_at: r.opened_at,
}));

const wins = outcomes.filter(o => o.profitable).length;
const win_rate = outcomes.length > 0 ? wins / outcomes.length : 0;
const pnl_values = outcomes.map(o => o.pnl_pct);
const avg_pnl_pct = mean(pnl_values);
const median_pnl_pct = median(pnl_values);

// 6. Equity curve: cumulative sum of pnl_pct in chronological order
let cumulative = 0;
const equity_curve = outcomes.map((o, i) => {
  cumulative += o.pnl_pct;
  return { index: i, cumulative_pnl: cumulative, trade_pnl: o.pnl_pct };
});
```

### BacktestPanel UI layout

```
┌─────────────────────────────────────────────────────────┐
│  HISTORICAL BACKTEST  ·  Based on 47 similar trades      │
├──────────────┬──────────────┬──────────────┬────────────┤
│  WIN RATE    │  AVG P&L     │  AVG HOLD    │  LIQ RATE  │
│    68%       │   +12.3%     │   4.2 hrs    │    2.1%    │
├──────────────┴──────────────┴──────────────┴────────────┤
│  Best: +89.4%   Worst: -45.2%   Median: +8.1%           │
└─────────────────────────────────────────────────────────┘
```

The win rate value uses a colour scale:
- >= 65%: `text-green-400`
- 50–65%: `text-yellow-400`
- < 50%: `text-red-400`

### PatternMatchPanel UI layout

```
┌─────────────────────────────────────────────────────────┐
│  MATCHING PATTERNS                                        │
├─────────────────────────────────────────────────────────┤
│  ★ BEST MATCH                                            │
│  Negative Funding Reversal  ·  72% WR  ·  47 trades     │
│    funding < -0.03%  ·  buy_pressure > 0.6               │
├─────────────────────────────────────────────────────────┤
│  Momentum Long Setup  ·  61% WR  ·  23 trades            │
└─────────────────────────────────────────────────────────┘
```

---

## Related Code Files

| File | Relationship |
|------|-------------|
| `src/intelligence-api/server.ts` | Add new `GET /api/intelligence/backtest` endpoint (around line 820, before `return fastify`) |
| `src/core/intelligence/store.ts` | Uses `loadRecords()` — no changes needed |
| `src/core/intelligence/schema.ts` | Types used: `IntelligenceRecord`, `TradeOutcome`, `MarketContext` |
| `web/app/simulate/page.tsx` | Add `BacktestPanel` and `PatternMatchPanel` imports + render |
| `web/components/BacktestPanel.tsx` | New file |
| `web/components/PatternMatchPanel.tsx` | New file |

---

## Implementation Steps

1. **Add backtest endpoint to `server.ts`**
   - Insert before the final `return fastify` statement
   - Route: `GET /api/intelligence/backtest`
   - Parse and validate query params (symbol, direction required; others optional)
   - Build cache key from query fingerprint string
   - Call `loadRecords()`, filter, compute stats, return response
   - Use `cacheSet` with 60 second TTL

2. **Add helper functions to server.ts** (or a new `src/intelligence-api/backtest.ts`)
   - `computeMedian(values: number[]): number`
   - `computeMean(values: number[]): number`
   - `buildEquityCurve(outcomes): EquityCurvePoint[]`
   - Consider extracting to `backtest.ts` if server.ts grows large

3. **Create `web/components/BacktestPanel.tsx`**
   - Accept props: `symbol: string`, `direction: "long" | "short"`, `visible: boolean`
   - Internal state: `data: BacktestResult | null`, `loading: boolean`, `error: string`
   - `useEffect` watching `[symbol, direction]` to trigger fetch
   - Render loading skeleton (3 grey boxes matching card style) while `loading`
   - Render stat grid (4 columns: win rate, avg P&L, avg hold, liq rate)
   - Render `best / worst / median` summary row
   - "Not enough history" state when `data.matched < 5`
   - Match existing Pacifica dark card style: `bg-[#111111] border border-neutral-500/10`

4. **Create `web/components/PatternMatchPanel.tsx`**
   - Accept props: `symbol: string`, `direction: "long" | "short"`
   - Fetch `/api/intelligence/snapshot/:symbol` (extract to shared hook to avoid
     duplicate fetch with SimulateForm's existing price fetch)
   - Display `matching_patterns` list
   - Highlight `best_pattern_match` with a "BEST MATCH" badge
   - Show condition labels from `pattern.conditions[].label`

5. **Wire into `simulate/page.tsx`**
   - Import `BacktestPanel` and `PatternMatchPanel`
   - Render `PatternMatchPanel` in the left column below the funding rate input
     (always visible once symbol + direction are set)
   - Render `BacktestPanel` in the right results column, below P&L scenarios card
     (visible only when `result !== null`)
   - Pass `sym` (the resolved symbol) and `side` as props

6. **Manual test** with seed data: ensure endpoint returns valid JSON, BacktestPanel
   renders stats correctly, PatternMatchPanel shows pattern names and win rates.

---

## Todo List

- [ ] Add `GET /api/intelligence/backtest` to `src/intelligence-api/server.ts`
- [ ] Write `computeMedian`, `computeMean`, `buildEquityCurve` helpers
- [ ] Add backtest endpoint cache key + 60s TTL
- [ ] Create `web/components/BacktestPanel.tsx`
- [ ] Create `web/components/PatternMatchPanel.tsx`
- [ ] Update `web/app/simulate/page.tsx` to render both panels
- [ ] Test with 0 matched records (empty state)
- [ ] Test with 3 records (< 5 threshold notice)
- [ ] Test with real seed data (>= 5 records)
- [ ] Verify CORS allows the backtest endpoint (origin: localhost:3000 already registered)

---

## Success Criteria

- `GET /api/intelligence/backtest?symbol=ETH&direction=long` returns valid JSON
  with all required fields in under 200ms when records are cached
- BacktestPanel renders without error in both "no data" and "has data" states
- PatternMatchPanel renders the best matching pattern when patterns exist
- No regressions: existing simulate calculator still works identically
- Loading states show skeleton UI, not blank panels

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Intelligence records file empty on fresh install | High | Medium | Return `{ matched: 0 }`, show "No historical data" gracefully |
| Seed data has no closed trades (no `outcome`) | Medium | High | Filter `r.outcome !== undefined` before computing stats |
| Fetch from simulate page fails (API not running) | Medium | Low | Show "Intelligence API offline" notice, don't block calculator |
| CORS rejection on new endpoint | Low | High | Existing CORS config in `createServer()` covers all `/api/` routes |

---

## Security Considerations

- Backtest endpoint is read-only (`GET`), no mutation
- Query params must be validated and coerced to numeric types before comparison
  (use `parseFloat`, check `isNaN`, reject if invalid)
- No user auth required — intelligence data is local and anonymised (no PII)
- Cache key must be sanitized: use a serialized form of validated params, not raw
  query string, to prevent cache poisoning via unusual param formats

---

## Next Steps

After Phase 1 is complete:
- Phase 2 ([phase-02-chart-history.md](./phase-02-chart-history.md)) adds
  interactive charts on top of the `outcomes` and `equity_curve` arrays returned here
- Phase 3 ([phase-03-agent-recipe-export.md](./phase-03-agent-recipe-export.md))
  adds the Recipe Builder panel using this endpoint's response to populate conditions
