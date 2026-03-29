Show a comprehensive status dashboard of the user's Pacifica account.

Run these commands and aggregate the results:
1. `node dist/cli.js positions --json 2>/dev/null` - Open positions
2. `node dist/cli.js orders --json 2>/dev/null` - Open orders
3. `node dist/cli.js agent status --json 2>/dev/null` - Agent guardrails status
4. `node dist/cli.js heatmap --compact --json 2>/dev/null` - Risk overview

Present a unified dashboard with:
- Account summary (if available)
- Open positions with unrealized PnL
- Pending orders count
- Agent status (enabled/disabled, daily spend)
- Risk level summary
