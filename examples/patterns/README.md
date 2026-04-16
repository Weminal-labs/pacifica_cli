# Patterns — code your trading instinct

A **pattern** is your rule, written as YAML. It says:

- when to enter a trade
- how big, which side, what leverage
- when to exit

Patterns live at `~/.pacifica/patterns/*.yaml`. Claude can read, write, and run them through the MCP server — you compose a library of your own setups and reuse them.

## Author your first pattern

Copy one of the examples in this directory to `~/.pacifica/patterns/` and edit it:

```bash
cp examples/patterns/funding-carry-btc.yaml ~/.pacifica/patterns/
```

Or ask Claude: *"Help me write a pattern that longs SOL when funding is negative and momentum is rising."* Claude will draft it directly into `~/.pacifica/patterns/` via MCP.

## Schema

```yaml
name: my-pattern-name          # lowercase kebab-case, required
description: What it does      # optional
tags: [funding, btc]            # optional

market: BTC-USDC-PERP          # or "ANY" to scan all markets

when:                          # all must be true (AND)
  - axis: funding_rate
    op: lt
    value: -0.0003

entry:
  side: long                   # long | short
  size_usd: 500
  leverage: 3                  # default 3
  stop_loss_pct: 2.0           # optional
  take_profit_pct: 1.5         # optional

exit:                          # any true (OR). Optional.
  - axis: funding_rate
    op: gt
    value: 0
```

## Condition axes

| axis | meaning |
|---|---|
| `funding_rate` | per-interval funding, e.g. -0.0003 = -0.03% |
| `oi_change_4h_pct` | open-interest % change over last 4h |
| `buy_pressure` | 0.0–1.0 aggressive-buy ratio |
| `momentum_value` | -1.0 (bearish) to +1.0 (bullish) |
| `large_orders_count` | count of orders > $50k in the window |
| `open_interest_usd` | absolute OI in USD |
| `volume_24h_usd` | 24h volume |
| `mark_price` | current mark price |

Operators: `lt`, `lte`, `gt`, `gte`, `eq`.

## Example patterns

| File | Description |
|---|---|
| `funding-carry-btc.yaml` | Long BTC when funding is deeply negative — collect the carry. |
| `trend-continuation-eth.yaml` | Long ETH when momentum is bullish, buy-pressure high, whales active. |
| `price-breakout-btc.yaml` | Demo — long BTC on price breakout above a level. |
| `mean-reversion-eth.yaml` | Short ETH on overbought momentum — mean reversion play. |
| `range-bound-sol.yaml` | Long SOL at range floor with volume confirmation. |
| `volume-spike-entry.yaml` | Long on volume spike with momentum — scans all markets. |
| `funding-flip-short.yaml` | Short BTC on spiking positive funding — longs are overleveraged. |
| `whale-accumulation.yaml` | Long when whales are accumulating — follow the smart money. |
