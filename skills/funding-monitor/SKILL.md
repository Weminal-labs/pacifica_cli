---
name: pacifica-funding-monitor
version: 1.0.0
description: Monitor Pacifica funding rates and alert when any market crosses a configurable threshold
category: funding
requires:
  commands: [funding, alerts]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Funding Monitor

## Purpose
Poll funding rates across all Pacifica markets and surface any that have moved above or
below a configurable threshold. Use this to identify when a funding arb opportunity opens
up or when a position you hold is about to incur heavy funding costs.

This skill is safe — it is read-only. It does not place orders.

## Steps

1. Fetch the current funding rate snapshot for all markets.
2. Parse the JSON and identify markets where `abs(fundingRate)` exceeds the threshold
   (default: 0.001, equivalent to roughly 110% APR).
3. For persistent monitoring, set up an alert that fires when a specific market's
   funding crosses the threshold.
4. Review the alert list to confirm it is registered.
5. Optionally run the alerts daemon to get live notifications.

## Commands

```bash
# Step 1: One-shot funding snapshot for all markets
pacifica funding --json

# Expected output shape per market:
# {
#   "symbol": "ETH-USDC-PERP",
#   "fundingRate": 0.0012,
#   "nextFundingRate": 0.0009,
#   "price": 3240.50
# }

# Step 2: Add a funding-rate alert for ETH when rate exceeds 0.001
pacifica alerts add --symbol ETH-USDC-PERP --funding-above 0.001 --json

# Step 3: Add a funding-rate alert when rate drops below -0.001 (shorts pay)
pacifica alerts add --symbol ETH-USDC-PERP --funding-below -0.001 --json

# Step 4: List all active alerts
pacifica alerts list --json

# Step 5: Run one manual check cycle against live data
pacifica alerts check --all --json

# Step 6: Start the alerts daemon for continuous monitoring (foreground)
pacifica alerts check --daemon --interval 300
```

## Parameters

- `--funding-above <rate>`: Alert fires when `fundingRate >= rate`. Use `0.001` as a
  starting threshold for arb-worthy opportunities.
- `--funding-below <rate>`: Alert fires when `fundingRate <= rate`. Use `-0.001` to
  detect strong negative funding.
- `--interval <s>`: Daemon polling frequency. Default 300 s (5 minutes). Funding only
  settles every 8 hours so 5-minute polling is more than sufficient.
- `--daemon`: Run the check loop in the foreground continuously.

## APR Quick Reference

| Funding rate (8h) | APR equivalent |
|---|---|
| 0.0005 | ~55% |
| 0.001 | ~110% |
| 0.002 | ~219% |
| 0.005 | ~548% |

## Notes

- Funding rates in the JSON output are raw decimals (e.g. `0.0012` = 0.12%). Multiply
  by 100 to get a percentage.
- `nextFundingRate` is the predicted rate for the next settlement. Use it to anticipate
  whether the current rate is likely to persist.
- Alerts persist across sessions in `~/.pacifica/alerts.json`.
- For a combined funding-arb workflow, pair this skill with `funding-arb-single-venue`
  once an alert fires.
