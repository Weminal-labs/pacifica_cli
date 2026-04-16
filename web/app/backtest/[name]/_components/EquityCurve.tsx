// ---------------------------------------------------------------------------
// EquityCurve — hand-rolled SVG line chart of cumulative $ P&L.
// ---------------------------------------------------------------------------
// X-axis: trade index (1..N). Y-axis: cumulative $ P&L, starting at $0.
// No charting library, matches the tone of PriceChart.tsx.
// ---------------------------------------------------------------------------

import type { BacktestTrade } from "@pacifica/core/patterns/backtest";

interface Props {
  trades: BacktestTrade[];
}

const W = 800;
const H = 220;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 24;

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

export function EquityCurve({ trades }: Props) {
  if (trades.length === 0) {
    return (
      <div className="bg-[#0A0A0A] border border-neutral-800 flex items-center justify-center" style={{ height: H }}>
        <span className="font-mono text-[11px] text-neutral-600">No trades fired in this window.</span>
      </div>
    );
  }

  // Curve always starts at $0 (before any trade).
  const curve = [0, ...trades.map((t) => t.cumulative_pnl_usd)];
  const n = curve.length;

  const yMin = Math.min(0, ...curve);
  const yMax = Math.max(0, ...curve);
  const span = yMax - yMin || 1;

  const xStep = (W - PAD_L - PAD_R) / Math.max(1, n - 1);
  const toX = (i: number) => PAD_L + i * xStep;
  const toY = (v: number) => PAD_T + (1 - (v - yMin) / span) * (H - PAD_T - PAD_B);

  const path = curve.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ");

  // Fill path: close back down to y=0 line for shaded area
  const zeroY = toY(0);
  const fillPath =
    `M ${toX(0).toFixed(1)} ${zeroY.toFixed(1)} ` +
    curve.map((v, i) => `L ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ") +
    ` L ${toX(n - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const endValue = curve[curve.length - 1];
  const isUp = endValue >= 0;
  const lineColor = isUp ? "#22C55E" : "#EF4444";
  const fillColor = isUp ? "#22C55E1A" : "#EF44441A";

  // Y-axis ticks: 5 evenly spaced
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * span);

  return (
    <div className="bg-[#0A0A0A] border border-neutral-800">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800">
        <span className="font-mono text-[11px] text-neutral-400 tracking-widest">
          EQUITY CURVE · CUMULATIVE $ P&amp;L
        </span>
        <span className={`font-mono text-[11px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
          {isUp ? "▲" : "▼"} {fmtUsd(endValue)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: H }}>
        {/* Grid lines + Y labels */}
        {yTicks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#1A1A1A" strokeWidth={1} />
              <text x={PAD_L - 6} y={y + 3.5} fill="#4A4A4A" fontSize={9} fontFamily="monospace" textAnchor="end">
                {fmtUsd(t)}
              </text>
            </g>
          );
        })}
        {/* Zero baseline — slightly brighter */}
        <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="#333" strokeWidth={1} strokeDasharray="2 3" />

        {/* Fill area */}
        <path d={fillPath} fill={fillColor} />
        {/* Line */}
        <path d={path} fill="none" stroke={lineColor} strokeWidth={1.4} />

        {/* Trade markers — small dots at each trade boundary */}
        {curve.map((v, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(v)}
            r={1.8}
            fill={lineColor}
            opacity={0.8}
          />
        ))}

        {/* X-axis labels: trade indices at start, mid, end */}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i, li) => {
          const anchor = li === 0 ? "start" : li === 2 ? "end" : "middle";
          return (
            <text
              key={i}
              x={toX(i)}
              y={H - 6}
              fill="#404040"
              fontSize={9}
              fontFamily="monospace"
              textAnchor={anchor}
            >
              {i === 0 ? "start" : `trade ${i}`}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
