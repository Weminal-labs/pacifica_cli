---
name: pacifica-risk-check-before-trade
version: 1.0.0
description: Run a comprehensive risk assessment — leverage, margin, liquidation, and concentration — before entering any live trade
category: safety
requires:
  commands: [positions, simulate, funding]
  skills: [pacifica-shared, snapshot-before-trade]
  auth_required: true
  dangerous: false
---

# Risk Check Before Trade

## Purpose
Perform a structured risk assessment before placing a live trade. This is distinct from
simulation (which calculates liquidation mechanics) — the risk check evaluates the
trade in the context of your entire account: total leverage, position concentration,
correlation between open positions, and funding drag.

This skill is read-only. It does not place orders.

## Steps

1. Snapshot all open positions and calculate total current exposure.
2. Simulate the proposed new trade to get liquidation price and margin requirement.
3. Calculate what the total account leverage would be after adding the new trade.
4. Assess position concentration: what percentage of total capital goes to this market.
5. Check funding rate — will this position pay or receive, and what is the annualised cost.
6. Confirm the proposed stop-loss creates an acceptable risk-reward ratio.
7. Return a risk summary: Green (proceed), Yellow (proceed with caution), Red (do not proceed).

## Commands

```bash
# Step 1: Get all open positions and calculate total notional
pacifica positions --json

# Step 2: Simulate the proposed trade
pacifica simulate long ETH-USDC-PERP 500 --leverage 5 --json

# Expected simulate output:
# {
#   "symbol": "ETH-USDC-PERP",
#   "entryPrice": 3200.00,
#   "liquidationPrice": 2560.00,
#   "marginRequired": 100.00,
#   "fundingRateApr": "+65.7%",
#   "scenarios": [...]
# }

# Step 3: Get funding rate for the target market
pacifica funding --json
# Filter for ETH-USDC-PERP — check fundingRate and nextFundingRate

# Step 4: Get current portfolio exposure
pacifica positions --json
```

## Risk Assessment Framework

Calculate each metric from the fetched data and apply the thresholds:

### Total Account Leverage

```
total_notional = sum of all position notionals (from positions JSON)
new_notional = proposed trade notional
account_equity = total_notional / current_leverage  (approximate)
proposed_leverage = (total_notional + new_notional) / account_equity
```

| Total leverage | Rating |
|---|---|
| <= 3x | Green |
| 3x–6x | Yellow |
| > 6x | Red — do not proceed |

### Market Concentration

```
concentration = new_notional / total_capital
```

| Concentration | Rating |
|---|---|
| <= 20% | Green |
| 20%–40% | Yellow |
| > 40% | Red — too concentrated |

### Liquidation Buffer

```
liq_buffer = abs(liquidation_price - entry_price) / entry_price
```

| Buffer | Rating |
|---|---|
| >= 15% | Green |
| 10%–15% | Yellow |
| < 10% | Red — liquidation too close |

### Funding Cost

```
funding_apr = abs(funding_rate * 3 * 365 * 100)
```

| Funding APR | Rating |
|---|---|
| <= 20% | Green — acceptable carry |
| 20%–60% | Yellow — monitor |
| > 60% | Red — consider if direction favours collection |

## Risk Rating Logic

- All Green: proceed.
- Any Red: do not proceed. Address the specific factor first.
- Yellow only: proceed with reduced size (cut proposed notional by 50%).

## Notes

- This skill is most useful for agents that need a systematic gate before executing.
  Run it after `snapshot-before-trade` and before `validate-before-live`.
- The risk check assumes isolated margin mode. In cross-margin mode, liquidation
  mechanics differ — the `simulate` output may not reflect your actual liquidation price.
