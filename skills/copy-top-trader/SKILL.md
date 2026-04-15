---
name: pacifica-copy-top-trader
version: 1.0.0
description: Copy the live positions of the highest-reputation trader on Pacifica
category: copy-trading
requires:
  commands: [leaderboard, copy]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: true
---

# Copy Top Trader

## Purpose
Identify the trader with the highest all-time P&L and reputation score on the Pacifica
leaderboard, then start a copy-watch session against their address. Use this when you
want hands-off exposure to the platform's best performer with automatic position mirroring.

This skill is **dangerous**. It places real market orders without per-trade confirmation
when `--auto` is enabled. Only run it when you have sufficient margin and understand the
risks of following another trader blindly.

## Steps

1. Fetch the leaderboard limited to 1 result to identify the top trader's address.
2. Inspect the JSON output — confirm the trader's `overall_rep_score` is at or above 70.
3. If the score is below 70, abort. The top-ranked trader may have low reputation. In that
   case use the `copy-watch-filtered` skill instead.
4. Extract the `trader_id` field from the JSON.
5. Start a copy-watch session against that address with a conservative multiplier.
6. Monitor the session for at least 10 minutes before leaving it unattended.

## Commands

```bash
# Step 1: Fetch the #1 trader
pacifica leaderboard --limit 1 --json

# Expected output shape:
# [{ "rank": 1, "trader_id": "0xabc...", "overall_rep_score": 84, ... }]

# Step 2: (After extracting trader_id from step 1 output)
# Replace <address> with the trader_id value from step 1
pacifica copy watch <address> --multiplier 0.1 --json

# Step 3: To enable auto-copy without per-trade prompts (use with care)
pacifica copy watch <address> --multiplier 0.1 --auto
```

## Parameters

- `--multiplier` (0.001–1.0): Fraction of the watched trader's position size to copy.
  Default used here: `0.1` (10%). Increase only after confirming the session behaves
  as expected.
- `--auto`: Removes per-trade confirmation prompts. Only enable once you have verified
  the address and are comfortable with the trader's style.
- `--interval <s>`: Poll frequency in seconds. Default: 60. Minimum: 10.

## Risks

- **Slippage and latency**: Copied trades execute after the watched trader has already
  entered. Entry price will differ; in fast markets this gap can be significant.
- **Over-leveraging**: If the trader uses high leverage and you replicate their size at
  1x multiplier, your margin requirements grow proportionally.
- **Trader changes strategy**: Past performance shown on the leaderboard does not
  guarantee the trader continues to perform the same way.
- **Auto-copy mode**: With `--auto` enabled, orders execute without review. A single bad
  trade by the watched trader is copied immediately.

## Notes

- Run `pacifica copy list` to see recently watched addresses and resume a previous session.
- The copy session is foreground. Use tmux or a dedicated terminal window.
- Confirm your available margin with `pacifica positions` before starting.
- If the watch session errors, positions already copied remain open. Use
  `pacifica positions` to review your state.
