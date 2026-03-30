# Feature: Funding Rate Scanner (M3)

> **Status:** `done`
> **Phase:** v1 — P1
> **Last updated:** 2026-03-30

---

## Summary

Monitors funding rates on Pacifica. Displays current and predicted rates with annualized APR calculations. Helps traders plan around funding settlements.

---

## Users

- **Minh:** Checks funding rates every morning to plan positions around settlements.
- **AI Agent:** Analyzes funding data and suggests trades with position sizing.

---

## User Stories

- As a **trader**, I want to see current funding rates for all Pacifica markets so I can plan around funding settlements
- As an **AI agent**, I want funding data in structured format so I can calculate APR and recommend trades

---

## Behaviour

### `pacifica funding`
1. Fetch funding rates from Pacifica API
2. Table: market, current rate, predicted rate, annualized APR, price
3. Sort by absolute funding rate descending
4. Handle markets with no funding data

### Edge Cases & Rules
- Cache funding data locally to reduce API calls for history view

---

## Connections

- **Depends on:** M1 (shared market data, SDK client)
- **Triggers:** M9 (on_funding hook)
- **Shares data with:** M1 (market table could show funding column)

---

## MVP vs Full Version

| Aspect | MVP (v1) | Full Version |
|--------|----------|--------------|
| History | Current rates only | ASCII sparkline of 7d history |
| Alert | Manual check | Auto-alert when rate > threshold |

---

## Security Considerations

- Don't log full API responses (may contain tracking headers)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T21 | `[x]` | Implement `pacifica funding` command |
| T22 | `[x]` | Add MCP tools: funding_rates, funding_history |

---

## User Acceptance Tests

**UAT Status:** `pending`

## Open Questions

- [ ] What symbol format does Pacifica use? (ETH-PERP? ETHPERP? ETH/USD?)
- [ ] Does Pacifica have a predicted/estimated next funding rate endpoint?

---

## Archive

- T13, T14, T20 removed — external exchange integrations (Binance/Bybit) dropped from scope (2026-03-30)
