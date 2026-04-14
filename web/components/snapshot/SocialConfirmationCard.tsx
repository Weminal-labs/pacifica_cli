"use client";

// ---------------------------------------------------------------------------
// SocialConfirmationCard — Market Snapshot page
// Shows social confirmation alongside the onchain pattern match result.
// ---------------------------------------------------------------------------

import type { SocialData, SignalConfidence } from "../../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceStyles(c: SignalConfidence): {
  label: string;
  ring: string;
  badge: string;
  text: string;
} {
  switch (c) {
    case "high":
      return {
        label: "HIGH CONFIDENCE",
        ring: "border-green-500/40",
        badge: "bg-green-500/10 text-green-400 border border-green-500/30",
        text: "text-green-400",
      };
    case "medium":
      return {
        label: "MEDIUM CONFIDENCE",
        ring: "border-[#F97316]/40",
        badge: "bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30",
        text: "text-[#F97316]",
      };
    case "low":
      return {
        label: "LOW CONFIDENCE",
        ring: "border-[#6B7280]/30",
        badge: "bg-[#6B7280]/10 text-[#6B7280] border border-[#6B7280]/30",
        text: "text-[#6B7280]",
      };
    case "unconfirmed":
      return {
        label: "UNCONFIRMED — WAIT",
        ring: "border-yellow-500/40",
        badge: "bg-yellow-500/10 text-yellow-500 border border-yellow-500/30",
        text: "text-yellow-500",
      };
  }
}

function velocityWidth(v: number): string {
  return `${Math.min(100, (v / 5) * 100).toFixed(0)}%`;
}

function sentimentDot(s: "bullish" | "bearish" | "neutral"): string {
  if (s === "bullish") return "bg-green-400";
  if (s === "bearish") return "bg-red-400";
  return "bg-[#6B7280]";
}

// ---------------------------------------------------------------------------
// Demo fallback data
// ---------------------------------------------------------------------------

function getDemoSocialData(market: string): SocialData {
  return {
    asset: market,
    social: {
      mention_velocity: 3.4,
      sentiment: "bullish",
      smart_follower_score: 0.78,
      narrative_tags: ["Q2 accumulation", "ETH ETF inflows", "restaking"],
      top_post_snippets: [
        "ETH negative funding with rising OI — classic setup before a squeeze",
        "Smart money accumulating at these levels structurally",
      ],
      fetched_at: new Date(Date.now() - 180_000).toISOString(),
      source: "elfa",
    },
    confirmed_signals: [
      {
        pattern_name: "Negative Funding + Rising OI",
        pattern_id: "pat_demo1",
        win_rate: 0.723,
        confidence: "high",
        reason: "Pattern 72% + bullish social spike 3.4× + smart follower 78%",
      },
    ],
    best_signal: {
      pattern_name: "Negative Funding + Rising OI",
      pattern_id: "pat_demo1",
      win_rate: 0.723,
      confidence: "high",
      reason: "Pattern 72% + bullish social spike 3.4× + smart follower 78%",
    },
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface Props {
  market: string;
  socialData?: SocialData | null;
  /** If true, renders demo data regardless of socialData prop. */
  useDemo?: boolean;
}

export function SocialConfirmationCard({ market, socialData, useDemo }: Props) {
  const data = (useDemo || !socialData) ? getDemoSocialData(market) : socialData;
  const { social, best_signal } = data;
  const styles = best_signal ? confidenceStyles(best_signal.confidence) : confidenceStyles("low");

  return (
    <div className={`bg-[#141414] border ${styles.ring} rounded-xl p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#6B7280] font-semibold tracking-widest uppercase mb-1">
            Social Confirmation <span className="text-[#374151]">• via Elfa</span>
          </p>
          {best_signal ? (
            <p className="text-white text-sm font-semibold">
              Matches: <span className="text-white/80">{best_signal.pattern_name}</span>
            </p>
          ) : (
            <p className="text-[#6B7280] text-sm">No pattern match in current conditions</p>
          )}
        </div>
        {best_signal && (
          <span className={`text-xs font-bold px-2 py-1 rounded ${styles.badge}`}>
            {styles.label}
          </span>
        )}
      </div>

      {/* Mention velocity */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-[#6B7280]">Mention velocity</span>
          <span className={`text-[11px] font-bold ${social.mention_velocity >= 2 ? "text-[#F97316]" : "text-[#9CA3AF]"}`}>
            {social.mention_velocity.toFixed(1)}× baseline
          </span>
        </div>
        <div className="h-1.5 bg-[#1F1F1F] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${social.mention_velocity >= 2 ? "bg-[#F97316]" : "bg-[#374151]"}`}
            style={{ width: velocityWidth(social.mention_velocity) }}
          />
        </div>
      </div>

      {/* Smart sentiment */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#6B7280]">Smart sentiment</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${sentimentDot(social.sentiment)}`} />
          <span className="text-[11px] text-white font-bold uppercase">{social.sentiment}</span>
          <span className="text-[11px] text-[#6B7280]">
            ({(social.smart_follower_score * 100).toFixed(0)}% smart score)
          </span>
        </div>
      </div>

      {/* Narratives */}
      {social.narrative_tags.length > 0 && (
        <div>
          <p className="text-[11px] text-[#6B7280] mb-1.5">Trending narratives</p>
          <div className="flex flex-wrap gap-1.5">
            {social.narrative_tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 bg-[#1C1C1C] border border-[#1F1F1F] rounded-full text-[#9CA3AF]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Confidence reason */}
      {best_signal && (
        <div className={`text-xs ${styles.text} border-t border-[#1F1F1F] pt-3 leading-relaxed`}>
          {best_signal.reason}
        </div>
      )}
    </div>
  );
}
