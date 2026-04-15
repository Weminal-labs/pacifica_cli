# Phase 2: Equity Curve & Scenario Chart

## Overview

| Field | Value |
|-------|-------|
| **Date** | 2026-04-15 |
| **Priority** | High |
| **Status** | Planned |
| **Estimated effort** | 2–3 days |
| **Depends on** | Phase 1 (BacktestPanel + backtest endpoint) |

### Context Links
- Master plan: [plan.md](./plan.md)
- Previous phase: [phase-01-pattern-intelligence-connect.md](./phase-01-pattern-intelligence-connect.md)
- Next phase: [phase-03-agent-recipe-export.md](./phase-03-agent-recipe-export.md)
- Simulate page: `web/app/simulate/page.tsx`
- BacktestPanel (Phase 1 output): `web/components/BacktestPanel.tsx`

---

## Key Insight

The `equity_curve` and `outcomes` arrays returned by Phase 1's backtest endpoint
are ready-made charting data. No OHLCV, no candles, no price feeds — just:

- **Equity curve**: sequential `{ index, cumulative_pnl, trade_pnl }` points
- **Scenario overlay**: user's hypothetical P&L points + historical outcome scatter
- **Duration distribution**: list of `{ duration_minutes, profitable }` pairs

Recharts is the preferred charting library. Before installing, check `package.json`
in `web/` — if recharts is already present, use it. If not, install as a web
dependency only.

---

## Requirements

### Chart 1: Scenario Chart (replaces static P&L bars)

1. X-axis: price change percentage (`-30%` to `+30%`)
2. Y-axis: P&L in USD
3. **User's scenario line**: a smooth line drawn through the 6 P&L scenario points
   already computed by the `simulate()` function (the existing ±5/10/20% scenarios).
   This replaces the current static list of coloured bars.
4. **Historical scatter overlay**: plot each `outcome` from the backtest response
   as a semi-transparent dot. Map `pnl_pct * leverage` (approximate) to the
   X-axis and `pnl_usd` (if available) or `(pnl_pct * size_usd / 100)` to Y.
5. Breakeven line: a faint horizontal line at Y=0.
6. Liquidation zone: a shaded region below the liquidation P&L (total margin loss).
7. Responsive: full width of the results column.

### Chart 2: Equity Curve

8. A `LineChart` of `equity_curve[].cumulative_pnl` over `equity_curve[].index`.
9. Renders inside `BacktestPanel` (Phase 1 component) as a new lower section.
10. Y-axis label: "Cumulative P&L (%)"
11. Show a reference line at Y=0 (breakeven).
12. Colour the line green when cumulative_pnl is positive, red when negative.
   - Simplest approach: use a single green stroke colour and apply CSS opacity
     based on final cumulative value (green if positive, red if negative).
   - Ideal: use recharts `linearGradient` fill — green above zero, red below.
13. Tooltip on hover: show trade number, individual trade P&L, cumulative P&L.
14. Max drawdown annotation: a small badge showing "Max Drawdown: -23.4%" positioned
    at the lowest point on the curve.

### Chart 3: Duration Distribution

15. A simple horizontal bar chart (or grouped bars) showing the distribution of
    `duration_minutes` for historical matched trades.
16. Bucket the duration into bins: < 1h, 1–4h, 4–24h, 1–7d, > 7d
17. Each bar coloured by profitability: win fraction green, loss fraction red.
18. Shows the user "how long similar trades typically run".
19. Rendered as a new card below the equity curve.

### Context Cards

20. Three mini context cards displayed in a row at the top of the chart section:
    - **Best Trade**: highest pnl_pct in matched set, with duration
    - **Worst Trade**: lowest pnl_pct, with duration
    - **Most Common Hold**: the most populated duration bucket
21. Each card: `bg-[#111111] border border-neutral-500/10` to match existing UI.

---

## Architecture

```
BacktestPanel.tsx (Phase 1 base)
  ├── [existing] Stat grid (win rate, avg P&L, avg hold, liq rate)
  ├── [new] EquityCurveChart  → equity_curve[] from backtest response
  ├── [new] DurationDistribution → outcomes[].duration_minutes bucketed
  └── [new] Context cards (Best / Worst / Most Common Hold)

SimulateForm results column
  ├── Summary card (existing)
  ├── [modified] ScenarioChart  ← replaces static P&L bar list
  │     ├── User scenario line (from SimResult.scenarios)
  │     └── Historical scatter (from BacktestResult.outcomes)
  ├── BacktestPanel (Phase 1 + Phase 2 charts)
  └── Funding projections card (existing)
```

### ScenarioChart component

```typescript
// web/components/ScenarioChart.tsx
interface Props {
  scenarios: SimResult["scenarios"];       // from simulate() calc
  entryPrice: number;
  leverage: number;
  sizeUsd: number;
  historicalOutcomes?: BacktestOutcome[];  // optional — from backtest endpoint
}
```

The component renders a Recharts `ComposedChart`:
- `Line` for the user's scenario curve (6 data points, interpolated)
- `Scatter` for historical outcomes (semi-transparent, smaller dots)
- `ReferenceLine` at y=0 for breakeven
- Custom `Tooltip` showing both scenario P&L and any historical trade nearby

### Colour system

All chart colours must use the existing Pacifica design tokens:
- Green: `#22c55e` (Tailwind green-500)
- Red: `#ef4444` (Tailwind red-500)
- Orange accent: `#f97316` (Tailwind orange-500)
- Background: `#111111`
- Grid lines: `rgba(255,255,255,0.05)` (very faint)
- Axis text: `#737373` (Tailwind neutral-500)

### Recharts configuration

```typescript
// Common chart props pattern
<ResponsiveContainer width="100%" height={200}>
  <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
    <XAxis dataKey="index" tick={{ fill: "#737373", fontSize: 10 }} />
    <YAxis tick={{ fill: "#737373", fontSize: 10 }} />
    <Tooltip
      contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0 }}
    />
    <Line type="monotone" dataKey="cumulative_pnl" stroke="#22c55e" dot={false} strokeWidth={1.5} />
    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
  </LineChart>
</ResponsiveContainer>
```

---

## Related Code Files

| File | Relationship |
|------|-------------|
| `web/components/BacktestPanel.tsx` | Extend with EquityCurveChart, DurationDistribution, context cards |
| `web/components/ScenarioChart.tsx` | New file — replaces P&L bar list in simulate results |
| `web/app/simulate/page.tsx` | Replace P&L scenarios card with `ScenarioChart` component |
| `web/package.json` | Check/add `recharts` dependency |

---

## Implementation Steps

1. **Check recharts availability**
   - Read `web/package.json` and check `dependencies`
   - If not present: `npm install recharts` in the `web/` directory
   - Confirm TypeScript types: `@types/recharts` or check if bundled

2. **Create `web/components/ScenarioChart.tsx`**
   - Accept `scenarios` from `SimResult`, `historicalOutcomes` optionally
   - Convert `scenarios` to Recharts-friendly `[{ pricePct, pnl }]` format
   - Plot user curve as `Line` in orange
   - Plot `historicalOutcomes` as `Scatter` in semi-transparent green/red per profitability
   - Add `ReferenceLine` at 0, liquidation zone as `ReferenceArea`
   - Export as named component

3. **Extend `BacktestPanel.tsx` with EquityCurveChart section**
   - Add a `showChart: boolean` prop (default true, hidden when `matched < 5`)
   - Render a new `<div className="mt-4 pt-4 border-t border-neutral-500/10">` section
   - Inside: "EQUITY CURVE" label + `ResponsiveContainer` wrapping `LineChart`
   - Data: `data.equity_curve`
   - Apply max drawdown annotation (compute from equity_curve in component)

4. **Add DurationDistribution to BacktestPanel.tsx**
   - Utility function `bucketDurations(outcomes)` → `Map<string, { wins, losses }>`
   - Render a `BarChart` (stacked bars: wins green, losses red) or simple CSS bars
   - Simple CSS bars may be cleaner than a full Recharts chart for 5 buckets

5. **Add context cards row to BacktestPanel.tsx**
   - Compute best/worst from `data.outcomes`
   - Most common hold: the bucket with highest (wins + losses) count
   - Render 3 cards in `grid grid-cols-3 gap-2`

6. **Update simulate/page.tsx**
   - Import `ScenarioChart`
   - Replace the P&L scenarios card `<div>` with `<ScenarioChart scenarios={result.scenarios} ... />`
   - Pass `backtestOutcomes` from BacktestPanel's fetched data down to ScenarioChart
   - This requires lifting backtest data state up to `SimulateForm` or using a shared
     context — prefer lifting state since the component tree is shallow

7. **Test all empty states**
   - `historicalOutcomes = []` → scatter renders nothing, no error
   - `equity_curve = []` → chart renders empty with axes only
   - `matched < 5` → hide equity curve, show "insufficient data" text

---

## Todo List

- [ ] Check `web/package.json` for recharts; install if missing
- [ ] Create `web/components/ScenarioChart.tsx` with user curve + historical scatter
- [ ] Extend `BacktestPanel.tsx`: add EquityCurveChart section
- [ ] Extend `BacktestPanel.tsx`: add DurationDistribution section
- [ ] Extend `BacktestPanel.tsx`: add Best/Worst/Common Hold context cards
- [ ] Lift backtest data state up in `SimulateForm` to share with ScenarioChart
- [ ] Replace P&L bar list in `simulate/page.tsx` with `ScenarioChart`
- [ ] Verify charts render in dark theme (background, axis colours)
- [ ] Test responsive layout on narrow viewports (lg breakpoint)
- [ ] Test with 0 historical outcomes (empty scatter overlay)
- [ ] Verify `max_drawdown` annotation positions correctly

---

## Success Criteria

- ScenarioChart replaces the static P&L list and renders user curve + historical scatter
- Equity curve renders correctly for both short (< 10 trades) and long (> 50 trades) histories
- Duration distribution shows correct bucket counts matching raw `outcomes` data
- Context cards show accurate best/worst values
- All charts are responsive and readable at `lg` column width
- No crashes on empty or minimal data states

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| recharts not installed in web/ | Medium | Medium | Check package.json first; install if missing |
| X-axis mapping for scatter is inaccurate (no exact price change data in outcomes) | High | Low | Approximate: `pnl_pct / leverage` as proxy for price change direction. Label axis clearly |
| Chart re-renders on every keystroke in form inputs | Medium | Low | Memoize chart with `React.memo` and stable props comparison |
| Max drawdown badge overlaps chart lines on small panels | Medium | Low | Position badge in top-right corner with absolute CSS, not at data point |
| Recharts SSR hydration mismatch in Next.js | Medium | Medium | Wrap charts in `dynamic(() => import(...), { ssr: false })` |

---

## Security Considerations

- All chart data comes from the local intelligence API (read-only, no user data sent to server)
- No XSS risk: chart data is numeric (pnl_pct, duration_minutes), not rendered as HTML
- Ensure `historicalOutcomes` values are validated as numbers before plotting to avoid NaN rendering issues

---

## Next Steps

After Phase 2 is complete:
- Phase 3 ([phase-03-agent-recipe-export.md](./phase-03-agent-recipe-export.md)) adds the
  Recipe Builder panel, which uses the same backtest endpoint data to populate
  expected outcome ranges in the generated recipe
