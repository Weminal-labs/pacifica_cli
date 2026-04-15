---
name: pacifica-emergency-flatten
version: 1.0.0
description: Close ALL open positions and cancel ALL open orders immediately at market price
category: risk
requires:
  commands: [positions, orders]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: true
---

# Emergency Flatten

## Purpose
Close every open position and cancel every open order on your Pacifica account in the
shortest possible time. Use this when:

- A strategy is behaving unexpectedly and you need to stop all exposure immediately.
- You are approaching a liquidation level and need to exit before the engine does it for you.
- A network or infrastructure issue requires you to go flat before going offline.
- Any scenario where holding positions open is more dangerous than the cost of market exits.

**This skill is irreversible.** Once positions are closed and orders cancelled, they
cannot be reopened automatically. You will incur market impact and fees on every close.

## Steps

1. Fetch all open positions and all open orders — log the full state before acting.
2. Cancel all open orders first to prevent any pending orders from opening new positions.
3. Close each open position at market price, one by one.
4. Verify the positions list is empty after closing.
5. Verify the orders list is empty.

## Commands

```bash
# Step 1a: Snapshot all open positions BEFORE acting
pacifica positions --json

# Step 1b: Snapshot all open orders BEFORE acting
pacifica orders --json

# Step 2: Cancel ALL open orders
pacifica orders cancel-all --json

# Step 3: Close each position at market
# Repeat for each symbol returned in Step 1a
# Replace ETH-USDC-PERP with actual symbol from positions output
pacifica positions close ETH-USDC-PERP --json
pacifica positions close BTC-USDC-PERP --json
pacifica positions close SOL-USDC-PERP --json

# Step 4: Confirm all positions are closed
pacifica positions --json

# Step 5: Confirm all orders are cancelled
pacifica orders --json
```

## Automation Note

When running this as an agent, iterate over the `data` array from `pacifica positions --json`
and call `pacifica positions close <symbol>` for each entry's `symbol` field. Do not
batch — execute closes sequentially to avoid race conditions with the exchange.

```bash
# Pattern for agent iteration:
# For each position in positions JSON output:
#   pacifica positions close <position.symbol> --json
```

## Risks

- **Market impact**: Closing large positions at market during illiquid hours may result
  in significant slippage.
- **Partial fills**: If a close order is only partially filled due to exchange issues,
  the position may remain open at a smaller size. Re-run `pacifica positions --json` to
  confirm full closure.
- **Fee accumulation**: Multiple market closes incur taker fees on each. In a large
  portfolio, the total fee cost may be notable.

## Notes

- Always log the pre-flatten state (steps 1a and 1b) before taking action. This is your
  audit trail for what was open, at what prices, and what P&L you realised.
- Do not use this skill as a routine exit mechanism. It is designed for emergencies.
  For planned exits, use `pacifica positions close <symbol>` individually with
  careful timing.
- After flattening, run `pacifica journal --limit 10 --json` to review what closed
  and at what prices.
