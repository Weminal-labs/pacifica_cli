// ---------------------------------------------------------------------------
// MCP pattern tools — expose user-authored patterns to Claude.
// ---------------------------------------------------------------------------

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { PacificaClient } from "../core/sdk/client.js";
import { JournalLogger } from "../core/journal/logger.js";
import {
  loadPatterns,
  loadPattern,
  savePattern,
  getPatternsDir,
  parsePattern,
} from "../core/patterns/loader.js";
import { matchWhen } from "../core/patterns/matcher.js";
import { PatternSchema } from "../core/patterns/types.js";
import { runBacktest } from "../core/patterns/backtest.js";
import { getCandles, stripPerpSuffix } from "../core/patterns/candles.js";
import { analyzeTradePatterns } from "../core/intelligence/patterns.js";
import type { MarketContext } from "../core/intelligence/schema.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

function normaliseSymbol(raw: string): string {
  const up = raw.toUpperCase();
  return up.includes("-") ? up : `${up}-USDC-PERP`;
}

/**
 * Build a live MarketContext from the current exchange state.
 * Mirrors captureIntelligence's logic but does not persist.
 */
async function buildLiveContext(
  sdk: PacificaClient,
  symbolInput: string,
): Promise<{ ctx: MarketContext; symbol: string } | null> {
  const symbol = normaliseSymbol(symbolInput);
  const [markets, trades] = await Promise.all([
    sdk.getMarkets(),
    sdk.getRecentTrades(symbol).catch(() => []),
  ]);
  const market = markets.find((m) => m.symbol.toUpperCase() === symbol);
  if (!market) return null;

  const patterns = analyzeTradePatterns(symbol, trades, market.markPrice, 50_000);

  const ctx: MarketContext = {
    funding_rate: market.fundingRate,
    open_interest_usd: market.openInterest,
    oi_change_4h_pct: 0, // live-only; no historical baseline at call time
    mark_price: market.markPrice,
    volume_24h_usd: market.volume24h,
    buy_pressure: patterns.buyPressure,
    momentum_signal: patterns.momentumSignal,
    momentum_value: patterns.momentum,
    large_orders_count: patterns.largeOrders.length,
    captured_at: new Date().toISOString(),
  };
  return { ctx, symbol };
}

// ---------------------------------------------------------------------------
// Simulate math — same formula as src/cli/commands/simulate.ts
// ---------------------------------------------------------------------------

const MAINTENANCE_MARGIN_RATE = 0.005;

function liquidationPrice(side: "long" | "short", entry: number, leverage: number): number {
  return side === "long"
    ? entry * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE)
    : entry * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);
}

function pnlAtPrice(side: "long" | "short", entry: number, target: number, sizeUsd: number): number {
  if (entry === 0) return 0;
  const delta = side === "long" ? (target - entry) / entry : (entry - target) / entry;
  return delta * sizeUsd;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerPatternTools(server: McpServer, client: PacificaClient): void {
  server.tool(
    "pacifica_list_patterns",
    "List every user-authored pattern in ~/.pacifica/patterns/. Returns name, market, conditions, and entry config for each.",
    {},
    async () => {
      try {
        const patterns = await loadPatterns();
        return ok({ dir: await getPatternsDir(), count: patterns.length, patterns });
      } catch (err) {
        return fail(`Failed to load patterns: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_pattern",
    "Get a single pattern by name from ~/.pacifica/patterns/.",
    { name: z.string().describe("Pattern name (kebab-case, matches filename without extension)") },
    async ({ name }) => {
      try {
        const p = await loadPattern(name);
        if (!p) return fail(`No pattern named '${name}'. Use pacifica_list_patterns to see available.`);
        return ok(p);
      } catch (err) {
        return fail(`Failed to load pattern: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_run_pattern",
    "Evaluate a pattern's `when:` conditions against the current market state. Returns whether it matches, each condition's actual value, and what entry the pattern would take.",
    {
      name: z.string().describe("Pattern name"),
      market: z.string().optional().describe("Override market symbol (else uses pattern.market)"),
    },
    async ({ name, market }) => {
      try {
        const pattern = await loadPattern(name);
        if (!pattern) return fail(`No pattern named '${name}'.`);
        const targetMarket = market ?? (pattern.market === "ANY" ? undefined : pattern.market);
        if (!targetMarket) {
          return fail(`Pattern '${name}' has market=ANY — pass an explicit market argument.`);
        }
        const live = await buildLiveContext(client, targetMarket);
        if (!live) return fail(`Market not found: ${targetMarket}.`);
        const match = matchWhen(live.ctx, pattern);
        return ok({
          pattern: pattern.name,
          market: live.symbol,
          matched: match.matched,
          conditions: match.conditions.map((c) => ({
            axis: c.cond.axis,
            op: c.cond.op,
            required: c.cond.value,
            actual: c.actual,
            passed: c.passed,
            label: c.cond.label,
          })),
          recommended_entry: match.matched ? {
            side: pattern.entry.side,
            size_usd: pattern.entry.size_usd,
            leverage: pattern.entry.leverage,
            stop_loss_pct: pattern.entry.stop_loss_pct,
            take_profit_pct: pattern.entry.take_profit_pct,
            entry_price: live.ctx.mark_price,
          } : null,
        });
      } catch (err) {
        return fail(`run_pattern failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_simulate_pattern",
    "Simulate a pattern's entry at the current mark price: shows liquidation level, P&L at TP/SL, and funding cost. Pure math, no trade placed.",
    {
      name: z.string().describe("Pattern name"),
      market: z.string().optional().describe("Override market symbol"),
    },
    async ({ name, market }) => {
      try {
        const pattern = await loadPattern(name);
        if (!pattern) return fail(`No pattern named '${name}'.`);
        const targetMarket = market ?? (pattern.market === "ANY" ? undefined : pattern.market);
        if (!targetMarket) return fail(`Pattern has market=ANY — pass market argument.`);
        const live = await buildLiveContext(client, targetMarket);
        if (!live) return fail(`Market not found: ${targetMarket}.`);

        const entryPrice = live.ctx.mark_price;
        const { side, size_usd, leverage, stop_loss_pct, take_profit_pct } = pattern.entry;
        const margin = size_usd / leverage;
        const liq = liquidationPrice(side, entryPrice, leverage);
        const tpPrice = take_profit_pct !== undefined
          ? (side === "long" ? entryPrice * (1 + take_profit_pct / 100) : entryPrice * (1 - take_profit_pct / 100))
          : null;
        const slPrice = stop_loss_pct !== undefined
          ? (side === "long" ? entryPrice * (1 - stop_loss_pct / 100) : entryPrice * (1 + stop_loss_pct / 100))
          : null;

        return ok({
          pattern: pattern.name,
          market: live.symbol,
          entry: { side, size_usd, leverage, margin_usd: margin, entry_price: entryPrice },
          liquidation: {
            price: liq,
            distance_pct: Math.abs((liq - entryPrice) / entryPrice) * 100,
          },
          take_profit: tpPrice !== null ? {
            price: tpPrice,
            pnl_usd: pnlAtPrice(side, entryPrice, tpPrice, size_usd),
          } : null,
          stop_loss: slPrice !== null ? {
            price: slPrice,
            pnl_usd: pnlAtPrice(side, entryPrice, slPrice, size_usd),
          } : null,
          funding: {
            current_rate: live.ctx.funding_rate,
            hourly_cost_usd: live.ctx.funding_rate * size_usd,
          },
        });
      } catch (err) {
        return fail(`simulate_pattern failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_backtest_pattern",
    "Replay a pattern against historical hourly candles and simulate every trade it would have taken. Returns trades (entry/exit/pnl/reason), summary stats (win rate, total P&L, drawdown), and a list of condition axes the backtest could NOT validate (funding, OI, buy-pressure, momentum, whale orders — none of which are in candle history). Default window: 30 days.",
    {
      name: z.string().describe("Pattern name (kebab-case, filename without extension)"),
      days: z.number().int().min(1).max(90).default(30).optional().describe("History window in days (default 30, max 90)"),
      market: z.string().optional().describe("Override pattern.market (required when pattern.market is ANY)"),
    },
    async ({ name, days, market }) => {
      try {
        const pattern = await loadPattern(name);
        if (!pattern) return fail(`No pattern named '${name}'. Use pacifica_list_patterns to see available.`);
        const targetMarket = market ?? (pattern.market === "ANY" ? undefined : pattern.market);
        if (!targetMarket) {
          return fail(`Pattern '${name}' has market=ANY — pass an explicit market argument (e.g. BTC or BTC-USDC-PERP).`);
        }
        const base = stripPerpSuffix(targetMarket);
        const windowDays = days ?? 30;
        const candles = await getCandles(base, { days: windowDays });
        if (candles.length < 24) {
          return fail(`Not enough candle history for ${base} (got ${candles.length}, need ≥24). Try a different market.`);
        }
        const result = runBacktest(pattern, candles, `${base}-USDC-PERP`);
        return ok(result);
      } catch (err) {
        return fail(`backtest_pattern failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_save_pattern",
    "Save a user-authored pattern to ~/.pacifica/patterns/<name>.yaml. Use this when the trader asks you to write or update a pattern. The pattern is validated before being persisted.",
    {
      pattern: z.unknown().describe("Pattern object matching the Pattern schema (name, when, entry, optionally exit/market/tags/description)"),
    },
    async ({ pattern }) => {
      try {
        // Accept either a parsed object or a YAML string
        const obj = typeof pattern === "string" ? parsePattern(pattern) : PatternSchema.parse(pattern);
        const path = await savePattern(obj);
        return ok({ saved: true, path, name: obj.name });
      } catch (err) {
        return fail(`save_pattern failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_journal_pattern_stats",
    "Return per-pattern win-rate and P&L statistics from the local trade journal. When a name is provided, returns stats for that single pattern; otherwise returns grouped stats for all patterns.",
    {
      name: z.string().max(100).optional().describe("Pattern name to filter by. Omit to get stats for all patterns."),
    },
    async ({ name }) => {
      try {
        const journal = new JournalLogger();

        if (name) {
          const summary = await journal.getPatternSummary(name);
          return ok(summary);
        }

        const stats = await journal.getPatternStats();
        if (stats.length === 0) {
          return ok({ message: "No trades with pattern tags found in the journal.", patterns: [] });
        }
        return ok({ count: stats.length, patterns: stats });
      } catch (err) {
        return fail(`journal_pattern_stats failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
