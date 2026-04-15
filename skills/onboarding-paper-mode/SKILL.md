---
name: pacifica-onboarding-paper-mode
version: 1.0.0
description: Safely learn the Pacifica CLI using simulation and testnet before touching real funds
category: onboarding
requires:
  commands: [init, scan, simulate, intelligence, leaderboard, journal]
  skills: [pacifica-shared]
  auth_required: false
  dangerous: false
---

# Onboarding — Paper Mode

## Purpose
Walk through the core Pacifica CLI features using simulation and the testnet before
risking any real capital. This skill guides new users through initialisation, market
exploration, intelligence signals, and trade simulation — building familiarity with
the CLI's output format and workflow without any financial risk.

This skill is entirely safe. No live orders are placed.

## Steps

1. Initialise the CLI and confirm the testnet connection.
2. Scan the market to understand what is available and find any opportunities.
3. Run the intelligence engine to see active signals.
4. Simulate a trade on a signal of your choice to see P&L scenarios and liquidation.
5. Check the leaderboard to understand how top traders are performing.
6. Review the journal structure (it will be empty, but you will see the format).
7. Practice the full pre-trade checklist in paper mode.

## Commands

```bash
# Step 1: Initialise Pacifica CLI
pacifica init
# Follow the prompts to set your testnet RPC and API config

# Step 2: Scan markets for opportunities
pacifica scan --json

# Step 3: Check funding rates (important context for any trade)
pacifica funding --json

# Step 4: Run the intelligence engine for active signals
pacifica intelligence run --json

# Step 5: Simulate a trade from the signal output
# Replace values with actual signal data from step 4
pacifica simulate long ETH-USDC-PERP 500 --leverage 3 --json

# Step 6: Simulate the same trade with different leverage to see the risk difference
pacifica simulate long ETH-USDC-PERP 500 --leverage 10 --json
# Observe: liquidation price moves much closer at 10x vs 3x

# Step 7: Check the leaderboard to see top traders
pacifica leaderboard --limit 10 --json

# Step 8: Review leaderboard with filter
pacifica leaderboard --filter consistent --limit 10 --json

# Step 9: View the journal (empty on first use)
pacifica journal --json

# Step 10: Practice the full simulate → validate workflow
# (validate requires testnet credentials from step 1)
pacifica simulate long SOL-USDC-PERP 200 --leverage 2 --json
pacifica trade buy SOL-USDC-PERP 200 --leverage 2 --sl 130 --validate --json
```

## Learning Checkpoints

Work through these checkpoints in order. Do not proceed to the next until you are
comfortable with the current one.

| Checkpoint | What to confirm you understand |
|---|---|
| Scan output | Symbol format, price, volume — can filter for gainers/losers |
| Funding rates | What the sign means, how APR is calculated, what is "extreme" |
| Intelligence run | Difference between `fullMatch` and partial, what win rate means |
| Simulate output | Liquidation price, P&L scenarios, funding APR |
| Leaderboard | Rep score interpretation, filter modes |
| Validate flag | What it checks, how to read success and failure responses |

## Testnet vs Mainnet

The CLI defaults to the network in your config file. During onboarding:

- Use `--testnet` on any command to force testnet: `pacifica scan --testnet --json`
- Run `pacifica init` and select testnet to set it as your default for the session

When you are ready to trade real funds:
- Run `pacifica init` again and switch to mainnet config
- Your testnet trades have no financial consequence

## Notes

- Simulation does not require a wallet or credentials. You can simulate any trade without
  logging in.
- The intelligence engine in testnet mode uses the same algorithm as mainnet. Seed data
  for development with `pacifica intelligence seed` (DEV ONLY command).
- Spend at least a week in paper mode before your first live trade. Track your simulated
  trades in a spreadsheet to build intuition about leverage and liquidation.
