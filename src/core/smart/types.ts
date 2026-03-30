// ---------------------------------------------------------------------------
// Smart Order Manager -- Type Definitions
// ---------------------------------------------------------------------------

export type SmartOrderType = "trailing_stop" | "partial_tp";
export type SmartOrderStatus = "active" | "triggered" | "cancelled" | "error";

// ---------------------------------------------------------------------------
// Trailing Stop
// ---------------------------------------------------------------------------

export interface TrailingStopConfig {
  /** Symbol to monitor (Pacifica format, e.g. "BTC"). */
  symbol: string;
  /** Position side being protected. */
  positionSide: "long" | "short";
  /** Trail distance as a percentage (e.g. 2 = 2%). */
  distancePercent: number;
}

// ---------------------------------------------------------------------------
// Partial Take-Profit
// ---------------------------------------------------------------------------

export interface PartialTpLevel {
  /** Target price to trigger this level. */
  price: number;
  /** Percentage of position to close (e.g. 25 = 25%). */
  percent: number;
  /** Whether this level has already been triggered. */
  triggered?: boolean;
}

export interface PartialTpConfig {
  /** Symbol to monitor (Pacifica format, e.g. "BTC"). */
  symbol: string;
  /** Position side being managed. */
  positionSide: "long" | "short";
  /** Take-profit levels in order. */
  levels: PartialTpLevel[];
}

// ---------------------------------------------------------------------------
// Smart Order (union -- extend as new types are added)
// ---------------------------------------------------------------------------

export interface SmartOrder {
  id: string;
  type: SmartOrderType;
  status: SmartOrderStatus;
  symbol: string;
  positionSide: "long" | "short";
  createdAt: string;
  updatedAt: string;
  triggeredAt?: string;

  // Trailing stop specific fields
  distancePercent: number;
  /** Best price tracked since creation. */
  extremePrice: number;
  /** The computed stop-loss trigger price based on extreme + distance. */
  triggerPrice: number;
  /** Error message if status is "error". */
  errorMessage?: string;

  // Partial TP specific fields
  levels?: PartialTpLevel[];
}

// ---------------------------------------------------------------------------
// Persisted state file shape
// ---------------------------------------------------------------------------

export interface SmartOrderState {
  orders: SmartOrder[];
  lastUpdated: string;
}
