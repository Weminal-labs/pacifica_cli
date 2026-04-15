
export const runtime = "edge";

import { OrangeLabel } from "../../components/ui/OrangeLabel";
import { PatternCard } from "../../components/ui/PatternCard";
import { LiveSignalBanner } from "../../components/patterns/LiveSignalBanner";
import type { Pattern } from "../../lib/types";
import { SEED_PATTERNS } from "../../lib/seed-patterns";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getPatterns(): Promise<{ patterns: Pattern[]; isSeeded: boolean }> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/patterns", {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error("API unavailable");
    const data = (await res.json()) as Pattern[];
    if (data.length > 0) return { patterns: data, isSeeded: false };
    return { patterns: SEED_PATTERNS, isSeeded: true };
  } catch {
    return { patterns: SEED_PATTERNS, isSeeded: true };
  }
}

async function getFeedActivePatterns(): Promise<Pattern[]> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/feed", {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error("feed unavailable");
    const data = (await res.json()) as { active_patterns?: Pattern[] };
    return data.active_patterns ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PatternsPage() {
  const [{ patterns, isSeeded }, activeSignals] = await Promise.all([
    getPatterns(),
    getFeedActivePatterns(),
  ]);

  const activeIds = new Set(activeSignals.map((p) => p.id));
  const avgWinRate = patterns.length > 0
    ? ((patterns.reduce((s, p) => s + p.win_rate, 0) / patterns.length) * 100).toFixed(1) + "%"
    : "—";

  return (
    <div className="min-h-screen bg-[#0A0A0A] max-w-6xl mx-auto px-6 py-12">
      <OrangeLabel text="/ PATTERN LIBRARY" />
      <h1 className="text-4xl font-bold text-white mt-3 mb-2">Verified Market Patterns</h1>
      <p className="text-neutral-500 mb-8">
        Patterns verified by statistical analysis across all intelligence records.
      </p>

      {/* Live Signal Banner */}
      <LiveSignalBanner initialSignals={activeSignals} />

      {/* Seeded notice — only shown when using example data */}
      {isSeeded && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-[#0F0F0F] border border-neutral-500/20 text-[11px] font-mono text-neutral-500">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
          Showing example patterns · Run{" "}
          <code className="text-orange-500 mx-1">pacifica intelligence serve</code>
          {" "}to see patterns detected from your own trades
        </div>
      )}

      {/* Stats row */}
      <div className="relative flex items-center gap-8 mb-10 p-4 bg-[#111111] border border-neutral-500/20">
        <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
        <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
        <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

        <div>
          <p className="text-2xl font-bold text-white">{patterns.length}</p>
          <p className="text-neutral-500 text-xs mt-0.5 font-mono">Total Patterns</p>
        </div>
        <div className="w-px h-8 bg-neutral-500/20" />
        <div>
          <p className="text-2xl font-bold text-white">
            {patterns.filter((p) => p.verified).length}
          </p>
          <p className="text-neutral-500 text-xs mt-0.5 font-mono">Verified</p>
        </div>
        <div className="w-px h-8 bg-neutral-500/20" />
        <div>
          <p className="text-2xl font-bold text-orange-500">{avgWinRate}</p>
          <p className="text-neutral-500 text-xs mt-0.5 font-mono">Avg Win Rate</p>
        </div>
        <div className="w-px h-8 bg-neutral-500/20" />
        <div>
          <p className="text-2xl font-bold text-orange-500">{activeIds.size}</p>
          <p className="text-neutral-500 text-xs mt-0.5 font-mono">Live Right Now</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patterns.map((p) => (
          <PatternCard key={p.id} pattern={p} isLive={activeIds.has(p.id)} />
        ))}
      </div>
    </div>
  );
}
