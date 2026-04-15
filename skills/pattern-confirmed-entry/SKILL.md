---
name: pacifica-pattern-confirmed-entry
version: 1.0.0
description: Enter a position only when the intelligence engine confirms an active pattern signal
category: intelligence
requires:
  commands: [intelligence, simulate, trade]
  skills: [pacifica-shared, simulate-first, snapshot-before-trade]
  auth_required: true
  dangerous: true
---

# Pattern-Confirmed Entry

## Purpose
Use the Pacifica intelligence engine to identify markets where a verified pattern is
currently active, then enter a position only if the signal meets confidence requirements.
This is the recommended entry method for any non-trivial position because it ties your
entry decision to historical win-rate evidence.

## Steps

1. Run the pattern engine to detect active signals on live markets.
2. Parse the output and identify the strongest signal (highest win rate with full pattern match).
3. Reject any signal with `win_rate` below 0.60 or `fullMatch: false` unless you have a
   specific reason to proceed.
4. Check your current positions to avoid doubling an existing exposure.
5. Simulate the proposed trade to confirm liquidation price and P&L scenarios.
6. Validate the order without submitting it.
7. Submit the live order.
8. Journal the trade immediately after.

## Commands

```bash
# Step 1: Run the pattern engine and scan live markets
pacifica intelligence run --json

# Expected output shape:
# {
#   "patterns": [...],
#   "signals": [
#     {
#       "asset": "ETH-USDC-PERP",
#       "direction": "long",
#       "pattern": { "name": "...", "win_rate": 0.72, "sample_size": 47 },
#       "fullMatch": true,
#       "fundingRate": 0.0003
#     }
#   ]
# }

# Step 2: Check current positions before entering
pacifica positions --json

# Step 3: Simulate the trade
# Replace values with those from the chosen signal
pacifica simulate long ETH-USDC-PERP 500 --leverage 5 --json

# Step 4: Validate order without submitting
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --validate --json

# Step 5: Submit the live order
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --sl 2900 --json

# Step 6: Confirm the order landed
pacifica orders --json

# Step 7: Journal the session
pacifica journal --limit 1 --json
```

## Parameters

- `--leverage <n>`: Leverage multiplier for the entry. Match or stay below what the
  simulation showed as safe given your stop-loss distance.
- `--sl <price>`: Stop-loss price. Mandatory for pattern entries. Set it just below
  the pattern's invalidation level.
- `--tp <price>`: Take-profit price. Optional but recommended when the pattern has a
  defined target.
- `--validate`: Dry-run that checks margin and order constraints without submitting.
  Always use this before the live call.

## Signal Quality Criteria

Only proceed with entry if all of the following are true:

| Criterion | Minimum value |
|---|---|
| `win_rate` | >= 0.60 (60%) |
| `sample_size` | >= 20 trades |
| `fullMatch` | true |
| Funding alignment | Rate favours your direction or is near zero |

## Risks

- **Pattern lag**: The intelligence engine runs on historical data loaded at startup.
  Market conditions may have changed since the signal was generated.
- **Overfit patterns**: Small sample sizes (< 20) produce unreliable win rates.
  Always check `sample_size` before acting.
- **Signal timing**: A signal does not mean "enter now". It means conditions historically
  matching this pattern have been profitable. Your entry timing still matters.

## Notes

- Verified patterns are stored locally. Run `pacifica intelligence seed` in dev
  environments to populate the store. In production, patterns accumulate from live trades.
- The strongest signal is listed first in the `signals` array when `--json` is used.
- Combine with `journal-trade` skill after every entry to build your personal intelligence
  record for future pattern refinement.
