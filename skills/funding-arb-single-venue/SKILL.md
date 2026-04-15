---
name: pacifica-funding-arb-single-venue
version: 1.0.0
description: Run the Pacifica funding arbitrage bot to collect extreme funding rates
category: funding
requires:
  commands: [arb, funding]
  skills: [pacifica-shared]
  auth_required: true
  dangerous: true
---

# Funding Arb — Single Venue

## Purpose
Use the Pacifica arb bot to identify markets where the current funding rate is large
enough to profit from holding the paying side against a hedged spot position, or from
pure directional funding collection when the rate is extreme. This skill operates on
Pacifica only and does not require a cross-venue hedge.

The arb bot manages its own positions and rebalances automatically. This skill covers
scanning for opportunities, starting the bot, and monitoring it safely.

## Steps

1. Scan funding rates to confirm at least one market has a rate large enough to be
   worth arbing. The bot's default minimum threshold is 0.05% per 8h (roughly 55% APR).
2. Review the arb config to confirm position limits are set appropriately for your
   available margin.
3. Start the arb bot.
4. Check status after 5 minutes to confirm it has entered at least one position.
5. Monitor periodically. Stop the bot before the next funding settlement if P&L
   has turned negative.

## Commands

```bash
# Step 1: Check funding rates and confirm a candidate exists
pacifica funding --json

# Step 2: Review current arb bot configuration
pacifica arb config --json

# Step 3: Do a one-shot scan to preview what the bot would target
pacifica arb scan --json

# Step 4: Start the arb bot daemon
pacifica arb start

# Step 5: Check bot status
pacifica arb status --json

# Step 6: View position history
pacifica arb list --json

# Step 7: Stop the bot
pacifica arb stop
```

## Parameters

- Arb config is managed via `pacifica arb config`. Key fields:
  - `minFundingRate`: Minimum absolute rate to enter a position (default 0.0005).
  - `maxPositionUsd`: Maximum USD notional per position.
  - `maxTotalExposureUsd`: Total arb exposure cap across all positions.
- The bot runs as a foreground daemon until stopped with `pacifica arb stop` or Ctrl+C.

## Risks

- **Single-venue risk**: Without a cross-venue hedge, you carry directional exposure.
  A large adverse price move can exceed the funding collected.
- **Rate reversal**: Funding rates can reverse between the time you enter and the next
  settlement. The bot monitors this but cannot guarantee the rate holds.
- **Liquidity**: If the bot cannot close positions at acceptable slippage, it will log
  an error but the position remains open. Check `pacifica arb status` and manually
  close via `pacifica arb close <id>` if needed.
- **Daemon crash**: If the process is killed unexpectedly, positions opened by the bot
  remain live. Run `pacifica positions --json` to review the state.

## Notes

- Run `pacifica arb list --json` after stopping to capture the session P&L for journaling.
- The bot writes a PID file to `~/.pacifica/arb.pid`. A stale PID file from a crashed
  session may prevent restart. Delete it manually if `pacifica arb start` reports the
  bot is already running when it is not.
- Best results on markets with sustained extreme rates (>0.1% per 8h). Marginal rates
  produce marginal returns that may not cover trading fees.
