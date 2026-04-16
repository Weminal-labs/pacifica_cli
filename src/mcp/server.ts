#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica DEX MCP Server — lean v1 surface (thesis: CLI + MCP + patterns)
// ---------------------------------------------------------------------------
// Exposes a tight set of tools to AI agents over stdio.
//
// Read tools          (8) — markets, ticker, orderbook, positions, account,
//                           orders, agent_status, agent_log
// Analytics tools     (2) — trade_journal, pnl_summary
// Funding tools       (2) — funding_rates, funding_history
// Write tools         (4) — place_order, cancel_order, close_position, set_tpsl
// Pattern tools       (5) — list/get/run/simulate/save pattern
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { PacificaClient } from "../core/sdk/client.js";
import { createSignerFromConfig } from "../core/sdk/signer.js";
import type { OrderSide, TpSlConfig } from "../core/sdk/types.js";
import { loadConfig } from "../core/config/loader.js";
import type { PacificaConfig } from "../core/config/types.js";
import { GuardrailChecker } from "../core/agent/guardrails.js";
import { SpendingTracker } from "../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../core/agent/action-logger.js";
import { registerPatternTools } from "./pattern-tools.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toOrderSide(side: "buy" | "sell"): OrderSide {
  return side === "buy" ? "bid" : "ask";
}

function closingSide(positionSide: "long" | "short"): OrderSide {
  return positionSide === "long" ? "ask" : "bid";
}

function ok(data: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(
  message: string,
): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

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
// Read tools
// ---------------------------------------------------------------------------

function registerReadTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
): void {
  server.tool(
    "pacifica_get_markets",
    "Get all available markets with price, volume, open interest, and funding rates",
    {},
    async () => {
      try {
        return ok(await client.getMarkets());
      } catch (err) {
        return fail(`Error fetching markets: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_ticker",
    "Get ticker data (price, volume, funding, OI) for a single market",
    { symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)") },
    async ({ symbol }) => {
      try {
        const markets = await client.getMarkets();
        const upper = symbol.toUpperCase();
        const market = markets.find((m) => m.symbol.toUpperCase() === upper);
        if (!market) return fail(`Market not found: ${symbol}. Use pacifica_get_markets to list available symbols.`);
        return ok(market);
      } catch (err) {
        return fail(`Error fetching ticker for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_orderbook",
    "Get the order book (bids and asks) for a market",
    {
      symbol: z.string().describe("Trading symbol (e.g. BTC, ETH, SOL)"),
      depth: z.number().int().positive().optional().describe("Number of price levels to return (default: all)"),
    },
    async ({ symbol, depth }) => {
      try {
        return ok(await client.getOrderBook(symbol, depth));
      } catch (err) {
        return fail(`Error fetching order book for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_positions",
    "Get all open positions with entry price, margin, PnL, and liquidation price",
    {},
    async () => {
      try {
        return ok(await client.getPositions());
      } catch (err) {
        return fail(`Error fetching positions: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_account",
    "Get account summary: balance, equity, margin used, and fee tier",
    {},
    async () => {
      try {
        return ok(await client.getAccount());
      } catch (err) {
        return fail(`Error fetching account: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_get_orders",
    "Get all open orders with price, size, fill status, and type",
    {},
    async () => {
      try {
        return ok(await client.getOrders());
      } catch (err) {
        return fail(`Error fetching orders: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

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

  server.tool(
    "pacifica_agent_log",
    "Get the agent action audit trail with optional filtering",
    {
      filter: z.enum(["today", "all"]).optional().describe("Filter scope (default: today)"),
      limit: z.number().int().positive().optional().describe("Maximum number of entries (default: 50)"),
    },
    async ({ filter, limit }) => {
      try {
        const isToday = filter !== "all";
        const entries = await logger.getEntries({ today: isToday, limit: limit ?? 50 });
        return ok({ count: entries.length, filter: isToday ? "today" : "all", entries });
      } catch (err) {
        return fail(`Error fetching agent log: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Analytics tools
// ---------------------------------------------------------------------------

function registerAnalyticsTools(
  server: McpServer,
  client: PacificaClient,
): void {
  server.tool(
    "pacifica_trade_journal",
    "Get trade history from the Pacifica API with optional filtering by symbol",
    {
      symbol: z.string().optional().describe("Filter by trading symbol"),
      limit: z.number().int().positive().optional().describe("Maximum entries (default: 50)"),
    },
    async ({ symbol, limit }) => {
      try {
        const entries = await client.getTradeHistory(symbol?.toUpperCase(), limit ?? 50);
        return ok({ count: entries.length, entries });
      } catch (err) {
        return fail(`Error fetching trade history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_pnl_summary",
    "Get PnL summary: total trades, total PnL, total fees, win rate",
    { limit: z.number().int().positive().optional().describe("Trades to analyze (default: 100)") },
    async ({ limit }) => {
      try {
        const entries = await client.getTradeHistory(undefined, limit ?? 100);
        let totalPnl = 0, totalFees = 0, wins = 0, losses = 0;
        for (const e of entries) {
          totalPnl += e.pnl;
          totalFees += e.fee;
          if (e.pnl > 0) wins++;
          else if (e.pnl < 0) losses++;
        }
        const totalTrades = entries.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        return ok({
          totalTrades, wins, losses,
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
}

// ---------------------------------------------------------------------------
// Funding tools
// ---------------------------------------------------------------------------

function registerFundingTools(server: McpServer, client: PacificaClient): void {
  server.tool(
    "pacifica_funding_rates",
    "Get current funding rates for all Pacifica markets with price and APR",
    {},
    async () => {
      try {
        const markets = await client.getMarkets();
        return ok(markets.map((m) => ({
          symbol: m.symbol,
          fundingRate: m.fundingRate,
          nextFundingRate: m.nextFundingRate,
          annualizedApr: m.fundingRate * 3 * 365,
          price: m.price,
        })));
      } catch (err) {
        return fail(`Error fetching funding rates: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "pacifica_funding_history",
    "Get historical funding rates for a Pacifica market",
    {
      symbol: z.string().describe("Trading symbol"),
      limit: z.number().int().positive().optional().describe("Entries to return (default: 20)"),
    },
    async ({ symbol, limit }) => {
      try {
        const history = await client.getFundingHistory(symbol, limit ?? 20);
        return ok({ symbol, count: history.length, history });
      } catch (err) {
        return fail(`Error fetching funding history for ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

function registerWriteTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
): void {
  server.tool(
    "pacifica_place_order",
    "Place a market or limit order on Pacifica DEX. Returns the order ID on success.",
    {
      symbol: z.string().describe("Trading symbol"),
      side: z.enum(["buy", "sell"]).describe("Order side"),
      size: z.number().positive().describe("Order size in base asset units"),
      type: z.enum(["market", "limit"]).default("market").describe("Order type"),
      price: z.number().positive().optional().describe("Limit price (limit orders)"),
      leverage: z.number().positive().optional().describe("Leverage multiplier"),
      tp: z.number().positive().optional().describe("Take-profit trigger price"),
      sl: z.number().positive().optional().describe("Stop-loss trigger price"),
      slippage: z.number().positive().optional().describe("Slippage tolerance percent"),
    },
    async ({ symbol, side, size, type, price, leverage, tp, sl, slippage }) => {
      const toolName = "pacifica_place_order";
      const params = { symbol, side, size, type, price, leverage, tp, sl, slippage };
      try {
        const markPrice = await getMarkPrice(client, symbol);
        if (markPrice === 0) {
          return fail(`Unknown symbol: ${symbol}. Use pacifica_get_markets to list available symbols.`);
        }
        const estimatedUsd = size * markPrice;

        const check = guardrails.check({ action: "place_order", orderSizeUsd: estimatedUsd, leverage, symbol });
        if (!check.allowed) {
          await logger.logRejection({ tool: toolName, action: "place_order", params, rejectionReason: check.reason!, symbol, side, amountUsd: estimatedUsd });
          return fail(`Order rejected by guardrails: ${check.reason}`);
        }

        const effectiveLeverage = leverage ?? config.defaults.leverage;
        if (leverage !== undefined) await client.updateLeverage(symbol, Math.round(leverage));

        const takeProfit: TpSlConfig | undefined = tp ? { stop_price: String(tp) } : undefined;
        const stopLoss: TpSlConfig | undefined = sl ? { stop_price: String(sl) } : undefined;

        const apiSide = toOrderSide(side);
        let result: { orderId: number };

        if (type === "limit") {
          if (price === undefined) return fail("Limit orders require a price.");
          result = await client.placeLimitOrder({
            symbol, price: String(price), amount: String(size), side: apiSide,
            tif: "GTC", reduce_only: false, take_profit: takeProfit, stop_loss: stopLoss,
          });
        } else {
          const effectiveSlippage = slippage ?? config.defaults.slippage;
          result = await client.placeMarketOrder({
            symbol, amount: String(size), side: apiSide,
            slippage_percent: String(effectiveSlippage), reduce_only: false,
            take_profit: takeProfit, stop_loss: stopLoss,
          });
        }

        await logger.logSuccess({
          tool: toolName, action: "place_order", params,
          response: { orderId: result.orderId, estimatedUsd, leverage: effectiveLeverage },
          symbol, side, amountUsd: estimatedUsd,
        });
        await spendingTracker.recordSpend(estimatedUsd, "place_order", symbol);

        return ok({
          success: true, orderId: result.orderId, symbol, side, size, type,
          estimatedValueUsd: Math.round(estimatedUsd * 100) / 100,
          leverage: effectiveLeverage,
          takeProfit: tp ?? null, stopLoss: sl ?? null,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({ tool: toolName, action: "place_order", params, response: { error: errorMessage }, symbol, side });
        return fail(`Failed to place order: ${errorMessage}`);
      }
    },
  );

  server.tool(
    "pacifica_cancel_order",
    "Cancel an open order by symbol and order ID",
    {
      symbol: z.string().describe("Trading symbol"),
      order_id: z.number().int().positive().describe("The order ID to cancel"),
    },
    async ({ symbol, order_id }) => {
      const toolName = "pacifica_cancel_order";
      const params = { symbol, order_id };
      try {
        const check = guardrails.check({ action: "cancel_order" });
        if (!check.allowed) {
          await logger.logRejection({ tool: toolName, action: "cancel_order", params, rejectionReason: check.reason!, symbol });
          return fail(`Cancel rejected by guardrails: ${check.reason}`);
        }
        await client.cancelOrder(symbol, order_id);
        await logger.logSuccess({ tool: toolName, action: "cancel_order", params, response: { cancelled: true, orderId: order_id }, symbol });
        return ok({ success: true, message: `Order ${order_id} for ${symbol} cancelled`, orderId: order_id, symbol });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({ tool: toolName, action: "cancel_order", params, response: { error: errorMessage }, symbol });
        return fail(`Failed to cancel order ${order_id}: ${errorMessage}`);
      }
    },
  );

  server.tool(
    "pacifica_close_position",
    "Close an open position by placing an opposite-side reduce-only market order",
    { symbol: z.string().describe("Trading symbol of the position to close") },
    async ({ symbol }) => {
      const toolName = "pacifica_close_position";
      const params = { symbol };
      try {
        const check = guardrails.check({ action: "close_position", symbol });
        if (!check.allowed) {
          await logger.logRejection({ tool: toolName, action: "close_position", params, rejectionReason: check.reason!, symbol });
          return fail(`Close position rejected by guardrails: ${check.reason}`);
        }

        const positions = await client.getPositions();
        const upper = symbol.toUpperCase();
        const position = positions.find((p) => p.symbol.toUpperCase() === upper);
        if (!position) return fail(`No open position found for ${symbol}.`);

        const side = closingSide(position.side);
        const result = await client.placeMarketOrder({
          symbol: position.symbol,
          amount: String(position.amount),
          side,
          slippage_percent: String(config.defaults.slippage),
          reduce_only: true,
        });

        const markPrice = await getMarkPrice(client, symbol);
        const estimatedUsd = position.amount * markPrice;

        await logger.logSuccess({
          tool: toolName, action: "close_position", params,
          response: { orderId: result.orderId, closedSide: position.side, amount: position.amount, estimatedUsd },
          symbol: position.symbol,
          side: position.side === "long" ? "sell" : "buy",
          amountUsd: estimatedUsd,
        });

        return ok({
          success: true, orderId: result.orderId, symbol: position.symbol,
          closedSide: position.side, closedAmount: position.amount,
          entryPrice: position.entryPrice,
          estimatedCloseValueUsd: Math.round(estimatedUsd * 100) / 100,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({ tool: toolName, action: "close_position", params, response: { error: errorMessage }, symbol });
        return fail(`Failed to close position for ${symbol}: ${errorMessage}`);
      }
    },
  );

  server.tool(
    "pacifica_set_tpsl",
    "Set or update take-profit and/or stop-loss on an existing position",
    {
      symbol: z.string().describe("Trading symbol"),
      side: z.enum(["buy", "sell"]).describe("Position side: buy = long, sell = short"),
      tp: z.number().positive().optional().describe("Take-profit trigger price"),
      sl: z.number().positive().optional().describe("Stop-loss trigger price"),
    },
    async ({ symbol, side, tp, sl }) => {
      const toolName = "pacifica_set_tpsl";
      const params = { symbol, side, tp, sl };
      if (tp === undefined && sl === undefined) return fail("At least one of 'tp' or 'sl' must be provided.");
      try {
        const check = guardrails.check({ action: "set_tpsl" });
        if (!check.allowed) {
          await logger.logRejection({ tool: toolName, action: "set_tpsl", params, rejectionReason: check.reason!, symbol });
          return fail(`Set TP/SL rejected by guardrails: ${check.reason}`);
        }

        const apiSide = toOrderSide(side);
        const takeProfit: TpSlConfig | undefined = tp ? { stop_price: String(tp) } : undefined;
        const stopLoss: TpSlConfig | undefined = sl ? { stop_price: String(sl) } : undefined;

        await client.setPositionTpSl(symbol, apiSide, takeProfit, stopLoss);

        await logger.logSuccess({
          tool: toolName, action: "set_tpsl", params,
          response: { tp: tp ?? null, sl: sl ?? null }, symbol, side,
        });

        return ok({
          success: true, symbol, side,
          takeProfit: tp ?? null, stopLoss: sl ?? null,
          message: `TP/SL updated for ${symbol} ${side} position`,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await logger.logError({ tool: toolName, action: "set_tpsl", params, response: { error: errorMessage }, symbol, side });
        return fail(`Failed to set TP/SL for ${symbol}: ${errorMessage}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = await loadConfig();
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

  const spendingTracker = new SpendingTracker();
  await spendingTracker.load();

  const guardrails = new GuardrailChecker(
    config.agent,
    () => spendingTracker.getDailySpend(),
  );

  const logger = new AgentActionLogger();

  const server = new McpServer({ name: "pacifica-dex", version: "0.1.0" });

  registerReadTools(server, client, config, guardrails, spendingTracker, logger);
  registerAnalyticsTools(server, client);
  registerFundingTools(server, client);
  registerWriteTools(server, client, config, guardrails, spendingTracker, logger);
  registerPatternTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Friendly banner on stderr so a human running this directly (not via
  // Claude Desktop) knows (a) it's alive, (b) how to stop it. stderr is safe
  // — stdout carries the MCP protocol and must not be polluted.
  const toolCount = 21;
  process.stderr.write(
    `\n  Pacifica MCP server running — ${toolCount} tools exposed over stdio.\n` +
    `  Patterns live at ~/.pacifica/patterns/.\n` +
    `  Press Ctrl+C to stop.\n\n`,
  );
}

main().catch((err) => {
  console.error("Pacifica MCP server fatal error:", err);
  process.exit(1);
});
