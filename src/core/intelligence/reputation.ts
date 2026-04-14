// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Trader Reputation Engine
// ---------------------------------------------------------------------------
// Computes anonymised reputation scores from a set of IntelligenceRecords.
// Scores are 0–100 and blend win rate, condition breadth, and trade count.
// ---------------------------------------------------------------------------

import type {
  IntelligenceRecord,
  TraderReputation,
  ConditionAccuracy,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Score formula constants
// ---------------------------------------------------------------------------

// 50% weight: overall_win_rate * 50
// 30% weight: min(30, log(conditions_count + 1) / log(10) * 30)
// 20% weight: min(20, log10(max(1, closed_count)) / log10(500) * 20)

function computeRepScore(
  overallWinRate: number,
  conditionCount: number,
  closedCount: number,
): number {
  const winComponent = overallWinRate * 50;
  const breadthComponent = Math.min(
    30,
    (Math.log(conditionCount + 1) / Math.log(10)) * 30,
  );
  const countComponent = Math.min(
    20,
    (Math.log10(Math.max(1, closedCount)) / Math.log10(500)) * 20,
  );
  return Math.round(winComponent + breadthComponent + countComponent);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute trader reputation for every unique trader appearing in `records`.
 *
 * Only closed records (with an outcome) contribute to win rate and condition
 * accuracy.  Open records are counted toward total_trades only.
 */
export function computeReputation(
  records: IntelligenceRecord[],
): Map<string, TraderReputation> {
  // Group records by trader_id
  const byTrader = new Map<string, IntelligenceRecord[]>();
  for (const record of records) {
    const list = byTrader.get(record.trader_id);
    if (list === undefined) {
      byTrader.set(record.trader_id, [record]);
    } else {
      list.push(record);
    }
  }

  const now = new Date().toISOString();
  const repMap = new Map<string, TraderReputation>();

  for (const [traderId, traderRecords] of byTrader) {
    const closed = traderRecords.filter((r) => r.outcome !== undefined);

    // -----------------------------------------------------------------------
    // Build per-condition (pattern_tag) accuracy breakdown
    // -----------------------------------------------------------------------
    const byCondition: Record<string, ConditionAccuracy> = {};

    // Collect all unique pattern tags across this trader's closed records
    const allTags = new Set<string>();
    for (const r of closed) {
      for (const tag of r.pattern_tags) {
        allTags.add(tag);
      }
    }

    for (const tag of allTags) {
      const matching = closed.filter((r) => r.pattern_tags.includes(tag));
      const profitable = matching.filter((r) => r.outcome!.profitable);
      const tagWinRate =
        matching.length > 0 ? profitable.length / matching.length : 0;
      const tagAvgPnl =
        matching.length > 0
          ? matching.reduce((s, r) => s + r.outcome!.pnl_pct, 0) /
            matching.length
          : 0;

      byCondition[tag] = {
        condition_key: tag,
        total_trades: matching.length,
        profitable_trades: profitable.length,
        win_rate: tagWinRate,
        avg_pnl_pct: tagAvgPnl,
        last_updated: now,
      };
    }

    // -----------------------------------------------------------------------
    // Overall win rate
    // -----------------------------------------------------------------------
    const overallWinRate =
      closed.length > 0
        ? closed.filter((r) => r.outcome!.profitable).length / closed.length
        : 0;

    // -----------------------------------------------------------------------
    // Rep score
    // -----------------------------------------------------------------------
    const repScore = computeRepScore(
      overallWinRate,
      Object.keys(byCondition).length,
      closed.length,
    );

    // -----------------------------------------------------------------------
    // Top patterns: top 3 condition keys by win_rate with >= 3 trades
    // -----------------------------------------------------------------------
    const top_patterns = Object.entries(byCondition)
      .filter(([, acc]) => acc.total_trades >= 3)
      .sort((a, b) => b[1].win_rate - a[1].win_rate)
      .slice(0, 3)
      .map(([key]) => key);

    repMap.set(traderId, {
      trader_id: traderId,
      total_trades: traderRecords.length,
      closed_trades: closed.length,
      overall_win_rate: overallWinRate,
      overall_rep_score: repScore,
      accuracy_by_condition: byCondition,
      top_patterns,
      last_updated: now,
    });
  }

  return repMap;
}
