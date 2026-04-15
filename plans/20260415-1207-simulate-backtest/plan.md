# Plan: Simulate Page — Intelligence-Connected Backtest & Learning Loop
**Date:** 2026-04-15  
**Status:** Planned  
**Priority:** High  

---

## Problem

The simulate page (`web/app/simulate/page.tsx`) is a pure calculator. The user enters
numbers, gets liquidation price and static P&L math, and nothing happens. No learning
occurs, no history is built, and the intelligence layer — which already stores
condition-to-outcome data in `IntelligenceRecord` — is completely untouched.

## Vision

Transform simulate from a dead-end calculator into a **learning loop** where:

- Before a trade: "Similar setups historically win 68% of the time, avg +12.3%"
- During simulation: P&L scenarios are grounded in real historical outcomes
- After simulation: the output becomes an AI agent recipe exportable as a SKILL.md
- Over time: simulations feed back into the intelligence layer, improving detection

---

## Phases

| Phase | File | What it builds | Status |
|-------|------|----------------|--------|
| 1 | [phase-01-pattern-intelligence-connect.md](./phase-01-pattern-intelligence-connect.md) | Backtest API endpoint + BacktestPanel UI component + PatternMatch panel | Planned |
| 2 | [phase-02-chart-history.md](./phase-02-chart-history.md) | Equity curve chart, scenario overlay with historical scatter, duration distribution | Planned |
| 3 | [phase-03-agent-recipe-export.md](./phase-03-agent-recipe-export.md) | Recipe Builder panel, SKILL.md export, SimulationRun log, "My Simulations" tab | Planned |
| 4 | [phase-04-backtest-cli.md](./phase-04-backtest-cli.md) | `pacifica backtest` CLI command, ASCII equity curve, JSON output for agents | Planned |

---

## Key Architectural Insight

**No OHLCV data required.** `IntelligenceRecord` objects already contain:
- Entry conditions (`market_context`: funding rate, OI, buy pressure, momentum)
- Outcome (`pnl_pct`, `pnl_usd`, `duration_minutes`, `profitable`, `liquidated`)
- Asset and direction

Backtesting = filtering these records by symbol + direction + optional context ranges
and computing statistics on the matched outcomes. The equity curve is just cumulative
`pnl_pct` over sequential matched records, sorted by `opened_at`.

---

## Relevant Files

- `web/app/simulate/page.tsx` — current calculator page
- `src/intelligence-api/server.ts` — Fastify server (port 4242), add backtest endpoint here
- `src/core/intelligence/schema.ts` — `IntelligenceRecord`, `DetectedPattern`, `TradeOutcome`
- `src/core/intelligence/store.ts` — `loadRecords()`, `loadPatterns()`
- `src/cli/commands/paper.ts` — paper trading engine (paper mode integration in Phase 3)
- `skills/pattern-confirmed-entry/SKILL.md` — example of SKILL.md format (for Phase 3 export)
- `skills/INDEX.md` — skills registry

---

## Build Order

Phases 1 and 2 are sequential (2 builds on 1's API and chart primitives).  
Phase 3 can start after Phase 1 completes (recipe builder only needs backtest data shape).  
Phase 4 is fully independent of the web phases — can be built in parallel with Phase 2 or 3.
