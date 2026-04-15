"use client";
// ---------------------------------------------------------------------------
// VolatilityScenarios — replaces arbitrary ±5/10/20% with realised vol σ
// Falls back to fixed scenarios when candle data isn't available
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useCandles } from "../_hooks/useCandles";
import { calcRealizedVol, orderScenariosForSide } from "../_lib/volatility";
import { simulate, type SimResult } from "../_lib/simulate";

interface Props {
  symbol:      string;
  side:        "long" | "short";
  sizeUsd:     number;
  leverage:    number;
  entryPrice:  number;
  fundingRate: number;
  onVolReady?: (sigmaDeltaPrice: number) => void; // exposes ±1σ price delta to parent (for chart band)
}

function ScenarioRow({ label, pct, pnl, pnlPct, note }: {
  label: string; pct: number; pnl: number; pnlPct: number; note?: string;
}) {
  const isProfit = pnl >= 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-neutral-500/10 last:border-0">
      <div className="flex items-center gap-2 w-28">
        <span className="text-neutral-400 font-mono text-sm w-8">{label}</span>
        {note && <span className="text-neutral-700 font-mono text-[9px]">{note}</span>}
      </div>
      <div className="flex-1 mx-3">
        <div className="relative h-1 bg-neutral-800">
          <div
            className={`absolute top-0 h-full ${isProfit ? "bg-green-500 left-1/2" : "bg-red-500 right-1/2"}`}
            style={{ width: `${Math.min(Math.abs(pnlPct) / 2, 50)}%` }}
          />
        </div>
      </div>
      <div className="text-right min-w-[80px]">
        <span className={`font-mono text-sm font-semibold ${isProfit ? "text-green-400" : "text-red-400"}`}>
          {isProfit ? "+" : ""}${pnl.toFixed(2)}
        </span>
        <span className={`font-mono text-[10px] ml-1.5 ${isProfit ? "text-green-700" : "text-red-700"}`}>
          ({isProfit ? "+" : ""}{pnlPct.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

export function VolatilityScenarios({ symbol, side, sizeUsd, leverage, entryPrice, fundingRate, onVolReady }: Props) {
  const { candles, loading } = useCandles(symbol);

  const { vol, scenarios } = useMemo(() => {
    if (!candles.length || !entryPrice) return { vol: null, scenarios: [] };

    const v = calcRealizedVol(candles);
    if (!v) return { vol: null, scenarios: [] };

    // Notify parent of ±1σ band (price delta)
    const sigmaDelta = entryPrice * (v.dailyStdevPct / 100);
    onVolReady?.(sigmaDelta);

    // Build ordered scenarios for this side
    const ordered = orderScenariosForSide(v.scenarios, side);

    // Run simulate() for each scenario to get actual P&L
    const result = ordered.map((s) => {
      const sim = simulate(side, symbol, sizeUsd, leverage, entryPrice, fundingRate, [s.pct]);
      const row = sim.scenarios[0];
      const sigmaLabel = s.sigma > 0 ? `+${s.sigma}σ` : `${s.sigma}σ`;
      const note = Math.abs(s.sigma) === 3 ? "rare" : Math.abs(s.sigma) === 2 ? "uncommon" : "typical";
      return {
        label:  sigmaLabel,
        pct:    s.pct,
        pnl:    row.pnl,
        pnlPct: row.pnlPct,
        note,
      };
    });

    return { vol: v, scenarios: result };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, side, sizeUsd, leverage, entryPrice, fundingRate, symbol]);

  // Fallback scenarios (no vol data)
  const fallback = useMemo(() => {
    if (!entryPrice) return [];
    const sim = simulate(side, symbol, sizeUsd, leverage, entryPrice, fundingRate);
    return sim.scenarios.map((s) => ({
      label: s.label, pct: s.pricePct, pnl: s.pnl, pnlPct: s.pnlPct, note: undefined,
    }));
  }, [side, symbol, sizeUsd, leverage, entryPrice, fundingRate]);

  const rows = scenarios.length ? scenarios : fallback;

  if (!entryPrice) return null;

  return (
    <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
          P&amp;L Scenarios
        </p>
        {vol ? (
          <span className="text-[9px] font-mono text-orange-500/70 bg-orange-500/5 border border-orange-500/20 px-2 py-0.5">
            σ = {vol.dailyStdevPct.toFixed(1)}%/day · 7d realised vol
          </span>
        ) : loading ? (
          <span className="text-[9px] font-mono text-neutral-700 animate-pulse">loading vol…</span>
        ) : (
          <span className="text-[9px] font-mono text-neutral-700">generic ±5/10/20% · chart unavailable</span>
        )}
      </div>

      <div className="space-y-0">
        {rows.map((r) => (
          <ScenarioRow key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}
