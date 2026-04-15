---
name: pacifica-recipe-daily-routine
version: 1.0.0
description: Morning agent routine — check positions, review P&L, scan leaderboard, check patterns, and update journal
category: recipe
requires:
  commands: [positions, journal, leaderboard, intelligence, funding, alerts]
  skills:
    - pacifica-shared
    - daily-pnl-report
    - leaderboard-monitor
    - funding-monitor
    - journal-trade
  auth_required: true
  dangerous: false
---

# Recipe: Daily Routine

## Purpose
Run a structured morning review of your account and the market before making any
trading decisions for the day. This routine takes 5–10 minutes and surfaces the
information you need to set context: where are your positions, how did yesterday go,
who is performing on the leaderboard, and are there any active intelligence signals
worth acting on today.

This recipe is entirely read-only. It does not place orders.

## Required Skills

1. `pacifica-shared` — CLI conventions
2. `daily-pnl-report` — yesterday's P&L summary
3. `leaderboard-monitor` — top trader activity
4. `funding-monitor` — rate environment
5. `journal-trade` — trade history review

## Full Workflow

### Step 1: Account State Check (1 minute)

```bash
# Open positions
pacifica positions --json

# Open orders (anything resting from yesterday)
pacifica orders --json
```

Flag any positions that are close to liquidation or where the original thesis is stale.
Flag any limit orders that have been open for more than 24 hours without filling.

### Step 2: P&L Review (2 minutes)

```bash
# Yesterday's realised P&L
pacifica journal --weekly --json

# Most recent 10 trades
pacifica journal --limit 10 --json
```

Extract from the output:
- Yesterday's bucket: `pnl`, `fees`, `trades`, `wins`
- Net realised P&L (pnl - fees)
- Win rate for yesterday
- Running 7-day cumulative P&L

### Step 3: Market Environment (2 minutes)

```bash
# Funding rates across all markets
pacifica funding --json
```

Note any markets with `abs(fundingRate) >= 0.001` — these may be actionable today.
Note any markets where you hold a position and check whether funding is working for
or against you.

### Step 4: Intelligence Signals (2 minutes)

```bash
# Run the pattern engine
pacifica intelligence run --json
```

Review the `signals` array. For each signal:
- Is the market one you know well?
- Is the win rate >= 0.60 and fullMatch true?
- Does the funding rate environment support the signal direction?

Note the top 1–2 signals as candidates for today's trades if you intend to trade.

### Step 5: Leaderboard Scan (2 minutes)

```bash
# Check top performers with live positions
pacifica leaderboard --limit 10 --filter rising --json
pacifica leaderboard --limit 5 --live --json
```

Note any traders who are on a strong run today (rising filter) or who have recently
opened large positions (live filter).

### Step 6: Alerts Review (1 minute)

```bash
# Check all active alerts against current prices
pacifica alerts check --all --json
```

Review which alerts are triggered and which are still pending. Remove alerts for
positions that no longer exist.

## Daily Summary Template

After running all steps, produce a brief written summary in this format:

```
Date: 2026-04-14

POSITIONS
- ETH-USDC-PERP LONG $500 @ $3200 — unrealised: +$12
- No other open positions

YESTERDAY
- Realised P&L: +$84 (fees: -$4.20, net: +$79.80)
- 2 trades, 2 wins (100% win rate)
- 7-day cumulative: +$341

MARKET ENVIRONMENT
- ETH funding: +0.0003 (mild positive — paying long, collecting short)
- No extreme funding rates today

SIGNALS
- ETH-USDC-PERP LONG — "High Funding Long Reversal" — 72% win rate, fullMatch
- SOL-USDC-PERP SHORT — partial match only, skip

LEADERBOARD
- 3 traders flagged as rising today
- Top trader (rep 87) holds LONG ETH + LONG SOL

ACTION ITEMS
- ETH long position: thesis intact, hold
- ETH intelligence signal aligns with existing position — do not add (already exposed)
- SOL signal partial match only — pass today
```

## Notes

- Run this routine before opening any new positions each day.
- The routine is also useful as an end-of-day wrap-up — run the same commands and
  produce a closing summary instead of an opening one.
- If you miss a day, run `pacifica journal --monthly --json` to get the weekly buckets
  for context on the full period since your last review.
