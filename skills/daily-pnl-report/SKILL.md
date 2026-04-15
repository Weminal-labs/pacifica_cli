---
name: pacifica-daily-pnl-report
version: 1.0.0
description: Generate a structured daily P&L summary from the trade journal
category: reporting
requires:
  commands: [journal, positions, intelligence]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: false
---

# Daily P&L Report

## Purpose
Produce a concise end-of-day summary covering realised P&L from closed trades, current
unrealised P&L from open positions, fee costs, and a brief assessment of how the day
compared to your intelligence profile benchmarks. Run this at the end of each trading
session to maintain situational awareness and build a historical record.

This skill is read-only. It does not place orders.

## Steps

1. Fetch the weekly journal breakdown to see today's realised P&L.
2. Fetch open positions to get current unrealised P&L.
3. Fetch your intelligence profile to compare today against your historical win rate.
4. Calculate total day P&L = realised + unrealised.
5. Produce a structured summary.

## Commands

```bash
# Step 1: Today's realised P&L (use --weekly for daily breakdown)
pacifica journal --weekly --json

# Expected output shape — array of daily buckets:
# [
#   {
#     "label": "2026-04-14",
#     "pnl": 142.50,
#     "fees": 8.20,
#     "trades": 3,
#     "wins": 2
#   }
# ]

# Step 2: Current unrealised P&L from open positions
pacifica positions --json

# Step 3: Personal intelligence profile for context
pacifica intelligence me --json

# Step 4: Recent trade list for the entry log
pacifica journal --limit 10 --json
```

## Report Structure

Assemble the report in this format after fetching all JSON:

```
Date: 2026-04-14
Realised P&L:    +$142.50
Fees paid:         -$8.20
Net realised:    +$134.30
Unrealised P&L:   -$22.00
Total day P&L:   +$112.30

Trades:  3  (2 wins, 1 loss)  Win rate: 67%
Your all-time win rate: 61%  — Today: above average

Open positions: ETH-USDC-PERP LONG (unrealised: -$22.00)
```

## Parameters

- `--weekly`: Produces daily buckets for the last 7 days. Use the bucket whose `label`
  matches today's date for the daily realised figure.
- `--monthly`: Produces weekly buckets for the last 30 days. Use for weekly summaries.
- `--symbol <sym>`: Filter to a specific market if you want per-market breakdowns.

## Notes

- The journal only reflects settled (closed) trades. Unrealised P&L comes from the
  positions command. Always include both for a complete picture.
- Fees are shown in the journal response. Track them separately — fee drag is the
  most underestimated performance killer in active trading.
- Use this report to identify patterns in your own behaviour: which days of the week
  perform best, which markets you over-trade, and whether your live win rate tracks
  your historical intelligence profile.
- Store daily report snapshots in a local file if you want trend analysis over time.
  Append the JSON output from each run to a `~/.pacifica/daily-reports.jsonl` file.
