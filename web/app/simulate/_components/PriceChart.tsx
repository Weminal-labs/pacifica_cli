"use client";
// ---------------------------------------------------------------------------
// PriceChart — BASCII-style terminal candlestick chart
// Pure SVG, no library. Timeframe selector: 1D / 3D / 7D
// Volume bars in lower pane. Right-axis price labels.
//
// Interactions:
//   • Click any candle  → sets entry price to that candle's close (via onPickEntry)
//   • Click/drag ENTRY  → scrubs entry price along the Y axis
//   • Hover tooltip, crosshair
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useCandles } from "../_hooks/useCandles";
import { type PacificaCandle } from "../../../lib/pacifica-public";

export type TF = "1D" | "3D" | "7D";

interface PriceChartProps {
  symbol: string;
  entryPrice: number | null;
  liquidationPrice: number | null;
  targetPrice?: number | null;
  sigmaBand?: number | null;
  /** Dashed "scenario exit" line (e.g. +2σ preview) */
  scenarioPrice?: number | null;
  scenarioLabel?: string | null;
  /** Timeframe controlled by parent so σ can match chart window */
  tf: TF;
  onTfChange: (tf: TF) => void;
  /** Called when user clicks a candle or scrubs the entry line */
  onPickEntry?: (price: number) => void;
}

const TF_CANDLES: Record<TF, number> = { "1D": 24, "3D": 72, "7D": 168 };

// SVG dimensions
const W = 800;
const H_MAIN = 240;   // candlestick pane
const H_VOL  = 44;    // volume pane
const H_XLAB = 20;    // x-axis label row
const H_TOTAL = H_MAIN + H_VOL + H_XLAB;
const PAD_L = 4;
const PAD_R = 72;     // right axis
const PAD_T = 10;
const CHART_W = W - PAD_L - PAD_R;

function toY(price: number, pMin: number, pMax: number): number {
  return PAD_T + H_MAIN - PAD_T - ((price - pMin) / (pMax - pMin)) * (H_MAIN - PAD_T - 4);
}

function yToPrice(y: number, pMin: number, pMax: number): number {
  // inverse of toY
  const span = H_MAIN - PAD_T - 4;
  const frac = (PAD_T + H_MAIN - PAD_T - y) / span;
  return pMin + frac * (pMax - pMin);
}

function fmtP(p: number): string {
  if (p >= 10_000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)   return `$${p.toFixed(0)}`;
  if (p >= 100)    return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function fmtTime(ms: number, tf: TF): string {
  const d = new Date(ms);
  if (tf === "1D") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function roundForPrice(p: number): number {
  if (p >= 1000) return Math.round(p * 100) / 100;
  if (p >= 1)    return Math.round(p * 10000) / 10000;
  return Math.round(p * 1_000_000) / 1_000_000;
}

interface Tooltip {
  svgX: number;
  candle: PacificaCandle;
  idx: number;
}

export function PriceChart({
  symbol, entryPrice, liquidationPrice, targetPrice, sigmaBand,
  scenarioPrice, scenarioLabel,
  tf, onTfChange, onPickEntry,
}: PriceChartProps) {
  const { candles, loading, error } = useCandles(symbol);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPrice, setDragPrice] = useState<number | null>(null);
  const dragPriceRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Slice to selected timeframe
  const visible = candles.slice(-TF_CANDLES[tf]);
  const total   = visible.length;

  const barW = total > 0 ? Math.max(2, (CHART_W / total) * 0.72) : 6;

  const idxToX = useCallback((i: number) => PAD_L + (i + 0.5) * (CHART_W / Math.max(total, 1)), [total]);

  const clientToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H_TOTAL / rect.height),
    };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent<SVGElement>) => {
    if (!total) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    if (!pt) return;
    const relX = pt.x - PAD_L;
    const idx   = Math.max(0, Math.min(Math.round((relX / CHART_W) * (total - 1)), total - 1));
    setTooltip({ svgX: idxToX(idx), candle: visible[idx], idx });
  }, [total, visible, idxToX, clientToSvg]);

  // ── Drag entry line ──
  // Using window pointer events so drag survives fast mouse motion out of SVG bounds.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (ev: globalThis.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgY = (ev.clientY - rect.top) * (H_TOTAL / rect.height);
      // Clamp to main pane
      const clampedY = Math.max(PAD_T, Math.min(svgY, H_MAIN - 4));
      // pMin/pMax need to be in scope — recompute closure-safe below
      const p = yToPrice(clampedY, pMinRef.current, pMaxRef.current);
      const rounded = roundForPrice(p);
      dragPriceRef.current = rounded;
      setDragPrice(rounded);
    };

    const onUp = () => {
      setDragging(false);
      const committed = dragPriceRef.current;
      if (committed != null && onPickEntry) onPickEntry(committed);
      dragPriceRef.current = null;
      setDragPrice(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onPickEntry]);

  // Keep pMin/pMax available to the effect without redeclaring the listener
  const pMinRef = useRef(0);
  const pMaxRef = useRef(1);

  if (loading) {
    return (
      <div className="bg-[#0A0A0A] border border-neutral-800 flex items-center justify-center" style={{ height: H_TOTAL }}>
        <span className="text-neutral-600 font-mono text-[11px] animate-pulse">LOADING CHART…</span>
      </div>
    );
  }

  if (error || !candles.length) {
    return (
      <div className="bg-[#0A0A0A] border border-neutral-800 flex items-center justify-center" style={{ height: 80 }}>
        <span className="text-neutral-700 font-mono text-[11px]">CHART UNAVAILABLE · {symbol}</span>
      </div>
    );
  }

  // Price range — based on candles only, with small padding.
  // Overlays (entry/liq/target) may fall outside this range when testnet and
  // mainnet prices diverge; we show them as edge badges instead of stretching.
  const allH = visible.map(c => c.h);
  const allL = visible.map(c => c.l);
  const candleMin = Math.min(...allL);
  const candleMax = Math.max(...allH);
  const candleRange = candleMax - candleMin || 1;

  // Only extend range to include overlays if they're within 15% of the candle range
  const nearOverlays = [entryPrice, liquidationPrice, targetPrice, scenarioPrice]
    .filter((p): p is number => p != null && p > 0)
    .filter(p => p >= candleMin - candleRange * 0.15 && p <= candleMax + candleRange * 0.15);

  const rawMin = nearOverlays.length ? Math.min(candleMin, ...nearOverlays) : candleMin;
  const rawMax = nearOverlays.length ? Math.max(candleMax, ...nearOverlays) : candleMax;
  const pad    = (rawMax - rawMin) * 0.08 || 1;
  const pMin   = rawMin - pad;
  const pMax   = rawMax + pad;
  pMinRef.current = pMin;
  pMaxRef.current = pMax;

  // Volume
  const maxVol = Math.max(...visible.map(c => c.v ?? 0), 1);

  // Y-axis ticks (5 evenly spaced)
  const yTicks = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => pMin + f * (pMax - pMin));

  // X-axis labels (4 evenly spaced)
  const xLabelIdxs = [0, Math.floor(total * 0.33), Math.floor(total * 0.66), total - 1];

  const pctChange = visible.length >= 2
    ? ((visible[total - 1].c - visible[0].o) / visible[0].o) * 100
    : 0;
  const isUp = pctChange >= 0;

  // Effective entry to draw (dragging previews live)
  const effectiveEntry = dragging && dragPrice != null ? dragPrice : entryPrice;

  const handleCandleClick = (c: PacificaCandle) => {
    if (!onPickEntry) return;
    onPickEntry(roundForPrice(c.c));
  };

  const handleEntryPointerDown = (e: ReactPointerEvent<SVGElement>) => {
    if (!onPickEntry) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragPriceRef.current = effectiveEntry ?? null;
    setDragPrice(effectiveEntry ?? null);
  };

  return (
    <div className="bg-[#0A0A0A] border border-neutral-800 select-none relative">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-neutral-400 tracking-widest">{symbol}</span>
          <span className={`font-mono text-[11px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "▲" : "▼"} {Math.abs(pctChange).toFixed(2)}%
          </span>
          {effectiveEntry && (
            <span className={`font-mono text-[10px] ${dragging ? "text-orange-400 font-bold" : "text-orange-500/80"}`}>
              ENTRY {fmtP(effectiveEntry)}{dragging && " ◂ drag"}
            </span>
          )}
          {liquidationPrice && !dragging && (
            <span className="font-mono text-[10px] text-red-500/70">
              LIQ {fmtP(liquidationPrice)}
            </span>
          )}
          {scenarioLabel && scenarioPrice && !dragging && (
            <span className="font-mono text-[10px] text-green-400/80">
              {scenarioLabel.toUpperCase()} {fmtP(scenarioPrice)}
            </span>
          )}
        </div>
        {/* Timeframe selector */}
        <div className="flex items-center gap-0.5">
          {(["1D", "3D", "7D"] as TF[]).map(t => (
            <button
              key={t}
              onClick={() => onTfChange(t)}
              className={`font-mono text-[10px] px-2 py-0.5 tracking-wider transition-colors ${
                tf === t
                  ? "bg-orange-500 text-black font-bold"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Hint strip */}
      {onPickEntry && (
        <div className="px-3 py-1 border-b border-neutral-900 bg-[#070707]">
          <span className="font-mono text-[9px] text-neutral-600 tracking-wide">
            CLICK CANDLE → SET ENTRY · DRAG <span className="text-orange-500/70">ORANGE LINE</span> → SCRUB PRICE
          </span>
        </div>
      )}

      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H_TOTAL}`}
        className="w-full block"
        style={{ height: H_TOTAL, cursor: dragging ? "ns-resize" : "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => !dragging && setTooltip(null)}
      >
        {/* ── Background grid lines ── */}
        {yTicks.map((price, i) => {
          const y = toY(price, pMin, pMax);
          return (
            <g key={i}>
              <line
                x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                stroke="#1A1A1A" strokeWidth={1}
              />
              <text
                x={W - PAD_R + 5} y={y + 3.5}
                fill="#4A4A4A" fontSize={9} fontFamily="monospace"
              >
                {fmtP(price)}
              </text>
            </g>
          );
        })}

        {/* ── σ band ── */}
        {sigmaBand != null && effectiveEntry != null && (
          <rect
            x={PAD_L}
            y={toY(effectiveEntry + sigmaBand, pMin, pMax)}
            width={CHART_W}
            height={Math.max(0, toY(effectiveEntry - sigmaBand, pMin, pMax) - toY(effectiveEntry + sigmaBand, pMin, pMax))}
            fill="#F9731608"
          />
        )}

        {/* ── Candlesticks (click to set entry) ── */}
        {visible.map((c, i) => {
          const cx       = idxToX(i);
          const yO       = toY(c.o, pMin, pMax);
          const yC       = toY(c.c, pMin, pMax);
          const yH       = toY(c.h, pMin, pMax);
          const yL       = toY(c.l, pMin, pMax);
          const green    = c.c >= c.o;
          const col      = green ? "#22C55E" : "#EF4444";
          const bodyTop  = Math.min(yO, yC);
          const bodyH    = Math.max(1.5, Math.abs(yC - yO));
          const isHovered = tooltip?.idx === i;

          return (
            <g key={i} shapeRendering="crispEdges">
              {/* Wick */}
              <line x1={cx} y1={yH} x2={cx} y2={yL} stroke={col} strokeWidth={1} opacity={isHovered ? 1 : 0.6} />
              {/* Body */}
              <rect
                x={cx - barW / 2} y={bodyTop}
                width={barW} height={bodyH}
                fill={col}
                opacity={isHovered ? 1 : 0.9}
                stroke={isHovered ? "#F97316" : "none"}
                strokeWidth={isHovered ? 1 : 0}
              />
              {/* Hit target (wider, invisible) for reliable click even on thin candles */}
              {onPickEntry && (
                <rect
                  x={cx - Math.max(barW, 6) / 2}
                  y={PAD_T}
                  width={Math.max(barW, 6)}
                  height={H_MAIN - PAD_T - 4}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleCandleClick(c)}
                />
              )}
            </g>
          );
        })}

        {/* ── Scenario exit preview (dashed green) ── */}
        {scenarioPrice != null && scenarioPrice > 0 && scenarioPrice >= pMin && scenarioPrice <= pMax && (
          <g>
            <line
              x1={PAD_L} y1={toY(scenarioPrice, pMin, pMax)}
              x2={W - PAD_R} y2={toY(scenarioPrice, pMin, pMax)}
              stroke="#22C55E" strokeWidth={1.3} strokeDasharray="4 3" opacity={0.9}
            />
            <rect
              x={W - PAD_R} y={toY(scenarioPrice, pMin, pMax) - 7}
              width={PAD_R - 2} height={12}
              fill="#22C55E22"
            />
            <text
              x={W - PAD_R + 4} y={toY(scenarioPrice, pMin, pMax) + 3}
              fill="#22C55E" fontSize={8} fontFamily="monospace" fontWeight="bold"
            >
              {(scenarioLabel || "EXIT").toUpperCase()}
            </text>
          </g>
        )}

        {/* ── Overlay lines (in-range) and edge badges (out-of-range) ── */}
        {(() => {
          const items: Array<{ price: number; label: string; color: string; dash?: string; weight: number; draggable?: boolean }> = [];
          if (liquidationPrice != null && liquidationPrice > 0) items.push({ price: liquidationPrice, label: "LIQ", color: "#EF4444", dash: "5 3", weight: 1.2 });
          if (effectiveEntry != null && effectiveEntry > 0) items.push({ price: effectiveEntry, label: "ENTRY", color: "#F97316", weight: dragging ? 2.2 : 1.5, draggable: !!onPickEntry });
          if (targetPrice != null && targetPrice > 0) items.push({ price: targetPrice, label: "TARGET", color: "#22C55E", dash: "3 5", weight: 1.2 });

          return items.map((it, i) => {
            if (it.price >= pMin && it.price <= pMax) {
              const y = toY(it.price, pMin, pMax);
              return (
                <g key={i}>
                  <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                    stroke={it.color} strokeWidth={it.weight} strokeDasharray={it.dash} opacity={0.9} />
                  <rect x={W - PAD_R} y={y - 7} width={PAD_R - 2} height={12} fill={it.color + "20"} />
                  <text x={W - PAD_R + 4} y={y + 3} fill={it.color} fontSize={8} fontFamily="monospace" fontWeight="bold">{it.label}</text>
                  {/* Drag handle — invisible, wide, on top of the entry line */}
                  {it.draggable && (
                    <>
                      <line
                        x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                        stroke="transparent" strokeWidth={14}
                        style={{ cursor: "ns-resize" }}
                        onPointerDown={handleEntryPointerDown}
                      />
                      {/* Grip dots — visual affordance */}
                      <circle cx={PAD_L + 8}   cy={y} r={2} fill={it.color} />
                      <circle cx={PAD_L + 14}  cy={y} r={2} fill={it.color} />
                      <circle cx={PAD_L + 20}  cy={y} r={2} fill={it.color} />
                    </>
                  )}
                </g>
              );
            }
            // Out of range — show edge badge
            const above = it.price > pMax;
            const y = above ? PAD_T + 2 : H_MAIN - 14;
            return (
              <g key={i}>
                <rect x={W - PAD_R - 2} y={y - 1} width={PAD_R} height={12} fill={it.color + "25"} stroke={it.color} strokeWidth={0.5} />
                <text x={W - PAD_R + 2} y={y + 8} fill={it.color} fontSize={7.5} fontFamily="monospace" fontWeight="bold">
                  {it.label} {above ? "↑" : "↓"} {fmtP(it.price)}
                </text>
              </g>
            );
          });
        })()}

        {/* ── Main pane border ── */}
        <line x1={PAD_L} y1={H_MAIN} x2={W - PAD_R} y2={H_MAIN} stroke="#1A1A1A" strokeWidth={1} />

        {/* ── Volume bars ── */}
        {visible.map((c, i) => {
          const cx    = idxToX(i);
          const volH  = ((c.v ?? 0) / maxVol) * (H_VOL - 6);
          const green = c.c >= c.o;
          return (
            <rect
              key={`v${i}`}
              x={cx - barW / 2}
              y={H_MAIN + (H_VOL - 6) - volH + 3}
              width={barW}
              height={Math.max(1, volH)}
              fill={green ? "#22C55E" : "#EF4444"}
              opacity={0.35}
              shapeRendering="crispEdges"
            />
          );
        })}

        {/* VOL label */}
        <text x={W - PAD_R + 5} y={H_MAIN + 14} fill="#333" fontSize={8} fontFamily="monospace">VOL</text>

        {/* ── Crosshair ── */}
        {tooltip && !dragging && (
          <g>
            <line
              x1={tooltip.svgX} y1={PAD_T}
              x2={tooltip.svgX} y2={H_MAIN + H_VOL}
              stroke="#444" strokeWidth={0.7} strokeDasharray="2 3"
            />
          </g>
        )}

        {/* ── X-axis labels ── */}
        {xLabelIdxs.map((idx, li) => {
          if (idx >= total) return null;
          const x = idxToX(idx);
          const anchor = li === 0 ? "start" : li === xLabelIdxs.length - 1 ? "end" : "middle";
          return (
            <text
              key={li}
              x={x} y={H_MAIN + H_VOL + 14}
              fill="#404040" fontSize={8} fontFamily="monospace" textAnchor={anchor}
            >
              {fmtTime(visible[idx].t, tf)}
            </text>
          );
        })}
      </svg>

      {/* Tooltip overlay */}
      {tooltip && !dragging && (
        <div
          className="absolute pointer-events-none z-20 bg-[#111] border border-neutral-700 px-2.5 py-1.5 font-mono text-[10px] text-neutral-300"
          style={{
            top: 56,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
          }}
        >
          <span className="text-neutral-500 mr-2">{fmtTime(tooltip.candle.t, tf)}</span>
          <span className="mr-2">O:{fmtP(tooltip.candle.o)}</span>
          <span className="text-green-400 mr-2">H:{fmtP(tooltip.candle.h)}</span>
          <span className="text-red-400 mr-2">L:{fmtP(tooltip.candle.l)}</span>
          <span className="text-orange-400 mr-2">C:{fmtP(tooltip.candle.c)}</span>
          {onPickEntry && <span className="text-neutral-600">· click to pin entry</span>}
        </div>
      )}

      {/* Drag tooltip */}
      {dragging && dragPrice != null && (
        <div
          className="absolute pointer-events-none z-20 bg-[#1a0f05] border border-orange-500 px-2.5 py-1.5 font-mono text-[10px] text-orange-300"
          style={{ top: 56, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}
        >
          ENTRY → <span className="text-orange-400 font-bold">{fmtP(dragPrice)}</span>
          <span className="text-neutral-500 ml-2">release to commit</span>
        </div>
      )}
    </div>
  );
}
