// ---------------------------------------------------------------------------
// Binance Funding Rate Fetcher
// ---------------------------------------------------------------------------
// Fetches funding rates from Binance Futures (public API, no auth).
// Uses the /fapi/v1/premiumIndex endpoint for current rates and
// /fapi/v1/fundingRate for historical rates.
// ---------------------------------------------------------------------------

const BINANCE_FAPI_BASE = "https://fapi.binance.com";
const REQUEST_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BinanceFundingRate {
  symbol: string;
  fundingRate: number;
  fundingCountdown: string; // next funding time as ISO string
  markPrice: number;
  indexPrice: number;
  nextFundingRate: number;
}

export interface BinanceFundingHistory {
  symbol: string;
  fundingRate: number;
  fundingTime: string;
}

// ---------------------------------------------------------------------------
// Raw API responses
// ---------------------------------------------------------------------------

interface RawPremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  estimatedSettlePrice?: string;
  interestRate?: string;
  time: number;
}

interface RawFundingRateHistory {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
  markPrice?: string;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch current funding rate for a single Binance symbol (e.g. "BTCUSDT").
 * Returns undefined if the symbol doesn't exist or API fails.
 */
export async function getBinanceFundingRate(
  symbol: string,
): Promise<BinanceFundingRate | undefined> {
  try {
    const url = `${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return undefined;

    const raw = (await resp.json()) as RawPremiumIndex;

    return {
      symbol: raw.symbol,
      fundingRate: parseFloat(raw.lastFundingRate) * 100, // convert to percentage
      fundingCountdown: new Date(raw.nextFundingTime).toISOString(),
      markPrice: parseFloat(raw.markPrice),
      indexPrice: parseFloat(raw.indexPrice),
      nextFundingRate: 0, // Binance doesn't expose predicted next rate in this endpoint
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch current funding rates for multiple Binance symbols in one call.
 * Uses the bulk premiumIndex endpoint.
 */
export async function getBinanceFundingRates(
  symbols: string[],
): Promise<Map<string, BinanceFundingRate>> {
  const result = new Map<string, BinanceFundingRate>();

  try {
    const url = `${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return result;

    const allRates = (await resp.json()) as RawPremiumIndex[];
    const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));

    for (const raw of allRates) {
      if (!symbolSet.has(raw.symbol.toUpperCase())) continue;

      result.set(raw.symbol.toUpperCase(), {
        symbol: raw.symbol,
        fundingRate: parseFloat(raw.lastFundingRate) * 100,
        fundingCountdown: new Date(raw.nextFundingTime).toISOString(),
        markPrice: parseFloat(raw.markPrice),
        indexPrice: parseFloat(raw.indexPrice),
        nextFundingRate: 0,
      });
    }
  } catch {
    // Return whatever we have (possibly empty)
  }

  return result;
}

/**
 * Fetch historical funding rates for a Binance symbol.
 */
export async function getBinanceFundingHistory(
  symbol: string,
  limit = 20,
): Promise<BinanceFundingHistory[]> {
  try {
    const url = `${BINANCE_FAPI_BASE}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const rawRates = (await resp.json()) as RawFundingRateHistory[];

    return rawRates.map((r) => ({
      symbol: r.symbol,
      fundingRate: parseFloat(r.fundingRate) * 100,
      fundingTime: new Date(r.fundingTime).toISOString(),
    }));
  } catch {
    return [];
  }
}
