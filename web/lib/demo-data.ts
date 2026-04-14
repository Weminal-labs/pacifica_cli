import type { Pattern, WhaleActivity, HighRepSignal, ReputationEntry } from "./types";

export const DEMO_PATTERNS: Pattern[] = [
  {
    id: "pat_demo1",
    name: "Negative Funding + Rising OI",
    conditions: [
      { axis: "funding_rate", op: "lt", value: -0.0003, label: "funding < -0.03%" },
    ],
    sample_size: 34,
    win_rate: 0.723,
    avg_pnl_pct: 6.8,
    avg_duration_minutes: 420,
    primary_assets: ["ETH-USDC-PERP", "BTC-USDC-PERP"],
    verified: true,
    last_seen_at: new Date(Date.now() - 7_200_000).toISOString(),
  },
  {
    id: "pat_demo2",
    name: "Whale Activity + Bullish Momentum",
    conditions: [
      { axis: "large_orders_count", op: "gte", value: 3, label: "whale orders >= 3" },
    ],
    sample_size: 27,
    win_rate: 0.681,
    avg_pnl_pct: 5.4,
    avg_duration_minutes: 280,
    primary_assets: ["BTC-USDC-PERP", "SOL-USDC-PERP"],
    verified: true,
    last_seen_at: new Date(Date.now() - 18_000_000).toISOString(),
  },
  {
    id: "pat_demo3",
    name: "High Buy Pressure + Negative Funding",
    conditions: [
      { axis: "buy_pressure", op: "gt", value: 0.65, label: "buy pressure > 65%" },
    ],
    sample_size: 19,
    win_rate: 0.656,
    avg_pnl_pct: 4.2,
    avg_duration_minutes: 190,
    primary_assets: ["ETH-USDC-PERP", "SOL-USDC-PERP"],
    verified: true,
    last_seen_at: new Date(Date.now() - 28_800_000).toISOString(),
  },
];

export const DEMO_WHALES: WhaleActivity[] = [
  {
    asset: "BTC-USDC-PERP",
    direction: "long",
    size_usd: 2_400_000,
    large_orders_count: 4,
    opened_at: new Date(Date.now() - 1_800_000).toISOString(),
  },
  {
    asset: "ETH-USDC-PERP",
    direction: "long",
    size_usd: 890_000,
    large_orders_count: 3,
    opened_at: new Date(Date.now() - 5_400_000).toISOString(),
  },
  {
    asset: "SOL-USDC-PERP",
    direction: "short",
    size_usd: 450_000,
    large_orders_count: 3,
    opened_at: new Date(Date.now() - 9_000_000).toISOString(),
  },
];

export const DEMO_SIGNALS: HighRepSignal[] = [
  {
    asset: "ETH-USDC-PERP",
    direction: "long",
    size_usd: 45_000,
    rep_score: 94,
    opened_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    asset: "BTC-USDC-PERP",
    direction: "long",
    size_usd: 28_000,
    rep_score: 87,
    opened_at: new Date(Date.now() - 7_200_000).toISOString(),
  },
];

export const DEMO_REP: ReputationEntry[] = [
  {
    rank: 1,
    trader_id: "0xa1b2c3d4e5f6",
    overall_rep_score: 94,
    overall_win_rate: 0.78,
    closed_trades: 87,
    top_patterns: ["negative_funding", "rising_oi"],
  },
  {
    rank: 2,
    trader_id: "0xb2c3d4e5f6a1",
    overall_rep_score: 87,
    overall_win_rate: 0.71,
    closed_trades: 64,
    top_patterns: ["whale_activity", "bullish_momentum"],
  },
  {
    rank: 3,
    trader_id: "0xc3d4e5f6a1b2",
    overall_rep_score: 79,
    overall_win_rate: 0.67,
    closed_trades: 43,
    top_patterns: ["high_buy_pressure"],
  },
  {
    rank: 4,
    trader_id: "0xd4e5f6a1b2c3",
    overall_rep_score: 71,
    overall_win_rate: 0.63,
    closed_trades: 31,
    top_patterns: ["negative_funding"],
  },
  {
    rank: 5,
    trader_id: "0xe5f6a1b2c3d4",
    overall_rep_score: 58,
    overall_win_rate: 0.55,
    closed_trades: 18,
    top_patterns: ["rising_oi"],
  },
];
