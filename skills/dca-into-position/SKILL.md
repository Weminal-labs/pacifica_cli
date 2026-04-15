---
name: pacifica-dca-into-position
version: 1.0.0
description: Dollar-cost average into a position by splitting a target notional into equal tranches over time
category: execution
requires:
  commands: [trade, simulate, positions]
  skills: [pacifica-shared, simulate-first, validate-before-live]
  auth_required: true
  dangerous: true
---

# DCA Into Position

## Purpose
Build a position gradually by placing equal-sized tranches over a set number of
intervals rather than entering the full size at once. This reduces timing risk and
averages your entry price across multiple market conditions.

Use DCA when:
- You have a strong directional view but expect continued volatility.
- You want to avoid single-point-in-time entry risk on a large position.
- An intelligence signal is present but confidence is medium, not high.

## Steps

1. Determine the total notional, number of tranches, and interval between them.
2. Calculate tranche size: `total_notional / num_tranches`.
3. Simulate the first tranche to confirm the liquidation level is acceptable.
4. Validate the first tranche order.
5. Submit the first tranche.
6. Wait the configured interval.
7. Check current positions and market conditions before each subsequent tranche.
8. If conditions have deteriorated significantly (price moved more than 5% against you),
   pause and reassess rather than continuing mechanically.
9. Repeat steps 4–8 for each remaining tranche.
10. After the final tranche, verify the blended average entry price in positions.

## Commands

```bash
# Step 1: Simulate the full position to understand max risk
pacifica simulate long ETH-USDC-PERP 1500 --leverage 3 --json

# Step 2: Simulate a single tranche (1500 / 3 tranches = 500 per tranche)
pacifica simulate long ETH-USDC-PERP 500 --leverage 3 --json

# Step 3: Validate the first tranche
pacifica trade buy ETH-USDC-PERP 500 --leverage 3 --sl 2800 --validate --json

# Step 4: Submit first tranche
pacifica trade buy ETH-USDC-PERP 500 --leverage 3 --sl 2800 --json

# Step 5: After waiting the interval, check position state
pacifica positions --json

# Step 6: Submit second tranche (repeat with same parameters)
pacifica trade buy ETH-USDC-PERP 500 --leverage 3 --sl 2800 --json

# Step 7: After all tranches, verify blended entry
pacifica positions --json
```

## Parameters

| Parameter | Example | Notes |
|---|---|---|
| `total_notional` | $1500 | Total position size in USD |
| `num_tranches` | 3 | How many equal parts to split into |
| `tranche_size` | $500 | `total_notional / num_tranches` |
| `interval` | 15 minutes | Time between each tranche |
| `--leverage` | 3 | Fixed across all tranches for consistent risk |
| `--sl` | 2800 | Set once on first entry; move to break-even after 2nd tranche if in profit |

## Risks

- **DCA into a losing trade**: If your directional thesis is wrong, DCA amplifies losses
  by adding to a position that is moving against you. Set a hard price level below which
  you will not add further tranches.
- **Slippage accumulation**: Multiple market orders accumulate taker fees. For large
  total notionals, consider limit orders for tranches 2 and 3.
- **Stop-loss placement**: A stop set at entry of tranche 1 may be too tight after later
  tranches are added at lower prices. Recalculate after each tranche.

## Notes

- The interval between tranches is agent-managed. Use `ScheduleWakeup` or a sleep loop
  in your agent to enforce the timing.
- After tranche 2, consider moving the stop-loss to break-even on the first tranche's
  entry price to protect the initial capital.
- DCA is most effective when combined with a confirmed intelligence signal. Do not use
  it as a substitute for having a directional thesis.
