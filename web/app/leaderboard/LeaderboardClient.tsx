"use client";

// ---------------------------------------------------------------------------
// LeaderboardClient — sortable, filterable, watchlist-aware, expandable rows
// ---------------------------------------------------------------------------

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Pattern } from "../../lib/types";

// ---------------------------------------------------------------------------
// Types (exported so the server page stays type-safe)
// ---------------------------------------------------------------------------

export interface Position {
  symbol:           string;
  side:             "bid" | "ask";
  amount:           number;
  entryPrice:       number;
  liquidationPrice: number;
  funding:          number;
  margin:           number;
  notional:         number;
}

export interface EnrichedEntry {
  rank:              number;
  address:           string;
  username:          string | null;
  pnl1d:             number;
  pnl7d:             number;
  pnl30d:            number;
  pnlAll:            number;
  equity:            number;
  oi:                number;
  volume:            number;
  repScore:          number;
  positions:         Position[];
  consistency:       number;  // 0-4
  momentum:          number;  // 1D / 7D ratio
  leverage:          number;  // OI / equity
  concentration:     number;  // unique assets
  bias:              number;  // -1..+1
  capitalEfficiency: number;  // pnlAll / equity
}

export interface ConsensusAsset {
  symbol:        string;
  longCount:     number;
  shortCount:    number;
  totalTraders:  number;
  longNotional:  number;
  shortNotional: number;
  traders:       string[];
}

export interface MarketRegime {
  avgBias:      number;
  risingCount:  number;
  totalTracked: number;
  positive1d:   number;
  topGainer:    EnrichedEntry | null;
  topLoser:     EnrichedEntry | null;
}

// ---------------------------------------------------------------------------
// Pattern-matching types + helpers
// ---------------------------------------------------------------------------

interface PatternMatch {
  pattern:      Pattern;
  asset:        string;
  direction:    "long" | "short" | "neutral";
  positionSide: "bid" | "ask";
  aligned:      boolean; // position direction agrees with pattern bias
}

function inferPatternDirection(pattern: Pattern): "long" | "short" | "neutral" {
  let longSignals  = 0;
  let shortSignals = 0;

  for (const c of pattern.conditions) {
    if (c.axis === "funding_rate") {
      // negative funding → longs earn → bullish for LONG
      if (c.op === "lt" && typeof c.value === "number" && c.value <= 0) longSignals++;
      // positive funding → shorts earn → bullish for SHORT
      if (c.op === "gt" && typeof c.value === "number" && c.value >= 0) shortSignals++;
    }
    if (c.axis === "buy_pressure") {
      if (c.op === "gt") longSignals++;
      if (c.op === "lt") shortSignals++;
    }
    if (c.axis === "momentum_signal") {
      if (c.value === "bullish") longSignals++;
      if (c.value === "bearish") shortSignals++;
    }
  }

  if (longSignals > shortSignals)  return "long";
  if (shortSignals > longSignals)  return "short";
  return "neutral";
}

function patternMatchForPositions(positions: Position[], patterns: Pattern[]): PatternMatch[] {
  const seen    = new Set<string>();
  const matches: PatternMatch[] = [];

  for (const pattern of patterns) {
    const patternAssets = new Set(
      pattern.primary_assets.map((a) =>
        a.replace(/-USDC-PERP$/, "").replace(/-USDC$/, ""),
      ),
    );
    const direction = inferPatternDirection(pattern);

    for (const pos of positions) {
      if (!patternAssets.has(pos.symbol)) continue;

      const key = `${pattern.id}:${pos.symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const posDir  = pos.side === "bid" ? "long" : "short";
      const aligned = direction === "neutral" || direction === posDir;

      matches.push({ pattern, asset: pos.symbol, direction, positionSide: pos.side, aligned });
    }
  }

  return matches;
}

function shortPatternName(name: string): string {
  return name
    .replace(/\+.*/,    "")   // strip "...+ ..." suffix
    .replace(/After.*/,  "")   // strip "...After..." suffix
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Local state types
// ---------------------------------------------------------------------------

type SortKey = "rank" | "pnl1d" | "pnl7d" | "pnl30d" | "pnlAll" | "equity" | "leverage" | "consistency";
type SortDir = "asc" | "desc";
type Filter  = "all" | "rising" | "falling" | "consistent" | "leveraged" | "watchlisted" | "pattern_match";

const WATCHLIST_KEY = "pacifica.leaderboard.watchlist";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAmount(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

function fmtPrice(n: number): string {
  if (n === 0) return "—";
  if (n < 1)   return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function pnlColor(n: number): string {
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function rankStyle(rank: number): string {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-neutral-300";
  if (rank === 3) return "text-orange-400";
  return "text-neutral-600";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PnlBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const positive = value >= 0;
  return (
    <div className="flex flex-col items-end gap-1 w-full">
      <span className={`text-[13px] font-mono font-semibold tabular-nums ${pnlColor(value)}`}>
        {fmtCompact(value)}
      </span>
      <div className="h-0.5 w-full bg-neutral-900 overflow-hidden">
        <div
          className={`h-full ${positive ? "bg-emerald-500/70" : "bg-red-500/70"} ${positive ? "" : "ml-auto"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StreakDots({ entry }: { entry: EnrichedEntry }) {
  const frames: Array<{ label: string; val: number }> = [
    { label: "1D",  val: entry.pnl1d  },
    { label: "7D",  val: entry.pnl7d  },
    { label: "30D", val: entry.pnl30d },
    { label: "∞",   val: entry.pnlAll },
  ];
  return (
    <div
      className="flex items-center gap-1"
      title={`Consistency: ${entry.consistency}/4 timeframes green`}
    >
      {frames.map((f, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            f.val > 0 ? "bg-emerald-400" : f.val < 0 ? "bg-red-500/70" : "bg-neutral-700"
          }`}
        />
      ))}
    </div>
  );
}

function LeverageGauge({ leverage }: { leverage: number }) {
  const pct = Math.min(100, (leverage / 10) * 100);
  const color =
    leverage >= 5 ? "bg-red-500/80"
    : leverage >= 2 ? "bg-orange-500/80"
    : leverage > 0 ? "bg-emerald-500/70"
    : "bg-neutral-700";

  return (
    <div className="flex items-center gap-2" title={`Leverage proxy: ${leverage.toFixed(2)}x (OI/Equity)`}>
      <div className="w-10 h-1 bg-neutral-900 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
        {leverage > 0 ? `${leverage.toFixed(1)}x` : "—"}
      </span>
    </div>
  );
}

function BiasStrip({ entry }: { entry: EnrichedEntry }) {
  if (entry.positions.length === 0) {
    return <span className="text-[10px] text-neutral-600 font-mono">flat</span>;
  }
  const longs  = entry.positions.filter((p) => p.side === "bid").length;
  const shorts = entry.positions.filter((p) => p.side === "ask").length;
  const total  = longs + shorts;
  const longPct = total > 0 ? (longs / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1 w-12 overflow-hidden bg-neutral-900">
        <div className="bg-emerald-500/80" style={{ width: `${longPct}%` }} />
        <div className="bg-red-500/80 flex-1" />
      </div>
      <span className="text-[10px] font-mono text-neutral-400">
        {longs}L·{shorts}S
      </span>
    </div>
  );
}

function PatternBadge({ match }: { match: PatternMatch }) {
  const label    = shortPatternName(match.pattern.name);
  const winRate  = Math.round(match.pattern.win_rate * 100);
  const aligned  = match.aligned;
  const dirLabel = match.direction !== "neutral"
    ? (match.direction === "long" ? "▲" : "▼")
    : "◆";

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 border font-mono whitespace-nowrap ${
        aligned
          ? "border-orange-500/50 bg-orange-500/8 text-orange-400"
          : "border-neutral-700 bg-neutral-900 text-neutral-500"
      }`}
      title={`${match.pattern.name} — ${winRate}% win rate on ${match.asset}`}
    >
      <span className={aligned ? "text-orange-500" : "text-neutral-600"}>{dirLabel}</span>
      {label} {winRate}%
    </span>
  );
}

function PositionPills({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return null;
  const MAX = 5;
  const shown    = positions.slice(0, MAX);
  const overflow = positions.length - MAX;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-neutral-800/70">
      {shown.map((p, i) => {
        const isLong = p.side === "bid";
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 border ${
              isLong
                ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
                : "border-red-500/25 bg-red-500/5 text-red-400"
            }`}
          >
            <span className="font-bold">{isLong ? "↑" : "↓"}</span>
            <span className="text-white font-medium">{p.symbol}</span>
            {p.notional > 0 && (
              <span className="text-neutral-500">{fmtUsd(p.notional)}</span>
            )}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-[11px] font-mono text-neutral-600 px-2 py-1 border border-neutral-800">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function ExpandedDetail({ entry, onCopyCli, patternMatches }: {
  entry: EnrichedEntry;
  onCopyCli: (cmd: string) => void;
  patternMatches: PatternMatch[];
}) {
  const cliCmd = `pacifica copy ${entry.address}`;

  return (
    <div className="bg-[#0A0A0A] border-t border-neutral-800/70 px-4 py-4">
      {/* Intelligence row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 pb-4 border-b border-neutral-800/50">
        <IntelStat label="Consistency"  value={`${entry.consistency}/4`}                    accent={entry.consistency >= 3 ? "emerald" : "neutral"} />
        <IntelStat label="Momentum"     value={formatMomentum(entry.momentum)}              accent={entry.momentum > 0.25 ? "orange" : "neutral"} />
        <IntelStat label="Leverage"     value={entry.leverage > 0 ? `${entry.leverage.toFixed(2)}x` : "—"} accent={entry.leverage >= 5 ? "red" : entry.leverage >= 2 ? "orange" : "neutral"} />
        <IntelStat label="Concentration" value={entry.concentration > 0 ? `${entry.concentration} assets` : "—"} accent="neutral" />
        <IntelStat label="Capital Eff." value={`${entry.capitalEfficiency.toFixed(2)}x`}    accent={entry.capitalEfficiency > 1 ? "emerald" : "neutral"} />
      </div>

      {/* Pattern matches */}
      {patternMatches.length > 0 && (
        <div className="mb-4 pb-4 border-b border-neutral-800/50">
          <p className="text-[10px] font-mono text-orange-400 uppercase tracking-widest mb-2">
            / Pattern Match ({patternMatches.length})
          </p>
          <div className="flex flex-col gap-2">
            {patternMatches.map((m, i) => {
              const winRate = Math.round(m.pattern.win_rate * 100);
              const dirText = m.direction === "long" ? "LONG bias" : m.direction === "short" ? "SHORT bias" : "neutral";
              return (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-3 px-3 py-2 border text-[11px] font-mono ${
                    m.aligned
                      ? "border-orange-500/30 bg-orange-500/5"
                      : "border-neutral-800 bg-neutral-900/40"
                  }`}
                >
                  <div className="min-w-0">
                    <span className={m.aligned ? "text-orange-400 font-semibold" : "text-neutral-400"}>
                      {m.aligned ? "✓ " : "~ "}{m.pattern.name}
                    </span>
                    <span className="text-neutral-600 ml-2">
                      {m.asset} · {dirText}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-[10px]">
                    <span className={m.aligned ? "text-orange-400" : "text-neutral-500"}>
                      {winRate}% win rate
                    </span>
                    <span className="text-neutral-600">
                      {m.pattern.sample_size} trades
                    </span>
                    {m.aligned && (
                      <span className="text-emerald-400">+{m.pattern.avg_pnl_pct.toFixed(1)}% avg</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {patternMatches.some((m) => !m.aligned) && (
            <p className="text-[9px] font-mono text-neutral-600 mt-1.5">
              ~ partial match — asset overlaps but position direction may not align with pattern bias
            </p>
          )}
        </div>
      )}

      {/* Positions table */}
      {entry.positions.length > 0 ? (
        <div>
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
            / Open Positions ({entry.positions.length})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-[10px] text-neutral-600 uppercase tracking-widest border-b border-neutral-800/70">
                  <th className="text-left py-1.5 pr-3">Asset</th>
                  <th className="text-left py-1.5 pr-3">Side</th>
                  <th className="text-right py-1.5 pr-3">Size</th>
                  <th className="text-right py-1.5 pr-3">Entry</th>
                  <th className="text-right py-1.5 pr-3">Liq.</th>
                  <th className="text-right py-1.5 pr-3">Notional</th>
                  <th className="text-right py-1.5">Funding</th>
                </tr>
              </thead>
              <tbody>
                {entry.positions.map((p, i) => {
                  const isLong = p.side === "bid";
                  return (
                    <tr key={i} className="border-b border-neutral-900/60 last:border-b-0">
                      <td className="py-1.5 pr-3 text-white font-semibold">{p.symbol}</td>
                      <td className="py-1.5 pr-3">
                        <span className={isLong ? "text-emerald-400" : "text-red-400"}>
                          {isLong ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-neutral-300">{fmtAmount(p.amount)}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-300">{fmtPrice(p.entryPrice)}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-500">{fmtPrice(p.liquidationPrice)}</td>
                      <td className="py-1.5 pr-3 text-right text-neutral-300">{fmtUsd(p.notional)}</td>
                      <td className={`py-1.5 text-right ${p.funding >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        {p.funding !== 0 ? `${p.funding >= 0 ? "+" : "-"}$${Math.abs(p.funding).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-500 font-mono">No open positions right now.</p>
      )}

      {/* CLI action strip */}
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => onCopyCli(cliCmd)}
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-neutral-700 bg-[#111111] hover:border-orange-500/40 transition-colors text-[12px] font-mono text-neutral-300"
          title="Copy CLI command to clipboard"
        >
          <span className="text-orange-400">$</span> {cliCmd}
          <span className="text-[10px] text-neutral-500 ml-1">COPY</span>
        </button>

        <div className="flex items-center gap-2">
          <Link
            href={`/trader/${entry.address}`}
            className="text-[12px] font-mono text-neutral-300 hover:text-orange-400 underline-offset-2 hover:underline"
          >
            Full profile →
          </Link>
          <Link
            href={`/copy?trader=${entry.address}`}
            className="text-black bg-orange-500 px-3 py-1 text-[12px] font-semibold hover:bg-orange-400 transition-colors"
          >
            Mirror on web →
          </Link>
        </div>
      </div>
    </div>
  );
}

function IntelStat({
  label, value, accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "orange" | "red" | "neutral";
}) {
  const cls =
    accent === "emerald" ? "text-emerald-400"
    : accent === "orange" ? "text-orange-400"
    : accent === "red"    ? "text-red-400"
    : "text-neutral-300";
  return (
    <div>
      <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">{label}</p>
      <p className={`text-sm font-mono font-semibold mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function formatMomentum(m: number): string {
  if (!isFinite(m) || m === 0) return "—";
  const pct = (m * 100).toFixed(0);
  return `${m >= 0 ? "+" : ""}${pct}%`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LeaderboardClient({
  entries,
  activePatterns = [],
}: {
  entries: EnrichedEntry[];
  activePatterns?: Pattern[];
}) {
  const [sortKey, setSortKey]   = useState<SortKey>("rank");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const [filter,  setFilter]    = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Watchlist persistence
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) setWatchlist(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  const toggleWatch = useCallback((address: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else                   next.add(address);
      try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const copyCli = useCallback((cmd: string) => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 1800);
    }).catch(() => { /* ignore */ });
  }, []);

  // ── Pattern matches per trader ──────────────────────────────────────
  const matchesByAddress = useMemo(() => {
    const map = new Map<string, PatternMatch[]>();
    for (const e of entries) {
      const matches = patternMatchForPositions(e.positions, activePatterns);
      if (matches.length > 0) map.set(e.address, matches);
    }
    return map;
  }, [entries, activePatterns]);

  // ── Sorting + filtering ──────────────────────────────────────────────
  const view = useMemo(() => {
    let out = [...entries];

    switch (filter) {
      case "rising":
        out = out.filter((e) => e.momentum > 0.25 && e.pnl1d > 0);
        break;
      case "falling":
        out = out.filter((e) => e.pnl1d < 0);
        break;
      case "consistent":
        out = out.filter((e) => e.consistency >= 3);
        break;
      case "leveraged":
        out = out.filter((e) => e.leverage >= 2);
        break;
      case "watchlisted":
        out = out.filter((e) => watchlist.has(e.address));
        break;
      case "pattern_match":
        out = out.filter((e) => matchesByAddress.has(e.address));
        break;
    }

    out.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      return ((av as number) - (bv as number)) * dir;
    });

    return out;
  }, [entries, filter, sortKey, sortDir, watchlist]);

  // Max PnL per column for relative bar scaling
  const maxes = useMemo(() => ({
    pnl1d:  Math.max(1, ...entries.map((e) => Math.abs(e.pnl1d))),
    pnl7d:  Math.max(1, ...entries.map((e) => Math.abs(e.pnl7d))),
    pnl30d: Math.max(1, ...entries.map((e) => Math.abs(e.pnl30d))),
    pnlAll: Math.max(1, ...entries.map((e) => Math.abs(e.pnlAll))),
  }), [entries]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "rank" ? "asc" : "desc"); }
  };

  return (
    <div>
      {/* ── Filter pills + copied toast ────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ["all",           "All",           entries.length],
            ["pattern_match", "Pattern Match", matchesByAddress.size],
            ["rising",        "Rising",        entries.filter((e) => e.momentum > 0.25 && e.pnl1d > 0).length],
            ["falling",       "Falling",       entries.filter((e) => e.pnl1d < 0).length],
            ["consistent",    "Consistent",    entries.filter((e) => e.consistency >= 3).length],
            ["leveraged",     "High Leverage", entries.filter((e) => e.leverage >= 2).length],
            ["watchlisted",   "Watchlist",     watchlist.size],
          ] as Array<[Filter, string, number]>).map(([key, label, count]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`text-[11px] font-mono px-2.5 py-1 border transition-colors ${
                  active
                    ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                    : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                }`}
              >
                {label}
                <span className="ml-1.5 text-neutral-600">{count}</span>
              </button>
            );
          })}
        </div>

        {copiedCmd && (
          <div className="text-[11px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1">
            Copied: {copiedCmd}
          </div>
        )}
      </div>

      {/* ── Column headers ─────────────────────────────────────────── */}
      <div
        className="hidden lg:grid items-center px-4 py-2 gap-x-3 text-[10px] font-mono text-neutral-600 uppercase tracking-widest border-b border-neutral-800
          grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_6rem_5.5rem_5.5rem_5.5rem_6.5rem_5rem_5.5rem_2rem]"
      >
        <span />
        <SortHead label="#"         keyFor="rank"        sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="left" />
        <span>Trader</span>
        <span className="text-right">Book</span>
        <SortHead label="1D"        keyFor="pnl1d"       sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <SortHead label="7D"        keyFor="pnl7d"       sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <SortHead label="30D"       keyFor="pnl30d"      sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <SortHead label="All-Time"  keyFor="pnlAll"      sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <SortHead label="Lev"       keyFor="leverage"    sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <SortHead label="Streak"    keyFor="consistency" sortKey={sortKey} sortDir={sortDir} onSort={setSort} align="right" />
        <span />
      </div>

      {/* ── Rows ───────────────────────────────────────────────────── */}
      <div className="space-y-1">
        {view.length === 0 ? (
          <div className="border border-neutral-800 bg-[#111111] p-6 text-center">
            <p className="text-neutral-500 font-mono text-sm">
              No traders match this filter.
            </p>
          </div>
        ) : (
          view.map((e) => {
            const isOpen     = expanded === e.address;
            const isTop3     = e.rank <= 3;
            const starred    = watchlist.has(e.address);
            const patMatches = matchesByAddress.get(e.address) ?? [];
            const alignedMatches = patMatches.filter((m) => m.aligned);

            return (
              <div
                key={e.address}
                className={`relative bg-[#111111] border transition-colors ${
                  isOpen
                    ? "border-orange-500/40"
                    : isTop3
                      ? "border-neutral-700/60 hover:border-orange-500/30"
                      : "border-neutral-800 hover:border-neutral-700"
                }`}
              >
                {isTop3 && (
                  <>
                    <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500/50" />
                    <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500/50" />
                    <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500/50" />
                    <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500/50" />
                  </>
                )}

                {/* ── Main grid ───────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : e.address)}
                  className="w-full text-left px-4 py-3 focus:outline-none focus:bg-neutral-900/40"
                  aria-expanded={isOpen}
                >
                  <div
                    className="grid items-center gap-x-3
                      grid-cols-[1.5rem_2.5rem_minmax(0,1fr)]
                      lg:grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_6rem_5.5rem_5.5rem_5.5rem_6.5rem_5rem_5.5rem_2rem]"
                  >
                    {/* Star */}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => { ev.stopPropagation(); toggleWatch(e.address); }}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault(); ev.stopPropagation(); toggleWatch(e.address);
                        }
                      }}
                      className={`cursor-pointer text-base leading-none select-none ${
                        starred ? "text-orange-400" : "text-neutral-700 hover:text-neutral-400"
                      }`}
                      aria-label={starred ? "Remove from watchlist" : "Add to watchlist"}
                      title={starred ? "Watchlisted" : "Add to watchlist"}
                    >
                      {starred ? "★" : "☆"}
                    </span>

                    {/* Rank */}
                    <span className={`text-base font-bold font-mono ${rankStyle(e.rank)}`}>
                      {e.rank}
                    </span>

                    {/* Identity + bias */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/trader/${e.address}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-white text-sm font-semibold font-mono hover:text-orange-400 transition-colors"
                        >
                          {e.username ?? shortAddr(e.address)}
                        </Link>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${
                          e.repScore >= 80
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/25"
                            : "bg-neutral-800 text-neutral-400 border-neutral-700"
                        }`}>
                          REP {e.repScore}
                        </span>
                        <span className="lg:hidden text-xs font-mono font-semibold ml-auto">
                          <span className={pnlColor(e.pnlAll)}>{fmtCompact(e.pnlAll)}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-neutral-600 font-mono mt-0.5">
                        <span className="truncate">Eq {fmtUsd(e.equity)}</span>
                        {e.oi > 0 && <span>OI {fmtUsd(e.oi)}</span>}
                        <span className="lg:hidden">
                          <StreakDots entry={e} />
                        </span>
                      </div>
                      {/* Pattern match badges */}
                      {patMatches.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1">
                          {(alignedMatches.length > 0 ? alignedMatches : patMatches).slice(0, 3).map((m, i) => (
                            <PatternBadge key={i} match={m} />
                          ))}
                          {patMatches.length > 3 && (
                            <span className="text-[9px] font-mono text-neutral-600">
                              +{patMatches.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Book bias (desktop) */}
                    <div className="hidden lg:flex justify-end">
                      <BiasStrip entry={e} />
                    </div>

                    {/* PnL bar cells */}
                    <div className="hidden lg:block"><PnlBar value={e.pnl1d}  max={maxes.pnl1d}  /></div>
                    <div className="hidden lg:block"><PnlBar value={e.pnl7d}  max={maxes.pnl7d}  /></div>
                    <div className="hidden lg:block"><PnlBar value={e.pnl30d} max={maxes.pnl30d} /></div>
                    <div className="hidden lg:block"><PnlBar value={e.pnlAll} max={maxes.pnlAll} /></div>

                    {/* Leverage */}
                    <div className="hidden lg:flex justify-end">
                      <LeverageGauge leverage={e.leverage} />
                    </div>

                    {/* Streak dots */}
                    <div className="hidden lg:flex justify-end">
                      <StreakDots entry={e} />
                    </div>

                    {/* Chevron */}
                    <span className={`hidden lg:inline-block text-neutral-600 text-xs transition-transform ${isOpen ? "rotate-180 text-orange-400" : ""}`}>
                      ▾
                    </span>
                  </div>

                  {/* Position pills always visible for top 8 */}
                  {e.positions.length > 0 && (
                    <PositionPills positions={e.positions} />
                  )}
                </button>

                {/* ── Expansion ───────────────────────────────────── */}
                {isOpen && (
                  <ExpandedDetail
                    entry={e}
                    onCopyCli={copyCli}
                    patternMatches={patMatches}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortHead({
  label, keyFor, sortKey, sortDir, onSort, align,
}: {
  label:   string;
  keyFor:  SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort:  (k: SortKey) => void;
  align:   "left" | "right";
}) {
  const active = sortKey === keyFor;
  return (
    <button
      type="button"
      onClick={() => onSort(keyFor)}
      className={`flex items-center gap-1 hover:text-neutral-300 transition-colors ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-orange-400" : ""}`}
    >
      {label}
      {active && <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
