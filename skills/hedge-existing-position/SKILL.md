---
name: pacifica-hedge-existing-position
version: 1.0.0
description: Open an opposite position to hedge price risk on an existing open position
category: risk
requires:
  commands: [positions, trade, simulate]
  skills: [pacifica-shared, snapshot-before-trade, simulate-first]
  auth_required: true
  dangerous: true
---

# Hedge Existing Position

## Purpose
Reduce or neutralise the directional price risk of an existing open position by opening
an opposing position in the same or a correlated market. Use this when:

- You want to protect an unrealised profit through a period of expected volatility.
- You are holding a position overnight or over the weekend and want to reduce exposure.
- News or events create short-term uncertainty but your medium-term view is unchanged.

A full hedge (100%) neutralises price risk but still accumulates funding cost on both
legs. A partial hedge reduces delta exposure while retaining some upside.

## Steps

1. Fetch current positions to identify the position to hedge.
2. Determine hedge ratio: 50% partial, 75% partial, or 100% full hedge.
3. Calculate hedge size: `existing_size * hedge_ratio`.
4. Simulate the hedge leg to confirm it does not create liquidation risk on the combined
   book.
5. Validate the hedge order.
6. Submit the hedge.
7. Confirm the combined position is at the intended net delta.

## Commands

```bash
# Step 1: View open positions
pacifica positions --json

# Example output:
# [{ "symbol": "ETH-USDC-PERP", "side": "bid", "size": "1.0", ... }]

# Step 2: Calculate hedge size
# For a 50% hedge on 1.0 ETH long: hedge size = 0.5 ETH = approx $1600 at $3200

# Step 3: Simulate the hedge leg
pacifica simulate short ETH-USDC-PERP 1600 --leverage 1 --json

# Step 4: Validate hedge order
pacifica trade sell ETH-USDC-PERP 1600 --leverage 1 --validate --json

# Step 5: Submit hedge
pacifica trade sell ETH-USDC-PERP 1600 --leverage 1 --json

# Step 6: Confirm net exposure
pacifica positions --json
# Both long and short ETH-USDC-PERP positions should now be visible
```

## Hedge Sizing Guide

| Hedge ratio | Effect | When to use |
|---|---|---|
| 25% | Reduces exposure, retains most upside | Minor uncertainty, want to stay long |
| 50% | Balanced — equal up and down exposure | Neutral short-term but long medium-term |
| 75% | Mostly hedged, small net long | Strong protection, retain small upside |
| 100% | Fully flat on price, funding costs on both | Maximum protection, event risk |

## Cost of Hedging

Opening a hedge position incurs:
- Taker fee on the hedge leg entry
- Ongoing funding on both legs (which may net out or compound)
- Taker fee on closing either leg when you unwind

Factor these costs into the decision, especially for short hedges (minutes to hours).

## Risks

- **Funding on both legs**: If you hold a long ETH and a short ETH simultaneously, you
  pay or receive funding on both. If funding is positive, you pay on the long and collect
  on the short — they net to near zero. But during rate reversals this can flip.
- **Correlation drift**: Hedging with a correlated asset (e.g. hedging ETH long with SOL
  short) creates basis risk — the correlation may break during the event you are
  hedging against.
- **Complexity on unwind**: When the hedged period ends, you must close one leg carefully
  to restore the original exposure without accidentally going flat.

## Notes

- After the hedging event passes, close the hedge leg with `pacifica positions close
  <symbol>` and return to the original position.
- For short-term hedges (< 8 hours), a simple stop-loss on the original position may
  be cheaper and simpler than opening a full hedge leg.
