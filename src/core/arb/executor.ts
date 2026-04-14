// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Arb Executor
// ---------------------------------------------------------------------------
// Entry and exit order wrappers for arb positions.
// Uses idempotent client_order_id to prevent double-fills on retry.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import type { PacificaClient } from "../sdk/client.js";
import type { ArbOpportunity, ArbLeg, ArbPosition } from "./types.js";
import type { ArbConfig } from "../config/types.js";

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export interface EntryResult {
  success: boolean;
  leg?: ArbLeg;
  error?: string;
}

/**
 * Enter a funding collection position for the given opportunity.
 *
 * The side is determined by the opportunity:
 *   - "short_collects" → place ask (short) to receive positive funding
 *   - "long_collects"  → place bid (long) to receive negative funding payback
 *
 * Returns the filled leg data, or an error if the order failed.
 */
export async function enterPosition(
  client: PacificaClient,
  opportunity: ArbOpportunity,
  config: ArbConfig,
): Promise<EntryResult> {
  const side = opportunity.side === "short_collects" ? "ask" : "bid";
  const clientOrderId = randomUUID();

  // Calculate amount in base asset: notional / price
  const amount = config.position_size_usd / opportunity.markPrice;
  // Round to 4 decimal places to avoid precision issues
  const roundedAmount = Math.round(amount * 10000) / 10000;

  if (roundedAmount <= 0) {
    return { success: false, error: "Calculated amount is zero" };
  }

  try {
    const resp = await client.placeMarketOrder({
      symbol: opportunity.symbol,
      amount: String(roundedAmount),
      side,
      slippage_percent: "0.5",
      reduce_only: false,
      client_order_id: clientOrderId,
    });

    const leg: ArbLeg = {
      side,
      amount: roundedAmount,
      // entryPrice is mark-at-entry (not the actual fill price).
      // Market orders may fill at a different price within slippage tolerance.
      entryPrice: opportunity.markPrice,
      clientOrderId,
      entryOrderId: resp.orderId,
      fees: 0,
    };

    return { success: true, leg };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

export interface ExitResult {
  success: boolean;
  exitOrderId?: number;
  error?: string;
}

/**
 * Exit (close) an arb position with a reduce-only market order.
 *
 * If the position has already been closed externally, this is a no-op.
 */
export async function exitPosition(
  client: PacificaClient,
  position: ArbPosition,
): Promise<ExitResult> {
  const exitClientOrderId = randomUUID();
  // Flip the entry side to close
  const closeSide = position.leg.side === "ask" ? "bid" : "ask";

  try {
    // Verify the position still exists before attempting to close
    const positions = await client.getPositions();
    const openPositionSide = position.leg.side === "bid" ? "long" : "short";
    const existingPosition = positions.find(
      (p) =>
        p.symbol.toUpperCase() === position.symbol &&
        p.side === openPositionSide,
    );

    if (!existingPosition) {
      // Already closed externally — treat as success
      return { success: true };
    }

    const resp = await client.placeMarketOrder({
      symbol: position.symbol,
      amount: String(existingPosition.amount),
      side: closeSide,
      slippage_percent: "0.5",
      reduce_only: true,
      client_order_id: exitClientOrderId,
    });

    position.leg.exitClientOrderId = exitClientOrderId;
    position.leg.exitOrderId = resp.orderId;

    return { success: true, exitOrderId: resp.orderId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * Estimate round-trip taker fees for an arb position.
 * Pacifica taker fee is approximately 0.05% (0.0005).
 */
export function estimateRoundTripFeesUsd(notionalUsd: number): number {
  const TAKER_FEE_RATE = 0.0005; // 0.05%
  return notionalUsd * TAKER_FEE_RATE * 2; // entry + exit
}

/**
 * Estimate funding earned for one interval.
 */
export function estimateFundingUsd(notionalUsd: number, ratePerInterval: number): number {
  return notionalUsd * Math.abs(ratePerInterval);
}

/**
 * Returns true if round-trip fees are less than 50% of one funding interval's expected income.
 * This is the fee-to-funding ratio gate.
 */
export function isFeeRatioAcceptable(
  notionalUsd: number,
  ratePerInterval: number,
): boolean {
  const fees = estimateRoundTripFeesUsd(notionalUsd);
  const funding = estimateFundingUsd(notionalUsd, ratePerInterval);
  return fees < funding * 0.5;
}
