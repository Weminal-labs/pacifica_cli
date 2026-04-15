// ---------------------------------------------------------------------------
// Pacifica Public API — browser-safe, no auth required
// All calls go to test-api.pacifica.fi (CORS-safe for GET requests)
// ---------------------------------------------------------------------------

const BASE = "https://test-api.pacifica.fi";
const TIMEOUT = 6_000;

function signal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PacificaPrice {
  symbol: string;        // e.g. "ETH"
  price: number;
  markPrice?: number;
  funding: number;       // current 8h funding rate (decimal, e.g. -0.00021)
  volume24h?: number;
  openInterest?: number;
}

export interface PacificaCandle {
  t: number;  // open time ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ---------------------------------------------------------------------------
// Fetch all market prices + funding rates
// Returns a map: symbol → PacificaPrice
// ---------------------------------------------------------------------------

export async function getPrices(): Promise<Map<string, PacificaPrice>> {
  try {
    const res = await fetch(`${BASE}/api/v1/info/prices`, { signal: signal(), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await res.json() as any[];
    const map = new Map<string, PacificaPrice>();
    for (const item of raw) {
      // Normalise — the API may return symbol as "ETH-USDC-PERP" or just "ETH"
      const sym = String(item.symbol ?? item.coin ?? "")
        .replace("-USDC-PERP", "")
        .replace("-PERP", "")
        .toUpperCase();
      if (!sym) continue;
      map.set(sym, {
        symbol: sym,
        price: Number(item.markPrice ?? item.price ?? 0),
        markPrice: Number(item.markPrice ?? 0),
        funding: Number(item.fundingRate ?? item.funding ?? 0),
        volume24h: Number(item.volume24h ?? item.volume ?? 0),
        openInterest: Number(item.openInterest ?? item.oi ?? 0),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Fetch a single market's price and funding. Falls back to manual entry. */
export async function getMarketInfo(symbol: string): Promise<PacificaPrice | null> {
  const map = await getPrices();
  return map.get(symbol.toUpperCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Fetch OHLC candles for a symbol
// Primary: Pacifica testnet; fallback: Binance public klines
// ---------------------------------------------------------------------------

/** Normalise Pacifica kline response to candle array */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalisePacificaKlines(raw: any[]): PacificaCandle[] {
  return raw.map((k) => ({
    t: Number(k.t ?? k[0]),
    o: Number(k.o ?? k[1]),
    h: Number(k.h ?? k[2]),
    l: Number(k.l ?? k[3]),
    c: Number(k.c ?? k[4]),
    v: Number(k.v ?? k[5]),
  })).filter((c) => c.c > 0);
}

/** Normalise Binance kline [openTime, open, high, low, close, vol, ...] */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseBinanceKlines(raw: any[][]): PacificaCandle[] {
  return raw.map((k) => ({
    t: Number(k[0]),
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4]),
    v: Number(k[5]),
  })).filter((c) => c.c > 0);
}

/** Map a short symbol to Binance's USDT pair (best effort) */
function toBinancePair(symbol: string): string {
  const s = symbol.toUpperCase();
  // Most perp markets have USDT pairs on Binance
  const overrides: Record<string, string> = { MON: "MONUSDT", WIF: "WIFUSDT" };
  return overrides[s] ?? `${s}USDT`;
}

/**
 * Fetch 7-day hourly candles for `symbol`.
 * Primary: Pacifica testnet API
 * Fallback: Binance public klines (no API key needed)
 */
export async function getCandles(symbol: string, days = 7): Promise<PacificaCandle[]> {
  const now   = Date.now();
  const from  = now - days * 24 * 3600 * 1000;
  const limit = days * 24; // 168 candles for 7d @ 1h

  // --- Try Pacifica first ---
  try {
    const sym = `${symbol.toUpperCase()}-USDC-PERP`;
    const url = `${BASE}/api/v1/kline?symbol=${encodeURIComponent(sym)}&interval=1h&start_time=${from}&end_time=${now}&limit=${limit}`;
    const res = await fetch(url, { signal: signal(), cache: "no-store" });
    if (res.ok) {
      const raw = await res.json();
      const candles = normalisePacificaKlines(Array.isArray(raw) ? raw : (raw?.data ?? []));
      if (candles.length >= 12) return candles;
    }
  } catch {
    // fall through to Binance
  }

  // --- Fallback: Binance public klines ---
  try {
    const pair = toBinancePair(symbol);
    const url  = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1h&limit=${limit}`;
    const res  = await fetch(url, { signal: signal(), cache: "no-store" });
    if (res.ok) {
      const raw = await res.json();
      return normaliseBinanceKlines(raw);
    }
  } catch {
    // both sources failed
  }

  return [];
}
