// ---------------------------------------------------------------------------
// Pacifica Intelligence — Feed Page
// Layout: reference-style border-column system with dither-reveal hero
// ---------------------------------------------------------------------------

import Link from "next/link";
import { HeroSection } from "./_components/HeroSection";
import { Separator } from "./_components/Separator";
import { SocialSignalsPanel } from "../components/feed/SocialSignalsPanel";
import { OrangeLabel } from "../components/ui/OrangeLabel";
import { PatternCard } from "../components/ui/PatternCard";
import type { Pattern, WhaleActivity, HighRepSignal, SocialData } from "../lib/types";
import { DEMO_PATTERNS, DEMO_WHALES, DEMO_SIGNALS } from "../lib/demo-data";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getFeedData() {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/feed", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("API unavailable");
    return res.json();
  } catch {
    return {
      active_patterns: DEMO_PATTERNS,
      whale_activity:  DEMO_WHALES,
      high_rep_signals: DEMO_SIGNALS,
    };
  }
}

async function getSocialData(): Promise<Record<string, SocialData>> {
  try {
    const tickers = ["ETH", "BTC", "SOL"];
    const results = await Promise.all(
      tickers.map(async (t) => {
        const res = await fetch(`http://localhost:4242/api/intelligence/social/${t}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const data = await res.json() as SocialData;
        return [t, data] as const;
      }),
    );
    return Object.fromEntries(results.filter((r): r is [string, SocialData] => r !== null));
  } catch {
    return {};
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
  const [data, socialData] = await Promise.all([getFeedData(), getSocialData()]);
  const patterns: Pattern[]       = data.active_patterns  ?? DEMO_PATTERNS;
  const whales:   WhaleActivity[] = data.whale_activity   ?? DEMO_WHALES;
  const signals:  HighRepSignal[] = data.high_rep_signals ?? DEMO_SIGNALS;

  return (
    <div className="relative bg-[#0A0A0A] pb-10">

      {/* ── Hero (dither-reveal) ── */}
      <HeroSection />

      {/* ── Diagonal separator ── */}
      <Separator />

      {/* ── Pattern stats bar ── */}
      <div className="border-b border-neutral-500/20">
        <div className="flex items-center justify-center gap-12 text-sm py-5 px-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{patterns.length}</p>
            <p className="text-neutral-500 text-xs mt-0.5 font-mono">Verified Patterns</p>
          </div>
          <div className="w-px h-8 bg-neutral-500/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">80+</p>
            <p className="text-neutral-500 text-xs mt-0.5 font-mono">Intelligence Records</p>
          </div>
          <div className="w-px h-8 bg-neutral-500/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">72.3%</p>
            <p className="text-neutral-500 text-xs mt-0.5 font-mono">Top Pattern Win Rate</p>
          </div>
          <div className="w-px h-8 bg-neutral-500/20" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">5</p>
            <p className="text-neutral-500 text-xs mt-0.5 font-mono">Tracked Traders</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
        </div>
      </section>

      {/* ── Separator ── */}
      <Separator />

      {/* ── Social Intelligence ── */}
      <div className="border-b border-neutral-500/20 py-2">
        <SocialSignalsPanel
          socialData={Object.keys(socialData).length > 0 ? socialData : undefined}
        />
      </div>

      {/* ── Separator ── */}
      <Separator />

      {/* ── Whale Activity + High Rep Signals ── */}
      <section className="px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-8 border-b border-neutral-500/20">

        {/* Whale Activity */}
        <div>
          <OrangeLabel text="/ WHALE ACTIVITY" />
          <h2 className="text-2xl font-bold text-white mt-2 mb-6">Large position changes</h2>
          <div className="space-y-2">
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
