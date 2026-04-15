# Phase 01 — Arb Scan Improvements

**Parent:** [plan.md](plan.md)  
**Date:** 2026-04-14  
**Priority:** Medium  
**Status:** Draft

---

## Overview

Make `arb scan` output meaningful at every threshold — including when nothing clears the bar.

---

## Key Insights

- `detectOpportunities()` in `scanner.ts` does TWO things that block context: (1) filters by `min_apr_threshold`, (2) caps at `availableSlots`. Both hide the real market picture.
- `manager.scanOpportunities()` wraps this — it also hides the raw market list from callers.
- The CLI (`buildScanCmd()`) only receives `ArbOpportunity[]` — no count, no max APR, no regime.
- Fix: add a separate `scanAllMarkets()` in scanner.ts that returns everything unfiltered, then let the CLI decide what to show.

---

## Architecture

### New type in `scanner.ts`

```typescript
export interface MarketScanContext {
  totalMarkets: number;          // all markets returned from API
  eligibleMarkets: number;       // passed liquidity gate (volume filter)
  maxAprFound: number;           // highest APR in eligible markets
  maxAprSymbol: string;          // which symbol has that max
  regime: "HOT" | "WARM" | "COLD";
  allOpportunities: ArbOpportunity[]; // unfiltered, sorted by APR desc
}
```

Regime thresholds: HOT ≥ 40%, WARM ≥ 10%, COLD < 10%

### New function in `scanner.ts`

```typescript
export function scanAllMarkets(
  markets: Market[],
  config: ArbConfig,
  activePositions: ArbPosition[],
  externalRates: ExternalFundingRate[],
): MarketScanContext
```

This runs the same logic as `detectOpportunities()` but:
- Does NOT filter by `min_apr_threshold`
- Does NOT cap at `availableSlots`
- Returns ALL eligible opportunities sorted by APR desc + context fields

Existing `detectOpportunities()` stays unchanged (used by the bot loop).

### CLI changes in `arb.ts` — `buildScanCmd()`

1. Call `scanAllMarkets()` instead of `manager.scanOpportunities()`
2. Filter `context.allOpportunities` by threshold locally to get `matches`
3. Always print context header (regime + max APR + count)
4. If `matches.length > 0`: print normal table
5. If `matches.length === 0`: print top-3 fallback table with "below threshold" marker + tip

---

## Implementation Steps

### Step 1 — `src/core/arb/scanner.ts`

Add after the existing `detectOpportunities()` export:

```typescript
export function scanAllMarkets(
  markets: Market[],
  config: ArbConfig,
  activePositions: ArbPosition[],
  externalRates: ExternalFundingRate[],
): MarketScanContext {
  const activeSymbols = new Set(
    activePositions
      .filter((p) => p.status === "active" || p.status === "pending")
      .map((p) => p.symbol),
  );

  const extRateMap = buildExtRateMap(externalRates); // extract from detectOpportunities

  const eligible: ArbOpportunity[] = [];
  const now = Date.now();

  for (const market of markets) {
    const symbol = market.symbol.toUpperCase();
    if (activeSymbols.has(symbol)) continue;
    if (!Number.isFinite(market.fundingRate) && !Number.isFinite(market.nextFundingRate)) continue;
    if (market.volume24h < config.min_market_volume_24h_usd) continue; // liquidity gate only

    const currentRate = market.fundingRate ?? 0;
    const predictedRate = market.nextFundingRate ?? currentRate;
    const effectiveRate = Math.abs(predictedRate) >= Math.abs(currentRate) ? predictedRate : currentRate;
    const annualizedApr = Math.abs(effectiveRate) * INTERVALS_PER_YEAR * 100;

    const bookSpreadBps = estimateSpreadBps(market);
    const extEntry = extRateMap.get(symbol);
    const divergenceBps = config.use_external_rates && extEntry
      ? Math.round((effectiveRate - extEntry.rate) * 10000)
      : undefined;

    const score = computeScore(annualizedApr, market.volume24h, bookSpreadBps, Infinity, divergenceBps, config);
    const side: ArbOpportunity["side"] = effectiveRate > 0 ? "short_collects" : "long_collects";

    eligible.push({
      symbol, currentRate, predictedRate, annualizedApr, side,
      markPrice: market.price, volume24hUsd: market.volume24h,
      bookSpreadBps, nextFundingAt: "", msToFunding: Infinity,
      score,
      externalRate: extEntry?.rate,
      externalSource: extEntry?.source,
      divergenceBps,
    });
  }

  eligible.sort((a, b) => b.annualizedApr - a.annualizedApr);

  const maxApr = eligible[0]?.annualizedApr ?? 0;
  const regime: MarketScanContext["regime"] = maxApr >= 40 ? "HOT" : maxApr >= 10 ? "WARM" : "COLD";

  return {
    totalMarkets: markets.length,
    eligibleMarkets: eligible.length,
    maxAprFound: maxApr,
    maxAprSymbol: eligible[0]?.symbol ?? "—",
    regime,
    allOpportunities: eligible,
  };
}
```

Also extract the internal `extRateMap` build logic from `detectOpportunities` into a shared `buildExtRateMap()` helper to avoid duplication.

### Step 2 — `src/core/arb/manager.ts`

Add a new public method that exposes the full scan context:

```typescript
async scanAllMarkets(): Promise<MarketScanContext> {
  const [markets, externalRates] = await Promise.all([
    this.client.getMarkets(),
    this.config.use_external_rates ? fetchAllExternalRates() : Promise.resolve([]),
  ]);
  const active = this.positions.filter(
    (p) => p.status === "active" || p.status === "pending",
  );
  return scanAllMarkets(markets, this.config, active, externalRates);
}
```

### Step 3 — `src/cli/commands/arb.ts` — `buildScanCmd()`

Replace the action body:

```typescript
// 1. Get full context
const context = await manager.scanAllMarkets();

// 2. Apply threshold filter locally
const threshold = arbConfig.min_apr_threshold;
const matches = context.allOpportunities.filter(o => o.annualizedApr >= threshold);

// 3. JSON output (backward compatible — add context fields)
if (opts.json) {
  console.log(JSON.stringify({ opportunities: matches, context }, null, 2));
  return;
}

// 4. Always show context header
const regimeColor = context.regime === "HOT" ? theme.profit
  : context.regime === "WARM" ? theme.emphasis
  : theme.muted;

console.log();
console.log(
  `  Market Regime: ${regimeColor(context.regime)} — ` +
  `Max APR found: ${fmtPct(context.maxAprFound)} (${context.maxAprSymbol}) — ` +
  `${context.eligibleMarkets} markets scanned`
);
console.log();

// 5. Results or fallback
if (matches.length > 0) {
  // ... existing table render logic, iterate matches ...
  console.log(theme.muted(`  ${matches.length} opportunities above ${threshold}% APR. Use 'pacifica arb start' to activate.`));
} else {
  console.log(theme.muted(`  No opportunities above ${threshold}% APR.`));

  const topN = context.allOpportunities.slice(0, 3);
  if (topN.length > 0) {
    console.log(theme.muted(`  Best available (below threshold):`));
    console.log();
    // ... same table render for topN rows ...
    console.log();
    const bestApr = topN[0].annualizedApr.toFixed(1);
    console.log(theme.muted(`  Tip: run 'pacifica arb scan --min-apr ${Math.floor(topN[0].annualizedApr)}' to target these.`));
  }
}
```

---

## Todo

- [ ] Add `MarketScanContext` type + `scanAllMarkets()` to `scanner.ts`
- [ ] Extract `buildExtRateMap()` helper in `scanner.ts`
- [ ] Add `scanAllMarkets()` method to `ArbManager`
- [ ] Update `buildScanCmd()` in `arb.ts` to use new context
- [ ] Verify `--json` output still contains `opportunities` array (backward compat)
- [ ] Manual test: `arb scan --min-apr 1` (results found), `arb scan --min-apr 20` (no results, fallback shows)

---

## Success Criteria

1. `arb scan --min-apr 20` shows regime header + "no results" + top-3 fallback + tip
2. `arb scan --min-apr 1` shows regime header + matched results table (no fallback section)
3. `arb scan --json` emits `{ opportunities: [...], context: {...} }` — existing `opportunities` key present
4. No new files, no new dependencies
5. `pnpm test` still passes

---

## Risk Assessment

**Low risk.** Changes are additive:
- `detectOpportunities()` untouched (bot loop unaffected)
- New `scanAllMarkets()` is scan-only, no side effects
- JSON output is additive (new `context` field alongside existing `opportunities`)

---

## Security Considerations

None. Scan is read-only. No user input used in queries.
