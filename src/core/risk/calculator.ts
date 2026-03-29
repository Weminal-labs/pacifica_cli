// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Risk Calculator
// ---------------------------------------------------------------------------
// Shared risk-calculation logic used by the heatmap command and MCP tools.
// All functions are pure -- they accept data and return computed results
// without side effects or network calls.
// ---------------------------------------------------------------------------

import type { Position, Market, Account } from "../sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Risk assessment for a single position. */
export interface PositionRisk {
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice?: number;
  pnlUsd: number;
  pnlPercent: number;
  liqDistancePercent?: number;
  margin: number;
  leverage: number;
  riskLevel: "ok" | "watch" | "danger";
}

/** Aggregated risk summary across all positions. */
export interface RiskSummary {
  totalPositions: number;
  totalPnl: number;
  totalMargin: number;
  marginUsedPercent: number;
  closestToLiq?: { symbol: string; distance: number };
  positions: PositionRisk[];
}

// ---------------------------------------------------------------------------
// Risk-level thresholds
// ---------------------------------------------------------------------------

const DANGER_THRESHOLD = 5; // < 5% distance to liquidation
const WATCH_THRESHOLD = 10; // < 10% distance to liquidation

// ---------------------------------------------------------------------------
// Position-level risk calculation
// ---------------------------------------------------------------------------

/**
 * Calculate risk metrics for a single position given the current mark price.
 *
 * - PnL:  long -> (mark - entry) * amount
 *         short -> (entry - mark) * amount
 * - PnL%: pnlUsd / margin * 100
 * - Liq distance: |mark - liq| / mark * 100
 * - Leverage (approximate): entryPrice * amount / margin
 * - Risk level:
 *     < 5%  distance -> "danger"
 *     < 10% distance -> "watch"
 *     >= 10%         -> "ok"
 */
export function calculatePositionRisk(
  position: Position,
  markPrice: number,
): PositionRisk {
  // PnL calculation
  const pnlUsd =
    position.side === "long"
      ? (markPrice - position.entryPrice) * position.amount
      : (position.entryPrice - markPrice) * position.amount;

  // PnL as percentage of margin
  const pnlPercent =
    position.margin !== 0 ? (pnlUsd / position.margin) * 100 : 0;

  // Liquidation distance
  let liqDistancePercent: number | undefined;
  if (
    position.liquidationPrice !== undefined &&
    position.liquidationPrice > 0 &&
    markPrice > 0
  ) {
    liqDistancePercent =
      (Math.abs(markPrice - position.liquidationPrice) / markPrice) * 100;
  }

  // Approximate leverage
  const leverage =
    position.margin !== 0
      ? (position.entryPrice * position.amount) / position.margin
      : 0;

  // Risk level based on liquidation distance
  let riskLevel: "ok" | "watch" | "danger";
  if (liqDistancePercent === undefined) {
    // No liquidation price available -- assume OK but cannot assess
    riskLevel = "ok";
  } else if (liqDistancePercent < DANGER_THRESHOLD) {
    riskLevel = "danger";
  } else if (liqDistancePercent < WATCH_THRESHOLD) {
    riskLevel = "watch";
  } else {
    riskLevel = "ok";
  }

  return {
    symbol: position.symbol,
    side: position.side,
    size: position.amount,
    entryPrice: position.entryPrice,
    markPrice,
    liquidationPrice: position.liquidationPrice,
    pnlUsd,
    pnlPercent,
    liqDistancePercent,
    margin: position.margin,
    leverage: parseFloat(leverage.toFixed(2)),
    riskLevel,
  };
}

// ---------------------------------------------------------------------------
// Portfolio-level risk summary
// ---------------------------------------------------------------------------

/**
 * Build a full risk summary across all open positions.
 *
 * Looks up each position's mark price from the markets list, computes
 * individual risk, then aggregates totals and finds the position closest
 * to liquidation.
 */
export function calculateRiskSummary(
  positions: Position[],
  markets: Market[],
  account: Account,
): RiskSummary {
  // Build mark-price lookup
  const markPriceMap = new Map<string, number>();
  for (const m of markets) {
    markPriceMap.set(m.symbol, m.markPrice);
  }

  // Calculate risk for each position
  const positionRisks: PositionRisk[] = positions.map((p) => {
    const markPrice = markPriceMap.get(p.symbol) ?? p.entryPrice;
    return calculatePositionRisk(p, markPrice);
  });

  // Aggregate totals
  let totalPnl = 0;
  let totalMargin = 0;
  let closestToLiq: { symbol: string; distance: number } | undefined;

  for (const risk of positionRisks) {
    totalPnl += risk.pnlUsd;
    totalMargin += risk.margin;

    if (risk.liqDistancePercent !== undefined) {
      if (
        closestToLiq === undefined ||
        risk.liqDistancePercent < closestToLiq.distance
      ) {
        closestToLiq = {
          symbol: risk.symbol,
          distance: risk.liqDistancePercent,
        };
      }
    }
  }

  // Margin used as percentage of account equity
  const marginUsedPercent =
    account.accountEquity > 0
      ? (account.totalMarginUsed / account.accountEquity) * 100
      : 0;

  return {
    totalPositions: positions.length,
    totalPnl,
    totalMargin,
    marginUsedPercent: parseFloat(marginUsedPercent.toFixed(2)),
    closestToLiq,
    positions: positionRisks,
  };
}
