# Feature: Smart Order Manager (M2)

> **Status:** `done` (trailing stop, partial TP), `deferred` (DCA, time stop, breakeven)
> **Phase:** v1 — P1 (trailing stop, partial TP), P2 (DCA, time stop, breakeven)
> **Last updated:** 2026-03-30

---

## Summary

Advanced order types that Pacifica doesn't natively support, running locally on the trader's machine. A background poll loop monitors positions and adjusts orders when conditions are met. Trailing stop and partial take-profit are P1; DCA, breakeven auto, and time stop are P2.

---

## Users

- **Minh:** "I can set a trailing stop on other exchanges. Why can't I do it on Pacifica?" Sets smart orders and walks away.
- **Sarah:** Uses MCP tools to set smart orders programmatically as part of larger strategy.

---

## User Stories

- As a **trader**, I want a trailing stop that follows price so I can lock in profits without watching the screen
- As a **trader**, I want to take partial profits at multiple levels so I can de-risk while letting the rest ride
- As an **AI agent**, I want to set and manage smart orders so I can implement complex strategies

---

## Behaviour

### Trailing Stop
1. `pacifica smart trailing ETH-PERP --distance 2%`
2. Background loop polls position every 5s
3. For longs: track highest price since creation. If price drops `distance` from high, trigger SL.
4. For shorts: track lowest price since creation. If price rises `distance` from low, trigger SL.
5. On trigger: close position at market, log to journal

### Partial Take-Profit
1. `pacifica smart partial-tp ETH-PERP --levels 4000:50% 4200:25%`
2. Place limit orders at specified price levels with corresponding size percentages
3. Monitor fills. On each fill, log to journal.
4. If position size changes externally, recalculate remaining TP sizes
5. If position closed entirely, cancel remaining TP orders

### Edge Cases & Rules
- If API rate-limited during polling: back off to 15s interval
- If position closes while trailing: clean up smart order state, log "position closed externally"
- If WebSocket has stale price: use REST as fallback for smart order price checks
- Persist smart order state to `.pacifica/smart-orders.json` — resume on CLI restart
- Smart orders stop when CLI process stops (acceptable for hackathon)

---

## Connections

- **Depends on:** M1 (SDK client, position data)
- **Triggers:** M8 (journal log when triggered), M9 (on_smart_order_trigger hook)
- **Shares data with:** M7 (heatmap shows smart order levels)

---

## MVP vs Full Version

| Aspect | MVP (v1) | Full Version |
|--------|----------|--------------|
| Order types | Trailing stop only | Trailing, partial TP, breakeven, DCA, time stop |
| Persistence | JSON file, resume on restart | Same |
| Background process | Poll every 5s | WebSocket-driven events |
| Multi-position | One smart order per position | Multiple smart orders per position |

---

## Security Considerations

- Smart order execution goes through guardrails if triggered by agent
- Price validation: don't act on obviously stale prices (>30s old)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T15 | `[x]` | Build smart order manager with poll loop and state persistence |
| T16 | `[x]` | Implement trailing stop logic |
| T17 | `[x]` | Implement `pacifica smart` CLI subcommands (trailing, list, cancel) |
| T18 | `[x]` | Implement partial take-profit logic |
| T19 | `[>]` | Implement DCA entry, breakeven auto, time stop (P2) |

---

## User Acceptance Tests

**UAT Status:** `pending`

## Open Questions

- [ ] Does Pacifica support modifying SL on an existing position, or do we need to cancel+replace?

---

## Archive
