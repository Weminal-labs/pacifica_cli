# Plan: Make `intelligence run` Actually Useful

**Status:** Draft  
**Date:** 2026-04-14  
**Scope:** `src/core/intelligence/engine.ts`, `src/cli/commands/intelligence.ts`

---

## Problem

`intelligence run` currently:
1. Runs pattern detection on seeded fake data
2. Prints a flat list of 10 patterns with win rates
3. Stops there — no connection to what's happening in markets RIGHT NOW

Nobody cares about a list of historical patterns. The question traders want answered is:  
**"Which markets should I look at right now, and which direction?"**

---

## Root Cause

The pattern engine analyses closed records → produces patterns.  
The CLI just prints those patterns. Full stop. No bridge to live market state.

---

## What "Useful" Looks Like

After `intelligence run`, the output should answer:

```
  Pacifica Intelligence — Live Market Scan
  ──────────────────────────────────────────────────────────────
  Pattern engine: 10 patterns verified from 80 records
  Scanning live markets for matches...

  ACTIVE SIGNALS (3 found)
  ──────────────────────────────────────────────────────────────
  Market   Dir    Pattern                          Win Rate  APR
  ───────  ─────  ───────────────────────────────  ────────  ──────
  MON      LONG   Neg Funding + Rising OI           74.1%   -43.8%
  ENA      LONG   Neg Funding + High Buy Pressure   70.6%   -21.0%
  WLD      LONG   Neg Funding + Bullish Momentum    72.7%   -18.9%
  ──────────────────────────────────────────────────────────────
  3 signals | Strongest: MON LONG (74.1% win rate, n=135)
  Tip: `pacifica trade --market MON-USDC-PERP --side long --size 500`
```

If nothing matches: "No live markets currently match any verified pattern."

---

## Solution Design

### Step 1 — Add `scanForActiveSignals()` to engine.ts

```typescript
export interface ActiveSignal {
  asset: string;
  direction: "long" | "short";
  pattern: DetectedPattern;
  fundingRate: number;
  matchedConditions: string[];
}

export async function scanForActiveSignals(
  sdk: PacificaClient,
  patterns: DetectedPattern[],
): Promise<ActiveSignal[]>
```

Logic:
1. `sdk.getMarkets()` → get all markets with funding rates
2. Filter to top 20 by `|fundingRate|` — those are the interesting ones
3. For each, call `sdk.getRecentTrades(symbol)` → compute `buy_pressure`, `momentum_value`, `large_orders_count` via existing `analyzeTradePatterns()`
4. Build a partial `MarketContext` with available signals (set `oi_change_4h_pct = 0` — we can't compute this without two readings)
5. For each verified pattern, check if ALL pattern conditions match the context using existing `matchesCondition()`
6. If match found: determine direction from pattern conditions (see below) and emit an `ActiveSignal`

**Direction logic:**
- Any condition containing `negative_funding` → LONG (shorts are overcrowded, funding drains them)
- Any condition containing `positive_funding + falling_oi` → SHORT
- `high_buy_pressure + bullish_momentum` → LONG
- `high_sell_pressure + bearish_momentum` → SHORT
- Tie-break: funding direction wins

**Performance:** Top 20 markets × `getRecentTrades()` in parallel with `Promise.all()`. Should complete in < 2s.

---

### Step 2 — Update `intelligence run` CLI action

Current flow:
```
runPatternEngine() → print 10 patterns
```

New flow:
```
runPatternEngine() → scanForActiveSignals() → print signals table + pattern count footer
```

If `--json` flag: emit `{ patterns, signals }` as JSON.

Add `--patterns` flag to the `run` subcommand to show the full pattern list (currently the only output). This preserves access to the old output for debugging.

---

### Step 3 — Make `intelligence patterns` the detailed view

`intelligence patterns` already shows the full pattern library. Keep it as-is — it's the right place to see all 10 patterns. No change needed.

---

## What We Are NOT Doing

- No changes to the pattern detection algorithm
- No new data sources (OI change requires two API calls with a gap — skip it for now)
- No caching layer — live data fetched fresh each `run`
- No changes to `intelligence seed`, `serve`, or `reputation`

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/intelligence/engine.ts` | Add `scanForActiveSignals()` + `ActiveSignal` type |
| `src/cli/commands/intelligence.ts` | Update `run` action: call scanner, render signals table |

No new files. No schema changes. No new dependencies.

---

## Acceptance Criteria

1. `intelligence run` with matching signals prints the signals table with market, direction, pattern name, win rate, funding APR
2. `intelligence run` with no matches prints "No active signals found"
3. `intelligence run --patterns` shows the old 10-pattern list
4. `intelligence run --json` emits `{ patterns: [...], signals: [...] }`
5. The command completes in under 5s (API calls parallelised)
6. `pnpm test` still passes (engine.ts changes are additive only)
