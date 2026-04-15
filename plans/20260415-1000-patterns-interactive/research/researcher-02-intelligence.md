# Research: Intelligence Layer & Actionable Hooks

## ActiveSignal (engine.ts)
```ts
interface ActiveSignal {
  asset: string               // e.g. "BTC"
  direction: "long" | "short"
  pattern: DetectedPattern
  fundingRate: number
  matchedConditions: string[] // labels of conditions met live
  fullMatch: boolean          // all conditions vs partial
}
```
scanForActiveSignals() scans top-25 markets by |fundingRate|, checks RELIABLE_AXES
(funding_rate, buy_pressure, momentum_value, large_orders_count), deduplicates per asset.

## Condition Axes
| axis | threshold | signal |
|------|-----------|--------|
| negative_funding | < -0.0003 | long bias |
| high_buy_pressure | > 0.65 | buyer dominance |
| bullish_momentum | > 0.3 | positive trend |
| whale_activity | ≥ 3 large orders | institutional |
| rising_oi | > 10% 4h | leverage building |

## Pattern Storage (store.ts)
Pattern ranked by `win_rate * log(sample_size + 1)`, capped at 10.
Primary assets = top 3 assets by trade frequency in sample.

## API Snapshot Response (snapshot/:market)
Returns: current_conditions (funding_rate, OI, buy_pressure, momentum, large_orders),
matching_patterns[], best_pattern_match, agent_summary string.

## Key Links Available
| From | To | Value |
|------|----|-------|
| pattern.primary_assets[0] | /snapshot/[market] | live conditions check |
| pattern + direction | /simulate?side=&symbol=&price= | pre-fill risk sim |
| pattern.conditions | alert creation | watch for pattern trigger |
| pattern.id | /api/intelligence/patterns/:id | full drill-down |
| pattern | /reputation | find traders who use this pattern |
