# Feature: PnL Journal & Trade Log (M8)

> **Status:** `done`
> **Phase:** v1 — P1
> **Last updated:** 2026-03-30

---

## Summary

Auto-logs every trade with full context. Append-only local JSON file. Every order fill, position close, and smart order trigger gets logged automatically. Zero effort from the trader.

---

## Users

- **Minh:** "I know I should keep a trading journal but I never do. If it just logged everything automatically, I'd actually review it."

---

## User Stories

- As a **trader**, I want every trade logged automatically so I can review my performance without manual journaling
- As a **trader**, I want weekly/monthly summaries so I can spot patterns in my trading
- As an **AI agent**, I want journal data so I can analyze patterns ("Am I better at longs or shorts?")

---

## Behaviour

### Auto-Logging (Passive)
On every order fill, position close, smart order trigger:
- Append entry to `.pacifica/journal.json`
- Fields: timestamp, type, symbol, side, size, price, pnl, fees, leverage, duration, triggered_by

### `pacifica journal`
Today's trades with full details. Running PnL total. Group by position.

### `pacifica journal --week/--month`
Summary stats: win rate, avg win, avg loss, best trade, worst trade, total fees.

### `pacifica journal export --format csv/json`
Export to file for external analysis.

### Edge Cases & Rules
- Handle partial fills: log each fill event
- Handle offline periods: reconcile on startup by checking recent fills via API
- "No trades this week" for empty periods

---

## Connections

- **Depends on:** All trading modules call `journal.log()`
- **Shares data with:** M5 (agent log shares some data)

---

## Security Considerations

- Journal contains trading activity — remind users this is sensitive local data
- Journal file is append-only — never allow modification of past entries

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T33 | `[x]` | Build journal logger module (append to JSON) |
| T34 | `[x]` | Integrate journal logging into order fill and position close flows |
| T35 | `[x]` | Implement `pacifica journal` command with daily/weekly/monthly views |
| T36 | `[>]` | Implement journal export (CSV/JSON) — P2 |

---

## User Acceptance Tests

**UAT Status:** `pending`

---

## Archive
