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
