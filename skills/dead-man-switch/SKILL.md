---
name: pacifica-dead-man-switch
version: 1.0.0
description: Cancel all open orders and optionally flatten positions if the agent process goes silent for too long
category: risk
requires:
  commands: [orders, positions]
  skills: [pacifica-shared, emergency-flatten]
  auth_required: true
  dangerous: true
---

# Dead Man's Switch

## Purpose
Protect your account when an autonomous agent session loses connectivity or crashes
without executing a clean shutdown. The dead man's switch works by requiring the agent
to "check in" on a regular heartbeat interval. If no check-in arrives within the
timeout window, it assumes the agent has failed and cancels all orders — and optionally
flattens all positions.

Use this whenever you run a copy-watch, arb bot, or any other autonomous session that
may leave open orders if it crashes unexpectedly.

## How It Works

The switch monitors a timestamp file at `~/.pacifica/heartbeat`. The active agent must
update this file on every iteration of its main loop. A separate watchdog process
reads the file and compares the last-modified time against the timeout threshold.
If the threshold is exceeded, the watchdog executes the emergency action.

## Steps

1. Before starting an autonomous session, create the heartbeat file.
2. Start the watchdog in a separate terminal. It will poll the heartbeat file.
3. Run your autonomous session. The session must write to the heartbeat file at least
   once per poll cycle.
4. If the session crashes, the watchdog detects the missed heartbeat and cancels orders.
5. When you stop the session intentionally, stop the watchdog first, then the session.

## Commands

```bash
# Step 1: Initialise the heartbeat file (the active agent does this each cycle)
# Agent writes current ISO timestamp to ~/.pacifica/heartbeat on each tick
# Example shell command the agent should run each cycle:
date -u +"%Y-%m-%dT%H:%M:%SZ" > ~/.pacifica/heartbeat

# Step 2: Watchdog check — compare last modified time
# Run this on an interval (e.g. every 60s) from a separate process:
pacifica orders --json   # read and store for comparison
pacifica positions --json  # read and store for comparison

# Step 3: When heartbeat is stale (exceeded timeout), cancel all orders first
pacifica orders cancel-all --json

# Step 4: If configured to flatten on timeout:
pacifica positions --json
# Iterate and close each position:
pacifica positions close <symbol> --json

# Step 5: Confirm clean state
pacifica orders --json
pacifica positions --json
```

## Configuration

| Parameter | Default | Description |
|---|---|---|
| Heartbeat file | `~/.pacifica/heartbeat` | Path to the timestamp file the agent writes |
| Timeout | 300 seconds | Max silence before triggering |
| Action on trigger | Cancel orders only | Set to "flatten" to also close positions |
| Poll interval | 60 seconds | How often the watchdog checks the heartbeat |

## Risks

- **False positives**: A slow API response during a normal agent cycle may cause the
  heartbeat to be delayed. Use a conservative timeout (5+ minutes) to reduce false triggers.
- **Watchdog failure**: If the watchdog process itself crashes, there is no protection.
  Run the watchdog under a process supervisor.
- **Partial execution**: If the cancel-all or position close commands fail due to API
  issues, orders and positions remain open. The watchdog should retry on the next cycle.

## Notes

- This skill is a framework/pattern, not a self-contained executable. Implement the
  heartbeat write in your agent's main loop and the watchdog check as a cron or
  background script.
- For simpler deployments, the `drawdown-circuit-breaker` skill running on its own
  poll cycle provides similar protection focused on losses. Use both together for
  maximum resilience.
- Always test the dead man's switch by simulating a crash (kill the agent process) in
  a paper-trading or testnet environment before running it on mainnet.
