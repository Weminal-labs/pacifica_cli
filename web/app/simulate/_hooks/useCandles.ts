"use client";
// ---------------------------------------------------------------------------
// useCandles — fetch 7-day hourly OHLC candles with in-memory cache
// Shared between PriceChart and VolatilityScenarios to avoid double-fetch
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import { getCandles, type PacificaCandle } from "../../../lib/pacifica-public";

interface CandlesState {
  candles: PacificaCandle[];
  loading: boolean;
  error: boolean;
}

// In-memory cache: symbol → { candles, ts }
const cache = new Map<string, { candles: PacificaCandle[]; ts: number }>();
const TTL = 5 * 60_000; // 5 minutes

export function useCandles(symbol: string): CandlesState {
  const [state, setState] = useState<CandlesState>({ candles: [], loading: false, error: false });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!symbol) return;

    // Serve from cache
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.ts < TTL) {
      setState({ candles: hit.candles, loading: false, error: false });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState((s) => ({ ...s, loading: true, error: false }));

    getCandles(symbol, 7).then((candles) => {
      if (ctrl.signal.aborted) return;
      if (candles.length >= 12) {
        cache.set(symbol, { candles, ts: Date.now() });
        setState({ candles, loading: false, error: false });
      } else {
        setState({ candles: [], loading: false, error: true });
      }
    }).catch(() => {
      if (!ctrl.signal.aborted) setState({ candles: [], loading: false, error: true });
    });

    return () => ctrl.abort();
  }, [symbol]);

  return state;
}
