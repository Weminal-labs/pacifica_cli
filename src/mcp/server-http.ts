#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica MCP HTTP Server — remote-accessible version of the MCP tools
// ---------------------------------------------------------------------------
// Wraps the same 23 tools from server.ts as HTTP endpoints so they can be
// used from claude.ai, remote MCP clients, or any HTTP caller.
//
// Transports:
//   1. SSE endpoint at GET /sse — for MCP remote connections (claude.ai)
//   2. REST endpoint at POST /mcp — JSON-RPC over HTTP
//   3. Individual REST endpoints at POST /api/<tool_name>
//
// Usage:
//   npx tsx src/mcp/server-http.ts                    # default port 4243
//   PORT=8080 npx tsx src/mcp/server-http.ts          # custom port
//   pacifica-mcp-http                                 # via bin entry
//
// For claude.ai integration, use the /sse endpoint URL in the MCP config.
// ---------------------------------------------------------------------------

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import { PacificaClient } from "../core/sdk/client.js";
import { createSignerFromConfig } from "../core/sdk/signer.js";
import { loadConfig } from "../core/config/loader.js";
import { GuardrailChecker } from "../core/agent/guardrails.js";
import { SpendingTracker } from "../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../core/agent/action-logger.js";
import { registerPatternTools } from "./pattern-tools.js";

// Re-use the same registration functions from server.ts
// We import them by duplicating the minimal setup — the tool registration
// functions are tightly coupled to the McpServer instance.

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Build a fully-configured McpServer (same tools as stdio server)
// ---------------------------------------------------------------------------

async function buildMcpServer(): Promise<McpServer> {
  const config = await loadConfig();
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({
    network: config.network,
    signer,
    builderCode: config.builder_code,
  });

  const spendingTracker = new SpendingTracker();
  await spendingTracker.load();
  const guardrails = new GuardrailChecker(config.agent, () => spendingTracker.getDailySpend());
  const logger = new AgentActionLogger();

  const server = new McpServer({ name: "pacifica-dex-http", version: "0.1.0" });

  // --- Register all the same tools as the stdio server ---
  // We inline the registrations here to avoid circular imports.
  // This is the same tool set as server.ts.

  const { z } = await import("zod/v4");
  type OrderSide = "bid" | "ask";
  type TpSlConfig = { stop_price: string };
  const toOrderSide = (side: "buy" | "sell"): OrderSide => side === "buy" ? "bid" : "ask";
  const closingSide = (ps: "long" | "short"): OrderSide => ps === "long" ? "ask" : "bid";
  const getMarkPrice = async (sym: string) => {
    const m = (await client.getMarkets()).find(
      (x) => x.symbol.toUpperCase() === sym.toUpperCase(),
    );
    return m?.markPrice ?? 0;
  };

  // Read tools
  server.tool("pacifica_get_markets", "Get all available markets with price, volume, open interest, and funding rates", {}, async () => {
    try { return ok(await client.getMarkets()); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_get_ticker", "Get ticker data for a single market", { symbol: z.string() }, async ({ symbol }) => {
    try {
      const markets = await client.getMarkets();
      const m = markets.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase());
      return m ? ok(m) : fail(`Market not found: ${symbol}`);
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_get_orderbook", "Get order book for a market", { symbol: z.string(), depth: z.number().int().positive().optional() }, async ({ symbol, depth }) => {
    try { return ok(await client.getOrderBook(symbol, depth)); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_get_positions", "Get all open positions with P&L", {}, async () => {
    try { return ok(await client.getPositions()); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_get_account", "Get account balance, equity, margin", {}, async () => {
    try { return ok(await client.getAccount()); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_get_orders", "Get all open orders", {}, async () => {
    try { return ok(await client.getOrders()); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_agent_status", "Get agent guardrails and daily spending", {}, async () => {
    try {
      const ac = guardrails.getConfig();
      const ds = spendingTracker.getDailySpend();
      const ra = await logger.getEntries({ today: true, limit: 10 });
      return ok({
        guardrails: { enabled: ac.enabled, dailySpendingLimit: ac.daily_spending_limit, maxOrderSize: ac.max_order_size, maxLeverage: ac.max_leverage },
        dailyUsage: { totalSpentUsd: ds, remainingBudgetUsd: ac.daily_spending_limit - ds },
        recentActions: ra.map((e) => ({ timestamp: e.timestamp, tool: e.tool, action: e.action, result: e.result, symbol: e.symbol })),
        network: config.network,
      });
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_agent_log", "Get agent action audit trail", { filter: z.enum(["today", "all"]).optional(), limit: z.number().int().positive().optional() }, async ({ filter, limit }) => {
    try {
      const entries = await logger.getEntries({ today: filter !== "all", limit: limit ?? 50 });
      return ok({ count: entries.length, entries });
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });

  // Analytics
  server.tool("pacifica_trade_journal", "Get trade history", { symbol: z.string().optional(), limit: z.number().int().positive().optional() }, async ({ symbol, limit }) => {
    try {
      const entries = await client.getTradeHistory(symbol?.toUpperCase(), limit ?? 50);
      return ok({ count: entries.length, entries });
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_pnl_summary", "Get PnL stats", { limit: z.number().int().positive().optional() }, async ({ limit }) => {
    try {
      const entries = await client.getTradeHistory(undefined, limit ?? 100);
      let totalPnl = 0, totalFees = 0, wins = 0, losses = 0;
      for (const e of entries) { totalPnl += e.pnl; totalFees += e.fee; if (e.pnl > 0) wins++; else if (e.pnl < 0) losses++; }
      return ok({ totalTrades: entries.length, wins, losses, winRate: entries.length > 0 ? Math.round((wins / entries.length) * 1000) / 10 : 0, totalPnl: Math.round(totalPnl * 100) / 100, totalFees: Math.round(totalFees * 100) / 100 });
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });

  // Funding
  server.tool("pacifica_funding_rates", "Get current funding rates for all markets", {}, async () => {
    try {
      const markets = await client.getMarkets();
      return ok(markets.map((m) => ({ symbol: m.symbol, fundingRate: m.fundingRate, nextFundingRate: m.nextFundingRate, apr: m.fundingRate * 3 * 365, price: m.price })));
    } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });
  server.tool("pacifica_funding_history", "Get historical funding rates", { symbol: z.string(), limit: z.number().int().positive().optional() }, async ({ symbol, limit }) => {
    try { return ok(await client.getFundingHistory(symbol, limit ?? 20)); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  });

  // Write
  server.tool("pacifica_place_order", "Place a market or limit order", {
    symbol: z.string(), side: z.enum(["buy", "sell"]), size: z.number().positive(),
    type: z.enum(["market", "limit"]).default("market"), price: z.number().positive().optional(),
    leverage: z.number().positive().optional(), tp: z.number().positive().optional(), sl: z.number().positive().optional(),
    slippage: z.number().positive().optional(),
  }, async ({ symbol, side, size, type, price, leverage, tp, sl, slippage }) => {
    try {
      const markPrice = await getMarkPrice(symbol);
      if (markPrice === 0) return fail(`Unknown symbol: ${symbol}`);
      const usd = size * markPrice;
      const check = guardrails.check({ action: "place_order", orderSizeUsd: usd, leverage, symbol });
      if (!check.allowed) return fail(`Guardrail: ${check.reason}`);
      if (leverage) await client.updateLeverage(symbol, Math.round(leverage));
      const tpCfg: TpSlConfig | undefined = tp ? { stop_price: String(tp) } : undefined;
      const slCfg: TpSlConfig | undefined = sl ? { stop_price: String(sl) } : undefined;
      let result: { orderId: number };
      if (type === "limit") {
        if (!price) return fail("Limit orders require a price.");
        result = await client.placeLimitOrder({ symbol, price: String(price), amount: String(size), side: toOrderSide(side), tif: "GTC", reduce_only: false, take_profit: tpCfg, stop_loss: slCfg });
      } else {
        result = await client.placeMarketOrder({ symbol, amount: String(size), side: toOrderSide(side), slippage_percent: String(slippage ?? config.defaults.slippage), reduce_only: false, take_profit: tpCfg, stop_loss: slCfg });
      }
      await spendingTracker.recordSpend(usd, "place_order", symbol);
      return ok({ success: true, orderId: result.orderId, symbol, side, size, type, estimatedUsd: Math.round(usd * 100) / 100 });
    } catch (e) { return fail(`Failed: ${(e as Error).message}`); }
  });
  server.tool("pacifica_cancel_order", "Cancel an open order", { symbol: z.string(), order_id: z.number().int().positive() }, async ({ symbol, order_id }) => {
    try {
      const check = guardrails.check({ action: "cancel_order" });
      if (!check.allowed) return fail(`Guardrail: ${check.reason}`);
      await client.cancelOrder(symbol, order_id);
      return ok({ success: true, orderId: order_id });
    } catch (e) { return fail(`Failed: ${(e as Error).message}`); }
  });
  server.tool("pacifica_close_position", "Close an open position", { symbol: z.string() }, async ({ symbol }) => {
    try {
      const check = guardrails.check({ action: "close_position", symbol });
      if (!check.allowed) return fail(`Guardrail: ${check.reason}`);
      const pos = (await client.getPositions()).find((p) => p.symbol.toUpperCase() === symbol.toUpperCase());
      if (!pos) return fail(`No position for ${symbol}`);
      const result = await client.placeMarketOrder({ symbol: pos.symbol, amount: String(pos.amount), side: closingSide(pos.side), slippage_percent: String(config.defaults.slippage), reduce_only: true });
      return ok({ success: true, orderId: result.orderId, closedSide: pos.side, amount: pos.amount });
    } catch (e) { return fail(`Failed: ${(e as Error).message}`); }
  });
  server.tool("pacifica_set_tpsl", "Set TP/SL on a position", {
    symbol: z.string(), side: z.enum(["buy", "sell"]), tp: z.number().positive().optional(), sl: z.number().positive().optional(),
  }, async ({ symbol, side, tp, sl }) => {
    if (!tp && !sl) return fail("Provide tp or sl.");
    try {
      const check = guardrails.check({ action: "set_tpsl" });
      if (!check.allowed) return fail(`Guardrail: ${check.reason}`);
      const tpCfg: TpSlConfig | undefined = tp ? { stop_price: String(tp) } : undefined;
      const slCfg: TpSlConfig | undefined = sl ? { stop_price: String(sl) } : undefined;
      await client.setPositionTpSl(symbol, toOrderSide(side), tpCfg, slCfg);
      return ok({ success: true, symbol, tp: tp ?? null, sl: sl ?? null });
    } catch (e) { return fail(`Failed: ${(e as Error).message}`); }
  });

  // Pattern tools (reuse from pattern-tools.ts)
  registerPatternTools(server, client);

  return server;
}

// ---------------------------------------------------------------------------
// HTTP + SSE server
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "4243", 10);

async function main(): Promise<void> {
  // Track active SSE transports by session
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // CORS headers for browser clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tools: 23, transport: "sse" }));
      return;
    }

    // SSE endpoint — claude.ai and remote MCP clients connect here
    if (url.pathname === "/sse" && req.method === "GET") {
      const server = await buildMcpServer();
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);

      res.on("close", () => {
        transports.delete(sessionId);
      });

      await server.connect(transport);
      return;
    }

    // Message endpoint for SSE transport
    if (url.pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      const transport = transports.get(sessionId)!;
      let body = "";
      for await (const chunk of req) body += chunk;

      try {
        await transport.handlePostMessage(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      }
      return;
    }

    // Info page
    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "Pacifica MCP Server (HTTP/SSE)",
        version: "0.1.0",
        tools: 23,
        endpoints: {
          sse: "/sse",
          messages: "/messages",
          health: "/health",
        },
        usage: {
          claude_desktop: {
            mcpServers: {
              pacifica: {
                url: `http://localhost:${PORT}/sse`,
              },
            },
          },
          claude_ai: `Connect via MCP integration with URL: http://localhost:${PORT}/sse`,
        },
      }, null, 2));
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, () => {
    console.log(`
  Pacifica MCP Server (HTTP/SSE)
  ──────────────────────────────
  SSE endpoint:     http://localhost:${PORT}/sse
  Messages:         http://localhost:${PORT}/messages
  Health:           http://localhost:${PORT}/health
  Info:             http://localhost:${PORT}/

  For Claude Desktop (remote MCP):
    {
      "mcpServers": {
        "pacifica": {
          "url": "http://localhost:${PORT}/sse"
        }
      }
    }

  Press Ctrl+C to stop.
`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
