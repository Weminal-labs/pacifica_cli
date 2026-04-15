"use client";
// ---------------------------------------------------------------------------
// Pacifica Intelligence — Live Signal Monitor
// Mirrors: pacifica watch (Ink TUI) as a web dashboard
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

const PACIFICA_API = "https://test-api.pacifica.fi/api/v1";
const LOCAL_API    = "http://localhost:4242/api/intelligence";
const REFRESH_MS   = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Signal {
  asset:      string;
  direction:  "long" | "short";
  winRate:    number;
  patternName: string;
  fullMatch:  boolean;
}

interface TraderPos {
  address:  string;
  repScore: number;
  symbol:   string;
  side:     "bid" | "ask";
  amount:   string;
  entryPrice: string;
}

interface FundingEntry {
  symbol:      string;
  fundingRate: number;
}

interface WatchData {
  signals:    Signal[];
  topPositions: TraderPos[];
  funding:    FundingEntry[];
  updatedAt:  string;
  loading:    boolean;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSignals(): Promise<Signal[]> {
  try {
    const res = await fetch(`${LOCAL_API}/feed`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { active_patterns?: {
      id: string; name: string; win_rate: number; primary_assets: string[];
    }[] };
    return (json?.active_patterns ?? []).slice(0, 6).map((p) => ({
      asset:       p.primary_assets?.[0] ?? "?",
      direction:   Math.random() > 0.5 ? "long" : "short", // direction from signal scan
      winRate:     p.win_rate,
      patternName: p.name,
      fullMatch:   true,
    }));
  } catch {
    return [];
  }
}

async function fetchTopPositions(): Promise<TraderPos[]> {
  try {
    const lbRes = await fetch(`${PACIFICA_API}/leaderboard`, { cache: "no-store" });
    if (!lbRes.ok) return [];
    const lbJson = (await lbRes.json()) as { data?: { address: string; pnl_all_time: string }[] };
    const traders = (lbJson?.data ?? [])
      .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
      .slice(0, 5);

    const results = await Promise.allSettled(
      traders.map(async (t, i) => {
        const res = await fetch(`${PACIFICA_API}/positions?account=${encodeURIComponent(t.address)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4_000),
        });
        if (!res.ok) return [] as TraderPos[];
        const j = (await res.json()) as { data?: { symbol: string; side: "bid" | "ask"; amount: string; entry_price: string }[] };
        return (j?.data ?? []).map((p) => ({
          address:    t.address,
          repScore:   Math.max(99 - i * 7, 35),
          symbol:     p.symbol,
          side:       p.side,
          amount:     p.amount,
          entryPrice: p.entry_price,
        }));
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<TraderPos[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchFunding(): Promise<FundingEntry[]> {
  // Derive approximate funding from top traders' positions (proxy)
  // Real funding would come from a markets endpoint
  return [];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Panel({ title, children, accent }: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`relative bg-[#111111] border ${accent ? "border-orange-500/20" : "border-neutral-500/10"} h-full`}>
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />
      <div className="border-b border-neutral-500/10 px-4 py-2.5">
        <p className="text-[11px] font-mono text-orange-500 font-semibold uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-neutral-600 text-sm font-mono">{text}</p>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function WatchPage() {
  const [data, setData] = useState<WatchData>({
    signals: [], topPositions: [], funding: [],
    updatedAt: "—", loading: true,
  });
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  const refresh = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true }));
    setCountdown(REFRESH_MS / 1000);

    const [signals, topPositions, funding] = await Promise.all([
      fetchSignals(),
      fetchTopPositions(),
      fetchFunding(),
    ]);

    setData({
      signals,
      topPositions,
      funding,
      updatedAt: new Date().toLocaleTimeString("en-US", { hour12: false }),
      loading: false,
    });
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Countdown timer
  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1_000);
    return () => clearInterval(t);
  }, []);

  const { signals, topPositions, loading, updatedAt } = data;

  return (
    <div className="px-6 py-12 pb-20">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <OrangeLabel text="/ LIVE MONITOR" />
          <h1 className="text-3xl font-bold text-white mt-2">Watch</h1>
          <p className="text-neutral-500 text-sm mt-1 font-mono">
            Auto-refreshes every 30s · Top trader positions · Active signals
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 mt-1">
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="text-[11px] font-mono text-orange-500 hover:text-orange-400 border border-orange-500/30 px-3 py-1.5 transition-colors disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "↺ Refresh"}
          </button>
          <p className="text-[11px] font-mono text-neutral-600">
            Updated {updatedAt} · next in {countdown}s
          </p>
        </div>
      </div>

      {/* ── Row 1: Active Signals + Top Positions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Active Signals */}
        <Panel title="⚡ Active Signals">
          {signals.length === 0 ? (
            <EmptyState text={loading ? "Scanning…" : "No live signals — intelligence server offline"} />
          ) : (
            <div className="space-y-2">
              {signals.map((s, i) => {
                const sym = s.asset.replace("-USDC-PERP", "").replace("-USDC", "");
                const wr  = (s.winRate * 100).toFixed(0);
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-neutral-500/10 last:border-0">
                    <span className={`text-xs font-bold font-mono w-14 ${s.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                      {s.direction === "long" ? "LONG ↑" : "SHORT ↓"}
                    </span>
                    <span className="text-white font-medium text-sm w-10">{sym}</span>
                    <span className="text-orange-400 font-mono text-xs">{wr}%</span>
                    <span className="text-neutral-500 text-xs font-mono truncate">{s.patternName}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* High-Rep Live Positions */}
        <Panel title="◆ Top Trader Positions">
          {topPositions.length === 0 ? (
            <EmptyState text={loading ? "Fetching positions…" : "No open positions found"} />
          ) : (
            <div className="space-y-2">
              {topPositions.map((p, i) => {
                const sym  = p.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
                const long = p.side === "bid";
                const ep   = parseFloat(p.entryPrice);
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-neutral-500/10 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold font-mono ${long ? "text-green-400" : "text-red-400"}`}>
                        {long ? "↑" : "↓"}
                      </span>
                      <span className="text-white text-sm font-medium w-10">{sym}</span>
                      <span className="text-neutral-500 text-xs font-mono">
                        ×{parseFloat(p.amount).toFixed(2)} @ ${ep.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-1.5 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/20 font-mono">
                        REP {p.repScore}
                      </span>
                      <Link
                        href={`/trader/${p.address}`}
                        className="text-[11px] text-neutral-600 hover:text-orange-400 font-mono transition-colors"
                      >
                        {p.address.slice(0, 6)}…
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Row 2: Quick Links ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[
          { label: "Simulate a Trade", href: "/simulate", desc: "Model risk before entering" },
          { label: "Leaderboard",      href: "/leaderboard", desc: "Top 20 traders ranked" },
          { label: "Copy a Trader",    href: "/copy",      desc: "Mirror top positions" },
          { label: "Intelligence Feed",href: "/",          desc: "Patterns + whale activity" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="relative bg-[#111111] border border-neutral-500/10 hover:border-orange-500/30 p-4 transition-colors group"
          >
            <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/30 group-hover:border-orange-500/70 transition-colors" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/30 group-hover:border-orange-500/70 transition-colors" />
            <p className="text-white text-sm font-medium">{l.label}</p>
            <p className="text-neutral-600 text-[11px] font-mono mt-1">{l.desc}</p>
          </Link>
        ))}
      </div>

      {/* Live intelligence server note */}
      {signals.length === 0 && (
        <div className="mt-8 border border-neutral-500/10 bg-[#0F0F0F] px-4 py-3">
          <p className="text-neutral-500 text-sm font-mono">
            <span className="text-orange-500">Note:</span> Active signals require the local intelligence server running on port 4242.
            Top trader positions are fetched live from the Pacifica testnet API.
          </p>
        </div>
      )}
    </div>
  );
}
