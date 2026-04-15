---
name: pacifica-shared
version: 1.0.0
description: Shared context, conventions, and safety rules that all Pacifica CLI skills depend on
category: shared
requires:
  commands: []
  auth_required: false
  dangerous: false
---

# Pacifica Shared Context

## Purpose
This file provides the common foundation every other skill reads at runtime. It defines
the CLI command surface, output format contract, safety invariants, and terminology used
across all skills. Every skill that interacts with live markets must load this file first.

## CLI Overview

The Pacifica CLI binary is `pacifica`. All commands follow this pattern:

```
pacifica <command> [subcommand] [arguments] [--flags]
```

All commands that produce data suitable for agent parsing accept `--json`. Always pass
`--json` in agent-driven workflows to get structured output instead of ANSI-formatted
terminal output.

## Command Surface

| Command | Purpose |
|---|---|
| `pacifica scan` | Market scanner — spot opportunities |
| `pacifica trade buy <symbol> <size>` | Place a long/buy market or limit order |
| `pacifica trade sell <symbol> <size>` | Place a short/sell market or limit order |
| `pacifica positions` | List all open positions |
| `pacifica positions close <symbol>` | Close a position at market |
| `pacifica orders` | List open orders |
| `pacifica orders cancel <id>` | Cancel a specific order |
| `pacifica orders cancel-all [symbol]` | Cancel all open orders, optionally scoped to one market |
| `pacifica funding` | Show funding rates for all markets |
| `pacifica leaderboard` | Leaderboard with 1D/7D/30D/all-time P&L |
| `pacifica copy watch <address>` | Copy a trader's positions in real time |
| `pacifica copy list` | Show recently watched addresses |
| `pacifica simulate <side> <market> <size>` | Simulate a trade — liquidation level, P&L scenarios |
| `pacifica intelligence run` | Run the pattern engine against live markets |
| `pacifica intelligence patterns` | Display verified market patterns |
| `pacifica intelligence reputation` | Trader reputation scores |
| `pacifica intelligence me` | Your personal trading intelligence profile |
| `pacifica journal` | Trade history and P&L breakdown |
| `pacifica alerts list` | List saved price/funding alerts |
| `pacifica alerts add` | Add a new alert |
| `pacifica alerts check` | Check alerts against live data |
| `pacifica arb scan` | One-shot funding arb opportunity scan |
| `pacifica arb start` | Start the arb bot daemon |
| `pacifica arb stop` | Stop the arb bot |
| `pacifica arb status` | Live arb bot status |
| `pacifica arb list` | Position history for the arb bot |
| `pacifica watch` | Live price and position feed |

## Symbol Format

All perpetual market symbols use the format `<BASE>-USDC-PERP`, for example:
- `ETH-USDC-PERP`
- `BTC-USDC-PERP`
- `SOL-USDC-PERP`

The CLI accepts shorthand like `ETH` and normalises it automatically for most commands.

## Key Flags

| Flag | Applies to | Effect |
|---|---|---|
| `--json` | Most commands | Emit machine-readable JSON instead of formatted terminal output |
| `--limit <n>` | leaderboard, journal | Number of rows to return |
| `--filter <mode>` | leaderboard | rising, falling, or consistent |
| `--live` | leaderboard | Fetch each trader's current open positions |
| `--watch` | leaderboard | Refresh every 30 s with delta highlighting |
| `--multiplier <x>` | copy watch | Scale copied position size (0.001–1.0) |
| `--auto` | copy watch | Execute copies without confirmation prompts |
| `--leverage <n>` | trade, simulate | Leverage multiplier |
| `--tp <price>` | trade | Take-profit price |
| `--sl <price>` | trade | Stop-loss price |
| `--validate` | trade | Dry-run validation — no order is submitted |
| `--testnet` | global | Force testnet regardless of config |

## Safety Invariants

Every skill that places or copies live orders must observe these rules:

1. **Simulate before trading.** Run `pacifica simulate` before committing real capital.
2. **Check positions before entering.** Never add to a position you are unaware of.
3. **Respect --validate.** Use it for a dry-run confirmation before the live call.
4. **Journal every trade.** Run `pacifica journal` or write a note after execution.
5. **Halt on unexpected output.** If `--json` output cannot be parsed, stop and alert.
6. **Never skip the circuit breaker.** If a drawdown-circuit-breaker skill is running, do not bypass it.

## Reputation Score Interpretation

| Score range | Interpretation |
|---|---|
| 70–100 | High-quality trader — safe to consider copying |
| 50–69 | Average — monitor closely, use small multiplier |
| Below 50 | Poor track record — do not copy |

## Funding Rate Sign Convention

- **Positive rate** — longs pay shorts. Short sellers collect.
- **Negative rate** — shorts pay longs. Long holders collect.

APR is calculated as `rate * 3 * 365` (three 8-hour settlements per day).

## Notes

- Config is stored at `~/.pacifica/config.json`. Run `pacifica init` to set up credentials.
- Watch sessions (copy watch, leaderboard watch, alerts daemon) are foreground processes.
  Run them under tmux or in a dedicated terminal.
- All timestamps from the API are ISO 8601 UTC.
