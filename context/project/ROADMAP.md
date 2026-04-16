# Roadmap

> Rewritten 2026-04-15 for the lean-to-thesis v2 refactor.

## Phase 0 — Foundation (shipped, pre-v2)

- CLI scaffold, config loader, Pacifica SDK (REST + WebSocket)
- `init`, `scan`, `trade`, `orders`, `positions`, `funding`, `simulate`, `journal`, `agent`
- MCP server with 16 non-pattern tools
- Agent guardrails (spending cap, leverage cap)

## Phase 1 — Pattern Primitive (shipped 2026-04-15)

The load-bearing v2 work. Turns the CLI into a pattern-programmable trading seat.

- `src/core/patterns/` — types, loader, matcher, savePattern
- YAML schema with zod validation
- `~/.pacifica/patterns/` as the canonical user library
- `pacifica patterns` CLI (list/show/validate)
- 5 MCP pattern tools: list, get, run, simulate, save
- 2 example patterns (`funding-carry-btc`, `trend-continuation-eth`)
- 7 lean skills: pacifica-shared, author-pattern, pattern-confirmed-entry, funding-arb-single-venue, risk-check-before-trade, validate-before-live, journal-trade

## Phase 2 — Pattern Library Depth (shipped 2026-04-16)

Sharpen the primitive with real trader feedback.

- Pattern backtest: replay against last 30 days of candles, not just current state. ✓
- Per-pattern journal tagging so a trader sees win-rate per pattern they've authored. ✓
- More example patterns covering common setups (mean-reversion, breakout, range, whale-follow-as-pattern).
- Pattern composition (`include:` other patterns) if feedback calls for it.

## Phase 3 — Trader Validation (2 weeks out)

Get 10 Pacifica traders using patterns. Iterate on the primitive based on their feedback.

- "Code your first pattern" screencast (demo deliverable).
- Onboarding improvements to reduce time-to-first-pattern below 2 minutes.
- Fix whatever the first 10 traders bounce on.

## Out of This Roadmap

Everything pruned in the 2026-04-15 refactor: copy-trading, autonomous bots, heatmaps-as-features, alerts CLI, intelligence feed UI, arb daemon, smart orders, event hooks, TradingView webhooks. See `SCOPE.md` and `DECISIONS.md`.

## Open Decision

Whether to ship the web surface (`/patterns`, `/simulate`, landing page) in v1 or strip to a landing page only. The thesis says no web surface. The existing pages are recent work. Founder call.
