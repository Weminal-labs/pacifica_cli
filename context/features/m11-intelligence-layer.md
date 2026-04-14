# M11: Pacifica Intelligence Layer

> Status: Planning · Last updated: 2026-04-12
> Builds on: M10 (Agent-Readable Market Intelligence)

---

## Problem

Raw chain data is unreadable by agents at speed. The existing M10 layer structures
*market* data (prices, OI, funding). But there is a second, deeper gap:

**The behavior of traders is also data — and it goes completely unrecorded.**

Every trade executed through Pacifica CLI carries implicit intelligence:
- What market conditions existed at entry
- What direction the trader bet on
- Whether they were right

This behavioral data evaporates. No one aggregates it. No agent can learn from it.
The result: every agent starts from zero, every session. There is no cumulative
intelligence layer — just raw API calls, repeated forever.

---

## Solution

A **passive, behavior-driven intelligence layer** that:

1. **Captures** market state at every trade execution (zero friction — traders just trade)
2. **Observes** outcomes when positions close
3. **Detects patterns** — conditions that correlate with profitable outcomes, across traders
4. **Builds reputation** — based on actual P&L accuracy, not self-reported signals
5. **Surfaces intelligence** — to agents via MCP tools and to humans via web UI

The key principle: **trades ARE the signals. Outcomes ARE the verification.**
No manual submission. No gameable self-reporting.

---

## The 4 Pillars Applied

| Pillar | In This Product |
|--------|----------------|
| **Structure It** | Market state snapshot captured at trade entry in stable JSON schema |
| **Verify It** | Position outcome (P&L) is ground truth — no self-report possible |
| **Make it Composable** | Intelligence records queryable via MCP tools + REST API |
| **Incentivize It** | Reputation score emerges from verified accuracy; patterns minted as NFTs (Phase 2) |

---

## Data Flow

### Auto-Capture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Trader executes: pacifica trade buy ETH 1000 --leverage 5      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Capture Layer (hooks into trade execution)                     │
│  • Calls MCP: get_market, funding_rates, trade_patterns         │
│  • Builds MarketContext snapshot                                 │
│  • Hashes trader identity (anonymized)                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  IntelligenceRecord created                                     │
│  { id, trader_id_hash, asset, direction, size_usd,             │
│    entry_price, market_context, opened_at, pattern_tags: [] }  │
│  → Appended to intelligence-records.json                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              (when position closes)
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Outcome Attached                                               │
│  • Position monitor detects close (poll or user-triggered)      │
│  • Captures: pnl_pct, pnl_usd, duration_minutes, exit_context  │
│  • Updates record: { outcome, closed_at, profitable }           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Pattern Engine                                                 │
│  • Scans all closed records for condition clusters              │
│  • Computes: win_rate, avg_pnl_pct per condition set            │
│  • When sample_size >= 20 AND win_rate > 60%: pattern candidate │
│  • Verified patterns added to patterns-verified.json            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Reputation Update                                              │
│  • Trader's accuracy_by_condition updated                       │
│  • overall_rep_score recalculated                               │
│  • High-rep traders' open positions → surface in feed           │
└─────────────────────────────────────────────────────────────────┘
```

### Pattern Detection Flow

```
All closed IntelligenceRecords
         │
         ▼
For each condition axis:
  funding_rate < -0.03%  →  filter matching records
  oi_change_4h_pct > 10% →  further filter
         │
         ▼
  N = 47 records match [negative_funding + rising_oi]
  profitable: 34 / 47 = 72.3% win rate
  avg_pnl_pct: +6.8%
         │
         ▼
  N >= 20 AND win_rate >= 60%?  → YES
         │
         ▼
  DetectedPattern created:
    name: "Negative Funding + Rising OI"
    conditions: [{axis:"funding_rate", op:"lt", value:-0.03},
                 {axis:"oi_change_4h_pct", op:"gt", value:10}]
    sample_size: 47, win_rate: 0.723, avg_pnl_pct: 6.8
    verified: true
    (Phase 2: nft_token_id minted on Base L2)
         │
         ▼
  MCP tool pacifica_intelligence_patterns() returns this pattern
  Agent sees: "Current conditions match. Historical 72% win rate."
```

### Web UI Data Flow

```
Pacifica REST API ──► MCP Tools (28+ existing) ──► Intelligence Layer
                                                          │
                              ┌───────────────────────────┤
                              │                           │
                      intelligence-records.json   patterns-verified.json
                      reputation-scores.json               │
                              │                           │
                              └───────────────────────────┘
                                          │
                                          ▼
                              Next.js API Routes (/api/intelligence/*)
                                          │
                                          ▼
                              Web Dashboard (dark cinematic UI)
                         ┌────────┬───────────┬───────────┬──────────┐
                     Feed    Snapshot    Patterns    Reputation
```

---

## Data Models

```typescript
// ─── Core record ───────────────────────────────────────────────

export interface IntelligenceRecord {
  id: string;                          // nanoid, e.g. "ir_01j..."
  trader_id: string;                   // SHA-256 hash of wallet/key
  asset: string;                       // "BTC-USDC-PERP"
  direction: "long" | "short";
  size_usd: number;
  entry_price: number;
  market_context: MarketContext;       // snapshot at entry
  opened_at: string;                   // ISO 8601
  closed_at?: string;
  outcome?: TradeOutcome;
  pattern_tags: string[];              // e.g. ["negative_funding","rising_oi"]
  schema_version: "1.0";
}

// ─── Market context (captured at entry AND exit) ────────────────

export interface MarketContext {
  funding_rate: number;                // e.g. -0.0004 (= -0.04%)
  open_interest_usd: number;
  oi_change_4h_pct: number;
  mark_price: number;
  volume_24h_usd: number;
  buy_pressure: number;                // 0.0–1.0 from patterns.ts
  momentum_signal: "bullish" | "bearish" | "neutral";
  momentum_value: number;              // -1.0 to 1.0
  large_orders_count: number;         // whale activity at entry
  captured_at: string;                // ISO 8601
}

// ─── Outcome (attached when position closes) ────────────────────

export interface TradeOutcome {
  pnl_pct: number;                    // e.g. 8.3 (%)
  pnl_usd: number;
  duration_minutes: number;
  exit_price: number;
  exit_market_context: MarketContext;
  profitable: boolean;
  liquidated: boolean;
}

// ─── Pattern engine output ──────────────────────────────────────

export interface PatternCondition {
  axis: keyof MarketContext;           // e.g. "funding_rate"
  op: "lt" | "gt" | "lte" | "gte";
  value: number;
  label: string;                       // e.g. "funding < -0.03%"
}

export interface DetectedPattern {
  id: string;                          // "pat_01j..."
  name: string;                        // "Negative Funding + Rising OI"
  conditions: PatternCondition[];
  sample_size: number;
  win_rate: number;                    // 0.0–1.0
  avg_pnl_pct: number;
  avg_duration_minutes: number;
  primary_assets: string[];            // assets this pattern appears on
  verified: boolean;
  verified_at?: string;
  nft_token_id?: string;              // Phase 2: minted on Base L2
  last_seen_at: string;               // most recent matching trade
}

// ─── Reputation ─────────────────────────────────────────────────

export interface ConditionAccuracy {
  condition_key: string;               // e.g. "negative_funding"
  total_trades: number;
  profitable_trades: number;
  win_rate: number;
  avg_pnl_pct: number;
  last_updated: string;
}

export interface TraderReputation {
  trader_id: string;                  // same hash as IntelligenceRecord
  total_trades: number;
  closed_trades: number;
  overall_win_rate: number;
  overall_rep_score: number;          // 0–100 composite
  accuracy_by_condition: Record<string, ConditionAccuracy>;
  top_patterns: string[];             // pattern IDs they trade well
  last_updated: string;
}
```

---

## Local Storage (Phase 1)

Follows existing pattern (journal, agent-log, smart-orders):

```
~/.pacifica/
  intelligence-records.json      # append-only array of IntelligenceRecord
  patterns-verified.json         # array of DetectedPattern
  reputation-scores.json         # map of trader_id → TraderReputation
```

---

## MCP Tools Added (3 new read tools)

### `pacifica_intelligence_patterns`
Returns verified patterns and whether current market conditions match any.

**Input:**
```json
{ "market": "BTC-USDC-PERP", "min_win_rate": 0.6, "min_sample_size": 20 }
```

**Output:**
```json
{
  "current_conditions": { "funding_rate": -0.0004, "oi_change_4h_pct": 12.3, ... },
  "matching_patterns": [
    {
      "name": "Negative Funding + Rising OI",
      "win_rate": 0.723,
      "avg_pnl_pct": 6.8,
      "sample_size": 47,
      "verified": true
    }
  ],
  "all_verified_patterns": [...]
}
```

### `pacifica_intelligence_feed`
Returns the live intelligence feed: active patterns, whale alerts, high-rep signals.

**Input:** `{ "limit": 20 }`

**Output:**
```json
{
  "active_patterns": [...],
  "whale_activity": [...],           // large orders from patterns.ts
  "high_rep_signals": [              // open positions of top traders
    { "asset": "ETH", "direction": "long", "rep_score": 87, "opened_at": "..." }
  ],
  "generated_at": "..."
}
```

### `pacifica_intelligence_reputation`
Returns trader reputation leaderboard (anonymized).

**Input:** `{ "limit": 10, "sort_by": "overall_rep_score" }`

**Output:**
```json
{
  "leaderboard": [
    { "rank": 1, "trader_id": "0xabc...", "rep_score": 94,
      "win_rate": 0.78, "total_trades": 312,
      "top_patterns": ["Negative Funding + Rising OI"] }
  ]
}
```

---

## REST API Contracts (Web UI)

Base path: `http://localhost:4242/api/intelligence`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/feed` | Live feed: patterns + whale activity + rep signals |
| GET | `/snapshot/:market` | Current conditions + matching patterns for one market |
| GET | `/patterns` | All verified patterns, sortable |
| GET | `/patterns/:id` | Single pattern detail + trade history |
| GET | `/reputation` | Anonymized leaderboard |
| GET | `/records` | Intelligence records (own trader only, paginated) |
| GET | `/health` | Server health check |

**Feed response shape:**
```json
{
  "active_patterns": [DetectedPattern],
  "whale_activity": [{ asset, direction, size_usd, timestamp }],
  "high_rep_signals": [{ asset, direction, rep_score, opened_at }],
  "market_overview": MarketIntelligenceSnapshot,
  "generated_at": "ISO8601"
}
```

**Snapshot response shape:**
```json
{
  "market": "ETH-USDC-PERP",
  "current_conditions": MarketContext,
  "matching_patterns": [DetectedPattern],
  "best_pattern_match": DetectedPattern | null,
  "agent_summary": "Current conditions match 2 verified patterns. Strongest: Negative Funding + Rising OI (72% win rate, 47 trades)."
}
```

---

## Web UI — Component Breakdown

**Tech stack:** Next.js 14 App Router · Tailwind CSS · Framer Motion · shadcn/ui

**Design tokens:**
```
bg-primary:    #0A0A0A
bg-surface:    #141414
bg-card:       #1C1C1C
accent:        #F97316  (orange)
text-primary:  #FFFFFF
text-muted:    #6B7280
border:        #1F1F1F
radius-card:   8px
radius-pill:   9999px
font:          Inter
```

---

### Page 1: Intelligence Feed (`/`)

**Hero section:**
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    Markets are 24/7.                                    │
│    Your intelligence should be too.                     │
│                                                         │
│    [View Live Feed]  [Connect Agent]                    │
│                                                         │
│    ┌──── floating terminal mockup ────┐                 │
│    │  pacifica scan --json | jq       │                 │
│    │  > 3 patterns active             │                 │
│    │  > ETH: neg funding + rising OI  │                 │
│    └──────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- `<HeroSection>` — headline + dual CTA + terminal animation
- `<LivePatternFeed>` — card grid, each card: pattern name, win rate badge (orange), sample size, "Active now" indicator
- `<WhaleActivityFeed>` — scrolling list: asset + direction + size + time ago
- `<HighRepSignals>` — anonymized open positions from top-rep traders, with rep score badge

---

### Page 2: Market Snapshot (`/snapshot/[market]`)

```
Split layout (reference design):
Left (40%): live market data card — price, funding rate, OI, momentum signal
Right (60%): pattern match result + agent summary

"/ MARKET SNAPSHOT" (orange label)
"Current conditions match a verified pattern"
Pattern name + win rate + sample size
[View Full Pattern]
```

**Components:**
- `<MarketConditionsCard>` — live data from `/api/intelligence/snapshot/:market`
- `<PatternMatchResult>` — "Matches: Negative Funding + Rising OI" + 72% badge
- `<AgentSummaryCard>` — natural language summary generated by the API
- `<ConditionsList>` — breakdown of each matched condition with current value

---

### Page 3: Pattern Library (`/patterns`)

```
"/ PATTERN LIBRARY" (orange label)
"Verified by 2,400+ trades across 47 days"

Filter bar: [All Assets ▼] [Win Rate ▼] [Sample Size ▼]

Grid of PatternCard:
┌────────────────────────────────┐
│ 🟠 VERIFIED                    │
│ Negative Funding + Rising OI   │
│                                │
│ Win Rate    Sample   Avg P&L   │
│ 72.3%       47       +6.8%     │
│                                │
│ Assets: BTC ETH SOL            │
│ Last seen: 2h ago              │
└────────────────────────────────┘
```

**Components:**
- `<PatternFilterBar>` — asset, win rate, date range filters
- `<PatternCard>` — verified badge, name, win_rate, sample_size, avg_pnl, assets, last_seen
- `<PatternDetailModal>` — conditions breakdown, trade distribution chart (fake/seeded for demo), historical timeline

---

### Page 4: Reputation Ledger (`/reputation`)

```
"/ REPUTATION LEDGER" (orange label)
"Intelligence that earns — accuracy builds reputation"

Leaderboard table:
Rank  Trader       Rep Score  Win Rate  Trades  Top Pattern
1     0xabc...     94         78%       312     Neg Funding + Rising OI
2     0xdef...     87         71%       198     Whale Entry + Momentum
...

Below table: NFT concept visualization
"Verified patterns are minted as permanent intelligence records"
[orange pill] "12 patterns verified" [orange pill] "3 minted"
```

**Components:**
- `<ReputationLeaderboard>` — sortable table, anonymized trader IDs
- `<AccuracyByCondition>` — which market conditions each trader reads best
- `<IntelligenceNFTSection>` — visual ledger of minted pattern records (demo: static cards)
- `<NFTCard>` — pattern name, mint date, chain badge (Base), token ID

---

## Implementation Phases

### Phase 1 — Hackathon (2 days)

**Day 1:**
- [ ] T57: Capture layer — hook `captureIntelligence()` into `trade` command post-execution
- [ ] T58: `src/core/intelligence/capture.ts` — snapshot market context via existing MCP tools
- [ ] T59: `src/core/intelligence/store.ts` — append-only JSON store (same pattern as journal.ts)
- [ ] T60: `src/core/intelligence/outcome.ts` — attach P&L when position closes
- [ ] T61: Pattern engine MVP — `src/core/intelligence/engine.ts` — simple win-rate calculator
- [ ] T62: Pre-seed mock data — 80 realistic intelligence records across 3 assets for demo

**Day 2:**
- [ ] T63: REST API server — `src/intelligence-api/server.ts` (fastify, port 4242)
- [ ] T64: API routes — `/feed`, `/snapshot/:market`, `/patterns`, `/reputation`
- [ ] T65: Next.js web app scaffold — `web/` directory, Tailwind, design tokens
- [ ] T66: Intelligence Feed page + components
- [ ] T67: Market Snapshot page + components
- [ ] T68: Pattern Library page + PatternCard component
- [ ] T69: Reputation Ledger page (static for demo)
- [ ] T70: 3 new MCP tools: `pacifica_intelligence_patterns`, `pacifica_intelligence_feed`, `pacifica_intelligence_reputation`

### Phase 2 — Post-Hackathon

- Real cross-trader aggregation (requires shared backend or opt-in sync)
- Reputation model with position-size weighting
- Onchain NFT minting for verified patterns (Base L2, ERC-1155)
- Permission/privacy layer — granular opt-in for data sharing
- Pattern aging — detect when patterns stop working
- Agent recipe: "check patterns before trade" as a Claude Code skill
- Revenue layer: API key access to intelligence feed (subscription model)

---

## Demo Script — 10-Minute Hackathon Path

### Setup (before demo)
- `web/` app running on `localhost:3000`
- Intelligence API running on `localhost:4242`
- 80 pre-seeded intelligence records loaded
- 3 verified patterns in `patterns-verified.json`
- Pacifica CLI connected to testnet

---

### Act 1 (0:00–2:00) — The Gap

> "Every trading agent starts from zero. It reads raw API data, decides, acts.
>  Then the session ends — and all that intelligence disappears.
>  We built the layer that makes it cumulative."

- Open `web/` → Intelligence Feed
- Show: 3 verified patterns, whale activity, high-rep signals
- Say: "This is what 80 trades, across 3 assets, taught the system."

---

### Act 2 (2:00–5:00) — Structure It + Verify It

> "Every trade through Pacifica CLI silently captures market state at entry."

- In terminal: `pacifica trade buy ETH 500`
- Trade executes → say: "Behind the scenes, funding rate, OI, momentum — all captured"
- Open intelligence store: `cat ~/.pacifica/intelligence-records.json | tail -1 | jq`
- Show the structured record
- Say: "When this position closes, the outcome attaches. That's the verification."

---

### Act 3 (5:00–8:00) — Patterns Emerge

> "Enough trades in similar conditions — a pattern gets verified."

- Open `/patterns` page
- Show "Negative Funding + Rising OI" card — 72% win rate, 47 trades
- Click into detail — show conditions, historical distribution
- Switch to `/snapshot/ETH-USDC-PERP`
- Say: "Current ETH conditions match this pattern right now."
- Show the match: funding -0.04%, OI +12%, pattern highlighted

---

### Act 4 (8:00–10:00) — The Agent Uses It

> "Any AI agent can now read this intelligence via MCP."

- In Claude: "What market patterns are active right now?"
- Claude calls `pacifica_intelligence_patterns({ market: "ETH-USDC-PERP" })`
- Response shows matching pattern + win rate
- Claude: "Current conditions match Negative Funding + Rising OI (72% win rate, 47 trades). Recommend entering long with tight stop at liquidation cluster."
- Say: "That's the gap closed. From raw chain data — to agent-readable intelligence — to a verified trade recommendation."
- Show `/reputation` — "And every accurate call builds reputation."

---

## Open Questions

1. **Privacy:** SHA-256 hash of API key is reversible if key is known. Consider HMAC with a server-side secret for stronger anonymization in production.

2. **Multi-trader aggregation (hackathon):** Current design is single-trader local data. For demo, pre-seed data represents "multiple traders" but is actually synthetic. Real aggregation needs a shared backend or opt-in P2P sync — post-hackathon.

3. **NFT standard:** ERC-1155 preferred (batch minting, lower gas) vs ERC-721. Which L2 — Base (Coinbase ecosystem, low fees) vs Arbitrum (larger DeFi ecosystem)?

4. **Reputation wallet linkage:** Does `trader_id` need to link to a wallet for NFT claiming, or stay pseudonymous? Pseudonymous is simpler and more privacy-preserving but limits the incentive model.

5. **Pattern aging:** How long until a pattern is considered stale? Markets change regimes. Need a decay function or recency weighting — not designed yet.

6. **Capture timing:** Outcome attachment currently requires user to run `pacifica positions` to trigger the check. A background daemon would be cleaner but adds complexity. For hackathon: poll on every CLI command invocation.
