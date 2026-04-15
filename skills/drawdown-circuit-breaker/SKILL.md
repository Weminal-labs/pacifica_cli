---
name: pacifica-drawdown-circuit-breaker
version: 1.0.0
description: Monitor daily P&L and halt all trading activity when losses exceed a set percentage threshold
category: risk
requires:
  commands: [journal, positions, orders]
  skills: [pacifica-shared, emergency-flatten]
  auth_required: true
  dangerous: true
---

# Drawdown Circuit Breaker

## Purpose
Automatically stop all trading and flatten positions when your account's daily realised
P&L loss exceeds a configurable threshold. This skill acts as a hard stop that prevents
a bad day from becoming a catastrophic one.

Run this as a monitoring loop alongside any autonomous or semi-autonomous trading
session. When the loss limit is hit, it invokes the `emergency-flatten` skill and
refuses to allow further trading until manually re-enabled.

## Steps

1. Fetch your trade journal with daily breakdown to establish today's starting P&L.
2. Set the daily loss limit (default: 5% of account equity or a fixed USD amount).
3. Poll your journal or positions on a regular interval.
4. On each poll, calculate realised + unrealised P&L for today.
5. If total daily loss exceeds the limit, trigger emergency flatten immediately.
6. Log the circuit-breaker event and stop further polling.

## Commands

```bash
# Step 1: Get today's P&L baseline from the journal
pacifica journal --weekly --json

# Step 2: Get current open position P&L (unrealised)
pacifica positions --json

# Step 3: One-shot check — if daily loss > threshold, flatten
# This is pseudocode for the agent monitoring loop:
#
#   daily_pnl = sum of today's closed trade P&L from journal
#   unrealised = sum of unrealised_pnl from positions
#   total_loss = daily_pnl + unrealised
#   if total_loss < -LIMIT_USD:
#     trigger emergency-flatten

# Step 4: Cancel all orders as first action when triggered
pacifica orders cancel-all --json

# Step 5: Close all positions
pacifica positions --json
# Then close each symbol:
pacifica positions close <symbol> --json
```

## Parameters

- `LIMIT_USD`: The absolute USD loss that triggers the circuit breaker. Example: `-250`
  means halt when you have lost $250 on the day.
- `LIMIT_PCT`: Alternative percentage-based limit. Calculate as
  `equity * LIMIT_PCT / 100`. Requires a baseline equity read from `pacifica positions`.
- Polling interval: Recommended every 60–300 seconds depending on how actively you
  are trading.

## Trigger Conditions

The circuit breaker fires when **any** of the following is true:

| Condition | Default threshold |
|---|---|
| Realised daily loss | -$250 or -5% of equity |
| Unrealised loss on any single position | -50% of position margin |
| Combined realised + unrealised loss | -$400 or -8% of equity |

Adjust thresholds to your account size and risk tolerance before enabling.

## Risks

- **False triggers**: Temporary unrealised drawdowns on positions with active stop-losses
  may trigger the breaker before the stop executes. Consider using realised-only P&L for
  the primary trigger.
- **Latency window**: There is a gap between when losses exceed the limit and when the
  flatten completes. In fast markets, losses can deepen during this window.
- **Agent failure**: If the monitoring loop crashes, the circuit breaker stops watching.
  Use a process supervisor (tmux, systemd, or a watchdog) to restart the loop automatically.

## Notes

- Always run this skill in a separate terminal or process alongside any autonomous
  session. It is a safety harness, not a strategy.
- The breaker is a one-way valve: once triggered, it logs the event and stops. You must
  manually restart a new session to resume trading after reviewing what happened.
- Keep a record of every circuit-breaker event in your trading journal. If the breaker
  fires regularly, your strategy or position sizes need adjustment.
