---
name: pacifica-author-pattern
version: 1.0.0
description: Help the trader encode a new trading idea as a YAML pattern in ~/.pacifica/patterns/
category: patterns
requires:
  mcp_tools: [pacifica_save_pattern, pacifica_get_pattern, pacifica_list_patterns, pacifica_run_pattern]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Author a Pattern

## Purpose

When the trader describes a setup in natural language — "long BTC when funding is deeply negative and OI is rising" — help them encode it as a pattern YAML. The pattern becomes reusable, composable, and executable via `pacifica_run_pattern` forever after.

This is the canonical "code your instinct" flow.

## Steps

1. **Listen.** Extract: direction (long/short), market, conditions (the "when" part), size/leverage appetite, stops/targets.
2. **Ask focused clarifying questions** only when truly missing — e.g. "What size USD do you want to enter with?" — not wide-open ones. Default reasonable values for fields the trader doesn't care about yet.
3. **Map conditions to axes.** The trader says "funding is deeply negative" → `{axis: funding_rate, op: lt, value: -0.0003}`. Pick thresholds based on the trader's stated intent; if they say "very negative" be more aggressive (-0.0005); if "slightly" use -0.0001.
4. **Draft the YAML.** Show it to the trader. Be explicit: "Here's what I'm going to save. OK to commit?"
5. **Save.** `pacifica_save_pattern({ pattern: {...} })` — the tool validates via zod before persisting.
6. **Immediately run it** on the target market so the trader sees whether it fires right now.

## Condition Axis Cheat Sheet

| Trader says... | Use this |
|---|---|
| "funding is negative" | `funding_rate < -0.0001` (mild) or `< -0.0003` (deep) |
| "OI is rising" | `oi_change_4h_pct > 5` (mild) or `> 10` (strong) |
| "buyers are aggressive" | `buy_pressure > 0.6` |
| "bullish momentum" | `momentum_value > 0.3` |
| "whales are active" | `large_orders_count >= 3` |
| "high volume" | `volume_24h_usd > <number>` |

## Example

> Trader: "Long SOL when funding is negative and whales are buying."

Draft:
```yaml
name: sol-whale-carry
description: Long SOL when funding pays and whales are active.
tags: [sol, funding, whales]
market: SOL-USDC-PERP
when:
  - { axis: funding_rate, op: lt, value: -0.0001 }
  - { axis: large_orders_count, op: gte, value: 3 }
  - { axis: buy_pressure, op: gt, value: 0.6 }
entry:
  side: long
  size_usd: 300
  leverage: 3
  stop_loss_pct: 2.0
  take_profit_pct: 2.5
exit:
  - { axis: funding_rate, op: gt, value: 0 }
```

Then: `pacifica_save_pattern(...)` → `pacifica_run_pattern({ name: "sol-whale-carry" })` so the trader sees live output.

## Quality Rules

- **Name**: lowercase kebab, descriptive. `sol-whale-carry` good. `pattern-1` bad.
- **At least 2 conditions** in `when:`. A single-condition pattern is just a market order — not worth encoding.
- **Always include a stop loss.** If the trader refuses, push back once; if they insist, proceed.
- **Always suggest an exit rule** matching the entry rationale. If entry is "negative funding," exit is "funding flipped positive."
- **Never invent conditions.** If the trader mentions a concept that doesn't map to a known axis, say so and ask them to reframe.
