# Feature: Market Scanner & Order Entry (M1)

> **Status:** `done`
> **Phase:** v1 — P0
> **Last updated:** 2026-03-30

---

## Summary

The core trading loop. Live market overview with real-time data, order placement with TP/SL, order management, and position tracking. This is the foundation everything else builds on. Also includes the MCP server with 23 tools (10 read + 5 analytics + 2 funding + 6 write) for agent access.

---

## Users

Both user types use this from day one:
- **Minh (trader):** Uses CLI commands directly — `pacifica scan` in one tmux pane, `pacifica positions` in another
- **Sarah (bot builder):** Uses MCP tools programmatically via Claude or her own agent code

---

## User Stories

- As a **trader**, I want to see all markets with price, volume, OI, and funding in a live-updating table so I can spot opportunities without opening a browser
- As a **trader**, I want to place a market or limit order with TP/SL from the terminal so I can execute faster than through a web UI
- As a **trader**, I want to see my open positions with live PnL so I can monitor risk at a glance
- As a **trader**, I want to cancel orders and close positions from the terminal so I can react quickly
- As an **AI agent**, I want MCP tools for reading markets and placing orders so I can trade on Pacifica programmatically

---

## Behaviour

### `pacifica scan` — Live Market Overview
1. Connect to Pacifica WebSocket for ticker data
2. Render table: market, price, 1h%, 24h%, volume, OI, funding rate
3. Auto-refresh every tick (or every 2s via REST fallback)
4. Show performance summary header (markets active, total volume, top mover, funding hot)
5. Press `q` to quit, `r` to force refresh

### `pacifica trade buy/sell <market> <size> [--flags]`
1. Parse args: market, size, --lev, --type (market/limit), --price, --tp, --sl
2. Validate: market exists, size > min, leverage within max
3. If limit order: --price required
4. If TP/SL set: validate TP > entry (long) or TP < entry (short)
5. If agent-triggered: check guardrails (M5)
6. Show confirmation with estimated cost
7. Send order via SDK
8. Print fill confirmation: fill price, fees, margin impact
9. Log to journal (M8)

### `pacifica orders`
1. Fetch open orders from API
2. Render table: order ID, market, side, type, price, size, status, created
3. If > 20 orders, paginate

### `pacifica orders cancel <id>`
1. Validate order ID exists
2. Cancel via API
3. Handle "already filled" gracefully
4. Print confirmation

### `pacifica positions`
1. Fetch open positions from API
2. Render table: market, side, size, entry, mark, PnL ($, %), liq price, leverage, margin
3. Color PnL green/red

### `pacifica positions close <market>`
1. Validate position exists
2. If position > $1000, require confirmation
3. Close at market via API
4. Print: fill price, realized PnL, fees
5. Log to journal

### Edge Cases & Rules
- WebSocket disconnect > 5s → fall back to REST polling every 2s
- Show "Reconnecting..." status during disconnect
- "No open positions" / "No open orders" messages for empty states
- Race condition: position closed between fetch and close attempt → show clear error
- All MCP write tools check guardrails before execution

---

## Connections

- **Depends on:** Pacifica SDK wrapper (core), Config loader (core)
- **Triggers:** M8 (journal logging on fills/closes)
- **Shares data with:** M7 (heatmap uses position data), M3 (funding data shared), M5 (guardrails check on all writes)

---

## MVP vs Full Version

| Aspect | MVP (v1) | Full Version |
|--------|----------|--------------|
| Market data | REST polling every 2s | WebSocket real-time ticks |
| Order types | Market + limit | Market, limit, stop-limit, stop-market |
| TP/SL | Set at order time | Modify after placement |
| MCP tools | 23 tools (10 read + 5 analytics + 2 funding + 6 write) | Additional tools as needed |
| Table sorting | Fixed order | Sortable by any column |

---

## Security Considerations

- API keys never logged in order confirmations
- Order parameters validated client-side before API call (size > 0, valid market, leverage within range)
- Guardrails enforced for all agent-triggered operations
- No raw API errors shown to user — translate all errors

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T2 | `[x]` | Build Pacifica REST SDK client (auth, markets, orders, positions, account) |
| T3 | `[x]` | Build Pacifica WebSocket client with auto-reconnection |
| T4 | `[x]` | Implement `pacifica scan` command with Ink live table |
| T5 | `[x]` | Implement `pacifica trade buy/sell` with validation and confirmation |
| T6 | `[x]` | Implement `pacifica orders` list and `pacifica orders cancel` |
| T7 | `[x]` | Implement `pacifica positions` list and `pacifica positions close` |
| T8 | `[x]` | Build MCP server with 23 tools (10 read + 5 analytics + 2 funding + 6 write) |

---

## User Acceptance Tests

**UAT Status:** `pending`
**Last tested:** —
**Outcome:** —

## Open Questions

- [ ] What are the exact Pacifica REST API endpoints and response formats?
- [ ] What WebSocket channels does Pacifica support?
- [ ] What is the minimum order size on Pacifica?
- [ ] Does Pacifica support native TP/SL on orders or do we need to place separate orders?

---

## Notes

This is the P0 foundation. Everything else (heatmap, funding, smart orders, journal) depends on the SDK client and basic trading commands working correctly.

---

## Archive
