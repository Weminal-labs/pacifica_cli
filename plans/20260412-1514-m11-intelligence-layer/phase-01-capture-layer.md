# Phase 01: Capture Layer

> Parent plan: [plan.md](./plan.md)
> Spec: [m11-intelligence-layer.md](../../context/features/m11-intelligence-layer.md)
> Priority: P0 — blocks everything else
> Status: todo

---

## Overview

Hook into the existing `trade` command to silently capture market state at execution.
Store as append-only JSON. Attach outcome when position closes.
Zero trader friction — they just trade.

---

## Key Insights

- Existing `journal.ts` (`src/core/journal/`) is the exact pattern to follow: append-only JSON, typed records, nanoid IDs
- Market state capture reuses existing MCP/SDK calls already happening in `scan` and `trade` commands
- `patterns.ts` (`src/core/intelligence/patterns.ts`) already computes `buyPressure`, `vwap`, `momentum` — reuse these directly
- `schema.ts` already has `MarketIntelligenceSnapshot` — `MarketContext` extends this
- Outcome attachment is the hard part: requires knowing when a position opened by THIS trade is closed

---

## Requirements

- Capture fires synchronously after a successful trade execution (never blocks or fails the trade)
- Market context snapshot uses data already fetched during trade flow (no extra API calls if avoidable)
- Records are append-only (never mutated, only outcome field updated when position closes)
- trader_id is SHA-256 of the configured API key — no wallet address needed in Phase 1
- Capture can be disabled via `.pacifica.yaml` config flag `intelligence.capture: false`

---

## Architecture

### New files

```
src/core/intelligence/
  capture.ts      ← snapshots MarketContext, creates IntelligenceRecord
  store.ts        ← append-only JSON CRUD for intelligence-records.json
  outcome.ts      ← matches open records to closed positions, attaches TradeOutcome
  seed.ts         ← generates realistic mock records for demo (hackathon only)
```

### Modified files

```
src/cli/commands/trade.tsx      ← call captureIntelligence() after successful order
src/cli/commands/positions.tsx  ← call attachOutcomes() when listing/closing positions
src/core/intelligence/schema.ts ← add IntelligenceRecord, MarketContext, TradeOutcome types
```

---

## Related Code Files

- `src/core/journal/journal.ts` — append-only pattern to replicate
- `src/core/intelligence/patterns.ts` — `analyzeTradePatterns()` for context capture
- `src/core/intelligence/schema.ts` — extend with new types
- `src/core/sdk/` — REST client for market data
- `src/cli/commands/trade.tsx` — injection point

---

## Implementation Steps

### Step 1: Extend schema.ts with new types
Add `IntelligenceRecord`, `MarketContext`, `TradeOutcome`, `PatternCondition`, `DetectedPattern`, `TraderReputation` to existing `schema.ts`. Keep SCHEMA_VERSION bump for breaking changes.

### Step 2: Build store.ts
```typescript
// Mirrors journal.ts pattern
export async function appendRecord(record: IntelligenceRecord): Promise<void>
export async function loadRecords(): Promise<IntelligenceRecord[]>
export async function updateRecord(id: string, update: Partial<IntelligenceRecord>): Promise<void>
export async function getOpenRecords(): Promise<IntelligenceRecord[]>  // closed_at === undefined
```
Storage: `~/.pacifica/intelligence-records.json`

### Step 3: Build capture.ts
```typescript
export async function captureIntelligence(
  sdk: PacificaClient,
  tradeParams: { asset: string; direction: "long"|"short"; size_usd: number; entry_price: number },
): Promise<IntelligenceRecord>
```
Internally:
- Fetches market data (reuse what trade.tsx already has)
- Runs `analyzeTradePatterns()` from patterns.ts
- Hashes trader ID
- Builds `MarketContext`
- Creates and persists `IntelligenceRecord`
- Tags pattern_tags from current conditions (e.g. `funding_rate < -0.03` → `"negative_funding"`)
- Returns record (never throws — wrap in try/catch, log warning only)

### Step 4: Hook into trade.tsx
After successful order placement, before rendering confirmation:
```typescript
// Non-blocking — don't await, don't surface errors to user
captureIntelligence(sdk, { asset, direction, size_usd, entry_price }).catch(
  (err) => logger.warn("intelligence capture failed silently", err)
)
```

### Step 5: Build outcome.ts
```typescript
export async function attachOutcomes(
  sdk: PacificaClient,
  closedPositions: Position[]
): Promise<void>
```
- Loads open IntelligenceRecords
- Matches by asset + direction + approximate entry_price
- Fetches current P&L from SDK
- Calls `store.updateRecord()` with outcome attached
- Runs after positions list/close in positions.tsx

### Step 6: Build seed.ts (hackathon demo)
Generates 80 realistic records across BTC, ETH, SOL:
- Mix of profitable / unprofitable
- Varied market conditions
- 3 pre-verified patterns already computed
- Writes to `~/.pacifica/intelligence-records.json` and `patterns-verified.json`
CLI: `pacifica intelligence seed --count 80` (dev-only flag)

---

## Todo

- [ ] Extend `schema.ts` with M11 types
- [ ] Implement `store.ts` (mirrors journal.ts)
- [ ] Implement `capture.ts`
- [ ] Hook capture into `trade.tsx`
- [ ] Implement `outcome.ts`
- [ ] Hook outcome attachment into `positions.tsx`
- [ ] Implement `seed.ts` with 80 mock records
- [ ] Add `intelligence.capture` config flag to `.pacifica.yaml` schema
- [ ] Test: capture fires without blocking trade confirmation
- [ ] Test: outcome attachment correctly matches positions to records

---

## Success Criteria

- Trade executes in < 500ms additional latency from capture (non-blocking)
- `cat ~/.pacifica/intelligence-records.json` shows valid record after trade
- Record has all `MarketContext` fields populated
- Outcome attaches correctly when position closes
- Seed command produces 80 records with 3 pre-verified patterns

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Capture adds latency to trade | Low | High | Non-blocking async, never awaited |
| Position matching is ambiguous | Medium | Medium | Match on asset + direction + entry_price within 0.1% tolerance |
| SDK extra API call for context | Medium | Low | Cache market data for 10s — reuse what trade already fetched |
| File corruption on concurrent write | Low | Medium | JSON write is atomic (write to .tmp then rename) |

---

## Security Considerations

- trader_id is SHA-256 of API key — one-way, not reversible without the key
- Records stored locally — no network exposure in Phase 1
- `seed.ts` must be dev-only — no production path to generate fake records
- Capture failure must NEVER surface to trader (silent fail)

---

## Next Steps

After Phase 01 ships: run Phase 02 (pattern engine) and Phase 03 (web UI) concurrently.
Phase 02 reads from the store built here.
Phase 03 can use seed data while Phase 02 computes real patterns.
