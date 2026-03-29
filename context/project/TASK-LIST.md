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
| T1 | `[ ]` | Project scaffolding: pnpm init, tsconfig, tsup, commander, package.json bin | [M6](../features/m6-interactive-onboarding.md) | Foundation for everything |
| T26 | `[ ]` | Build config loader/writer (.pacifica.yaml with validation) | [M6](../features/m6-interactive-onboarding.md) | Needed by init and all commands |
| T2 | `[ ]` | Build Pacifica REST SDK client (auth, markets, orders, positions, account) | [M1](../features/m1-market-scanner-order-entry.md) | Core dependency |
| T3 | `[ ]` | Build Pacifica WebSocket client with auto-reconnection | [M1](../features/m1-market-scanner-order-entry.md) | Needed for live scan |
| T27 | `[ ]` | Implement `pacifica init` wizard with @inquirer/prompts | [M6](../features/m6-interactive-onboarding.md) | First thing judges see |
| T28 | `[ ]` | Implement connection verification step (REST + WebSocket test) | [M6](../features/m6-interactive-onboarding.md) | End of init wizard |
| T4 | `[ ]` | Implement `pacifica scan` command with Ink live table | [M1](../features/m1-market-scanner-order-entry.md) | First visual wow |

---

## Backlog — Day 2

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T5 | `[ ]` | Implement `pacifica trade buy/sell` with validation and confirmation | [M1](../features/m1-market-scanner-order-entry.md) | |
| T6 | `[ ]` | Implement `pacifica orders` list and `pacifica orders cancel` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T7 | `[ ]` | Implement `pacifica positions` list and `pacifica positions close` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T8 | `[ ]` | Build MCP server with 10 core tools | [M1](../features/m1-market-scanner-order-entry.md) | The differentiator |
| T9 | `[ ]` | Build guardrail checker module | [M5](../features/m5-agent-guardrails.md) | |
| T10 | `[ ]` | Build daily spending tracker with midnight reset | [M5](../features/m5-agent-guardrails.md) | |
| T11 | `[ ]` | Build agent action logger | [M5](../features/m5-agent-guardrails.md) | |
| T12 | `[ ]` | Implement `pacifica agent status/stop/start/config/log` commands | [M5](../features/m5-agent-guardrails.md) | |
| T29 | `[ ]` | Build HeatmapBar Ink component | [M7](../features/m7-position-heatmap.md) | |
| T30 | `[ ]` | Build HeatmapView with risk summary | [M7](../features/m7-position-heatmap.md) | |
| T31 | `[ ]` | Implement `pacifica heatmap` commands | [M7](../features/m7-position-heatmap.md) | |
| T32 | `[ ]` | Add MCP tools: position_heatmap, risk_summary | [M7](../features/m7-position-heatmap.md) | |
| T33 | `[ ]` | Build journal logger module | [M8](../features/m8-pnl-journal.md) | |
| T34 | `[ ]` | Integrate journal logging into trading flows | [M8](../features/m8-pnl-journal.md) | |
| T35 | `[ ]` | Implement `pacifica journal` command | [M8](../features/m8-pnl-journal.md) | |

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
| — | — | — | — |

---

## Task States

| Symbol | Meaning | When to use |
|--------|---------|-------------|
| `[ ]` | Todo | Not started |
| `[~]` | In progress | Currently being worked on |
| `[x]` | Done | Completed and verified |
| `[-]` | Blocked | Waiting on something else |
| `[>]` | Deferred | Decided to push to later phase |
