// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Outcome Attachment
// ---------------------------------------------------------------------------
// When a position closes, attaches the trade outcome (P&L, duration, exit
// context) to the corresponding open IntelligenceRecord.  Called from the
// positions command as a fire-and-forget side-effect.
// ---------------------------------------------------------------------------

import type { PacificaClient } from "../sdk/client.js";
import type { PacificaConfig } from "../config/types.js";
import type { Position } from "../sdk/types.js";
import { analyzeTradePatterns } from "./patterns.js";
import { getOpenRecords, updateRecord } from "./store.js";
import type { MarketContext, TradeOutcome } from "./schema.js";

// ---------------------------------------------------------------------------
// Build exit MarketContext
// ---------------------------------------------------------------------------

async function buildExitContext(
  sdk: PacificaClient,
  symbol: string,
  markPrice: number,
): Promise<MarketContext> {
  try {
    const [markets, trades] = await Promise.all([
      sdk.getMarkets(),
      sdk.getRecentTrades(symbol).catch(() => []),
    ]);

    const market = markets.find(
      (m) => m.symbol.toUpperCase() === symbol.toUpperCase(),
    );

    const patterns = analyzeTradePatterns(symbol, trades, markPrice, 50_000);

    return {
      funding_rate: market?.fundingRate ?? 0,
      open_interest_usd: market?.openInterest ?? 0,
      oi_change_4h_pct: 0, // not tracked on exit
      mark_price: markPrice,
      volume_24h_usd: market?.volume24h ?? 0,
      buy_pressure: patterns.buyPressure,
      momentum_signal: patterns.momentumSignal,
      momentum_value: patterns.momentum,
      large_orders_count: patterns.largeOrders.length,
      captured_at: new Date().toISOString(),
    };
  } catch {
    // Fallback minimal context
    return {
      funding_rate: 0,
      open_interest_usd: 0,
      oi_change_4h_pct: 0,
      mark_price: markPrice,
      volume_24h_usd: 0,
      buy_pressure: 0.5,
      momentum_signal: "neutral",
      momentum_value: 0,
      large_orders_count: 0,
      captured_at: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Outcome attachment
// ---------------------------------------------------------------------------

/**
 * Match closed positions against open intelligence records and attach outcomes.
 *
 * @param sdk              - Pacifica client for exit context fetching.
 * @param currentPositions - The live positions currently open on the exchange.
 *                           Any open record whose asset+direction is NOT in
 *                           this list is assumed to have closed.
 */
export async function attachOutcomes(
  sdk: PacificaClient,
  currentPositions: Position[],
): Promise<void> {
  const openRecords = await getOpenRecords();
  if (openRecords.length === 0) return;

  // Build a lookup of currently open positions
  const openSet = new Set(
    currentPositions.map((p) => `${p.symbol.toUpperCase()}:${p.side}`),
  );

  for (const record of openRecords) {
    const baseSymbol = record.asset.split("-")[0] ?? record.asset;
    const key = `${baseSymbol.toUpperCase()}-USDC-PERP:${record.direction}`;
    const altKey = `${record.asset.toUpperCase()}:${record.direction}`;

    // If the position is still open, skip
    if (openSet.has(key) || openSet.has(altKey)) continue;

    // Position appears to have closed — try to fetch mark price from markets
    try {
      const markets = await sdk.getMarkets();
      const market = markets.find(
        (m) =>
          m.symbol.toUpperCase() === record.asset.toUpperCase() ||
          m.symbol.toUpperCase().startsWith(baseSymbol.toUpperCase()),
      );

      const exitPrice = market?.markPrice ?? record.entry_price;
      const exitContext = await buildExitContext(sdk, record.asset, exitPrice);

      // Compute P&L
      let rawPnl: number;
      if (record.direction === "long") {
        rawPnl = (exitPrice - record.entry_price) * (record.size_usd / record.entry_price);
      } else {
        rawPnl = (record.entry_price - exitPrice) * (record.size_usd / record.entry_price);
      }

      const pnlPct =
        record.entry_price > 0
          ? ((exitPrice - record.entry_price) / record.entry_price) *
            100 *
            (record.direction === "long" ? 1 : -1)
          : 0;

      const openedAt = new Date(record.opened_at).getTime();
      const closedAt = new Date().getTime();
      const durationMinutes = Math.round((closedAt - openedAt) / 60_000);

      const outcome: TradeOutcome = {
        pnl_pct: pnlPct,
        pnl_usd: rawPnl,
        duration_minutes: durationMinutes,
        exit_price: exitPrice,
        exit_market_context: exitContext,
        profitable: rawPnl > 0,
        liquidated: false,
      };

      await updateRecord(record.id, {
        closed_at: new Date().toISOString(),
        outcome,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[intelligence] outcome attachment failed for ${record.id}: ${msg}`);
    }
  }
}

/**
 * Convenience wrapper called from positions.tsx — fetches current positions
 * and delegates to attachOutcomes.  Fire-and-forget safe.
 */
export async function checkAndAttachOutcomes(
  sdk: PacificaClient,
  _config: PacificaConfig,
): Promise<void> {
  try {
    const currentPositions = await sdk.getPositions();
    await attachOutcomes(sdk, currentPositions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[intelligence] checkAndAttachOutcomes failed: ${msg}`);
  }
}
