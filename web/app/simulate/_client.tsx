"use client";
// ---------------------------------------------------------------------------
// /simulate — PRE-TRADE risk calculator (forward-looking only)
// ---------------------------------------------------------------------------
// Mirror of the CLI `pacifica simulate <side> <market> <size>` command:
//   - side / market / size / leverage / entry price
//   - liquidation price
//   - P&L grid at fixed exit pcts (-10/-5/-2/+2/+5/+10/+20%)
//   - funding cost at the current 8h rate
//
// This page is NOT a backtest. For history replay see /backtest/[name]
// (web showcase) or the CLI `pacifica backtest <name>`.
// ---------------------------------------------------------------------------

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";
import { PriceChart, type TF } from "./_components/PriceChart";
import { useLiveMarket } from "./_hooks/useLiveMarket";
import { simulate, calcLiquidationPrice } from "./_lib/simulate";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNOWN_MARKETS = [
  "BTC", "ETH", "SOL", "WIF", "BONK", "MON", "SUI",
  "AVAX", "DOGE", "PEPE", "ARB", "OP", "JUP", "TIA",
];
const LEVERAGE_PRESETS = [2, 5, 10, 20, 50];
const SIZE_PRESETS = [100, 500, 1000, 5000];

// Fixed exit scenarios — identical to the CLI simulate command.
const SCENARIO_PCTS = [-10, -5, -2, 2, 5, 10, 20];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPrice(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

// ---------------------------------------------------------------------------
// Inner form
// ---------------------------------------------------------------------------

function SimulateForm() {
  const searchParams = useSearchParams();

  const paramSide = searchParams.get("side");
  const paramSymbol = searchParams.get("symbol")?.toUpperCase();
  const paramPrice = searchParams.get("price");

  const initialSide = (paramSide === "short" ? "short" : "long") as "long" | "short";
  const initialSymbol = paramSymbol && KNOWN_MARKETS.includes(paramSymbol)
    ? paramSymbol
    : (paramSymbol ?? "ETH");

  const [side, setSide] = useState<"long" | "short">(initialSide);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [customSymbol, setCustomSymbol] = useState(
    paramSymbol && !KNOWN_MARKETS.includes(paramSymbol) ? paramSymbol : "",
  );
  const [sizeUsd, setSizeUsd] = useState("1000");
  const [leverage, setLeverage] = useState("5");
  const [entryPrice, setEntryPrice] = useState(paramPrice ?? "");
  const [manualFunding, setManualFunding] = useState("");
  const [chartTf, setChartTf] = useState<TF>("1D");
  const resultsRef = useRef<HTMLDivElement>(null);

  // Sync state with URL params across navigations
  useEffect(() => {
    if (paramSide === "short" || paramSide === "long") setSide(paramSide);
  }, [paramSide]);

  useEffect(() => {
    if (!paramSymbol) return;
    const inList = KNOWN_MARKETS.includes(paramSymbol);
    setSymbol(inList ? paramSymbol : "ETH");
    setCustomSymbol(inList ? "" : paramSymbol);
    setEntryPrice(paramPrice ?? "");
    setManualFunding("");
  }, [paramSymbol, paramPrice]);

  const sym = (customSymbol.trim().toUpperCase() || symbol);

  // Auto-fetch live market (price + funding)
  const live = useLiveMarket(sym);

  // Auto-fill entry price when live price arrives / sym changes
  useEffect(() => {
    if (live.price && live.price > 0) {
      const dp = live.price >= 1000 ? 2 : live.price >= 1 ? 4 : 6;
      setEntryPrice(live.price.toFixed(dp));
    }
  }, [sym, live.price]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill funding (don't overwrite manual edits)
  useEffect(() => {
    if (live.funding != null && !manualFunding) {
      setManualFunding(String((live.funding * 100).toFixed(4)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.funding]);

  const epNum = parseFloat(entryPrice);
  const levNum = parseFloat(leverage);
  const sizeNum = parseFloat(sizeUsd);
  const fundNum = parseFloat(manualFunding || "0") / 100;

  const isValid =
    !isNaN(epNum) && epNum > 0 &&
    !isNaN(levNum) && levNum >= 1 &&
    !isNaN(sizeNum) && sizeNum > 0;

  const liqPrice = useMemo(() => {
    if (!isValid) return null;
    return calcLiquidationPrice(side, epNum, levNum);
  }, [isValid, side, epNum, levNum]);

  const simResult = useMemo(() => {
    if (!isValid) return null;
    return simulate(side, sym, sizeNum, levNum, epNum, fundNum, SCENARIO_PCTS);
  }, [isValid, side, sym, sizeNum, levNum, epNum, fundNum]);

  const marginRequired = isValid ? sizeNum / levNum : null;
  const liqDistPct = isValid ? (100 / levNum).toFixed(1) : null;

  return (
    <div className="px-6 py-12 pb-20">
      {/* Header */}
      <div className="mb-10">
        <OrangeLabel text="/ PRE-TRADE CALCULATOR" />
        <h1 className="text-3xl font-bold text-white mt-2">Risk Simulator</h1>
        <p className="text-neutral-500 text-sm mt-1 font-mono">
          Forward-looking math — liquidation, P&amp;L at fixed price moves, funding cost.
          Not a backtest. For history replay see{" "}
          <Link href="/backtest/funding-carry-btc" className="text-orange-400 hover:underline">
            /backtest
          </Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">

        {/* ── Left: Form ── */}
        <div className="space-y-5">

          {/* Side toggle */}
          <div>
            <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
              Direction
            </label>
            <div className="flex">
              {(["long", "short"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors border ${
                    s === "long" ? "border-l" : "border-r border-t border-b"
                  } ${
                    side === s
                      ? s === "long"
                        ? "bg-green-500/10 border-green-500/40 text-green-400"
                        : "bg-red-500/10 border-red-500/40 text-red-400"
                      : "bg-transparent border-neutral-500/20 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s === "long" ? "↑ Long" : "↓ Short"}
                </button>
              ))}
            </div>
          </div>

          {/* Market */}
          <div>
            <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
              Market
            </label>
            <div className="flex gap-2">
              <select
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setCustomSymbol("");
                  setEntryPrice("");
                  setManualFunding("");
                }}
                className="flex-1 bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono focus:outline-none focus:border-orange-500/50"
              >
                {KNOWN_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                type="text"
                placeholder="or type…"
                value={customSymbol}
                onChange={(e) => {
                  setCustomSymbol(e.target.value.toUpperCase());
                  setEntryPrice("");
                  setManualFunding("");
                }}
                className="w-28 bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>

          {/* Size + Leverage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">Size (USD)</label>
              <input
                type="number" min="1" value={sizeUsd}
                onChange={(e) => setSizeUsd(e.target.value)}
                className="w-full bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono focus:outline-none focus:border-orange-500/50"
              />
              <div className="flex gap-1 mt-1.5">
                {SIZE_PRESETS.map((s) => (
                  <button key={s} onClick={() => setSizeUsd(String(s))}
                    className={`flex-1 text-[10px] font-mono py-0.5 border transition-colors ${
                      sizeUsd === String(s) ? "border-orange-500/50 text-orange-400 bg-orange-500/10" : "border-neutral-500/15 text-neutral-600 hover:text-neutral-400"
                    }`}>
                    ${s >= 1000 ? `${s / 1000}k` : s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">Leverage</label>
              <input
                type="number" min="1" max="100" value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="w-full bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono focus:outline-none focus:border-orange-500/50"
              />
              <div className="flex gap-1 mt-1.5">
                {LEVERAGE_PRESETS.map((l) => (
                  <button key={l} onClick={() => setLeverage(String(l))}
                    className={`flex-1 text-[10px] font-mono py-0.5 border transition-colors ${
                      leverage === String(l) ? "border-orange-500/50 text-orange-400 bg-orange-500/10" : "border-neutral-500/15 text-neutral-600 hover:text-neutral-400"
                    }`}>
                    {l}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Entry Price */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                Entry Price (USD)
              </label>
              <div className="flex items-center gap-2">
                {live.loading && <span className="text-[9px] font-mono text-orange-500 animate-pulse">fetching…</span>}
                {live.price && live.price > 0 && !live.loading && (
                  <button
                    onClick={() => setEntryPrice(String(live.price))}
                    className="text-[9px] font-mono text-orange-500/70 hover:text-orange-400 border border-orange-500/20 px-1.5 py-0.5 hover:border-orange-500/40 transition-colors"
                    title="Reset to live market price"
                  >
                    ↺ live: ${live.price?.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                  </button>
                )}
                {live.source === "testnet" && !live.loading && (
                  <span className="text-[9px] font-mono text-green-600">● testnet</span>
                )}
              </div>
            </div>
            <input
              type="number" min="0" step="any" value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="Enter price manually or auto-fetches…"
              className="w-full bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>

          {/* Funding */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                8h Funding Rate (%)
              </label>
              {live.funding != null && (
                <span className={`text-[9px] font-mono ${live.funding < 0 ? "text-green-600" : "text-red-500/70"}`}>
                  {live.funding < 0 ? "negative — longs earn" : "positive — shorts earn"}
                </span>
              )}
            </div>
            <input
              type="number" step="0.0001" value={manualFunding}
              onChange={(e) => setManualFunding(e.target.value)}
              placeholder="0.01"
              className="w-full bg-[#111111] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50"
            />
          </div>

          {/* CTA */}
          <div className="pt-2">
            <button
              type="button"
              disabled={!isValid}
              onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={`w-full py-3 font-mono text-sm font-bold tracking-wider text-center border transition-colors ${
                isValid
                  ? "bg-orange-500 border-orange-500 text-black hover:bg-orange-400 cursor-pointer"
                  : "bg-transparent border-neutral-500/20 text-neutral-600 cursor-not-allowed"
              }`}
            >
              {isValid ? "▶ View Simulation →" : "Enter size + leverage to simulate"}
            </button>
            {isValid && (
              <p className="text-[10px] font-mono text-neutral-600 text-center mt-1.5">
                Results update live as you type
              </p>
            )}
          </div>

          <p className="text-[11px] text-neutral-700 font-mono text-center">
            <Link href="/simulate?side=long&symbol=BTC" className="text-orange-500/60 hover:text-orange-500">Long BTC</Link>
            {" · "}
            <Link href="/simulate?side=short&symbol=ETH" className="text-orange-500/60 hover:text-orange-500">Short ETH</Link>
            {" · "}
            <Link href="/simulate?side=long&symbol=WIF" className="text-orange-500/60 hover:text-orange-500">Long WIF</Link>
          </p>
        </div>

        {/* ── Right: Results ── */}
        <div ref={resultsRef} className="space-y-4">

          {/* Summary card */}
          {isValid && (
            <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
              <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
              <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
              <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
              <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

              <div className="flex items-center gap-3 mb-4">
                <span className={`text-sm font-bold font-mono px-2 py-0.5 border ${
                  side === "long" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}>{side.toUpperCase()}</span>
                <span className="text-white font-bold">{sym}-PERP</span>
                <span className="text-neutral-500 font-mono text-sm">{levNum}x</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Entry Price</p>
                  <p className="text-white font-mono text-lg font-semibold mt-0.5">{fmtPrice(epNum)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Liquidation Price</p>
                  <p className="text-red-400 font-mono text-lg font-semibold mt-0.5">
                    {liqPrice ? fmtPrice(liqPrice) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Position Size</p>
                  <p className="text-white font-mono mt-0.5">${sizeNum.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Margin Required</p>
                  <p className="text-white font-mono mt-0.5">${marginRequired?.toFixed(2)}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-500/10">
                <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">Distance to Liquidation</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-neutral-800">
                    <div className="h-full bg-gradient-to-r from-red-500 to-orange-500"
                         style={{ width: `${Math.min(100 / levNum, 100).toFixed(1)}%` }} />
                  </div>
                  <span className="text-neutral-400 text-sm font-mono">{liqDistPct}% move</span>
                </div>
              </div>
            </div>
          )}

          {/* Price chart (reference only — no σ band, no pattern overlays) */}
          <PriceChart
            symbol={sym}
            entryPrice={isValid ? epNum : null}
            liquidationPrice={isValid ? liqPrice : null}
            targetPrice={null}
            sigmaBand={null}
            scenarioPrice={null}
            scenarioLabel={null}
            tf={chartTf}
            onTfChange={setChartTf}
            onPickEntry={(p) => {
              const dp = p >= 1000 ? 2 : p >= 1 ? 4 : 6;
              setEntryPrice(p.toFixed(dp));
            }}
          />

          {/* P&L grid — fixed exit pcts, mirrors CLI */}
          {isValid && simResult && (
            <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

              <p className="text-sm font-semibold text-white mb-1">
                If price moves, here&apos;s your P&amp;L
              </p>
              <p className="text-[11px] font-mono text-neutral-500 mb-4">
                Forward-looking only. Same exit pcts as <code className="bg-neutral-800 px-1">pacifica simulate</code>.
              </p>

              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1.5 px-1 text-[9px] font-mono text-neutral-700 uppercase tracking-wider border-b border-neutral-500/20 pb-1.5">
                <span>Move</span>
                <span>Exit price</span>
                <span className="text-right">P&amp;L</span>
                <span className="text-right">% margin</span>
              </div>
              <div className="mt-1 divide-y divide-neutral-500/10">
                {simResult.scenarios.map((s) => {
                  const exitPrice = epNum * (1 + s.pricePct / 100);
                  const isProfit = s.pnl >= 0;
                  return (
                    <div
                      key={s.label}
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center px-1 py-1.5"
                    >
                      <span className="font-mono text-xs text-neutral-400">
                        {s.label}
                      </span>
                      <span className="font-mono text-sm text-neutral-300">
                        {fmtPrice(exitPrice)}
                      </span>
                      <span className={`font-mono text-sm font-semibold text-right ${isProfit ? "text-green-400" : "text-red-400"}`}>
                        {isProfit ? "+" : ""}${s.pnl.toFixed(2)}
                      </span>
                      <span className={`font-mono text-xs text-right ${isProfit ? "text-green-700" : "text-red-700"}`}>
                        {isProfit ? "+" : ""}{s.pnlPct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Funding */}
          {simResult && (
            <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />
              <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-3">
                Funding Cost (at current rate)
              </p>
              <div className="flex gap-6">
                {simResult.funding.map((f) => (
                  <div key={f.label}>
                    <p className="text-[11px] font-mono text-neutral-600">{f.label}</p>
                    <p className={`font-mono text-sm font-semibold mt-0.5 ${f.cost >= 0 ? "text-red-400" : "text-green-400"}`}>
                      {f.cost >= 0 ? "-" : "+"}${Math.abs(f.cost).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-600 font-mono mt-3">
                {side === "long" ? "Long pays funding when rate is positive" : "Short receives funding when rate is positive"}
              </p>
            </div>
          )}

          {/* Empty state */}
          {!isValid && (
            <div className="h-full flex flex-col items-center justify-center border border-neutral-500/10 bg-[#111111] min-h-[200px] gap-3 p-8 text-center">
              <p className="text-neutral-500 font-mono text-sm">
                {live.loading ? "Fetching live price…" : "Enter size and leverage to see results"}
              </p>
              <p className="text-neutral-700 font-mono text-[11px]">
                Price and funding are auto-populated from the Pacifica testnet API
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={
      <div className="px-6 py-12">
        <OrangeLabel text="/ PRE-TRADE CALCULATOR" />
        <h1 className="text-3xl font-bold text-white mt-2">Risk Simulator</h1>
        <p className="text-neutral-600 font-mono text-sm mt-4">Loading…</p>
      </div>
    }>
      <SimulateForm />
    </Suspense>
  );
}
