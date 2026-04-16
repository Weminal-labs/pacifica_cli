<div align="center">

# Pacifica CLI

**Pattern-programmable trading terminal for [Pacifica DEX](https://test-app.pacifica.fi)**

[![Live site](https://img.shields.io/badge/web-pacifica--intelligence.pages.dev-orange?style=flat-square)](https://pacifica-intelligence.pages.dev)
[![MCP Guide](https://img.shields.io/badge/MCP-setup_guide-purple?style=flat-square)](https://pacifica-intelligence.pages.dev/mcp)
[![Slides](https://img.shields.io/badge/slides-presentation-red?style=flat-square)](https://amethyst-owl-727.faces.site/onz0fhx37iqd)
[![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](package.json)
[![License](https://img.shields.io/badge/license-MIT-orange?style=flat-square)](LICENSE)
[![Network](https://img.shields.io/badge/network-Solana-9945FF?style=flat-square&logo=solana)](https://solana.com)

*Code your trading instinct as YAML. Test it against history. Let Claude run it.*

**Live Demo:** [pacifica-intelligence.pages.dev](https://pacifica-intelligence.pages.dev) &middot; **MCP Guide:** [/mcp](https://pacifica-intelligence.pages.dev/mcp) &middot; **Patterns:** [/patterns](https://pacifica-intelligence.pages.dev/patterns) &middot; **Slides:** [view presentation](https://amethyst-owl-727.faces.site/onz0fhx37iqd)

</div>

<div align="center">

![Pacifica CLI demo](web/public/demo.gif)

</div>

---

## What is this?

A CLI + MCP server for the Pacifica perpetuals DEX. You write trading rules as YAML patterns, backtest them against real candles, and Claude executes them via MCP when conditions match.

```
 You write YAML          Claude backtests           Claude runs it
 ┌──────────────┐       ┌──────────────────┐       ┌────────────────┐
 │ when:        │       │ 30d · 8 trades   │       │ "BTC funding   │
 │   funding <  │  ──>  │ 62% win rate     │  ──>  │  is -0.04% —   │
 │    -0.03%    │       │ +$142 total P&L  │       │  pattern says   │
 │ entry:       │       │ max DD: $38      │       │  go long."      │
 │   side: long │       └──────────────────┘       └────────────────┘
 └──────────────┘
```

---

## Quick Start

### 1. Activate your wallet on Pacifica testnet

1. Go to **[test-app.pacifica.fi](https://test-app.pacifica.fi)**
2. Connect your Solana wallet (Phantom, Backpack, etc.)
3. Enter access code: **`Pacifica`**
4. Use the **Faucet** to get test USDC

### 2. Install and configure

**From source** (recommended for hackathon judges):

```bash
git clone https://github.com/Weminal-labs/pacifica_cli.git
cd pacifica_cli
pnpm install
pnpm build
npm link    # makes `pacifica` command available globally
```

**Via npm** (once published):

```bash
npm install -g pacifica-cli
# or
npx pacifica-cli init --testnet
```

**Initialize your account:**

```bash
pacifica init --testnet
```

The wizard asks for your private key, sets safe defaults, and auto-seeds 9 example patterns into `~/.pacifica/patterns/`.

### 3. Your first pattern (under 2 minutes)

```bash
# Option A: Interactive wizard
pacifica patterns new

# Option B: Copy an example and edit it
pacifica patterns copy funding-carry-btc
nano ~/.pacifica/patterns/funding-carry-btc.yaml

# Option C: Let Claude write it
# (requires MCP setup below)
# "Write me a pattern that longs BTC when funding is deeply negative"
```

### 4. Test it

```bash
pacifica backtest funding-carry-btc --days 30
```

### 5. Run it live

```bash
# Via CLI
pacifica simulate long BTC 500 --leverage 3
pacifica trade buy BTC 0.01 --leverage 3

# Via Claude (with MCP connected)
# "Run my funding-carry-btc pattern against the current market"
```

---

## Connect Claude to Pacifica (MCP Setup)

The MCP server gives Claude 23 tools to read markets, place trades, manage patterns, and run backtests — all with built-in guardrails.

### Option A: Claude Desktop App (local — recommended)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["tsx", "/path/to/pacifica_cli/src/mcp/server.ts"]
    }
  }
}
```

> Replace `/path/to/pacifica_cli` with your actual clone path.

Restart Claude Desktop. You'll see the hammer icon — click it to see all 23 Pacifica tools.

### Option B: claude.ai (web) via HTTP/SSE Server

claude.ai doesn't support local MCP servers. You need to run the HTTP server and expose it via a tunnel:

**Step 1 — Start the HTTP MCP server:**

```bash
npx tsx src/mcp/server-http.ts
# Server starts at http://localhost:4243
```

**Step 2 — Expose via tunnel (pick one):**

```bash
# ngrok
ngrok http 4243

# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:4243

# localtunnel
npx localtunnel --port 4243
```

**Step 3 — Add to Claude Desktop config as remote MCP:**

```json
{
  "mcpServers": {
    "pacifica": {
      "url": "https://your-tunnel-url.ngrok.app/sse"
    }
  }
}
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sse` | GET | SSE stream — MCP clients connect here |
| `/messages` | POST | JSON-RPC messages for active sessions |
| `/health` | GET | Health check |

### Option C: Claude Code (terminal)

```bash
# Claude Code auto-detects the MCP server from this repo.
cd pacifica_cli
claude
```

### Option D: Cursor / Windsurf / Any MCP Client

Add to your MCP config (`.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["tsx", "/path/to/pacifica_cli/src/mcp/server.ts"]
    }
  }
}
```

### Option E: npm (when published)

Once `pacifica-cli` is on npm, no clone needed:

```json
{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["-y", "pacifica-cli", "pacifica-mcp"]
    }
  }
}
```

### What you can say to Claude after connecting

| You say | Claude does |
|---------|-------------|
| "What are my positions?" | Calls `pacifica_get_positions` |
| "Show funding rates" | Calls `pacifica_funding_rates` |
| "Write a pattern that shorts ETH when momentum is bearish" | Calls `pacifica_save_pattern` |
| "Backtest my funding-carry-btc pattern" | Calls `pacifica_backtest_pattern` |
| "Run my pattern against the current BTC market" | Calls `pacifica_run_pattern` |
| "Buy 0.01 BTC with 3x leverage" | Calls `pacifica_place_order` |
| "Close my SOL position" | Calls `pacifica_close_position` |
| "How is my pattern performing?" | Calls `pacifica_journal_pattern_stats` |

---

## MCP Tools (23)

### Read (8)

| Tool | What it does |
|------|-------------|
| `pacifica_get_markets` | All markets with price, volume, OI, funding |
| `pacifica_get_ticker` | Single market ticker |
| `pacifica_get_orderbook` | Bids/asks with depth |
| `pacifica_get_positions` | Open positions with P&L and liquidation |
| `pacifica_get_account` | Account balance, equity, margin |
| `pacifica_get_orders` | Open orders |
| `pacifica_agent_status` | Guardrail config and daily spending |
| `pacifica_agent_log` | Agent action audit trail |

### Analytics (2)

| Tool | What it does |
|------|-------------|
| `pacifica_trade_journal` | Trade history with symbol filter |
| `pacifica_pnl_summary` | Win rate, total P&L, fees, stats |

### Funding (2)

| Tool | What it does |
|------|-------------|
| `pacifica_funding_rates` | Current rates for all markets with APR |
| `pacifica_funding_history` | Historical rates for one market |

### Write (4)

| Tool | What it does |
|------|-------------|
| `pacifica_place_order` | Market or limit order with TP/SL, leverage |
| `pacifica_cancel_order` | Cancel an open order |
| `pacifica_close_position` | Close via reduce-only market order |
| `pacifica_set_tpsl` | Set/update take-profit and stop-loss |

### Pattern (7)

| Tool | What it does |
|------|-------------|
| `pacifica_list_patterns` | List all user-authored patterns |
| `pacifica_get_pattern` | Get one pattern by name |
| `pacifica_run_pattern` | Evaluate pattern conditions against live market |
| `pacifica_simulate_pattern` | Simulate entry: liquidation, P&L, funding cost |
| `pacifica_backtest_pattern` | Replay against 30 days of hourly candles |
| `pacifica_save_pattern` | Save a pattern to ~/.pacifica/patterns/ |
| `pacifica_journal_pattern_stats` | Per-pattern win-rate and P&L stats |

> All write tools pass through the guardrail system.

---

## CLI Commands

### Markets & Data

```bash
pacifica scan                              # live market overview
pacifica funding                           # funding rates sorted by APR
pacifica simulate long BTC 1000 --lev 5    # pre-trade risk calculator
```

### Trading

```bash
pacifica trade buy  <symbol> <size>                    # market long
pacifica trade sell <symbol> <size>                    # market short
pacifica trade buy  <symbol> <size> --lev 10 --tp 4200 --sl 3600
```

### Positions & Orders

```bash
pacifica positions                         # open positions with P&L
pacifica positions close <symbol>          # close at market
pacifica orders                            # list open orders
pacifica orders cancel <id>                # cancel one
```

### Patterns

```bash
pacifica patterns list                     # your pattern library
pacifica patterns show <name>              # inspect one pattern
pacifica patterns new                      # interactive creation wizard
pacifica patterns copy <example>           # copy example to your library
pacifica patterns validate <file>          # check a YAML file
pacifica backtest <name> --days 30         # replay against history
```

### Journal

```bash
pacifica journal                           # recent trades
pacifica journal --weekly                  # daily P&L for 7 days
pacifica journal --pattern <name>          # filter by pattern
pacifica journal export --format csv       # export to file
```

### Agent

```bash
pacifica agent status                      # guardrails & budget
pacifica agent config                      # edit limits
pacifica agent log                         # audit trail
```

---

## Pattern Format

Patterns are YAML files in `~/.pacifica/patterns/`. Here's the schema:

```yaml
name: funding-carry-btc            # kebab-case, matches filename
description: Long BTC when funding is deeply negative
tags: [funding, carry, btc]
market: BTC-USDC-PERP              # or "ANY" for market-agnostic

# Optional: compose conditions from other patterns
include:
  - price-breakout-btc             # inherits that pattern's when: conditions

when:                              # ALL must be true (AND)
  - axis: funding_rate
    op: lt
    value: -0.0003
    label: "deeply negative funding"

entry:
  side: long
  size_usd: 500
  leverage: 3
  stop_loss_pct: 2.0               # optional
  take_profit_pct: 1.5             # optional

exit:                              # ANY true triggers exit (OR)
  - axis: funding_rate
    op: gt
    value: 0
    label: "funding flipped positive"
```

### Available condition axes

| Axis | Source | Backtestable? |
|------|--------|--------------|
| `mark_price` | Current mark price | Yes |
| `volume_24h_usd` | 24h volume in USD | Yes |
| `funding_rate` | Current funding rate | No (live only) |
| `oi_change_4h_pct` | OI change over 4h | No |
| `buy_pressure` | Buy/sell ratio | No |
| `momentum_value` | Momentum signal strength | No |
| `large_orders_count` | Whale order count | No |
| `open_interest_usd` | Total open interest | No |

> Non-backtestable axes are treated as false during backtest. The CLI and MCP tool clearly surface which axes were skipped.

### Example Patterns (9 included)

| Pattern | Strategy |
|---------|----------|
| `funding-carry-btc` | Long BTC when funding deeply negative |
| `trend-continuation-eth` | Long ETH on momentum + whale activity |
| `price-breakout-btc` | Long BTC on price breakout (fully backtestable) |
| `mean-reversion-eth` | Short ETH on overbought momentum |
| `range-bound-sol` | Long SOL at range floor with volume confirmation |
| `volume-spike-entry` | Long any asset on volume spike |
| `funding-flip-short` | Short BTC when funding spikes positive |
| `whale-accumulation` | Long when whales accumulating |
| `conservative-btc-long` | BTC breakout + funding gate (uses `include:`) |

---

## Agent Guardrails

Every MCP write action is checked:

```
Agent call
   |
   +- 1. Agent enabled?
   +- 2. Action in blocked list?        -> reject
   +- 3. Action in allowed list?        -> reject if not
   +- 4. Order size <= max_order_size?   -> reject if over
   +- 5. Leverage <= max_leverage?       -> reject if over
   +- 6. Daily spend + order <= budget?  -> reject if over
```

Configure in `~/.pacifica.yaml`:

```yaml
agent:
  enabled: true
  daily_spending_limit: 5000
  max_order_size: 2000
  max_leverage: 5
```

---

## Web Dashboard

The web app at `web/` provides a browser interface for pattern exploration and trade simulation.

```bash
cd web && pnpm dev
```

| Route | Page |
|-------|------|
| `/` | Landing page with pattern showcase |
| `/patterns` | Pattern library with stats |
| `/patterns/[id]` | Pattern detail with conditions |
| `/simulate` | Pre-trade risk calculator with live charts |
| `/backtest/[name]` | Backtest results with equity curve |

---

## Architecture

```
                     ┌─────────────────┐
                     │   You / Claude   │
                     └────────┬────────┘
                              |
              ┌───────────────┼───────────────┐
              |               |               |
     ┌────────v──────┐ ┌─────v─────┐ ┌───────v──────┐
     │  CLI (11 cmd) │ │ MCP (23)  │ │  Web (5 pg)  │
     │  Commander.js │ │  stdio    │ │  Next.js 14  │
     └────────┬──────┘ └─────┬─────┘ └───────┬──────┘
              |               |               |
     ┌────────v───────────────v───────────────v──────┐
     │                  Core Layer                    │
     │  patterns/ · sdk/ · journal/ · agent/ · arb/  │
     └──────────────────────┬────────────────────────┘
                            |
     ┌──────────────────────v────────────────────────┐
     │              Pacifica DEX API                  │
     │   REST (Ed25519 signed) + WebSocket            │
     │   testnet: test-api.pacifica.fi                │
     └────────────────────────────────────────────────┘
```

---

## Built for The Synthesis Hackathon

| Track | Tech |
|-------|------|
| Pacifica DEX | Perpetuals, Ed25519 signing, WebSocket |
| Claude MCP | 23 tools, pattern primitive, guardrails |
| Solana | Keypair auth, base58 |

<div align="center">

**[Pacifica DEX](https://test-app.pacifica.fi)** &middot; **[Report an Issue](../../issues)** &middot; **[The Synthesis](https://synthesis.so)**

</div>
