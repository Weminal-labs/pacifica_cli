// ---------------------------------------------------------------------------
// /backtest/[name] — replay a bundled example pattern against 30 days of
// hourly candles and render the trade list + equity curve.
// ---------------------------------------------------------------------------
// Edge-rendered. Patterns are bundled (see web/lib/example-patterns.ts) —
// the trader's personal patterns live on their machine and are reached via
// the CLI (`pacifica backtest`) or MCP (`pacifica_backtest_pattern`).
// ---------------------------------------------------------------------------

export const runtime = "edge";

import Link from "next/link";
import { notFound } from "next/navigation";
import { OrangeLabel } from "../../../components/ui/OrangeLabel";
import { getExamplePattern, listExamplePatternNames } from "../../../lib/example-patterns";
import { getCandles, getBinanceCandles, stripPerpSuffix } from "@pacifica/core/patterns/candles";
import { runBacktest, type BacktestResult } from "@pacifica/core/patterns/backtest";
import { EquityCurve } from "./_components/EquityCurve";
import { TradesTable } from "./_components/TradesTable";

// Allow static params for bundled examples (Next can pre-render at build).
export function generateStaticParams() {
  return listExamplePatternNames().map((name) => ({ name }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { name: string };
  searchParams?: { days?: string; market?: string };
}

export default async function BacktestPage({ params, searchParams }: PageProps) {
  const pattern = getExamplePattern(params.name);
  if (!pattern) notFound();

  const days = Math.min(90, Math.max(1, parseInt(searchParams?.days ?? "30", 10) || 30));
  const marketOverride = searchParams?.market;
  const targetMarket = marketOverride ?? (pattern.market === "ANY" ? null : pattern.market);

  if (!targetMarket) {
    return (
      <div className="px-6 py-12">
        <OrangeLabel text="/ BACKTEST" />
        <h1 className="text-3xl font-bold text-white mt-2">{pattern.name}</h1>
        <p className="text-orange-400 font-mono text-sm mt-4">
          This pattern declares market: ANY. Append ?market=BTC (or similar) to backtest a specific market.
        </p>
      </div>
    );
  }

  const base = stripPerpSuffix(targetMarket);
  let candles = await getCandles(base, { days });
  let usedBinanceFallback = false;

  let result: BacktestResult | null = null;
  let fetchError: string | null = null;
  if (candles.length < 24) {
    fetchError = `Couldn't fetch enough candle history for ${base} (got ${candles.length}). The Pacifica testnet + Binance public APIs both returned short data.`;
  } else {
    result = runBacktest(pattern, candles, `${base}-USDC-PERP`);

    // If testnet data produced 0 trades, retry with real Binance prices.
    // Testnet prices often don't reflect real markets, so the pattern's
    // thresholds (e.g. mark_price > 85000) may never trigger.
    if (result.trades.length === 0 && !result.all_conditions_skipped) {
      const binanceCandles = await getBinanceCandles(base, { days });
      if (binanceCandles.length >= 24) {
        const binanceResult = runBacktest(pattern, binanceCandles, `${base}-USDC-PERP`);
        if (binanceResult.trades.length > 0) {
          result = binanceResult;
          candles = binanceCandles;
          usedBinanceFallback = true;
        }
      }
    }
  }

  return (
    <div className="px-6 py-12 pb-20 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <OrangeLabel text="/ PATTERN BACKTEST" />
        <div className="flex items-end justify-between mt-2 flex-wrap gap-3">
          <h1 className="text-3xl font-bold text-white">{pattern.name}</h1>
          <Link
            href="/patterns"
            className="font-mono text-[11px] text-neutral-500 hover:text-orange-400 border border-neutral-500/20 hover:border-orange-500/30 px-3 py-1 transition-colors"
          >
            ← all patterns
          </Link>
        </div>
        <p className="text-neutral-500 text-sm mt-2 font-mono">
          {pattern.description || "user-authored pattern"}
        </p>
        <p className="text-neutral-700 text-xs mt-1 font-mono">
          {targetMarket} · last {days} days · 1h candles
        </p>
      </div>

      {/* Binance fallback banner */}
      {usedBinanceFallback && (
        <div className="mb-6 border border-neutral-500/20 bg-neutral-500/5 p-4">
          <p className="font-mono text-[11px] text-neutral-400">
            Backtest ran against <span className="text-white">Binance spot prices</span> — Pacifica testnet prices produced 0 trades.
          </p>
        </div>
      )}

      {/* Skipped-axes banner — LOUD */}
      {result && result.skipped_axes.length > 0 && (
        <div className="mb-6 border-2 border-orange-500/70 bg-orange-500/5 p-4">
          <p className="font-mono text-[11px] text-orange-400 font-bold uppercase tracking-wider mb-1">
            ⚠ directional-only backtest
          </p>
          <p className="text-sm text-neutral-300 leading-relaxed">
            This backtest only checks price and volume conditions.
            The pattern&apos;s {result.skipped_axes.map((a) => <code key={a} className="font-mono text-orange-400 bg-orange-500/10 px-1 mx-0.5">{a}</code>)} rule(s)
            are skipped because we don&apos;t have that history from candles.
            Treat these results as directional-only validation — not a complete backtest.
          </p>
          {result.all_conditions_skipped && (
            <p className="text-sm text-red-400 mt-2 font-mono">
              All when: conditions use non-candle axes → backtest produced 0 trades by design.
              Run this pattern live via <code className="bg-red-500/10 px-1">pacifica_run_pattern</code>.
            </p>
          )}
        </div>
      )}

      {/* Error state */}
      {fetchError && (
        <div className="border border-red-500/30 bg-red-500/5 p-4 mb-6">
          <p className="text-red-400 font-mono text-sm">{fetchError}</p>
        </div>
      )}

      {/* Summary strip */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <SummaryCell label="trades" value={String(result.summary.n_trades)} />
          <SummaryCell
            label="win rate"
            value={result.summary.n_trades > 0 ? `${(result.summary.win_rate * 100).toFixed(0)}%` : "—"}
          />
          <SummaryCell
            label="total P&L"
            value={fmtUsd(result.summary.total_pnl_usd)}
            tone={result.summary.total_pnl_usd >= 0 ? "good" : "bad"}
          />
          <SummaryCell
            label="avg / trade"
            value={result.summary.n_trades > 0
              ? `${fmtUsd(result.summary.avg_pnl_usd)} · ${result.summary.avg_pnl_pct_on_margin >= 0 ? "+" : ""}${result.summary.avg_pnl_pct_on_margin.toFixed(1)}% margin`
              : "—"}
          />
          <SummaryCell
            label="max drawdown"
            value={result.summary.n_trades > 0 ? `-$${result.summary.max_drawdown_usd.toFixed(2)}` : "—"}
            tone="bad"
          />
        </div>
      )}

      {/* Equity curve */}
      {result && (
        <div className="mb-6">
          <EquityCurve trades={result.trades} />
        </div>
      )}

      {/* Trades table */}
      {result && <TradesTable trades={result.trades} />}

      {/* Footnote */}
      {result && (
        <div className="mt-6 text-[11px] font-mono text-neutral-600 space-y-1 leading-relaxed">
          <p>
            Window: {fmtDate(result.window.start)} → {fmtDate(result.window.end)} ({result.window.candle_count} hourly candles)
          </p>
          <p>
            Entry fires at the open of the candle AFTER when: becomes true.
            Exits check stop-loss → take-profit → liquidation intra-candle, then the exit: clause at close.
            Funding cost is NOT included (candles don&apos;t carry funding history).
          </p>
          <p>
            Want to backtest your own pattern? Use{" "}
            <code className="bg-neutral-800 px-1 py-0.5">pacifica backtest {"<name>"}</code>{" "}
            in the CLI or <code className="bg-neutral-800 px-1 py-0.5">pacifica_backtest_pattern</code> in Claude.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCell({
  label, value, tone,
}: { label: string; value: string; tone?: "good" | "bad" }) {
  const valueClass = tone === "good"
    ? "text-green-400"
    : tone === "bad"
    ? "text-red-400"
    : "text-white";
  return (
    <div className="bg-[#111] border border-neutral-500/10 p-3">
      <p className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-sm font-semibold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}
