
export const runtime = "edge";

import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";
import type { ReputationEntry } from "../../lib/types";
import { DEMO_REP } from "../../lib/demo-data";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getReputation(): Promise<ReputationEntry[]> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/reputation?limit=20", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("API unavailable");
    const data = await res.json();
    return (data.leaderboard ?? data) as ReputationEntry[];
  } catch {
    return DEMO_REP; // empty array — shows "API offline" state instead of fake data
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repBarWidth(score: number): string {
  // score is 0–100
  return `${Math.min(100, Math.max(0, score))}%`;
}

function repBarColor(score: number): string {
  if (score >= 75) return "bg-orange-500";
  if (score >= 50) return "bg-orange-500/60";
  return "bg-neutral-600";
}

function winRateColor(rate: number): string {
  if (rate >= 0.65) return "text-emerald-400";
  if (rate >= 0.5)  return "text-neutral-200";
  return "text-red-400";
}

/** Tally how many traders use each pattern, sorted descending. */
function buildPatternBreakdown(entries: ReputationEntry[]): { pattern: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    for (const p of e.top_patterns) {
      map.set(p, (map.get(p) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BracketCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative bg-[#111111] border border-neutral-800 p-5">
      <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
      <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
      <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
      <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
      {children}
    </div>
  );
}

function StatStrip({ entries }: { entries: ReputationEntry[] }) {
  const total = entries.length;
  const avgWinRate =
    total > 0
      ? entries.reduce((s, e) => s + e.overall_win_rate, 0) / total
      : 0;
  const topScore =
    total > 0 ? Math.max(...entries.map((e) => e.overall_rep_score)) : 0;

  const stats = [
    {
      label: "TRADERS TRACKED",
      value: total.toString(),
      sub: "active addresses",
    },
    {
      label: "AVG WIN RATE",
      value: `${(avgWinRate * 100).toFixed(1)}%`,
      sub: "across all traders",
    },
    {
      label: "TOP REP SCORE",
      value: topScore.toString(),
      sub: "highest accuracy",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
      {stats.map((s) => (
        <BracketCard key={s.label}>
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
            / {s.label}
          </p>
          <p className="text-3xl font-bold font-mono text-white">{s.value}</p>
          <p className="text-[11px] font-mono text-neutral-500 mt-1">{s.sub}</p>
        </BracketCard>
      ))}
    </div>
  );
}

function PatternBreakdown({ entries }: { entries: ReputationEntry[] }) {
  const breakdown = buildPatternBreakdown(entries);
  const maxCount = breakdown[0]?.count ?? 1;

  return (
    <div className="relative bg-[#111111] border border-neutral-800 p-6 mt-8">
      <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
      <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
      <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
      <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

      <div className="mb-5">
        <OrangeLabel text="/ PATTERN BREAKDOWN" />
        <h2 className="text-xl font-bold text-white mt-2">
          Most common patterns across all traders
        </h2>
        <p className="text-neutral-500 text-sm font-mono mt-1">
          Frequency of top patterns across {entries.length} tracked traders
        </p>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-neutral-500 font-mono text-sm py-4">No pattern data available.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {breakdown.map(({ pattern, count }) => {
            const pct = (count / maxCount) * 100;
            return (
              <div
                key={pattern}
                className="border border-neutral-800 bg-[#0A0A0A] p-4 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-neutral-200">
                    {pattern.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs font-mono text-orange-400 font-semibold">
                    {count} trader{count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-0.5 bg-neutral-900 border border-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-orange-500/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReputationPage() {
  const entries = await getReputation();

  return (
    <div className="min-h-screen bg-[#0A0A0A] max-w-6xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <OrangeLabel text="/ REPUTATION LEDGER" />
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">
          Intelligence Reputation
        </h1>
        <p className="text-neutral-500 font-mono text-sm">
          Accuracy built from actual P&amp;L — not self-reported. Ground truth is the outcome.
        </p>
      </div>

      {entries.length === 0 ? (
        /* ── API offline state ──────────────────────────────────────── */
        <div className="relative border border-neutral-800 bg-[#111111] p-8 text-center">
          <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-neutral-600" />
          <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-neutral-600" />
          <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-neutral-600" />
          <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-neutral-600" />
          <p className="text-neutral-400 font-mono text-sm">
            Intelligence API offline
          </p>
          <p className="text-neutral-600 font-mono text-xs mt-1">
            Start the API server to see live Pacifica testnet data
          </p>
          <code className="text-orange-400 font-mono text-xs mt-3 block">
            node dist/cli.js intelligence serve
          </code>
        </div>
      ) : (
        <>
          {/* ── Stat strip ────────────────────────────────────────────── */}
          <StatStrip entries={entries} />

          {/* ── Table ─────────────────────────────────────────────────── */}
          <div className="border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111111] border-b border-neutral-800">
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Rank
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Trader
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Rep Score
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Win Rate
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Trades
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                    Top Patterns
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr
                    key={e.trader_id}
                    className="border-b border-neutral-800/60 hover:bg-[#111111] transition-colors"
                  >
                    {/* Rank */}
                    <td className="px-5 py-4 font-mono text-neutral-500 text-sm">
                      #{i + 1}
                    </td>

                    {/* Trader */}
                    <td className="px-5 py-4 font-mono text-xs">
                      <Link
                        href={`/trader/${e.trader_id}`}
                        className="text-orange-400 hover:text-orange-300 hover:underline transition-colors"
                      >
                        {e.trader_id.slice(0, 6)}…{e.trader_id.slice(-4)}
                      </Link>
                    </td>

                    {/* Rep Score */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-white text-sm w-8">
                          {e.overall_rep_score}
                        </span>
                        <div className="w-20 h-0.5 bg-neutral-900 border border-neutral-800 overflow-hidden">
                          <div
                            className={`h-full ${repBarColor(e.overall_rep_score)}`}
                            style={{ width: repBarWidth(e.overall_rep_score) }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Win Rate */}
                    <td className={`px-5 py-4 font-mono font-semibold text-sm ${winRateColor(e.overall_win_rate)}`}>
                      {(e.overall_win_rate * 100).toFixed(1)}%
                    </td>

                    {/* Trades */}
                    <td className="px-5 py-4 font-mono text-neutral-300 text-sm">
                      {e.closed_trades}
                    </td>

                    {/* Top Patterns */}
                    <td className="px-5 py-4">
                      <div className="flex gap-1 flex-wrap">
                        {e.top_patterns.slice(0, 2).map((p) => (
                          <span
                            key={p}
                            className="text-[10px] px-1.5 py-0.5 border border-neutral-700 bg-[#0A0A0A] text-neutral-400 font-mono"
                          >
                            {p.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Pattern Breakdown ─────────────────────────────────────── */}
          <PatternBreakdown entries={entries} />
        </>
      )}
    </div>
  );
}
