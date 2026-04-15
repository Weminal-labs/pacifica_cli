# Research: PatternCard & Pattern Data Flow

## Pattern Type (`/web/lib/types.ts`)
- `id`, `name`, `verified`, `verified_at`, `last_seen_at`
- `conditions[]` — `{ axis, op, value, label }` (e.g. `funding_rate < -0.0003`)
- `sample_size`, `win_rate`, `avg_pnl_pct`, `avg_duration_minutes`
- `primary_assets[]` — e.g. `["ETH-USDC-PERP", "BTC-USDC-PERP"]`

## PatternCard (`/web/components/ui/PatternCard.tsx`)
- Renders: VERIFIED badge, name, win rate, sample size, avg P&L%, asset tags, last-seen
- Has `cursor-pointer` + hover border — **but no Link or onClick handler** → not actually clickable
- Conditions array is never rendered to the user

## API Endpoints (`/web/lib/api.ts`)
- `GET /api/intelligence/feed` → active_patterns, whale_activity, high_rep_signals
- `GET /api/intelligence/patterns` → all patterns (queryable by min_win_rate, sort)
- `GET /api/intelligence/patterns/:id` → single pattern
- `GET /api/intelligence/snapshot/:market` → current_conditions + matching_patterns + best_pattern_match

## Feed Page Problem (`/web/app/page.tsx`)
- `active_patterns` on the feed is **hardcoded to `[]`** in the testnet fallback — patterns never show when local API is offline

## What's Missing
1. PatternCard has no navigation target
2. Conditions never shown to user
3. No "currently matching markets" display
4. No Simulate / Snapshot / Alert CTAs
5. Feed page patterns always empty without local server
