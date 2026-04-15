
export const runtime = "edge";

import Link from "next/link";
import { notFound } from "next/navigation";
import { OrangeLabel } from "../../../components/ui/OrangeLabel";
import { SEED_PATTERNS } from "../../../lib/seed-patterns";
import type { Pattern } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotConditions {
  funding_rate?: number;
  open_interest_usd?: number;
  buy_pressure?: number;
  momentum_signal?: number;
  mark_price?: number;
  large_orders_count?: number;
}

interface SnapshotResponse {
  current_conditions: SnapshotConditions;
  matching_patterns: Pattern[];
  best_pattern_match: Pattern | null;
}

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

function axisToField(
  axis: string,
): keyof SnapshotConditions | null {
  const a = axis.toLowerCase();
  if (a.includes("funding")) return "funding_rate";
  if (a.includes("buy_pressure") || a.includes("sell_pressure")) return "buy_pressure";
  if (a.includes("momentum")) return "momentum_signal";
  if (a.includes("large_orders") || a.includes("whale")) return "large_orders_count";
  if (a.includes("open_interest")) return "open_interest_usd";
  if (a.includes("mark_price")) return "mark_price";
  return null;
}

function checkCondition(
  cond: { axis: string; op: string; value: number | string },
  current: number | undefined,
): "match" | "near" | "no" | "unknown" {
  if (current === undefined) return "unknown";
  const threshold = Number(cond.value);
  if (Number.isNaN(threshold)) return "unknown";
  let matches = false;
  if (cond.op === "lt") matches = current < threshold;
  else if (cond.op === "gt") matches = current > threshold;
  else if (cond.op === "gte") matches = current >= threshold;
  else if (cond.op === "lte") matches = current <= threshold;
  else if (cond.op === "eq") matches = current === threshold;
  if (matches) return "match";
  const dist = Math.abs(current - threshold) / (Math.abs(threshold) || 1);
  if (dist < 0.2) return "near";
  return "no";
}

function formatCurrent(field: keyof SnapshotConditions | null, value: number | undefined): string {
  if (value === undefined || field === null) return "—";
  if (field === "funding_rate") return `${(value * 100).toFixed(3)}%`;
  if (field === "buy_pressure") return `${(value * 100).toFixed(1)}%`;
  if (field === "momentum_signal") return value.toFixed(2);
  if (field === "large_orders_count") return String(value);
  if (field === "open_interest_usd") return `$${(value / 1_000_000).toFixed(1)}M`;
  if (field === "mark_price") return `$${value.toFixed(2)}`;
  return String(value);
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getPattern(id: string): Promise<Pattern | null> {
  try {
    const res = await fetch(`http://localhost:4242/api/intelligence/patterns/${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (res.ok) return (await res.json()) as Pattern;
  } catch {
    // fall through to seed fallback
  }
  return SEED_PATTERNS.find((p) => p.id === id) ?? null;
}

async function getSnapshots(
  assets: string[],
): Promise<Record<string, SnapshotResponse | null>> {
  const markets = assets.slice(0, 3);
  const entries = await Promise.all(
    markets.map(async (asset) => {
      const sym = stripSym(asset);
      try {
        const res = await fetch(`http://localhost:4242/api/intelligence/snapshot/${sym}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4_000),
        });
        if (!res.ok) return [sym, null] as const;
        return [sym, (await res.json()) as SnapshotResponse] as const;
      } catch {
        return [sym, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PatternDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const pattern = await getPattern(params.id);
  if (!pattern) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] max-w-4xl mx-auto px-6 py-16">
        <OrangeLabel text="/ PATTERN NOT FOUND" />
        <h1 className="text-3xl font-bold text-white mt-3 mb-4">Pattern not found</h1>
        <p className="text-neutral-500 mb-6">
          The pattern you&apos;re looking for doesn&apos;t exist or the intelligence server is offline.
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

  const snapshots = await getSnapshots(pattern.primary_assets);
  const snapshotList = Object.entries(snapshots);
  const anyOnline = snapshotList.some(([, s]) => s !== null);

  // isLive: pattern id appears in any snapshot's matching_patterns
  const isLive = snapshotList.some(
    ([, s]) => s?.matching_patterns.some((p) => p.id === pattern.id),
  );

  const avgHoldHours = pattern.avg_duration_minutes / 60;
  const side = deriveSide(pattern);
  const primarySym = stripSym(pattern.primary_assets[0] ?? "ETH");

  // Pick best-match market for simulate link
  let bestMatchSym = primarySym;
  for (const [sym, s] of snapshotList) {
    if (s?.matching_patterns.some((p) => p.id === pattern.id)) {
      bestMatchSym = sym;
      break;
    }
  }

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
        {isLive && (
          <span className="text-[10px] text-orange-500 font-bold font-mono tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            LIVE
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

      {/* Offline note */}
      {!anyOnline && (
        <div className="bg-[#0F0F0F] border border-neutral-500/20 p-4 mb-8">
          <p className="text-neutral-400 text-sm">
            Intelligence server offline — start with{" "}
            <code className="text-orange-500 font-mono">pacifica intelligence serve</code>{" "}
            to see live condition matching.
          </p>
        </div>
      )}

      {/* Conditions section */}
      <section className="mb-10">
        <OrangeLabel text="/ CONDITIONS" />
        <h2 className="text-2xl font-bold text-white mt-2 mb-6">Required market conditions</h2>
        <div className="space-y-2">
          {pattern.conditions.map((c, i) => {
            const field = axisToField(c.axis);
            // Use the first online snapshot with this field to evaluate
            let currentVal: number | undefined;
            for (const [, s] of snapshotList) {
              if (s && field) {
                const v = s.current_conditions[field];
                if (v !== undefined) {
                  currentVal = v;
                  break;
                }
              }
            }
            const status = anyOnline ? checkCondition(c, currentVal) : "unknown";
            const statusChip = {
              match: (
                <span className="text-[11px] font-mono font-bold text-green-400 border border-green-400/40 bg-green-400/10 px-2 py-0.5">
                  ✓ MATCH
                </span>
              ),
              near: (
                <span className="text-[11px] font-mono font-bold text-orange-500 border border-orange-500/40 bg-orange-500/10 px-2 py-0.5">
                  ~ NEAR
                </span>
              ),
              no: (
                <span className="text-[11px] font-mono font-bold text-red-400 border border-red-400/40 bg-red-400/10 px-2 py-0.5">
                  ✗ NO
                </span>
              ),
              unknown: (
                <span className="text-[11px] font-mono font-bold text-neutral-500 border border-neutral-500/40 bg-neutral-500/10 px-2 py-0.5">
                  — OFFLINE
                </span>
              ),
            }[status];

            return (
              <div
                key={i}
                className="relative bg-[#111111] border border-neutral-500/10 px-4 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center"
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
                <div className="text-right">
                  <p className="text-[11px] text-neutral-500 font-mono">Current</p>
                  <p className="text-white font-mono text-sm">
                    {formatCurrent(field, currentVal)}
                  </p>
                </div>
                <div>{statusChip}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live Market Scan */}
      <section className="mb-10">
        <OrangeLabel text="/ LIVE MARKET SCAN" />
        <h2 className="text-2xl font-bold text-white mt-2 mb-6">Primary markets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pattern.primary_assets.slice(0, 3).map((asset) => {
            const sym = stripSym(asset);
            const snap = snapshots[sym];
            const isMatch = snap?.matching_patterns.some((p) => p.id === pattern.id);
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
                  {snap === null ? (
                    <span className="text-[10px] font-mono text-neutral-500 border border-neutral-500/40 px-2 py-0.5">
                      OFFLINE
                    </span>
                  ) : isMatch ? (
                    <span className="text-[10px] font-mono font-bold text-green-400 border border-green-400/40 bg-green-400/10 px-2 py-0.5">
                      ● MATCHING
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-neutral-500 border border-neutral-500/40 px-2 py-0.5">
                      ○ NO MATCH
                    </span>
                  )}
                </div>
                <div className="flex gap-2 text-[11px] font-mono">
                  <Link
                    href={`/snapshot/${sym}`}
                    className="text-neutral-400 hover:text-orange-500 transition-colors"
                  >
                    Snapshot →
                  </Link>
                  <span className="text-neutral-600">·</span>
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
          href={`/simulate?side=${side}&symbol=${bestMatchSym}`}
          className="text-black bg-orange-500 px-4 py-2 text-sm font-medium hover:bg-orange-400 transition-colors"
        >
          Simulate (best match) →
        </Link>
        <Link
          href={`/snapshot/${primarySym}`}
          className="relative text-white px-4 py-2 text-sm font-medium border border-orange-900/40 hover:bg-orange-900/20 transition-colors"
        >
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500" />
          View Snapshot →
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

// Avoid static generation since we hit a live API
export const dynamic = "force-dynamic";

// Suppress ESLint unused-var if notFound isn't referenced
void notFound;
