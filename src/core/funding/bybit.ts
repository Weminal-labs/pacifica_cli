// ---------------------------------------------------------------------------
// Bybit Funding Rate Fetcher
// ---------------------------------------------------------------------------
// Fetches funding rates from Bybit V5 API (public, no auth).
// Uses /v5/market/tickers for current rates and /v5/market/funding/history
// for historical data.
// ---------------------------------------------------------------------------

const BYBIT_V5_BASE = "https://api.bybit.com";
const REQUEST_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BybitFundingRate {
  symbol: string;
  fundingRate: number;
  fundingCountdown: string; // next funding time as ISO string
  markPrice: number;
  indexPrice: number;
  nextFundingRate: number;
}

export interface BybitFundingHistory {
  symbol: string;
  fundingRate: number;
  fundingTime: string;
}

// ---------------------------------------------------------------------------
// Raw API responses
// ---------------------------------------------------------------------------

interface RawBybitTicker {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  fundingRate: string;
  nextFundingTime: string;
}

interface RawBybitFundingHistory {
  symbol: string;
  fundingRate: string;
  fundingRateTimestamp: string;
}

interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: {
    list: T[];
    category?: string;
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch current funding rate for a single Bybit symbol (e.g. "BTCUSDT").
 * Returns undefined if the symbol doesn't exist or API fails.
 */
export async function getBybitFundingRate(
  symbol: string,
): Promise<BybitFundingRate | undefined> {
  try {
    const url = `${BYBIT_V5_BASE}/v5/market/tickers?category=linear&symbol=${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return undefined;

    const body = (await resp.json()) as BybitApiResponse<RawBybitTicker>;
    if (body.retCode !== 0 || !body.result.list.length) return undefined;

    const raw = body.result.list[0]!;

    return {
      symbol: raw.symbol,
      fundingRate: parseFloat(raw.fundingRate) * 100, // convert to percentage
      fundingCountdown: raw.nextFundingTime
        ? new Date(parseInt(raw.nextFundingTime)).toISOString()
        : "",
      markPrice: parseFloat(raw.markPrice),
      indexPrice: parseFloat(raw.indexPrice),
      nextFundingRate: 0,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fetch current funding rates for multiple Bybit symbols in one call.
 * Bybit's tickers endpoint returns all linear perps — we filter locally.
 */
export async function getBybitFundingRates(
  symbols: string[],
): Promise<Map<string, BybitFundingRate>> {
  const result = new Map<string, BybitFundingRate>();

  try {
    const url = `${BYBIT_V5_BASE}/v5/market/tickers?category=linear`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return result;

    const body = (await resp.json()) as BybitApiResponse<RawBybitTicker>;
    if (body.retCode !== 0) return result;

    const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));

    for (const raw of body.result.list) {
      if (!symbolSet.has(raw.symbol.toUpperCase())) continue;

      result.set(raw.symbol.toUpperCase(), {
        symbol: raw.symbol,
        fundingRate: parseFloat(raw.fundingRate) * 100,
        fundingCountdown: raw.nextFundingTime
          ? new Date(parseInt(raw.nextFundingTime)).toISOString()
          : "",
        markPrice: parseFloat(raw.markPrice),
        indexPrice: parseFloat(raw.indexPrice),
        nextFundingRate: 0,
      });
    }
  } catch {
    // Return whatever we have
  }

  return result;
}

/**
 * Fetch historical funding rates for a Bybit symbol.
 */
export async function getBybitFundingHistory(
  symbol: string,
  limit = 20,
): Promise<BybitFundingHistory[]> {
  try {
    const url = `${BYBIT_V5_BASE}/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!resp.ok) return [];

    const body = (await resp.json()) as BybitApiResponse<RawBybitFundingHistory>;
    if (body.retCode !== 0) return [];

    return body.result.list.map((r) => ({
      symbol: r.symbol,
      fundingRate: parseFloat(r.fundingRate) * 100,
      fundingTime: new Date(parseInt(r.fundingRateTimestamp)).toISOString(),
    }));
  } catch {
    return [];
  }
}
