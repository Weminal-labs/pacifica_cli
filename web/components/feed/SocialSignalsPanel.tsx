"use client";

// ---------------------------------------------------------------------------
// SocialSignalsPanel — Intelligence Feed page social section
// Powered by Elfa API: mention velocity, smart-follower sentiment, narratives
// ---------------------------------------------------------------------------

import { OrangeLabel } from "../ui/OrangeLabel";
import type { SocialData, SocialSentiment, SignalConfidence } from "../../lib/types";

// ---------------------------------------------------------------------------
// Demo data (shown when API is offline or Elfa not configured)
// ---------------------------------------------------------------------------

const DEMO_SOCIAL: Record<string, SocialData> = {
  ETH: {
    asset: "ETH",
    social: {
      mention_velocity: 3.4,
      sentiment: "bullish",
      smart_follower_score: 0.78,
      narrative_tags: ["Q2 accumulation", "ETH ETF inflows", "restaking"],
      top_post_snippets: [
        "ETH negative funding with rising OI — classic setup before a squeeze",
        "Accumulating ETH here, structurally very different from last month",
        "Smart money has been loading ETH for 3 weeks now",
      ],
      fetched_at: new Date(Date.now() - 180_000).toISOString(),
      source: "elfa",
    },
    confirmed_signals: [
      { pattern_name: "Negative Funding + Rising OI", pattern_id: "pat_demo1", win_rate: 0.723, confidence: "high", reason: "Pattern 72% + bullish social spike 3.4× + smart follower 78%" },
    ],
    best_signal: { pattern_name: "Negative Funding + Rising OI", pattern_id: "pat_demo1", win_rate: 0.723, confidence: "high", reason: "Pattern 72% + bullish social spike 3.4× + smart follower 78%" },
    generated_at: new Date().toISOString(),
  },
  BTC: {
    asset: "BTC",
    social: {
      mention_velocity: 2.1,
      sentiment: "bullish",
      smart_follower_score: 0.71,
      narrative_tags: ["BTC halving cycle", "institutional inflows"],
      top_post_snippets: [
        "BTC dominance climbing, rotation into BTC makes sense here",
        "Halving supply shock still underappreciated by the market",
      ],
      fetched_at: new Date(Date.now() - 300_000).toISOString(),
      source: "elfa",
    },
    confirmed_signals: [
      { pattern_name: "Whale Activity + Bullish Momentum", pattern_id: "pat_demo2", win_rate: 0.681, confidence: "medium", reason: "Pattern 68% + partial social confirmation" },
    ],
    best_signal: { pattern_name: "Whale Activity + Bullish Momentum", pattern_id: "pat_demo2", win_rate: 0.681, confidence: "medium", reason: "Pattern 68% + partial social confirmation" },
    generated_at: new Date().toISOString(),
  },
  SOL: {
    asset: "SOL",
    social: {
      mention_velocity: 1.2,
      sentiment: "neutral",
      smart_follower_score: 0.51,
      narrative_tags: [],
      top_post_snippets: ["SOL volume quiet today, watching for a break"],
      fetched_at: new Date(Date.now() - 240_000).toISOString(),
      source: "elfa",
    },
    confirmed_signals: [],
    best_signal: null,
    generated_at: new Date().toISOString(),
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sentimentColor(s: SocialSentiment): string {
  if (s === "bullish") return "text-green-400";
  if (s === "bearish") return "text-red-400";
  return "text-[#6B7280]";
}

function sentimentIcon(s: SocialSentiment): string {
  if (s === "bullish") return "▲";
  if (s === "bearish") return "▼";
  return "—";
}

function velocityBar(v: number): number {
  // 1x = 20%, 5x = 100%
  return Math.min(100, (v / 5) * 100);
}

function confidenceBadge(c: SignalConfidence): { label: string; cls: string } {
  switch (c) {
    case "high":        return { label: "HIGH", cls: "text-green-400 bg-green-400/10 border-green-400/30" };
    case "medium":      return { label: "MED", cls: "text-accent bg-accent/10 border-accent/30" };
    case "low":         return { label: "LOW", cls: "text-[#6B7280] bg-[#6B7280]/10 border-[#6B7280]/30" };
    case "unconfirmed": return { label: "WAIT", cls: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" };
  }
}

function formatAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// Ticker row component
// ---------------------------------------------------------------------------

function TickerRow({ ticker, data }: { ticker: string; data: SocialData }) {
  const { social, best_signal } = data;
  const badge = best_signal ? confidenceBadge(best_signal.confidence) : null;

  return (
    <div className="flex items-start gap-4 p-4 bg-[#141414] border border-[#1F1F1F] rounded-lg">
      {/* Ticker + velocity */}
      <div className="w-16 shrink-0">
        <p className="text-white font-bold text-sm">{ticker}</p>
        <p className={`text-xs font-semibold mt-0.5 ${social.mention_velocity >= 2 ? "text-accent" : "text-[#6B7280]"}`}>
          {social.mention_velocity.toFixed(1)}× vel
        </p>
      </div>

      {/* Velocity bar */}
      <div className="flex-1 pt-1.5">
        <div className="h-1.5 bg-[#1F1F1F] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              social.mention_velocity >= 2 ? "bg-accent" : "bg-[#374151]"
            }`}
            style={{ width: `${velocityBar(social.mention_velocity)}%` }}
          />
        </div>
        {/* Narratives */}
        {social.narrative_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {social.narrative_tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 bg-[#1C1C1C] border border-[#1F1F1F] rounded text-[#9CA3AF]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sentiment + confidence */}
      <div className="text-right shrink-0 space-y-1">
        <p className={`text-xs font-bold uppercase ${sentimentColor(social.sentiment)}`}>
          {sentimentIcon(social.sentiment)} {social.sentiment}
        </p>
        <p className="text-[10px] text-[#6B7280]">
          {(social.smart_follower_score * 100).toFixed(0)}% smart
        </p>
        {badge && (
          <span className={`inline-block text-[10px] px-1.5 py-0.5 border rounded font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface Props {
  /** Map of ticker → SocialData. Falls back to DEMO_SOCIAL if empty. */
  socialData?: Record<string, SocialData>;
}

export function SocialSignalsPanel({ socialData }: Props) {
  const data = (socialData && Object.keys(socialData).length > 0)
    ? socialData
    : DEMO_SOCIAL;

  const tickers = Object.keys(data);

  return (
    <section className="max-w-6xl mx-auto px-6 pb-16">
      <div className="flex items-start justify-between mb-6">
        <div>
          <OrangeLabel text="/ SOCIAL INTELLIGENCE" />
          <h2 className="text-2xl font-bold text-white mt-2">
            Narrative layer — powered by Elfa
          </h2>
          <p className="text-[#6B7280] text-sm mt-1">
            Smart-follower sentiment + mention velocity + trending narratives
          </p>
        </div>
        <span className="text-[10px] text-[#6B7280] border border-[#1F1F1F] px-2 py-1 rounded mt-1 shrink-0">
          via elfa.ai
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tickers.map((ticker) => (
          <TickerRow key={ticker} ticker={ticker} data={data[ticker]!} />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-[#6B7280]">
        <span>vel = mention velocity vs 24h baseline</span>
        <span>smart = smart-follower score</span>
        <span className="text-green-400/70">HIGH = onchain pattern + social confirmed</span>
        <span className="text-accent/70">MED = partial confirmation</span>
        <span className="text-yellow-500/70">WAIT = conflicting signals</span>
      </div>
    </section>
  );
}
