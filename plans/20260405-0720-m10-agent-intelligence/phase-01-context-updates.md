# Phase 01: Context Folder Updates

**Parent plan:** [plan.md](./plan.md)
**Status:** `[ ]` Not started
**Priority:** High — must be done first; all other phases reference these docs

---

## Overview

Update the `context/` folder to formally document M10 before any code is written. This ensures the feature spec, data models, API contracts, roadmap, and task list are in sync before implementation begins.

---

## Files to Create / Update

### CREATE: `context/features/m10-agent-intelligence.md`

New feature spec following the existing `_template.md` pattern. Content:

```markdown
# M10: Agent-Readable Market Intelligence

## Problem
Raw Pacifica market data (prices, funding, OI) requires manual interpretation.
Agents and traders must write their own filters, pattern detectors, and alert logic
on top of raw API data. No structured, stable JSON output exists for agent consumption.

## Solution
A market intelligence layer that transforms raw data into actionable insights:
- Market filters (top gainers, losers, by liquidity, by OI)
- Trade pattern analysis (buy pressure, VWAP, whale detection, momentum)
- Alert system (price, funding, volume alerts with triage)
- Stable JSON schema for consistent agent consumption
- Agent recipes: documented tool chains for common analysis workflows

## User Stories
- Trader: `pacifica scan --gainers --min-volume 5000000` → instantly see top movers with enough liquidity to trade
- Trader: `pacifica alerts check` → see which price alerts have triggered since last check
- Agent (Claude): `pacifica_top_markets({sort_by:"gainers", limit:5})` → `pacifica_liquidity_scan({...})` → pick best entry
- Agent (Claude): `pacifica_alert_triage({})` → react to triggered conditions autonomously

## Scope
- Pacifica API only — no external data sources
- Read-only — no new write operations
- Polling-based alerts — no persistent background daemon
- Local JSON storage for alert config (same as journal/smart-orders)

## MCP Tools Added (5 new read tools)
- `pacifica_top_markets`
- `pacifica_liquidity_scan`
- `pacifica_trade_patterns`
- `pacifica_alert_triage`
- `pacifica_market_snapshot`

## CLI Commands Added
- `pacifica alerts list|add|remove|check`
- `pacifica scan --gainers|--losers|--min-volume|--json` (new flags on existing command)
```

---

### UPDATE: `context/technical/API_CONTRACTS.md`

Append new section **"Intelligence Tools (5 — no guardrails needed)"** to the MCP Tools Contract table:

| Tool | Input | Output |
|------|-------|--------|
| `pacifica_top_markets` | `{ sort_by: "gainers"\|"losers"\|"volume"\|"oi"\|"funding", limit?: number, min_volume_usd?: number }` | `MarketSummary[]` ranked with score |
| `pacifica_liquidity_scan` | `{ symbols?: string[], min_volume_usd?: number }` | `LiquidityScan[]` with spread%, slippage estimates |
| `pacifica_trade_patterns` | `{ symbol: string, limit?: number }` | `TradePatternResult` with buy pressure, VWAP, whale orders, momentum |
| `pacifica_alert_triage` | `{ include_dormant?: boolean }` | `AlertTriageResult[]` sorted by urgency |
| `pacifica_market_snapshot` | `{ symbols?: string[] }` | `MarketIntelligenceSnapshot` — composite stable JSON |

Also update the CLI section to document:
- `pacifica scan --gainers` — sort by 24h change desc
- `pacifica scan --losers` — sort by 24h change asc
- `pacifica scan --min-volume <usd>` — filter by 24h volume
- `pacifica scan --json` — output stable JSON array
- `pacifica alerts list|add|remove|check` — alert management

---

### UPDATE: `context/technical/DATA_MODELS.md`

Append new section **"Intelligence Layer (src/core/intelligence/schema.ts)"**:

```typescript
// --- Market Intelligence Schema (v1) ---

interface MarketSummary {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  score: number;           // composite sort score
  rank: number;
}

interface LiquidityScan {
  symbol: string;
  volume24h: number;
  spreadPct: number;       // (best_ask - best_bid) / mid * 100
  depth: {
    bids_10pct: number;    // total bid liquidity within 10% of mid
    asks_10pct: number;
  };
  slippage: {
    usd_10k: number;       // estimated slippage % for $10k market order
    usd_50k: number;
    usd_100k: number;
  };
  liquidityScore: number;  // 0-100
}

interface TradePatternResult {
  symbol: string;
  period: string;          // "last N trades"
  buyPressure: number;     // 0-1 ratio (buy volume / total volume)
  vwap: number;
  currentPrice: number;
  priceVsVwap: number;     // % above/below VWAP
  largeOrders: LargeOrder[];
  momentumSignal: "bullish" | "bearish" | "neutral";
  momentum: number;        // -1 to 1
}

interface LargeOrder {
  price: number;
  size: number;
  sizeUsd: number;
  side: "buy" | "sell";
  timestamp: string;
}

// --- Alert System ---

type AlertType = "price_above" | "price_below" | "funding_above" | "funding_below" | "volume_spike";
type AlertStatus = "active" | "triggered" | "dismissed";

interface Alert {
  id: string;
  symbol: string;
  type: AlertType;
  threshold: number;
  status: AlertStatus;
  createdAt: string;
  triggeredAt?: string;
  note?: string;
}

interface AlertTriageResult {
  alert: Alert;
  currentValue: number;
  distancePct: number;      // % from threshold (negative = triggered)
  urgency: "triggered" | "near" | "dormant";
}

interface MarketIntelligenceSnapshot {
  schemaVersion: "1.0";
  generatedAt: string;      // ISO 8601
  markets: MarketSummary[];
  topGainers: MarketSummary[];
  topLosers: MarketSummary[];
  highestFunding: MarketSummary[];
  liquidityLeaders: LiquidityScan[];
  triggeredAlerts: AlertTriageResult[];
  nearAlerts: AlertTriageResult[];
}
```

---

### UPDATE: `context/project/TASK-LIST.md`

Add new sprint section **"Sprint — M10 Intelligence"** with tasks T44–T55:

| # | Status | Task | Feature |
|---|--------|------|---------|
| T44 | `[ ]` | Create `context/features/m10-agent-intelligence.md` | M10 |
| T45 | `[ ]` | Update API_CONTRACTS.md, DATA_MODELS.md, ROADMAP.md, OVERVIEW.md, DECISIONS.md | M10 |
| T46 | `[ ]` | Create `src/core/intelligence/schema.ts` — stable TypeScript interfaces | M10 |
| T47 | `[ ]` | Create `src/core/intelligence/filter.ts` — market filter engine | M10 |
| T48 | `[ ]` | Create `src/core/intelligence/patterns.ts` — trade pattern analyzer | M10 |
| T49 | `[ ]` | Create `src/core/intelligence/alerts.ts` — alert manager + triage | M10 |
| T50 | `[ ]` | Add `pacifica_top_markets` MCP tool to server.ts | M10 |
| T51 | `[ ]` | Add `pacifica_liquidity_scan` MCP tool to server.ts | M10 |
| T52 | `[ ]` | Add `pacifica_trade_patterns` MCP tool to server.ts | M10 |
| T53 | `[ ]` | Add `pacifica_alert_triage` + `pacifica_market_snapshot` MCP tools | M10 |
| T54 | `[ ]` | Create `src/cli/commands/alerts.ts` + register in index.ts | M10 |
| T55 | `[ ]` | Update `src/cli/commands/scan.tsx` — add --gainers/--losers/--min-volume/--json | M10 |
| T56 | `[ ]` | Create `.claude/commands/intelligence.md` agent recipe skill | M10 |

---

### UPDATE: `context/project/ROADMAP.md`

Add **M10** to the Backlog/Post-Hackathon section:

```markdown
## M10 — Agent-Readable Market Intelligence (Post-Hackathon P1)

| Task | Description |
|------|-------------|
| Intelligence core | filter.ts, patterns.ts, alerts.ts, schema.ts |
| 5 new MCP tools | top_markets, liquidity_scan, trade_patterns, alert_triage, market_snapshot |
| CLI: alerts command | pacifica alerts list/add/remove/check |
| CLI: scan enhancements | --gainers, --losers, --min-volume, --json |
| Agent recipes | Documented tool chains for common analysis |
```

---

### UPDATE: `context/project/OVERVIEW.md`

In "What It Is" section, update the MCP Server description:
- Change "23 tools" → "28 tools"
- Add "intelligence" to the analytics layer description

---

### UPDATE: `context/project/DECISIONS.md`

Add new decision entry:

```markdown
### D9: Stable JSON schema for agent-readable output

**Decision:** All intelligence MCP tools return data conforming to versioned TypeScript interfaces
defined in `src/core/intelligence/schema.ts`. Raw API passthrough is prohibited.

**Date:** 2026-04-05
**Context:** Agents consuming MCP tools need consistent, predictable data shapes.
Raw API fields change format (strings vs numbers, field renames). Schema version field
allows future breaking changes to be detected.

**Rationale:** AI agents cannot tolerate schema drift. A stable contract = agents can
be written once and work across API updates. `schemaVersion: "1.0"` on snapshots lets
agents verify compatibility.

**Consequences:** All intelligence functions must parse, transform, and validate before returning.
Minor overhead vs. raw passthrough.
```

---

## Implementation Steps

1. Read `context/features/_template.md` to check template format
2. Create `m10-agent-intelligence.md`
3. Update `API_CONTRACTS.md` — append intelligence tools table
4. Update `DATA_MODELS.md` — append intelligence schema section
5. Update `TASK-LIST.md` — add T44-T56 sprint
6. Update `ROADMAP.md` — add M10
7. Update `OVERVIEW.md` — update tool count
8. Update `DECISIONS.md` — add D9

## Success Criteria

- [ ] All 7 context files updated/created
- [ ] T44-T56 listed in TASK-LIST.md
- [ ] Data model interfaces fully specified in DATA_MODELS.md
- [ ] API contracts for all 5 new tools documented
- [ ] D9 decision recorded
