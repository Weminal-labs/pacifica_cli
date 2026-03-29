Perform a risk analysis on the user's current Pacifica positions.

Steps:
1. Run `node dist/cli.js positions --json 2>/dev/null` to get positions
2. Run `node dist/cli.js heatmap --json 2>/dev/null` to get risk data
3. Run `node dist/cli.js journal --json 2>/dev/null` to get recent trade history

Analyze and report:
- **Position Risk**: For each position, show distance to liquidation, current PnL, and risk level
- **Portfolio Risk**: Total margin utilization, concentration in single assets
- **Recent Performance**: Win rate from journal, average win/loss size
- **Recommendations**: Suggest risk-reducing actions like:
  - Setting stop-losses on unprotected positions
  - Reducing leverage on high-risk positions
  - Diversifying if too concentrated
  - Taking partial profits on large winners
