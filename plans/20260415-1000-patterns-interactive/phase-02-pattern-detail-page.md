# Phase 02 — Pattern Detail Page `/patterns/[id]`

**Parent plan:** [plan.md](./plan.md)  
**Depends on:** Phase 01 (PatternCard links here)  
**Date:** 2026-04-15  
**Priority:** High  
**Status:** Not started

## Overview
A dedicated page for each pattern that gives a trader everything needed to act: full condition breakdown, which markets currently satisfy the conditions, historical stats, and direct trade CTAs.

## Key Insights
- `/api/intelligence/patterns/:id` returns single DetectedPattern
- `/api/intelligence/snapshot/:market` returns whether current conditions match this pattern for a given market
- Checking multiple markets in parallel (primary_assets + top markets) shows "live scan" in real time
- `avg_duration_minutes` tells traders expected hold time → valuable for sizing decisions
- Linking to `/reputation` with pattern filter shows which high-rep traders use this pattern

## Requirements
1. Fetch pattern by id from local intelligence API
2. Show full condition breakdown with axis, operator, threshold in plain English
3. Run live scan: for each of pattern's primary_assets, call `/snapshot/:market` to check if conditions currently match
4. Show "currently matching" vs "not matching" per market with live condition values
5. Stats section: win rate bar, sample size, avg P&L, avg duration
6. 3 CTA blocks:
   - **Simulate** → `/simulate?side=[direction]&symbol=[best_matching_market]`
   - **Snapshot** → `/snapshot/[best_matching_market]`
   - **Social** → calls `/api/intelligence/social/:asset` inline
7. Graceful offline state when local API unavailable

## Architecture
```
/app/patterns/[id]/page.tsx (server component)
├── fetch pattern from /api/intelligence/patterns/:id
├── parallel: fetch /snapshot/:market for each primary_asset
├── render:
│   ├── Header: name, VERIFIED, LIVE badge (if any market matches)
│   ├── Stats bar: win rate, sample, avg P&L, avg hold time
│   ├── Conditions section: each condition as card with current value
│   │     condition card: label | threshold | current value | ✓ or ✗
│   ├── Live Market Scan: grid of markets with match status
│   │     market row: symbol | status chip | conditions met | Simulate btn
│   ├── Social pulse (if local API up): sentiment + narrative tags
│   └── Action bar: Simulate (best match) | Snapshot | Back to Patterns
```

## Condition Display Format
```
"Negative Funding" → funding_rate < -0.03%
  Current: -0.071%   ← from snapshot current_conditions
  Status: ✓ MATCH (green)

"High Buy Pressure" → buy_pressure > 65%  
  Current: 58.3%     ← from snapshot
  Status: ✗ NEAR (orange, within 10%)
```

## Related Files
- `web/app/patterns/[id]/page.tsx` — new file
- `web/lib/api.ts` — `fetchSnapshot(market)` already exists
- `web/lib/types.ts` — Pattern, Pattern conditions types

## Implementation Steps
1. Create `web/app/patterns/[id]/page.tsx` as server component
2. Fetch pattern: `GET /api/intelligence/patterns/${params.id}`
3. Parallel fetch snapshots for each primary_asset (up to 4)
4. Derive direction from conditions
5. Render conditions section with live value comparison
6. Render live market scan grid
7. Add social pulse section (best-effort, fails silently)
8. Add action bar

## Todo
- [ ] Create `web/app/patterns/[id]/` directory
- [ ] Create `page.tsx` server component
- [ ] Implement condition live-check against snapshot current_conditions
- [ ] Render condition cards with match status
- [ ] Render live market scan
- [ ] Add social section
- [ ] Add action bar with pre-filled simulate link
- [ ] Handle offline/404 state gracefully

## Success Criteria
- Navigating to `/patterns/[id]` shows full pattern detail
- Each condition shows current market value + match status (✓/✗)
- "Simulate" button is pre-filled with correct side + primary market
- Page works even when local API is offline (shows offline state)

## Risk Assessment
- Medium: depends on local intelligence server for live condition data
- Low risk if server is down — page degrades to static pattern info

## Security Considerations
- params.id used in URL — validate it's alphanumeric before API call

## Next Steps
→ Phase 03: Live market scan on the patterns list page
