# Phase 04 — Feed Page: Restore Real Pattern Data

**Parent plan:** [plan.md](./plan.md)  
**Date:** 2026-04-15  
**Priority:** Medium  
**Status:** Not started

## Overview
The feed page (`/`) currently hardcodes `active_patterns: []` in the testnet API fallback, so the "Patterns active right now" section always shows empty when the local intelligence server is offline. Fix: pull pattern data directly from the local intelligence API `/api/intelligence/patterns` as a separate fallback (not testnet, which doesn't have this data).

## Key Insights
- Patterns are stored locally in `~/.pacifica/intelligence.json` and served by the local API server
- There is NO testnet equivalent for computed patterns — they're derived from local trade data
- The right fix: try local API first for patterns; if offline, show 0 patterns with a clear message (no fake data)
- The "Patterns active right now" title should be accurate — only show if patterns are truly active signals
- Feed page already tries local API first (`localhost:4242/api/intelligence/feed`) before testnet fallback

## Requirements
1. When local API is offline, `active_patterns` stays `[]` — don't show empty section
2. Add a "patterns offline" callout that explains patterns require the intelligence server
3. Change section title logic: "Patterns active right now" → only show if `patterns.length > 0`
4. Add "Start intelligence server: `pacifica intelligence start`" hint in empty state
5. When local API IS up, patterns from feed should pass `isLive={true}` to PatternCards (they're already active signals)

## Architecture
```
/app/page.tsx
├── getFeedData() unchanged — tries local API, falls back to testnet
├── If active_patterns.length === 0:
│   └── Show "Patterns need the intelligence server" callout instead of empty grid
├── If active_patterns.length > 0:
│   └── Render PatternCards with isLive={true} (all feed patterns are active signals)
```

## Empty State Design
```
/ ACTIVE PATTERNS
Patterns active right now

┌─ Intelligence server offline ────────────────────────────────┐
│  Patterns are detected from your trade history.              │
│  Start the server to see live signals:                       │
│  $ pacifica intelligence start                               │
│                                                              │
│  [Browse all patterns →]  [Learn more →]                    │
└──────────────────────────────────────────────────────────────┘
```

## Related Files
- `web/app/page.tsx` — conditional rendering of patterns section
- `web/components/ui/PatternCard.tsx` — accepts `isLive` prop (Phase 01)

## Implementation Steps
1. In `web/app/page.tsx`, wrap the pattern grid in `{patterns.length > 0 ? <grid> : <empty_state>}`
2. Empty state: border box with terminal-style message + link to /patterns
3. Pass `isLive={true}` to all PatternCards from feed (they're by definition live signals)

## Todo
- [ ] Add conditional render around patterns grid
- [ ] Design and implement empty state component inline
- [ ] Pass isLive={true} to feed page PatternCards

## Success Criteria
- Feed page no longer shows empty pattern grid
- Offline state is clear and actionable with CLI hint
- When server is running, all feed patterns show LIVE badge

## Risk Assessment
- Very low: additive conditional render only

## Security Considerations
- None

## Next Steps
All 4 phases complete → patterns are fully interactive and actionable for traders.
