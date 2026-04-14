import Link from "next/link";
import { OrangeLabel } from "../../../components/ui/OrangeLabel";
import type { TraderProfile, TradeRecord } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getTrader(address: string): Promise<TraderProfile | null> {
  try {
    const res = await fetch(
      `http://localhost:4242/api/intelligence/trader/${address}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as TraderProfile;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function durationLabel(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

function pnlColor(pnl: number | null): string {
  if (pnl === null) return "text-neutral-400";
  return pnl >= 0 ? "text-emerald-400" : "text-red-400";
}

function repBadgeColor(score: number): string {
  if (score >= 70) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (score >= 50) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-neutral-700 text-neutral-400 border-neutral-600";
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label, value, sub, green,
}: { label: string; value: string; sub?: string; green?: boolean }) {
  return (
    <div className="bg-[#111] border border-neutral-800 rounded-xl p-5">
      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold ${green ? "text-emerald-400" : "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade log row
// ---------------------------------------------------------------------------

function TradeRow({ r, idx }: { r: TradeRecord; idx: number }) {
  const pnl = r.pnl_pct;
  const isOpen = r.closed_at === null;

  return (
    <tr className={`border-b border-neutral-800 hover:bg-neutral-900/40 transition-colors ${idx % 2 === 0 ? "" : "bg-[#0e0e0e]"}`}>
      {/* Asset + direction */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{r.asset.split("-")[0]}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.direction === "long" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
            {r.direction.toUpperCase()}
          </span>
          {isOpen && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
              OPEN
            </span>
          )}
        </div>
      </td>

      {/* Size */}
      <td className="px-4 py-3 text-neutral-300 text-sm">
        ${(r.size_usd / 1000).toFixed(1)}K
      </td>

      {/* Entry */}
      <td className="px-4 py-3 text-neutral-400 text-sm font-mono">
        ${r.entry_price.toFixed(r.entry_price > 100 ? 0 : 4)}
      </td>

      {/* PnL */}
      <td className={`px-4 py-3 text-sm font-semibold ${pnlColor(pnl)}`}>
        {pnl !== null ? `${pnl >= 0 ? "+" : ""}${fmt(pnl)}%` : "—"}
        {r.pnl_usd !== null && (
          <span className="block text-[10px] font-normal text-neutral-500">
            {fmtUsd(r.pnl_usd)}
          </span>
        )}
      </td>

      {/* Duration */}
      <td className="px-4 py-3 text-neutral-400 text-sm">
        {durationLabel(r.duration_minutes)}
      </td>

      {/* Opened */}
      <td className="px-4 py-3 text-neutral-500 text-xs">
        {fmtDate(r.opened_at)}
      </td>

      {/* Tags */}
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {r.pattern_tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-neutral-400">
              {tag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TraderPage({
  params,
}: {
  params: { address: string };
}) {
  const { address } = params;
  const data = await getTrader(address);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] max-w-5xl mx-auto px-6 py-12">
        <Link href="/reputation" className="text-orange-400 text-sm hover:underline">
          ← Back to Reputation
        </Link>
        <div className="mt-12 text-center">
          <p className="text-neutral-500 text-lg">Trader not found</p>
          <p className="text-neutral-600 text-sm mt-2 font-mono">{address}</p>
        </div>
      </div>
    );
  }

  const { reputation: rep, trade_records: records, onchain_pnl: onchain } = data;
  const openTrades  = records.filter((r) => r.closed_at === null).length;
  const closedTrades = records.filter((r) => r.closed_at !== null).length;
  const conditions  = Object.values(rep.accuracy_by_condition ?? {}).sort(
    (a, b) => b.win_rate - a.win_rate,
  );

  // Explorer link (Solana)
  const explorerUrl = `https://explorer.solana.com/address/${data.address}?cluster=devnet`;

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8">
        <Link href="/reputation" className="text-orange-400 text-sm hover:underline">
          ← Reputation
        </Link>
        <span className="text-neutral-600">/</span>
        <span className="text-neutral-400 text-sm font-mono">{data.address.slice(0, 16)}...</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <OrangeLabel text="/ TRADER PROFILE" />
          <h1 className="text-3xl font-bold text-white mt-3 mb-1 font-mono break-all">
            {data.address}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs font-bold px-2 py-1 rounded border ${repBadgeColor(rep.overall_rep_score)}`}>
              REP {rep.overall_rep_score}
            </span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-500 hover:text-orange-400 transition-colors"
            >
              View on Explorer ↗
            </a>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard
          label="Win Rate"
          value={`${(rep.overall_win_rate * 100).toFixed(1)}%`}
          sub={`${closedTrades} closed trades`}
          green={rep.overall_win_rate >= 0.6}
        />
        <StatCard
          label="Open Trades"
          value={String(openTrades)}
          sub="currently active"
        />
        {onchain ? (
          <>
            <StatCard
              label="PnL All-Time"
              value={fmtUsd(onchain.pnl_all_time)}
              sub="on-chain verified"
              green={onchain.pnl_all_time > 0}
            />
            <StatCard
              label="Account Equity"
              value={`$${(onchain.equity_current / 1000).toFixed(1)}K`}
              sub={`Vol 30d: $${(onchain.volume_30d / 1_000_000).toFixed(1)}M`}
            />
          </>
        ) : (
          <>
            <StatCard label="Total Trades" value={String(rep.total_trades)} sub="all time" />
            <StatCard label="Rep Score" value={String(rep.overall_rep_score)} />
          </>
        )}
      </div>

      {/* On-chain PnL row */}
      {onchain && (
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "PnL 1D",  value: onchain.pnl_1d  },
            { label: "PnL 7D",  value: onchain.pnl_7d  },
            { label: "PnL 30D", value: onchain.pnl_30d },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#111] border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-xs text-neutral-500 uppercase tracking-wider">{label}</span>
              <span className={`text-sm font-bold ${pnlColor(value)}`}>
                {fmtUsd(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Trade log */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            Trade Log
            <span className="ml-2 text-sm font-normal text-neutral-500">{records.length} records</span>
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="border border-neutral-800 rounded-xl p-10 text-center text-neutral-500">
            No trade records found for this address.
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111] border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Asset</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Size</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Entry</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">PnL</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Duration</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Opened</th>
                  <th className="text-left px-4 py-3 text-neutral-500 font-medium text-xs uppercase tracking-wider">Signals</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <TradeRow key={r.id} r={r} idx={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Condition accuracy */}
      {conditions.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Signal Accuracy</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {conditions.map((c) => (
              <div key={c.condition_key} className="bg-[#111] border border-neutral-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-400 font-medium">
                    {c.condition_key.replace(/_/g, " ")}
                  </span>
                  <span className={`text-sm font-bold ${c.win_rate >= 0.6 ? "text-emerald-400" : "text-neutral-400"}`}>
                    {(c.win_rate * 100).toFixed(0)}%
                  </span>
                </div>
                {/* Win rate bar */}
                <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.win_rate >= 0.6 ? "bg-emerald-500" : "bg-neutral-600"}`}
                    style={{ width: `${(c.win_rate * 100).toFixed(0)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-neutral-600">
                  <span>{c.profitable_trades}/{c.total_trades} trades</span>
                  <span>{c.avg_pnl_pct >= 0 ? "+" : ""}{c.avg_pnl_pct.toFixed(1)}% avg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
