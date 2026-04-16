---
name: pacifica-funding-arb-single-venue
version: 2.0.0
description: Open a funding-carry position on Pacifica using the funding-carry pattern
category: patterns
requires:
  mcp_tools: [pacifica_funding_rates, pacifica_get_pattern, pacifica_run_pattern, pacifica_simulate_pattern, pacifica_place_order]
  skills: [pacifica-shared, pattern-confirmed-entry]
  auth_required: true
  dangerous: true
---

# Funding Carry — Single Venue

## Purpose

Hold the paying side of an extreme funding rate on Pacifica and collect funding until the rate reverts. This is a directional bet: you are not hedged cross-venue, so the price can move against you faster than funding pays.

In v2 this is expressed as a **pattern** (`funding-carry-btc`, `funding-carry-eth`, etc.) — not an autonomous bot. The trader runs it when they want exposure; stops it by closing the position.

## Steps

1. **Check the funding landscape** — `pacifica_funding_rates` — find markets with rates > ~0.05% per 8h (roughly 55% APR).
2. **Match to a pattern** — `pacifica_list_patterns` with tag filter `funding`. If the trader has no funding pattern, hand off to the `author-pattern` skill to create one.
3. **Evaluate** — `pacifica_run_pattern({ name: "funding-carry-btc" })`. If `matched: false`, report which condition failed and stop.
4. **Simulate** — `pacifica_simulate_pattern` — check liquidation distance and estimated funding P&L over the next 8h.
5. **Place the order** — `pacifica_place_order` with the pattern's entry config. Use `stop_loss_pct` from the pattern — never skip it.
6. **Monitor** — check `pacifica_get_positions` periodically. Exit when the pattern's `exit:` condition fires (e.g. funding flipped positive).

## Risks

- **Single-venue directional risk.** Without a cross-venue hedge, a 2% adverse price move dwarfs a day of funding collection.
- **Rate reversal.** Funding rates can reverse inside the 8h window. Monitor with `pacifica_funding_rates` every hour.
- **Liquidation.** The pattern's `stop_loss_pct` must fire before the liquidation price. Simulate first to verify.

## Notes

- Good pattern candidates: rates > 0.1%/8h with rising OI (counterparty buying in, so the rate has room to persist).
- Bad candidates: extreme rates on thin-OI markets — high rate, low depth, will not fill at size.
- Always journal with a reference to which pattern was used — this builds the trader's personal track record per pattern.
