---
name: pacifica-shared
version: 2.0.0
description: Shared context, CLI + MCP surface, and safety rules for all Pacifica skills
category: shared
requires:
  commands: []
  auth_required: false
  dangerous: false
---

# Pacifica Shared Context

## Purpose
Foundation every other skill reads first. Defines the real command surface, the MCP tool surface, the safety invariants, and the terminology all other skills depend on.

## Thesis
**Turn your trading instinct into code.** Pacifica is a memory + execution layer for perp DEX traders who already live in Claude. You author *patterns* (YAML at `~/.pacifica/patterns/`) that encode your rules. Claude reads, runs, and simulates them via MCP. You compose a library over time.

## CLI Command Surface (v1)

```
pacifica init                       # 5-step onboarding wizard
pacifica scan                       # Market scanner with --gainers/--losers/--min-volume
pacifica trade buy|sell <sym> <size> [--leverage --tp --sl --validate --json]
pacifica orders [list|cancel|cancel-all]
pacifica positions [list|close <sym>]
pacifica funding                    # Funding rates snapshot
pacifica simulate <side> <sym> <size> [--leverage --entry --json]
pacifica journal                    # P&L + trade log
pacifica agent [status|start|stop|config|log]

# Pattern primitives (new in v2):
pacifica patterns list              # list ~/.pacifica/patterns/*.yaml
pacifica patterns show <name>
pacifica patterns validate <file>
```

All commands that emit structured data accept `--json`. Agents should always pass it.

## MCP Tool Surface (v1)

21 tools, grouped by intent:

| Group | Tools |
|---|---|
| Markets (read) | `pacifica_get_markets`, `pacifica_get_ticker`, `pacifica_get_orderbook` |
| Account (read) | `pacifica_get_positions`, `pacifica_get_account`, `pacifica_get_orders` |
| Agent (read) | `pacifica_agent_status`, `pacifica_agent_log` |
| Analytics | `pacifica_trade_journal`, `pacifica_pnl_summary` |
| Funding | `pacifica_funding_rates`, `pacifica_funding_history` |
| Write | `pacifica_place_order`, `pacifica_cancel_order`, `pacifica_close_position`, `pacifica_set_tpsl` |
| **Patterns** | `pacifica_list_patterns`, `pacifica_get_pattern`, `pacifica_run_pattern`, `pacifica_simulate_pattern`, `pacifica_save_pattern` |

## Pattern Artifact

A pattern is a YAML file at `~/.pacifica/patterns/<name>.yaml`:

```yaml
name: funding-carry-btc
description: Long BTC when funding is deeply negative.
tags: [funding, carry]
market: BTC-USDC-PERP
when:
  - { axis: funding_rate, op: lt, value: -0.0003 }
  - { axis: oi_change_4h_pct, op: gt, value: 5 }
entry:
  side: long
  size_usd: 500
  leverage: 3
  stop_loss_pct: 2.0
  take_profit_pct: 1.5
exit:
  - { axis: funding_rate, op: gt, value: 0 }
```

Condition axes: `funding_rate`, `oi_change_4h_pct`, `buy_pressure`, `momentum_value`, `large_orders_count`, `open_interest_usd`, `volume_24h_usd`, `mark_price`.
Ops: `lt`, `lte`, `gt`, `gte`, `eq`. `when:` is AND. `exit:` is OR.

## Symbol Format

`<BASE>-USDC-PERP` (e.g. `ETH-USDC-PERP`). The CLI normalises shorthand (`ETH` → `ETH-USDC-PERP`).

## Safety Invariants

1. **Simulate before live.** Run `pacifica simulate` or `pacifica_simulate_pattern` before any real capital.
2. **Validate orders.** Use `--validate` or let guardrails fire in MCP.
3. **Check positions before entering.** Never double a position you forgot about.
4. **Never skip guardrails.** Daily spending cap, max leverage, max single-position size are enforced at the MCP layer — don't design around them.
5. **Journal every trade.**

## Funding Sign Convention

- Positive → longs pay shorts.
- Negative → shorts pay longs.
- APR ≈ `rate × 3 × 365`.

## Notes

- Config: `~/.pacifica/config.json`. Run `pacifica init` to set up.
- Patterns: `~/.pacifica/patterns/*.yaml`. Copy from `examples/patterns/` to start.
- All timestamps are ISO 8601 UTC.
