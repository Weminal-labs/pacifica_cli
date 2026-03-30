Scan Pacifica DEX markets and show a quick overview. Run `pacifica scan` in non-interactive mode to get market data, then summarize the top movers, highest volume, and notable funding rates.

Steps:
1. Run `node dist/cli.js scan --json 2>/dev/null || echo "[]"` to get market data
2. Parse the JSON output
3. Summarize: top 3 gainers, top 3 losers, highest volume markets, and any funding rates above 0.05%
4. Format as a clean markdown table
