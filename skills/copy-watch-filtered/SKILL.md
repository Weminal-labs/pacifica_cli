---
name: pacifica-copy-watch-filtered
version: 1.0.0
description: Copy only traders whose reputation score is at or above a configurable minimum
category: copy-trading
requires:
  commands: [leaderboard, copy]
  skills: [pacifica-shared, reputation-screen]
  auth_required: true
  dangerous: true
---

# Copy Watch Filtered

## Purpose
Screen the Pacifica leaderboard for traders that meet a minimum reputation threshold
and optionally a minimum 7-day P&L, then start a copy-watch session against the best
candidate. Unlike `copy-top-trader`, this skill prioritises quality over rank — rank
#1 on the leaderboard may still have a low reputation score.

Use this skill when you want a copy session that is backed by a documented track record
rather than a short-term all-time P&L spike.

## Steps

1. Fetch the top 20 traders from the leaderboard.
2. Filter for traders whose `overall_rep_score` is >= 80.
3. Among those, prefer traders where `onchain.pnl_7d` is positive (they are currently
   performing, not just coasting on historical gains).
4. Confirm the winning candidate has at least one open position by running
   `pacifica leaderboard --live --limit 5 --json`. Copying a flat trader does nothing.
5. Start a copy-watch session against the selected address with `--multiplier 0.05`
   as a safe starting point.

## Commands

```bash
# Step 1: Fetch top 20 traders
pacifica leaderboard --limit 20 --json

# Step 2: Re-run with --filter to pre-screen
pacifica leaderboard --limit 20 --filter consistent --json

# Step 3: Check who has live positions (top 5 only — API limitation)
pacifica leaderboard --limit 5 --live --json

# Step 4: Start copy-watch on the selected address
# Replace <address> with the trader_id chosen after screening
pacifica copy watch <address> --multiplier 0.05 --interval 30 --json
```

## Parameters

- `--multiplier` (0.001–1.0): Start at `0.05` for a new trader. Raise to `0.1` only
  after 20+ confirmed successful copies.
- `--filter consistent`: Pre-filters traders where at least 3 of 4 P&L timeframes
  (1D, 7D, 30D, all-time) are positive. This is a strong quality signal.
- `--interval <s>`: How often to poll positions. Default 60 s. Set to 30 s if you
  want faster signal capture but are OK with higher API call volume.
- `min-rep` (configuration): The reputation floor. This skill uses 80 as default.
  Adjust the filter step accordingly if you want a different threshold.

## Risks

- **Fewer candidates**: A high reputation floor may leave zero matching traders.
  Fall back to `copy-top-trader` with cautious multiplier if no candidates pass.
- **Live position check is limited to top 5**: The `--live` flag only fetches
  positions for the top 5 ranked traders. Traders ranked 6–20 cannot be verified
  as actively holding positions without a separate API call.
- **Position size unknown**: The watched trader's position size is fetched each poll
  cycle. Between polls, the trader may have significantly increased or decreased size.

## Notes

- Use `pacifica copy list` after stopping a session to review the history.
- Combine with `drawdown-circuit-breaker` skill to automatically halt if your account
  losses exceed a set threshold during the copy session.
- Leaderboard data refreshes from the chain. There may be a 15–30 minute lag between
  on-chain activity and leaderboard rank changes.
