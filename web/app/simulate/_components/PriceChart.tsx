"use client";
// ---------------------------------------------------------------------------
// PriceChart — 7-day SVG candlestick chart with overlay lines
// No external chart library. Pure SVG, ~200 lines.
// ---------------------------------------------------------------------------

import { useState, useCallback, type MouseEvent } from "react";
import { useCandles } from "../_hooks/useCandles";
import { type PacificaCandle } from "../../../lib/pacifica-public";

interface PriceChartProps {
  symbol: string;
  entryPrice: number | null;
  liquidationPrice: number | null;
  targetPrice?: number | null; // pattern expected exit
  sigmaBand?: number | null;   // ±1σ daily stdev as a price delta
}

// SVG dimensions
const W = 800;
const H = 220;
const PAD = { top: 12, bottom: 28, left: 8, right: 64 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

function priceToY(price: number, min: number, max: number): number {
  return PAD.top + CHART_H - ((price - min) / (max - min)) * CHART_H;
}
function idxToX(i: number, total: number): number {
  return PAD.left + (i / (total - 1)) * CHART_W;
}

interface Tooltip {
  x: number;
  candle: PacificaCandle;
  candleX: number;
}

export function PriceChart({ symbol, entryPrice, liquidationPrice, targetPrice, sigmaBand }: PriceChartProps) {
  const { candles, loading, error } = useCandles(symbol);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent<SVGElement>) => {
    if (!candles.length) return;
    const svg = e.currentTarget.getBoundingClientRect();
    const mx  = e.clientX - svg.left;
    const relX = mx - PAD.left;
    const idx  = Math.round((relX / CHART_W) * (candles.length - 1));
    const safeIdx = Math.max(0, Math.min(idx, candles.length - 1));
    setTooltip({
      x:       mx,
      candle:  candles[safeIdx],
      candleX: idxToX(safeIdx, candles.length),
    });
  }, [candles]);

  if (loading) {
    return (
      <div className="bg-[#0D0D0D] border border-neutral-500/10 h-[220px] flex items-center justify-center">
        <p className="text-neutral-600 font-mono text-xs animate-pulse">Loading chart…</p>
      </div>
    );
  }

  if (error || !candles.length) {
    return (
      <div className="bg-[#0D0D0D] border border-neutral-500/10 h-[100px] flex items-center justify-center">
        <p className="text-neutral-700 font-mono text-xs">Price chart unavailable for {symbol}</p>
      </div>
    );
  }

  // Price range with 4% padding
  const allPrices = candles.flatMap((c) => [c.h, c.l]);
  const overlayPrices = [entryPrice, liquidationPrice, targetPrice].filter(Boolean) as number[];
  const raw = [...allPrices, ...overlayPrices];
  const rawMin = Math.min(...raw);
  const rawMax = Math.max(...raw);
  const range  = rawMax - rawMin || 1;
  const pMin   = rawMin - range * 0.04;
  const pMax   = rawMax + range * 0.04;

  const total = candles.length;
  const barW  = Math.max(1, (CHART_W / total) * 0.6);

  // X-axis labels: -7d, -3d, now
  const xLabels = [
    { i: 0,             label: "7d ago" },
    { i: Math.floor(total * 0.57), label: "3d ago" },
    { i: total - 1,    label: "now"    },
  ];

  // Y-axis ticks
  const yTicks = [0.2, 0.4, 0.6, 0.8].map((f) => pMin + f * (pMax - pMin));

  const fmtPrice = (p: number) =>
    p >= 1000 ? `$${(p / 1000).toFixed(1)}k` : `$${p.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  const fmtTime  = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-[#0D0D0D] border border-neutral-500/10 p-1 relative">
      <p className="text-[10px] font-mono text-neutral-600 px-2 pt-1 pb-0.5">
        {symbol} · 7-day price
        {entryPrice && <span className="ml-2 text-orange-500/70">entry {fmtPrice(entryPrice)}</span>}
        {liquidationPrice && <span className="ml-2 text-red-500/70">liq {fmtPrice(liquidationPrice)}</span>}
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: H }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map((price, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={priceToY(price, pMin, pMax)}
              x2={W - PAD.right} y2={priceToY(price, pMin, pMax)}
              stroke="#222" strokeWidth={0.5}
            />
            <text
              x={W - PAD.right + 4} y={priceToY(price, pMin, pMax) + 4}
              fill="#444" fontSize={8} fontFamily="monospace"
            >
              {fmtPrice(price)}
            </text>
          </g>
        ))}

        {/* ±1σ band (if provided) */}
        {sigmaBand != null && entryPrice != null && (
          <rect
            x={PAD.left}
            y={priceToY(entryPrice + sigmaBand, pMin, pMax)}
            width={CHART_W}
            height={priceToY(entryPrice - sigmaBand, pMin, pMax) - priceToY(entryPrice + sigmaBand, pMin, pMax)}
            fill="#f9731610"
            stroke="none"
          />
        )}

        {/* Candlesticks */}
        {candles.map((c, i) => {
          const x   = idxToX(i, total);
          const yO  = priceToY(c.o, pMin, pMax);
          const yC  = priceToY(c.c, pMin, pMax);
          const yH  = priceToY(c.h, pMin, pMax);
          const yL  = priceToY(c.l, pMin, pMax);
          const isGreen = c.c >= c.o;
          const col = isGreen ? "#22C55E" : "#EF4444";
          const bodyTop    = Math.min(yO, yC);
          const bodyHeight = Math.max(1, Math.abs(yC - yO));
          return (
            <g key={i} shapeRendering="crispEdges">
              {/* Wick */}
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth={0.8} opacity={0.7} />
              {/* Body */}
              <rect x={x - barW / 2} y={bodyTop} width={barW} height={bodyHeight} fill={col} opacity={0.85} />
            </g>
          );
        })}

        {/* Overlay: liquidation price (red dashed) */}
        {liquidationPrice != null && liquidationPrice > pMin && liquidationPrice < pMax && (
          <g>
            <line
              x1={PAD.left} y1={priceToY(liquidationPrice, pMin, pMax)}
              x2={W - PAD.right} y2={priceToY(liquidationPrice, pMin, pMax)}
              stroke="#EF4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
            />
            <text
              x={W - PAD.right + 4} y={priceToY(liquidationPrice, pMin, pMax) - 3}
              fill="#EF4444" fontSize={7} fontFamily="monospace"
            >
              LIQ
            </text>
          </g>
        )}

        {/* Overlay: entry price (orange solid) */}
        {entryPrice != null && entryPrice > pMin && entryPrice < pMax && (
          <g>
            <line
              x1={PAD.left} y1={priceToY(entryPrice, pMin, pMax)}
              x2={W - PAD.right} y2={priceToY(entryPrice, pMin, pMax)}
              stroke="#F97316" strokeWidth={1} opacity={0.9}
            />
            <text
              x={W - PAD.right + 4} y={priceToY(entryPrice, pMin, pMax) - 3}
              fill="#F97316" fontSize={7} fontFamily="monospace"
            >
              ENTRY
            </text>
          </g>
        )}

        {/* Overlay: target price (green dotted) */}
        {targetPrice != null && targetPrice > pMin && targetPrice < pMax && (
          <g>
            <line
              x1={PAD.left} y1={priceToY(targetPrice, pMin, pMax)}
              x2={W - PAD.right} y2={priceToY(targetPrice, pMin, pMax)}
              stroke="#22C55E" strokeWidth={1} strokeDasharray="2 4" opacity={0.7}
            />
            <text
              x={W - PAD.right + 4} y={priceToY(targetPrice, pMin, pMax) - 3}
              fill="#22C55E" fontSize={7} fontFamily="monospace"
            >
              TARGET
            </text>
          </g>
        )}

        {/* Crosshair */}
        {tooltip && (
          <line
            x1={tooltip.candleX} y1={PAD.top}
            x2={tooltip.candleX} y2={H - PAD.bottom}
            stroke="#555" strokeWidth={0.5} strokeDasharray="2 2"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={label}
            x={idxToX(i, total)}
            y={H - PAD.bottom + 14}
            fill="#444" fontSize={8} fontFamily="monospace"
            textAnchor={i === 0 ? "start" : i === total - 1 ? "end" : "middle"}
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute top-8 bg-[#111] border border-neutral-500/20 px-2.5 py-1.5 font-mono text-[10px] text-neutral-300 pointer-events-none z-10"
          style={{ left: Math.min(tooltip.x + 8, W - 130) }}
        >
          <p className="text-neutral-500 mb-0.5">{fmtTime(tooltip.candle.t)}</p>
          <p>O: {fmtPrice(tooltip.candle.o)}  C: {fmtPrice(tooltip.candle.c)}</p>
          <p>H: <span className="text-green-400">{fmtPrice(tooltip.candle.h)}</span>  L: <span className="text-red-400">{fmtPrice(tooltip.candle.l)}</span></p>
        </div>
      )}
    </div>
  );
}
