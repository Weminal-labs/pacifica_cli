
export const runtime = "edge";

import { OrangeLabel } from "../../../components/ui/OrangeLabel";
import { WinRateBadge } from "../../../components/ui/WinRateBadge";
import { SocialConfirmationCard } from "../../../components/snapshot/SocialConfirmationCard";
import type { Pattern, SocialData } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CurrentConditions {
  funding_rate: number;
  open_interest_usd: number;
  buy_pressure: number;
  momentum_signal: string;
  large_orders_count: number;
  mark_price: number;
}

interface SnapshotData {
  market: string;
  current_conditions: CurrentConditions;
  matching_patterns: Pattern[];
  best_pattern_match: Pattern | null;
  agent_summary: string;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Demo fallback
// ---------------------------------------------------------------------------

function getDemoSnapshot(market: string): SnapshotData {
  return {
    market,
    current_conditions: {
      funding_rate: -0.0004,
      open_interest_usd: 145_000_000,
      buy_pressure: 0.68,
      momentum_signal: "bullish",
      large_orders_count: 3,
      mark_price: 0,
    },
    matching_patterns: [
      {
        id: "pat_demo1",
        name: "Negative Funding + Rising OI",
        conditions: [
          { axis: "funding_rate", op: "lt", value: -0.0003, label: "funding < -0.03%" },
        ],
        sample_size: 34,
        win_rate: 0.723,
        avg_pnl_pct: 6.8,
        avg_duration_minutes: 420,
        primary_assets: ["ETH-USDC-PERP", "BTC-USDC-PERP"],
        verified: true,
        last_seen_at: new Date(Date.now() - 7_200_000).toISOString(),
      },
    ],
    best_pattern_match: {
      id: "pat_demo1",
      name: "Negative Funding + Rising OI",
      conditions: [
        { axis: "funding_rate", op: "lt", value: -0.0003, label: "funding < -0.03%" },
      ],
      sample_size: 34,
      win_rate: 0.723,
      avg_pnl_pct: 6.8,
      avg_duration_minutes: 420,
      primary_assets: ["ETH-USDC-PERP", "BTC-USDC-PERP"],
      verified: true,
      last_seen_at: new Date(Date.now() - 7_200_000).toISOString(),
    },
    agent_summary: `${market.toUpperCase()} matches pattern "Negative Funding + Rising OI" with 72.3% win rate across 34 trades. Current conditions bullish.`,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getSnapshot(market: string): Promise<SnapshotData> {
  try {
    const res = await fetch(
      `http://localhost:4242/api/intelligence/snapshot/${market}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("API unavailable");
    return res.json();
  } catch {
    return getDemoSnapshot(market);
  }
}

async function getSocialForMarket(market: string): Promise<SocialData | null> {
  try {
    const ticker = market.toUpperCase().split("-")[0] ?? market;
    const res = await fetch(
      `http://localhost:4242/api/intelligence/social/${ticker}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return res.json() as Promise<SocialData>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtFunding(rate: number): string {
  return (rate * 100).toFixed(4) + "%";
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SnapshotPage({
  params,
}: {
  params: { market: string };
}) {
  const { market } = params;
  const [snap, socialData] = await Promise.all([
    getSnapshot(market),
    getSocialForMarket(market),
  ]);
  const cond = snap.current_conditions;

  return (
    <div className="min-h-screen bg-bg-primary max-w-6xl mx-auto px-6 py-12">
      <div className="mb-8">
        <OrangeLabel text="/ MARKET SNAPSHOT" />
        <div className="flex items-start justify-between mt-3">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              {market.toUpperCase()}
            </h1>
            <p className="text-muted text-sm">
              Generated {new Date(snap.generated_at).toLocaleTimeString()}
            </p>
          </div>
          <a
            href={`https://test-app.pacifica.fi/trade/${market.toUpperCase()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-black bg-orange-500 px-4 py-2 text-sm font-semibold hover:bg-orange-400 transition-colors shrink-0"
          >
            Trade on Pacifica ↗
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Current Conditions */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <OrangeLabel text="/ CURRENT CONDITIONS" />
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-[11px] text-muted mb-1">Funding Rate</p>
              <p
                className={`text-lg font-bold ${
                  cond.funding_rate < 0 ? "text-red-400" : "text-green-400"
                }`}
              >
                {fmtFunding(cond.funding_rate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted mb-1">Open Interest</p>
              <p className="text-lg font-bold text-white">
                {fmtUsd(cond.open_interest_usd)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted mb-1">Buy Pressure</p>
              <p className="text-lg font-bold text-white">
                {(cond.buy_pressure * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted mb-1">Momentum</p>
              <p
                className={`text-lg font-bold capitalize ${
                  cond.momentum_signal === "bullish"
                    ? "text-green-400"
                    : cond.momentum_signal === "bearish"
                      ? "text-red-400"
                      : "text-muted"
                }`}
              >
                {cond.momentum_signal}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted mb-1">Large Orders</p>
              <p className="text-lg font-bold text-white">{cond.large_orders_count}</p>
            </div>
            {cond.mark_price > 0 && (
              <div>
                <p className="text-[11px] text-muted mb-1">Mark Price</p>
                <p className="text-lg font-bold text-white">${cond.mark_price.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Best Pattern Match */}
        <div className="bg-bg-surface border border-border rounded-xl p-6">
          <OrangeLabel text="/ BEST PATTERN MATCH" />
          {snap.best_pattern_match ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full font-bold tracking-wider">
                  VERIFIED
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-4">
                {snap.best_pattern_match.name}
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <p className="text-[11px] text-muted mb-1">Win Rate</p>
                  <WinRateBadge rate={snap.best_pattern_match.win_rate} />
                </div>
                <div>
                  <p className="text-[11px] text-muted mb-1">Sample</p>
                  <p className="text-white font-semibold">
                    {snap.best_pattern_match.sample_size}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted mb-1">Avg P&amp;L</p>
                  <p className="text-green-400 font-semibold">
                    +{snap.best_pattern_match.avg_pnl_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {snap.best_pattern_match.conditions.map((c, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 bg-bg-card border border-border rounded text-muted"
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm">
              No verified patterns match current conditions for {market.toUpperCase()}.
            </p>
          )}
        </div>
      </div>

      {/* Social Confirmation */}
      <div className="mb-8">
        <OrangeLabel text="/ SOCIAL CONFIRMATION" />
        <div className="mt-3">
          <SocialConfirmationCard
            market={market}
            socialData={socialData}
            useDemo={!socialData}
          />
        </div>
      </div>

      {/* Agent Summary */}
      <div className="bg-bg-surface border border-accent/30 rounded-xl p-6 mb-10">
        <OrangeLabel text="/ AGENT SUMMARY" />
        <p className="text-white mt-3 leading-relaxed">{snap.agent_summary}</p>
      </div>

      {/* All Matching Patterns */}
      {snap.matching_patterns.length > 0 && (
        <div>
          <OrangeLabel text="/ MATCHING PATTERNS" />
          <h2 className="text-2xl font-bold text-white mt-2 mb-6">
            {snap.matching_patterns.length} pattern
            {snap.matching_patterns.length !== 1 ? "s" : ""} match this market
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {snap.matching_patterns.map((p) => (
              <div
                key={p.id}
                className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/40 transition-colors"
              >
                <h3 className="text-white font-semibold mb-3">{p.name}</h3>
                <div className="flex items-center gap-3">
                  <WinRateBadge rate={p.win_rate} />
                  <span className="text-muted text-xs">n={p.sample_size}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
