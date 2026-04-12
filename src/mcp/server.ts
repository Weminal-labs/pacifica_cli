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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { PacificaClient } from "../core/sdk/client.js";
import { createSignerFromConfig } from "../core/sdk/signer.js";
import type { Market, OrderSide, TpSlConfig, FundingRate } from "../core/sdk/types.js";
import { loadConfig } from "../core/config/loader.js";
import type { PacificaConfig } from "../core/config/types.js";
import { GuardrailChecker } from "../core/agent/guardrails.js";
import { SpendingTracker } from "../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../core/agent/action-logger.js";
import { JournalLogger } from "../core/journal/logger.js";
import { calculateRiskSummary } from "../core/risk/calculator.js";
import { SmartOrderManager } from "../core/smart/manager.js";
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
        const check = guardrails.check({ action: "close_position" });

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
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. Load configuration and initialize core components
  // -----------------------------------------------------------------------
  const config = await loadConfig();
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network: config.network, signer });

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
  registerWriteTools(server, client, config, guardrails, spendingTracker, logger, smartManager);

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
