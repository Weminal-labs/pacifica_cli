// ---------------------------------------------------------------------------
// Pacifica DEX CLI – External Funding Rate Fetchers
// ---------------------------------------------------------------------------
// Fetches public funding rates from Binance and Bybit (no auth required).
// Used as a signal for cross-exchange divergence scoring.
// ---------------------------------------------------------------------------

import type { ExternalFundingRate } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BINANCE_URL =
  "https://fapi.binance.com/fapi/v1/premiumIndex";

const BYBIT_URL =
  "https://api.bybit.com/v5/market/tickers?category=linear&limit=200";

const FETCH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch funding rates from Binance Futures (public endpoint).
 * Returns an empty array on any error — external data is best-effort.
 */
export async function fetchBinanceFundingRates(): Promise<ExternalFundingRate[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(BINANCE_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) return [];

    const data = await resp.json() as BinancePremiumIndexItem[];
    if (!Array.isArray(data)) return [];

    const result: ExternalFundingRate[] = [];
    for (const item of data) {
      if (!item.symbol || !item.lastFundingRate) continue;
      // Binance uses "BTCUSDT" format — strip "USDT" suffix
      const symbol = item.symbol.replace(/USDT$/, "").replace(/BUSD$/, "");
      const rate = parseFloat(item.lastFundingRate);
      if (!Number.isFinite(rate)) continue;
      result.push({ symbol, rate, source: "binance" });
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch funding rates from Bybit (public endpoint).
 * Returns an empty array on any error — external data is best-effort.
 */
export async function fetchBybitFundingRates(): Promise<ExternalFundingRate[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(BYBIT_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) return [];

    const body = await resp.json() as BybitTickersResponse;
    const items = body?.result?.list;
    if (!Array.isArray(items)) return [];

    const result: ExternalFundingRate[] = [];
    for (const item of items) {
      if (!item.symbol || !item.fundingRate) continue;
      // Bybit uses "BTCUSDT" format — strip suffix
      const symbol = item.symbol.replace(/USDT$/, "").replace(/PERP$/, "");
      const rate = parseFloat(item.fundingRate);
      if (!Number.isFinite(rate)) continue;
      result.push({ symbol, rate, source: "bybit" });
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Fetch from both exchanges concurrently, returning the combined list.
 * Binance rates take precedence over Bybit for the same symbol.
 */
export async function fetchAllExternalRates(): Promise<ExternalFundingRate[]> {
  const [binance, bybit] = await Promise.all([
    fetchBinanceFundingRates(),
    fetchBybitFundingRates(),
  ]);

  // Dedupe: binance wins over bybit for the same symbol
  const seen = new Set<string>();
  const result: ExternalFundingRate[] = [];

  for (const r of [...binance, ...bybit]) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      result.push(r);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Raw response shapes
// ---------------------------------------------------------------------------

interface BinancePremiumIndexItem {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime?: number;
}

interface BybitTickersResponse {
  result?: {
    list?: BybitTickerItem[];
  };
}

interface BybitTickerItem {
  symbol: string;
  fundingRate: string;
  nextFundingTime?: string;
}
