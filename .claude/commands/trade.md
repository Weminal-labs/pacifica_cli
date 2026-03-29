Help the user place a trade on Pacifica DEX. Guide them through the parameters interactively.

Ask for these parameters one at a time:
1. **Symbol** - Which market? (e.g., BTC, ETH, SOL)
2. **Side** - Buy (long) or Sell (short)?
3. **Size** - How much in base units?
4. **Order type** - Market or Limit?
5. **Price** (if limit) - At what price?
6. **Leverage** - What leverage? (default from config)
7. **TP/SL** - Want to set take-profit or stop-loss?

Once all parameters are collected, construct and show the full command:
```
pacifica trade buy BTC 0.1 --leverage 5 --tp 105000 --sl 95000
```

Ask for confirmation before running.
