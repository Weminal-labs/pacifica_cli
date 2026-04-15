// ---------------------------------------------------------------------------
// Pacifica DEX SDK -- Type Definitions
// ---------------------------------------------------------------------------
// Types modelled against the real Pacifica API.
// Symbols are uppercase without suffix: "BTC", "ETH", "SOL".
// Order sides: "bid" (buy/long) / "ask" (sell/short).
// Position sides: "long" / "short".
// All numeric values arrive as decimal strings from the API; our internal
// models use `number` and are parsed by the helper functions below.
// Timestamps are milliseconds.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Raw API response shapes (as returned by the REST endpoints)
// ---------------------------------------------------------------------------

/** Market specification from GET /api/v1/info */
export interface MarketInfo {
  symbol: string;
  tick_size: string;
  min_tick: string;
  max_tick: string;
  lot_size: string;
  max_leverage: number;
  isolated_only: boolean;
  min_order_size: string;
  max_order_size: string;
  funding_rate: string;
  next_funding_rate: string;
  created_at: string;
}

/** Price snapshot from GET /api/v1/info/prices */
export interface MarketPrice {
  symbol: string;
  funding: string;
  mark: string;
  mid: string;
  next_funding: string;
  open_interest: string;
  oracle: string;
  timestamp: number;
  volume_24h: string;
  yesterday_price: string;
}

// ---------------------------------------------------------------------------
// Enriched internal models
// ---------------------------------------------------------------------------

/** Combined market info + live price data. */
export interface Market {
  symbol: string;
  price: number;
  markPrice: number;
  oraclePrice: number;
  change24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  nextFundingRate: number;
  maxLeverage: number;
  tickSize: number;
  lotSize: number;
  minOrderSize: number;
  maxOrderSize: number;
}

/** A single price level in the order book. */
export interface OrderBookLevel {
  price: number;
  amount: number;
  orderCount: number;
}

/** Parsed order book from GET /api/v1/book */
export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

/** Parsed account summary from GET /api/v1/account */
export interface Account {
  balance: number;
  accountEquity: number;
  availableToSpend: number;
  availableToWithdraw: number;
  pendingBalance: number;
  totalMarginUsed: number;
  crossMmr: number;
  positionsCount: number;
  ordersCount: number;
  feeLevel: number;
  makerFee: number;
  takerFee: number;
}

/** Parsed open position from GET /api/v1/positions */
export interface Position {
  symbol: string;
  side: "long" | "short";
  amount: number;
  entryPrice: number;
  margin: number;
  funding: number;
  isolated: boolean;
  liquidationPrice?: number;
  createdAt: string;
  updatedAt: string;
}

/** Parsed open order from GET /api/v1/orders */
export interface Order {
  orderId: number;
  clientOrderId?: string;
  symbol: string;
  side: "bid" | "ask";
  price: number;
  initialAmount: number;
  filledAmount: number;
  cancelledAmount: number;
  stopPrice?: number;
  orderType: string;
  reduceOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Historical order from GET /api/v1/orders/history */
export interface OrderHistory {
  orderId: number;
  clientOrderId?: string;
  symbol: string;
  side: "bid" | "ask";
  initialPrice: number;
  averageFilledPrice: number;
  amount: number;
  filledAmount: number;
  orderStatus: "open" | "partially_filled" | "filled" | "cancelled" | "rejected";
  orderType: string;
  reduceOnly: boolean;
  reason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Trade fill from GET /api/v1/trades/history */
export interface TradeHistory {
  historyId: string;
  orderId: number;
  clientOrderId?: string;
  symbol: string;
  amount: number;
  price: number;
  entryPrice: number;
  fee: number;
  pnl: number;
  eventType: string;
  side: string;
  cause: string;
  createdAt: string;
}

/** Funding rate snapshot from GET /api/v1/funding_rate/history */
export interface FundingRate {
  oraclePrice: number;
  bidImpactPrice: number;
  askImpactPrice: number;
  fundingRate: number;
  nextFundingRate: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Order request types (for placing orders via POST)
// ---------------------------------------------------------------------------

export type OrderSide = "bid" | "ask";
export type TimeInForce = "GTC" | "IOC" | "ALO" | "TOB";

export interface TpSlConfig {
  stop_price: string;
  limit_price?: string;
  client_order_id?: string;
}

export interface MarketOrderRequest {
  symbol: string;
  amount: string;
  side: OrderSide;
  slippage_percent: string;
  reduce_only: boolean;
  client_order_id?: string;
  take_profit?: TpSlConfig;
  stop_loss?: TpSlConfig;
}

export interface LimitOrderRequest {
  symbol: string;
  price: string;
  amount: string;
  side: OrderSide;
  tif: TimeInForce;
  reduce_only: boolean;
  client_order_id?: string;
  take_profit?: TpSlConfig;
  stop_loss?: TpSlConfig;
}

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  code: number | null;
  next_cursor?: string;
  has_more?: boolean;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** Raw shape returned by /api/v1/leaderboard */
export interface RawLeaderboardEntry {
  address: string;
  pnl_all_time: string;
  pnl_1d: string;
  pnl_7d: string;
  pnl_30d: string;
  equity_current: string;
  volume_all_time: string;
  volume_30d: string;
}

/** Parsed leaderboard entry with derived fields */
export interface LeaderboardEntry {
  rank: number;
  trader_id: string;
  overall_rep_score: number;
  overall_win_rate: number;
  closed_trades: number;
  top_patterns: string[];
  onchain: {
    pnl_all_time: number;
    pnl_1d: number;
    pnl_7d: number;
    pnl_30d: number;
    equity_current: number;
    volume_all_time: number;
    volume_30d: number;
  };
}

// ---------------------------------------------------------------------------
// API error
// ---------------------------------------------------------------------------

export class PacificaApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly subcode?: number,
  ) {
    super(message);
    this.name = "PacificaApiError";
    // Maintain proper prototype chain for `instanceof` checks
    Object.setPrototypeOf(this, PacificaApiError.prototype);
  }
}

// ---------------------------------------------------------------------------
// WebSocket message types (compact field names as sent by the server)
// ---------------------------------------------------------------------------

/** Prices channel update -- same shape as MarketPrice */
export interface WsPriceUpdate {
  symbol: string;
  funding: string;
  mark: string;
  mid: string;
  next_funding: string;
  open_interest: string;
  oracle: string;
  timestamp: number;
  volume_24h: string;
  yesterday_price: string;
}

/** account_positions channel update */
export interface WsPositionUpdate {
  s: string;   // symbol
  d: string;   // side: bid/ask
  a: string;   // amount
  p: string;   // entry_price
  m: string;   // margin
  f: string;   // funding
  i: boolean;  // isolated
  l: string;   // liquidation_price
  t: number;   // timestamp
  li: number;  // last_order_id
}

/** account_order_updates channel update */
export interface WsOrderUpdate {
  i: number;   // order_id
  I: string;   // client_order_id
  u: string;   // account
  s: string;   // symbol
  d: string;   // side
  p: string;   // avg_price
  ip: string;  // initial_price
  a: string;   // amount
  f: string;   // filled
  oe: string;  // event_type
  os: string;  // order_status
  ot: string;  // order_type
  sp: string;  // stop_price
  r: boolean;  // reduce_only
  ct: string;  // created_at
  ut: string;  // updated_at
  li: number;  // last_order_id
}

// ---------------------------------------------------------------------------
// SDK / client configuration
// ---------------------------------------------------------------------------

export interface PacificaClientConfig {
  baseUrl: string;
  wsUrl: string;
  publicKey: string;
  network: "testnet" | "mainnet";
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse an unknown value into a finite number.
 * Returns `fallback` (default 0) when the value is null, undefined, empty,
 * or not a valid finite number.
 */
export function safeFloat(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;

  const n = typeof val === "number" ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Combine a MarketInfo spec and a MarketPrice snapshot into our enriched
 * Market model.
 */
export function parseMarket(info: MarketInfo, price: MarketPrice): Market {
  const mid = safeFloat(price.mid);
  const yesterday = safeFloat(price.yesterday_price);
  // API returns -1 for markets without yesterday data — treat as unavailable
  const change24h = yesterday > 0
    ? ((mid - yesterday) / yesterday) * 100
    : 0;

  return {
    symbol: info.symbol,
    price: mid,
    markPrice: safeFloat(price.mark),
    oraclePrice: safeFloat(price.oracle),
    change24h,
    volume24h: safeFloat(price.volume_24h),
    openInterest: safeFloat(price.open_interest),
    fundingRate: safeFloat(price.funding),
    nextFundingRate: safeFloat(price.next_funding),
    maxLeverage: info.max_leverage,
    tickSize: safeFloat(info.tick_size),
    lotSize: safeFloat(info.lot_size),
    minOrderSize: safeFloat(info.min_order_size),
    maxOrderSize: safeFloat(info.max_order_size),
  };
}

/** Parse a raw account response into our Account model. */
export function parseAccount(raw: Record<string, unknown>): Account {
  return {
    balance: safeFloat(raw.balance),
    accountEquity: safeFloat(raw.account_equity),
    availableToSpend: safeFloat(raw.available_to_spend),
    availableToWithdraw: safeFloat(raw.available_to_withdraw),
    pendingBalance: safeFloat(raw.pending_balance),
    totalMarginUsed: safeFloat(raw.total_margin_used),
    crossMmr: safeFloat(raw.cross_mmr),
    positionsCount: safeFloat(raw.positions_count),
    ordersCount: safeFloat(raw.orders_count),
    feeLevel: safeFloat(raw.fee_level),
    makerFee: safeFloat(raw.maker_fee),
    takerFee: safeFloat(raw.taker_fee),
  };
}

/** Parse a raw position response into our Position model. */
export function parsePosition(raw: Record<string, unknown>): Position {
  const rawSide = String(raw.side ?? "");
  const side: "long" | "short" = rawSide === "short" ? "short" : "long";

  const liq = raw.liquidation_price;
  const liquidationPrice = liq !== undefined && liq !== null && liq !== ""
    ? safeFloat(liq)
    : undefined;

  return {
    symbol: String(raw.symbol ?? ""),
    side,
    amount: safeFloat(raw.amount),
    entryPrice: safeFloat(raw.entry_price),
    margin: safeFloat(raw.margin),
    funding: safeFloat(raw.funding),
    isolated: Boolean(raw.isolated),
    liquidationPrice,
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}

/** Parse a raw open order response into our Order model. */
export function parseOrder(raw: Record<string, unknown>): Order {
  const rawSide = String(raw.side ?? "");
  const side: "bid" | "ask" = rawSide === "ask" ? "ask" : "bid";

  const stopPrice = raw.stop_price;
  const parsedStopPrice = stopPrice !== undefined && stopPrice !== null && stopPrice !== "" && stopPrice !== "0"
    ? safeFloat(stopPrice)
    : undefined;

  const clientOrderId = raw.client_order_id;
  const parsedClientOrderId = clientOrderId !== undefined && clientOrderId !== null && clientOrderId !== ""
    ? String(clientOrderId)
    : undefined;

  return {
    orderId: safeFloat(raw.order_id),
    clientOrderId: parsedClientOrderId,
    symbol: String(raw.symbol ?? ""),
    side,
    price: safeFloat(raw.price),
    initialAmount: safeFloat(raw.initial_amount),
    filledAmount: safeFloat(raw.filled_amount),
    cancelledAmount: safeFloat(raw.cancelled_amount),
    stopPrice: parsedStopPrice,
    orderType: String(raw.order_type ?? ""),
    reduceOnly: Boolean(raw.reduce_only),
    createdAt: String(raw.created_at ?? ""),
    updatedAt: String(raw.updated_at ?? ""),
  };
}
