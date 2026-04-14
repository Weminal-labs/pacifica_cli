// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Arb P&L Accounting
// ---------------------------------------------------------------------------
// Helpers to calculate funding income and net P&L for arb positions.
// ---------------------------------------------------------------------------

import type { ArbPosition, ArbLifetimeStats } from "./types.js";

// ---------------------------------------------------------------------------
// Per-position calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the net P&L for a closed arb position.
 *
 * netPnl = realizedFundingUsd + realizedPnlUsd - totalFeesUsd
 */
export function calculateNetPnl(position: ArbPosition): number {
  return position.realizedFundingUsd + position.realizedPnlUsd - position.totalFeesUsd;
}

/**
 * Calculate annualized return on capital for a position.
 * Returns null if the position has no notional or duration.
 */
export function calculateAnnualizedReturn(position: ArbPosition): number | null {
  if (!position.closedAt || position.notionalUsd <= 0) return null;

  const openMs = new Date(position.openedAt).getTime();
  const closeMs = new Date(position.closedAt).getTime();
  const durationMs = closeMs - openMs;
  if (durationMs <= 0) return null;

  const netPnl = calculateNetPnl(position);
  const daysHeld = durationMs / (1000 * 60 * 60 * 24);
  const dailyReturn = netPnl / position.notionalUsd / daysHeld;
  return dailyReturn * 365 * 100; // annualized %
}

/**
 * Calculate expected funding for one 8h interval based on entry rate.
 */
export function expectedFundingPerInterval(position: ArbPosition): number {
  return position.notionalUsd * Math.abs(position.entryRate);
}

// ---------------------------------------------------------------------------
// Lifetime stats
// ---------------------------------------------------------------------------

/**
 * Rebuild lifetime stats from a complete position history.
 * Call after loading state from disk to ensure consistency.
 */
export function rebuildLifetimeStats(
  positions: ArbPosition[],
  existingStats: ArbLifetimeStats,
): ArbLifetimeStats {
  const closed = positions.filter((p) => p.status === "closed");

  const totalFundingCollectedUsd = closed.reduce(
    (sum, p) => sum + p.realizedFundingUsd,
    0,
  );
  const totalFeesPaidUsd = closed.reduce((sum, p) => sum + p.totalFeesUsd, 0);
  const totalNetPnlUsd = closed.reduce((sum, p) => sum + calculateNetPnl(p), 0);

  return {
    ...existingStats,
    totalFundingCollectedUsd,
    totalFeesPaidUsd,
    totalNetPnlUsd,
    positionsOpened: existingStats.positionsOpened,
    positionsClosed: closed.length,
  };
}

/**
 * Check whether the daily loss limit has been reached.
 * Resets the counter if we're on a new calendar day.
 */
export function checkDailyLossLimit(
  stats: ArbLifetimeStats,
  maxDailyLossUsd: number,
): { exceeded: boolean; stats: ArbLifetimeStats } {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let updated = { ...stats };

  if (updated.dailyLossResetDate !== today) {
    updated = {
      ...updated,
      dailyLossUsd: 0,
      dailyLossResetDate: today,
    };
  }

  return {
    exceeded: updated.dailyLossUsd >= maxDailyLossUsd,
    stats: updated,
  };
}

/**
 * Record a realized loss into the daily loss counter.
 */
export function recordDailyLoss(
  stats: ArbLifetimeStats,
  lossUsd: number,
): ArbLifetimeStats {
  if (lossUsd <= 0) return stats;
  return {
    ...stats,
    dailyLossUsd: stats.dailyLossUsd + lossUsd,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export interface ArbPnlSummary {
  totalFundingCollectedUsd: number;
  totalFeesPaidUsd: number;
  totalNetPnlUsd: number;
  positionsOpened: number;
  positionsClosed: number;
  activePositions: number;
  winRate: number; // % of closed positions that were net positive
  avgFundingPerPosition: number;
}

/**
 * Build a summary object for display / MCP tool output.
 */
export function buildPnlSummary(
  positions: ArbPosition[],
  lifetime: ArbLifetimeStats,
): ArbPnlSummary {
  const closed = positions.filter((p) => p.status === "closed");
  const active = positions.filter(
    (p) => p.status === "active" || p.status === "pending",
  );

  const winners = closed.filter((p) => calculateNetPnl(p) > 0);
  const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;
  const avgFundingPerPosition =
    closed.length > 0
      ? closed.reduce((sum, p) => sum + p.realizedFundingUsd, 0) / closed.length
      : 0;

  return {
    totalFundingCollectedUsd: lifetime.totalFundingCollectedUsd,
    totalFeesPaidUsd: lifetime.totalFeesPaidUsd,
    totalNetPnlUsd: lifetime.totalNetPnlUsd,
    positionsOpened: lifetime.positionsOpened,
    positionsClosed: lifetime.positionsClosed,
    activePositions: active.length,
    winRate,
    avgFundingPerPosition,
  };
}
