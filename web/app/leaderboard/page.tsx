
export const runtime = "edge";

// ---------------------------------------------------------------------------
// Pacifica Intelligence — Leaderboard (Premium)
// ---------------------------------------------------------------------------
// Server component. Fetches leaderboard + top-8 positions, computes derived
// intelligence metrics (consistency, momentum, leverage, concentration, bias,
// capital efficiency, consensus trades), and hands an enriched payload to the
// client component for sorting, filtering, watchlist, and expansion.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";
import LeaderboardClient, {
  type EnrichedEntry,
  type ConsensusAsset,
  type MarketRegime,
} from "./LeaderboardClient";
import type { Pattern } from "../../lib/types";
import { SEED_PATTERNS } from "../../lib/seed-patterns";

const PACIFICA_API = "https://test-api.pacifica.fi/api/v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface RawEntry {
  address:         string;
  username:        string | null;
  pnl_1d:          string;
  pnl_7d:          string;
  pnl_30d:         string;
  pnl_all_time:    string;
  equity_current:  string;
  oi_current:      string;
  volume_all_time: string;
}

interface RawPosition {
  symbol:            string;
  side:              "bid" | "ask";
  amount:            string;
  entry_price:       string;
  liquidation_price: string;
  funding?:          string;
  margin?:           string;
}

// ---------------------------------------------------------------------------
// Derived-metric helpers
// ---------------------------------------------------------------------------

function cleanSymbol(raw: string): string {
  return raw.replace(/-USDC-PERP$/, "").replace(/-USDC$/, "");
}

// Consistency: 0-4 based on how many timeframes show positive PnL.
function consistencyScore(e: { pnl1d: number; pnl7d: number; pnl30d: number; pnlAll: number }): number {
  return [e.pnl1d, e.pnl7d, e.pnl30d, e.pnlAll].filter((v) => v > 0).length;
}

// Momentum: fraction of 7D PnL earned in the last day (1.0 = all weekly gains
// came today → hot streak). Negative when 1D reverses a positive 7D.
function momentumIndex(pnl1d: number, pnl7d: number): number {
  if (pnl7d === 0) return 0;
  return pnl1d / pnl7d;
}

// Leverage proxy: open interest / equity.
function leverageRatio(oi: number, equity: number): number {
  if (equity <= 0) return 0;
  return oi / equity;
}

// Directional bias from open positions: +1 all long, -1 all short, 0 balanced.
function directionalBias(positions: RawPosition[]): number {
  if (positions.length === 0) return 0;
  let longNotional = 0;
  let shortNotional = 0;
  for (const p of positions) {
    const notional = Math.abs(parseFloat(p.amount) * parseFloat(p.entry_price)) || 0;
    if (p.side === "bid") longNotional += notional;
    else                  shortNotional += notional;
  }
  const total = longNotional + shortNotional;
  if (total === 0) return 0;
  return (longNotional - shortNotional) / total;
}

// Capital efficiency: lifetime PnL as multiple of current equity.
function capitalEfficiency(pnlAll: number, equity: number): number {
  if (equity <= 0) return 0;
  return pnlAll / equity;
}

// ---------------------------------------------------------------------------
// Data fetch + enrichment
// ---------------------------------------------------------------------------

async function fetchActivePatterns(): Promise<Pattern[]> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/feed", {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) throw new Error("API unavailable");
    const data = await res.json();
    return (data.active_patterns ?? data.patterns ?? []) as Pattern[];
  } catch {
    return SEED_PATTERNS;
  }
}

async function fetchLeaderboard(): Promise<{
  entries:  EnrichedEntry[];
  consensus: ConsensusAsset[];
  regime:    MarketRegime;
}> {
  const empty = { entries: [], consensus: [], regime: emptyRegime() };

  try {
    const res = await fetch(`${PACIFICA_API}/leaderboard`, { cache: "no-store" });
    if (!res.ok) return empty;

    const json = (await res.json()) as { data?: RawEntry[] };
    const raw  = json?.data ?? [];

    const sorted = [...raw]
      .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
      .slice(0, 25);

    const POSITIONS_FOR = 8;
    const posResults = await Promise.allSettled(
      sorted.slice(0, POSITIONS_FOR).map((t) =>
        fetch(`${PACIFICA_API}/positions?account=${encodeURIComponent(t.address)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4_000),
        }).then(async (r) => {
          if (!r.ok) return [] as RawPosition[];
          const j = (await r.json()) as { data?: RawPosition[] };
          return j?.data ?? [];
        }),
      ),
    );

    const entries: EnrichedEntry[] = sorted.map((t, i) => {
      const positions: RawPosition[] =
        i < POSITIONS_FOR && posResults[i].status === "fulfilled"
          ? (posResults[i] as PromiseFulfilledResult<RawPosition[]>).value
          : [];

      const pnl1d   = parseFloat(t.pnl_1d)         || 0;
      const pnl7d   = parseFloat(t.pnl_7d)         || 0;
      const pnl30d  = parseFloat(t.pnl_30d)        || 0;
      const pnlAll  = parseFloat(t.pnl_all_time)   || 0;
      const equity  = parseFloat(t.equity_current) || 0;
      const oi      = parseFloat(t.oi_current)     || 0;
      const volume  = parseFloat(t.volume_all_time) || 0;

      const uniqueAssets = new Set(positions.map((p) => cleanSymbol(p.symbol))).size;

      return {
        rank:          i + 1,
        address:       t.address,
        username:      t.username,
        pnl1d,
        pnl7d,
        pnl30d,
        pnlAll,
        equity,
        oi,
        volume,
        repScore:      Math.max(99 - i * 4, 25),
        positions:     positions.map((p) => ({
          symbol:            cleanSymbol(p.symbol),
          side:              p.side,
          amount:            parseFloat(p.amount) || 0,
          entryPrice:        parseFloat(p.entry_price) || 0,
          liquidationPrice:  parseFloat(p.liquidation_price) || 0,
          funding:           p.funding ? parseFloat(p.funding) : 0,
          margin:            p.margin ? parseFloat(p.margin) : 0,
          notional:          Math.abs((parseFloat(p.amount) || 0) * (parseFloat(p.entry_price) || 0)),
        })),
        consistency:       consistencyScore({ pnl1d, pnl7d, pnl30d, pnlAll }),
        momentum:          momentumIndex(pnl1d, pnl7d),
        leverage:          leverageRatio(oi, equity),
        concentration:     uniqueAssets,
        bias:              directionalBias(positions),
        capitalEfficiency: capitalEfficiency(pnlAll, equity),
      };
    });

    // -----------------------------------------------------------------------
    // Consensus Positions — assets held by ≥2 of the top-8 traders
    // -----------------------------------------------------------------------

    const consensusMap = new Map<string, {
      longCount: number;
      shortCount: number;
      longNotional: number;
      shortNotional: number;
      traders: string[];
    }>();

    for (const e of entries.slice(0, POSITIONS_FOR)) {
      const seen = new Set<string>();
      for (const p of e.positions) {
        if (seen.has(p.symbol)) continue;
        seen.add(p.symbol);

        const existing = consensusMap.get(p.symbol) ?? {
          longCount: 0, shortCount: 0, longNotional: 0, shortNotional: 0, traders: [],
        };
        if (p.side === "bid") {
          existing.longCount  += 1;
          existing.longNotional += p.notional;
        } else {
          existing.shortCount += 1;
          existing.shortNotional += p.notional;
        }
        existing.traders.push(e.username ?? e.address.slice(0, 6));
        consensusMap.set(p.symbol, existing);
      }
    }

    const consensus: ConsensusAsset[] = Array.from(consensusMap.entries())
      .filter(([, v]) => v.longCount + v.shortCount >= 2)
      .map(([symbol, v]) => ({
        symbol,
        longCount:      v.longCount,
        shortCount:     v.shortCount,
        totalTraders:   v.longCount + v.shortCount,
        longNotional:   v.longNotional,
        shortNotional:  v.shortNotional,
        traders:        v.traders,
      }))
      .sort((a, b) => b.totalTraders - a.totalTraders)
      .slice(0, 6);

    // -----------------------------------------------------------------------
    // Market Regime — aggregate bias across top-8
    // -----------------------------------------------------------------------

    const topSlice = entries.slice(0, POSITIONS_FOR);
    const biases   = topSlice.map((e) => e.bias).filter((b) => b !== 0);
    const avgBias  = biases.length > 0
      ? biases.reduce((s, v) => s + v, 0) / biases.length
      : 0;

    const risingCount = topSlice.filter((e) => e.momentum > 0.25 && e.pnl1d > 0).length;
    const positive1d  = entries.filter((e) => e.pnl1d > 0).length;

    const regime: MarketRegime = {
      avgBias,
      risingCount,
      totalTracked: entries.length,
      positive1d,
      topGainer: entries.length > 0
        ? [...entries].sort((a, b) => b.pnl1d - a.pnl1d)[0]
        : null,
      topLoser: entries.length > 0
        ? [...entries].sort((a, b) => a.pnl1d - b.pnl1d)[0]
        : null,
    };

    return { entries, consensus, regime };
  } catch {
    return empty;
  }
}

function emptyRegime(): MarketRegime {
  return {
    avgBias: 0,
    risingCount: 0,
    totalTracked: 0,
    positive1d: 0,
    topGainer: null,
    topLoser: null,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (used only by server-rendered header cards)
// ---------------------------------------------------------------------------

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pctColor(n: number): string {
  if (n > 0.15)  return "text-emerald-400";
  if (n < -0.15) return "text-red-400";
  return "text-neutral-400";
}

function biasLabel(b: number): { text: string; cls: string } {
  if (b > 0.5)  return { text: "LONG HEAVY",  cls: "text-emerald-400" };
  if (b > 0.15) return { text: "LONG LEAN",   cls: "text-emerald-400/80" };
  if (b < -0.5) return { text: "SHORT HEAVY", cls: "text-red-400" };
  if (b < -0.15)return { text: "SHORT LEAN",  cls: "text-red-400/80" };
  return { text: "NEUTRAL", cls: "text-neutral-400" };
}

// ---------------------------------------------------------------------------
// Sub-components (server)
// ---------------------------------------------------------------------------

function BracketCard({
  children,
  accent = "neutral",
}: {
  children: React.ReactNode;
  accent?: "neutral" | "orange";
}) {
  const bracket = accent === "orange" ? "border-orange-500" : "border-neutral-700";
  return (
    <div className="relative bg-[#111111] border border-neutral-800 p-4">
      <span className={`absolute top-0 left-0 h-2 w-2 border-t border-l ${bracket}`} />
      <span className={`absolute top-0 right-0 h-2 w-2 border-t border-r ${bracket}`} />
      <span className={`absolute bottom-0 left-0 h-2 w-2 border-b border-l ${bracket}`} />
      <span className={`absolute bottom-0 right-0 h-2 w-2 border-b border-r ${bracket}`} />
      {children}
    </div>
  );
}

function RegimePanel({ regime }: { regime: MarketRegime }) {
  const bias = biasLabel(regime.avgBias);
  const biasPct = Math.round(Math.abs(regime.avgBias) * 100);

  return (
    <BracketCard accent="orange">
      <p className="text-[10px] font-mono text-orange-400 uppercase tracking-widest mb-2">
        / Market Regime
      </p>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono ${bias.cls}`}>
          {bias.text}
        </span>
        <span className="text-xs text-neutral-500 font-mono">{biasPct}%</span>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden bg-neutral-900 border border-neutral-800">
        <div
          className="bg-emerald-500/70"
          style={{ width: `${50 + (regime.avgBias * 50)}%` }}
        />
        <div
          className="bg-red-500/70 ml-auto"
          style={{ width: `${50 - (regime.avgBias * 50)}%` }}
        />
      </div>
      <p className="text-[10px] text-neutral-500 font-mono mt-3">
        Across top 8 traders&apos; open books
      </p>
    </BracketCard>
  );
}

function BreakoutPanel({ regime }: { regime: MarketRegime }) {
  return (
    <BracketCard>
      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
        / Breakout Watch
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono text-orange-400">
          {regime.risingCount}
        </span>
        <span className="text-xs text-neutral-500 font-mono">accelerating</span>
      </div>
      <p className="text-[11px] text-neutral-400 font-mono mt-3">
        Traders with 1D P&amp;L {">"} 25% of 7D
      </p>
      <p className="text-[10px] text-neutral-600 font-mono mt-1">
        {regime.positive1d}/{regime.totalTracked} green on the day
      </p>
    </BracketCard>
  );
}

function MoversPanel({ regime }: { regime: MarketRegime }) {
  return (
    <BracketCard>
      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">
        / 24h Movers
      </p>
      {regime.topGainer && (
        <div className="flex items-center justify-between text-xs font-mono">
          <Link href={`/trader/${regime.topGainer.address}`} className="text-white hover:text-orange-400 truncate">
            {regime.topGainer.username ?? regime.topGainer.address.slice(0, 6)}
          </Link>
          <span className="text-emerald-400 font-semibold ml-2">
            {fmtCompact(regime.topGainer.pnl1d)}
          </span>
        </div>
      )}
      {regime.topLoser && regime.topLoser.address !== regime.topGainer?.address && (
        <div className="flex items-center justify-between text-xs font-mono mt-2">
          <Link href={`/trader/${regime.topLoser.address}`} className="text-white hover:text-orange-400 truncate">
            {regime.topLoser.username ?? regime.topLoser.address.slice(0, 6)}
          </Link>
          <span className="text-red-400 font-semibold ml-2">
            {fmtCompact(regime.topLoser.pnl1d)}
          </span>
        </div>
      )}
      <p className="text-[10px] text-neutral-600 font-mono mt-3">
        Biggest gain / loss in the last 24h
      </p>
    </BracketCard>
  );
}

function ConsensusPanel({ consensus }: { consensus: ConsensusAsset[] }) {
  return (
    <div className="relative bg-[#111111] border border-neutral-800 p-4">
      <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
      <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
      <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
      <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-mono text-orange-400 uppercase tracking-widest">
          / Consensus Positions
        </p>
        <p className="text-[10px] font-mono text-neutral-500">
          Top 8 traders&apos; consensus
        </p>
      </div>

      {consensus.length === 0 ? (
        <p className="text-xs text-neutral-500 font-mono py-4">
          No assets held by 2+ top traders right now.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {consensus.map((c) => {
            const total = c.longCount + c.shortCount;
            const longPct = (c.longCount / total) * 100;
            const dominant = c.longCount >= c.shortCount ? "LONG" : "SHORT";
            const dominantCls = c.longCount >= c.shortCount ? "text-emerald-400" : "text-red-400";
            return (
              <div key={c.symbol} className="border border-neutral-800 bg-[#0A0A0A] p-3 hover:border-orange-500/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-bold font-mono">{c.symbol}</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {c.totalTraders}/8
                  </span>
                </div>
                <p className={`text-[10px] font-mono mt-1 ${dominantCls}`}>
                  {dominant} {Math.round(c.longCount >= c.shortCount ? longPct : 100 - longPct)}%
                </p>
                <div className="mt-2 flex h-1 overflow-hidden bg-neutral-900">
                  <div className="bg-emerald-500/80" style={{ width: `${longPct}%` }} />
                  <div className="bg-red-500/80 flex-1" />
                </div>
                <p className="text-[9px] font-mono text-neutral-600 mt-2">
                  {fmtUsd(c.longNotional + c.shortNotional)} notional
                </p>
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

export default async function LeaderboardPage() {
  const [{ entries, consensus, regime }, activePatterns] = await Promise.all([
    fetchLeaderboard(),
    fetchActivePatterns(),
  ]);

  const empty = entries.length === 0;

  return (
    <div className="px-6 py-12 pb-20 max-w-[1400px] mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <OrangeLabel text="/ LIVE LEADERBOARD" />
          <h1 className="text-3xl font-bold text-white mt-2 tracking-tight">
            Top Traders
          </h1>
          <p className="text-neutral-500 text-sm mt-1 font-mono">
            Intelligence-ranked · Pacifica testnet · Consensus + live positions for top 8
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-neutral-800 bg-[#111111] text-[11px] font-mono text-neutral-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
          <Link
            href="/copy"
            className="text-black bg-orange-500 px-4 py-1.5 text-sm font-semibold hover:bg-orange-400 transition-colors"
          >
            Copy Trader →
          </Link>
        </div>
      </div>

      {empty ? (
        <div className="border border-neutral-800 bg-[#111111] p-8 text-center">
          <p className="text-neutral-500 font-mono text-sm">
            Could not reach Pacifica API — try again shortly.
          </p>
        </div>
      ) : (
        <>
          {/* ── Signal Intelligence strip ────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <RegimePanel  regime={regime} />
            <BreakoutPanel regime={regime} />
            <MoversPanel   regime={regime} />
          </div>

          <div className="mb-8">
            <ConsensusPanel consensus={consensus} />
          </div>

          {/* ── Main table (client) ─────────────────────────────────── */}
          <LeaderboardClient entries={entries} activePatterns={activePatterns} />

          {/* ── CLI hint ────────────────────────────────────────────── */}
          <div className="mt-8 border border-neutral-800 bg-[#0A0A0A] p-4 font-mono text-[12px]">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-red-500/60" />
              <span className="h-2 w-2 rounded-full bg-yellow-500/60" />
              <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
              <span className="ml-2 text-neutral-500 text-[10px] uppercase tracking-widest">
                / Same view in the CLI
              </span>
            </div>
            <div className="space-y-1 text-neutral-400">
              <p>
                <span className="text-orange-400">$</span> pacifica leaderboard --watch
                <span className="text-neutral-600 ml-3"># polls every 30s with delta highlighting</span>
              </p>
              <p>
                <span className="text-orange-400">$</span> pacifica leaderboard --filter rising
                <span className="text-neutral-600 ml-3"># only traders with accelerating 1D vs 7D</span>
              </p>
              <p>
                <span className="text-orange-400">$</span> pacifica leaderboard --limit 1 --live
                <span className="text-neutral-600 ml-3"># #1 trader with current book</span>
              </p>
            </div>
          </div>

          {/* ── Footer CTA ──────────────────────────────────────────── */}
          <div className="mt-6 relative border border-neutral-800 bg-[#111111] p-6">
            <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
            <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
            <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
            <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
            <p className="text-white font-semibold mb-1">Want the intelligence behind the ranks?</p>
            <p className="text-neutral-500 text-sm mb-4 font-mono">
              Reputation scoring, pattern replay, and on-chain PnL for every trader above.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/reputation"
                className="text-white px-3 py-1.5 text-sm font-medium border border-neutral-700 hover:border-orange-500/30 transition-colors"
              >
                Intelligence Ledger →
              </Link>
              <Link
                href="/patterns"
                className="text-white px-3 py-1.5 text-sm font-medium border border-neutral-700 hover:border-orange-500/30 transition-colors"
              >
                Pattern Library
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
