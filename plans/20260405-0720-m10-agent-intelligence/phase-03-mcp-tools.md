# Phase 03: New MCP Tools

**Parent plan:** [plan.md](./plan.md)
**Depends on:** Phase 02 (intelligence core modules)
**Status:** `[ ]` Not started
**Priority:** High — primary deliverable for agent consumption

---

## Overview

Add 5 new read tools to `src/mcp/server.ts`. All are read-only (no guardrails). Total tools: 23 → 28.

Follow existing patterns in `server.ts`:
- Import from `core/intelligence/` modules
- Use `ok()` / `fail()` helpers
- Zod input validation
- All outputs conform to `schema.ts` interfaces

---

## Architecture

```
src/mcp/server.ts (existing, 1401 lines)
  + import { topGainersWithLiquidityFilter, topLosers, byOpenInterest,
             byFundingRate, computeLiquidityScan, liquidityFilter } from "../core/intelligence/filter.js"
  + import { analyzeTradePatterns } from "../core/intelligence/patterns.js"
  + import { AlertManager } from "../core/intelligence/alerts.js"
  + import { SCHEMA_VERSION } from "../core/intelligence/schema.js"
  + import type { MarketIntelligenceSnapshot, ... } from "../core/intelligence/schema.js"
```

The 5 new tools are appended after the existing Analytics Tools section with a header comment:
```
// ---------------------------------------------------------------------------
// Intelligence Tools (5) — agent-readable data, no guardrails
// ---------------------------------------------------------------------------
```

---

## Tool Specifications

### Tool 1: `pacifica_top_markets`

**Purpose:** Ranked market list by a chosen dimension, with optional liquidity gate.

**Input schema (Zod):**
```typescript
z.object({
  sort_by: z.enum(["gainers", "losers", "volume", "oi", "funding"]).default("gainers"),
  limit: z.number().int().min(1).max(50).default(10).optional(),
  min_volume_usd: z.number().min(0).default(0).optional(),
})
```

**Logic:**
```
1. client.getMarkets()
2. if min_volume_usd > 0: liquidityFilter(markets, min_volume_usd)
3. switch sort_by:
   gainers  → topGainers(markets, limit)
   losers   → topLosers(markets, limit)
   volume   → sort by volume24h desc, toMarketSummary()
   oi       → byOpenInterest(markets, limit)
   funding  → byFundingRate(markets, limit)
4. return ok({ sort_by, limit, min_volume_usd, results: MarketSummary[] })
```

**Cache:** Uses existing `CACHE_TTL_MARKET` (10s) via `client.getMarkets()` — no additional cache needed.

**Example output:**
```json
{
  "sort_by": "gainers",
  "limit": 5,
  "min_volume_usd": 1000000,
  "results": [
    { "symbol": "SOL", "price": 145.2, "change24h": 12.4, "volume24h": 45000000,
      "openInterest": 12000000, "fundingRate": 0.0001, "score": 12.4, "rank": 1 }
  ]
}
```

---

### Tool 2: `pacifica_liquidity_scan`

**Purpose:** Order book depth analysis with slippage estimates for multiple markets.

**Input schema (Zod):**
```typescript
z.object({
  symbols: z.array(z.string()).optional(),
  // if not provided, scan top 10 markets by volume
  min_volume_usd: z.number().min(0).default(0).optional(),
})
```

**Logic:**
```
1. client.getMarkets()
2. if symbols provided: filter to those symbols
   else: sort by volume24h desc, take top 10
3. if min_volume_usd > 0: apply liquidityFilter
4. for each symbol (parallel Promise.all):
   - client.getOrderBook(symbol)
   - computeLiquidityScan(market, orderBook)
5. sort by liquidityScore desc
6. return ok({ scanned: number, results: LiquidityScan[] })
```

**Cache:** Order book fetched per-symbol. SDK's existing `get()` method caches at `CACHE_TTL_MARKET` (10s) for market data. Order book calls currently not cached — consider passing `cacheTtl: 5000` in `client.getOrderBook()` call (check if `get()` supports this).

**Note:** Max 10 parallel order book fetches to avoid rate limit. If symbols > 10, batch.

---

### Tool 3: `pacifica_trade_patterns`

**Purpose:** Analyze recent trade flow for a single symbol.

**Input schema (Zod):**
```typescript
z.object({
  symbol: z.string(),
  limit: z.number().int().min(10).max(500).default(100).optional(),
  large_order_threshold_usd: z.number().min(0).default(50000).optional(),
})
```

**Logic:**
```
1. client.getRecentTrades(symbol)  — fetches last N public trades
2. limit to `limit` most recent
3. get current price from client.getMarkets() (or getMarkPrice helper)
4. analyzeTradePatterns(symbol, trades, currentPrice, threshold)
5. return ok(TradePatternResult)
```

**Cache:** `getRecentTrades` result can be cached 30s via `cacheTtl` param in `client.get()`.

---

### Tool 4: `pacifica_alert_triage`

**Purpose:** Check all configured alerts against current market data, prioritized by urgency.

**Input schema (Zod):**
```typescript
z.object({
  include_dormant: z.boolean().default(false).optional(),
})
```

**Logic:**
```
1. alertManager.listAlerts() — read ~/.pacifica/alerts.json
2. if empty: return ok({ total: 0, triggered: 0, near: 0, results: [] })
3. client.getMarkets() — for price/volume/OI checks
4. client.getFundingHistory() for each unique symbol needing funding check
   (only if any funding alerts exist)
5. alertManager.checkAlerts(markets, fundingRates)
6. filter by urgency (exclude dormant if !include_dormant)
7. return ok({ total, triggered, near, dormant, results: AlertTriageResult[] })
```

**Cache:** No cache — reads local file + fresh market data every call.

---

### Tool 5: `pacifica_market_snapshot`

**Purpose:** Single comprehensive call returning all intelligence in one stable JSON response. The "agent recipe aggregator."

**Input schema (Zod):**
```typescript
z.object({
  symbols: z.array(z.string()).optional(),
  // if provided: only include these symbols in snapshot
  // if not provided: full market snapshot
})
```

**Logic:**
```
1. Parallel fetch:
   - client.getMarkets()
   - alertManager.listAlerts() + checkAlerts()
2. Compute from markets:
   - topGainers(filtered, 5)
   - topLosers(filtered, 5)
   - byFundingRate(filtered, 5)
3. Parallel order book fetch for top 5 by volume:
   - computeLiquidityScan() for each
4. Assemble MarketIntelligenceSnapshot:
   - schemaVersion: SCHEMA_VERSION
   - generatedAt: new Date().toISOString()
   - markets: all markets as MarketSummary[]
   - topGainers, topLosers, highestFunding
   - liquidityLeaders: top 5 by liquidityScore
   - triggeredAlerts: AlertTriageResult[] where urgency === "triggered"
   - nearAlerts: AlertTriageResult[] where urgency === "near"
5. return ok(snapshot)
```

**Cache:** 15s composite cache keyed on snapshot hash. Implemented as a module-level `TtlCache` instance inside server.ts (or a separate snapshot cache keyed `"market_snapshot"`).

---

## Server.ts Integration

Add after existing `// Analytics Tools` section:

```typescript
// ---------------------------------------------------------------------------
// Intelligence Tools (5) — agent-readable data, no guardrails
// ---------------------------------------------------------------------------

// Instantiate AlertManager once at server init (same pattern as JournalLogger)
const alertManager = new AlertManager();

server.tool("pacifica_top_markets", "...", { ... }, async (args) => { ... });
server.tool("pacifica_liquidity_scan", "...", { ... }, async (args) => { ... });
server.tool("pacifica_trade_patterns", "...", { ... }, async (args) => { ... });
server.tool("pacifica_alert_triage", "...", { ... }, async (args) => { ... });
server.tool("pacifica_market_snapshot", "...", { ... }, async (args) => { ... });
```

**Imports to add at top of server.ts:**
```typescript
import {
  topGainers, topLosers, byOpenInterest, byFundingRate,
  liquidityFilter, computeLiquidityScan, toMarketSummary,
  topGainersWithLiquidityFilter,
} from "../core/intelligence/filter.js";
import { analyzeTradePatterns } from "../core/intelligence/patterns.js";
import { AlertManager } from "../core/intelligence/alerts.js";
import { SCHEMA_VERSION } from "../core/intelligence/schema.js";
import type {
  MarketSummary, LiquidityScan, TradePatternResult,
  AlertTriageResult, MarketIntelligenceSnapshot,
} from "../core/intelligence/schema.js";
```

---

## Related Code Files

- `src/mcp/server.ts` — existing server (add tools here)
- `src/core/intelligence/filter.ts` — filter functions
- `src/core/intelligence/patterns.ts` — pattern analysis
- `src/core/intelligence/alerts.ts` — alert manager
- `src/core/intelligence/schema.ts` — types
- `src/core/sdk/client.ts` — `getMarkets()`, `getOrderBook()`, `getRecentTrades()`

---

## Implementation Steps

1. Add imports to `server.ts`
2. Instantiate `AlertManager` at server init (after `JournalLogger` instantiation)
3. Implement `pacifica_top_markets` tool
4. Implement `pacifica_liquidity_scan` tool (with batching guard for >10 symbols)
5. Implement `pacifica_trade_patterns` tool
6. Implement `pacifica_alert_triage` tool
7. Implement `pacifica_market_snapshot` tool
8. Run `pnpm tsc --noEmit` — verify no errors

---

## Success Criteria

- [ ] 5 new tools appear in `server.ts`
- [ ] All tools use `ok()` / `fail()` return pattern
- [ ] All inputs validated with Zod schemas
- [ ] `pacifica_market_snapshot` includes `schemaVersion: "1.0"`
- [ ] `pnpm tsc --noEmit` passes
- [ ] Tool count in server header comment updated: 23 → 28

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Rate limit hit when scanning all order books in parallel | Batch to max 10 concurrent fetches; use `Promise.all` with chunking |
| `client.getRecentTrades()` may require auth | Check if it's public or authenticated endpoint — if auth, ensure config loaded |
| `getRecentTrades` field naming may differ from `TradeHistory` interface | Read actual response in `client.ts` parse functions before writing |
| server.ts growing beyond 1600 lines | Acceptable; tools are self-contained and follow existing density |

## Security Considerations

- All 5 tools are read-only — no state mutation
- `pacifica_alert_triage` reads local file only — no external write
- No user input is executed as code — Zod validates all inputs
