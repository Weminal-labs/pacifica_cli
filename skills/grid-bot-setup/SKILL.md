---
name: pacifica-grid-bot-setup
version: 1.0.0
description: Configure and launch a basic grid trading strategy using limit orders at evenly spaced price levels
category: execution
requires:
  commands: [trade, orders, positions, simulate]
  skills: [pacifica-shared, simulate-first, validate-before-live]
  auth_required: true
  dangerous: true
---

# Grid Bot Setup

## Purpose
Place a ladder of limit buy and sell orders around the current market price to profit
from price oscillation within a range. Each buy order fill is paired with a sell order
above it; each sell order fill is paired with a buy order below it. The bot earns the
spread between each pair on every oscillation.

This skill describes a manual grid setup. It does not provide an automated grid daemon —
you manage the ladder by monitoring order fills and placing new orders when needed.

Use grid trading when the market is ranging (no strong directional trend) and when
funding rates are near zero (high funding would erode grid profits).

## Steps

1. Identify a price range for the grid. The range should reflect recent support and
   resistance levels. Confirm the market is ranging, not trending.
2. Choose the number of grid levels (recommended: 5–10 for a first grid).
3. Calculate the step size: `(upper_bound - lower_bound) / num_levels`.
4. Calculate the order size per level: `total_capital / num_levels`.
5. Simulate one representative trade to confirm fees are acceptable per level.
6. Place all buy limit orders below the current price.
7. Place all sell limit orders above the current price.
8. Monitor fills. When a buy fills, place a corresponding sell one step above the fill price.
9. When a sell fills, place a corresponding buy one step below the fill price.

## Commands

```bash
# Step 1: Check current price and recent range
pacifica scan --json
# Filter for your target market — note the current price

# Step 2: Simulate one grid trade to check fee impact
# Example: ETH-USDC-PERP, price $3200, 10-level grid from $3000-$3400 = $40 step
pacifica simulate long ETH-USDC-PERP 200 --leverage 1 --entry 3000 --json

# Step 3: Place buy limit orders (below current price)
# Level 1 — buy at 3000
pacifica trade buy ETH-USDC-PERP 200 --type limit --price 3000 --leverage 1 --json
# Level 2 — buy at 3040
pacifica trade buy ETH-USDC-PERP 200 --type limit --price 3040 --leverage 1 --json
# Level 3 — buy at 3080
pacifica trade buy ETH-USDC-PERP 200 --type limit --price 3080 --leverage 1 --json

# Step 4: Place sell limit orders (above current price)
# Level 1 — sell at 3160
pacifica trade sell ETH-USDC-PERP 200 --type limit --price 3160 --leverage 1 --json
# Level 2 — sell at 3200
pacifica trade sell ETH-USDC-PERP 200 --type limit --price 3200 --leverage 1 --json
# Level 3 — sell at 3240
pacifica trade sell ETH-USDC-PERP 200 --type limit --price 3240 --leverage 1 --json

# Step 5: Verify all orders are in the book
pacifica orders --json

# Step 6: Monitor fills
pacifica orders --json  # run periodically
pacifica positions --json  # check accumulated position
```

## Parameters

| Parameter | Example | Notes |
|---|---|---|
| `upper_bound` | $3400 | Top of grid range |
| `lower_bound` | $3000 | Bottom of grid range |
| `num_levels` | 10 | Number of price levels in each direction |
| `step_size` | $40 | `(upper - lower) / num_levels` |
| `order_size_usd` | $200 | Capital per level |
| `total_capital` | $2000 | `order_size_usd * num_levels` |

## Risks

- **Trend breakout**: If price breaks out of the grid range, all orders on one side fill
  and you hold a losing directional position with no offsetting orders. Define a stop
  for the entire grid at the range boundary.
- **Funding costs**: If net position is long and funding rates rise, the carry cost eats
  into grid profits. Monitor funding daily with `pacifica funding --json`.
- **Fee drag**: Limit orders use maker fees (lower than taker) if filled passively, but
  the cumulative fee cost across many small fills adds up. Ensure your step size is at
  least 3x the taker fee rate.

## Notes

- Use leverage 1x for grid bots to avoid liquidation from accumulated directional position.
- The grid requires active management. When price reaches the boundary of the range,
  cancel remaining orders and assess whether to reset the grid at a new range.
- Run `pacifica orders cancel-all --json` to close the entire grid at once if market
  conditions change significantly.
