
export const runtime = "edge";

import Link from "next/link";
import { OrangeLabel } from "../../../components/ui/OrangeLabel";
import { SEED_PATTERNS } from "../../../lib/seed-patterns";
import type { Pattern } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripSym(asset: string): string {
  return asset.replace(/-USDC-PERP$/, "").replace(/-USDC$/, "").split("-")[0];
}

function deriveSide(pattern: Pattern): "long" | "short" {
  for (const c of pattern.conditions) {
    const axis = (c.axis || "").toLowerCase();
    if (axis.includes("negative_funding") || axis.includes("buy_pressure")) return "long";
    if (axis.includes("positive_funding") || axis.includes("sell_pressure")) return "short";
  }
  return "long";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PatternDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pattern = SEED_PATTERNS.find((p) => p.id === id) ?? null;

  if (!pattern) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] max-w-4xl mx-auto px-6 py-16">
        <OrangeLabel text="/ PATTERN NOT FOUND" />
        <h1 className="text-3xl font-bold text-white mt-3 mb-4">Pattern not found</h1>
        <p className="text-neutral-500 mb-6">
          The pattern you&apos;re looking for doesn&apos;t exist in the showcase library.
        </p>
        <Link
          href="/patterns"
          className="text-sm text-orange-500 hover:text-orange-400 font-mono"
        >
          ← Back to pattern library
        </Link>
      </div>
    );
  }

  const avgHoldHours = pattern.avg_duration_minutes / 60;
  const side = deriveSide(pattern);
  const primarySym = stripSym(pattern.primary_assets[0] ?? "ETH");

  return (
    <div className="min-h-screen bg-[#0A0A0A] max-w-5xl mx-auto px-6 py-12">
      {/* Back link */}
      <Link
        href="/patterns"
        className="text-sm text-neutral-500 hover:text-orange-500 font-mono mb-6 inline-block"
      >
        ← All patterns
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <OrangeLabel text="/ PATTERN DETAIL" />
        {pattern.verified && (
          <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold tracking-wider">
            VERIFIED
          </span>
        )}
      </div>
      <h1 className="text-4xl font-bold text-white mb-8">{pattern.name}</h1>

      {/* Stats bar */}
      <div className="relative bg-[#111111] border border-neutral-500/20 p-6 mb-8 grid grid-cols-2 md:grid-cols-4 gap-6">
        <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
        <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
        <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
        <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

        <div>
          <p className="text-[11px] text-neutral-500 font-mono mb-1">Win Rate</p>
          <p className="text-3xl font-bold text-orange-500">
            {(pattern.win_rate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 font-mono mb-1">Sample Size</p>
          <p className="text-3xl font-bold text-white">{pattern.sample_size}</p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 font-mono mb-1">Avg P&amp;L</p>
          <p className="text-3xl font-bold text-green-400">
            +{pattern.avg_pnl_pct.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 font-mono mb-1">Avg Hold</p>
          <p className="text-3xl font-bold text-white">{avgHoldHours.toFixed(1)}h</p>
        </div>
      </div>

      {/* Conditions section */}
      <section className="mb-10">
        <OrangeLabel text="/ CONDITIONS" />
        <h2 className="text-2xl font-bold text-white mt-2 mb-6">Required market conditions</h2>
        <div className="space-y-2">
          {pattern.conditions.map((c, i) => (
            <div
              key={i}
              className="relative bg-[#111111] border border-neutral-500/10 px-4 py-3 grid grid-cols-[1fr_auto] gap-4 items-center"
            >
              <div>
                <p className="text-white font-medium text-sm">{c.label}</p>
                <p className="text-neutral-500 text-[11px] font-mono">{c.axis}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-neutral-500 font-mono">Threshold</p>
                <p className="text-white font-mono text-sm">
                  {c.op} {String(c.value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Primary markets */}
      <section className="mb-10">
        <OrangeLabel text="/ PRIMARY MARKETS" />
        <h2 className="text-2xl font-bold text-white mt-2 mb-6">Target markets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pattern.primary_assets.slice(0, 3).map((asset) => {
            const sym = stripSym(asset);
            return (
              <div
                key={asset}
                className="relative bg-[#111111] border border-neutral-500/20 p-4"
              >
                <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
                <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
                <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-semibold text-lg">{sym}</span>
                  <span className="text-[10px] font-mono text-neutral-500 border border-neutral-500/40 px-2 py-0.5">
                    {asset}
                  </span>
                </div>
                <div className="flex gap-2 text-[11px] font-mono">
                  <Link
                    href={`/simulate?side=${side}&symbol=${sym}`}
                    className="text-neutral-400 hover:text-orange-500 transition-colors"
                  >
                    Simulate →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-neutral-500/20">
        <Link
          href={`/simulate?side=${side}&symbol=${primarySym}`}
          className="text-black bg-orange-500 px-4 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
        >
          Simulate {primarySym} →
        </Link>
        <Link
          href="/patterns"
          className="text-neutral-400 hover:text-orange-500 px-3 py-2 text-sm font-mono transition-colors"
        >
          ← All Patterns
        </Link>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
