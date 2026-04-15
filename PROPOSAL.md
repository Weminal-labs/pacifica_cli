<div align="center">

# Pacifica Intelligence
### Hackathon Project Proposal

**A command-line intelligence layer that learns from your trades,
watches the market 24/7, and tells you exactly when to act.**

Built on Pacifica testnet · TypeScript · Next.js · MCP

</div>

---

## One Line

> A CLI tool that learns from every trade you make — detects your winning patterns, monitors live market conditions, and signals the exact moment to act.

---

## The Problem

Crypto trading has a feedback loop problem.

You execute a trade. It wins or loses. You move on. Nothing records **why** it worked. Nothing tells you when the same setup comes back. Nothing watches the market when you're not looking.

Every trader is doing three jobs at once:

- Monitoring market conditions (funding rate, open interest, order flow)
- Analyzing their own trade history for repeating patterns
- Watching what top-reputation traders are doing in real time

These are not human-scale tasks. They require a system.

Most tools give you charts. Pacifica Intelligence gives you a system.

---

## The Solution

**Pacifica Intelligence CLI** — a developer-first tool that:

1. **Learns** from every trade you execute on Pacifica testnet
2. **Detects** statistically verified patterns in your trade history
3. **Monitors** live market conditions 24/7 via a background daemon
4. **Signals** the exact moment a winning setup fires again
5. **Shows** what top-reputation traders are currently holding
6. **Lets you act** — simulate, copy, or execute — in one command

Everything accessible from a terminal. Everything readable by an AI agent.

---

## What Was Built

### CLI — 20+ Commands

```bash
# Trading
pacifica trade buy ETH 500 --leverage 3
pacifica trade sell BTC 1000
pacifica simulate long ETH --size 500 --leverage 5

# Intelligence
pacifica intelligence start          # start local intelligence server
pacifica intelligence patterns       # see detected patterns from your trades
pacifica intelligence me             # your personal reputation + stats

# Alerts
pacifica alerts add --asset ETH --condition "funding < -0.05%"
pacifica alerts daemon start         # background monitor, fires on trigger
pacifica alerts daemon status

# Copy Trading
pacifica leaderboard                 # top traders by reputation + P&L
pacifica copy watch <address>        # mirror a trader's positions live
pacifica copy list                   # who you're currently watching

# Journal
pacifica journal                     # full trade history
pacifica journal export --format csv # export for tax / analysis

# Watch
pacifica watch                       # live market signals + positions
```

---

### Intelligence Layer

The local intelligence server runs at `localhost:4242` alongside the CLI.

| Endpoint | What it returns |
|----------|----------------|
| `/api/intelligence/feed` | Active patterns firing right now |
| `/api/intelligence/patterns` | All verified patterns from trade history |
| `/api/intelligence/patterns/:id` | Single pattern + full condition breakdown |
| `/api/intelligence/snapshot/:market` | Live market conditions for one asset |
| `/api/intelligence/reputation` | Trader reputation scores |
| `/api/intelligence/social/:asset` | Social sentiment + narrative tags |

**How pattern detection works:**

```
Trade executed
  → Recorded in ~/.pacifica/journal.json
    → Engine analyzes market conditions at time of trade
      → Groups trades by outcome (win / loss)
        → Finds conditions correlated with wins
          → Verifies with sample size threshold
            → Pattern saved: win rate, avg P&L, avg hold time
```

Every trade makes the system smarter. The intelligence compounds.

---

### Web Dashboard — 10 Pages

| Route | Purpose |
|-------|---------|
| `/` | Feed — active patterns, whale activity, high-rep signals |
| `/patterns` | Pattern library + live signal banner (60s auto-refresh) |
| `/patterns/[id]` | Pattern detail — condition match status vs live market |
| `/snapshot` | Market scanner — all markets, funding, signals at a glance |
| `/snapshot/[market]` | Single market deep-dive with pattern match |
| `/leaderboard` | Top traders by rep score + current positions |
| `/simulate` | Risk simulator — liquidation price, P&L scenarios |
| `/copy` | Copy trading interface — pick trader, view positions |
| `/watch` | Live signals + top trader positions, 30s refresh |
| `/reputation` | Reputation ledger — trader behavior over time |

**Data flow:**

```
localhost:4242 (your intelligence)
  → if offline → Pacifica testnet API (test-api.pacifica.fi)
    → if offline → empty state with CLI hint
```

No demo data. No fake numbers. Real data or honest empty state.

---

### MCP Server — 41 AI Tools

Every CLI feature is exposed as an MCP tool so AI agents can use Pacifica Intelligence directly from natural language.

```
pacifica_get_markets          pacifica_simulate_trade
pacifica_get_positions        pacifica_get_patterns
pacifica_get_leaderboard      pacifica_get_reputation
pacifica_copy_signals         pacifica_get_intelligence_feed
... 41 tools total
```

An AI agent can say: *"Check if ETH is in a negative funding setup, simulate a long at current price with $500 and 3x leverage, and tell me the liquidation price."* No terminal required.

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User Interface                     │
│  CLI (Commander.js) │ Web (Next.js) │ MCP (AI agent) │
└──────────┬──────────┴───────┬───────┴───────┬────────┘
           │                  │               │
           ▼                  ▼               ▼
┌─────────────────────────────────────────────────────┐
│              Intelligence API (Express)              │
│              localhost:4242                          │
│  Pattern Engine │ Reputation │ Snapshot │ Social     │
└──────────────────────────┬──────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌──────────────────┐             ┌──────────────────────┐
│  Local Storage   │             │  Pacifica Testnet    │
│  ~/.pacifica/    │             │  test-api.pacifica.fi│
│  journal.json    │             │  Leaderboard, Markets│
│  intelligence.json│            │  Positions (public)  │
│  config.json     │             └──────────────────────┘
└──────────────────┘
```

**Stack:**

| Layer | Technology |
|-------|-----------|
| CLI | Node.js, Commander.js, TypeScript |
| Intelligence API | Express, TypeScript |
| Web | Next.js 14 App Router, Tailwind CSS |
| MCP Server | Model Context Protocol SDK |
| Build | tsup, pnpm workspaces |
| Data | Pacifica testnet REST API |

---

## The Trader Journey

```
1. Install
   $ npm install -g pacifica-cli

2. Configure
   $ pacifica config set rpc-url https://test-api.pacifica.fi

3. Start trading
   $ pacifica trade buy ETH 500 --leverage 3

4. Start intelligence
   $ pacifica intelligence start

5. See what works
   $ pacifica intelligence patterns
   → "Negative Funding + Rising OI" — 72.3% win rate, 34 trades

6. Set an alert
   $ pacifica alerts add --asset ETH --condition "funding < -0.05%"
   $ pacifica alerts daemon start

7. Alert fires at 3am
   ⚡ TRIGGERED: ETH funding < -0.05% (current: -0.071%)
   → Run: pacifica simulate long ETH 500

8. Simulate before risking
   $ pacifica simulate long ETH 500 --leverage 3
   → Liquidation: $1,342 │ +10% scenario: +$150 │ -10%: -$150

9. Execute with confidence
   $ pacifica trade buy ETH 500 --leverage 3

10. Web dashboard confirms
    → LIVE badge on pattern card
    → Condition match: funding ✓  buy pressure ✓
```

---

## Key Design Decisions

**CLI-first, not dashboard-first.**
Traders who care about edge live in the terminal. The web is a visualization layer, not the primary interface.

**Local intelligence, not cloud.**
Your trade patterns are private. The intelligence engine runs locally. Nothing is sent to a server.

**Real data or nothing.**
Every fallback shows an honest empty state with a CLI hint. No fabricated activity, no demo numbers.

**Agent-readable by design.**
Every output has a `--json` flag. The MCP server exposes every feature. AI agents can use the full system without any human in the loop.

**Reputation over profit.**
The leaderboard ranks by consistency and risk-adjusted performance — not just biggest P&L. A trader who wins 80% of 50 trades ranks above one who won one big bet.

---

## What Makes This Different

| | Pacifica Intelligence | Typical trading tool |
|--|----------------------|---------------------|
| Learns from YOUR trades | ✓ | ✗ |
| Runs locally, data stays private | ✓ | ✗ |
| Background daemon with real alerts | ✓ | ✗ |
| Copy trading with live position diff | ✓ | Partial |
| AI agent accessible via MCP | ✓ | ✗ |
| CLI-first workflow | ✓ | ✗ |
| Real data, no demo fallback | ✓ | ✗ |
| Intelligence compounds over time | ✓ | ✗ |

---

## Built During This Hackathon

| Module | What was built |
|--------|---------------|
| M10 — Intelligence Layer | Pattern detection engine, reputation scoring, social signals via Elfa API |
| M11 — Web Dashboard | 10-page Next.js dashboard, PatternCard overhaul, live signal banner, market scanner |
| M12 — Wave 2 CLI | Alerts daemon, copy trading, journal CSV export, risk simulator |
| MCP Server | 41 tools exposing every feature to AI agents |
| Market Scanner | `/snapshot` all-markets view with funding + pattern signal overlay |
| Hero UI | Dither-to-color CSS mask-image reveal effect (ported from open source) |

---

## File Structure

```
pacifica_cli/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── trade.ts          # buy / sell / positions
│   │   │   ├── intelligence.ts   # patterns / me / start
│   │   │   ├── alerts.ts         # add / check / daemon
│   │   │   ├── copy.ts           # watch / list
│   │   │   ├── simulate.ts       # long / short risk sim
│   │   │   ├── leaderboard.ts    # top traders
│   │   │   ├── watch.ts          # live market monitor
│   │   │   └── journal.ts        # history / export
│   │   └── index.ts              # CLI entrypoint
│   ├── core/
│   │   ├── intelligence/
│   │   │   ├── engine.ts         # pattern detection
│   │   │   ├── reputation.ts     # rep scoring
│   │   │   ├── social.ts         # Elfa social API
│   │   │   ├── store.ts          # read/write intelligence.json
│   │   │   └── schema.ts         # data types
│   │   ├── sdk/
│   │   │   ├── client.ts         # Pacifica testnet client
│   │   │   └── signer.ts         # transaction signing
│   │   └── config/
│   │       └── loader.ts         # ~/.pacifica/config.json
│   ├── intelligence-api/
│   │   └── server.ts             # Express API at localhost:4242
│   └── mcp/
│       └── server.ts             # 41 MCP tools
├── web/
│   ├── app/
│   │   ├── page.tsx              # Feed
│   │   ├── patterns/
│   │   │   ├── page.tsx          # Pattern library
│   │   │   └── [id]/page.tsx     # Pattern detail
│   │   ├── snapshot/
│   │   │   ├── page.tsx          # Market scanner
│   │   │   └── [market]/page.tsx # Market deep-dive
│   │   ├── leaderboard/page.tsx
│   │   ├── simulate/page.tsx
│   │   ├── copy/page.tsx
│   │   ├── watch/page.tsx
│   │   └── reputation/page.tsx
│   ├── components/
│   │   ├── ui/PatternCard.tsx    # Interactive pattern card
│   │   └── patterns/
│   │       └── LiveSignalBanner.tsx
│   └── public/
│       ├── hero.png              # Color landscape (3228×1632)
│       └── hero-dither.png       # B&W halftone (1071×541)
├── context/                      # Project knowledge base
├── plans/                        # Implementation plans
├── README.md
├── PROPOSAL.md                   # ← this file
└── DEMO_GUIDE.md
```

---

## Quick Start

```bash
# Clone
git clone https://github.com/your-org/pacifica_cli
cd pacifica_cli

# Install
pnpm install

# Build CLI
pnpm build

# Configure
pacifica config set rpc-url https://test-api.pacifica.fi

# Start intelligence server
pacifica intelligence start

# Open web dashboard
cd web && pnpm dev
# → http://localhost:3000
```

---

## One More Thing

The hero on the web dashboard.

Default state: black and white. Halftone dithered landscape — mountains, cacti, open sky.

Move your mouse over it: color reveals underneath. Warm amber. Golden hour. Alive.

It is a metaphor.

The market is always showing you something. You just have to pay attention to see it.

---

<div align="center">

*Built on Pacifica testnet.*
*Every trade teaches the system. The intelligence compounds.*

</div>
