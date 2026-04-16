---
name: pacifica-pattern-confirmed-entry
version: 2.0.0
description: Enter a trade only when a user-authored pattern's `when:` conditions match live market state
category: patterns
requires:
  mcp_tools: [pacifica_list_patterns, pacifica_run_pattern, pacifica_simulate_pattern, pacifica_get_positions, pacifica_place_order]
  skills: [pacifica-shared, validate-before-live]
  auth_required: true
  dangerous: true
---

# Pattern-Confirmed Entry

## Purpose

Use a pattern the trader has authored in `~/.pacifica/patterns/` as the gate on entry. Only enter when that pattern's `when:` block matches the current live market.

This is the core workflow the whole CLI+MCP+pattern thesis is built around. It ties every trade back to a rule the trader wrote down, so the rationale is reproducible and improvable.

## Steps

1. **List patterns** the trader has authored — `pacifica_list_patterns`.
2. **Pick one** based on the trader's intent (e.g. "they asked about funding" → look for patterns tagged `funding`).
3. **Run it** against the live market — `pacifica_run_pattern` with the pattern name.
4. **Reject** if `matched: false`. Tell the trader which conditions failed and what the actual values are.
5. **Check positions** — `pacifica_get_positions` — avoid stacking an existing exposure.
6. **Simulate** — `pacifica_simulate_pattern` — confirm liquidation distance and P&L at TP/SL.
7. **Place the order** using the pattern's `entry` block — `pacifica_place_order` with `side`, `size_usd`, `leverage`, `stop_loss_pct`, `take_profit_pct`.
8. **Journal** — `pacifica_trade_journal` with a note referencing the pattern name.

## Example Dialogue

> Trader: "Can we enter the funding carry play on BTC?"

1. `pacifica_run_pattern({ name: "funding-carry-btc" })` → `{ matched: true, conditions: [{axis: "funding_rate", required: -0.0003, actual: -0.00041, passed: true}, ...] }`
2. `pacifica_simulate_pattern({ name: "funding-carry-btc" })` → liquidation 4% away, funding paying $0.20/hr.
3. `pacifica_place_order({ symbol: "BTC-USDC-PERP", side: "buy", size_usd: 500, leverage: 3, stop_loss_pct: 2.0 })`
4. Report: "Entered `funding-carry-btc` on BTC at $65,120. Liq at $63,180. Paying you $0.20/hr until funding flips."

## Rejection Criteria

Do not enter if:
- `matched: false` — some condition failed. Explain which one.
- Existing position same side, same market — stack risk, refuse without explicit trader confirmation.
- Liquidation distance < 2× stop-loss distance — too tight.

## Notes

- If the trader says "improve this pattern," use `pacifica_get_pattern` → discuss → `pacifica_save_pattern` with the revised YAML.
- The pattern file is the source of truth. Never enter on an ad-hoc rule when a pattern exists that covers the same setup.
