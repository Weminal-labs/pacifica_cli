# Phase 03 — Live Market Scan on Patterns Page

**Parent plan:** [plan.md](./plan.md)  
**Depends on:** Phase 01  
**Date:** 2026-04-15  
**Priority:** High  
**Status:** Not started

## Overview
The `/patterns` page currently shows a static grid of all patterns. Add a "Live Scan" section at the top that shows which patterns are currently firing across all markets — making the page a real-time signal dashboard, not just a library.

## Key Insights
- The intelligence API already computes active signals via `scanForActiveSignals()`
- `/api/intelligence/feed` returns `active_patterns` — these ARE the currently firing patterns
- The patterns page fetches from `/api/intelligence/patterns` (all patterns), not feed
- Adding a separate "LIVE NOW" banner section before the full library is the right UX
- Each live signal has: asset, direction, win_rate, patternName, fullMatch
- The patterns page is a server component — can fetch both active + all patterns in parallel

## Requirements
1. At top of `/patterns` page, add "Live Now" section (only shown when local API is up)
2. Live Now section shows each active signal as a highlighted row:
   - Asset, direction (LONG ↑ / SHORT ↓), pattern name, win rate, "Simulate" CTA
3. If no active signals or local API offline → show "Start the intelligence server to see live signals"
4. Full pattern library below, unchanged but with `isLive` prop wired based on active signals
5. Client-side auto-refresh of the Live Now section every 60s (the library is server-rendered)

## Architecture
```
/app/patterns/page.tsx (server component)
├── parallel fetch:
│   ├── /api/intelligence/patterns (all patterns — existing)
│   └── /api/intelligence/feed     (active_patterns for live scan — new)
├── render:
│   ├── [NEW] LiveSignalBanner (client component for auto-refresh)
│   │     Props: initialSignals from server fetch
│   │     Refreshes every 60s client-side
│   └── [EXISTING] full pattern grid with isLive={isActiveId} prop
```

## LiveSignalBanner Component
```tsx
// web/components/patterns/LiveSignalBanner.tsx
"use client"
// Props: initialSignals: ActiveFeedPattern[]
// Auto-refresh: fetch /api/intelligence/feed every 60s
// Renders: 
//   If signals: scrolling row of signal cards (asset, dir, pattern, WR, simulate btn)
//   If empty: "No live signals · Intelligence server offline"
```

## Related Files
- `web/app/patterns/page.tsx` — add parallel feed fetch + LiveSignalBanner
- `web/components/patterns/LiveSignalBanner.tsx` — new client component
- `web/components/ui/PatternCard.tsx` — receives isLive prop (Phase 01)
- `web/lib/api.ts` — fetchFeed() already exists

## Implementation Steps
1. Update `web/app/patterns/page.tsx`:
   - Add parallel fetch of `/api/intelligence/feed`
   - Extract active pattern IDs set
   - Pass `isLive={activeIds.has(p.id)}` to each PatternCard
   - Add `<LiveSignalBanner initialSignals={...} />` above the grid
2. Create `web/components/patterns/LiveSignalBanner.tsx`:
   - Display active signals as horizontal cards
   - Each card: asset chip (colored by direction), pattern name, win rate, Simulate button
   - Auto-refresh every 60s
   - Offline/empty state message

## Todo
- [ ] Update patterns/page.tsx to fetch feed in parallel
- [ ] Create LiveSignalBanner component
- [ ] Wire `isLive` to PatternCard
- [ ] Style signal cards (long=green tint, short=red tint)
- [ ] Test offline state (local API down)

## Success Criteria
- Live signals appear at top of patterns page when local server is running
- PatternCards with active signals show LIVE badge
- Signals auto-refresh every 60s without full page reload
- Page remains fully functional when local server is offline

## Risk Assessment
- Low: additive only, doesn't break existing patterns grid
- Client component LiveSignalBanner is isolated from server content

## Security Considerations
- None: read-only display

## Next Steps
→ Phase 04: Restore real pattern data on feed page
