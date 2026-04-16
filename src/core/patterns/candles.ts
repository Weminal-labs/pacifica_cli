// ---------------------------------------------------------------------------
// Shared candle fetcher — used by backtest engine from CLI, MCP, and web.
// ---------------------------------------------------------------------------
// Pure `fetch` + `AbortSignal.timeout` only. Edge-safe (Cloudflare Pages
// workers, Next.js edge runtime) and node-safe (CLI, MCP stdio server).
//
// Primary source: Pacifica testnet klines. Fallback: Binance public klines.
// This is the single source of truth — the web's `web/lib/pacifica-public.ts`
// re-exports from here so we never duplicate.
// ---------------------------------------------------------------------------

const PACIFICA_BASE = "https://test-api.pacifica.fi";
const BINANCE_BASE = "https://api.binance.com";
const FETCH_TIMEOUT_MS = 8_000;

function timeoutSignal(ms = FETCH_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Candle {
  /** Open time in ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalisePacifica(raw: any[]): Candle[] {
  return raw.map((k) => ({
    t: Number(k.t ?? k[0]),
    o: Number(k.o ?? k[1]),
    h: Number(k.h ?? k[2]),
    l: Number(k.l ?? k[3]),
    c: Number(k.c ?? k[4]),
    v: Number(k.v ?? k[5]),
  })).filter((c) => c.c > 0 && Number.isFinite(c.t));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseBinance(raw: any[][]): Candle[] {
  return raw.map((k) => ({
    t: Number(k[0]),
    o: Number(k[1]),
    h: Number(k[2]),
    l: Number(k[3]),
    c: Number(k[4]),
    v: Number(k[5]),
  })).filter((c) => c.c > 0 && Number.isFinite(c.t));
}

function toBinancePair(symbol: string): string {
  const s = symbol.toUpperCase();
  const overrides: Record<string, string> = { MON: "MONUSDT", WIF: "WIFUSDT" };
  return overrides[s] ?? `${s}USDT`;
}

/** Strip "-USDC-PERP" or "-PERP" suffix so we match short-form tickers. */
export function stripPerpSuffix(symbol: string): string {
  return symbol.toUpperCase().replace(/-USDC-PERP$/, "").replace(/-PERP$/, "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GetCandlesOptions {
  /** Number of days of history. Default 7 for simulate use, 30 for backtest. */
  days?: number;
  /** Candle interval. Only "1h" is currently used — kept for future expansion. */
  interval?: "1h";
}

/**
 * Fetch hourly OHLC candles for `symbol`.
 *
 * Primary: Pacifica testnet kline endpoint.
 * Fallback: Binance public klines (no API key required, no CORS issue for
 * server-side fetches; for browser fetches Binance's CORS headers are open).
 *
 * Returns `[]` if both sources fail. Caller must handle the empty case.
 */
export async function getCandles(
  symbol: string,
  opts: GetCandlesOptions = {},
): Promise<Candle[]> {
  const days = opts.days ?? 7;
  const now = Date.now();
  const from = now - days * 24 * 3600 * 1000;
  const limit = Math.min(days * 24, 1000); // cap to keep payloads sane

  // --- Try Pacifica first ---
  try {
    const base = stripPerpSuffix(symbol);
    const sym = `${base}-USDC-PERP`;
    const url = `${PACIFICA_BASE}/api/v1/kline?symbol=${encodeURIComponent(sym)}&interval=1h&start_time=${from}&end_time=${now}&limit=${limit}`;
    const res = await fetch(url, { signal: timeoutSignal(), cache: "no-store" });
    if (res.ok) {
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const candles = normalisePacifica(list);
      if (candles.length >= 12) return candles;
    }
  } catch {
    // fall through
  }

  // --- Fallback: Binance ---
  try {
    const pair = toBinancePair(stripPerpSuffix(symbol));
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${pair}&interval=1h&limit=${limit}`;
    const res = await fetch(url, { signal: timeoutSignal(), cache: "no-store" });
    if (res.ok) {
      const raw = await res.json();
      return normaliseBinance(raw);
    }
  } catch {
    // both failed
  }

  return [];
}

/**
 * Fetch candles from Binance only (real market prices).
 * Used when the primary `getCandles` returns testnet data that doesn't
 * reflect real-world prices — e.g. the web backtest page.
 */
export async function getBinanceCandles(
  symbol: string,
  opts: GetCandlesOptions = {},
): Promise<Candle[]> {
  const days = opts.days ?? 7;
  const limit = Math.min(days * 24, 1000);
  try {
    const pair = toBinancePair(stripPerpSuffix(symbol));
    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${pair}&interval=1h&limit=${limit}`;
    const res = await fetch(url, { signal: timeoutSignal(), cache: "no-store" });
    if (res.ok) {
      const raw = await res.json();
      return normaliseBinance(raw);
    }
  } catch {
    // failed
  }
  return [];
}
