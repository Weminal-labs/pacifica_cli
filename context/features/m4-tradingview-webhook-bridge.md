# Feature: TradingView Webhook Bridge (M4)

> **Status:** `deferred` — not implemented, pushed to post-hackathon
> **Phase:** v1 — P2 (stretch goal)
> **Last updated:** 2026-03-30

---

## Summary

Local HTTP server that accepts TradingView webhook alerts and converts them to Pacifica orders. Bridges PineScript strategies to live execution. Only build if Day 3 has spare time.

---

## Users

- **Minh:** Has PineScript strategies that fire alerts. Currently executes manually.

---

## User Stories

- As a **trader**, I want my TradingView alerts to automatically execute as orders on Pacifica so I don't have to manually enter every signal

---

## Behaviour

### `pacifica webhook start --port 3456`
1. Start local fastify HTTP server on specified port
2. Accept POST requests with JSON payload: `{ action, market, size, leverage, tp, sl, secret }`
3. Validate secret token on every request
4. Validate all fields, check guardrails
5. Place order via SDK
6. Log to webhook-log.json and journal

### Edge Cases & Rules
- Reject requests without valid secret token
- Validate all order parameters before execution
- Log every received webhook (success and failure)
- Guardrails apply to webhook-triggered orders

---

## Connections

- **Depends on:** M1 (SDK, order placement), M5 (guardrails)
- **Triggers:** M8 (journal log), M9 (on_fill hook)

---

## Security Considerations

- Secret token required on every webhook request
- Runs locally — no public endpoint unless user sets up tunnel (ngrok/cloudflared)
- Shell injection via payload fields — validate and sanitize all inputs

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T23 | `[>]` | Build webhook HTTP server with fastify |
| T24 | `[>]` | Implement webhook validation and order execution |
| T25 | `[>]` | Add `pacifica webhook status/logs` commands |

---

## User Acceptance Tests

**UAT Status:** `pending`

---

## Archive
