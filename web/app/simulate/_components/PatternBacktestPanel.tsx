"use client";
// ---------------------------------------------------------------------------
// PatternBacktestPanel — shows historical stats for a pattern when
// the user lands on /simulate?patternId=xxx
//
// Sections:
//   1. OutcomeStrip — 100 cells, green = wins, red = losses
//   2. Key stats row
//   3. Synthetic distribution curve (SVG bell curve, clearly labelled "modelled")
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { usePattern } from "../_hooks/usePattern";
import type { Pattern } from "../../../lib/types";

// ---------------------------------------------------------------------------
// OutcomeStrip — 100 cells representing win_rate proportion
// ---------------------------------------------------------------------------

function OutcomeStrip({ winRate, sampleSize }: { winRate: number; sampleSize: number }) {
  const wins   = Math.round(winRate * 100);
  const losses = 100 - wins;
  return (
    <div>
      <div className="flex gap-[1.5px] mb-1.5">
        {Array.from({ length: wins }).map((_, i) => (
          <div
            key={`w${i}`}
            className="h-4 flex-1 rounded-sm"
            style={{
              background: `hsl(142, ${50 + (i / wins) * 30}%, ${35 + (i / wins) * 10}%)`,
              opacity: 0.7 + (i / wins) * 0.3,
            }}
          />
        ))}
        {Array.from({ length: losses }).map((_, i) => (
          <div
            key={`l${i}`}
            className="h-4 flex-1 rounded-sm bg-red-500/50"
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] font-mono text-neutral-600">
        <span>{wins}% wins</span>
        <span>n = {sampleSize} trades</span>
        <span>{losses}% losses</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DistributionCurve — SVG approximated bell curve (clearly labelled "modelled")
// ---------------------------------------------------------------------------

function DistributionCurve({ avgPnlPct, winRate }: { avgPnlPct: number; winRate: number }) {
  const W = 400; const H = 80;
  const lossRate = 1 - winRate;

  // Approximate σ — the dispersion around avg (heuristic for verified patterns)
  const sigma = Math.abs(avgPnlPct) / 1.2 || 3;

  // Sample 200 x-points across [-3σ, +3σ], centred on avgPnlPct
  const xMin = avgPnlPct - 3.5 * sigma;
  const xMax = avgPnlPct + 3.5 * sigma;

  const gaussian = (x: number) =>
    Math.exp(-0.5 * ((x - avgPnlPct) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));

  const points: { x: number; y: number; pct: number }[] = [];
  for (let i = 0; i <= 200; i++) {
    const pct = xMin + (i / 200) * (xMax - xMin);
    points.push({ x: (i / 200) * W, y: gaussian(pct), pct });
  }

  const maxY = Math.max(...points.map((p) => p.y));
  const toSvgY = (y: number) => H - 4 - (y / maxY) * (H - 8);

  // Build separate paths for profit (pct > 0) and loss (pct <= 0)
  const toSvgX = (pct: number) => ((pct - xMin) / (xMax - xMin)) * W;
  const zeroX  = toSvgX(0);

  const profitPath = points
    .map((p, i) => (i === 0 ? "M" : "L") + `${p.x.toFixed(1)},${toSvgY(p.y).toFixed(1)}`)
    .join(" ");
  const profitFill = `M${zeroX},${H} ` +
    points.filter((p) => p.pct >= 0).map((p) => `L${p.x.toFixed(1)},${toSvgY(p.y).toFixed(1)}`).join(" ") +
    ` L${W},${H} Z`;
  const lossFill = `M0,${H} ` +
    points.filter((p) => p.pct <= 0).map((p) => `L${p.x.toFixed(1)},${toSvgY(p.y).toFixed(1)}`).join(" ") +
    ` L${zeroX},${H} Z`;

  const meanX = toSvgX(avgPnlPct);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Fill areas */}
        <path d={lossFill}   fill="#EF444430" />
        <path d={profitFill} fill="#22C55E30" />
        {/* Curve */}
        <path d={profitPath} fill="none" stroke="#555" strokeWidth={1} />
        {/* Zero line */}
        <line x1={zeroX} y1={4} x2={zeroX} y2={H} stroke="#333" strokeWidth={0.5} strokeDasharray="2 2" />
        {/* Mean line */}
        <line x1={meanX} y1={4} x2={meanX} y2={H} stroke="#F97316" strokeWidth={0.8} />
        {/* Labels */}
        <text x={zeroX + 3} y={H - 3} fill="#444" fontSize={7} fontFamily="monospace">0%</text>
        <text x={meanX + 3} y={12}    fill="#F97316" fontSize={7} fontFamily="monospace">avg +{avgPnlPct.toFixed(1)}%</text>
      </svg>
      <p className="text-[9px] font-mono text-neutral-700 text-center mt-0.5">
        approximate outcome shape · modelled from win rate + avg P&L only
        {" "}· loss side represents {(lossRate * 100).toFixed(0)}% of trades
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`font-mono text-sm font-semibold ${color ?? "text-white"}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  patternId: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number | null;
}

export function PatternBacktestPanel({ patternId, symbol: _symbol, side: _side, entryPrice }: Props) {
  const { pattern, loading } = usePattern(patternId);

  const targetPrice = useMemo(() => {
    if (!pattern || !entryPrice) return null;
    const dir = _side === "long" ? 1 : -1;
    return entryPrice * (1 + (dir * pattern.avg_pnl_pct) / 100);
  }, [pattern, entryPrice, _side]);

  if (loading) {
    return (
      <div className="relative bg-[#111111] border border-orange-500/15 p-5 animate-pulse">
        <p className="text-neutral-600 font-mono text-xs">Loading pattern…</p>
      </div>
    );
  }

  if (!pattern) return null;

  const holdH = Math.round(pattern.avg_duration_minutes / 60);
  const holdLabel = holdH >= 24
    ? `~${Math.round(holdH / 24)}d`
    : `~${holdH}h`;

  return (
    <div className="relative bg-[#111111] border border-orange-500/20 p-5 space-y-4">
      <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
      <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
      <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
      <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

      {/* Header */}
      <div>
        <p className="text-[10px] font-mono text-orange-500 uppercase tracking-wider mb-1">
          / Pattern Backtest
        </p>
        <h3 className="text-white font-semibold text-sm leading-tight">{pattern.name}</h3>
      </div>

      {/* Outcome strip */}
      <OutcomeStrip winRate={pattern.win_rate} sampleSize={pattern.sample_size} />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 py-2 border-y border-neutral-500/10">
        <Stat label="Win Rate"   value={`${(pattern.win_rate * 100).toFixed(0)}%`}  color="text-green-400" />
        <Stat label="Avg P&L"   value={`+${pattern.avg_pnl_pct.toFixed(1)}%`}      color="text-orange-400" />
        <Stat label="Hold Time" value={holdLabel} />
        <Stat label="Trades"    value={String(pattern.sample_size)} />
      </div>

      {/* Distribution curve */}
      <DistributionCurve avgPnlPct={pattern.avg_pnl_pct} winRate={pattern.win_rate} />

      {/* Target price hint */}
      {targetPrice && entryPrice && (
        <div className="text-[10px] font-mono text-neutral-500 border border-neutral-500/10 bg-[#0A0A0A] px-3 py-2">
          Pattern avg target: <span className="text-green-400 font-semibold">
            ${targetPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}
          </span>
          {" "}(+{pattern.avg_pnl_pct.toFixed(1)}% from entry)
          <span className="ml-2 text-neutral-700">· shown as TARGET line on chart</span>
        </div>
      )}
    </div>
  );
}

export { type Pattern };
