# Codebase Audit — Simulate / Backtest Feature
_researcher-02 · 2026-04-15_

---

## 1. Current Simulate Page (`web/app/simulate/page.tsx`)

**What it renders:**
- Trade risk calculator: direction (long/short), market, size USD, leverage, entry price, 8h funding rate
- Outputs: liquidation price, P&L at ±5/10/20% price moves, funding cost projection (8h / 24h / 7d)
- Preset buttons for leverage (2x–50x) and size ($100–$5k)

**Data source:**
- Single live API call: `GET http://localhost:4242/api/intelligence/snapshot/:symbol`
- Only used to auto-fill entry price from `current_conditions.mark_price`
- All calculations are **pure client-side math** — no historical data, no backtest engine

**What is missing for backtesting:**
- No price history / OHLCV fetching
- No replay of past market conditions
- Funding rate is a single manual input (user-supplied or static from snapshot)

---

## 2. Intelligence Data Available

### Stored locally (`~/.pacifica/`)
- `intelligence-records.json` — `IntelligenceRecord[]`: every trade captured at execution, with full `MarketContext` at entry + optional `TradeOutcome` at close
- `patterns-verified.json` — `DetectedPattern[]`: statistically verified patterns (win rate, avg PnL %, sample size, condition set)
- `reputation-scores.json` — `TraderReputation[]`: per-trader aggregated accuracy

### Key types available for backtest use
**`MarketContext`** fields (captured per trade):
  - `funding_rate`, `open_interest_usd`, `oi_change_4h_pct`, `mark_price`
  - `volume_24h_usd`, `buy_pressure` (0–1), `momentum_signal`, `momentum_value`
  - `large_orders_count`, `captured_at` (ISO timestamp)

**`IntelligenceRecord`** fields:
  - `asset`, `direction`, `size_usd`, `entry_price`, `opened_at`, `closed_at`
  - `pattern_tags[]`, `market_context` (entry), `outcome.exit_market_context`

**`DetectedPattern`** fields:
  - `conditions[]` (axis / op / value), `win_rate`, `avg_pnl_pct`, `avg_duration_minutes`
  - `sample_size`, `primary_assets[]`, `verified`, `last_seen_at`

### What is MISSING
- **No OHLCV / candle data** — no price history stored anywhere in the codebase (`candle`, `ohlcv`, `kline` grep returns zero results)
- No time-series of mark prices; only point-in-time snapshots attached to individual trades
- No stored funding rate time-series (funding history is fetched on demand from Pacifica API, not persisted)

---

## 3. Paper Trading Engine (`src/cli/commands/paper.ts`)

**State file:** `~/.pacifica/paper-state.json`

**`PaperState` shape:**
```
balance: number
equity: number
positions: PaperPosition[]   // open positions
orders:    PaperOrder[]      // pending limit orders
history:   PaperTrade[]      // closed/liquidated trades
created_at / updated_at: string
```

**`PaperTrade` (history records):**
- `symbol`, `side`, `size`, `entry_price`, `exit_price?`, `leverage`
- `realized_pnl?`, `opened_at`, `closed_at?`, `status` (open/closed/liquidated)

**Queryable?**
- Yes — flat JSON array, fully readable. `history` is the closed-trade log.
- No API endpoint exposes it; only the CLI `pacifica paper history` command reads it.
- No integration with the intelligence store or the web dashboard.

---

## 4. Intelligence API Endpoints (`src/intelligence-api/server.ts`)

| Endpoint | Returns |
|---|---|
| `GET /api/intelligence/feed` | active patterns, whale activity, high-rep open signals |
| `GET /api/intelligence/snapshot/:market` | latest `MarketContext` for a market + matching patterns |
| `GET /api/intelligence/patterns` | all `DetectedPattern[]`, sortable/filterable |
| `GET /api/intelligence/patterns/:id` | single pattern |
| `GET /api/intelligence/social/:asset` | Elfa social context + confidence-scored signals |
| `GET /api/intelligence/reputation` | leaderboard (live Pacifica testnet + local enrichment) |
| `GET /api/intelligence/trader/:address` | reputation + trade records for one trader |
| `GET /api/real/markets` | live mark price, funding, OI, volume for all markets |
| `GET /api/real/leaderboard` | live Pacifica testnet leaderboard |

**No endpoint exposes historical price series or OHLCV.**

---

## 5. SDK / API — OHLCV / Price History

**`PacificaClient` methods (`src/core/sdk/client.ts`):**
- `getMarkets()` — current mark prices only (merged `/info` + `/info/prices`)
- `getFundingHistory(symbol, limit?)` — **funding rate history exists** via `GET /api/v1/funding_rate/history`
- `getRecentTrades(symbol)` — recent public trades (price + size + side + timestamp)
- `getTradeHistory(symbol?, limit?)` — authenticated account trade history

**OHLCV / candle data:** NOT present. No SDK method, no API endpoint, no stored data.

---

## Summary: EXISTS vs MISSING

| What | Exists? |
|---|---|
| Live mark price (per market, point-in-time) | YES — `/api/real/markets`, snapshot endpoint |
| Historical funding rates (on-demand, not stored) | YES — SDK `getFundingHistory()` |
| Recent public trade ticks (price + side) | YES — SDK `getRecentTrades()` |
| Intelligence records with entry `MarketContext` | YES — local JSON store |
| Closed trade outcomes (PnL, duration, exit price) | YES — `IntelligenceRecord.outcome` |
| Verified patterns with stats | YES — local JSON store |
| Paper trade history | YES — `~/.pacifica/paper-state.json` |
| OHLCV / candle data | **NO** |
| Stored price time-series | **NO** |
| Backtest engine (replay engine) | **NO** |
| API endpoint for intelligence records directly | **NO** (patterns/feed only) |
| Paper trade history exposed via API | **NO** |
