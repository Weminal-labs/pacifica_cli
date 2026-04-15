"use client";
// ---------------------------------------------------------------------------
// VolatilityScenarios — replaces arbitrary ±5/10/20% with realised vol σ
// Falls back to fixed scenarios when candle data isn't available
//
// Interactive: click a row to preview that scenario's exit price on the chart.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { useCandles } from "../_hooks/useCandles";
import { calcRealizedVol, orderScenariosForSide } from "../_lib/volatility";
import { simulate } from "../_lib/simulate";
import type { TF } from "./PriceChart";

interface Props {
  symbol:      string;
  side:        "long" | "short";
  sizeUsd:     number;
  leverage:    number;
  entryPrice:  number;
  fundingRate: number;
  /** Scenarios align their σ window to the chart TF (1D/3D/7D) */
  tf?:         TF;
  onVolReady?: (sigmaDeltaPrice: number) => void; // exposes ±1σ price delta to parent (for chart band)
  /** Currently previewed scenario label (e.g. "+2σ") — row highlighted if matches */
  selectedLabel?: string | null;
  /** Click row → parent previews the exit price on the chart */
  onSelectScenario?: (scenario: { label: string; pct: number; pnl: number; exitPrice: number } | null) => void;
}

interface Row {
  label: string;
  pct: number;
  pnl: number;
  pnlPct: number;
  note?: string;
  exitPrice: number;
}

function ScenarioRow({
  row, selected, onClick,
}: {
  row: Row;
  selected: boolean;
  onClick?: () => void;
}) {
  const isProfit = row.pnl >= 0;
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`w-full text-left flex items-center justify-between py-1.5 border-b border-neutral-500/10 last:border-0 transition-colors ${
        clickable ? "hover:bg-orange-500/5 cursor-pointer" : "cursor-default"
      } ${selected ? "bg-orange-500/10 border-l-2 border-l-orange-500 pl-2 -ml-2" : ""}`}
    >
      <div className="flex items-center gap-2 w-28">
        <span className={`font-mono text-sm w-8 ${selected ? "text-orange-400 font-bold" : "text-neutral-400"}`}>
          {row.label}
        </span>
        {row.note && <span className="text-neutral-700 font-mono text-[9px]">{row.note}</span>}
      </div>
      <div className="flex-1 mx-3">
        <div className="relative h-1 bg-neutral-800">
          <div
            className={`absolute top-0 h-full ${isProfit ? "bg-green-500 left-1/2" : "bg-red-500 right-1/2"}`}
            style={{ width: `${Math.min(Math.abs(row.pnlPct) / 2, 50)}%` }}
          />
        </div>
      </div>
      <div className="text-right min-w-[80px]">
        <span className={`font-mono text-sm font-semibold ${isProfit ? "text-green-400" : "text-red-400"}`}>
          {isProfit ? "+" : ""}${row.pnl.toFixed(2)}
        </span>
        <span className={`font-mono text-[10px] ml-1.5 ${isProfit ? "text-green-700" : "text-red-700"}`}>
          ({isProfit ? "+" : ""}{row.pnlPct.toFixed(0)}%)
        </span>
      </div>
    </button>
  );
}

export function VolatilityScenarios({
  symbol, side, sizeUsd, leverage, entryPrice, fundingRate,
  tf = "7D", onVolReady, selectedLabel, onSelectScenario,
}: Props) {
  const { candles, loading } = useCandles(symbol);

  // Slice the candle window to match the selected chart TF so σ reflects what the user sees
  const TF_HOURS: Record<TF, number> = { "1D": 24, "3D": 72, "7D": 168 };
  const windowCandles = useMemo(
    () => candles.slice(-TF_HOURS[tf]),
    [candles, tf],
  );

  const { vol, scenarios } = useMemo(() => {
    if (!windowCandles.length || !entryPrice) return { vol: null, scenarios: [] as Row[] };

    const v = calcRealizedVol(windowCandles);
    if (!v) return { vol: null, scenarios: [] as Row[] };

    // Notify parent of ±1σ band (price delta)
    const sigmaDelta = entryPrice * (v.dailyStdevPct / 100);
    onVolReady?.(sigmaDelta);

    // Build ordered scenarios for this side
    const ordered = orderScenariosForSide(v.scenarios, side);

    // Run simulate() for each scenario to get actual P&L
    const result: Row[] = ordered.map((s) => {
      const sim = simulate(side, symbol, sizeUsd, leverage, entryPrice, fundingRate, [s.pct]);
      const row = sim.scenarios[0];
      const sigmaLabel = s.sigma > 0 ? `+${s.sigma}σ` : `${s.sigma}σ`;
      const note = Math.abs(s.sigma) === 3 ? "rare" : Math.abs(s.sigma) === 2 ? "uncommon" : "typical";
      const exitPrice = entryPrice * (1 + s.pct / 100);
      return {
        label:  sigmaLabel,
        pct:    s.pct,
        pnl:    row.pnl,
        pnlPct: row.pnlPct,
        note,
        exitPrice,
      };
    });

    return { vol: v, scenarios: result };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowCandles, side, sizeUsd, leverage, entryPrice, fundingRate, symbol]);

  // Fallback scenarios (no vol data)
  const fallback = useMemo<Row[]>(() => {
    if (!entryPrice) return [];
    const sim = simulate(side, symbol, sizeUsd, leverage, entryPrice, fundingRate);
    return sim.scenarios.map((s) => ({
      label: s.label, pct: s.pricePct, pnl: s.pnl, pnlPct: s.pnlPct,
      note: undefined,
      exitPrice: entryPrice * (1 + s.pricePct / 100),
    }));
  }, [side, symbol, sizeUsd, leverage, entryPrice, fundingRate]);

  const rows = scenarios.length ? scenarios : fallback;

  if (!entryPrice) return null;

  const handleClick = (row: Row) => {
    if (!onSelectScenario) return;
    // Toggle: clicking the already-selected row clears the preview
    if (selectedLabel === row.label) {
      onSelectScenario(null);
    } else {
      onSelectScenario({
        label: row.label,
        pct: row.pct,
        pnl: row.pnl,
        exitPrice: row.exitPrice,
      });
    }
  };

  return (
    <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
            P&amp;L Scenarios
          </p>
          {onSelectScenario && (
            <span className="text-[9px] font-mono text-neutral-700">· click row to preview on chart</span>
          )}
        </div>
        {vol ? (
          <span className="text-[9px] font-mono text-orange-500/70 bg-orange-500/5 border border-orange-500/20 px-2 py-0.5">
            σ = {vol.dailyStdevPct.toFixed(1)}%/day · {tf} window
          </span>
        ) : loading ? (
          <span className="text-[9px] font-mono text-neutral-700 animate-pulse">loading vol…</span>
        ) : (
          <span className="text-[9px] font-mono text-neutral-700">generic ±5/10/20% · chart unavailable</span>
        )}
      </div>

      <div className="space-y-0">
        {rows.map((r) => (
          <ScenarioRow
            key={r.label}
            row={r}
            selected={selectedLabel === r.label}
            onClick={onSelectScenario ? () => handleClick(r) : undefined}
          />
        ))}
      </div>

      {selectedLabel && onSelectScenario && (
        <button
          type="button"
          onClick={() => onSelectScenario(null)}
          className="mt-3 w-full text-[10px] font-mono text-neutral-500 hover:text-orange-400 border border-neutral-500/10 hover:border-orange-500/30 py-1 transition-colors"
        >
          ✕ clear preview
        </button>
      )}
    </div>
  );
}
