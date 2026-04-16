# Project Overview

> Rewritten 2026-04-15 for the "lean-to-thesis" v2 refactor.

## The Thesis

**Turn your trading instinct into code. Composable AI patterns for perp DEX traders.**

Pacifica CLI is a **memory + execution layer** for perp-DEX traders who already live in Claude. Each trader encodes their own rules as *patterns* (YAML files at `~/.pacifica/patterns/`) and Claude reads, runs, simulates, and executes them via MCP.

It is not another AI trading platform. It is the layer that makes Claude a real trading seat.

## Ideal Customer (ICP)

Crypto degens 25–35, portfolio $10k–$100k, daily Claude/Cursor users who trade perp DEX (Hyperliquid, Pacifica, dYdX) and have their own market views but no tool to systemize them. They write their own strategies, not copy someone else's.

## Wedge

- **CLI-first + MCP-native.** No web app to dashboard-fy. No middleware holding keys. Claude is the interface.
- **Patterns as code.** Every trader's setup is a reusable YAML artifact — not a trapped-in-a-platform signal.
- **Composable.** Patterns + MCP tools let Claude combine rules on the fly.
- **Timing.** Pacifica just launched. Native tooling window is 3–6 months.

## The Three Deliverables

1. **CLI** — terminal surface for init, trade, positions, funding, simulate, and pattern management.
2. **MCP server** — the canonical Claude surface. 21 tools covering read, analytics, funding, write, and patterns.
3. **Pattern primitive** — YAML artifact + loader + matcher. The load-bearing piece of the whole thesis.

No web app in v1. No copy-trading. No autonomous bots. No social/reputation layer.

## Canonical Flow

The demo that validates the thesis:

1. Trader: *"Help me code a pattern that longs SOL when funding is negative and whales are buying."*
2. Claude drafts YAML → saves via `pacifica_save_pattern`.
3. Trader: *"Run it."* → Claude calls `pacifica_run_pattern`.
4. If matched → `pacifica_simulate_pattern` → `pacifica_place_order`.
5. Pattern file persists at `~/.pacifica/patterns/sol-whale-carry.yaml` — reusable forever.

## Differentiator

| Other tools | Pacifica CLI |
|---|---|
| Hosted AI trading platforms | Local — your keys, your patterns, your Claude |
| Copy-trading signals | Your own rules, encoded as YAML |
| Web dashboards | Terminal + MCP. Claude is the UI. |
| One-off bot scripts | Composable patterns, shared runtime |

## Success Metric for v1

A Pacifica trader can go from "I have a setup" → "pattern saved and backtested" → "pattern running live" in under 5 minutes, entirely through Claude + MCP.
