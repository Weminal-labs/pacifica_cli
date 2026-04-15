---
name: pacifica-recipe-intelligence-driven-trade
version: 1.0.0
description: Full end-to-end trade workflow — check feed, find pattern, snapshot, simulate, validate, trade, journal
category: recipe
requires:
  commands: [intelligence, positions, orders, funding, simulate, trade, journal]
  skills:
    - pacifica-shared
    - snapshot-before-trade
    - pattern-confirmed-entry
    - simulate-first
    - validate-before-live
    - risk-check-before-trade
    - journal-trade
  auth_required: true
  dangerous: true
---

# Recipe: Intelligence-Driven Trade

## Purpose
Execute a complete, disciplined trade from signal discovery through to journal entry.
This recipe chains all individual safety and execution skills into a single ordered
workflow. It is the recommended way to enter any non-trivial position on Pacifica.

Running this recipe takes approximately 5–10 minutes end to end. Skipping any step
is not recommended. If any step produces a failure or a Red risk rating, stop at that
step and resolve the issue before continuing.

## Required Skills (load in order)

1. `pacifica-shared` — CLI conventions and safety invariants
2. `snapshot-before-trade` — account state before acting
3. `pattern-confirmed-entry` — signal quality gate
4. `simulate-first` — liquidation and P&L calculation
5. `risk-check-before-trade` — full account risk assessment
6. `validate-before-live` — dry-run order validation
7. `journal-trade` — post-trade record

## Full Workflow

### Phase 1: Discovery

```bash
# 1a. Run the pattern engine — find active signals
pacifica intelligence run --json

# 1b. Check funding rates for context on all markets
pacifica funding --json
```

Evaluate the output. Only proceed if:
- At least one signal with `fullMatch: true` and `win_rate >= 0.60` exists.
- The signal direction aligns with or is neutral to the funding rate for that market.

### Phase 2: Account Snapshot

```bash
# 2a. Current open positions
pacifica positions --json

# 2b. Current open orders
pacifica orders --json
```

Confirm no existing conflicting position in the same symbol and direction.

### Phase 3: Simulation

```bash
# 3a. Simulate the proposed trade
# Replace values with your chosen signal and sizing
pacifica simulate long ETH-USDC-PERP 500 --leverage 5 --json
```

Apply the simulation pass criteria from `simulate-first`:
- Liquidation price >= 10% from entry
- Loss at stop-loss within 5% of equity
- Funding APR <= 60% absolute

### Phase 4: Risk Check

Use the positions and simulate output to calculate:
- Total account leverage after adding this trade
- Market concentration percentage
- Liquidation buffer

Return Green on all three criteria before continuing.

### Phase 5: Validation

```bash
# 5a. Dry-run the exact order — no submission
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --sl 3000 --tp 3600 --validate --json
```

Confirm `"valid": true` in the response before proceeding.

### Phase 6: Live Execution

```bash
# 6a. Submit the live order
pacifica trade buy ETH-USDC-PERP 500 --leverage 5 --sl 3000 --tp 3600 --json

# 6b. Confirm the order is in the book
pacifica orders --json

# 6c. Confirm the position is open
pacifica positions --json
```

### Phase 7: Journal

```bash
# 7a. Review the most recent journal entry
pacifica journal --limit 1 --json

# 7b. Record the signal source and rationale
# (see journal-trade skill for the full record template)
```

## Go / No-Go Summary

| Gate | Pass condition | Action on fail |
|---|---|---|
| Signal quality | fullMatch, win_rate >= 0.60 | Abort — no qualifying signal |
| No conflicting position | Snapshot shows no same-side position | Abort or close existing first |
| Simulation criteria | All 3 criteria Green | Adjust size or leverage, re-simulate |
| Risk check | All 3 metrics Green | Cut size 50%, recheck; if still Red, abort |
| Validation | `valid: true` | Read error, fix parameter, re-validate |

## Notes

- This recipe is intentionally sequential. Running phases out of order increases risk
  because later phases depend on the context established in earlier ones.
- For small exploratory trades under $100, phases 4 and 5 may be abbreviated. For any
  trade above $500, all phases are mandatory.
- If you are interrupted between phases, re-run the snapshot phase before continuing.
  Market conditions change; a stale snapshot creates false confidence.
