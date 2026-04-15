---
name: pacifica-validate-before-live
version: 1.0.0
description: Run every trade order through --validate dry-run before submitting it live
category: safety
requires:
  commands: [trade]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: false
---

# Validate Before Live

## Purpose
Use the `--validate` flag on every trade command to perform a dry-run that checks
margin sufficiency, order constraints, and parameter correctness without submitting
an actual order. The validation call exercises the same server-side checks as a live
order, so if it passes, the live call will almost certainly succeed.

This is a single mandatory step between simulation and live execution in every trading
workflow.

## Steps

1. Construct the full trade command exactly as you intend to submit it live.
2. Append `--validate` to the command.
3. Parse the JSON output. If the validation passes, proceed to the live command.
4. If validation fails, read the error message, adjust parameters, and re-validate.
5. Remove `--validate` and submit the live order.

## Commands

```bash
# Step 1: Validate a buy order before going live
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --sl 3000 --validate --json

# Expected success output:
# { "valid": true, "estimatedFee": 0.50, "marginRequired": 100.00, ... }

# Expected failure output:
# { "valid": false, "error": "Insufficient margin: required $100, available $82" }

# Step 2: Validate a sell order
pacifica trade sell BTC-USDC-PERP 1000 --leverage 3 --sl 75000 --tp 60000 --validate --json

# Step 3: Once validation passes, submit the live order (identical minus --validate)
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --sl 3000 --json
```

## What Validation Checks

The `--validate` flag asks the server to verify:

| Check | What it catches |
|---|---|
| Margin sufficiency | Not enough free collateral for the requested size and leverage |
| Symbol existence | Typos in the market symbol |
| Minimum order size | Order below the market's minimum notional |
| Leverage limits | Requested leverage above the market maximum |
| Price sanity | Limit price far outside the current spread (for limit orders) |
| Duplicate TP/SL | Stop price on the wrong side of the current mark price |

## Notes

- Validation does not guarantee fill price or that the order will be accepted after
  market conditions change. Market prices move between the validate call and the
  live call.
- Always run validate with the same flags as the live command. If you add `--sl` in the
  live command but not the validate command, the validation is incomplete.
- For agent-driven workflows, parse the `"valid": true` field before proceeding.
  Any `"valid": false` response must halt execution and surface the `"error"` field
  to the operator.
- The `--validate` flag is available on all `pacifica trade buy` and `pacifica trade sell`
  subcommands.
