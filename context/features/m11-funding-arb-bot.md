# Feature: Funding Rate Arbitrage Bot (M11)

> **Status:** `complete`
> **Phase:** v1 — Builder Program Submission
> **Last updated:** 2026-04-12

---

## Summary

Automated bot that monitors Pacifica funding rates (and optionally compares them to Binance/Bybit
public rates), detects high-APR opportunities, enters funding-collection positions, monitors until
settlement, and exits. Every order includes the builder code so the team earns fees on all executions.

---

## Users

- **Minh:** Wants passive funding income without watching the screen. Starts the bot, walks away.
- **AI Agent:** Uses MCP tools to scan opportunities, open positions, and track P&L autonomously.

---

## User Stories

- As a **trader**, I want to see which Pacifica markets have the highest funding rates right now
- As a **trader**, I want to start a bot that auto-enters funding collection positions when APR > threshold
- As a **trader**, I want to see cumulative funding earned, fees paid, and net P&L at a glance
- As an **AI agent**, I want MCP tools to scan, open, monitor, and close arb positions

---

## Architecture

New module `src/core/arb/` — sibling to `src/core/smart/`, same polling pattern.
State persisted to `~/.pacifica/arb-state.json` (atomic tmp→rename writes, mode 0o600).

Builder Code injected in `src/core/sdk/signer.ts` + `client.ts` — covers ALL order types.

---

## Behaviour

### `pacifica arb scan`
1. Fetch all 75 markets from Pacifica
2. Optionally fetch Binance/Bybit public funding rates
3. Run `detectOpportunities()` — score and rank
4. Table: symbol, rate, APR, side (who collects), volume, score, external divergence
5. Respect `--min-apr` and `--json` flags

### `pacifica arb start`
1. Load config, validate, print summary
2. Start `ArbManager` poll loop
3. Scanner runs every 30s; position monitor runs every 5s
4. Enters positions when opportunities found and under `max_concurrent_positions`

### `pacifica arb status`
- Ink TUI: active positions, funding accrued per position, next settlement countdown, lifetime P&L

### `pacifica arb stop / list / close / config`
- Graceful stop, history table, manual close, config update

---

## Opportunity Detection Algorithm

For each market:
1. **Liquidity gate**: volume_24h > min_market_volume_24h_usd
2. **Dedupe**: no existing active position on this symbol
3. **Rate gate**: annualized APR > min_apr_threshold
4. **Spread gate**: book spread < max_spread_bps
5. **Settlement proximity veto**: do not enter within 2 minutes of settlement
6. **Score** = APR × liquidityFactor × (1 - spreadBps/100) × timeDecayFactor

Side: `rate > 0` → shorts collect → `short_collects`; `rate < 0` → longs collect → `long_collects`

---

## Builder Code Integration

`builder_code` injected in `signer.ts` `signPayload()` for all order-creating operation types.
Configured via `.pacifica.yaml` `builder_code:` field.
Wired through `init` wizard as an optional step.

---

## Cross-Exchange Rates

Binance + Bybit public funding endpoints (no auth, no API keys):
- Binance: `GET https://fapi.binance.com/fapi/v1/premiumIndex`
- Bybit: `GET https://api.bybit.com/v5/market/tickers?category=linear`

Used as **signal only** (divergence scoring, displayed in scan table).
Hedge execution on external venues is out of scope for v1.
Controlled by `arb.use_external_rates` config flag (default: true).

---

## Risk Controls

1. Max concurrent notional cap
2. Per-market 8h cooldown after close
3. Rate-sign flip abort at entry
4. Fee-to-funding ratio gate (reject if fees > 50% of expected one-interval funding)
5. Settlement proximity hard veto (2-min blackout before settlement)
6. Max arb daily loss ($200 default, auto-disables `arb.enabled`)

---

## Connections

- **Depends on:** M1 (SDK client, signing), M3 (funding data), M5 (guardrails)
- **Extends:** Builder Program integration (builder_code on all orders)

---

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T57 | `[x]` | Create this feature spec |
| T58 | `[x]` | Builder Code: inject into signer.ts / client.ts / config types |
| T59 | `[x]` | Wire Builder Code through init wizard |
| T60 | `[x]` | Create `src/core/arb/types.ts` |
| T61 | `[x]` | Create `src/core/arb/scanner.ts` + unit tests |
| T62 | `[x]` | Create `src/core/arb/external.ts` (Binance/Bybit rate fetchers) |
| T63 | `[x]` | Create `src/core/arb/executor.ts` (entry/exit wrappers) |
| T64 | `[x]` | Create `src/core/arb/pnl.ts` (funding P&L accounting) |
| T65 | `[x]` | Create `src/core/arb/manager.ts` (poll loop + full lifecycle) |
| T66 | `[x]` | Arb-specific guardrails in ArbManager.canOpen() |
| T67 | `[x]` | Create `src/cli/commands/arb.ts` + register in index.ts |
| T68 | `[x]` | Create `src/cli/views/ArbView.tsx` (Ink TUI for arb status) |
| T69 | `[x]` | Add 6 MCP tools in server.ts |
| T70 | `[x]` | Manager lifecycle tests |
| T71 | `[x]` | P&L math tests |
| T72 | `[~]` | Update context/ files (ARCHITECTURE, DATA_MODELS, API_CONTRACTS) |
| T73 | `[ ]` | Update DECISIONS.md, ROADMAP.md, SCOPE.md |
| T74 | `[ ]` | Add /arb Claude Code skill |
| T75 | `[ ]` | Demo-path rehearsal |

---

## UAT Status: `pending`
