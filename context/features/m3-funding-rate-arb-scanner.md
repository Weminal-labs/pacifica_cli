# Feature: Funding Rate Arbitrage Scanner (M3)

> **Status:** `draft`
> **Phase:** v1 — P1
> **Last updated:** 2026-03-29

---

## Summary

Monitors funding rates on Pacifica vs Binance and Bybit. Signals when spreads are tradeable with annualized APR calculations. Saves Minh from manually cross-referencing rates across 3 exchanges every 8 hours.

---

## Users

- **Minh:** Checks funding spreads every morning. Currently does this in a spreadsheet.
- **AI Agent:** Analyzes funding data and suggests delta-neutral trades with position sizing.

---

## User Stories

- As a **trader**, I want to see current funding rates for all Pacifica markets so I can plan around funding settlements
- As a **trader**, I want to compare Pacifica funding vs Binance and Bybit so I can spot arb opportunities
- As an **AI agent**, I want funding data in structured format so I can calculate APR and recommend trades

---

## Behaviour

### `pacifica funding`
1. Fetch funding rates from Pacifica API
2. Table: market, current rate, next funding time (countdown), predicted rate
3. Handle markets with no funding data

### `pacifica funding-arb`
1. Fetch funding rates from Pacifica, Binance, Bybit in parallel
2. Table: market, Pacifica rate, Binance rate, Bybit rate, spread, annualized APR, signal
3. APR = spread x (365 x 3) for 8h funding
4. Signal: SHORT PAC (Pacifica rate higher) or LONG PAC (Pacifica rate lower)
5. Highlight spreads > 0.02% as actionable

### Edge Cases & Rules
- Binance/Bybit APIs are public (no auth). Handle failures gracefully — show "N/A"
- Match market symbols across exchanges (ETH-PERP on Pacifica = ETHUSDT on Binance)
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
| Exchanges | Pacifica + Binance + Bybit | Add OKX, dYdX, Hyperliquid |
| History | Current rates only | ASCII sparkline of 7d history |
| Alert | Manual check | Auto-alert when spread > threshold |

---

## Security Considerations

- Binance/Bybit are read-only public endpoints — no auth risk
- Don't log full API responses (may contain tracking headers)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T13 | `[ ]` | Build Binance funding rate fetcher |
| T14 | `[ ]` | Build Bybit funding rate fetcher |
| T20 | `[ ]` | Build symbol mapping (Pacifica ↔ Binance ↔ Bybit) |
| T21 | `[ ]` | Implement `pacifica funding` and `pacifica funding-arb` commands |
| T22 | `[ ]` | Add MCP tools: funding_rates, funding_arb_scan, funding_history |

---

## User Acceptance Tests

**UAT Status:** `pending`

## Open Questions

- [ ] What symbol format does Pacifica use? (ETH-PERP? ETHPERP? ETH/USD?)
- [ ] Does Pacifica have a predicted/estimated next funding rate endpoint?

---

## Archive
