# Project Scope

> Rewritten 2026-04-15 for the "lean-to-thesis" v2 refactor.

## In Scope — v2 (Thesis: CLI + MCP + Pattern Primitive)

### P0 — Must Work
- `pacifica init` — onboarding wizard
- CLI trading core: `trade`, `orders`, `positions`, `funding`, `simulate`, `scan`, `journal`, `agent`
- **Pattern primitive**: YAML artifact at `~/.pacifica/patterns/`, loader, matcher, zod validation
- **Pattern CLI**: `pacifica patterns list | show | validate`
- **Pattern MCP tools**: `pacifica_list_patterns`, `pacifica_get_pattern`, `pacifica_run_pattern`, `pacifica_simulate_pattern`, `pacifica_save_pattern`
- MCP server with 21 tools (read, analytics, funding, write, patterns)
- Agent guardrails at MCP layer (spending cap, max leverage, max size)
- 7 lean skills: pacifica-shared, author-pattern, pattern-confirmed-entry, funding-arb-single-venue, risk-check-before-trade, validate-before-live, journal-trade

### P1 — Nice To Have
- Example pattern library in `examples/patterns/` (2+ worked examples)
- Pattern-level journal tagging so per-pattern track record builds over time
- Live backtest for patterns over historical candles

### Deferred / Open Decisions
- **Web surface** (`web/app/patterns`, `web/app/simulate`, landing page) — kept for now, pending founder decision on whether to ship v1 or strip to a landing page only. See DECISIONS.md.

## Out of Scope — v2

All of these were in v1 and were cut in the 2026-04-15 refactor:

- Copy-trading (copy/watch/leaderboard/reputation/social)
- Autonomous bots (arb daemon, smart order manager, DCA/TWAP/grid)
- Alerts-as-a-feature (heatmap, stream, alerts CLI)
- Event hooks / TradingView webhooks
- Intelligence feed web UI with social signals
- Non-Pacifica venues

If a trader wants one of these, the v2 answer is: **encode it as a pattern.**

## Never In Scope

- Hosted server / cloud deployment (local-only)
- User accounts (API key is the auth)
- Mainnet-only features without testnet parity
- Any middleware that proxies trading intent through a third party
- Copy-from-other-traders without explicit per-trade authorship
