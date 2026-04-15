---
name: pacifica-whale-follow
version: 1.0.0
description: Detect and follow large position changes from top leaderboard traders
category: copy-trading
requires:
  commands: [leaderboard, copy]
  skills: [pacifica-shared, reputation-screen, snapshot-before-trade]
  auth_required: true
  dangerous: true
---

# Whale Follow

## Purpose
Monitor the live positions of the top-ranked traders (whales) and enter a small
position in the same direction when a whale opens or significantly increases theirs.
This is a reactive signal strategy — you are following the informed capital rather than
predicting moves independently.

Whale following requires fast reaction. The skill is designed to identify the move
quickly after it appears in the position feed, not to front-run it.

## Steps

1. Fetch the top 5 traders by all-time P&L using `--live` to see their current positions.
2. Apply the reputation screen — only follow traders with `overall_rep_score >= 70`.
3. Watch for position changes by polling the top 5 every 60 seconds.
4. When a whale opens a new position or materially increases an existing one, evaluate
   the trade direction against the current market context.
5. If the direction aligns with the intelligence engine signal (or is at least neutral),
   enter a small position in the same direction.
6. Size conservatively: no more than 10% of the whale's estimated notional.

## Commands

```bash
# Step 1: Fetch top 5 with live positions
pacifica leaderboard --limit 5 --live --json

# Expected output per trader (relevant fields):
# {
#   "trader_id": "0xabc...",
#   "overall_rep_score": 82,
#   "current_positions": "LONG ETH, SHORT BTC",
#   "onchain": { "pnl_1d": 1200, ... }
# }

# Step 2: Start copy watch on the highest-rep trader among the top 5
pacifica copy watch <address> --multiplier 0.1 --interval 60 --json

# Step 3: For a specific large position entry (manual follow)
# After observing the whale's direction from step 1:
pacifica snapshot-before-trade  # (run snapshot-before-trade skill)
pacifica simulate long ETH-USDC-PERP 300 --leverage 2 --json
pacifica trade buy ETH-USDC-PERP 300 --leverage 2 --sl 3000 --validate --json
pacifica trade buy ETH-USDC-PERP 300 --leverage 2 --sl 3000 --json
```

## Signal Quality Criteria

Only follow a whale move if:

| Criterion | Requirement |
|---|---|
| Trader reputation score | >= 70 |
| Trader 7D P&L | Positive |
| Position change type | New open, not just size increase on stale position |
| Intelligence engine alignment | Signal direction matches, or neutral |
| Market liquidity | Normal spread (not during low-liquidity hours) |

## Risks

- **Stale position data**: The live position fetch has a 15–30 minute chain lag. By the
  time you see a new whale position, the optimal entry may have passed.
- **False signal from reduce-only**: A position that appears new may be the whale
  re-entering after a partial close. Always check if the position existed in the previous
  snapshot before treating it as a new signal.
- **Correlated losses**: If the whale is wrong, you lose in the same direction at the
  same time. Do not use whale-follow as your primary strategy — it should complement
  your own analysis.
- **Copy watch timing delay**: `pacifica copy watch` polls every 60 seconds minimum.
  Fast whale moves can be entered and exited within that window.

## Notes

- The `--live` flag on leaderboard only fetches positions for the top 5 traders. To
  follow a trader ranked 6–20, use `pacifica copy watch <address>` directly.
- Use a tight stop-loss when whale-following. If the whale exits quickly, the position
  may not be what it appears.
