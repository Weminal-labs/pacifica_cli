---
name: pacifica-funding-collection
version: 1.0.0
description: Collect funding payments by holding a position on the receiving side of an extreme funding rate
category: funding
requires:
  commands: [funding, trade, simulate, positions]
  skills: [pacifica-shared, simulate-first, snapshot-before-trade]
  auth_required: true
  dangerous: true
---

# Funding Collection

## Purpose
When a market's funding rate is extreme in one direction, the side receiving payments
earns yield purely by holding a position. This skill identifies markets where the rate
exceeds a profitable threshold and enters a position on the receiving side — shorts
when funding is highly positive (longs are paying), longs when funding is highly
negative (shorts are paying).

Unlike funding arbitrage, this skill accepts directional price risk. It is appropriate
when you have a view that the price is likely to stay rangebound, or when the funding
yield is large enough to justify the risk.

## Steps

1. Fetch funding rates and identify markets where `abs(fundingRate) >= 0.001` (110% APR).
2. Determine which side collects: shorts collect when `fundingRate > 0`, longs when
   `fundingRate < 0`.
3. Check that `nextFundingRate` is in the same direction — confirms the rate is likely
   to persist through at least one more settlement.
4. Simulate the position to understand liquidation risk.
5. Validate and enter the position.
6. Set a stop-loss at a level that would negate the expected funding collected.
7. Monitor funding at each settlement. Exit if the rate reverses significantly.

## Commands

```bash
# Step 1: Find markets with extreme funding rates
pacifica funding --json

# Identify markets where abs(fundingRate) >= 0.001
# Positive fundingRate = shorts collect
# Negative fundingRate = longs collect

# Step 2: Simulate the funding-collection position
# Example: ETH funding is +0.002, enter short to collect
pacifica simulate short ETH-USDC-PERP 1000 --leverage 2 --json

# Step 3: Validate the entry
pacifica trade sell ETH-USDC-PERP 1000 --leverage 2 --sl 3600 --validate --json

# Step 4: Enter the position
pacifica trade sell ETH-USDC-PERP 1000 --leverage 2 --sl 3600 --json

# Step 5: Confirm open position
pacifica positions --json

# Step 6: At each 8h settlement, check if rate persists
pacifica funding --json

# Step 7: Exit if rate falls below threshold or reverses
pacifica positions close ETH-USDC-PERP --json
```

## Funding Settlement Schedule

Funding on Pacifica settles every 8 hours. Plan position duration around settlements:
- If entering 1 hour before settlement, you capture 1 settlement immediately.
- Holding for 24 hours captures 3 settlements.

## Break-Even Stop-Loss Calculation

The stop-loss should be set so that the maximum loss at the stop equals the total
expected funding yield over the planned holding period.

Example: 1000 USD position, 0.002 funding rate, 3 settlements planned:
- Expected funding yield = 1000 * 0.002 * 3 = $6.00
- Stop-loss should be set no more than $6.00 adverse from entry price
  (at leverage 2x on $1000 notional, that is 0.6% adverse move)

## Risks

- **Directional price risk**: Funding collection does not hedge your price exposure.
  A 3% move against you at 2x leverage produces a $60 loss versus $6 in expected
  funding — 10x the yield.
- **Rate reversal**: The rate can fall to zero or reverse between settlements.
  Always confirm `nextFundingRate` before entering.
- **Crowded trade**: When rates are very high, many traders take the same side. This can
  itself cause the rate to revert quickly.

## Notes

- The break-even stop placement is tight. This trade is high-risk relative to its yield
  unless you hold for many settlements. Only hold long-duration when the rate is sustained
  and your directional view supports the position independently.
- Combine with `funding-monitor` to get alerted when the rate approaches the exit threshold.
