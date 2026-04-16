---
name: pacifica-journal-trade
version: 1.0.0
description: Log every trade to the journal immediately after execution with full context and rationale
category: reporting
requires:
  commands: [journal, orders]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: false
---

# Journal Trade

## Purpose
Capture the context, rationale, and outcome for every trade. Consistent journaling
builds the intelligence data that the pattern engine uses to compute your personal
reputation score and identify your strongest trading conditions. It also creates an
audit trail for reviewing decisions later.

This skill is read-only and non-destructive. It fetches data and organises it —
it does not place orders.

## Steps

1. Immediately after placing a trade, fetch the most recent order confirmation.
2. Fetch the current position state to record the entry details.
3. Record the trade context: which signal triggered the entry, the intelligence
   pattern (if any), and the market conditions at entry.
4. Append the structured record to the session journal.
5. At position close, fetch the journal to record the outcome and calculate P&L.

## Commands

```bash
# Step 1: Confirm the most recent order was accepted
pacifica orders --json
# Take the most recent order entry for the symbol you just traded

# Step 2: Get current position details for the just-opened trade
pacifica positions --json

# Step 3: Review recent journal to see the trade has been recorded
pacifica journal --limit 1 --json

# Step 4: For a more detailed view of the current trading day
pacifica journal --weekly --json

# Step 5: After position close — check the outcome
pacifica journal --limit 5 --symbol ETH-USDC-PERP --json
```

## Journal Record Template

When logging manually or programmatically, use this structure:

```json
{
  "timestamp": "2026-04-14T10:30:00Z",
  "symbol": "ETH-USDC-PERP",
  "side": "long",
  "size_usd": 500,
  "leverage": 5,
  "entry_price": 3200.00,
  "liquidation_price": 2560.00,
  "stop_loss": 3050.00,
  "take_profit": 3500.00,
  "signal_source": "intelligence-run",
  "pattern_name": "High Funding Long Reversal",
  "pattern_win_rate": 0.72,
  "funding_rate_at_entry": 0.0003,
  "rationale": "Pattern confirmed + funding near-zero + 7D rising filter passed",
  "outcome": null
}
```

Populate `outcome` when the position closes:

```json
"outcome": {
  "close_price": 3380.00,
  "realised_pnl": 84.00,
  "fees": 0.75,
  "net_pnl": 83.25,
  "held_hours": 6.5,
  "profitable": true
}
```

## Minimum Required Fields

At minimum, record these fields at entry:

| Field | Source |
|---|---|
| `timestamp` | Current UTC time |
| `symbol` | From the trade command |
| `side` | From the trade command |
| `size_usd` | From the trade command |
| `entry_price` | From positions JSON after entry |
| `signal_source` | Intelligence run, manual, copy, or arb |
| `rationale` | One sentence: why you took this trade |

## Notes

- Every `pacifica trade` call writes a journal record automatically with size, entry, and market context.
- The manual `rationale` field is what the trader adds — typically the pattern name (`funding-carry-btc`) or a free-text reason. This turns the journal into a per-pattern track record.
- Review weekly with `pacifica journal --weekly --json` to see which patterns produce your best outcomes.
