---
name: pacifica-twap-order
version: 1.0.0
description: Execute a large order as a time-weighted average price (TWAP) by slicing it into small equal chunks over a defined window
category: execution
requires:
  commands: [trade, simulate, positions]
  skills: [pacifica-shared, simulate-first, validate-before-live]
  auth_required: true
  dangerous: true
---

# TWAP Order

## Purpose
Execute a large position entry or exit while minimising market impact by distributing
the total order across multiple smaller orders at regular time intervals. TWAP is most
useful when your target notional is large relative to the typical order book depth, or
when you want to reduce the risk of adverse execution on a single large market order.

Unlike DCA, TWAP is a pure execution technique — the directional decision has already
been made. You are only controlling how the order is filled, not whether to trade.

## Steps

1. Confirm the total order size and direction.
2. Choose a TWAP window (e.g. 30 minutes) and interval (e.g. 5 minutes = 6 slices).
3. Calculate slice size: `total_size / num_slices`.
4. Simulate one slice to confirm fees and market impact are acceptable.
5. Validate the first slice.
6. Submit slices on the interval until fully filled.
7. After each slice, read current positions to confirm cumulative fill.
8. After the final slice, confirm total position size matches the target.

## Commands

```bash
# Step 1: Determine total notional and set slice parameters
# Example: $3000 total, 6 slices over 30 minutes = $500 per slice, one every 5 minutes

# Step 2: Simulate one slice
pacifica simulate long BTC-USDC-PERP 500 --leverage 2 --json

# Step 3: Validate first slice
pacifica trade buy BTC-USDC-PERP 500 --leverage 2 --sl 58000 --validate --json

# Step 4: Submit slice 1 of 6
pacifica trade buy BTC-USDC-PERP 500 --leverage 2 --sl 58000 --json

# [Wait 5 minutes]

# Step 5: Check cumulative position after slice 1
pacifica positions --json

# Step 6: Submit slice 2 of 6
pacifica trade buy BTC-USDC-PERP 500 --leverage 2 --sl 58000 --json

# [Continue for remaining slices]

# Step 7: After final slice — confirm total fill
pacifica positions --json
```

## Parameters

| Parameter | Example | Notes |
|---|---|---|
| `total_notional` | $3000 | Full order size in USD |
| `num_slices` | 6 | Number of equal intervals |
| `slice_size` | $500 | `total_notional / num_slices` |
| `window_minutes` | 30 | Total execution window |
| `interval_minutes` | 5 | `window_minutes / num_slices` |
| `--leverage` | 2 | Held constant across all slices |

## Stop-Loss Guidance

For TWAP entries, place the stop-loss on the first slice based on your technical
invalidation level. As slices execute and your average entry improves, trail the
stop-loss upward to protect earlier fills.

## Risks

- **Partial execution at unfavourable prices**: If the market moves significantly during
  the TWAP window, later slices will have a worse entry than the first. Set a maximum
  acceptable fill price and halt if it is breached.
- **Fee accumulation**: Each slice incurs taker fees. For 6 slices at 0.05% taker fee,
  total fee cost is roughly 0.3% of notional — factor this into expected P&L.
- **Position size drift**: If an earlier position in the same market is open, TWAP slices
  will add to it. Always run `pacifica positions --json` before starting.

## Notes

- TWAP is most effective for positions larger than $5,000 notional. Below that, a single
  market order is preferable to avoid fee accumulation from multiple small orders.
- For exits (TWAP out of a position), use `pacifica trade sell` with the same slice logic.
  The stop-loss argument is not needed for exit slices.
- Agent timing between slices should use `ScheduleWakeup` with a delay equal to
  `interval_minutes * 60` seconds.
