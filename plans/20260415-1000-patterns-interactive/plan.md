# Plan: Interactive & Actionable Pattern Cards

**Created:** 2026-04-15  
**Status:** Draft — awaiting review  
**Goal:** Transform static PatternCard displays into actionable trader tools that connect patterns to live markets, simulation, alerts, and social confirmation.

## Problem
- PatternCard has hover styling but no click handler — patterns are dead ends
- Pattern conditions never shown to users
- Feed page patterns hardcoded to `[]` when local server is offline
- No bridge from "I see a pattern" → "I can trade or act on it"

## Phases

| # | Phase | Priority | Status |
|---|-------|----------|--------|
| 1 | [PatternCard overhaul](./phase-01-patterncard-overhaul.md) | Critical | Not started |
| 2 | [Pattern detail page /patterns/[id]](./phase-02-pattern-detail-page.md) | High | Not started |
| 3 | [Live market scan on patterns page](./phase-03-live-market-scan.md) | High | Not started |
| 4 | [Feed page — restore real pattern data](./phase-04-feed-patterns.md) | Medium | Not started |

## Research
- [Component research](./research/researcher-01-components.md)
- [Intelligence layer research](./research/researcher-02-intelligence.md)
