# Plan: Meaningful `arb scan` Output

**Status:** Draft  
**Date:** 2026-04-14  
**Scope:** `src/core/arb/scanner.ts`, `src/cli/commands/arb.ts`

---

## Problem

`arb scan --min-apr 20` returns: "No opportunities found above 20% APR."  
Zero context. User doesn't know if market is dead or if 19% was available.

---

## Solution

Two changes — one in core, one in CLI:

1. **`scanner.ts`** — Add `scanAllMarkets()` that returns full unfiltered market scan + context (count, max APR, regime)
2. **`arb.ts`** — Update `buildScanCmd()` to show context header always; show top-3 fallback when zero results clear threshold

---

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Core scanner + CLI render](phase-01-arb-scan-improvements.md) | Draft |

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/arb/scanner.ts` | Add `scanAllMarkets()` + `MarketScanContext` type |
| `src/cli/commands/arb.ts` | Update `buildScanCmd()` action |

No new files. No schema changes. No new dependencies.
