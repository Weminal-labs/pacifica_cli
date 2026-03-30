# Task List

> The single source of truth for what needs to be done.
> Updated by Claude after every meaningful piece of work.
> Each task links to the feature file it belongs to.
>
> **Status keys:**
> `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` blocked · `[>]` deferred

---

## How Tasks Are Numbered

Tasks are numbered globally across the whole project: T1, T2, T3...
They never get renumbered — a completed task keeps its number forever.
This means you can reference "T12" in a commit message or conversation and
it always points to the same thing.

---

## Active Sprint — Day 1

Tasks currently being worked on or up next.

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T1 | `[x]` | Project scaffolding: pnpm init, tsconfig, tsup, commander, package.json bin | [M6](../features/m6-interactive-onboarding.md) | Foundation for everything |
| T26 | `[x]` | Build config loader/writer (.pacifica.yaml with validation) | [M6](../features/m6-interactive-onboarding.md) | Needed by init and all commands |
| T2 | `[x]` | Build Pacifica REST SDK client (auth, markets, orders, positions, account) | [M1](../features/m1-market-scanner-order-entry.md) | Core dependency |
| T3 | `[x]` | Build Pacifica WebSocket client with auto-reconnection | [M1](../features/m1-market-scanner-order-entry.md) | Needed for live scan |
| T27 | `[x]` | Implement `pacifica init` wizard with @inquirer/prompts | [M6](../features/m6-interactive-onboarding.md) | First thing judges see |
| T28 | `[x]` | Implement connection verification step (REST + WebSocket test) | [M6](../features/m6-interactive-onboarding.md) | End of init wizard |
| T4 | `[x]` | Implement `pacifica scan` command with Ink live table | [M1](../features/m1-market-scanner-order-entry.md) | First visual wow |

---

## Active Sprint — Day 2

Tasks currently being worked on or up next.

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T5 | `[x]` | Implement `pacifica trade buy/sell` with validation and confirmation | [M1](../features/m1-market-scanner-order-entry.md) | |
| T6 | `[x]` | Implement `pacifica orders` list and `pacifica orders cancel` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T7 | `[x]` | Implement `pacifica positions` list and `pacifica positions close` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T8 | `[x]` | Build MCP server with 12 tools (8 read + 4 write) | [M1](../features/m1-market-scanner-order-entry.md) | The differentiator |
| T9 | `[x]` | Build guardrail checker module | [M5](../features/m5-agent-guardrails.md) | |
| T10 | `[x]` | Build daily spending tracker with midnight reset | [M5](../features/m5-agent-guardrails.md) | |
| T11 | `[x]` | Build agent action logger | [M5](../features/m5-agent-guardrails.md) | |
| T12 | `[x]` | Implement `pacifica agent status/stop/start/config/log` commands | [M5](../features/m5-agent-guardrails.md) | |
| T29 | `[x]` | Build risk calculator module + ASCII heatmap bar | [M7](../features/m7-position-heatmap.md) | |
| T30 | `[x]` | Build HeatmapView with risk summary | [M7](../features/m7-position-heatmap.md) | |
| T31 | `[x]` | Implement `pacifica heatmap` and `pacifica heatmap --compact` commands | [M7](../features/m7-position-heatmap.md) | |
| T32 | `[x]` | Risk data exposed via MCP (agent_status tool) | [M7](../features/m7-position-heatmap.md) | |
| T33 | `[x]` | Build journal logger module | [M8](../features/m8-pnl-journal.md) | |
| T34 | `[x]` | Journal integration ready (trade commands structured for logging) | [M8](../features/m8-pnl-journal.md) | |
| T35 | `[x]` | Implement `pacifica journal` command with daily/weekly/monthly views | [M8](../features/m8-pnl-journal.md) | |

---

## Backlog — Day 3

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T13 | `[ ]` | Build Binance funding rate fetcher | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T14 | `[ ]` | Build Bybit funding rate fetcher | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T20 | `[ ]` | Build symbol mapping (Pacifica <> Binance <> Bybit) | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T21 | `[ ]` | Implement `pacifica funding` and `pacifica funding-arb` commands | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T22 | `[ ]` | Add MCP tools: funding_rates, funding_arb_scan, funding_history | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T15 | `[ ]` | Build smart order manager with poll loop and state persistence | [M2](../features/m2-smart-order-manager.md) | |
| T16 | `[ ]` | Implement trailing stop logic | [M2](../features/m2-smart-order-manager.md) | |
| T17 | `[ ]` | Implement `pacifica smart` CLI subcommands | [M2](../features/m2-smart-order-manager.md) | |
| T40 | `[ ]` | Build Claude Code Skills (5 slash commands) | All | |
| T41 | `[ ]` | Demo script rehearsal and polish | — | Run through 3x minimum |

---

## Deferred (P2 / Post-Hackathon)

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T18 | `[>]` | Implement partial take-profit logic | [M2](../features/m2-smart-order-manager.md) | P2 |
| T19 | `[>]` | Implement DCA entry, breakeven auto, time stop | [M2](../features/m2-smart-order-manager.md) | P2 |
| T23 | `[>]` | Build webhook HTTP server with fastify | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T24 | `[>]` | Implement webhook validation and order execution | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T25 | `[>]` | Add `pacifica webhook status/logs` commands | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T36 | `[>]` | Implement journal export (CSV/JSON) | [M8](../features/m8-pnl-journal.md) | P2 |
| T37 | `[>]` | Build event emitter module | [M9](../features/m9-event-hooks.md) | P2 |
| T38 | `[>]` | Build hook executor with template replacement | [M9](../features/m9-event-hooks.md) | P2 |
| T39 | `[>]` | Implement `pacifica hooks list/test/log` commands | [M9](../features/m9-event-hooks.md) | P2 |

---

## Blocked

| # | Task | Feature | Blocked by |
|---|------|---------|------------|
| — | — | — | — |

---

## Completed

| # | Task | Feature | Completed |
|---|------|---------|-----------|
| T1 | Project scaffolding: pnpm, tsconfig, tsup, commander, package.json bin | M6 | 2026-03-29 |
| T26 | Config loader/writer (.pacifica.yaml with zod validation) | M6 | 2026-03-29 |
| T2 | Pacifica REST SDK client (Ed25519 signing, rate limiter, TTL cache, retry) | M1 | 2026-03-29 |
| T3 | Pacifica WebSocket client (auto-reconnect, heartbeat, channel subscriptions) | M1 | 2026-03-29 |
| T27 | `pacifica init` wizard with @inquirer/prompts (5-step onboarding) | M6 | 2026-03-29 |
| T28 | Connection verification step (REST + WebSocket test in init wizard) | M6 | 2026-03-29 |
| T4 | `pacifica scan` command with Ink live table + WebSocket price updates | M1 | 2026-03-29 |
| T5 | `pacifica trade buy/sell` with validation, confirmation, TP/SL | M1 | 2026-03-29 |
| T6 | `pacifica orders` list + cancel + cancel-all | M1 | 2026-03-29 |
| T7 | `pacifica positions` list + close (reduce-only market order) | M1 | 2026-03-29 |
| T8 | MCP server with 12 tools (8 read + 4 write) with guardrails | M1 | 2026-03-29 |
| T9 | Guardrail checker module (6-step validation chain) | M5 | 2026-03-29 |
| T10 | Daily spending tracker (midnight reset, persisted to JSON) | M5 | 2026-03-29 |
| T11 | Agent action logger (append-only audit trail) | M5 | 2026-03-29 |
| T12 | `pacifica agent status/stop/start/config/log` (5 subcommands) | M5 | 2026-03-29 |
| T29 | Risk calculator + ASCII heatmap bar rendering | M7 | 2026-03-29 |
| T30 | HeatmapView with full + compact modes + risk summary | M7 | 2026-03-29 |
| T31 | `pacifica heatmap` command with --compact flag | M7 | 2026-03-29 |
| T32 | Risk data exposed via MCP agent_status tool | M7 | 2026-03-29 |
| T33 | Journal logger module (append-only, period filtering, summaries) | M8 | 2026-03-29 |
| T34 | Journal integration ready for trading flows | M8 | 2026-03-29 |
| T35 | `pacifica journal` with daily/weekly/monthly views + --json | M8 | 2026-03-29 |

---

## Task States

| Symbol | Meaning | When to use |
|--------|---------|-------------|
| `[ ]` | Todo | Not started |
| `[~]` | In progress | Currently being worked on |
| `[x]` | Done | Completed and verified |
| `[-]` | Blocked | Waiting on something else |
| `[>]` | Deferred | Decided to push to later phase |
