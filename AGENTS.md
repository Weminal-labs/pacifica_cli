# Pacifica CLI — Agent Integration Guide

This document covers everything an AI agent or automated system needs to
integrate with the Pacifica CLI for autonomous or semi-autonomous trading on
Pacifica DEX (Solana perpetuals).

---

## Table of Contents

1. Authentication and Configuration
2. Autonomy Levels and API Key Scopes
3. Full Command Reference with JSON Examples
4. Error Handling and Retry Strategies
5. Copy Trading Workflow
6. Intelligence Signals Workflow
7. Funding Arbitrage Workflow
8. Safety Checklist for Autonomous Sessions
9. MCP Server Integration
10. Rate Limits and Backoff

---

## 1. Authentication and Configuration

### Config File

All credentials live at `~/.pacifica/config.json`. The CLI uses Ed25519
wallet signatures — there is no separate API key. The `private_key` field
stores a Base58-encoded 64-byte Ed25519 secret key.

```json
{
  "network": "testnet",
  "private_key": "<base58-encoded-ed25519-secret-key>",
  "account": "<optional-main-wallet-pubkey-when-using-agent-subkey>",
  "builder_code": "<optional-builder-program-code>",
  "defaults": {
    "leverage": 5,
    "slippage": 1
  },
  "agent": {
    "enabled": true,
    "daily_spending_limit": 5000,
    "max_order_size": 2000,
    "max_leverage": 5,
    "allowed_actions": ["place_order", "close_position", "cancel_order", "set_tpsl", "arb_open", "arb_close", "arb_configure"],
    "blocked_actions": ["withdraw"],
    "require_confirmation_above": 1000
  }
}
```

Initialise interactively: `pacifica init`

### Agent Sub-keys

For autonomous operation, use a dedicated sub-key with limited permissions.
Set `private_key` to the sub-key and `account` to the main wallet public key.
The on-chain program validates that the sub-key is authorised for the account.

---

## 2. Autonomy Levels and Recommended Scopes

### Level 0: Read-Only

Purpose: market analysis, monitoring, intelligence gathering. No trading.

Allowed commands: `scan`, `positions`, `orders`, `journal`, `funding`,
`simulate`, `leaderboard`, `intelligence patterns`, `intelligence reputation`,
`intelligence run`, `intelligence me`, `alerts list`, `alerts check`,
`heatmap`, `agent status`, `arb status`, `arb list`, `copy list`

Config: set `agent.allowed_actions: []` and `agent.enabled: false`

### Level 1: Paper / Simulation

Purpose: validate strategies without live execution.

Same as Level 0. Use `simulate` to pre-compute P&L and liquidation levels.
No live orders are placed. Use this level for strategy development.

### Level 2: Supervised

Purpose: agent proposes; human confirms each trade.

- Agent calls `simulate` to compute entry math
- Agent displays the proposed trade and awaits confirmation
- Human confirms; agent executes `trade buy/sell`
- `require_confirmation_above` guardrail enforces human review on large orders

Config: `agent.require_confirmation_above: 500` (USD)

### Level 3: Autonomous

Purpose: agent executes trades within defined guardrails, no per-trade prompts.

Allowed: all Level 0 commands plus `trade buy`, `trade sell`, `positions close`,
`orders cancel`, `orders cancel-all`

Config:
```json
{
  "agent": {
    "enabled": true,
    "daily_spending_limit": 2000,
    "max_order_size": 500,
    "max_leverage": 5,
    "require_confirmation_above": 999999
  }
}
```

The agent must check `pacifica agent status --json` at session start and before
each trade to verify remaining daily budget.

### Level 4: Full Autonomy

Purpose: includes daemon-mode commands (arb bot, copy watch --auto).

Allowed: all Level 3 commands plus `arb start`, `arb close`, `copy watch --auto`

These are foreground processes. Launch in a managed subprocess. Implement a
hard stop condition (time limit, loss limit, or signal count).

---

## 3. Full Command Reference

All commands accept `--json` for machine-readable output unless noted otherwise.
The global `--testnet` flag overrides the network from config.

---

### `pacifica init`

Interactive wizard. Sets wallet, network, and default leverage.
Not suitable for automated execution — run once manually.

---

### `pacifica scan [--gainers] [--losers] [--min-volume <usd>]`

Scan all Pacifica markets for opportunities.

```bash
pacifica scan --json
pacifica scan --gainers --json
pacifica scan --min-volume 10000000 --json
```

Output: array of market objects with price, 24h change, volume, funding rate.

---

### `pacifica trade buy <symbol> <size> [options]`

Place a long (buy) order. **Dangerous — submits to chain.**

```bash
# Market order, 5x leverage, dry run
pacifica trade buy SOL-USDC-PERP 1 --leverage 5 --json

# Limit order
pacifica trade buy ETH-USDC-PERP 0.1 --type limit --price 3200 --leverage 3 --json

# With TP/SL
pacifica trade buy BTC-USDC-PERP 0.01 --leverage 5 --tp 105000 --sl 95000 --json
```

Options:
- `-l, --leverage <n>` — leverage multiplier (overrides config default)
- `-t, --type <market|limit>` — order type (default: market)
- `-p, --price <n>` — limit price (required for limit orders)
- `--tp <n>` — take-profit price
- `--sl <n>` — stop-loss price
- `--slippage <n>` — slippage percent (default: config value)

Note: the CLI shows an order summary and prompts for confirmation in interactive
mode. In agent sessions, the guardrail system controls execution. The `--json`
flag does not skip confirmation — use `agent.require_confirmation_above` and
`agent.enabled` to manage autonomous flow.

Output: `{ "orderId": 12345 }`

---

### `pacifica trade sell <symbol> <size> [options]`

Place a short (sell) order. **Dangerous — submits to chain.**

Same options as `trade buy`. Maps to `side: "ask"` internally.

```bash
pacifica trade sell ETH-USDC-PERP 0.1 --leverage 3 --json
```

---

### `pacifica orders`

List all open orders.

```bash
pacifica orders --json
```

Output: array of order objects with `orderId`, `symbol`, `side`, `orderType`,
`price`, `initialAmount`, `filledAmount`, `createdAt`.

---

### `pacifica orders cancel <orderId>`

Cancel a specific order by integer ID. **Dangerous.**

```bash
pacifica orders cancel 12345 --json
```

Output: `{ "cancelled": true, "orderId": 12345 }`

---

### `pacifica orders cancel-all [symbol]`

Cancel all open orders, optionally filtered to a symbol. **Dangerous.**
Prompts for confirmation unless `--json` is present (implies scripted use).

```bash
pacifica orders cancel-all --json
pacifica orders cancel-all SOL-USDC-PERP --json
```

Output: `{ "cancelled": true, "cancelledCount": 3, "symbol": null }`

---

### `pacifica positions`

List open positions with mark price and unrealized PnL.

```bash
pacifica positions --json
```

Output: array enriched with `markPrice`, `pnlUsd`, `pnlPercent` in addition
to `symbol`, `side`, `amount`, `entryPrice`, `liquidationPrice`, `margin`.

---

### `pacifica positions close <symbol>`

Close an open position at market price. **Dangerous.**
Prompts confirmation when margin > $1,000.

```bash
pacifica positions close SOL-USDC-PERP
```

No `--json` flag on this command — success outputs a plain-text confirmation.
Check exit code: 0 = success, 1 = failure.

---

### `pacifica heatmap [--compact]`

Display position risk as an ASCII bar chart.

```bash
pacifica heatmap --compact
```

No `--json` flag. Read-only; use `positions --json` for machine-readable data.

---

### `pacifica journal [options]`

View trade history and P&L.

```bash
pacifica journal --json
pacifica journal --weekly --json
pacifica journal --monthly --symbol SOL-USDC-PERP --json
pacifica journal --limit 50 --json
```

Options: `--all`, `--weekly`, `--monthly`, `--symbol <sym>`, `--limit <n>`

---

### `pacifica journal export [options]`

Export trade history to a file.

```bash
pacifica journal export --format csv --out /tmp/trades.csv --from 2025-01-01
pacifica journal export --format json --limit 200
```

Options: `--format <csv|json>`, `--out <path>`, `--from <YYYY-MM-DD>`,
`--to <YYYY-MM-DD>`, `--symbol <sym>`, `--limit <n>`

---

### `pacifica funding [--json]`

Show current and predicted funding rates for all markets, sorted by absolute APR.

```bash
pacifica funding --json
```

Output: array of `{ symbol, fundingRate, nextFundingRate, price }`.
`fundingRate` is a raw decimal (multiply by 100 for percent per 8h,
multiply by 3×365 for APR).

---

### `pacifica simulate <side> <market> <size> [options]`

Calculate liquidation price, P&L scenarios, and funding cost. No auth required
after initial market data fetch. Safe — never submits orders.

```bash
pacifica simulate long SOL-USDC-PERP 1000 --leverage 5 --json
pacifica simulate short ETH 500 --leverage 10 --entry 3200 --json
```

Options: `--leverage <n>` (default: 5), `--entry <price>`, `--json`

Output includes: `entry_price`, `liquidation_price`, `margin_usd`,
`funding_8h/24h/7d`, `scenarios` (P&L at ±5/10/20%), `signal_tip` (if an
intelligence signal matches this trade).

---

### `pacifica alerts list [--json]`

List all configured alerts.

```bash
pacifica alerts list --json
```

---

### `pacifica alerts add --symbol <sym> <condition> <value> [--note <text>]`

Add a price or funding alert. Exactly one condition flag required.

```bash
pacifica alerts add --symbol BTC --above 100000
pacifica alerts add --symbol ETH --below 2000 --note "dip buy level"
pacifica alerts add --symbol SOL --funding-above 0.0005
pacifica alerts add --symbol BTC --funding-below -0.0003
pacifica alerts add --symbol ETH --volume-spike 50000000
```

Conditions: `--above <price>`, `--below <price>`, `--funding-above <rate>`,
`--funding-below <rate>`, `--volume-spike <usd>`

---

### `pacifica alerts remove <id>`

Remove alert by ID prefix (first 8 characters is sufficient).

```bash
pacifica alerts remove a1b2c3d4
```

---

### `pacifica alerts check [--all] [--json]`

Check all alerts against live market data. Returns triggered and near-trigger
alerts by default; add `--all` to include dormant.

```bash
pacifica alerts check --json
pacifica alerts check --all --json
```

---

### `pacifica alerts daemon start/stop/status [--interval <s>]`

Background alert monitor. Polls every `<interval>` seconds (default: 30).
Rings terminal bell on trigger. Use shell backgrounding or tmux.

```bash
pacifica alerts daemon start --interval 60
pacifica alerts daemon status
pacifica alerts daemon stop
```

---

### `pacifica smart trailing <symbol> --distance <n>`

Set a trailing stop on an open position. Polls every 5 seconds. Foreground
process — keep running while the position is open.

```bash
pacifica smart trailing SOL-USDC-PERP --distance 2
```

Options: `-d, --distance <percent>` (required, 0.1–50)

---

### `pacifica smart list [--active] [--json]`

List smart orders (trailing stops).

```bash
pacifica smart list --json
pacifica smart list --active --json
```

---

### `pacifica smart cancel <id>`

Cancel a smart order by ID prefix.

```bash
pacifica smart cancel a1b2c3d4
```

---

### `pacifica arb scan [--min-apr <n>] [--json]`

Scan for funding rate arbitrage opportunities above the APR threshold.

```bash
pacifica arb scan --json
pacifica arb scan --min-apr 60 --json
```

Output: array of opportunities with `symbol`, `currentRate`, `annualizedApr`,
`side`, `volume24hUsd`, `score`, `divergenceBps`.

---

### `pacifica arb start [options]`

Start the funding rate arb bot. **Dangerous — places live orders.**
Foreground daemon. Ctrl+C or `arb stop` to halt.

```bash
pacifica arb start --size 500 --min-apr 50 --max-positions 3
```

Options: `--size <usd>`, `--min-apr <n>`, `--max-positions <n>`

---

### `pacifica arb stop`

Stop the arb bot by signalling its PID. Open positions remain active.

---

### `pacifica arb status [--json]`

Show arb bot P&L summary and active positions.

```bash
pacifica arb status --json
```

Output: `{ positions, lifetime, summary: { totalFundingCollectedUsd, totalFeesPaidUsd, totalNetPnlUsd, activePositions, positionsClosed, winRate } }`

---

### `pacifica arb list [--status <active|closed|error|all>] [--json]`

List arb positions with funding earned and net P&L.

```bash
pacifica arb list --json
pacifica arb list --status active --json
```

---

### `pacifica arb close <id>`

Manually close an arb position. **Dangerous.**

```bash
pacifica arb close arb-pos-001
```

---

### `pacifica arb config [options]`

View or update arb bot configuration.

```bash
pacifica arb config --show
pacifica arb config --min-apr 50 --size 1000 --max-positions 5
pacifica arb config --exit rate_inverted --enable
```

Options: `--show`, `--min-apr <n>`, `--size <usd>`, `--max-positions <n>`,
`--exit <settlement|rate_inverted|apr_below|pnl_target>`, `--enable`, `--disable`

---

### `pacifica leaderboard [options]`

Live Pacifica testnet leaderboard with multi-timeframe P&L breakdown.

```bash
pacifica leaderboard --json
pacifica leaderboard --limit 20 --json
pacifica leaderboard --live --json          # includes current open positions
pacifica leaderboard --filter rising --json
pacifica leaderboard --filter consistent --json
pacifica leaderboard --watch               # incompatible with --json
```

Options: `--limit <n>` (max 50), `--live`, `--json`, `--watch`,
`--filter <rising|falling|consistent>`

Filter definitions:
- `rising`: 1D P&L > 25% of 7D P&L and 1D P&L > 0
- `falling`: 1D P&L < 0
- `consistent`: 3 of 4 timeframes (1D, 7D, 30D, all-time) positive

Output: array with `rank`, `trader_id`, `overall_rep_score`, `overall_win_rate`,
`onchain.pnl_1d/7d/30d/pnl_all_time`.

---

### `pacifica intelligence patterns [--json]`

Display verified market patterns from the local intelligence store.

```bash
pacifica intelligence patterns --json
```

Output: array of pattern objects with `name`, `win_rate`, `sample_size`,
`avg_pnl_pct`, `verified`.

---

### `pacifica intelligence reputation [--json] [--limit <n>]`

Live trader leaderboard enriched with local intelligence scores.

```bash
pacifica intelligence reputation --json
pacifica intelligence reputation --limit 20 --json
```

---

### `pacifica intelligence run [--patterns] [--json]`

Run the pattern engine against captured trade records, then scan live markets
for active signals.

```bash
pacifica intelligence run --json
```

Output: `{ patterns: [...], signals: [{ asset, direction, fundingRate, pattern, fullMatch }] }`

---

### `pacifica intelligence me [--json]`

Personal trading intelligence profile: rep score, win rate, strongest
conditions, best markets, personal patterns.

```bash
pacifica intelligence me --json
```

---

### `pacifica intelligence serve [--port <n>]`

Start the Intelligence REST API server (default port 4242).
Exposes `/api/v1/patterns`, `/api/v1/signals`, `/api/v1/reputation`.

```bash
pacifica intelligence serve
pacifica intelligence serve --port 8080
```

---

### `pacifica watch`

Fullscreen Ink TUI: live signals, top funding rates, open positions, arb status.
Auto-refreshes every 30 seconds. Press `q` to quit, `r` to force refresh.
Not suitable for automation — use individual JSON commands instead.

---

### `pacifica copy watch <address> [options]`

Watch a trader's open positions and optionally copy them. **Dangerous with --auto.**
Foreground daemon; Ctrl+C to stop.

```bash
pacifica copy watch <solana-address> --multiplier 0.1 --interval 60
pacifica copy watch <solana-address> --auto --multiplier 0.05
```

Options: `--multiplier <x>` (default: 1), `--auto` (no confirmation),
`--interval <s>` (default: 60, minimum: 10)

---

### `pacifica copy list`

Show recently watched trader addresses with last-seen positions.

---

### `pacifica agent status [--json]`

Show agent guardrail configuration and today's spending.

```bash
pacifica agent status --json
```

Output: `{ enabled, daily_spending_limit, spent_today, spent_percent, remaining, max_order_size, max_leverage, require_confirmation_above, allowed_actions, blocked_actions, recent_actions }`

---

### `pacifica agent stop` / `pacifica agent start`

Kill switch and re-enable. `stop` disables immediately without prompting.
`start` requires confirmation.

---

### `pacifica agent config`

Interactive guardrail editor. Sets daily limit, max order, max leverage,
confirmation threshold. Not suitable for automation.

---

### `pacifica agent log [options]`

View action audit trail.

```bash
pacifica agent log --json
pacifica agent log --today --json
pacifica agent log --action place_order --symbol SOL-USDC-PERP --limit 50 --json
```

Options: `--today`, `--action <type>`, `--symbol <sym>`, `--limit <n>`

---

## 4. Error Handling and Retry Strategies

### Exit Codes
- `0` — success
- `1` — any error (auth, network, validation, onchain)

### Error Categories and Handling

| Category | Retryable | Retry Strategy |
|---|---|---|
| `auth` | no | Stop. Run `pacifica init`. Check key format. |
| `rate_limit` | yes | Exponential backoff: 1s, 2s, 4s, 8s, max 3 retries |
| `network` | yes | Linear retry: 3s × 3 attempts. Check RPC health. |
| `sdk` | sometimes | Inspect message. Input validation errors are not retryable. |
| `onchain` | sometimes | "Insufficient margin" is not retryable. "Timeout" is. |
| `intelligence` | yes | Store may be empty. Run `intelligence run` first. |
| `guardrail` | no | Stop. Check `agent status`. User must adjust limits. |
| `config` | no | Stop. Run `pacifica init`. |
| `parse` | no | Fix argument. Do not retry. |
| `validation` | no | Symbol not found or size ≤ 0. Do not retry. |

### Detecting Error Type

Parse stderr output. Common patterns:
- `"Invalid signature"` → auth
- `"ETIMEDOUT"` / `"ECONNREFUSED"` → network
- `"Insufficient margin"` → onchain/validation
- `"Daily spending limit"` / `"blocked action"` → guardrail
- `"Market ... not found"` → validation

### Safe Retry Pattern

```
attempt = 0
while attempt < max_retries:
    result = run_command()
    if success: break
    if not retryable(result.error): raise
    wait(backoff(attempt))
    attempt += 1
```

---

## 5. Copy Trading Workflow

```
Step 1: Find candidates
  pacifica leaderboard --limit 20 --json
  → sort by overall_rep_score DESC, filter score >= 70

Step 2: Validate with intelligence
  pacifica intelligence reputation --limit 20 --json
  → cross-reference trader_id, look for consistent performers

Step 3: Shadow before copying
  pacifica copy watch <address> --multiplier 0 --interval 60
  → observe opens/closes for several cycles without copying

Step 4: Start copying at reduced size
  pacifica copy watch <address> --multiplier 0.1 --interval 60

Step 5: Autonomous copy (Level 4 only)
  pacifica copy watch <address> --auto --multiplier 0.05
```

Risk controls:
- Never use `--multiplier > 1` without explicit risk acceptance
- Set `agent.max_order_size` to cap copied trade size
- Monitor with `pacifica positions --json` periodically
- Have a manual `positions close` ready as kill switch

---

## 6. Intelligence Signals Workflow

```
Step 1: Populate the intelligence store
  (Records are captured automatically when you trade)
  pacifica intelligence seed --count 200   # DEV ONLY

Step 2: Run the pattern engine
  pacifica intelligence run --json
  → patterns[].verified == true
  → patterns[].win_rate >= 0.60
  → patterns[].sample_size >= 10

Step 3: Check for active signals
  signals = intelligence_run_output.signals
  → filter signals where signal.pattern.win_rate >= 0.65

Step 4: Validate with simulate
  pacifica simulate <signal.direction> <signal.asset> <size_usd> \
    --leverage <n> --json
  → check liquidation_price is comfortable
  → check funding_7d direction matches trade direction benefit

Step 5: Execute
  pacifica trade buy/sell <signal.asset> <size> --leverage <n> --json
```

Discard signals where:
- `signal.fullMatch == false` and win rate < 0.70 (partial match, lower confidence)
- `signal.pattern.sample_size < 10` (too few observations)
- Simulate shows liquidation within 5% of entry

---

## 7. Funding Arbitrage Workflow

```
Step 1: Assess opportunities
  pacifica arb scan --json
  → filter annualizedApr >= 50
  → filter volume24hUsd >= 10_000_000
  → prefer higher divergenceBps (Pacifica rate diverges from spot CEX)

Step 2: Configure the bot
  pacifica arb config \
    --min-apr 50 \
    --size 500 \
    --max-positions 3 \
    --exit rate_inverted

Step 3: Start the bot
  pacifica arb start

Step 4: Monitor
  pacifica arb status --json   # periodic check
  pacifica arb list --json     # per-position detail

Step 5: Emergency stop
  pacifica arb stop            # stops bot, positions remain open
  pacifica arb list --status active --json
  pacifica arb close <id>      # close individually
```

---

## 8. Safety Checklist for Autonomous Sessions

Run this checklist at the start of every autonomous session:

```
[ ] pacifica agent status --json
    → enabled == true
    → remaining >= planned_trade_size_usd

[ ] pacifica positions --json
    → understand existing exposure before entering new trades

[ ] pacifica orders --json
    → no stale orders that could interfere

[ ] pacifica arb status --json (if arb is running)
    → no position in error state

[ ] pacifica funding --json
    → verify funding direction aligns with planned trades

[ ] Network health check
    → pacifica scan --json (simple market data fetch as connectivity test)
```

After each trade:
```
[ ] Verify order appears in pacifica orders --json or filled in journal
[ ] Check pacifica agent status --json for updated spend figure
[ ] If using intelligence: log which signal triggered the trade
```

Session end:
```
[ ] pacifica agent log --today --json → record the session
[ ] Confirm no unintended positions remain in pacifica positions --json
```

---

## 9. MCP Server Integration

The `pacifica-mcp` binary exposes all CLI commands as MCP tools over stdio,
compatible with any MCP-aware LLM runtime (Claude Desktop, custom agents).

### Starting the Server

```bash
pacifica-mcp
```

The server reads from stdin and writes to stdout using the MCP protocol.
It uses the same `~/.pacifica/config.json` as the CLI.

### Claude Desktop Configuration

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pacifica": {
      "command": "pacifica-mcp",
      "args": []
    }
  }
}
```

### Tool Naming Convention

MCP tool names follow the pattern `pacifica_<command>_<subcommand>`, e.g.:
- `pacifica_trade_buy`
- `pacifica_intelligence_run`
- `pacifica_arb_scan`

All tools accept JSON input matching the CLI flag structure and return JSON output.

### Dangerous-Action Gate

Commands marked dangerous require the `confirmed: true` field in the MCP tool
input, or the guardrail system will reject them. This maps to the same
`agent.require_confirmation_above` logic used by the CLI.

---

## 10. Rate Limits and Backoff

The Pacifica API does not publish hard rate limits, but practical guidelines:

| Operation | Recommended Max Frequency |
|---|---|
| Market data (scan, funding) | 1 request per 5 seconds |
| Position/order reads | 1 request per 10 seconds |
| Trade execution | 1 request per 2 seconds |
| Leaderboard | 1 request per 30 seconds |
| Intelligence run | 1 request per 60 seconds |

On `429 Too Many Requests` or connection errors:
1. Stop all requests immediately
2. Wait 30 seconds
3. Resume with 2× normal interval
4. Restore normal interval after 5 successful requests

For copy watch and arb bot, the default poll intervals (60s and 30s respectively)
are already conservative. Do not reduce them below 10s.

The intelligence API server (`intelligence serve`) runs locally and has no
external rate limits.
