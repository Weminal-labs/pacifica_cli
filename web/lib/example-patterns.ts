// ---------------------------------------------------------------------------
// Bundled example patterns — the showcase set for the web.
// ---------------------------------------------------------------------------
// The trader's own patterns live at `~/.pacifica/patterns/` on their
// machine; the edge-rendered web has no access to that. So `/backtest/[name]`
// showcases the example patterns only. Traders backtest their own patterns
// via the CLI (`pacifica backtest`) or MCP (`pacifica_backtest_pattern`).
//
// YAML is parsed at module load (once per edge isolate) so the page itself
// stays edge-friendly — no filesystem access at request time.
// ---------------------------------------------------------------------------

import { parse as parseYaml } from "yaml";
import { PatternSchema, type Pattern } from "@pacifica/core/patterns/types";

// NOTE: we inline the YAML strings rather than relying on webpack's
// file-loader gymnastics. This keeps the build deterministic across
// Cloudflare Pages / Vercel / local dev.

const FUNDING_CARRY_BTC = `
name: funding-carry-btc
description: Long BTC when funding is deeply negative — collect the carry.
tags: [funding, carry, btc]
market: BTC-USDC-PERP
when:
  - axis: funding_rate
    op: lt
    value: -0.0003
    label: "deeply negative funding"
  - axis: oi_change_4h_pct
    op: gt
    value: 5
    label: "OI rising (not a collapse)"
entry:
  side: long
  size_usd: 500
  leverage: 3
  stop_loss_pct: 2.0
  take_profit_pct: 1.5
exit:
  - axis: funding_rate
    op: gt
    value: 0
    label: "funding flipped positive — carry gone"
`;

const TREND_CONTINUATION_ETH = `
name: trend-continuation-eth
description: Long ETH when momentum is bullish, buy-pressure high, whales active.
tags: [momentum, trend, eth]
market: ETH-USDC-PERP
when:
  - axis: momentum_value
    op: gt
    value: 0.4
    label: "strong bullish momentum"
  - axis: buy_pressure
    op: gt
    value: 0.65
    label: "aggressive buying"
  - axis: large_orders_count
    op: gte
    value: 3
    label: "at least 3 whale orders this window"
entry:
  side: long
  size_usd: 750
  leverage: 2
  stop_loss_pct: 2.5
  take_profit_pct: 4.0
exit:
  - axis: momentum_value
    op: lt
    value: 0
    label: "momentum flipped bearish"
`;

// Also include a price-axis-only pattern so the web backtest can actually
// produce trades (funding / momentum patterns will hit the skipped-axes
// banner and emit zero trades, which is honest but not showcase-friendly).
const PRICE_BREAKOUT_BTC = `
name: price-breakout-btc
description: Demo only — long BTC when price breaks above a level. Backtestable from candles alone.
tags: [price, breakout, demo]
market: BTC-USDC-PERP
when:
  - axis: mark_price
    op: gt
    value: 74500
    label: "price breaks above $74.5k"
entry:
  side: long
  size_usd: 1000
  leverage: 5
  stop_loss_pct: 2.0
  take_profit_pct: 3.0
exit:
  - axis: mark_price
    op: lt
    value: 72500
    label: "trend invalidated"
`;

const RAW_YAMLS: Record<string, string> = {
  "funding-carry-btc": FUNDING_CARRY_BTC,
  "trend-continuation-eth": TREND_CONTINUATION_ETH,
  "price-breakout-btc": PRICE_BREAKOUT_BTC,
};

// Parse + validate once at module load.
const PARSED: Record<string, Pattern> = Object.fromEntries(
  Object.entries(RAW_YAMLS).map(([name, src]) => {
    const raw = parseYaml(src);
    const parsed = PatternSchema.parse(raw);
    return [name, parsed];
  }),
);

export function getExamplePattern(name: string): Pattern | null {
  return PARSED[name] ?? null;
}

export function listExamplePatternNames(): string[] {
  return Object.keys(PARSED);
}

export function listExamplePatterns(): Pattern[] {
  return Object.values(PARSED);
}
