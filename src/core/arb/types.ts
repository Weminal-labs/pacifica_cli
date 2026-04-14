// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Funding Rate Arbitrage Bot Types
// ---------------------------------------------------------------------------

export type ArbStrategy = "single_sided";
export type ArbPositionStatus = "pending" | "active" | "closing" | "closed" | "error";
export type ArbExitReason =
  | "settlement"
  | "rate_inverted"
  | "apr_below_floor"
  | "manual_close"
  | "external_close"
  | "daily_loss_limit"
  | "error";

// ---------------------------------------------------------------------------
// Opportunity (detected, not yet entered)
// ---------------------------------------------------------------------------

export interface ArbOpportunity {
  symbol: string;
  /** Per-interval funding rate (e.g. 8h). Positive = longs pay / shorts collect. */
  currentRate: number;
  predictedRate: number;
  /** Annualized APR based on max(|current|, |predicted|) × intervals_per_year */
  annualizedApr: number;
  /** Which side collects funding at this rate */
  side: "long_collects" | "short_collects";
  markPrice: number;
  volume24hUsd: number;
  bookSpreadBps: number;
  /** ISO timestamp of next funding settlement */
  nextFundingAt: string;
  msToFunding: number;
  /** Composite ranking score (higher = better) */
  score: number;
  /** External exchange funding rate for comparison (if fetched) */
  externalRate?: number;
  externalSource?: "binance" | "bybit";
  /** Divergence vs external in basis points */
  divergenceBps?: number;
}

// ---------------------------------------------------------------------------
// Arb Position (entered, monitoring, or closed)
// ---------------------------------------------------------------------------

export interface ArbLeg {
  side: "bid" | "ask";   // bid = long, ask = short
  amount: number;        // base asset units
  entryPrice: number;
  /** uuid for idempotent placement */
  clientOrderId: string;
  entryOrderId?: number;
  exitClientOrderId?: string;
  exitOrderId?: number;
  fees: number;          // cumulative USD
}

export interface ArbPosition {
  id: string;
  strategy: ArbStrategy;
  symbol: string;
  status: ArbPositionStatus;
  leg: ArbLeg;
  openedAt: string;
  closedAt?: string;
  entryRate: number;
  entryApr: number;
  notionalUsd: number;
  fundingIntervalsHeld: number;
  realizedFundingUsd: number;
  realizedPnlUsd: number;
  totalFeesUsd: number;
  nextEvalAt?: string;
  exitReason?: ArbExitReason;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Persistent state (written to ~/.pacifica/arb-state.json)
// ---------------------------------------------------------------------------

export interface ArbLifetimeStats {
  totalFundingCollectedUsd: number;
  totalFeesPaidUsd: number;
  totalNetPnlUsd: number;
  positionsOpened: number;
  positionsClosed: number;
  /** Running arb daily loss — resets at midnight */
  dailyLossUsd: number;
  dailyLossResetDate: string; // YYYY-MM-DD
}

export interface ArbState {
  positions: ArbPosition[];
  lifetime: ArbLifetimeStats;
  lastScanAt?: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// External rate result
// ---------------------------------------------------------------------------

export interface ExternalFundingRate {
  symbol: string;
  rate: number;
  source: "binance" | "bybit";
}
