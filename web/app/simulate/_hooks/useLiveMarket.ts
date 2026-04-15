"use client";
// ---------------------------------------------------------------------------
// useLiveMarket — auto-fetch live price + funding from Pacifica public API
// Falls back to local intelligence server (4242) if testnet API fails
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import { getMarketInfo, type PacificaPrice } from "../../../lib/pacifica-public";

interface LiveMarketState {
  price: number | null;
  funding: number | null;   // raw decimal per 8h (e.g. -0.00021)
  loading: boolean;
  source: "testnet" | "local" | null;
}

const cache = new Map<string, { data: LiveMarketState; ts: number }>();
const TTL = 30_000; // 30 seconds

export function useLiveMarket(symbol: string): LiveMarketState {
  const [state, setState] = useState<LiveMarketState>({
    price: null, funding: null, loading: false, source: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!symbol) return;

    // Check cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.ts < TTL) {
      setState(cached.data);
      return;
    }

    // Cancel previous fetch
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        // Primary: Pacifica testnet API
        const info: PacificaPrice | null = await getMarketInfo(symbol);
        if (info && info.price > 0) {
          const data: LiveMarketState = {
            price:   info.markPrice ?? info.price,
            funding: info.funding,
            loading: false,
            source:  "testnet",
          };
          cache.set(symbol, { data, ts: Date.now() });
          if (!ctrl.signal.aborted) setState(data);
          return;
        }
      } catch {
        // fall through to local
      }

      // Fallback: local intelligence server
      try {
        const res = await fetch(
          `http://localhost:4242/api/intelligence/snapshot/${symbol}`,
          { signal: AbortSignal.timeout(1500) },
        );
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = await res.json() as any;
          const price   = d?.current_conditions?.mark_price ?? 0;
          const funding = d?.current_conditions?.funding_rate ?? null;
          if (price > 0) {
            const data: LiveMarketState = { price, funding, loading: false, source: "local" };
            cache.set(symbol, { data, ts: Date.now() });
            if (!ctrl.signal.aborted) setState(data);
            return;
          }
        }
      } catch {
        // both failed
      }

      if (!ctrl.signal.aborted) {
        setState({ price: null, funding: null, loading: false, source: null });
      }
    })();

    return () => ctrl.abort();
  }, [symbol]);

  return state;
}
