# Phase 01 — PatternCard Overhaul

**Parent plan:** [plan.md](./plan.md)  
**Date:** 2026-04-15  
**Priority:** Critical  
**Status:** Not started

## Overview
PatternCard is currently a static display. Every card needs to become a tradeable entry point: show conditions, show which markets are live, and give 3 clear CTAs.

## Key Insights
- Card already has `cursor-pointer` hover styling — just needs an actual target
- `conditions[]` array is on every Pattern but never rendered
- `primary_assets[0]` maps directly to `/snapshot/[market]` and `/simulate`
- `direction` is derivable from conditions: negative_funding + buy_pressure → long; positive_funding → short
- The card is used on both the feed page and `/patterns` page — changes propagate everywhere

## Requirements
1. PatternCard links to `/patterns/[id]` on click (new detail page, Phase 02)
2. Show top 2 conditions as human-readable chips below the name
3. Show primary_assets as clickable market tags (→ `/snapshot/[asset]`)
4. Add 3 action buttons at card bottom:
   - **Snapshot →** links to `/snapshot/[primary_asset]`
   - **Simulate →** links to `/simulate?side=[derived_side]&symbol=[asset]`
   - **Details →** links to `/patterns/[id]`
5. Add a small "LIVE" badge if the pattern appears in active signals (prop: `isLive?: boolean`)
6. Conditions rendered as: `funding < -0.03%`, `buy pressure > 65%` (use `label` field directly)

## Architecture
```
PatternCard.tsx (updated)
├── props: pattern: Pattern, isLive?: boolean
├── header: VERIFIED badge + LIVE badge (if isLive)
├── name (clickable → /patterns/[id])
├── stats row: win rate, sample, avg P&L
├── conditions chips (top 2 from pattern.conditions)
├── asset tags (clickable → /snapshot/[market])
└── action bar:
    ├── Snapshot → /snapshot/[primary_asset]
    ├── Simulate → /simulate?side=&symbol=&price=
    └── Details → /patterns/[id]
```

## Derive Direction from Conditions
```ts
function deriveDirection(conditions: Condition[]): "long" | "short" {
  const axes = conditions.map(c => c.axis);
  if (axes.some(a => a.includes("negative_funding") || a.includes("buy_pressure"))) return "long";
  if (axes.some(a => a.includes("positive_funding") || a.includes("sell_pressure"))) return "short";
  return "long"; // default
}
```

## Related Files
- `web/components/ui/PatternCard.tsx` — primary change target
- `web/app/page.tsx` — uses PatternCard (feed page)
- `web/app/patterns/page.tsx` — uses PatternCard (patterns list)
- `web/lib/types.ts` — Pattern type (read-only, no changes)

## Implementation Steps
1. Update `PatternCard.tsx`:
   - Wrap card body in `<Link href={/patterns/${pattern.id}}>`
   - Add `isLive` prop → renders orange "● LIVE" badge top-right
   - Render top 2 `pattern.conditions` as small chips
   - Make asset tags `<Link href={/snapshot/${sym}}>` (strip -USDC-PERP suffix)
   - Add action bar with 3 buttons using `e.stopPropagation()` to prevent card click
2. Pass `isLive` from feed page by checking if pattern.id appears in active_signals
3. Pass `isLive` from patterns page if local API returns active signal list

## Todo
- [ ] Update PatternCard props interface
- [ ] Add direction derivation helper
- [ ] Add condition chips rendering
- [ ] Make asset tags clickable links
- [ ] Add action bar (Snapshot, Simulate, Details)
- [ ] Add LIVE badge support
- [ ] Wire `isLive` from feed page
- [ ] Wire `isLive` from patterns page

## Success Criteria
- Clicking a card navigates to `/patterns/[id]`
- Conditions visible without opening detail page
- Primary asset tag navigates to snapshot
- Simulate button pre-fills direction + symbol
- LIVE badge appears on actively-triggering patterns

## Risk Assessment
- Low: PatternCard is a leaf component, changes are isolated
- Medium: `isLive` requires knowing active signals at render time (server component)

## Security Considerations
- None: read-only display, no user input

## Next Steps
→ Phase 02: Pattern detail page at `/patterns/[id]`
