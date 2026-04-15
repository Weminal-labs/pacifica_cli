// ---------------------------------------------------------------------------
// Intelligence overlay joins for Pacifica positions (T-81)
// Joins live positions with patterns, rep signals, and funding context.
// ---------------------------------------------------------------------------

import { loadPatterns, loadRecords, loadReputation } from "../core/intelligence/store.js";
import type { DetectedPattern, IntelligenceRecord, TraderReputation } from "../core/intelligence/schema.js";
import type { PacificaPosition, PacificaFundingPoint } from "./pacifica-client.js";

export interface FundingWatch {
  current_rate: number;
  trend: "rising" | "falling" | "flat";
  next_settlement_ms: number;
}

export interface RepSignal {
  count: number;
  top_traders: string[];
}

export interface PatternMatchOverlay {
  pattern_id: string;
  pattern_name: string;
  win_rate: number;
  sample_size: number;
}

export interface PositionOverlay {
  pattern_match: PatternMatchOverlay | null;
  rep_signal: RepSignal | null;
  funding_watch: FundingWatch | null;
}

// ── Funding trend ─────────────────────────────────────────────────────────

export function computeFundingTrend(
  points: PacificaFundingPoint[],
): "rising" | "falling" | "flat" {
  if (points.length < 2) return "flat";
  // Compare last 3 points vs previous 3
  const recent = points.slice(-3).map((p) => parseFloat(p.rate));
  const older  = points.slice(-6, -3).map((p) => parseFloat(p.rate));
  if (older.length === 0) return "flat";
  const avgRecent = recent.reduce((s, r) => s + r, 0) / recent.length;
  const avgOlder  = older.reduce((s, r) => s + r, 0) / older.length;
  const diff = avgRecent - avgOlder;
  if (Math.abs(diff) < 0.00001) return "flat";
  return diff > 0 ? "rising" : "falling";
}

// ── Next 8h settlement ────────────────────────────────────────────────────

function nextSettlementMs(): number {
  const now = Date.now();
  const ms8h = 8 * 60 * 60 * 1000;
  const epoch = Math.floor(now / ms8h);
  return (epoch + 1) * ms8h;
}

// ── Compute overlay for a single position ────────────────────────────────

export async function computeOverlay(
  position: PacificaPosition,
  fundingPoints: PacificaFundingPoint[],
  preloadedPatterns?: DetectedPattern[],
  preloadedRecords?: IntelligenceRecord[],
  preloadedRep?: Map<string, TraderReputation>,
): Promise<PositionOverlay> {
  const [patterns, records, rep] = preloadedPatterns && preloadedRecords && preloadedRep
    ? [preloadedPatterns, preloadedRecords, preloadedRep]
    : await Promise.all([loadPatterns(), loadRecords(), loadReputation()]);

  const asset = position.symbol.split("-")[0].toUpperCase();

  // ── Pattern match ──────────────────────────────────────────────────────
  const matching = patterns
    .filter(
      (p) =>
        p.verified &&
        p.primary_assets.some((a) => a.toUpperCase().includes(asset)),
    )
    .sort((a, b) => b.win_rate - a.win_rate);

  const pattern_match = matching[0]
    ? {
        pattern_id:   matching[0].id,
        pattern_name: matching[0].name,
        win_rate:     matching[0].win_rate,
        sample_size:  matching[0].sample_size,
      }
    : null;

  // ── Rep signal ─────────────────────────────────────────────────────────
  const openSameDirection = records.filter((r) => {
    if (r.closed_at !== undefined) return false;
    const rAsset = r.asset.split("-")[0].toUpperCase();
    if (rAsset !== asset) return false;
    if (r.direction !== position.side) return false;
    const trader = rep.get(r.trader_id);
    return trader !== undefined && trader.overall_rep_score > 70;
  });

  const rep_signal: RepSignal | null =
    openSameDirection.length > 0
      ? {
          count:       openSameDirection.length,
          top_traders: openSameDirection
            .sort((a, b) => {
              const rA = rep.get(a.trader_id)?.overall_rep_score ?? 0;
              const rB = rep.get(b.trader_id)?.overall_rep_score ?? 0;
              return rB - rA;
            })
            .slice(0, 3)
            .map((r) => r.trader_id),
        }
      : null;

  // ── Funding watch ──────────────────────────────────────────────────────
  const current_rate =
    fundingPoints.length > 0
      ? parseFloat(fundingPoints[fundingPoints.length - 1].rate)
      : 0;

  const funding_watch: FundingWatch | null =
    fundingPoints.length > 0
      ? {
          current_rate,
          trend: computeFundingTrend(fundingPoints),
          next_settlement_ms: nextSettlementMs(),
        }
      : null;

  return { pattern_match, rep_signal, funding_watch };
}
