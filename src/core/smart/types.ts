// ---------------------------------------------------------------------------
// Smart Order Manager -- Type Definitions
// ---------------------------------------------------------------------------

export type SmartOrderType = "trailing_stop";
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
}

// ---------------------------------------------------------------------------
// Persisted state file shape
// ---------------------------------------------------------------------------

export interface SmartOrderState {
  orders: SmartOrder[];
  lastUpdated: string;
}
