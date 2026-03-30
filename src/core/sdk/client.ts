// ---------------------------------------------------------------------------
// Pacifica DEX SDK -- REST API Client
// ---------------------------------------------------------------------------

import type { SignerConfig } from "./signer.js";
import type {
  Market,
  MarketInfo,
  MarketPrice,
  Account,
  Position,
  Order,
  OrderBook,
  OrderBookLevel,
  FundingRate,
  TradeHistory,
  OrderHistory,
  MarketOrderRequest,
  LimitOrderRequest,
  TpSlConfig,
  OrderSide,
  ApiResponse,
} from "./types.js";
import { signPayload } from "./signer.js";
import {
  parseMarket,
  parseAccount,
  parsePosition,
  parseOrder,
  safeFloat,
  PacificaApiError,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ClientConfig {
  network: "testnet" | "mainnet";
  signer?: SignerConfig; // Optional -- not needed for public endpoints
}

const BASE_URLS = {
  testnet: "https://test-api.pacifica.fi",
  mainnet: "https://api.pacifica.fi",
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Validates that a symbol string contains only safe characters and is bounded. */
const SYMBOL_PATTERN = /^[a-zA-Z0-9_-]{1,20}$/;

function validateSymbol(symbol: string): void {
  if (!SYMBOL_PATTERN.test(symbol)) {
    throw new Error(`Invalid symbol: "${symbol}" -- must be 1-20 chars matching /^[a-zA-Z0-9_-]+$/`);
  }
}

/** Build a URL with optional query parameters. */
function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string>,
): string {
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  expiresAt: number; // monotonic ms via performance.now()
}

class TtlCache {
  private readonly store = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (performance.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: performance.now() + ttlMs });
  }

  /** Remove expired entries. Called periodically to avoid unbounded growth. */
  prune(): void {
    const now = performance.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sliding-window rate limiter
// ---------------------------------------------------------------------------

class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxCredits: number;
  private readonly timestamps: number[] = [];

  constructor(maxCredits: number, windowMs: number = 60_000) {
    this.maxCredits = maxCredits;
    this.windowMs = windowMs;
  }

  /**
   * Wait until a request credit is available. Each call consumes 1 credit.
   * Resolves immediately if capacity exists, otherwise delays.
   */
  async acquire(): Promise<void> {
    this.evictExpired();

    while (this.timestamps.length >= this.maxCredits) {
      const oldest = this.timestamps[0]!;
      const waitMs = oldest + this.windowMs - Date.now() + 1;
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
      this.evictExpired();
    }

    this.timestamps.push(Date.now());
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Cache TTL constants (milliseconds)
// ---------------------------------------------------------------------------

const CACHE_TTL_MARKET = 10_000; // 10 s for public market data
const CACHE_TTL_ACCOUNT = 2_000; //  2 s for account data

// ---------------------------------------------------------------------------
// Retry constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_JITTER_MAX_MS = 200;

// ---------------------------------------------------------------------------
// PacificaClient
// ---------------------------------------------------------------------------

export class PacificaClient {
  private readonly baseUrl: string;
  private readonly signer?: SignerConfig;
  private readonly cache = new TtlCache();
  private readonly limiter: SlidingWindowRateLimiter;
  private readonly stats = {
    requestsTotal: 0,
    cacheHits: 0,
    retries: 0,
    errors: 0,
  };

  /** Interval handle for periodic cache pruning. */
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: ClientConfig) {
    this.baseUrl = BASE_URLS[config.network];
    this.signer = config.signer;

    // Credit quota depends on whether we have an API key (signer).
    const credits = config.signer ? 300 : 125;
    this.limiter = new SlidingWindowRateLimiter(credits);

    // Prune cache every 30 s to avoid memory leaks on long-lived clients.
    this.pruneTimer = setInterval(() => this.cache.prune(), 30_000);
    // Allow the Node process to exit even if the timer is pending.
    if (
      this.pruneTimer &&
      typeof this.pruneTimer === "object" &&
      "unref" in this.pruneTimer
    ) {
      this.pruneTimer.unref();
    }
  }

  /** Clean up resources (timers). Call when the client is no longer needed. */
  destroy(): void {
    if (this.pruneTimer !== undefined) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Public endpoints (no auth)
  // -------------------------------------------------------------------------

  /**
   * Fetch all markets by merging /info (specs) with /info/prices (live data).
   */
  async getMarkets(): Promise<Market[]> {
    const [infoResp, pricesResp] = await Promise.all([
      this.get<ApiResponse<MarketInfo[]>>("/api/v1/info", undefined, CACHE_TTL_MARKET),
      this.get<ApiResponse<MarketPrice[]>>("/api/v1/info/prices", undefined, CACHE_TTL_MARKET),
    ]);

    const infos = infoResp.data ?? [];
    const prices = pricesResp.data ?? [];

    // Index prices by symbol for O(1) lookup.
    const priceMap = new Map<string, MarketPrice>();
    for (const p of prices) {
      priceMap.set(p.symbol, p);
    }

    // Only include markets that have a matching price entry. Markets
    // without price data are excluded since parseMarket requires it.
    const markets: Market[] = [];
    for (const info of infos) {
      const price = priceMap.get(info.symbol);
      if (price) {
        markets.push(parseMarket(info, price));
      }
    }
    return markets;
  }

  /**
   * Fetch the order book for a symbol.
   */
  async getOrderBook(symbol: string, aggLevel?: number): Promise<OrderBook> {
    validateSymbol(symbol);
    const params: Record<string, string> = { symbol };
    if (aggLevel !== undefined) {
      params.agg_level = String(aggLevel);
    }

    const resp = await this.get<ApiResponse<RawOrderBook>>(
      "/api/v1/book",
      params,
      CACHE_TTL_MARKET,
    );

    const raw = resp.data;
    if (!raw) {
      throw new PacificaApiError("Empty order book response", 200);
    }

    return parseRawOrderBook(raw);
  }

  /**
   * Fetch historical funding rates for a symbol.
   */
  async getFundingHistory(symbol: string, limit?: number): Promise<FundingRate[]> {
    validateSymbol(symbol);
    const params: Record<string, string> = { symbol };
    if (limit !== undefined) {
      params.limit = String(limit);
    }

    const resp = await this.get<ApiResponse<RawFundingRate[]>>(
      "/api/v1/funding_rate/history",
      params,
      CACHE_TTL_MARKET,
    );

    return (resp.data ?? []).map(parseRawFundingRate);
  }

  /**
   * Fetch recent trades for a symbol.
   */
  async getRecentTrades(symbol: string): Promise<TradeHistory[]> {
    validateSymbol(symbol);
    const resp = await this.get<ApiResponse<RawPublicTrade[]>>(
      "/api/v1/trades",
      { symbol },
      CACHE_TTL_MARKET,
    );

    return (resp.data ?? []).map((t) => parseRawPublicTrade(t, symbol));
  }

  // -------------------------------------------------------------------------
  // Account endpoints (need account address from signer)
  // -------------------------------------------------------------------------

  /**
   * Fetch account information.
   */
  async getAccount(): Promise<Account> {
    const signer = this.requireSigner();
    const resp = await this.get<ApiResponse<Record<string, unknown>>>(
      "/api/v1/account",
      { account: signer.publicKey },
      CACHE_TTL_ACCOUNT,
    );

    const raw = resp.data;
    if (!raw) {
      throw new PacificaApiError("Empty account response", 200);
    }

    return parseAccount(raw);
  }

  /**
   * Fetch current open positions.
   */
  async getPositions(): Promise<Position[]> {
    const signer = this.requireSigner();
    const resp = await this.get<ApiResponse<Record<string, unknown>[]>>(
      "/api/v1/positions",
      { account: signer.publicKey },
      CACHE_TTL_ACCOUNT,
    );

    return (resp.data ?? []).map(parsePosition);
  }

  /**
   * Fetch current open orders.
   */
  async getOrders(): Promise<Order[]> {
    const signer = this.requireSigner();
    const resp = await this.get<ApiResponse<Record<string, unknown>[]>>(
      "/api/v1/orders",
      { account: signer.publicKey },
      CACHE_TTL_ACCOUNT,
    );

    return (resp.data ?? []).map(parseOrder);
  }

  /**
   * Fetch order history (filled, cancelled, etc.).
   */
  async getOrderHistory(limit?: number): Promise<OrderHistory[]> {
    const signer = this.requireSigner();
    const params: Record<string, string> = { account: signer.publicKey };
    if (limit !== undefined) {
      params.limit = String(limit);
    }

    const resp = await this.get<ApiResponse<OrderHistory[]>>(
      "/api/v1/orders/history",
      params,
      CACHE_TTL_ACCOUNT,
    );

    return resp.data ?? [];
  }

  /**
   * Fetch trade history for the account.
   */
  async getTradeHistory(symbol?: string, limit?: number): Promise<TradeHistory[]> {
    const signer = this.requireSigner();
    const params: Record<string, string> = { account: signer.publicKey };
    if (symbol !== undefined) {
      validateSymbol(symbol);
      params.symbol = symbol;
    }
    if (limit !== undefined) {
      params.limit = String(limit);
    }

    const resp = await this.get<ApiResponse<TradeHistory[]>>(
      "/api/v1/trades/history",
      params,
      CACHE_TTL_ACCOUNT,
    );

    return resp.data ?? [];
  }

  // -------------------------------------------------------------------------
  // Trading endpoints (requires signing)
  // -------------------------------------------------------------------------

  /**
   * Place a market order.
   */
  async placeMarketOrder(req: MarketOrderRequest): Promise<{ orderId: number }> {
    validateSymbol(req.symbol);

    const payload: Record<string, unknown> = {
      symbol: req.symbol,
      amount: req.amount,
      side: req.side,
      slippage_percent: req.slippage_percent,
      reduce_only: req.reduce_only,
    };

    if (req.client_order_id) {
      payload.client_order_id = req.client_order_id;
    }
    if (req.take_profit) {
      payload.take_profit = buildTpSlPayload(req.take_profit);
    }
    if (req.stop_loss) {
      payload.stop_loss = buildTpSlPayload(req.stop_loss);
    }

    const resp = await this.post<{ order_id: number }>(
      "/api/v1/orders/create_market",
      "create_market_order",
      payload,
    );

    return { orderId: resp.order_id };
  }

  /**
   * Place a limit order.
   */
  async placeLimitOrder(req: LimitOrderRequest): Promise<{ orderId: number }> {
    validateSymbol(req.symbol);

    const payload: Record<string, unknown> = {
      symbol: req.symbol,
      price: req.price,
      amount: req.amount,
      side: req.side,
      tif: req.tif,
      reduce_only: req.reduce_only,
    };

    if (req.client_order_id) {
      payload.client_order_id = req.client_order_id;
    }
    if (req.take_profit) {
      payload.take_profit = buildTpSlPayload(req.take_profit);
    }
    if (req.stop_loss) {
      payload.stop_loss = buildTpSlPayload(req.stop_loss);
    }

    const resp = await this.post<{ order_id: number }>(
      "/api/v1/orders/create",
      "create_order",
      payload,
    );

    return { orderId: resp.order_id };
  }

  /**
   * Cancel a single order.
   */
  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    validateSymbol(symbol);

    await this.post<{ success: boolean }>(
      "/api/v1/orders/cancel",
      "cancel_order",
      {
        symbol,
        order_id: orderId,
      },
    );
  }

  /**
   * Cancel all open orders, optionally filtered by symbol.
   */
  async cancelAllOrders(symbol?: string): Promise<{ cancelledCount: number }> {
    if (symbol !== undefined) {
      validateSymbol(symbol);
    }

    const payload: Record<string, unknown> = {
      all_symbols: symbol === undefined,
      exclude_reduce_only: false,
    };

    if (symbol !== undefined) {
      payload.symbol = symbol;
    }

    const resp = await this.post<{ cancelled_count: number }>(
      "/api/v1/orders/cancel_all",
      "cancel_all_orders",
      payload,
    );

    return { cancelledCount: resp.cancelled_count };
  }

  /**
   * Set take-profit and/or stop-loss on an existing position.
   */
  async setPositionTpSl(
    symbol: string,
    side: OrderSide,
    tp?: TpSlConfig,
    sl?: TpSlConfig,
  ): Promise<void> {
    validateSymbol(symbol);

    if (!tp && !sl) {
      throw new Error("At least one of take_profit or stop_loss must be provided");
    }

    const payload: Record<string, unknown> = {
      symbol,
      side,
    };

    if (tp) {
      payload.take_profit = buildTpSlPayload(tp);
    }
    if (sl) {
      payload.stop_loss = buildTpSlPayload(sl);
    }

    await this.post<{ success: boolean }>(
      "/api/v1/positions/tpsl",
      "set_position_tpsl",
      payload,
    );
  }

  /**
   * Update leverage for a symbol.
   */
  async updateLeverage(symbol: string, leverage: number): Promise<void> {
    validateSymbol(symbol);

    if (!Number.isInteger(leverage) || leverage < 1) {
      throw new Error(`Invalid leverage: ${leverage} -- must be a positive integer`);
    }

    await this.post<{ success: boolean }>(
      "/api/v1/account/leverage",
      "update_leverage",
      {
        symbol,
        leverage,
      },
    );
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /**
   * Test connectivity. Tries a public endpoint, then optionally fetches
   * account data if a signer is configured.
   */
  async testConnection(): Promise<{ connected: boolean; balance?: number; equity?: number }> {
    try {
      // Public endpoint probe.
      await this.get<ApiResponse<unknown>>("/api/v1/info");

      if (this.signer) {
        const account = await this.getAccount();
        return {
          connected: true,
          balance: account.balance,
          equity: account.accountEquity,
        };
      }

      return { connected: true };
    } catch {
      return { connected: false };
    }
  }

  /**
   * Returns runtime statistics for diagnostics.
   */
  getRuntimeStats(): {
    requestsTotal: number;
    cacheHits: number;
    retries: number;
    errors: number;
  } {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------
  // Private: HTTP primitives
  // -------------------------------------------------------------------------

  /**
   * GET with optional caching and retry.
   */
  private async get<T>(
    path: string,
    params?: Record<string, string>,
    cacheTtl?: number,
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path, params);

    // Check cache first.
    if (cacheTtl !== undefined) {
      const cached = this.cache.get<T>(url);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        return cached;
      }
    }

    await this.limiter.acquire();
    this.stats.requestsTotal++;

    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PacificaApiError(
        `Invalid JSON response from ${url}`,
        response.status,
      );
    }
    this.assertApiSuccess(body, response.status);

    const data = body as T;

    if (cacheTtl !== undefined) {
      this.cache.set(url, data, cacheTtl);
    }

    return data;
  }

  /**
   * Signed POST for trading operations.
   *
   * The `signPayload` function handles:
   *   - timestamp generation
   *   - recursive key sorting of header + data
   *   - compact JSON serialization
   *   - Ed25519 signing and Base58 encoding
   *   - building the flat request body with account, signature, timestamp, etc.
   */
  private async post<T>(
    path: string,
    operationType: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const signer = this.requireSigner();
    const url = buildUrl(this.baseUrl, path);

    // signPayload returns the complete body ready to POST.
    const body = signPayload(signer, operationType, payload);

    await this.limiter.acquire();
    this.stats.requestsTotal++;

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let respBody: unknown;
    try {
      respBody = await response.json();
    } catch {
      throw new PacificaApiError(
        "Invalid JSON response from Pacifica API",
        response.status,
      );
    }
    this.assertApiSuccess(respBody, response.status);

    // The API wraps results under the `data` key in the response envelope.
    // Return `data` when present, otherwise fall back to the raw body.
    const envelope = respBody as ApiResponse<T>;
    return (envelope.data ?? respBody) as T;
  }

  /**
   * Core fetch with exponential backoff retry on 429 and 5xx errors.
   *
   * Backoff schedule: 1 s, 2 s, 4 s (max 3 retries).
   * Random jitter of 0--200 ms is added to each delay.
   * On 429, the Retry-After header is respected when present.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, init);

        if (response.ok) {
          return response;
        }

        const status = response.status;
        const isRetryable = status === 429 || status >= 500;

        if (!isRetryable || attempt === MAX_RETRIES) {
          // Non-retryable error or retries exhausted -- let the caller handle.
          return response;
        }

        let delayMs: number;

        if (status === 429) {
          // Respect Retry-After header if present (value in seconds).
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            const seconds = Number(retryAfter);
            delayMs = Number.isFinite(seconds) ? seconds * 1000 : RETRY_BASE_MS;
          } else {
            delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
          }
        } else {
          // 5xx: exponential backoff.
          delayMs = RETRY_BASE_MS * Math.pow(2, attempt);
        }

        // Add jitter: random 0 .. RETRY_JITTER_MAX_MS.
        delayMs += Math.random() * RETRY_JITTER_MAX_MS;

        this.stats.retries++;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      } catch (err) {
        // Network-level error (DNS failure, connection refused, etc.).
        lastError = err instanceof Error ? err : new Error(String(err));
        this.stats.errors++;

        if (attempt === MAX_RETRIES) {
          break;
        }

        const delayMs =
          RETRY_BASE_MS * Math.pow(2, attempt) +
          Math.random() * RETRY_JITTER_MAX_MS;
        this.stats.retries++;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError ??
      new Error(`Request to ${url} failed after ${MAX_RETRIES + 1} attempts`);
  }

  /**
   * Throws PacificaApiError if the response envelope indicates failure.
   *
   * The error `code` is set to the HTTP status. For 422 (business logic)
   * errors the `subcode` carries the API-specific error code (0--10).
   */
  private assertApiSuccess(body: unknown, httpStatus: number): void {
    if (typeof body !== "object" || body === null) {
      this.stats.errors++;
      throw new PacificaApiError("Invalid response body", httpStatus);
    }

    const envelope = body as Record<string, unknown>;

    if (envelope.success === false) {
      const message =
        typeof envelope.error === "string"
          ? envelope.error
          : "Unknown API error";
      const subcode =
        typeof envelope.code === "number" ? envelope.code : undefined;
      this.stats.errors++;
      throw new PacificaApiError(message, httpStatus, subcode);
    }
  }

  /**
   * Ensures a signer is configured. Throws a clear error if not.
   */
  private requireSigner(): SignerConfig {
    if (!this.signer) {
      throw new Error(
        "This operation requires a signer. Provide a SignerConfig when creating PacificaClient.",
      );
    }
    return this.signer;
  }
}

// ---------------------------------------------------------------------------
// Internal raw API types (server-side shapes before parsing)
// ---------------------------------------------------------------------------

/** Raw order book from GET /api/v1/book */
interface RawOrderBook {
  s: string;
  l: [RawBookLevel[], RawBookLevel[]];
  t: number;
}

interface RawBookLevel {
  p: string;
  a: string;
  n: number;
}

/** Raw funding rate entry from GET /api/v1/funding_rate/history */
interface RawFundingRate {
  oracle_price: string;
  bid_impact_price: string;
  ask_impact_price: string;
  funding_rate: string;
  next_funding_rate: string;
  created_at: string;
}

/** Raw public trade from GET /api/v1/trades */
interface RawPublicTrade {
  event_type: string;
  price: string;
  amount: string;
  side: string;
  cause: string;
  created_at: string;
  last_order_id: number;
}

// ---------------------------------------------------------------------------
// Parsers for raw API responses (local to client, not exported)
// ---------------------------------------------------------------------------

function parseRawOrderBook(raw: RawOrderBook): OrderBook {
  const [rawBids, rawAsks] = raw.l;
  return {
    symbol: raw.s,
    bids: (rawBids ?? []).map(parseRawBookLevel),
    asks: (rawAsks ?? []).map(parseRawBookLevel),
    timestamp: raw.t,
  };
}

function parseRawBookLevel(raw: RawBookLevel): OrderBookLevel {
  return {
    price: safeFloat(raw.p),
    amount: safeFloat(raw.a),
    orderCount: raw.n,
  };
}

function parseRawFundingRate(raw: RawFundingRate): FundingRate {
  return {
    oraclePrice: safeFloat(raw.oracle_price),
    bidImpactPrice: safeFloat(raw.bid_impact_price),
    askImpactPrice: safeFloat(raw.ask_impact_price),
    fundingRate: safeFloat(raw.funding_rate),
    nextFundingRate: safeFloat(raw.next_funding_rate),
    createdAt: raw.created_at,
  };
}

function parseRawPublicTrade(raw: RawPublicTrade, symbol: string): TradeHistory {
  return {
    historyId: "",
    orderId: raw.last_order_id,
    symbol,
    amount: safeFloat(raw.amount),
    price: safeFloat(raw.price),
    entryPrice: 0,
    fee: 0,
    pnl: 0,
    eventType: raw.event_type,
    side: raw.side,
    cause: raw.cause,
    createdAt: raw.created_at,
  };
}

function buildTpSlPayload(config: TpSlConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {
    stop_price: config.stop_price,
  };
  if (config.limit_price !== undefined) {
    result.limit_price = config.limit_price;
  }
  if (config.client_order_id !== undefined) {
    result.client_order_id = config.client_order_id;
  }
  return result;
}
