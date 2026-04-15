---
name: pacifica-recipe-copy-and-monitor
version: 1.0.0
description: Find a top-rep trader, screen them, copy their positions, and monitor with automatic drawdown protection
category: recipe
requires:
  commands: [leaderboard, copy, positions, journal]
  skills:
    - pacifica-shared
    - reputation-screen
    - copy-watch-filtered
    - leaderboard-monitor
    - drawdown-circuit-breaker
    - journal-trade
  auth_required: true
  dangerous: true
---

# Recipe: Copy and Monitor

## Purpose
Run a complete copy-trading session from candidate selection through to clean shutdown.
This recipe chains screening, copying, and risk monitoring into a supervised autonomous
workflow. It is the recommended approach for copy trading because it includes an
automatic drawdown gate that protects your account if the copied trader hits a losing
streak.

## Required Skills (load in order)

1. `pacifica-shared` — CLI conventions and safety invariants
2. `reputation-screen` — trader quality gate
3. `copy-watch-filtered` — copy with reputation filter
4. `drawdown-circuit-breaker` — halt on daily loss limit
5. `journal-trade` — end-of-session record

## Full Workflow

### Phase 1: Candidate Selection (10 minutes)

```bash
# 1a. Fetch top 20 with consistent filter
pacifica leaderboard --limit 20 --filter consistent --json

# 1b. Fetch intelligence reputation for enriched scores
pacifica intelligence reputation --limit 20 --json

# 1c. Check who is actively holding positions right now
pacifica leaderboard --limit 5 --live --json
```

Apply the `reputation-screen` scoring model. You need at least one candidate with:
- `overall_rep_score` >= 80
- `onchain.pnl_7d` positive
- At least one active open position (from step 1c)

Record the winning trader's `trader_id` (their on-chain address).

### Phase 2: Account Preparation

```bash
# 2a. Confirm your current positions and available margin
pacifica positions --json

# 2b. Set daily loss limit for the circuit breaker
# (Decide your limit before starting — write it down)
# Example: $150 maximum daily loss during this copy session
```

### Phase 3: Start Monitoring Infrastructure

Start the drawdown circuit breaker in a separate terminal BEFORE starting the copy watch.

```bash
# Terminal 1: Start circuit breaker monitoring loop
# Poll journal + positions every 5 minutes
# If daily loss exceeds $150 → cancel all orders + close all positions

# Reference commands for the circuit breaker loop:
pacifica journal --weekly --json          # check realised P&L
pacifica positions --json                 # check unrealised P&L
pacifica orders cancel-all --json         # if limit hit: cancel
pacifica positions close <symbol> --json  # if limit hit: close
```

### Phase 4: Start Copy Watch

```bash
# Terminal 2: Start copy watch session
# Replace <address> with trader_id from Phase 1
pacifica copy watch <address> --multiplier 0.05 --interval 60
```

Monitor the copy watch output for at least 15 minutes before leaving it unattended.
Confirm:
- Trades are being copied at the correct multiplier
- No unexpected errors in the copy output
- The first copied trade stays within expected size range

### Phase 5: Active Monitoring

During the session, run these periodically:

```bash
# Check copy history and current session state
pacifica copy list --json

# Check your current positions (should reflect copies)
pacifica positions --json

# Re-check the trader's current rep score (should not have dropped)
pacifica leaderboard --limit 20 --json
```

### Phase 6: Clean Shutdown

Stop copy watch first (Ctrl+C or kill the process), then stop the circuit breaker.

```bash
# After stopping copy watch:
# 1. Review copied positions — decide which to keep and which to close
pacifica positions --json

# 2. Journal the session outcome
pacifica journal --weekly --json
pacifica journal --limit 20 --json
```

## Session Limits

Set these before starting and do not override them during the session:

| Parameter | Recommended | Notes |
|---|---|---|
| Multiplier | 0.05 | 5% of the trader's position size |
| Daily loss limit | 5% of account equity | Hard stop for the circuit breaker |
| Session max duration | 8 hours | Reassess after each session |
| Max concurrent copied positions | 3 | Avoid correlation overload |

## Notes

- The copy watch session runs in the foreground. Use tmux so it survives terminal
  disconnections.
- Always start the circuit breaker before the copy watch, never after. There is a
  brief window between the two starts — that window is your exposure without protection.
- Reassess the trader's score weekly. A trader can fall from Green to Yellow between
  sessions without you noticing if you copy continuously.
