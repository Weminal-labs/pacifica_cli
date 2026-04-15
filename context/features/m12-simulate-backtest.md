# Feature: Simulate + Backtest Redesign

> Status: in-progress
> UAT: pending

## Problem

The `/simulate` page is a pure forward-looking P&L calculator. It answers "if price moves ±5%, what's my P&L?" — but ±5% is arbitrary. It does not answer:
- Is ±5% realistic for this asset right now?
- Has this pattern actually paid out at 72% historically?
- What is the real outcome distribution?
- What is the live funding rate? (currently requires manual lookup)

## Solution

Transform the Simulate page from a calculator into a trading decision tool by adding:
1. Auto-fetched live funding rate + mark price from Pacifica testnet API
2. 7-day price chart (hand-rolled SVG) with liquidation/entry/target overlay lines
3. Volatility-based P&L scenarios (±1σ/2σ/3σ) replacing arbitrary ±5/10/20%
4. Pattern backtest panel: Outcome Strip + synthetic distribution when accessed via `?patternId=`
5. Conditions tally: live market vs pattern conditions checklist

## Architecture

Layout: two-panel, left = form (slimmed), right = vertical stack of independent self-fetching cards

```
┌──────────────────┬──────────────────────────────────────────┐
│  FORM (420px)    │  Pattern Backtest Banner (if patternId)  │
│  auto-funding    │  ─ Outcome Strip                         │
│                  │  ─ Synthetic distribution curve          │
│                  │  ─ Conditions tally: ✓ / ≈ / ✗          │
│                  ├──────────────────────────────────────────┤
│                  │  PriceChart (SVG, 7d OHLC)               │
│                  │  ─ liquidation line (red dashed)         │
│                  │  ─ entry line (orange solid)             │
│                  │  ─ ±1σ band overlay                      │
│                  ├──────────────────────────────────────────┤
│                  │  VolatilityScenarios (±1σ/2σ/3σ)        │
│                  ├──────────────────────────────────────────┤
│                  │  SummaryCard + Funding (compressed)      │
└──────────────────┴──────────────────────────────────────────┘
```

## Data Sources

| Data | Primary | Fallback |
|------|---------|----------|
| Candles (7d, 1h) | `test-api.pacifica.fi/api/v1/kline` | Binance public klines |
| Funding rate | `test-api.pacifica.fi/api/v1/info/prices` | manual entry |
| Mark price | Same `/info/prices` | `localhost:4242` snapshot |
| Pattern | `localhost:4242/api/intelligence/patterns/:id` (1.5s timeout) | seed-patterns.ts |

## URL Pattern

```
/simulate?side=long&symbol=ETH&patternId=seed_pat_001
```

Pattern pages add a "Simulate this pattern →" button that builds this URL.

## Tasks

| # | Status | Task |
|---|--------|------|
| T97 | `[x]` | Create feature spec |
| T98 | `[ ]` | Refactor: extract SimulateForm.tsx + _lib/simulate.ts + _lib/volatility.ts |
| T99 | `[ ]` | Build web/lib/pacifica-public.ts + auto-fetch funding/price into form |
| T100 | `[ ]` | Build useCandles hook + PriceChart SVG component (7d, liquidation + entry overlays) |
| T101 | `[ ]` | Build VolatilityScenarios component (±1σ/2σ/3σ based on realised vol) |
| T102 | `[ ]` | Build usePattern hook + PatternBacktestPanel (OutcomeStrip + DistributionCurve) |
| T103 | `[ ]` | Build ConditionsTally + lift conditions helpers to web/lib/conditions.ts |
| T104 | `[ ]` | Wire "Simulate this pattern →" on /patterns/[id] page |
