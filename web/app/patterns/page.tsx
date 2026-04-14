import { OrangeLabel } from "../../components/ui/OrangeLabel";
import { PatternCard } from "../../components/ui/PatternCard";
import type { Pattern } from "../../lib/types";
import { DEMO_PATTERNS } from "../../lib/demo-data";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getPatterns(): Promise<Pattern[]> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/patterns", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("API unavailable");
    return res.json();
  } catch {
    return DEMO_PATTERNS;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PatternsPage() {
  const patterns = await getPatterns();

  return (
    <div className="min-h-screen bg-bg-primary max-w-6xl mx-auto px-6 py-12">
      <OrangeLabel text="/ PATTERN LIBRARY" />
      <h1 className="text-4xl font-bold text-white mt-3 mb-2">Verified Market Patterns</h1>
      <p className="text-muted mb-10">
        Patterns verified by statistical analysis across all intelligence records.
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-8 mb-10 p-4 bg-bg-surface border border-border rounded-xl">
        <div>
          <p className="text-2xl font-bold text-white">{patterns.length}</p>
          <p className="text-muted text-xs mt-0.5">Total Patterns</p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div>
          <p className="text-2xl font-bold text-white">
            {patterns.filter((p) => p.verified).length}
          </p>
          <p className="text-muted text-xs mt-0.5">Verified</p>
        </div>
        <div className="w-px h-8 bg-border" />
        <div>
          <p className="text-2xl font-bold text-accent">
            {patterns.length > 0
              ? (
                  (patterns.reduce((sum, p) => sum + p.win_rate, 0) / patterns.length) *
                  100
                ).toFixed(1) + "%"
              : "—"}
          </p>
          <p className="text-muted text-xs mt-0.5">Avg Win Rate</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {patterns.map((p) => (
          <PatternCard key={p.id} pattern={p} />
        ))}
      </div>
    </div>
  );
}
