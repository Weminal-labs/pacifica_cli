#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica DEX MCP Server
// ---------------------------------------------------------------------------
// Exposes Pacifica perpetual DEX trading tools to AI agents via the Model
// Context Protocol (MCP).  Communicates over stdio so it can be launched by
// any MCP-compatible host (Claude Desktop, Cursor, etc.).
//
// Tools are split into categories:
//   - Read tools         (10) -- market data, account info, agent introspection
//   - Analytics tools     (5) -- journal, PnL, heatmap, risk, smart orders
//   - Funding tools       (2) -- funding rates, funding history
//   - Intelligence tools  (5) -- top markets, liquidity scan, trade patterns, alerts, snapshot
//   - Write tools         (6) -- orders, positions, smart orders
// Total: 28 tools
//
// Every write tool passes through the GuardrailChecker before execution and
// is recorded by the AgentActionLogger / SpendingTracker for auditability.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { PacificaClient } from "../core/sdk/client.js";
import { createSignerFromConfig } from "../core/sdk/signer.js";
import type { Market, OrderSide, TpSlConfig, FundingRate } from "../core/sdk/types.js";
import { loadConfig, saveConfig } from "../core/config/loader.js";
import type { PacificaConfig } from "../core/config/types.js";
import { GuardrailChecker } from "../core/agent/guardrails.js";
import { SpendingTracker } from "../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../core/agent/action-logger.js";
import { JournalLogger } from "../core/journal/logger.js";
import { calculateRiskSummary } from "../core/risk/calculator.js";
import { SmartOrderManager } from "../core/smart/manager.js";
import { ArbManager } from "../core/arb/manager.js";
import { buildPnlSummary } from "../core/arb/pnl.js";
import {
  topGainers, topLosers, byOpenInterest, byFundingRate, byVolume,
  liquidityFilter, computeLiquidityScan, toMarketSummary,
  topGainersWithLiquidityFilter,
} from "../core/intelligence/filter.js";
import { analyzeTradePatterns } from "../core/intelligence/patterns.js";
import { AlertManager } from "../core/intelligence/alerts.js";
import { SCHEMA_VERSION } from "../core/intelligence/schema.js";
import type {
  MarketSummary, LiquidityScan, MarketIntelligenceSnapshot,
} from "../core/intelligence/schema.js";
import { loadPatterns, loadRecords, loadReputation } from "../core/intelligence/store.js";
import type { DetectedPattern, ConfirmedSignal } from "../core/intelligence/schema.js";
import { fetchSocialContext } from "../core/intelligence/social.js";
import { scoreConfidence, detectPatterns, scanForActiveSignals } from "../core/intelligence/engine.js";
import { computeReputation } from "../core/intelligence/reputation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map user-facing side ("buy" / "sell") to the API's OrderSide. */
function toOrderSide(side: "buy" | "sell"): OrderSide {
  return side === "buy" ? "bid" : "ask";
}

/** Map API position side ("long" / "short") to the closing OrderSide. */
function closingSide(positionSide: "long" | "short"): OrderSide {
  return positionSide === "long" ? "ask" : "bid";
}

/** Standard MCP success response. */
function ok(data: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP error response. */
function fail(
  message: string,
): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/**
 * Fetch the mark price for a symbol from the markets list.
 * Returns 0 if the symbol is not found (caller should handle gracefully).
 */
async function getMarkPrice(
  client: PacificaClient,
  symbol: string,
): Promise<number> {
  const markets = await client.getMarkets();
  const market = markets.find(
    (m) => m.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  return market?.markPrice ?? 0;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function registerReadTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
): void {
  // -----------------------------------------------------------------------
  // 1. pacifica_get_markets
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_markets",
    "Get all available markets with price, volume, open interest, and funding rates",
    {},
    async () => {
      try {
        const markets = await client.getMarkets();
        return ok(markets);
      } catch (err) {
        return fail(`Error fetching markets: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 2. pacifica_get_ticker
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_ticker",
    "Get ticker data (price, volume, funding, OI) for a single market",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
    },
    async ({ symbol }) => {
      try {
        const markets = await client.getMarkets();
        const upper = symbol.toUpperCase();
        const market = markets.find((m) => m.symbol.toUpperCase() === upper);

        if (!market) {
          return fail(`Market not found: ${symbol}. Use pacifica_get_markets to list available symbols.`);
        }

        return ok(market);
      } catch (err) {
        return fail(`Error fetching ticker for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 3. pacifica_get_orderbook
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_orderbook",
    "Get the order book (bids and asks) for a market",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      depth: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of price levels to return (default: all)"),
    },
    async ({ symbol, depth }) => {
      try {
        const book = await client.getOrderBook(symbol, depth);
        return ok(book);
      } catch (err) {
        return fail(`Error fetching order book for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 4. pacifica_get_positions
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_positions",
    "Get all open positions with entry price, margin, PnL, and liquidation price",
    {},
    async () => {
      try {
        const positions = await client.getPositions();
        return ok(positions);
      } catch (err) {
        return fail(`Error fetching positions: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 5. pacifica_get_account
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_account",
    "Get account summary: balance, equity, margin used, and fee tier",
    {},
    async () => {
      try {
        const account = await client.getAccount();
        return ok(account);
      } catch (err) {
        return fail(`Error fetching account: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 6. pacifica_get_orders
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_orders",
    "Get all open orders with price, size, fill status, and type",
    {},
    async () => {
      try {
        const orders = await client.getOrders();
        return ok(orders);
      } catch (err) {
        return fail(`Error fetching orders: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 7. pacifica_agent_status
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_agent_status",
    "Get agent guardrails configuration, daily spending usage, and remaining budget",
    {},
    async () => {
      try {
        const agentConfig = guardrails.getConfig();
        const dailySpend = spendingTracker.getDailySpend();
        const transactions = spendingTracker.getTransactions();
        const recentActions = await logger.getEntries({ today: true, limit: 10 });

        return ok({
          guardrails: {
            enabled: agentConfig.enabled,
            dailySpendingLimit: agentConfig.daily_spending_limit,
            maxOrderSize: agentConfig.max_order_size,
            maxLeverage: agentConfig.max_leverage,
            allowedActions: agentConfig.allowed_actions,
            blockedActions: agentConfig.blocked_actions,
            requireConfirmationAbove: agentConfig.require_confirmation_above,
          },
          dailyUsage: {
            totalSpentUsd: dailySpend,
            remainingBudgetUsd: agentConfig.daily_spending_limit - dailySpend,
            transactionCount: transactions.length,
          },
          recentActions: recentActions.map((entry) => ({
            timestamp: entry.timestamp,
            tool: entry.tool,
            action: entry.action,
            result: entry.result,
            symbol: entry.symbol,
            amountUsd: entry.amountUsd,
            rejectionReason: entry.rejectionReason,
          })),
          network: config.network,
        });
      } catch (err) {
        return fail(`Error fetching agent status: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 8. pacifica_agent_log
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_agent_log",
    "Get the agent action audit trail with optional filtering",
    {
      filter: z
        .enum(["today", "all"])
        .optional()
        .describe("Filter scope: 'today' for today's actions only, 'all' for everything (default: today)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of entries to return (default: 50)"),
    },
    async ({ filter, limit }) => {
      try {
        const isToday = filter !== "all";
        const maxEntries = limit ?? 50;

        const entries = await logger.getEntries({
          today: isToday,
          limit: maxEntries,
        });

        return ok({
          count: entries.length,
          filter: isToday ? "today" : "all",
          entries,
        });
      } catch (err) {
        return fail(`Error fetching agent log: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

function registerAnalyticsTools(
  server: McpServer,
  client: PacificaClient,
  _journalLogger: JournalLogger,
  smartManager: SmartOrderManager,
): void {
  // -----------------------------------------------------------------------
  // pacifica_trade_journal
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_trade_journal",
    "Get trade history from the Pacifica API with optional filtering by symbol",
    {
      symbol: z
        .string()
        .optional()
        .describe("Filter by trading symbol (e.g. BTC, ETH)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of entries to return (default: 50)"),
    },
    async ({ symbol, limit }) => {
      try {
        const entries = await client.getTradeHistory(
          symbol?.toUpperCase(),
          limit ?? 50,
        );
        return ok({
          count: entries.length,
          entries,
        });
      } catch (err) {
        return fail(`Error fetching trade history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_pnl_summary
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_pnl_summary",
    "Get PnL summary statistics from trade history: total trades, total PnL, total fees, win rate",
    {
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of recent trades to analyze (default: 100)"),
    },
    async ({ limit }) => {
      try {
        const entries = await client.getTradeHistory(undefined, limit ?? 100);

        let totalPnl = 0;
        let totalFees = 0;
        let wins = 0;
        let losses = 0;

        for (const e of entries) {
          totalPnl += e.pnl;
          totalFees += e.fee;
          if (e.pnl > 0) wins++;
          else if (e.pnl < 0) losses++;
        }

        const totalTrades = entries.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

        return ok({
          totalTrades,
          wins,
          losses,
          winRate: Math.round(winRate * 10) / 10,
          totalPnl: Math.round(totalPnl * 100) / 100,
          totalFees: Math.round(totalFees * 100) / 100,
          netPnl: Math.round((totalPnl - totalFees) * 100) / 100,
        });
      } catch (err) {
        return fail(`Error fetching PnL summary: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_position_heatmap
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_position_heatmap",
    "Get a text-based position heatmap showing risk levels, PnL, and liquidation distance for all positions",
    {},
    async () => {
      try {
        const [positions, markets, account] = await Promise.all([
          client.getPositions(),
          client.getMarkets(),
          client.getAccount(),
        ]);

        if (positions.length === 0) {
          return ok({ message: "No open positions", positions: [] });
        }

        const summary = calculateRiskSummary(positions, markets, account);

        // Build ASCII heatmap text
        const lines: string[] = [];
        lines.push(`Positions: ${summary.totalPositions} | Total PnL: $${summary.totalPnl.toFixed(2)} | Margin Used: ${summary.marginUsedPercent}%`);
        if (summary.closestToLiq) {
          lines.push(`Closest to liquidation: ${summary.closestToLiq.symbol} (${summary.closestToLiq.distance.toFixed(1)}%)`);
        }
        lines.push("");

        for (const p of summary.positions) {
          const riskIcon = p.riskLevel === "danger" ? "[!!!]" : p.riskLevel === "watch" ? "[! ]" : "[ok ]";
          const pnlStr = p.pnlUsd >= 0 ? `+$${p.pnlUsd.toFixed(2)}` : `-$${Math.abs(p.pnlUsd).toFixed(2)}`;
          const liqStr = p.liqDistancePercent !== undefined ? `${p.liqDistancePercent.toFixed(1)}% to liq` : "no liq data";
          const bar = buildBar(p.liqDistancePercent);
          lines.push(`${riskIcon} ${p.symbol} ${p.side.toUpperCase()} ${p.leverage.toFixed(1)}x | ${pnlStr} (${p.pnlPercent.toFixed(1)}%) | ${liqStr} ${bar}`);
        }

        return ok({ heatmap: lines.join("\n"), summary });
      } catch (err) {
        return fail(`Error generating heatmap: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_risk_summary
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_risk_summary",
    "Get structured risk data for all positions: PnL, margin, leverage, liquidation distance, risk levels",
    {},
    async () => {
      try {
        const [positions, markets, account] = await Promise.all([
          client.getPositions(),
          client.getMarkets(),
          client.getAccount(),
        ]);

        const summary = calculateRiskSummary(positions, markets, account);
        return ok(summary);
      } catch (err) {
        return fail(`Error fetching risk summary: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_get_smart_orders
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_get_smart_orders",
    "Get all smart orders (trailing stops, partial take-profits) with optional filtering",
    {
      status: z
        .string()
        .optional()
        .describe("Filter by status: active, triggered, cancelled, error"),
      symbol: z
        .string()
        .optional()
        .describe("Filter by trading symbol (e.g. BTC, ETH)"),
    },
    async ({ status, symbol }) => {
      try {
        smartManager.load();
        const orders = smartManager.getOrders({ status, symbol });
        return ok({
          count: orders.length,
          activeCount: smartManager.getActiveCount(),
          orders,
        });
      } catch (err) {
        return fail(`Error fetching smart orders: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

/** Build a simple ASCII bar for liquidation distance. */
function buildBar(liqDistance: number | undefined): string {
  if (liqDistance === undefined) return "";
  const maxLen = 20;
  const filled = Math.min(maxLen, Math.round((liqDistance / 50) * maxLen));
  return "[" + "█".repeat(filled) + "░".repeat(maxLen - filled) + "]";
}

function registerFundingTools(
  server: McpServer,
  client: PacificaClient,
): void {
  // -----------------------------------------------------------------------
  // pacifica_funding_rates
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_funding_rates",
    "Get current funding rates for all Pacifica markets with price and APR",
    {},
    async () => {
      try {
        const markets = await client.getMarkets();
        const data = markets.map((m) => ({
          symbol: m.symbol,
          fundingRate: m.fundingRate,
          nextFundingRate: m.nextFundingRate,
          annualizedApr: m.fundingRate * 3 * 365,
          price: m.price,
        }));
        return ok(data);
      } catch (err) {
        return fail(`Error fetching funding rates: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_funding_history
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_funding_history",
    "Get historical funding rates for a Pacifica market",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of historical entries to return (default: 20)"),
    },
    async ({ symbol, limit }) => {
      try {
        const history = await client.getFundingHistory(symbol, limit ?? 20);
        return ok({
          symbol,
          count: history.length,
          history,
        });
      } catch (err) {
        return fail(`Error fetching funding history for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Intelligence Tools (5) — agent-readable data, no guardrails
// ---------------------------------------------------------------------------

function registerIntelligenceTools(
  server: McpServer,
  client: PacificaClient,
  alertManager: AlertManager,
): void {
  // -----------------------------------------------------------------------
  // pacifica_top_markets
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_top_markets",
    "Get a ranked list of Pacifica markets sorted by a chosen dimension (gainers, losers, volume, open interest, or funding rate) with an optional minimum-volume liquidity gate",
    {
      sort_by: z
        .enum(["gainers", "losers", "volume", "oi", "funding"])
        .default("gainers")
        .describe("Ranking dimension: gainers (24h % change), losers, volume (24h USD), oi (open interest), funding (absolute funding rate)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .optional()
        .describe("Number of results to return (1–50, default 10)"),
      min_volume_usd: z
        .number()
        .min(0)
        .default(0)
        .optional()
        .describe("Minimum 24h volume in USD; markets below this threshold are excluded (default 0 = no filter)"),
    },
    async ({ sort_by, limit, min_volume_usd }) => {
      try {
        let markets = await client.getMarkets();
        const effectiveLimit = limit ?? 10;
        const minVol = min_volume_usd ?? 0;

        if (minVol > 0) {
          markets = liquidityFilter(markets, minVol);
        }

        let results: MarketSummary[];
        switch (sort_by) {
          case "gainers":
            results = topGainers(markets, effectiveLimit);
            break;
          case "losers":
            results = topLosers(markets, effectiveLimit);
            break;
          case "volume":
            results = byVolume(markets, effectiveLimit);
            break;
          case "oi":
            results = byOpenInterest(markets, effectiveLimit);
            break;
          case "funding":
            results = byFundingRate(markets, effectiveLimit);
            break;
          default:
            results = topGainers(markets, effectiveLimit);
        }

        return ok({
          sort_by,
          limit: effectiveLimit,
          min_volume_usd: minVol,
          count: results.length,
          results,
        });
      } catch (err) {
        return fail(`Error fetching top markets: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_liquidity_scan
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_liquidity_scan",
    "Analyse order-book depth for up to 10 markets: spread, bid/ask depth within 10% of mid price, slippage estimates for $10k/$50k/$100k orders, and a composite liquidity score",
    {
      symbols: z
        .array(z.string())
        .optional()
        .describe("List of trading symbols to scan (e.g. [\"BTC\", \"ETH\"]). If omitted, the top 10 markets by 24h volume are scanned"),
      min_volume_usd: z
        .number()
        .min(0)
        .default(0)
        .optional()
        .describe("Minimum 24h volume filter applied before selecting markets (default 0 = no filter)"),
    },
    async ({ symbols, min_volume_usd }) => {
      try {
        let markets = await client.getMarkets();
        const minVol = min_volume_usd ?? 0;

        let selected;
        if (symbols && symbols.length > 0) {
          const upperSymbols = symbols.map((s) => s.toUpperCase());
          selected = markets.filter((m) =>
            upperSymbols.includes(m.symbol.toUpperCase()),
          );
        } else {
          // Default: top 10 by volume
          selected = [...markets]
            .sort((a, b) => b.volume24h - a.volume24h)
            .slice(0, 10);
        }

        if (minVol > 0) {
          selected = liquidityFilter(selected, minVol);
        }

        // Cap at 10 to avoid rate limit issues
        selected = selected.slice(0, 10);

        const results: LiquidityScan[] = await Promise.all(
          selected.map((m) =>
            client.getOrderBook(m.symbol).then((book) =>
              computeLiquidityScan(m, book),
            ),
          ),
        );

        results.sort((a, b) => b.liquidityScore - a.liquidityScore);

        return ok({ scanned: results.length, results });
      } catch (err) {
        return fail(`Error running liquidity scan: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_trade_patterns
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_trade_patterns",
    "Analyse recent public trade flow for a single symbol: buy pressure ratio, VWAP vs current price, large order detection, and directional momentum signal",
    {
      symbol: z.string().describe("Trading symbol to analyse (e.g. BTC, ETH, SOL)"),
      limit: z
        .number()
        .int()
        .min(10)
        .max(500)
        .default(100)
        .optional()
        .describe("Number of most-recent trades to include in the analysis (10–500, default 100)"),
      large_order_threshold_usd: z
        .number()
        .min(0)
        .default(50000)
        .optional()
        .describe("Minimum USD notional to classify a trade as a large order (default $50,000)"),
    },
    async ({ symbol, limit, large_order_threshold_usd }) => {
      try {
        const upperSymbol = symbol.toUpperCase();
        const effectiveLimit = limit ?? 100;
        const threshold = large_order_threshold_usd ?? 50_000;

        const [trades, markets] = await Promise.all([
          client.getRecentTrades(upperSymbol),
          client.getMarkets(),
        ]);

        const market = markets.find(
          (m) => m.symbol.toUpperCase() === upperSymbol,
        );

        if (!market) {
          return fail(`Market not found: ${symbol}. Use pacifica_get_markets to list available symbols.`);
        }

        const currentPrice = market.markPrice;
        const slicedTrades = trades.slice(-effectiveLimit);

        const result = analyzeTradePatterns(
          upperSymbol,
          slicedTrades,
          currentPrice,
          threshold,
        );

        return ok(result);
      } catch (err) {
        return fail(`Error analysing trade patterns for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_alert_triage
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_alert_triage",
    "Check all configured price/funding/volume alerts against live market data and return them ranked by urgency (triggered first, near-threshold second, dormant last)",
    {
      include_dormant: z
        .boolean()
        .default(false)
        .optional()
        .describe("When true, includes dormant alerts (more than 5% away from threshold) in the response (default false)"),
    },
    async ({ include_dormant }) => {
      try {
        const alerts = await alertManager.listAlerts();

        if (alerts.length === 0) {
          return ok({ total: 0, triggered: 0, near: 0, dormant: 0, results: [] });
        }

        const markets = await client.getMarkets();

        // Build funding rates map only for symbols that have funding alerts
        const fundingAlertSymbols = [
          ...new Set(
            alerts
              .filter(
                (a) =>
                  a.type === "funding_above" || a.type === "funding_below",
              )
              .map((a) => a.symbol),
          ),
        ];

        const fundingRatesMap = new Map<string, FundingRate>();

        if (fundingAlertSymbols.length > 0) {
          await Promise.all(
            fundingAlertSymbols.map(async (sym) => {
              try {
                const history = await client.getFundingHistory(sym, 1);
                if (history.length > 0) {
                  fundingRatesMap.set(sym, history[0]!);
                }
              } catch {
                // Ignore individual fetch errors; fallback to market fundingRate
              }
            }),
          );
        }

        const triageResults = await alertManager.checkAlerts(
          markets,
          fundingRatesMap,
        );

        const includeDormant = include_dormant ?? false;
        const filtered = includeDormant
          ? triageResults
          : triageResults.filter((r) => r.urgency !== "dormant");

        const triggered = triageResults.filter(
          (r) => r.urgency === "triggered",
        ).length;
        const near = triageResults.filter((r) => r.urgency === "near").length;
        const dormant = triageResults.filter(
          (r) => r.urgency === "dormant",
        ).length;

        return ok({
          total: triageResults.length,
          triggered,
          near,
          dormant,
          results: filtered,
        });
      } catch (err) {
        return fail(`Error running alert triage: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_market_snapshot
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_market_snapshot",
    "Return a comprehensive single-call market intelligence snapshot: top gainers/losers, highest funding, liquidity leaders, and any triggered/near alerts — ideal as a daily briefing for AI agents",
    {
      symbols: z
        .array(z.string())
        .optional()
        .describe("Restrict the snapshot to these symbols only. If omitted, all markets are included"),
    },
    async ({ symbols }) => {
      try {
        const [allMarkets, allAlerts] = await Promise.all([
          client.getMarkets(),
          alertManager.listAlerts(),
        ]);

        let markets = allMarkets;
        if (symbols && symbols.length > 0) {
          const upper = symbols.map((s) => s.toUpperCase());
          markets = allMarkets.filter((m) =>
            upper.includes(m.symbol.toUpperCase()),
          );
        }

        // Top 5 by volume for liquidity scan
        const top5 = [...markets]
          .sort((a, b) => b.volume24h - a.volume24h)
          .slice(0, 5);

        const [liquidityScansRaw, triageResults] = await Promise.all([
          Promise.all(
            top5.map((m) =>
              client
                .getOrderBook(m.symbol)
                .then((book) => computeLiquidityScan(m, book)),
            ),
          ),
          allAlerts.length > 0
            ? alertManager.checkAlerts(markets, new Map())
            : Promise.resolve([]),
        ]);

        const liquidityLeaders = [...liquidityScansRaw].sort(
          (a, b) => b.liquidityScore - a.liquidityScore,
        );

        const marketsAsSummary: MarketSummary[] = markets.map((m, i) =>
          toMarketSummary(m, i + 1, m.volume24h),
        );

        const snapshot: MarketIntelligenceSnapshot = {
          schemaVersion: SCHEMA_VERSION,
          generatedAt: new Date().toISOString(),
          markets: marketsAsSummary,
          topGainers: topGainers(markets, 5),
          topLosers: topLosers(markets, 5),
          highestFunding: byFundingRate(markets, 5),
          liquidityLeaders,
          triggeredAlerts: triageResults.filter(
            (r) => r.urgency === "triggered",
          ),
          nearAlerts: triageResults.filter((r) => r.urgency === "near"),
        };

        return ok(snapshot);
      } catch (err) {
        return fail(`Error building market snapshot: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

function registerWriteTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
  smartManager: SmartOrderManager,
): void {
  // -----------------------------------------------------------------------
  // 9. pacifica_place_order
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_place_order",
    "Place a market or limit order on Pacifica DEX. Returns the order ID on success.",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      side: z.enum(["buy", "sell"]).describe("Order side: buy (long) or sell (short)"),
      size: z.number().positive().describe("Order size in base asset units"),
      type: z
        .enum(["market", "limit"])
        .default("market")
        .describe("Order type (default: market)"),
      price: z
        .number()
        .positive()
        .optional()
        .describe("Limit price (required for limit orders)"),
      leverage: z
        .number()
        .positive()
        .optional()
        .describe("Leverage multiplier (uses account default if omitted)"),
      tp: z
        .number()
        .positive()
        .optional()
        .describe("Take-profit trigger price"),
      sl: z
        .number()
        .positive()
        .optional()
        .describe("Stop-loss trigger price"),
      slippage: z
        .number()
        .positive()
        .optional()
        .describe("Slippage tolerance in percent (default from config)"),
    },
    async ({ symbol, side, size, type, price, leverage, tp, sl, slippage }) => {
      const toolName = "pacifica_place_order";
      const params = { symbol, side, size, type, price, leverage, tp, sl, slippage };

      try {
        // -----------------------------------------------------------------
        // 1. Estimate USD value for guardrail checks
        // -----------------------------------------------------------------
        const markPrice = await getMarkPrice(client, symbol);
        if (markPrice === 0) {
          return fail(`Unknown symbol: ${symbol}. Use pacifica_get_markets to list available symbols.`);
        }

        const estimatedUsd = size * markPrice;

        // -----------------------------------------------------------------
        // 2. Guardrail check
        // -----------------------------------------------------------------
        const check = guardrails.check({
          action: "place_order",
          orderSizeUsd: estimatedUsd,
          leverage,
          symbol,
        });

        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "place_order",
            params,
            rejectionReason: check.reason!,
            symbol,
            side,
            amountUsd: estimatedUsd,
          });
          return fail(`Order rejected by guardrails: ${check.reason}`);
        }

        // -----------------------------------------------------------------
        // 3. Set leverage if requested
        // -----------------------------------------------------------------
        const effectiveLeverage = leverage ?? config.defaults.leverage;
        if (leverage !== undefined) {
          await client.updateLeverage(symbol, Math.round(leverage));
        }

        // -----------------------------------------------------------------
        // 4. Build TP/SL configs
        // -----------------------------------------------------------------
        const takeProfit: TpSlConfig | undefined = tp
          ? { stop_price: String(tp) }
          : undefined;

        const stopLoss: TpSlConfig | undefined = sl
          ? { stop_price: String(sl) }
          : undefined;

        // -----------------------------------------------------------------
        // 5. Execute order
        // -----------------------------------------------------------------
        const apiSide = toOrderSide(side);
        let result: { orderId: number };

        if (type === "limit") {
          if (price === undefined) {
            return fail("Limit orders require a price. Provide the 'price' parameter.");
          }

          result = await client.placeLimitOrder({
            symbol,
            price: String(price),
            amount: String(size),
            side: apiSide,
            tif: "GTC",
            reduce_only: false,
            take_profit: takeProfit,
            stop_loss: stopLoss,
          });
        } else {
          const effectiveSlippage = slippage ?? config.defaults.slippage;

          result = await client.placeMarketOrder({
            symbol,
            amount: String(size),
            side: apiSide,
            slippage_percent: String(effectiveSlippage),
            reduce_only: false,
            take_profit: takeProfit,
            stop_loss: stopLoss,
          });
        }

        // -----------------------------------------------------------------
        // 6. Log success and record spending
        // -----------------------------------------------------------------
        await logger.logSuccess({
          tool: toolName,
          action: "place_order",
          params,
          response: {
            orderId: result.orderId,
            estimatedUsd,
            leverage: effectiveLeverage,
          },
          symbol,
          side,
          amountUsd: estimatedUsd,
        });

        await spendingTracker.recordSpend(estimatedUsd, "place_order", symbol);

        return ok({
          success: true,
          orderId: result.orderId,
          symbol,
          side,
          size,
          type,
          estimatedValueUsd: Math.round(estimatedUsd * 100) / 100,
          leverage: effectiveLeverage,
          takeProfit: tp ?? null,
          stopLoss: sl ?? null,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        await logger.logError({
          tool: toolName,
          action: "place_order",
          params,
          response: { error: errorMessage },
          symbol,
          side,
        });

        return fail(`Failed to place order: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 10. pacifica_cancel_order
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_cancel_order",
    "Cancel an open order by symbol and order ID",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      order_id: z.number().int().positive().describe("The order ID to cancel"),
    },
    async ({ symbol, order_id }) => {
      const toolName = "pacifica_cancel_order";
      const params = { symbol, order_id };

      try {
        // -----------------------------------------------------------------
        // 1. Guardrail check
        // -----------------------------------------------------------------
        const check = guardrails.check({ action: "cancel_order" });

        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "cancel_order",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Cancel rejected by guardrails: ${check.reason}`);
        }

        // -----------------------------------------------------------------
        // 2. Execute cancellation
        // -----------------------------------------------------------------
        await client.cancelOrder(symbol, order_id);

        // -----------------------------------------------------------------
        // 3. Log success
        // -----------------------------------------------------------------
        await logger.logSuccess({
          tool: toolName,
          action: "cancel_order",
          params,
          response: { cancelled: true, orderId: order_id },
          symbol,
        });

        return ok({
          success: true,
          message: `Order ${order_id} for ${symbol} cancelled successfully`,
          orderId: order_id,
          symbol,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        await logger.logError({
          tool: toolName,
          action: "cancel_order",
          params,
          response: { error: errorMessage },
          symbol,
        });

        return fail(`Failed to cancel order ${order_id}: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 11. pacifica_close_position
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_close_position",
    "Close an open position by placing an opposite-side reduce-only market order",
    {
      symbol: z.string().describe("Trading symbol of the position to close (e.g. BTC, ETH, SOL)"),
    },
    async ({ symbol }) => {
      const toolName = "pacifica_close_position";
      const params = { symbol };

      try {
        // -----------------------------------------------------------------
        // 1. Guardrail check
        // -----------------------------------------------------------------
        const check = guardrails.check({ action: "close_position", symbol });

        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "close_position",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Close position rejected by guardrails: ${check.reason}`);
        }

        // -----------------------------------------------------------------
        // 2. Find the open position
        // -----------------------------------------------------------------
        const positions = await client.getPositions();
        const upper = symbol.toUpperCase();
        const position = positions.find(
          (p) => p.symbol.toUpperCase() === upper,
        );

        if (!position) {
          return fail(`No open position found for ${symbol}. Use pacifica_get_positions to check.`);
        }

        // -----------------------------------------------------------------
        // 3. Place a reduce-only market order on the opposite side
        // -----------------------------------------------------------------
        const side = closingSide(position.side);
        const slippagePercent = String(config.defaults.slippage);

        const result = await client.placeMarketOrder({
          symbol: position.symbol,
          amount: String(position.amount),
          side,
          slippage_percent: slippagePercent,
          reduce_only: true,
        });

        // -----------------------------------------------------------------
        // 4. Log success
        // -----------------------------------------------------------------
        const markPrice = await getMarkPrice(client, symbol);
        const estimatedUsd = position.amount * markPrice;

        await logger.logSuccess({
          tool: toolName,
          action: "close_position",
          params,
          response: {
            orderId: result.orderId,
            closedSide: position.side,
            amount: position.amount,
            estimatedUsd,
          },
          symbol: position.symbol,
          side: position.side === "long" ? "sell" : "buy",
          amountUsd: estimatedUsd,
        });

        return ok({
          success: true,
          orderId: result.orderId,
          symbol: position.symbol,
          closedSide: position.side,
          closedAmount: position.amount,
          entryPrice: position.entryPrice,
          estimatedCloseValueUsd: Math.round(estimatedUsd * 100) / 100,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        await logger.logError({
          tool: toolName,
          action: "close_position",
          params,
          response: { error: errorMessage },
          symbol,
        });

        return fail(`Failed to close position for ${symbol}: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 12. pacifica_set_tpsl
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_set_tpsl",
    "Set or update take-profit and/or stop-loss on an existing position",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      side: z
        .enum(["buy", "sell"])
        .describe("Position side: buy = long position, sell = short position"),
      tp: z
        .number()
        .positive()
        .optional()
        .describe("Take-profit trigger price"),
      sl: z
        .number()
        .positive()
        .optional()
        .describe("Stop-loss trigger price"),
    },
    async ({ symbol, side, tp, sl }) => {
      const toolName = "pacifica_set_tpsl";
      const params = { symbol, side, tp, sl };

      if (tp === undefined && sl === undefined) {
        return fail("At least one of 'tp' (take-profit) or 'sl' (stop-loss) must be provided.");
      }

      try {
        // -----------------------------------------------------------------
        // 1. Guardrail check
        // -----------------------------------------------------------------
        const check = guardrails.check({ action: "set_tpsl" });

        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "set_tpsl",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Set TP/SL rejected by guardrails: ${check.reason}`);
        }

        // -----------------------------------------------------------------
        // 2. Build TP/SL configs and execute
        // -----------------------------------------------------------------
        const apiSide = toOrderSide(side);

        const takeProfit: TpSlConfig | undefined = tp
          ? { stop_price: String(tp) }
          : undefined;

        const stopLoss: TpSlConfig | undefined = sl
          ? { stop_price: String(sl) }
          : undefined;

        await client.setPositionTpSl(symbol, apiSide, takeProfit, stopLoss);

        // -----------------------------------------------------------------
        // 3. Log success
        // -----------------------------------------------------------------
        await logger.logSuccess({
          tool: toolName,
          action: "set_tpsl",
          params,
          response: { tp: tp ?? null, sl: sl ?? null },
          symbol,
          side,
        });

        return ok({
          success: true,
          symbol,
          side,
          takeProfit: tp ?? null,
          stopLoss: sl ?? null,
          message: `TP/SL updated for ${symbol} ${side} position`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        await logger.logError({
          tool: toolName,
          action: "set_tpsl",
          params,
          response: { error: errorMessage },
          symbol,
          side,
        });

        return fail(`Failed to set TP/SL for ${symbol}: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 13. pacifica_modify_order
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_modify_order",
    "Modify an existing limit order (cancel and replace with new parameters)",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      order_id: z.number().int().positive().describe("The order ID to modify"),
      price: z.number().positive().optional().describe("New limit price"),
      size: z.number().positive().optional().describe("New order size"),
      tp: z.number().positive().optional().describe("New take-profit trigger price"),
      sl: z.number().positive().optional().describe("New stop-loss trigger price"),
    },
    async ({ symbol, order_id, price, size, tp, sl }) => {
      const toolName = "pacifica_modify_order";
      const params = { symbol, order_id, price, size, tp, sl };

      try {
        const check = guardrails.check({ action: "modify_order" });
        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "modify_order",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Modify rejected by guardrails: ${check.reason}`);
        }

        // Find existing order
        const orders = await client.getOrders();
        const existing = orders.find(
          (o) => o.orderId === order_id && o.symbol.toUpperCase() === symbol.toUpperCase(),
        );
        if (!existing) {
          return fail(`Order ${order_id} not found for ${symbol}. Use pacifica_get_orders to check.`);
        }

        // Cancel old order
        await client.cancelOrder(symbol, order_id);

        // Place new order with modified params
        const newPrice = price ?? existing.price;
        const newSize = size ?? existing.initialAmount;

        const takeProfit: TpSlConfig | undefined = tp
          ? { stop_price: String(tp) }
          : undefined;
        const stopLoss: TpSlConfig | undefined = sl
          ? { stop_price: String(sl) }
          : undefined;

        const result = await client.placeLimitOrder({
          symbol,
          price: String(newPrice),
          amount: String(newSize),
          side: existing.side,
          tif: "GTC",
          reduce_only: existing.reduceOnly,
          take_profit: takeProfit,
          stop_loss: stopLoss,
        });

        await logger.logSuccess({
          tool: toolName,
          action: "modify_order",
          params,
          response: { oldOrderId: order_id, newOrderId: result.orderId },
          symbol,
        });

        return ok({
          success: true,
          oldOrderId: order_id,
          newOrderId: result.orderId,
          symbol,
          price: newPrice,
          size: newSize,
          message: `Order ${order_id} replaced with new order ${result.orderId}`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({
          tool: toolName,
          action: "modify_order",
          params,
          response: { error: errorMessage },
          symbol,
        });
        return fail(`Failed to modify order ${order_id}: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 14. pacifica_set_trailing_stop
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_set_trailing_stop",
    "Set a trailing stop on an open position. Tracks the best price and closes when price retraces by the specified distance.",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      distance_percent: z.number().positive().describe("Trail distance as percentage (e.g. 2 = 2%)"),
      position_side: z
        .enum(["long", "short"])
        .optional()
        .describe("Position side (auto-detected if omitted)"),
    },
    async ({ symbol, distance_percent, position_side }) => {
      const toolName = "pacifica_set_trailing_stop";
      const params = { symbol, distance_percent, position_side };

      try {
        const check = guardrails.check({ action: "set_trailing_stop" });
        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "set_trailing_stop",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Trailing stop rejected by guardrails: ${check.reason}`);
        }

        // Auto-detect position side if not provided
        let side = position_side;
        if (!side) {
          const positions = await client.getPositions();
          const pos = positions.find(
            (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
          );
          if (!pos) {
            return fail(`No open position found for ${symbol}. Cannot set trailing stop without a position.`);
          }
          side = pos.side;
        }

        smartManager.load();
        const order = smartManager.addTrailingStop({
          symbol,
          positionSide: side,
          distancePercent: distance_percent,
        });

        if (!smartManager.isRunning()) {
          smartManager.start();
        }

        await logger.logSuccess({
          tool: toolName,
          action: "set_trailing_stop",
          params,
          response: { smartOrderId: order.id },
          symbol,
        });

        return ok({
          success: true,
          smartOrderId: order.id,
          symbol,
          positionSide: side,
          distancePercent: distance_percent,
          message: `Trailing stop set for ${symbol} ${side} position with ${distance_percent}% distance`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({
          tool: toolName,
          action: "set_trailing_stop",
          params,
          response: { error: errorMessage },
          symbol,
        });
        return fail(`Failed to set trailing stop: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 15. pacifica_set_partial_tp
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_set_partial_tp",
    "Set partial take-profit levels on an open position. Closes a percentage of the position at each price level.",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      levels: z.array(z.object({
        price: z.number().positive().describe("Target price to trigger this level"),
        percent: z.number().positive().max(100).describe("Percentage of position to close (e.g. 25 = 25%)"),
      })).min(1).describe("Take-profit levels"),
      position_side: z
        .enum(["long", "short"])
        .optional()
        .describe("Position side (auto-detected if omitted)"),
    },
    async ({ symbol, levels, position_side }) => {
      const toolName = "pacifica_set_partial_tp";
      const params = { symbol, levels, position_side };

      try {
        const check = guardrails.check({ action: "set_partial_tp" });
        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "set_partial_tp",
            params,
            rejectionReason: check.reason!,
            symbol,
          });
          return fail(`Partial TP rejected by guardrails: ${check.reason}`);
        }

        // Validate total percent doesn't exceed 100
        const totalPercent = levels.reduce((sum, l) => sum + l.percent, 0);
        if (totalPercent > 100) {
          return fail(`Total percentage across levels (${totalPercent}%) exceeds 100%.`);
        }

        // Auto-detect position side
        let side = position_side;
        if (!side) {
          const positions = await client.getPositions();
          const pos = positions.find(
            (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
          );
          if (!pos) {
            return fail(`No open position found for ${symbol}. Cannot set partial TP without a position.`);
          }
          side = pos.side;
        }

        smartManager.load();
        const order = smartManager.addPartialTp({
          symbol,
          positionSide: side,
          levels,
        });

        if (!smartManager.isRunning()) {
          smartManager.start();
        }

        await logger.logSuccess({
          tool: toolName,
          action: "set_partial_tp",
          params,
          response: { smartOrderId: order.id },
          symbol,
        });

        return ok({
          success: true,
          smartOrderId: order.id,
          symbol,
          positionSide: side,
          levels,
          message: `Partial take-profit set for ${symbol} ${side} with ${levels.length} level(s)`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({
          tool: toolName,
          action: "set_partial_tp",
          params,
          response: { error: errorMessage },
          symbol,
        });
        return fail(`Failed to set partial TP: ${errorMessage}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // 16. pacifica_cancel_smart_order
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_cancel_smart_order",
    "Cancel an active smart order (trailing stop or partial take-profit) by ID",
    {
      smart_order_id: z.string().describe("The smart order ID to cancel"),
    },
    async ({ smart_order_id }) => {
      const toolName = "pacifica_cancel_smart_order";
      const params = { smart_order_id };

      try {
        const check = guardrails.check({ action: "cancel_smart_order" });
        if (!check.allowed) {
          await logger.logRejection({
            tool: toolName,
            action: "cancel_smart_order",
            params,
            rejectionReason: check.reason!,
          });
          return fail(`Cancel smart order rejected by guardrails: ${check.reason}`);
        }

        smartManager.load();
        const cancelled = smartManager.cancel(smart_order_id);

        if (!cancelled) {
          return fail(`Smart order ${smart_order_id} not found or not active. Use pacifica_get_smart_orders to check.`);
        }

        await logger.logSuccess({
          tool: toolName,
          action: "cancel_smart_order",
          params,
          response: { cancelled: true, smartOrderId: smart_order_id },
        });

        return ok({
          success: true,
          smartOrderId: smart_order_id,
          symbol: cancelled.symbol,
          type: cancelled.type,
          message: `Smart order ${smart_order_id} cancelled`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({
          tool: toolName,
          action: "cancel_smart_order",
          params,
          response: { error: errorMessage },
        });
        return fail(`Failed to cancel smart order: ${errorMessage}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Arb Tools (6) — funding rate arbitrage bot
// ---------------------------------------------------------------------------

function registerArbTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
): void {
  const arbManager = new ArbManager(client, config.arb);
  arbManager.load();

  // -----------------------------------------------------------------------
  // pacifica_arb_scan
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_arb_scan",
    "Scan Pacifica markets for funding rate arbitrage opportunities. Returns ranked list with APR, side (who collects), volume, and cross-exchange divergence (if available).",
    {
      min_apr: z.number().optional().describe("Minimum annualized APR threshold (%). Defaults to config value."),
      include_external: z.boolean().optional().describe("Include Binance/Bybit rate comparison."),
    },
    async (params) => {
      try {
        const arbConfig = {
          ...config.arb,
          ...(params.min_apr !== undefined ? { min_apr_threshold: params.min_apr } : {}),
          ...(params.include_external !== undefined ? { use_external_rates: params.include_external } : {}),
        };
        const mgr = new ArbManager(client, arbConfig);
        mgr.load();
        const opportunities = await mgr.scanOpportunities();
        return ok({ opportunities, count: opportunities.length });
      } catch (err) {
        return fail(`Arb scan failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_arb_positions
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_arb_positions",
    "Get current and historical arb positions with P&L details.",
    {
      status: z.enum(["active", "closed", "error", "all"]).optional().default("all").describe("Filter by position status."),
    },
    async (params) => {
      try {
        const filter = params.status !== "all" ? { status: params.status } : undefined;
        const positions = arbManager.getPositions(filter);
        return ok({ positions, count: positions.length });
      } catch (err) {
        return fail(`Failed to get arb positions: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_arb_pnl_summary
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_arb_pnl_summary",
    "Get lifetime P&L summary for the arb bot: total funding collected, fees paid, net profit, win rate.",
    {},
    async () => {
      try {
        const positions = arbManager.getPositions();
        const lifetime = arbManager.getLifetimeStats();
        const summary = buildPnlSummary(positions, lifetime);
        return ok(summary);
      } catch (err) {
        return fail(`Failed to get arb P&L summary: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_arb_open (write — guarded)
  // -----------------------------------------------------------------------
  const openToolName = "pacifica_arb_open";
  server.tool(
    openToolName,
    "Open a funding rate arb position on the specified symbol. Requires user approval via guardrails.",
    {
      symbol: z.string().describe("Market symbol, e.g. BTC"),
      size_usd: z.number().positive().optional().describe("Position size in USD. Defaults to config value."),
    },
    async (params) => {
      const guardCheck = guardrails.check({
        action: "arb_open",
        orderSizeUsd: params.size_usd ?? config.arb.position_size_usd,
        leverage: 1,
      });

      if (!guardCheck.allowed) {
        await logger.logRejection({
          tool: openToolName,
          action: "arb_open",
          params,
          rejectionReason: guardCheck.reason ?? "guardrail blocked",
        });
        return fail(`Guardrail rejected: ${guardCheck.reason}`);
      }

      try {
        const opportunities = await arbManager.scanOpportunities();
        const opp = opportunities.find(
          (o) => o.symbol.toUpperCase() === params.symbol.toUpperCase(),
        );
        if (!opp) {
          return fail(`No arb opportunity found for ${params.symbol} at current config thresholds.`);
        }

        if (!arbManager.canEnter(opp)) {
          return fail(`Cannot enter: arb guardrails blocked (cooldown, daily limit, or fee ratio).`);
        }

        // Use the shared arbManager so state (notional cap, cooldowns, positionsOpened) is tracked
        const result = await arbManager.openPosition(opp);

        if (!result.success) {
          return fail(`Order failed: ${result.error}`);
        }

        await spendingTracker.recordSpend(config.arb.position_size_usd, "arb_open", params.symbol.toUpperCase());

        return ok({
          success: true,
          positionId: result.positionId,
          symbol: params.symbol.toUpperCase(),
          side: opp.side,
          notionalUsd: config.arb.position_size_usd,
          entryApr: opp.annualizedApr,
          message: "Arb position opened. Use pacifica_arb_positions to monitor.",
        });
      } catch (err) {
        return fail(`Arb open failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_arb_close (write — guarded)
  // -----------------------------------------------------------------------
  const closeToolName = "pacifica_arb_close";
  server.tool(
    closeToolName,
    "Close an active arb position by ID.",
    {
      position_id: z.string().describe("Position ID from pacifica_arb_positions."),
    },
    async (params) => {
      const guardCheck = guardrails.check({ action: "arb_close" });

      if (!guardCheck.allowed) {
        await logger.logRejection({
          tool: closeToolName,
          action: "arb_close",
          params,
          rejectionReason: guardCheck.reason ?? "guardrail blocked",
        });
        return fail(`Guardrail rejected: ${guardCheck.reason}`);
      }

      try {
        const result = await arbManager.closePosition(params.position_id);
        if (result.success) {
          return ok({ success: true, positionId: params.position_id });
        }
        return fail(`Close failed: ${result.error}`);
      } catch (err) {
        return fail(`Arb close failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_arb_configure (write — guarded)
  // -----------------------------------------------------------------------
  const configToolName = "pacifica_arb_configure";
  server.tool(
    configToolName,
    "Update arb bot configuration. Changes take effect on the next poll cycle.",
    {
      enabled: z.boolean().optional().describe("Enable or disable the arb bot."),
      min_apr_threshold: z.number().positive().optional().describe("Minimum APR % to enter."),
      position_size_usd: z.number().positive().optional().describe("Position size in USD."),
      max_concurrent_positions: z.number().int().positive().optional().describe("Max concurrent positions."),
      exit_policy: z.enum(["settlement", "rate_inverted", "apr_below", "pnl_target"]).optional().describe("Exit policy."),
    },
    async (params) => {
      const guardCheck = guardrails.check({ action: "arb_configure" });

      if (!guardCheck.allowed) {
        await logger.logRejection({
          tool: configToolName,
          action: "arb_configure",
          params,
          rejectionReason: guardCheck.reason ?? "guardrail blocked",
        });
        return fail(`Guardrail rejected: ${guardCheck.reason}`);
      }

      try {
        const cfg = await loadConfig();
        if (params.enabled !== undefined) cfg.arb.enabled = params.enabled;
        if (params.min_apr_threshold !== undefined) cfg.arb.min_apr_threshold = params.min_apr_threshold;
        if (params.position_size_usd !== undefined) cfg.arb.position_size_usd = params.position_size_usd;
        if (params.max_concurrent_positions !== undefined) cfg.arb.max_concurrent_positions = params.max_concurrent_positions;
        if (params.exit_policy !== undefined) cfg.arb.exit_policy = params.exit_policy;
        await saveConfig(cfg);
        return ok({ success: true, arb: cfg.arb });
      } catch (err) {
        return fail(`Config update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// M11 Intelligence Tools (3) — patterns, feed, reputation
// ---------------------------------------------------------------------------

function registerM11IntelligenceTools(
  server: McpServer,
  client: PacificaClient,
): void {
  // -----------------------------------------------------------------------
  // pacifica_intelligence_patterns
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_intelligence_patterns",
    "Get verified market patterns and check if current conditions match any of them",
    {
      market: z.string().optional().describe("Optional market symbol to check current conditions against (e.g. BTC, ETH)"),
      min_win_rate: z.number().optional().describe("Minimum win rate filter (0–1, default 0.6)"),
      min_sample_size: z.number().optional().describe("Minimum sample size filter (default 20)"),
    },
    async ({ market, min_win_rate, min_sample_size }) => {
      try {
        const allPatterns = await loadPatterns();
        const minWr = min_win_rate ?? 0.6;
        const minSample = min_sample_size ?? 20;

        const verified = allPatterns.filter(
          (p) => p.win_rate >= minWr && p.sample_size >= minSample,
        );

        let matching_patterns: DetectedPattern[] = [];

        if (market !== undefined) {
          const markets = await client.getMarkets();
          const upper = market.toUpperCase();
          const found = markets.find(
            (m) => m.symbol.toUpperCase() === upper ||
                   m.symbol.toUpperCase().startsWith(upper + "-"),
          );

          if (found) {
            // Build a basic MarketContext-like lookup from live market data
            const liveCtx: Record<string, number> = {
              funding_rate: found.fundingRate,
              oi_change_4h_pct: 0, // unavailable in a single snapshot
              buy_pressure: 0.5,   // unavailable without trade data
              momentum_value: 0,   // unavailable without trade data
              large_orders_count: 0,
            };

            matching_patterns = verified.filter((p) =>
              p.conditions.every((cond) => {
                const val = liveCtx[cond.axis];
                if (val === undefined) return false;
                const numVal = cond.value as number;
                switch (cond.op) {
                  case "lt":  return val < numVal;
                  case "gt":  return val > numVal;
                  case "lte": return val <= numVal;
                  case "gte": return val >= numVal;
                  case "eq":  return val === numVal;
                  default:    return false;
                }
              }),
            );
          }
        }

        return ok({
          matching_patterns,
          all_verified_patterns: verified,
          total: allPatterns.length,
        });
      } catch (err) {
        return fail(`Error loading intelligence patterns: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_intelligence_feed
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_intelligence_feed",
    "Get live intelligence feed: active verified patterns, whale activity, and signals from high-reputation traders",
    {
      limit: z.number().int().positive().optional().describe("Max number of whale activity and signal items to return (default 20)"),
    },
    async ({ limit }) => {
      try {
        const [records, patterns, repMap] = await Promise.all([
          loadRecords(),
          loadPatterns(),
          loadReputation(),
        ]);

        const effectiveLimit = limit ?? 20;

        const active_patterns = patterns.filter((p) => p.verified);

        // Whale activity: records with large_orders_count >= 3, most recent first
        const whale_activity = records
          .filter((r) => r.market_context.large_orders_count >= 3)
          .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
          .slice(0, effectiveLimit)
          .map((r) => ({
            asset: r.asset,
            direction: r.direction,
            size_usd: r.size_usd,
            large_orders_count: r.market_context.large_orders_count,
            opened_at: r.opened_at,
          }));

        // High-rep signals: open records (no closed_at) where trader rep > 70
        const high_rep_signals = records
          .filter((r) => r.closed_at === undefined)
          .filter((r) => {
            const rep = repMap.get(r.trader_id);
            return rep !== undefined && rep.overall_rep_score > 70;
          })
          .sort((a, b) => b.opened_at.localeCompare(a.opened_at))
          .slice(0, effectiveLimit)
          .map((r) => ({
            asset: r.asset,
            direction: r.direction,
            size_usd: r.size_usd,
            rep_score: repMap.get(r.trader_id)!.overall_rep_score,
            opened_at: r.opened_at,
          }));

        return ok({
          active_patterns,
          whale_activity,
          high_rep_signals,
          generated_at: new Date().toISOString(),
        });
      } catch (err) {
        return fail(`Error loading intelligence feed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_intelligence_reputation
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_intelligence_reputation",
    "Get anonymised trader reputation leaderboard ranked by accuracy",
    {
      limit: z.number().int().positive().optional().describe("Number of traders to return (default 10)"),
      sort_by: z.enum(["overall_rep_score", "win_rate", "total_trades"]).optional().describe("Sort field (default overall_rep_score)"),
    },
    async ({ limit, sort_by }) => {
      try {
        const repMap = await loadReputation();
        const effectiveLimit = limit ?? 10;
        const sortField = sort_by ?? "overall_rep_score";

        const arr = Array.from(repMap.values());

        arr.sort((a, b) => {
          switch (sortField) {
            case "win_rate":     return b.overall_win_rate - a.overall_win_rate;
            case "total_trades": return b.total_trades - a.total_trades;
            default:             return b.overall_rep_score - a.overall_rep_score;
          }
        });

        const leaderboard = arr.slice(0, effectiveLimit).map((r) => ({
          ...r,
          trader_id: r.trader_id.slice(0, 12),
        }));

        return ok({
          leaderboard,
          total_traders: repMap.size,
        });
      } catch (err) {
        return fail(`Error loading reputation leaderboard: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// New Tools: simulate, leaderboard, my_intelligence
// ---------------------------------------------------------------------------

const MAINTENANCE_MARGIN_RATE = 0.005;

function registerNewTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
): void {
  // -----------------------------------------------------------------------
  // pacifica_simulate
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_simulate",
    "Simulate a trade: calculate liquidation price, P&L at different price scenarios, and funding cost over time. No order is placed. Use this before placing any order to understand the risk.",
    {
      side: z.enum(["long", "short"]).describe("Trade direction"),
      market: z.string().describe("Market symbol, e.g. ETH-USDC-PERP or ETH"),
      size_usd: z.number().positive().describe("Notional position size in USD"),
      leverage: z.number().min(1).max(100).optional().describe("Leverage (default 5)"),
      entry_price: z.number().positive().optional().describe("Override entry price; defaults to current mark price"),
    },
    async ({ side, market, size_usd, leverage = 5, entry_price }) => {
      try {
        const symbol = market.toUpperCase().includes("-USDC-PERP")
          ? market.toUpperCase()
          : `${market.toUpperCase()}-USDC-PERP`;

        const markets = await client.getMarkets();
        const mkt = markets.find((m) => m.symbol === symbol);
        if (!mkt) {
          return fail(`Market "${symbol}" not found`);
        }

        const ep = entry_price ?? mkt.markPrice ?? mkt.price;
        const fundingRate = mkt.fundingRate;
        const marginUsd = size_usd / leverage;

        const liqPrice = side === "long"
          ? ep * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE)
          : ep * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);
        const liqPct = ((liqPrice - ep) / ep) * 100;

        const scenarios = [-0.20, -0.10, -0.05, 0.05, 0.10, 0.20].map((f) => {
          const targetPrice = ep * (1 + f);
          const priceDelta = side === "long"
            ? (targetPrice - ep) / ep
            : (ep - targetPrice) / ep;
          return {
            price_change_pct: f * 100,
            target_price: targetPrice,
            pnl_usd: priceDelta * size_usd,
            margin_return_pct: (priceDelta * size_usd / marginUsd) * 100,
          };
        });

        const rawFundingImpact = side === "long" ? -fundingRate : fundingRate;
        const fundingPerInterval = rawFundingImpact * size_usd;

        // Intelligence signal check
        let signal_tip: string | null = null;
        try {
          const patterns = await loadPatterns();
          if (patterns.length > 0) {
            const signals = await scanForActiveSignals(client, patterns);
            const match = signals.find((s) => s.asset === symbol && s.direction === side);
            if (match) {
              signal_tip = `Pattern match: "${match.pattern.name}" (${(match.pattern.win_rate * 100).toFixed(1)}% win rate, n=${match.pattern.sample_size})`;
            }
          }
        } catch { /* optional */ }

        return ok({
          market: symbol, side, notional_usd: size_usd, leverage,
          entry_price: ep,
          liquidation_price: liqPrice,
          liquidation_distance_pct: liqPct,
          margin_usd: marginUsd,
          funding_rate_per_8h: fundingRate,
          funding_8h_usd: fundingPerInterval,
          funding_24h_usd: fundingPerInterval * 3,
          funding_7d_usd: fundingPerInterval * 21,
          funding_direction: fundingPerInterval >= 0 ? "earn" : "pay",
          scenarios,
          signal_tip,
        });
      } catch (err) {
        return fail(`Simulation error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_leaderboard
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_leaderboard",
    "Get the live Pacifica testnet leaderboard with 1D/7D/30D/all-time P&L for each trader. Use this to identify top-performing traders whose strategies and patterns to monitor.",
    {
      limit: z.number().int().positive().max(50).optional().describe("Number of traders (default 10, max 50)"),
    },
    async ({ limit = 10 }) => {
      try {
        const traders = await client.getLeaderboard(limit);
        return ok({
          leaderboard: traders,
          count: traders.length,
          source: "test-api.pacifica.fi",
        });
      } catch (err) {
        return fail(`Leaderboard error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // -----------------------------------------------------------------------
  // pacifica_my_intelligence
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_my_intelligence",
    "Get your personal trading intelligence profile: which market conditions you perform best in, your rep score, win rate by condition, and how you compare to the top-10 leaderboard traders. Call this before deciding whether to trade.",
    {},
    async () => {
      try {
        const myTraderId = createHash("sha256")
          .update(config.private_key)
          .digest("hex");

        const allRecords = await loadRecords();
        const myRecords = allRecords.filter((r) => r.trader_id === myTraderId);

        if (myRecords.length === 0) {
          return ok({
            message: "No intelligence records found for your wallet. Records are captured automatically when you trade via pacifica trade.",
            wallet: (config as unknown as { signer?: { publicKey?: string } }).signer?.publicKey ?? "unknown",
            total_records: 0,
          });
        }

        const repMap = computeReputation(myRecords);
        const myRep = repMap.get(myTraderId);
        const myPatterns = detectPatterns(myRecords);

        const byMarket = new Map<string, { total: number; wins: number; pnl_sum: number }>();
        for (const r of myRecords.filter((r) => r.outcome !== undefined)) {
          const m = byMarket.get(r.asset) ?? { total: 0, wins: 0, pnl_sum: 0 };
          m.total++;
          if (r.outcome!.profitable) m.wins++;
          m.pnl_sum += r.outcome!.pnl_pct;
          byMarket.set(r.asset, m);
        }

        let lbAvgScore: number | undefined;
        try {
          const lb = await client.getLeaderboard(10);
          lbAvgScore = Math.round(lb.reduce((s, t) => s + t.overall_rep_score, 0) / lb.length);
        } catch { /* optional */ }

        return ok({
          trader_id: myTraderId.slice(0, 12),
          total_records: myRecords.length,
          closed_trades: myRep?.closed_trades ?? 0,
          overall_rep_score: myRep?.overall_rep_score ?? 0,
          overall_win_rate: myRep?.overall_win_rate ?? 0,
          top_patterns: myRep?.top_patterns ?? [],
          strongest_conditions: Object.values(myRep?.accuracy_by_condition ?? {})
            .filter((c) => c.total_trades >= 2)
            .sort((a, b) => b.win_rate - a.win_rate)
            .slice(0, 5),
          top_markets: [...byMarket.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([asset, m]) => ({
              asset,
              total_trades: m.total,
              win_rate: m.total > 0 ? m.wins / m.total : 0,
              avg_pnl_pct: m.total > 0 ? m.pnl_sum / m.total : 0,
            })),
          personal_patterns: myPatterns.map((p) => ({
            name: p.name,
            win_rate: p.win_rate,
            sample_size: p.sample_size,
            avg_pnl_pct: p.avg_pnl_pct,
          })),
          leaderboard_avg_score: lbAvgScore ?? null,
          recommendation: myRep && myRep.top_patterns.length > 0
            ? `Your highest win-rate condition is "${myRep.top_patterns[0]}". Prioritize trades where this condition is active.`
            : "Trade more to build your intelligence profile.",
        });
      } catch (err) {
        return fail(`My intelligence error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// M12 Social Intelligence Tool (1) — pacifica_social_context
// ---------------------------------------------------------------------------

function registerSocialIntelligenceTool(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
): void {
  server.tool(
    "pacifica_social_context",
    "Get Elfa social intelligence for an asset: mention velocity, smart-follower sentiment, trending narratives, and optionally combined signal confidence vs onchain patterns. Requires elfa.api_key in .pacifica.yaml.",
    {
      asset: z.string().describe("Asset ticker, e.g. ETH, BTC, SOL (or full symbol like ETH-USDC-PERP)"),
      include_pattern_match: z.boolean().optional().describe("If true, load current verified patterns and score combined onchain+social confidence for each"),
    },
    async ({ asset, include_pattern_match }) => {
      try {
        const elfaKey = config.elfa?.api_key;
        if (!elfaKey) {
          return fail(
            "Elfa API key not configured. Add `elfa:\\n  api_key: your-key` to ~/.pacifica.yaml to enable social intelligence.",
          );
        }

        const ticker = asset.toUpperCase().split("-")[0] ?? asset.toUpperCase();
        const social = await fetchSocialContext(ticker, elfaKey, config.elfa?.cache_ttl_minutes);

        if (!social) {
          return fail(`Failed to fetch social context for ${ticker} from Elfa API.`);
        }

        const result: Record<string, unknown> = { asset: ticker, social };

        if (include_pattern_match) {
          try {
            const patterns = await loadPatterns();

            if (patterns.length > 0) {
              const confirmedSignals: ConfirmedSignal[] = patterns.map((p) => {
                const { confidence, reason } = scoreConfidence(p, social);
                return {
                  pattern: p,
                  social,
                  confidence,
                  confidence_reason: reason,
                };
              });

              // Sort: high → medium → low → unconfirmed
              const ORDER: ConfirmedSignal["confidence"][] = ["high", "medium", "low", "unconfirmed"];
              confirmedSignals.sort(
                (a, b) => ORDER.indexOf(a.confidence) - ORDER.indexOf(b.confidence),
              );

              result.confirmed_signals = confirmedSignals;
              result.best_signal = confirmedSignals[0] ?? null;
            } else {
              result.confirmed_signals = [];
              result.best_signal = null;
              result.note = "No verified patterns found. Run `pacifica intelligence run` to detect patterns from your trade history.";
            }
          } catch {
            // Pattern matching is best-effort — don't fail the tool
            result.confirmed_signals = [];
            result.best_signal = null;
          }
        }

        return ok(result);
      } catch (err) {
        return fail(`Social context error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. Load configuration and initialize core components
  // -----------------------------------------------------------------------
  const config = await loadConfig();
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

  // -----------------------------------------------------------------------
  // 2. Initialize agent safety modules
  // -----------------------------------------------------------------------
  const spendingTracker = new SpendingTracker();
  await spendingTracker.load();

  const guardrails = new GuardrailChecker(
    config.agent,
    () => spendingTracker.getDailySpend(),
  );

  const logger = new AgentActionLogger();

  // -----------------------------------------------------------------------
  // 2b. Initialize analytics & smart order modules
  // -----------------------------------------------------------------------
  const journalLogger = new JournalLogger();
  const smartManager = new SmartOrderManager(client);
  smartManager.load();
  const alertManager = new AlertManager();

  // -----------------------------------------------------------------------
  // 3. Create and configure the MCP server
  // -----------------------------------------------------------------------
  const server = new McpServer({
    name: "pacifica-dex",
    version: "0.1.0",
  });

  // Register all tool handlers
  registerReadTools(server, client, config, guardrails, spendingTracker, logger);
  registerAnalyticsTools(server, client, journalLogger, smartManager);
  registerFundingTools(server, client);
  registerIntelligenceTools(server, client, alertManager);
  registerM11IntelligenceTools(server, client);
  registerSocialIntelligenceTool(server, client, config);
  registerNewTools(server, client, config);
  registerWriteTools(server, client, config, guardrails, spendingTracker, logger, smartManager);
  registerArbTools(server, client, config, guardrails, spendingTracker, logger);

  // -----------------------------------------------------------------------
  // 4. Connect transport and start serving
  // -----------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Pacifica MCP server fatal error:", err);
  process.exit(1);
});
