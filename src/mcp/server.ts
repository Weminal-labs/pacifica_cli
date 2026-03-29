#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica DEX MCP Server
// ---------------------------------------------------------------------------
// Exposes Pacifica perpetual DEX trading tools to AI agents via the Model
// Context Protocol (MCP).  Communicates over stdio so it can be launched by
// any MCP-compatible host (Claude Desktop, Cursor, etc.).
//
// Tools are split into two categories:
//   - Read tools  (8) -- market data, account info, agent introspection
//   - Write tools (4) -- order placement, cancellation, TP/SL, position close
//
// Every write tool passes through the GuardrailChecker before execution and
// is recorded by the AgentActionLogger / SpendingTracker for auditability.
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { PacificaClient } from "../core/sdk/client.js";
import { createSigner } from "../core/sdk/signer.js";
import type { Market, OrderSide, TpSlConfig } from "../core/sdk/types.js";
import { loadConfig } from "../core/config/loader.js";
import type { PacificaConfig } from "../core/config/types.js";
import { GuardrailChecker } from "../core/agent/guardrails.js";
import { SpendingTracker } from "../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../core/agent/action-logger.js";
import { getBinanceFundingRates } from "../core/funding/binance.js";
import { getBybitFundingRates } from "../core/funding/bybit.js";
import { toBinanceSymbolFallback, toBybitSymbolFallback } from "../core/funding/symbol-map.js";

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
  // pacifica_funding_arb_scan
  // -----------------------------------------------------------------------
  server.tool(
    "pacifica_funding_arb_scan",
    "Compare funding rates across Pacifica, Binance, and Bybit to find arbitrage opportunities. Returns spreads and annualized APR.",
    {
      min_spread: z
        .number()
        .optional()
        .describe("Minimum absolute spread (%) to include (default: 0)"),
    },
    async ({ min_spread }) => {
      try {
        const markets = await client.getMarkets();

        const binanceSymbols = markets.map((m) => toBinanceSymbolFallback(m.symbol));
        const bybitSymbols = markets.map((m) => toBybitSymbolFallback(m.symbol));

        const [binanceRates, bybitRates] = await Promise.all([
          getBinanceFundingRates(binanceSymbols),
          getBybitFundingRates(bybitSymbols),
        ]);

        const rows = [];
        const minSpreadFilter = min_spread ?? 0;

        for (const market of markets) {
          const pacRate = market.fundingRate;
          const binSymbol = toBinanceSymbolFallback(market.symbol).toUpperCase();
          const bybSymbol = toBybitSymbolFallback(market.symbol).toUpperCase();

          const binData = binanceRates.get(binSymbol);
          const bybData = bybitRates.get(bybSymbol);

          const binRate = binData?.fundingRate ?? null;
          const bybRate = bybData?.fundingRate ?? null;

          let bestSpread = 0;
          let bestAgainst = "";

          if (binRate !== null && Math.abs(pacRate - binRate) > Math.abs(bestSpread)) {
            bestSpread = pacRate - binRate;
            bestAgainst = "Binance";
          }
          if (bybRate !== null && Math.abs(pacRate - bybRate) > Math.abs(bestSpread)) {
            bestSpread = pacRate - bybRate;
            bestAgainst = "Bybit";
          }

          if (Math.abs(bestSpread) < minSpreadFilter) continue;

          const apr = bestSpread * 3 * 365;
          let signal = "neutral";
          if (Math.abs(bestSpread) >= 0.005) {
            signal = bestSpread > 0 ? `SHORT_PAC_LONG_${bestAgainst.toUpperCase()}` : `LONG_PAC_SHORT_${bestAgainst.toUpperCase()}`;
          }

          rows.push({
            symbol: market.symbol,
            pacificaRate: pacRate,
            binanceRate: binRate,
            bybitRate: bybRate,
            bestSpread,
            bestAgainst,
            annualizedApr: Math.round(apr * 10) / 10,
            signal,
            actionable: Math.abs(bestSpread) >= 0.02,
          });
        }

        rows.sort((a, b) => Math.abs(b.bestSpread) - Math.abs(a.bestSpread));

        return ok({
          count: rows.length,
          actionableCount: rows.filter((r) => r.actionable).length,
          opportunities: rows,
        });
      } catch (err) {
        return fail(`Error scanning funding arb: ${err instanceof Error ? err.message : String(err)}`);
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

function registerWriteTools(
  server: McpServer,
  client: PacificaClient,
  config: PacificaConfig,
  guardrails: GuardrailChecker,
  spendingTracker: SpendingTracker,
  logger: AgentActionLogger,
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
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // 1. Load configuration and initialize core components
  // -----------------------------------------------------------------------
  const config = await loadConfig();
  const signer = createSigner(config.private_key);
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
  // 3. Create and configure the MCP server
  // -----------------------------------------------------------------------
  const server = new McpServer({
    name: "pacifica-dex",
    version: "0.1.0",
  });

  // Register all tool handlers
  registerReadTools(server, client, config, guardrails, spendingTracker, logger);
  registerFundingTools(server, client);
  registerWriteTools(server, client, config, guardrails, spendingTracker, logger);

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
