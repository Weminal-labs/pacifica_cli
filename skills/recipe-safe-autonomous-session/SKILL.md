---
name: pacifica-recipe-safe-autonomous-session
version: 1.0.0
description: Full setup for a supervised autonomous agent session with all safety guards active before any trading begins
category: recipe
requires:
  commands: [positions, orders, funding, intelligence, leaderboard, trade, journal, alerts]
  skills:
    - pacifica-shared
    - drawdown-circuit-breaker
    - dead-man-switch
    - alert-on-liquidation-risk
    - snapshot-before-trade
    - simulate-first
    - validate-before-live
    - risk-check-before-trade
    - journal-trade
    - emergency-flatten
  auth_required: true
  dangerous: true
---

# Recipe: Safe Autonomous Session

## Purpose
Establish the complete safety infrastructure needed before letting an agent trade
autonomously. This recipe does not define a trading strategy — it defines the
preconditions and guardrails that must be in place for any strategy to run responsibly.

Run this recipe at the start of every autonomous session. It takes 10–15 minutes to
set up. Never skip it to save time. The cost of a missed safety guard vastly exceeds
the cost of 10 minutes of setup.

## Required Skills

1. `pacifica-shared` — conventions and safety invariants
2. `drawdown-circuit-breaker` — hard P&L stop
3. `dead-man-switch` — heartbeat monitoring
4. `alert-on-liquidation-risk` — per-position price alerts
5. `emergency-flatten` — rapid exit capability
6. `snapshot-before-trade` — baseline account state
7. All individual trade skills (simulate-first, validate-before-live, risk-check)

## Pre-Session Checklist

Complete every item before starting the agent:

- [ ] Daily loss limit defined and written down
- [ ] Heartbeat timeout defined (recommended: 300 seconds)
- [ ] Liquidation alert levels calculated for all existing positions
- [ ] Emergency flatten procedure tested (dry-run on paper)
- [ ] Agent strategy fully specified — no ambiguity about entry/exit rules
- [ ] All safety processes started before the trading agent starts

## Full Setup Workflow

### Step 1: Define Session Parameters

Before running any commands, decide and record:

```
DAILY_LOSS_LIMIT: $200 (absolute USD)
HEARTBEAT_TIMEOUT: 300 seconds
SESSION_DURATION: 4 hours
MAX_POSITION_SIZE: $500 per trade
MAX_TOTAL_EXPOSURE: $1500
STRATEGY: Copy top-rep trader at 0.05x multiplier
```

### Step 2: Account Baseline Snapshot

```bash
# Capture starting state
pacifica positions --json   # record as SESSION_START_POSITIONS
pacifica orders --json      # record as SESSION_START_ORDERS
pacifica journal --weekly --json  # record today's opening P&L
```

### Step 3: Start Liquidation Alerts

For each existing position, calculate and set the early-warning price level.

```bash
# List positions
pacifica positions --json

# For each position, add an alert
# Long example: entry $3200, liq $2560, 20% buffer = alert at $3072
pacifica alerts add --symbol ETH-USDC-PERP --below 3072 --json

# Start alerts daemon in Terminal 1
pacifica alerts check --daemon --interval 120
```

### Step 4: Start Drawdown Circuit Breaker

In Terminal 2, start the circuit breaker monitoring loop. This runs independently and
halts all trading if the daily loss limit is hit.

```bash
# Terminal 2 — circuit breaker loop
# Poll every 5 minutes. If cumulative daily loss exceeds DAILY_LOSS_LIMIT:
#   pacifica orders cancel-all --json
#   pacifica positions --json  (then close each)

# Reference commands:
pacifica journal --weekly --json        # realised P&L check
pacifica positions --json               # unrealised P&L check
```

### Step 5: Start Heartbeat Watchdog

In Terminal 3, start the dead man's switch watchdog. The active agent must write to
`~/.pacifica/heartbeat` on every iteration.

```bash
# Terminal 3 — heartbeat watchdog
# Every 60s: read ~/.pacifica/heartbeat and compare to current time
# If last write > HEARTBEAT_TIMEOUT seconds ago:
#   pacifica orders cancel-all --json
#   (optional: flatten positions)
```

### Step 6: Verify All Guards Are Running

Before starting the trading agent, confirm:

```bash
# All three should show active processes
# Terminal 1: alerts daemon — watching for liquidation-risk price levels
# Terminal 2: circuit breaker — watching daily P&L
# Terminal 3: heartbeat watchdog — watching agent liveness
```

### Step 7: Start the Trading Agent

Only after all three guards are confirmed running, start the trading strategy.

```bash
# Terminal 4 — trading agent
# Example: copy watch session
pacifica copy watch <address> --multiplier 0.05 --interval 60

# The agent must write its heartbeat on each cycle:
# date -u +"%Y-%m-%dT%H:%M:%SZ" > ~/.pacifica/heartbeat
```

### Step 8: Active Supervision

During the session, check every 30 minutes:

```bash
# Current P&L status
pacifica positions --json
pacifica journal --weekly --json

# Agent liveness
cat ~/.pacifica/heartbeat  # should be within last 5 minutes

# Safety guard status
pacifica alerts list --json   # all alerts should still be active
```

### Step 9: Clean Shutdown

Stop guards in reverse order: trading agent first, then watchdog, then circuit breaker,
then alerts daemon.

```bash
# Terminal 4: Stop trading agent (Ctrl+C)
# Terminal 3: Stop heartbeat watchdog (Ctrl+C)
# Terminal 2: Stop circuit breaker (Ctrl+C)
# Terminal 1: Stop alerts daemon (Ctrl+C)

# Final account review
pacifica positions --json
pacifica orders --json
pacifica journal --weekly --json
```

## Emergency Protocols

### If circuit breaker fires:
1. Confirm the trigger was legitimate (check the daily P&L calculation)
2. Do NOT restart immediately — investigate why the limit was hit
3. If trading resumes, restart all guards from Step 3

### If dead man's switch fires:
1. Diagnose why the agent stopped writing its heartbeat
2. Review positions for any unexpected state
3. Fix the agent or restart it with a fresh session from Step 1

### If agent produces unexpected output:
1. Stop the agent
2. Run `pacifica positions --json` and `pacifica orders --json`
3. Resolve any unexpected positions before restarting

## Notes

- This recipe is designed for tmux with four panes. Use `tmux new-session` and split
  into four windows before starting.
- The heartbeat mechanism requires the trading agent to be written to support it.
  A standard copy watch session does not write a heartbeat — you must wrap it in
  a shell loop that writes the heartbeat file on each iteration.
- All session logs should be captured: `pacifica copy watch <addr> | tee session.log`
- Review session logs after every autonomous session to improve the strategy.
