---
name: pacifica-alert-on-liquidation-risk
version: 1.0.0
description: Monitor open positions and alert when the maintenance margin ratio drops below a safe threshold
category: risk
requires:
  commands: [positions, alerts]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: false
---

# Alert on Liquidation Risk

## Purpose
Watch open positions and send an alert when any position's unrealised loss is approaching
the point where the maintenance margin requirement could be breached, leading to forced
liquidation. Set this up at the start of any session where you will hold positions
unattended for more than a few minutes.

This skill configures monitoring only. It does not close positions or cancel orders.
Pair it with `drawdown-circuit-breaker` or `emergency-flatten` to take automated action
when the alert fires.

## Steps

1. Fetch current open positions to identify which markets need monitoring.
2. For each position, calculate the buffer between current price and liquidation price.
3. Set an alert at a price level that is 20% of the way between the current price and
   the liquidation price (an "early warning" level).
4. Start the alerts daemon.
5. When an alert fires, assess whether to add margin, reduce size, or exit the position.

## Commands

```bash
# Step 1: Get open positions with liquidation prices
pacifica positions --json

# Expected position fields:
# {
#   "symbol": "ETH-USDC-PERP",
#   "side": "bid",
#   "entryPrice": "3200.00",
#   "markPrice": "3210.00",
#   "liquidationPrice": "2560.00",
#   "unrealisedPnl": "5.00",
#   "maintenanceMarginRatio": "0.31"
# }

# Step 2: For a long ETH position, set alert when price drops 20% toward liquidation
# Example: entry $3200, liquidation $2560, 20% buffer = $3200 - 0.20 * (3200 - 2560) = $3072
pacifica alerts add --symbol ETH-USDC-PERP --below 3072 --json

# For a short position, alert when price rises 20% toward liquidation
# Example: entry $3200, liquidation $3800, 20% buffer = $3200 + 0.20 * (3800 - 3200) = $3320
pacifica alerts add --symbol ETH-USDC-PERP --above 3320 --json

# Step 3: List all active alerts
pacifica alerts list --json

# Step 4: Run one manual check cycle
pacifica alerts check --all --json

# Step 5: Start continuous monitoring daemon (foreground)
pacifica alerts check --daemon --interval 120
```

## Alert Level Calculation

For a LONG position:

```
entry_price = position.entryPrice
liq_price = position.liquidationPrice
distance = entry_price - liq_price
early_warning = entry_price - (distance * 0.20)

Set --below early_warning
```

For a SHORT position:

```
entry_price = position.entryPrice
liq_price = position.liquidationPrice
distance = liq_price - entry_price
early_warning = entry_price + (distance * 0.20)

Set --above early_warning
```

## Response Protocol When Alert Fires

When the price alert fires, evaluate in order:

1. Is the market move temporary noise, or is the thesis broken?
2. If noise: hold, but reduce size by 25% to extend the runway.
3. If thesis broken: close the position immediately via `pacifica positions close`.
4. If uncertain: close 50% and set a new tighter alert on the remaining half.

## Notes

- Set the alert daemon polling interval to 120 seconds (2 minutes) for active positions.
  Price moves rarely require sub-minute response times in perpetual markets.
- Alerts persist in `~/.pacifica/alerts.json` across sessions. Clean up old alerts with
  `pacifica alerts remove <id>` to avoid false fires from stale price levels.
- The daemon runs in the foreground. Use tmux to keep it alive across sessions.
- For highly-leveraged positions (>5x), set the early warning at 10% of the liquidation
  buffer instead of 20% to give yourself more response time.
