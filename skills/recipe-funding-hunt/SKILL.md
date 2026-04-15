---
name: pacifica-recipe-funding-hunt
version: 1.0.0
description: Scan all funding rates, identify extreme outliers, then arb or collect depending on size and risk tolerance
category: recipe
requires:
  commands: [funding, arb, simulate, trade, positions]
  skills:
    - pacifica-shared
    - funding-monitor
    - funding-arb-single-venue
    - funding-collection
    - simulate-first
    - risk-check-before-trade
  auth_required: true
  dangerous: true
---

# Recipe: Funding Hunt

## Purpose
Find and exploit the highest-magnitude funding rates across all Pacifica markets.
Depending on the rate level and your available margin, this recipe guides you to either:

1. Run the automated arb bot (rates above 0.001 per 8h, bot manages hedging).
2. Manually collect funding by holding the receiving side (rates 0.0005–0.001 with
   acceptable directional risk).
3. Set up monitoring alerts (rates below 0.0005 — worth watching but not acting on yet).

## Required Skills (load in order)

1. `pacifica-shared` — CLI conventions
2. `funding-monitor` — rate interpretation
3. `funding-arb-single-venue` — automated arb bot
4. `funding-collection` — manual collection strategy
5. `simulate-first` — liquidation check
6. `risk-check-before-trade` — account risk gate

## Full Workflow

### Phase 1: Rate Discovery

```bash
# 1a. Full funding rate snapshot across all markets
pacifica funding --json

# Expected output per market:
# {
#   "symbol": "ETH-USDC-PERP",
#   "fundingRate": 0.0015,
#   "nextFundingRate": 0.0012,
#   "price": 3240.50
# }
```

Sort the output by `abs(fundingRate)` descending. Identify:
- **Tier 1** (>= 0.002): Highly favourable for arb bot. Run `funding-arb-single-venue`.
- **Tier 2** (0.001–0.002): Worth manual collection. Run `funding-collection`.
- **Tier 3** (0.0005–0.001): Set alerts. Monitor until it crosses into Tier 2.
- **Below 0.0005**: Ignore.

### Phase 2: Confirm Persistence

```bash
# 2a. Check predicted rate for next settlement
# nextFundingRate from step 1 output should be in the same direction
# If nextFundingRate is opposite, the rate may reverse — downgrade to one tier lower
```

### Phase 3: Arb Bot (Tier 1)

```bash
# 3a. Preview what the arb bot would target
pacifica arb scan --json

# 3b. Start the arb bot
pacifica arb start

# 3c. Confirm it has opened a position
pacifica arb status --json
```

Monitor with `pacifica arb status --json` every 30 minutes. Stop before the next
settlement if the rate has dropped below the bot's minimum threshold.

### Phase 4: Manual Collection (Tier 2)

```bash
# 4a. Identify direction for collection
# Positive fundingRate → short to collect
# Negative fundingRate → long to collect

# 4b. Simulate the position
# Example: ETH fundingRate = 0.0015, enter short to collect
pacifica simulate short ETH-USDC-PERP 800 --leverage 2 --json

# 4c. Risk check
# Review total leverage and concentration with existing positions

# 4d. Validate the entry
pacifica trade sell ETH-USDC-PERP 800 --leverage 2 --sl 3600 --validate --json

# 4e. Enter the collection position
pacifica trade sell ETH-USDC-PERP 800 --leverage 2 --sl 3600 --json
```

### Phase 5: Monitoring

```bash
# 5a. Set an alert to notify if the rate falls below the minimum threshold
pacifica alerts add --symbol ETH-USDC-PERP --funding-below 0.0005 --json

# 5b. Start the alerts daemon
pacifica alerts check --daemon --interval 300
```

### Phase 6: Exit

Exit the collection position after:
- At least one settlement has been received
- The funding rate drops below 0.0005
- The position's unrealised loss exceeds the collected funding

```bash
# Close the collection position
pacifica positions close ETH-USDC-PERP --json

# If arb bot is running, stop it
pacifica arb stop

# Record session outcome
pacifica journal --weekly --json
```

## Rate APR Reference

| Rate (8h) | APR | Strategy |
|---|---|---|
| < 0.0005 | < 55% | Monitor only |
| 0.0005–0.001 | 55%–110% | Manual collection if directional view aligns |
| 0.001–0.002 | 110%–219% | Manual collection, arb bot optional |
| > 0.002 | > 219% | Arb bot — rate is extreme |

## Notes

- The arb bot and a manual collection position should not both target the same market.
  The arb bot manages its own position; a competing manual position creates accounting
  confusion and may affect the bot's hedging.
- If two or more markets are in Tier 1 simultaneously, the arb bot can run on the
  highest-rate market while you manually collect on the second.
- Funding rates on Pacifica settle every 8 hours. Time your entries to capture at least
  one settlement before the rate reverts.
