// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Market Intelligence Schema
// ---------------------------------------------------------------------------
// Pure TypeScript interfaces — zero imports, zero runtime code.
// All intelligence modules share these types as their stable contract.
// ---------------------------------------------------------------------------

/** Pinned schema version — increment when breaking changes are introduced. */
export const SCHEMA_VERSION = "1.0" as const;

// ---------------------------------------------------------------------------
// Market summaries
// ---------------------------------------------------------------------------

/** Lightweight ranked snapshot of a single market, used in sorted lists. */
export interface MarketSummary {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  /** Computed sort score (0–100, meaning depends on the sort dimension). */
  score: number;
  /** 1-based rank in the result set. */
  rank: number;
}

// ---------------------------------------------------------------------------
// Liquidity analysis
// ---------------------------------------------------------------------------

/** Full liquidity profile for a market, derived from its live order book. */
export interface LiquidityScan {
  symbol: string;
  volume24h: number;
  /** Bid/ask spread as a percentage of mid price. */
  spreadPct: number;
  /** Total bid-side liquidity (USD) within 10 % of mid price. */
  bidDepth10pct: number;
  /** Total ask-side liquidity (USD) within 10 % of mid price. */
  askDepth10pct: number;
  /** Estimated price slippage (%) for a $10 k market buy. */
  slippage10k: number;
  /** Estimated price slippage (%) for a $50 k market buy. */
  slippage50k: number;
  /** Estimated price slippage (%) for a $100 k market buy. */
  slippage100k: number;
  /** Composite liquidity score 0–100 (volume 40 pts, depth 40 pts, spread 20 pts). */
  liquidityScore: number;
}

// ---------------------------------------------------------------------------
// Trade pattern detection
// ---------------------------------------------------------------------------

/** A single large trade detected above a configurable USD threshold. */
export interface LargeOrder {
  price: number;
  /** Size in the base asset (e.g. ETH). */
  sizeBase: number;
  /** Size in USD. */
  sizeUsd: number;
  side: "buy" | "sell";
  /** ISO 8601 timestamp of the trade. */
  timestamp: string;
}

/** Directional momentum classification. */
export type MomentumSignal = "bullish" | "bearish" | "neutral";

/** Aggregated trade pattern analysis for a single symbol. */
export interface TradePatternResult {
  symbol: string;
  /** Number of trades analysed. */
  sampleSize: number;
  /** Buy pressure ratio 0.0–1.0 (1.0 = all volume was buying). */
  buyPressure: number;
  /** Volume-weighted average price across the sample. */
  vwap: number;
  currentPrice: number;
  /** Positive value means current price is above VWAP. */
  priceVsVwapPct: number;
  /** Large orders sorted by size descending. */
  largeOrders: LargeOrder[];
  momentumSignal: MomentumSignal;
  /** Momentum magnitude –1.0 (full bearish) to +1.0 (full bullish). */
  momentum: number;
}

// ---------------------------------------------------------------------------
// Alert system
// ---------------------------------------------------------------------------

/** Condition type that defines what a price alert monitors. */
export type AlertType =
  | "price_above"
  | "price_below"
  | "funding_above"
  | "funding_below"
  | "volume_spike";

/** Lifecycle status of an alert. */
export type AlertStatus = "active" | "triggered" | "dismissed";

/** How urgently an alert requires attention at triage time. */
export type AlertUrgency = "triggered" | "near" | "dormant";

/** A persisted price / funding / volume alert. */
export interface Alert {
  id: string;
  symbol: string;
  type: AlertType;
  threshold: number;
  status: AlertStatus;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp set when the alert first fired. */
  triggeredAt?: string;
  /** Optional human note for context. */
  note?: string;
}

/** Real-time triage result combining an alert with its current market state. */
export interface AlertTriageResult {
  alert: Alert;
  /** The market value being compared against the threshold at triage time. */
  currentValue: number;
  /**
   * How far the current value is from the threshold, expressed as a percentage.
   * Negative = threshold already breached (triggered).
   * Positive = still approaching the threshold.
   */
  distancePct: number;
  urgency: AlertUrgency;
}

// ---------------------------------------------------------------------------
// Intelligence snapshot
// ---------------------------------------------------------------------------

/** A point-in-time snapshot of all intelligence data for persistence / display. */
export interface MarketIntelligenceSnapshot {
  /** Schema version for forward-compatibility checks. */
  schemaVersion: typeof SCHEMA_VERSION;
  /** ISO 8601 timestamp when this snapshot was generated. */
  generatedAt: string;
  markets: MarketSummary[];
  /** Top 5 by 24 h price gain. */
  topGainers: MarketSummary[];
  /** Top 5 by 24 h price loss. */
  topLosers: MarketSummary[];
  /** Top 5 by absolute funding rate. */
  highestFunding: MarketSummary[];
  /** Top 5 markets ranked by composite liquidity score. */
  liquidityLeaders: LiquidityScan[];
  /** Alerts whose threshold has already been crossed. */
  triggeredAlerts: AlertTriageResult[];
  /** Alerts within 5 % of their threshold. */
  nearAlerts: AlertTriageResult[];
}

// ---------------------------------------------------------------------------
// M11: Intelligence Layer types
// ---------------------------------------------------------------------------

/** Point-in-time market context captured at trade entry or exit. */
export interface MarketContext {
  funding_rate: number;
  open_interest_usd: number;
  /** OI percentage change over the last ~4 hours (0 when unavailable). */
  oi_change_4h_pct: number;
  mark_price: number;
  volume_24h_usd: number;
  /** Buy-pressure ratio 0.0–1.0 from computeBuyPressure(). */
  buy_pressure: number;
  momentum_signal: MomentumSignal;
  /** Momentum magnitude –1.0 (bearish) to +1.0 (bullish). */
  momentum_value: number;
  /** Count of large orders (>$50k) detected at capture time. */
  large_orders_count: number;
  /** ISO 8601 timestamp when this context was captured. */
  captured_at: string;
  /** Social context from Elfa — undefined when API key not configured. */
  social?: SocialContext;
}

/** P&L and exit context attached when a tracked position closes. */
export interface TradeOutcome {
  pnl_pct: number;
  pnl_usd: number;
  duration_minutes: number;
  exit_price: number;
  exit_market_context: MarketContext;
  profitable: boolean;
  liquidated: boolean;
}

/**
 * A single trade observation record — the atomic unit of the intelligence layer.
 * Created silently at trade execution; outcome attached when the position closes.
 */
export interface IntelligenceRecord {
  /** UUID prefixed with "ir_". */
  id: string;
  /** SHA-256 hash of the trader's API key — one-way anonymisation. */
  trader_id: string;
  /** Full market symbol, e.g. "BTC-USDC-PERP". */
  asset: string;
  direction: "long" | "short";
  size_usd: number;
  entry_price: number;
  market_context: MarketContext;
  /** ISO 8601 — when the trade was opened. */
  opened_at: string;
  /** ISO 8601 — set when position closes. */
  closed_at?: string;
  /** Undefined until the position closes. */
  outcome?: TradeOutcome;
  /** Condition labels active at entry, e.g. ["negative_funding", "rising_oi"]. */
  pattern_tags: string[];
  schema_version: "1.0";
}

/** One leg of a verified market pattern's condition set. */
export interface PatternCondition {
  /** The MarketContext key being tested. */
  axis: string;
  op: "lt" | "gt" | "lte" | "gte" | "eq";
  value: number | string;
  /** Human-readable label, e.g. "funding < -0.03%". */
  label: string;
}

/** A market pattern verified by statistical analysis of IntelligenceRecords. */
export interface DetectedPattern {
  /** UUID prefixed with "pat_". */
  id: string;
  name: string;
  conditions: PatternCondition[];
  sample_size: number;
  /** Win rate 0.0–1.0. */
  win_rate: number;
  avg_pnl_pct: number;
  avg_duration_minutes: number;
  /** Assets this pattern most frequently appears on. */
  primary_assets: string[];
  verified: boolean;
  /** ISO 8601 — set when pattern crosses verification threshold. */
  verified_at?: string;
  /** Phase 2: onchain token ID when minted. */
  nft_token_id?: string;
  /** ISO 8601 of the most recent trade matching this pattern. */
  last_seen_at: string;
}

/** Per-condition accuracy breakdown for a single trader. */
export interface ConditionAccuracy {
  condition_key: string;
  total_trades: number;
  profitable_trades: number;
  win_rate: number;
  avg_pnl_pct: number;
  last_updated: string;
}

/** Aggregated reputation record for one (anonymised) trader. */
export interface TraderReputation {
  trader_id: string;
  total_trades: number;
  closed_trades: number;
  overall_win_rate: number;
  /** Composite score 0–100. */
  overall_rep_score: number;
  accuracy_by_condition: Record<string, ConditionAccuracy>;
  top_patterns: string[];
  last_updated: string;
}

// ---------------------------------------------------------------------------
// M12: Elfa Social Intelligence types
// ---------------------------------------------------------------------------

/** Quality-weighted social sentiment derived from smart-follower accounts. */
export type SocialSentiment = "bullish" | "bearish" | "neutral";

/**
 * Social context from Elfa API — optional enrichment layer.
 * Only present when elfa.api_key is configured in .pacifica.yaml.
 */
export interface SocialContext {
  /** Mention velocity: ratio of last-hour mentions vs 24h hourly baseline.
   *  1.0 = baseline, 3.0 = 3× spike. */
  mention_velocity: number;
  /** Quality-weighted sentiment from smart-follower accounts. */
  sentiment: SocialSentiment;
  /** Smart follower signal strength 0.0–1.0 (quality-adjusted bullish pressure). */
  smart_follower_score: number;
  /** Active narrative tags from Elfa trending-narratives. */
  narrative_tags: string[];
  /** Top 3 post snippets by relevance (text only — no author info). */
  top_post_snippets: string[];
  /** ISO 8601 timestamp of fetch. */
  fetched_at: string;
  /** Data source confirmation. */
  source: "elfa";
}

/** Confidence classification combining onchain pattern + social confirmation. */
export type SignalConfidence = "high" | "medium" | "low" | "unconfirmed";

/** Combined signal: onchain pattern + optional social confirmation. */
export interface ConfirmedSignal {
  pattern: DetectedPattern;
  social?: SocialContext;
  confidence: SignalConfidence;
  /** Human-readable reason, e.g. "Pattern (72%) + bullish social spike (3.4×)". */
  confidence_reason: string;
}
