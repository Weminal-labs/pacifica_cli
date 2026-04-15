export const runtime = 'edge';
// ---------------------------------------------------------------------------
// /snapshot — Market Scanner
// Shows ALL markets at a glance: funding, buy pressure, momentum, pattern match
// Entry point to discover WHERE the opportunity is, not just confirm one market
// ---------------------------------------------------------------------------

import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

const PACIFICA_API = "https://test-api.pacifica.fi";
const LOCAL_API    = "http://localhost:4242";

const MARKETS = [
  "ETH", "BTC", "SOL", "MON", "AVAX", "ARB", "OP", "DOGE",
  "LINK", "AAVE", "UNI", "WIF", "PEPE", "SEI", "TIA",
];

interface RawMarket {
  symbol:      string;
  fundingRate: number | string;
  volume24h?:  number | string;
  openInterest?: number | string;
  markPrice?:  number | string;
  price?:      number | string;
}

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

async function fetchMarkets(): Promise<MarketRow[]> {
  // 1. Try local intelligence feed for active pattern data
  let activePatterns: Array<{ primary_assets: string[]; name: string; win_rate: number; conditions: Array<{ axis?: string }> }> = [];
  try {
    const feedRes = await fetch(`${LOCAL_API}/api/intelligence/feed`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (feedRes.ok) {
      const feed = await feedRes.json() as { active_patterns?: typeof activePatterns };
      activePatterns = feed.active_patterns ?? [];
    }
  } catch { /* local API offline — no patterns */ }

  // Build a quick lookup: normalised symbol → pattern info
  const patternByAsset = new Map<string, { name: string; wr: number; side: "long" | "short" }>();
  for (const p of activePatterns) {
    const axes = p.conditions.map((c) => (c.axis ?? "").toLowerCase());
    const side: "long" | "short" =
      axes.some((a) => a.includes("negative_funding") || a.includes("buy_pressure"))
        ? "long"
        : axes.some((a) => a.includes("positive_funding") || a.includes("sell_pressure"))
        ? "short"
        : "long";
    for (const asset of p.primary_assets) {
      const key = asset.replace(/-USDC-PERP$/, "").replace(/-USDC$/, "").split("-")[0].toUpperCase();
      patternByAsset.set(key, { name: p.name, wr: p.win_rate, side });
    }
  }

  // 2. Fetch live market data from testnet API
  let rawMarkets: RawMarket[] = [];
  try {
    const res = await fetch(`${PACIFICA_API}/api/v1/markets`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const json = await res.json() as { data?: RawMarket[] };
      rawMarkets = json.data ?? [];
    }
  } catch { /* network error — fall back to stub list */ }

  // If testnet returned nothing, build stubs from our known markets list
  if (rawMarkets.length === 0) {
    rawMarkets = MARKETS.map((sym) => ({
      symbol:      `${sym}-USDC-PERP`,
      fundingRate: 0,
      volume24h:   0,
      markPrice:   0,
    }));
  }

  const rows: MarketRow[] = rawMarkets
    .map((m): MarketRow | null => {
      const rawSym = String(m.symbol ?? "");
      const sym = rawSym.replace(/-USDC-PERP$/, "").replace(/-USDC$/, "").split("-")[0].toUpperCase();
      if (!sym) return null;

      const fr       = parseFloat(String(m.fundingRate ?? 0));
      const vol      = parseFloat(String(m.volume24h ?? 0));
      const price    = parseFloat(String(m.markPrice ?? m.price ?? 0));
      const pattern  = patternByAsset.get(sym) ?? null;

      // Signal score: pattern match > extreme funding > normal
      let score = 0;
      if (pattern)           score += 3;
      if (Math.abs(fr) > 0.0005) score += 1;
      if (Math.abs(fr) > 0.001)  score += 1;

      return {
        sym,
        symbol:      rawSym || `${sym}-USDC-PERP`,
        fundingRate: isNaN(fr)    ? 0 : fr,
        volume24h:   isNaN(vol)   ? 0 : vol,
        markPrice:   isNaN(price) ? 0 : price,
        patternName: pattern?.name   ?? null,
        patternWr:   pattern?.wr     ?? null,
        patternSide: pattern?.side   ?? null,
        signalScore: score,
      };
    })
    .filter((r): r is MarketRow => r !== null)
    // Sort: pattern-firing first, then by |funding rate| descending
    .sort((a, b) => b.signalScore - a.signalScore || Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

  return rows;
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

function fmtVol(v: number): string {
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
          {["Market", "Funding", "24h Vol", "Price", "Signal", "Actions"].map((h) => (
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
                <span className="text-neutral-400 text-sm font-mono">{fmtVol(row.volume24h)}</span>
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
        Pattern signals require the intelligence server ·{" "}
        <code className="text-orange-500/70">pacifica intelligence start</code>
      </p>
    </div>
  );
}
