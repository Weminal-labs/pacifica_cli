# M10: Agent-Readable Market Intelligence

## Problem
Raw Pacifica market data (prices, funding, OI) requires manual interpretation.
Agents and traders must write their own filters, pattern detectors, and alert logic
on top of raw API data. No structured, stable JSON output exists for agent consumption.

## Solution
A market intelligence layer that transforms raw data into actionable insights:
- Market filters (top gainers, losers, by liquidity, by OI)
- Trade pattern analysis (buy pressure, VWAP, whale detection, momentum)
- Alert system (price, funding, volume alerts with triage)
- Stable JSON schema for consistent agent consumption
- Agent recipes: documented tool chains for common analysis workflows

## User Stories
- Trader: `pacifica scan --gainers --min-volume 5000000` → instantly see top movers with enough liquidity to trade
- Trader: `pacifica alerts check` → see which price alerts have triggered since last check
- Agent (Claude): `pacifica_top_markets({sort_by:"gainers", limit:5})` → `pacifica_liquidity_scan({...})` → pick best entry
- Agent (Claude): `pacifica_alert_triage({})` → react to triggered conditions autonomously

## Scope
- Pacifica API only — no external data sources
- Read-only — no new write operations
- Polling-based alerts — no persistent background daemon
- Local JSON storage for alert config (same as journal/smart-orders)

## MCP Tools Added (5 new read tools)
- `pacifica_top_markets`
- `pacifica_liquidity_scan`
- `pacifica_trade_patterns`
- `pacifica_alert_triage`
- `pacifica_market_snapshot`

## CLI Commands Added
- `pacifica alerts list|add|remove|check`
- `pacifica scan --gainers|--losers|--min-volume|--json` (new flags on existing command)
