// ---------------------------------------------------------------------------
// Pacifica — Landing Page
// Layout: reference-style border-column system with dither-reveal hero
// ---------------------------------------------------------------------------

export const runtime = "edge";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Separator } from "./_components/Separator";
import { OrangeLabel } from "../components/ui/OrangeLabel";
import { PatternCard } from "../components/ui/PatternCard";
import { SEED_PATTERNS } from "../lib/seed-patterns";

// Three.js hero — loaded client-side only to keep edge/server bundle clean
const HeroSection = dynamic(
  () => import("./_components/HeroSection").then((m) => ({ default: m.HeroSection })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeedPage() {
  const patterns = SEED_PATTERNS.slice(0, 6);

  return (
    <div className="relative bg-[#0A0A0A] pb-10">

      {/* -- Hero (dither-reveal) -- */}
      <HeroSection />

      {/* -- Diagonal separator -- */}
      <Separator />

      {/* -- How it works -- */}
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

      {/* -- Showcase Patterns -- */}
      <section className="px-6 py-16 border-b border-neutral-500/20">
        <div className="flex items-center justify-between mb-8">
          <div>
            <OrangeLabel text="/ SHOWCASE PATTERNS" />
            <h2 className="text-3xl font-bold text-white mt-2">Example trading patterns</h2>
          </div>
          <Link href="/patterns" className="text-sm text-neutral-500 hover:text-white transition-colors font-mono">
            View all →
          </Link>
        </div>
        <div className="mb-4 text-[11px] font-mono text-neutral-500 flex items-center gap-2 flex-wrap">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50 shrink-0" />
          Showcase patterns · to run your own, install the CLI and connect Claude via
          <code className="text-orange-500">pacifica --mcp</code>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
        </div>
      </section>

      {/* -- Separator -- */}
      <Separator />

      {/* -- CTA section -- */}
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
              href="/simulate"
              className="relative hover:bg-orange-900/20 text-white px-3 py-1.5 text-sm font-medium border border-orange-900/40 transition-colors"
            >
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500" />
              Simulate a Trade
            </Link>
          </div>

          {/* fade bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to top, #0A0A0A, transparent)", zIndex: 9 }}
          />
        </div>
      </div>

      {/* -- Footer -- */}
      <div className="relative flex items-center justify-between px-6 h-[53px] border-b border-neutral-500/20">
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
        <p className="text-neutral-500 font-medium text-sm font-mono">
          © {new Date().getFullYear()} Pacifica. Code your trading instinct.
        </p>
        <div className="flex items-center gap-4 text-neutral-500 text-sm font-mono">
          <Link href="/patterns"  className="hover:text-white transition-colors">Patterns</Link>
          <Link href="/simulate"  className="hover:text-white transition-colors">Simulate</Link>
        </div>
      </div>
    </div>
  );
}
