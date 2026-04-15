---
name: pacifica-simulate-first
version: 1.0.0
description: Always simulate a trade before submitting it — mandatory step in every entry workflow
category: safety
requires:
  commands: [simulate]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Simulate First

## Purpose
Run `pacifica simulate` on every trade before placing a live order. Simulation fetches
the current mark price and funding rate, then calculates liquidation price, required
margin, P&L at multiple price scenarios, and the funding cost over time — all without
touching your account or submitting anything to the exchange.

This is the most important habit in disciplined trading. A single simulation call
costs nothing and prevents many classes of expensive mistakes.

## Steps

1. Determine the trade parameters: side, market, size in USD, and leverage.
2. Run `pacifica simulate` with those parameters.
3. Review the liquidation price. It must be more than 10% from the current price.
4. Review the P&L scenarios. Confirm the worst-case scenario at your stop-loss is
   within acceptable loss tolerance.
5. Review the funding cost projection. Confirm you understand the daily carry cost.
6. Only proceed to `validate-before-live` if all checks pass.

## Commands

```bash
# Basic simulation
pacifica simulate long ETH-USDC-PERP 500 --leverage 5 --json

# Simulation with custom entry price (for limit order planning)
pacifica simulate long ETH-USDC-PERP 500 --leverage 5 --entry 3100 --json

# Short simulation
pacifica simulate short BTC-USDC-PERP 1000 --leverage 3 --json

# Low-leverage simulation for a safer position
pacifica simulate long SOL-USDC-PERP 200 --leverage 2 --json
```

## Expected Output Fields

```json
{
  "symbol": "ETH-USDC-PERP",
  "side": "long",
  "notionalUsd": 500,
  "leverage": 5,
  "marginUsd": 100,
  "entryPrice": 3200.00,
  "liquidationPrice": 2568.00,
  "liquidationPct": -19.75,
  "fundingRateApr": "+21.9%",
  "scenarios": [
    { "label": "-10%", "price": 2880.00, "pnl": -50.00 },
    { "label": "-5%",  "price": 3040.00, "pnl": -25.00 },
    { "label": "+5%",  "price": 3360.00, "pnl": 25.00  },
    { "label": "+10%", "price": 3520.00, "pnl": 50.00  }
  ]
}
```

## Simulation Pass Criteria

| Metric | Requirement | Rationale |
|---|---|---|
| `liquidationPct` | >= 10% from entry | Avoids getting wiped by normal volatility |
| Loss at stop-loss price | <= 5% of account equity | Respects Kelly criterion at typical win rates |
| `fundingRateApr` | <= 60% absolute | High funding adds meaningful carry risk |
| Margin required | Leaves >= 30% free margin | Preserves capacity to manage the position |

If any criterion fails, adjust size or leverage until all pass, or abort the trade.

## Notes

- The `--entry` flag overrides the live mark price. Use it when planning a limit order
  entry at a specific price level.
- Simulation output includes an intelligence signal check — if the pattern engine has
  an active signal for the simulated market, it appears in the output.
- For paper-trading practice, simulation is the primary tool. You can run it with any
  parameters — no credentials are required for simulation.
