---
name: pacifica-snapshot-before-trade
version: 1.0.0
description: Capture a full account snapshot — positions, orders, and funding rates — before placing any trade
category: safety
requires:
  commands: [positions, orders, funding]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: false
---

# Snapshot Before Trade

## Purpose
Before placing any order, capture the current state of your account and the relevant
market. This creates an unambiguous baseline for the trade, prevents accidental position
doubling, and gives you the context needed to size correctly given your existing exposure.

This skill is a pre-flight check. It does not place orders. Always run it as the first
step of any entry workflow.

## Steps

1. Fetch all open positions to understand current directional exposure.
2. Fetch all open orders to check for any pending entries or exits that may not yet
   be reflected in positions.
3. Fetch funding rates for the market you intend to trade to factor the carry cost
   into your sizing decision.
4. Calculate total current exposure and remaining free margin.
5. Confirm that the intended new position does not create excessive concentration.

## Commands

```bash
# Step 1: Open positions snapshot
pacifica positions --json

# Expected shape:
# [
#   {
#     "symbol": "ETH-USDC-PERP",
#     "side": "bid",
#     "size": "0.5",
#     "entryPrice": "3200.00",
#     "unrealisedPnl": "42.00",
#     "liquidationPrice": "2800.00"
#   }
# ]

# Step 2: Open orders snapshot
pacifica orders --json

# Step 3: Funding rates for the target market
pacifica funding --json
# Filter the output to find your target market's fundingRate and nextFundingRate

# Step 4: Market snapshot for current price reference
pacifica scan --json
```

## Pre-Trade Checklist

Use the snapshot data to answer each question before proceeding:

| Check | Pass condition |
|---|---|
| No existing position in same symbol and direction | `positions` does not contain the symbol with the same side |
| No conflicting open order | `orders` does not have a pending open for the same symbol |
| Funding rate favourable or neutral | `abs(fundingRate) < 0.001` or rate favours your direction |
| Position would not exceed 50% account concentration | Notional of new trade / total equity < 0.50 |
| Liquidation price has at least 10% buffer | `abs(liquidationPrice - currentPrice) / currentPrice >= 0.10` (from simulate) |

If any check fails, resolve it before proceeding with the entry.

## Notes

- This skill is designed to be composed. Call it as the first step in any entry recipe
  (e.g. `recipe-intelligence-driven-trade`).
- The snapshot data should be stored as context by the calling agent and passed to the
  simulation step so sizes and leverage can be calculated correctly.
- For a quick single-market check when you already know the symbol, pass `--symbol`
  to the journal command for a rapid history check:
  `pacifica journal --symbol ETH-USDC-PERP --limit 5 --json`
