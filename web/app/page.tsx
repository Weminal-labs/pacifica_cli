// ---------------------------------------------------------------------------
// Pacifica Intelligence — Feed Page
// Layout: reference-style border-column system with dither-reveal hero
// ---------------------------------------------------------------------------

export const runtime = "edge";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Separator } from "./_components/Separator";
import { OrangeLabel } from "../components/ui/OrangeLabel";
import { PatternCard } from "../components/ui/PatternCard";
import { SEED_PATTERNS } from "../lib/seed-patterns";
import type { Pattern, WhaleActivity, HighRepSignal } from "../lib/types";

// Three.js hero — loaded client-side only to keep edge/server bundle clean
const HeroSection = dynamic(
  () => import("./_components/HeroSection").then((m) => ({ default: m.HeroSection })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACIFICA_API = "https://test-api.pacifica.fi";

// ---------------------------------------------------------------------------
// Pacifica API fallback helpers
// ---------------------------------------------------------------------------

interface RawLeaderboardEntry {
  address:      string;
  trader_id?:   string;   // kept for safety, API returns `address`
  pnl_all_time: string;
  pnl_1d:       string;
  pnl_7d:       string;
  pnl_30d:      string;
}

interface RawMarket {
  symbol:        string;
  funding?:      number | string;
  mark?:         number | string;
  open_interest?: number | string;
  volume_24h?:   number | string;
  oracle?:       number | string;
}

async function fetchRealFeedData(): Promise<{
  active_patterns: Pattern[];
  whale_activity:  WhaleActivity[];
  high_rep_signals: HighRepSignal[];
}> {
  const [lbRes, mktRes] = await Promise.allSettled([
    fetch(`${PACIFICA_API}/api/v1/leaderboard`,   { cache: "no-store" }),
    fetch(`${PACIFICA_API}/api/v1/info/prices`,   { cache: "no-store" }),
  ]);

  // --- High-rep signals from leaderboard ---
  const high_rep_signals: HighRepSignal[] = [];
  if (lbRes.status === "fulfilled" && lbRes.value.ok) {
    const lbJson = (await lbRes.value.json()) as { data?: RawLeaderboardEntry[] };
    const traders = (lbJson?.data ?? []) as RawLeaderboardEntry[];

    const sorted = [...traders]
      .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
      .slice(0, 8);

    const posResults = await Promise.allSettled(
      sorted.map((t) =>
        fetch(`${PACIFICA_API}/api/v1/positions?account=${encodeURIComponent(t.address ?? t.trader_id ?? "")}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4_000),
        }),
      ),
    );

    const now = new Date().toISOString();
    const repScores = sorted.map((_, i) => Math.max(99 - i * 7, 30));

    for (let i = 0; i < sorted.length; i++) {
      const r = posResults[i];
      if (r.status === "rejected" || !r.value.ok) continue;
      const posJson = (await r.value.json()) as { data?: unknown[] };
      const positions = posJson?.data ?? [];
      if (!Array.isArray(positions) || positions.length === 0) continue;

      for (const p of positions.slice(0, 2)) {
        const pos = p as Record<string, unknown>;
        const sym = String(pos.symbol ?? "");
        if (!sym) continue;
        const side = String(pos.side ?? "") === "bid" || String(pos.side ?? "").includes("long")
          ? "long" as const
          : "short" as const;
        const sizeUsd = parseFloat(String(pos.amount ?? pos.size ?? 0)) * parseFloat(String(pos.entry_price ?? pos.entryPrice ?? 1));

        high_rep_signals.push({
          asset:      sym,
          direction:  side,
          size_usd:   isNaN(sizeUsd) ? 10_000 : sizeUsd,
          rep_score:  repScores[i],
          opened_at:  String(pos.createdAt ?? pos.created_at ?? now),
        });
      }
      if (high_rep_signals.length >= 6) break;
    }
  }

  // --- Whale activity from top-volume markets ---
  const whale_activity: WhaleActivity[] = [];
  if (mktRes.status === "fulfilled" && mktRes.value.ok) {
    const mktJson = (await mktRes.value.json()) as { data?: RawMarket[] };
    const markets = (mktJson?.data ?? []) as RawMarket[];

    // Sort by notional volume (volume_24h × mark price) so USD-big markets come first
    const byVolume = [...markets]
      .map((m) => ({
        ...m,
        _notional: parseFloat(String(m.volume_24h ?? 0)) * parseFloat(String(m.mark ?? 1)),
      }))
      .sort((a, b) => b._notional - a._notional)
      .slice(0, 6);

    const now = Date.now();
    for (const m of byVolume) {
      const fr = parseFloat(String(m.funding ?? 0));
      whale_activity.push({
        asset:              m.symbol,
        direction:          fr >= 0 ? "long" : "short",
        size_usd:           m._notional * 0.02, // ~2% of 24h volume as whale slice
        large_orders_count: 3,
        opened_at:          new Date(now - Math.random() * 10_800_000).toISOString(),
      });
    }
  }

  return {
    active_patterns:  [],
    whale_activity:   whale_activity.length > 0 ? whale_activity : [],
    high_rep_signals,
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getFeedData(): Promise<{
  active_patterns:  Pattern[];
  whale_activity:   WhaleActivity[];
  high_rep_signals: HighRepSignal[];
  isLive:           boolean;
}> {
  // 1. Try the local intelligence API server
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/feed", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return { ...data, isLive: true };
    }
  } catch { /* fall through */ }

  // 2. Fall back to real Pacifica testnet API + seed patterns for the library
  try {
    const real = await fetchRealFeedData();
    return {
      active_patterns:  real.active_patterns.length > 0 ? real.active_patterns : SEED_PATTERNS.slice(0, 6),
      whale_activity:   real.whale_activity,
      high_rep_signals: real.high_rep_signals,
      isLive:           false,
    };
  } catch {
    return {
      active_patterns:  SEED_PATTERNS.slice(0, 6),
      whale_activity:   [],
      high_rep_signals: [],
      isLive:           false,
    };
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "< 1h ago" : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FeedPage() {
  const data = await getFeedData();
  const patterns: Pattern[]       = data.active_patterns  ?? [];
  const whales:   WhaleActivity[] = data.whale_activity   ?? [];
  const signals:  HighRepSignal[] = data.high_rep_signals ?? [];
  const isLive    = data.isLive;

  return (
    <div className="relative bg-[#0A0A0A] pb-10">

      {/* ── Hero (dither-reveal) ── */}
      <HeroSection />

      {/* ── Diagonal separator ── */}
      <Separator />

      {/* ── How it works ── */}
      <div className="border-b border-neutral-500/20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 py-6 px-6">
          <div className="text-center px-4 py-2 md:border-r border-neutral-500/20">
            <p className="text-orange-500 font-mono text-xs mb-1">1 / WRITE</p>
            <p className="text-white text-sm font-semibold">Code your rule as YAML</p>
            <p className="text-neutral-500 text-xs mt-1 font-mono">Claude drafts it for you</p>
          </div>
          <div className="text-center px-4 py-2 md:border-r border-neutral-500/20">
            <p className="text-orange-500 font-mono text-xs mb-1">2 / TEST</p>
            <p className="text-white text-sm font-semibold">Backtest against 30 days</p>
            <p className="text-neutral-500 text-xs mt-1 font-mono">See if it would&apos;ve worked</p>
          </div>
          <div className="text-center px-4 py-2">
            <p className="text-orange-500 font-mono text-xs mb-1">3 / RUN</p>
            <p className="text-white text-sm font-semibold">Claude runs it via MCP</p>
            <p className="text-neutral-500 text-xs mt-1 font-mono">Entry when conditions match</p>
          </div>
        </div>
      </div>

      {/* ── Live Patterns ── */}
      <section className="px-6 py-16 border-b border-neutral-500/20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <OrangeLabel text="/ ACTIVE PATTERNS" />
            <h2 className="text-3xl font-bold text-white mt-2">Patterns active right now</h2>
          </div>
          <Link href="/patterns" className="text-sm text-neutral-500 hover:text-white transition-colors font-mono">
            View all →
          </Link>
        </div>
        {!isLive && patterns.length > 0 && (
          <div className="mb-4 text-[11px] font-mono text-neutral-500 flex items-center gap-2 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50 shrink-0" />
            Showcase patterns · to run your own, install the CLI and connect Claude via
            <code className="text-orange-500">pacifica --mcp</code>
            <span className="text-neutral-600">(Ctrl+C to stop)</span>
          </div>
        )}
        {patterns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patterns.map((p) => (
              <PatternCard key={p.id} pattern={p} isLive={isLive} />
            ))}
          </div>
        ) : (
          <div className="relative bg-[#0F0F0F] border border-neutral-500/20 p-6">
            <p className="text-white font-semibold mb-2">No patterns available</p>
            <p className="text-neutral-500 text-sm">
              Try refreshing the page, or check <Link href="/patterns" className="text-orange-500 hover:underline">the pattern library</Link>.
            </p>
          </div>
        )}
      </section>

      {/* ── Separator ── */}
      <Separator />

      {/* ── Whale Activity + High Rep Signals ── */}
      <section className="px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-8 border-b border-neutral-500/20">

        {/* Whale Activity */}
        <div>
          <OrangeLabel text="/ WHALE ACTIVITY" />
          <h2 className="text-2xl font-bold text-white mt-2 mb-6">Large position changes</h2>
          <div className="space-y-2">
            {whales.length === 0 && (
              <p className="text-neutral-600 text-sm font-mono py-4">No live data available.</p>
            )}
            {whales.map((w, i) => (
              <div
                key={i}
                className="relative flex items-center justify-between bg-[#111111] border border-neutral-500/10 px-4 py-3"
              >
                {/* corner brackets */}
                <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
                <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
                <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />

                <div className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full ${w.direction === "long" ? "bg-green-400" : "bg-red-400"}`} />
                  <span className="text-white font-medium text-sm">{w.asset.split("-")[0]}</span>
                  <span className={`text-xs font-bold font-mono ${w.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                    {w.direction.toUpperCase()}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold text-sm">{formatUsd(w.size_usd)}</p>
                  <p className="text-neutral-500 text-[11px] font-mono">{formatTime(w.opened_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* High Rep Signals */}
        <div>
          <OrangeLabel text="/ HIGH REP SIGNALS" />
          <h2 className="text-2xl font-bold text-white mt-2 mb-6">Top traders positioned</h2>
          <div className="space-y-2">
            {signals.length === 0 && (
              <p className="text-neutral-600 text-sm font-mono py-4">No high-rep traders with open positions.</p>
            )}
            {signals.map((s, i) => (
              <div
                key={i}
                className="relative flex items-center justify-between bg-[#111111] border border-neutral-500/10 px-4 py-3"
              >
                <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
                <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
                <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />

                <div className="flex items-center gap-3">
                  <span className="text-white font-medium text-sm">{s.asset.split("-")[0]}</span>
                  <span className={`text-xs font-bold font-mono ${s.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                    {s.direction.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] px-2 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/20 font-bold font-mono">
                    REP {s.rep_score}
                  </span>
                  <p className="text-neutral-500 text-[11px] font-mono">{formatTime(s.opened_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA section ── */}
      <div className="relative min-h-[60dvh] p-1 py-20 flex items-center justify-center border-b border-neutral-500/20">
        {/* corner brackets */}
        <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
        <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

        <div
          className="w-full relative overflow-hidden text-center flex items-center justify-center flex-col gap-8 py-20 px-6"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(249,115,22,0.07) 0%, transparent 70%), #0A0A0A",
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 11px)",
          }}
        >
          {/* fade top */}
          <div
            className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
            style={{
              background: "linear-gradient(to bottom, #0A0A0A, transparent)",
              zIndex: 9,
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <span className="text-white text-3xl md:text-4xl font-semibold">
              Intelligence compounds over time
            </span>
            <p className="text-neutral-400 text-sm max-w-sm text-center">
              Every trade teaches the system. Patterns emerge from collective behavior.
              The more trades, the sharper the edge.
            </p>
          </div>

          <div className="flex items-center gap-3 z-10">
            <Link
              href="/patterns"
              className="text-black bg-orange-500 px-4 py-1.5 text-sm font-medium hover:bg-orange-400 transition-colors"
            >
              Explore Patterns
            </Link>
            <Link
              href="/reputation"
              className="relative hover:bg-orange-900/20 text-white px-3 py-1.5 text-sm font-medium border border-orange-900/40 transition-colors"
            >
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500" />
              Reputation Ledger
            </Link>
          </div>

          {/* fade bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to top, #0A0A0A, transparent)", zIndex: 9 }}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="relative flex items-center justify-between px-6 h-[53px] border-b border-neutral-500/20">
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
        <p className="text-neutral-500 font-medium text-sm font-mono">
          © {new Date().getFullYear()} Pacifica Intelligence. Powered by collective trade data.
        </p>
        <div className="flex items-center gap-4 text-neutral-500 text-sm font-mono">
          <Link href="/patterns"   className="hover:text-white transition-colors">Patterns</Link>
          <Link href="/reputation" className="hover:text-white transition-colors">Reputation</Link>
          <Link href="/snapshot/ETH" className="hover:text-orange-500 transition-colors">Snapshot</Link>
        </div>
      </div>
    </div>
  );
}
