
// ---------------------------------------------------------------------------
// /snapshot — Market Scanner
// Shows ALL markets at a glance: funding, buy pressure, momentum, pattern match
// Entry point to discover WHERE the opportunity is, not just confirm one market
// ---------------------------------------------------------------------------

export const runtime = "edge";

import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

const LOCAL_API    = "http://localhost:4242";

const MARKETS = [
  "ETH", "BTC", "SOL", "MON", "AVAX", "ARB", "OP", "DOGE",
  "LINK", "AAVE", "UNI", "WIF", "PEPE", "SEI", "TIA",
];


interface MarketRow {
  sym:         string;       // e.g. "ETH"
  symbol:      string;       // e.g. "ETH-USDC-PERP"
  fundingRate: number;
  volume24h:   number;
  markPrice:   number;
  patternName: string | null;
  patternWr:   number | null;
  patternSide: "long" | "short" | null;
  signalScore: number;       // 0-3: higher = more urgent
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface IntelSnapshot {
  current_conditions: {
    funding_rate: number;
    open_interest_usd: number;
    buy_pressure: number;
    momentum_signal: string;
    large_orders_count: number;
    mark_price: number;
  };
  matching_patterns: Array<{
    name: string;
    win_rate: number;
    conditions: Array<{ axis?: string }>;
    primary_assets: string[];
  }>;
}

async function fetchMarkets(): Promise<MarketRow[]> {
  // Fetch all market snapshots from intelligence API in parallel
  const snapResults = await Promise.allSettled(
    MARKETS.map((sym) =>
      fetch(`${LOCAL_API}/api/intelligence/snapshot/${sym}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      })
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as IntelSnapshot;
        })
        .catch(() => null),
    ),
  );

  // Build pattern lookup from first successful snapshot's matching patterns
  const patternByAsset = new Map<string, { name: string; wr: number; side: "long" | "short" }>();

  const rows: MarketRow[] = MARKETS.map((sym, i) => {
    const result = snapResults[i];
    const snap: IntelSnapshot | null =
      result.status === "fulfilled" ? result.value : null;

    const cond = snap?.current_conditions;
    const fr    = cond?.funding_rate   ?? 0;
    const price = cond?.mark_price     ?? 0;
    const oi    = cond?.open_interest_usd ?? 0;

    // Extract pattern matches for this market
    const matchedPattern = snap?.matching_patterns?.[0] ?? null;
    let patternName: string | null = null;
    let patternWr:   number | null = null;
    let patternSide: "long" | "short" | null = null;

    if (matchedPattern) {
      patternName = matchedPattern.name;
      patternWr   = matchedPattern.win_rate;
      const axes  = matchedPattern.conditions.map((c) => (c.axis ?? "").toLowerCase());
      patternSide =
        axes.some((a) => a.includes("negative_funding") || a.includes("buy_pressure"))
          ? "long"
          : axes.some((a) => a.includes("positive_funding") || a.includes("sell_pressure"))
          ? "short"
          : "long";
    }

    // Signal score: pattern match > extreme funding > normal
    let score = 0;
    if (patternName)           score += 3;
    if (Math.abs(fr) > 0.0005) score += 1;
    if (Math.abs(fr) > 0.001)  score += 1;

    return {
      sym,
      symbol:      `${sym}-USDC-PERP`,
      fundingRate: fr,
      volume24h:   oi,   // use OI as proxy when no volume endpoint available
      markPrice:   price,
      patternName,
      patternWr,
      patternSide,
      signalScore: score,
    };
  });

  return rows
    .sort((a, b) => b.signalScore - a.signalScore || Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtFunding(r: number): string {
  return (r * 100).toFixed(4) + "%";
}

function fmtPrice(p: number): string {
  if (p === 0) return "—";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtOI(v: number): string {
  if (v === 0) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fundingColor(r: number): string {
  if (r < -0.0005) return "text-green-400";   // negative = longs get paid → bullish setup
  if (r >  0.0005) return "text-red-400";     // positive = shorts get paid
  return "text-neutral-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ScannerPage() {
  const rows = await fetchMarkets();
  const activeCount = rows.filter((r) => r.patternName !== null).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <OrangeLabel text="/ MARKET SCANNER" />
        <div className="flex items-end justify-between mt-3 gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white">Live Market Conditions</h1>
            <p className="text-neutral-500 text-sm mt-1">
              {rows.length} markets tracked
              {activeCount > 0 && (
                <span className="ml-2 text-orange-500 font-semibold">
                  · {activeCount} pattern{activeCount !== 1 ? "s" : ""} firing
                </span>
              )}
            </p>
          </div>
          <Link
            href="/patterns"
            className="text-sm text-neutral-500 hover:text-white transition-colors font-mono shrink-0"
          >
            Pattern library →
          </Link>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-[11px] font-mono text-neutral-600 mb-6">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          Pattern firing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Negative funding (long setup)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Positive funding (short setup)
        </span>
      </div>

      {/* Scanner table */}
      <div className="relative border border-neutral-500/20 overflow-hidden">
        {/* Corner brackets */}
        <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500/50" />
        <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500/50" />
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500/50" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500/50" />

        {/* Table header */}
        <div className="grid grid-cols-[120px_1fr_1fr_1fr_2fr_180px] gap-0 border-b border-neutral-500/20 bg-[#0D0D0D]">
          {["Market", "Funding", "Open Interest", "Price", "Signal", "Actions"].map((h) => (
            <div key={h} className="px-4 py-3 text-[10px] font-mono text-neutral-600 uppercase tracking-wider">
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row) => {
          const hasPattern = row.patternName !== null;
          const fundingNeg = row.fundingRate < -0.0003;
          const fundingPos = row.fundingRate >  0.0003;
          const side = hasPattern
            ? row.patternSide!
            : fundingNeg ? "long" : fundingPos ? "short" : null;

          return (
            <div
              key={row.sym}
              className={[
                "grid grid-cols-[120px_1fr_1fr_1fr_2fr_180px] gap-0 border-b border-neutral-500/10 transition-colors",
                hasPattern
                  ? "bg-orange-500/5 hover:bg-orange-500/10"
                  : "hover:bg-[#131313]",
              ].join(" ")}
            >
              {/* Market symbol */}
              <div className="px-4 py-4 flex items-center gap-2">
                {hasPattern && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                )}
                <Link
                  href={`/snapshot/${row.sym}`}
                  className="text-white font-semibold text-sm hover:text-orange-500 transition-colors"
                >
                  {row.sym}
                </Link>
              </div>

              {/* Funding rate */}
              <div className="px-4 py-4 flex items-center">
                <span className={`font-mono text-sm font-semibold ${fundingColor(row.fundingRate)}`}>
                  {fmtFunding(row.fundingRate)}
                </span>
              </div>

              {/* Volume */}
              <div className="px-4 py-4 flex items-center">
                <span className="text-neutral-400 text-sm font-mono">{fmtOI(row.volume24h)}</span>
              </div>

              {/* Price */}
              <div className="px-4 py-4 flex items-center">
                <span className="text-white text-sm font-mono">{fmtPrice(row.markPrice)}</span>
              </div>

              {/* Signal */}
              <div className="px-4 py-4 flex items-center gap-2 flex-wrap">
                {hasPattern ? (
                  <>
                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                      row.patternSide === "long"
                        ? "bg-green-400/15 text-green-400 border border-green-400/30"
                        : "bg-red-400/15 text-red-400 border border-red-400/30"
                    }`}>
                      {row.patternSide === "long" ? "LONG ↑" : "SHORT ↓"}
                    </span>
                    <span className="text-[11px] text-neutral-300 font-medium truncate max-w-[160px]">
                      {row.patternName}
                    </span>
                    <span className="text-[10px] text-orange-500 font-mono font-bold">
                      {((row.patternWr ?? 0) * 100).toFixed(0)}% WR
                    </span>
                  </>
                ) : side ? (
                  <span className={`text-[10px] font-mono ${side === "long" ? "text-green-400/60" : "text-red-400/60"}`}>
                    {side === "long" ? "Funding setup ↑" : "Funding setup ↓"}
                  </span>
                ) : (
                  <span className="text-[11px] text-neutral-600 font-mono">No signal</span>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 py-4 flex items-center gap-3 text-[11px] font-mono">
                <Link
                  href={`/snapshot/${row.sym}`}
                  className="text-neutral-400 hover:text-orange-500 transition-colors"
                >
                  Snapshot →
                </Link>
                {side && (
                  <Link
                    href={`/simulate?side=${side}&symbol=${row.sym}${row.markPrice > 0 ? `&price=${row.markPrice.toFixed(0)}` : ""}`}
                    className="text-orange-500 hover:text-orange-400 transition-colors font-semibold"
                  >
                    Simulate →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <p className="text-[11px] text-neutral-600 font-mono mt-4 text-center">
        Live data from the intelligence server ·{" "}
        <code className="text-orange-500/70">pacifica intelligence serve</code>
      </p>
    </div>
  );
}
