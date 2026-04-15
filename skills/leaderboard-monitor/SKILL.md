---
name: pacifica-leaderboard-monitor
version: 1.0.0
description: Watch the leaderboard continuously for rank changes, rising stars, and new position openings
category: copy-trading
requires:
  commands: [leaderboard]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Leaderboard Monitor

## Purpose
Run a continuous leaderboard watch that highlights when traders change rank, when
1D P&L spikes relative to their 7D (rising signal), or when a consistently-profitable
trader opens a new position. Use this as a discovery mechanism to find copy targets
or to understand what the top performers are doing right now.

This skill is read-only. It does not place orders.

## Steps

1. Start the leaderboard in watch mode for continuous delta tracking.
2. Observe rank changes and 1D P&L deltas across refresh cycles.
3. When a trader shows a strong rising signal (1D P&L > 25% of their 7D), note their
   address for further screening.
4. Run a focused `--live` fetch on the top 5 to see what positions they currently hold.
5. Pass the best candidate to `reputation-screen` before copying.

## Commands

```bash
# Step 1: Start leaderboard watch — refreshes every 30s with delta highlighting
pacifica leaderboard --watch --limit 15

# Step 2: Filter for rising traders only (1D P&L > 25% of 7D)
pacifica leaderboard --filter rising --limit 20 --json

# Step 3: Filter for consistently profitable traders
pacifica leaderboard --filter consistent --limit 20 --json

# Step 4: Check live positions of the top 5 traders
pacifica leaderboard --live --limit 5 --json

# Step 5: One-shot full snapshot for agent parsing
pacifica leaderboard --limit 20 --json
```

## Filter Modes

| Filter | What it selects |
|---|---|
| `rising` | Traders where 1D P&L > 25% of 7D P&L and 1D P&L is positive — they are on a run |
| `falling` | Traders where 1D P&L is negative — momentum broken |
| `consistent` | Traders where at least 3 of 4 timeframes (1D, 7D, 30D, all-time) are positive |

## Signal Interpretation

When watching the leaderboard, pay attention to:

- **Δ1D column**: The change in 1D P&L since the last 30-second tick. A sudden large
  positive delta means the trader just closed a profitable position.
- **Rank movement**: Rapid rank improvement from outside the top 5 into the top 3
  indicates a breakout performance worth investigating.
- **Live positions**: A trader holding multiple positions across different markets
  suggests a high-conviction macro view.

## Notes

- `--watch` and `--json` are mutually exclusive. Use `--watch` for human monitoring
  and `--json` for agent parsing (one-shot).
- The watch mode uses ANSI screen clearing. It is intended for terminal use, not for
  piping to a file.
- Leaderboard data has a 15–30 minute lag from the chain. Use it for trend discovery,
  not for real-time position tracking.
- For real-time position tracking of a specific trader, switch to `pacifica copy watch
  <address>` which polls positions directly every 60 seconds.
