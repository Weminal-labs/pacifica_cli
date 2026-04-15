---
name: pacifica-reputation-screen
version: 1.0.0
description: Screen and score Pacifica traders by reputation before copying or following them
category: copy-trading
requires:
  commands: [leaderboard, intelligence]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Reputation Screen

## Purpose
Evaluate traders on the Pacifica leaderboard using multiple quality signals before
deciding to copy or follow any of them. Raw leaderboard rank is based on all-time P&L
which can be misleading — a trader may have a large all-time number from one lucky run
while their recent performance and win rate are poor.

This skill is read-only. It gathers, scores, and reports without placing any orders.

## Steps

1. Fetch the top 20 traders with full leaderboard data.
2. Filter out traders with `overall_rep_score` below 70.
3. Among the remaining traders, apply secondary filters: positive 7D P&L and win rate
   above 55%.
4. Cross-reference with the intelligence reputation view for enriched pattern accuracy data.
5. Rank the survivors and present the top 3 candidates with a rationale for each.

## Commands

```bash
# Step 1: Fetch top 20 traders
pacifica leaderboard --limit 20 --json

# Step 2: Filter for consistent recent performance
pacifica leaderboard --limit 20 --filter consistent --json

# Step 3: Fetch intelligence-enriched reputation (includes pattern accuracy)
pacifica intelligence reputation --limit 20 --json

# Step 4: Check live positions for shortlisted traders
# (Only top 5 supported for live position fetch)
pacifica leaderboard --limit 5 --live --json

# Step 5: Review your own profile for comparison
pacifica intelligence me --json
```

## Scoring Model

After fetching JSON, apply this scoring model to rank candidates:

| Signal | Weight | How to evaluate |
|---|---|---|
| `overall_rep_score` | 40% | Use directly — already a composite score |
| `overall_win_rate` | 25% | Prefer >= 0.55. Penalise below 0.50 |
| `onchain.pnl_7d` positive | 20% | Binary: positive = pass, negative = fail |
| `onchain.pnl_30d` positive | 15% | Binary: positive = pass, negative = fail |

Score thresholds for copy decision:

- **Green (copy candidate)**: Combined score >= 75
- **Yellow (monitor only)**: 50–74
- **Red (skip)**: Below 50

## Output Format

When presenting results to a user, structure the output like this for each candidate:

```
Trader: 0xabc...def
Rep Score: 84
Win Rate: 61%
7D P&L: +$4,200
30D P&L: +$18,900
Recommendation: Green — copy candidate at 0.05 multiplier
```

## Notes

- Reputation scores are computed from the Pacifica intelligence store and on-chain data.
  Newly seeded or low-activity traders will have lower scores regardless of recent performance.
- The `--filter consistent` leaderboard flag provides a fast pre-screen: it passes only
  traders where at least 3 of 4 P&L timeframes (1D, 7D, 30D, all-time) are positive.
- Run this screen before starting any copy-trading session. Reassess every 7 days.
