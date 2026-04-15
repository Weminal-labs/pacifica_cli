# Pacifica CLI — Runtime Agent Context

> Load this file at the start of every session. It contains the minimum context
> required to operate the Pacifica CLI correctly and safely.

---

## What Pacifica CLI Is

`pacifica` is an agent-native trading terminal for Pacifica DEX, a Solana-based
perpetuals exchange. The CLI exposes order placement, position management,
funding rate analysis, on-chain intelligence, copy trading, and an arb bot.

Binary names:
- `pacifica`     — main CLI
- `pacifica-mcp` — MCP server (exposes tools over stdio for LLM runtimes)

Config lives at `~/.pacifica/config.json`. Initialise with `pacifica init`.

---

## Key Concepts

### Symbol Format
All market symbols follow the pattern `BASE-USDC-PERP`, e.g.:
- `SOL-USDC-PERP`, `ETH-USDC-PERP`, `BTC-USDC-PERP`

Many commands accept the short form (`SOL`, `ETH`) and normalise it internally.
Always use the full form in JSON output and when passing symbols programmatically.

### Sides
- `bid` = long = buy direction
- `ask` = short = sell direction

`trade buy` maps to `bid`; `trade sell` maps to `ask`.

### Funding Rates
Funding settles every 8 hours. The CLI shows rates as raw decimals (e.g. `0.0004`
= 0.04%/8h). APR is computed as `rate × 3 × 365`. Positive funding means longs
pay shorts; negative means shorts pay longs.

### Reputation Scores
Each trader has a `overall_rep_score` from 0–100 derived from win rate, trade
count, and per-condition accuracy. Scores ≥ 70 are high quality. The score is
used in copy trading and leaderboard filtering.

### Intelligence Patterns
The pattern engine analyses captured trade records to detect recurring market
conditions with statistically significant win rates. A "verified" pattern has
`verified: true` and a `sample_size` that meets the minimum threshold. Active
signals indicate a live market currently matches a verified pattern.

### Copy Trading
Copy watch polls a trader's public positions at a configurable interval and
surfaces opens/closes. With `--auto` it places matching market orders immediately.

### Arb Bot
Single-sided funding collection: enters a position on the side that earns
funding, holds until the configured exit policy triggers, then closes. Not
delta-neutral by default.

---

## Command Surface (Quick Reference)

| Command | Auth | Dangerous | Description |
|---|---|---|---|
| `init` | no | no | Interactive wallet + config setup |
| `scan` | yes | no | Market opportunity scan |
| `trade buy <sym> <size>` | yes | **yes** | Place long order |
| `trade sell <sym> <size>` | yes | **yes** | Place short order |
| `orders` | yes | no | List open orders |
| `orders cancel <id>` | yes | **yes** | Cancel a specific order |
| `orders cancel-all [sym]` | yes | **yes** | Cancel all orders |
| `positions` | yes | no | List open positions |
| `positions close <sym>` | yes | **yes** | Close position at market |
| `heatmap` | yes | no | Position risk heatmap |
| `journal` | yes | no | Trade history and P&L |
| `journal export` | yes | no | Export trades to CSV/JSON |
| `funding` | yes | no | Funding rates for all markets |
| `simulate <side> <sym> <size>` | yes | no | P&L and liquidation calculator |
| `alerts list` | no | no | List configured alerts |
| `alerts add` | no | no | Add price/funding alert |
| `alerts remove <id>` | no | no | Remove alert |
| `alerts check` | yes | no | Check alerts against live market |
| `alerts daemon start/stop/status` | no | no | Background alert monitor |
| `smart trailing <sym>` | yes | no | Set trailing stop on position |
| `smart list` | yes | no | List smart orders |
| `smart cancel <id>` | yes | no | Cancel smart order |
| `arb scan` | yes | no | Scan for arb opportunities |
| `arb start` | yes | **yes** | Start arb bot daemon |
| `arb stop` | no | no | Stop arb bot |
| `arb status` | yes | no | Arb bot P&L and positions |
| `arb list` | yes | no | List arb positions |
| `arb close <id>` | yes | **yes** | Manually close arb position |
| `arb config` | no | no | View/update arb configuration |
| `leaderboard` | yes | no | Testnet trader leaderboard |
| `intelligence patterns` | no | no | Verified market patterns |
| `intelligence reputation` | yes | no | Trader reputation scores |
| `intelligence run` | yes | no | Run pattern engine + live signals |
| `intelligence me` | yes | no | Personal trading intelligence |
| `intelligence serve` | no | no | Start Intelligence REST API |
| `watch` | yes | no | Fullscreen live signal monitor (TUI) |
| `copy watch <addr>` | yes | **yes** | Copy a trader's positions |
| `copy list` | no | no | Recently watched addresses |
| `agent status` | no | no | Agent guardrail dashboard |
| `agent start/stop` | no | no | Enable/disable agent trading |
| `agent config` | no | no | Edit guardrail limits |
| `agent log` | no | no | Agent action audit trail |

---

## JSON Output Envelope

Add `--json` to any command that supports it. Output is valid JSON on stdout.

Successful responses return the data directly (no wrapper envelope):
```json
[{ "symbol": "SOL-USDC-PERP", "fundingRate": 0.0004, ... }]
```

Error conditions set `process.exitCode = 1` and print to stderr. There is no
standardised error envelope; parse stderr or check exit code.

---

## Error Categories

| Category | Retryable | Typical Cause |
|---|---|---|
| `auth` | no | Missing config, bad private key, wallet mismatch |
| `rate_limit` | yes (backoff) | Too many requests to API |
| `network` | yes | RPC timeout, connection refused |
| `sdk` | sometimes | Malformed request, SDK validation |
| `onchain` | sometimes | Insufficient margin, position not found |
| `intelligence` | yes | Intelligence store empty, engine offline |
| `guardrail` | no | Agent spending limit, blocked action |
| `config` | no | Config file missing or invalid |
| `parse` | no | Invalid flag value or argument |
| `validation` | no | Symbol not found, size <= 0 |

---

## Autonomy Levels

| Level | What the Agent Can Do |
|---|---|
| `read-only` | scan, positions, orders, journal, funding, leaderboard, intelligence |
| `paper` | + simulate (no live orders; validate flag mentally modelled) |
| `supervised` | + trade with `--validate` first; human confirms before submitting |
| `autonomous` | + trade, close, cancel without per-trade confirmation |
| `full` | + arb start, copy watch --auto, all dangerous actions |

Always start at `read-only` or `supervised` for new sessions. Escalate only
with explicit user permission.

---

## Safety Rules

1. Always call `pacifica simulate` before placing a live leveraged trade.
2. Never submit `trade buy/sell` without first checking `pacifica positions` to
   avoid unintended position stacking.
3. `copy watch --auto` and `arb start` are foreground daemons. Do not call them
   in autonomous sessions without an explicit stop condition.
4. When `agent.require_confirmation_above` is set, the guardrail blocks trades
   above that USD threshold. Respect this even in autonomous mode.
5. Dangerous commands are: `trade buy`, `trade sell`, `positions close`,
   `orders cancel`, `orders cancel-all`, `arb start`, `copy watch --auto`,
   `arb close`.
6. Check `pacifica agent status --json` before every autonomous session to
   confirm the spending budget has not been exhausted.

---

## Intelligence Signal Workflow (Summary)

```
intelligence run          # detect patterns + scan live markets
  → signals[].asset       # e.g. "SOL-USDC-PERP"
  → signals[].direction   # "long" | "short"
  → signals[].pattern.win_rate
simulate <dir> <sym> <size> --json   # validate entry math
trade buy/sell <sym> <size>          # execute if signal + sim agree
```

---

## Copy Trading Workflow (Summary)

```
leaderboard --json        # find top traders
intelligence reputation --json --limit 20  # filter by rep score
copy watch <address> --multiplier 0.1      # shadow a trader
```
