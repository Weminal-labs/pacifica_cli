Analyze funding rate arbitrage opportunities across Pacifica, Binance, and Bybit.

Steps:
1. Run `node dist/cli.js funding-arb --json 2>/dev/null` to get cross-exchange funding data
2. Parse and analyze the results
3. Highlight actionable opportunities (spread > 0.02%)
4. For each opportunity, explain:
   - Which direction to trade on Pacifica
   - The estimated annualized APR
   - The hedging strategy (short on high-rate exchange, long on low-rate exchange)
5. Provide risk warnings about:
   - Execution risk (slippage, timing)
   - Funding rate changes between cycles
   - Capital requirements for delta-neutral positions
