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

export interface SocialData {
  asset: string;
  social: SocialContext;
  confirmed_signals: ConfirmedSignal[];
  best_signal: ConfirmedSignal | null;
  generated_at: string;
}
