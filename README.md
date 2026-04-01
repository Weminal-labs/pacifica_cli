# Pacifica CLI

Agent-native trading terminal for Pacifica DEX. Terminal-first interface with MCP tools for AI agent integration.

## What is this?

Three deliverables from one codebase:

1. **CLI (TUI)** — Rich terminal UI with live market data, order management, position tracking
2. **MCP Server** — 20+ tools so AI agents can read markets and trade on Pacifica
3. **Claude Code Skills** — Slash commands for agent-assisted trading workflows

## Quick Start

### 1. Activate wallet on Pacifica web app

Before using the CLI, activate your wallet at [test-app.pacifica.fi](https://test-app.pacifica.fi):

1. Connect your Solana wallet (e.g. Phantom)
2. Enter access code: **`Pacifica`**
3. Use the Faucet to mint test USDP

### 2. Install and configure CLI

```bash
npm install -g pacifica-cli
pacifica init --testnet    # use the same wallet activated above
pacifica scan
```

## Status

Under active development for The Synthesis hackathon.
