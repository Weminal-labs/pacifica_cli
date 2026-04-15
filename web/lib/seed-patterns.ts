// ---------------------------------------------------------------------------
// Seed patterns — showcase fallback for deployed environments
// These represent realistic intelligence engine output from real trade data.
// Shown only when localhost:4242 (intelligence server) is unreachable.
// ---------------------------------------------------------------------------

import type { Pattern } from "./types";

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

export const SEED_PATTERNS: Pattern[] = [
  {
    id: "seed_pat_001",
    name: "Negative Funding + Rising Open Interest",
    conditions: [
      { axis: "funding_rate",      op: "lt", value: -0.0003, label: "funding < -0.03%" },
      { axis: "open_interest_usd", op: "gt", value: 120_000_000, label: "OI > $120M" },
    ],
    sample_size: 34,
    win_rate: 0.723,
    avg_pnl_pct: 6.8,
    avg_duration_minutes: 420,
    primary_assets: ["ETH-USDC-PERP", "BTC-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(72),
    last_seen_at: hoursAgo(3),
  },
  {
    id: "seed_pat_002",
    name: "High Buy Pressure Breakout",
    conditions: [
      { axis: "buy_pressure",     op: "gt", value: 0.65,     label: "buy pressure > 65%" },
      { axis: "momentum_signal",  op: "eq", value: "bullish", label: "momentum = bullish" },
    ],
    sample_size: 28,
    win_rate: 0.678,
    avg_pnl_pct: 5.2,
    avg_duration_minutes: 240,
    primary_assets: ["ETH-USDC-PERP", "SOL-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(48),
    last_seen_at: hoursAgo(7),
  },
  {
    id: "seed_pat_003",
    name: "Funding Reversal After Extreme Positive",
    conditions: [
      { axis: "funding_rate",      op: "gt", value: 0.001,  label: "funding > 0.1%" },
      { axis: "large_orders_count", op: "gt", value: 5,     label: "large orders > 5" },
    ],
    sample_size: 19,
    win_rate: 0.736,
    avg_pnl_pct: 8.1,
    avg_duration_minutes: 180,
    primary_assets: ["BTC-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(96),
    last_seen_at: hoursAgo(12),
  },
  {
    id: "seed_pat_004",
    name: "Low OI Accumulation Setup",
    conditions: [
      { axis: "open_interest_usd", op: "lt", value: 60_000_000, label: "OI < $60M" },
      { axis: "buy_pressure",      op: "gt", value: 0.58,       label: "buy pressure > 58%" },
      { axis: "funding_rate",      op: "lt", value: 0,          label: "funding < 0%" },
    ],
    sample_size: 22,
    win_rate: 0.636,
    avg_pnl_pct: 4.4,
    avg_duration_minutes: 360,
    primary_assets: ["SOL-USDC-PERP", "MON-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(120),
    last_seen_at: hoursAgo(18),
  },
  {
    id: "seed_pat_005",
    name: "Whale Order Cluster + Negative Funding",
    conditions: [
      { axis: "large_orders_count", op: "gt", value: 8,      label: "large orders > 8" },
      { axis: "funding_rate",       op: "lt", value: -0.0005, label: "funding < -0.05%" },
    ],
    sample_size: 15,
    win_rate: 0.800,
    avg_pnl_pct: 11.3,
    avg_duration_minutes: 300,
    primary_assets: ["ETH-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(144),
    last_seen_at: hoursAgo(24),
  },
  {
    id: "seed_pat_006",
    name: "Bearish Momentum Short Setup",
    conditions: [
      { axis: "momentum_signal", op: "eq", value: "bearish", label: "momentum = bearish" },
      { axis: "buy_pressure",    op: "lt", value: 0.40,      label: "buy pressure < 40%" },
      { axis: "funding_rate",    op: "gt", value: 0.0005,    label: "funding > 0.05%" },
    ],
    sample_size: 17,
    win_rate: 0.647,
    avg_pnl_pct: 5.9,
    avg_duration_minutes: 210,
    primary_assets: ["BTC-USDC-PERP", "ETH-USDC-PERP"],
    verified: true,
    verified_at: hoursAgo(168),
    last_seen_at: hoursAgo(30),
  },
];
