export interface Pattern {
  id: string;
  name: string;
  conditions: { axis: string; op: string; value: number | string; label: string }[];
  sample_size: number;
  win_rate: number;
  avg_pnl_pct: number;
  avg_duration_minutes: number;
  primary_assets: string[];
  verified: boolean;
  verified_at?: string;
  last_seen_at: string;
}

export interface WhaleActivity {
  asset: string;
  direction: "long" | "short";
  size_usd: number;
  large_orders_count: number;
  opened_at: string;
}

export interface HighRepSignal {
  asset: string;
  direction: "long" | "short";
  size_usd: number;
  rep_score: number;
  opened_at: string;
}

export interface ReputationEntry {
  rank: number;
  trader_id: string;
  overall_rep_score: number;
  overall_win_rate: number;
  closed_trades: number;
  top_patterns: string[];
}

export type SocialSentiment = "bullish" | "bearish" | "neutral";
export type SignalConfidence = "high" | "medium" | "low" | "unconfirmed";

export interface SocialContext {
  mention_velocity: number;
  sentiment: SocialSentiment;
  smart_follower_score: number;
  narrative_tags: string[];
  top_post_snippets: string[];
  fetched_at: string;
  source: "elfa";
}

export interface ConfirmedSignal {
  pattern_name: string;
  pattern_id: string;
  win_rate: number;
  confidence: SignalConfidence;
  reason: string;
}

export interface TradeRecord {
  id: string;
  asset: string;
  direction: "long" | "short";
  size_usd: number;
  entry_price: number;
  exit_price: number | null;
  opened_at: string;
  closed_at: string | null;
  pattern_tags: string[];
  pnl_usd: number | null;
  pnl_pct: number | null;
  profitable: boolean | null;
  duration_minutes: number | null;
}

export interface OnchainPnl {
  pnl_1d: number;
  pnl_7d: number;
  pnl_30d: number;
  pnl_all_time: number;
  equity_current: number;
  volume_all_time: number;
  volume_30d: number;
}

export interface TraderProfile {
  address: string;
  reputation: ReputationEntry & {
    overall_rep_score: number;
    overall_win_rate: number;
    closed_trades: number;
    total_trades: number;
    top_patterns: string[];
    accuracy_by_condition: Record<string, {
      condition_key: string;
      total_trades: number;
      profitable_trades: number;
      win_rate: number;
      avg_pnl_pct: number;
    }>;
  };
  trade_records: TradeRecord[];
  onchain_pnl: OnchainPnl | null;
  generated_at: string;
}

// ── M12 Pacifica DEX Integration types ───────────────────────────────────────

export interface PacificaMasterAccount {
  address: string;
  balance: string;
  account_equity: string;
  available_to_spend: string;
  available_to_withdraw: string;
  positions_count: number;
  orders_count: number;
  fee_level: number;
  maker_fee: string;
  taker_fee: string;
  cross_mmr: string;
}

export interface PatternMatchOverlay {
  pattern_id: string;
  pattern_name: string;
  win_rate: number;
  sample_size: number;
}

export interface RepSignalOverlay {
  count: number;
  top_traders: string[];
}

export interface FundingWatchOverlay {
  current_rate: number;
  trend: "rising" | "falling" | "flat";
  next_settlement_ms: number;
}

export interface PositionOverlay {
  pattern_match: PatternMatchOverlay | null;
  rep_signal: RepSignalOverlay | null;
  funding_watch: FundingWatchOverlay | null;
}

export interface LivePosition {
  symbol:            string;
  side:              "bid" | "ask";   // bid = long, ask = short
  amount:            string;          // position size
  entry_price:       string;
  margin:            string;
  funding:           string;          // cumulative funding paid/received
  isolated:          boolean;         // false = cross, true = isolated
  liquidation_price: string;
  created_at?:       number;
  updated_at?:       number;
  overlay:           PositionOverlay;
}

export interface PortfolioAccount {
  address: string;
  label: string | null;
  is_master: boolean;
  balance: string;
  equity: string;
  positions: LivePosition[];
}

export interface PortfolioComposite {
  master: PacificaMasterAccount | null;
  accounts: PortfolioAccount[];
  reputation: ReputationEntry | null;
  stale?: boolean;
  generated_at: string;
}

export interface SocialData {
  asset: string;
  social: SocialContext;
  confirmed_signals: ConfirmedSignal[];
  best_signal: ConfirmedSignal | null;
  generated_at: string;
}
