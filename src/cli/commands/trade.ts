// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Trade Command (buy / sell)
// ---------------------------------------------------------------------------
// Places market or limit orders on Pacifica DEX with optional TP/SL,
// leverage override, and slippage configuration.
//
// Usage:
//   pacifica trade buy  <symbol> <size> [options]
//   pacifica trade sell <symbol> <size> [options]
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import type {
  MarketOrderRequest,
  LimitOrderRequest,
  TpSlConfig,
  OrderSide,
} from "../../core/sdk/types.js";
import { theme, formatPrice, formatAmount } from "../theme.js";
import { captureIntelligence } from "../../core/intelligence/capture.js";

// ---------------------------------------------------------------------------
// Shared option definitions
// ---------------------------------------------------------------------------

interface TradeOptions {
  leverage?: number;
  type: string;
  price?: number;
  tp?: number;
  sl?: number;
  slippage?: number;
}

/**
 * Attach the common trading options to a Commander command.
 */
function withTradeOptions(cmd: Command): Command {
  return cmd
    .option("-l, --leverage <n>", "Leverage multiplier", parseFloat)
    .option("-t, --type <type>", "Order type: market or limit", "market")
    .option("-p, --price <n>", "Limit price", parseFloat)
    .option("--tp <n>", "Take-profit price", parseFloat)
    .option("--sl <n>", "Stop-loss price", parseFloat)
    .option("--slippage <n>", "Slippage percentage", parseFloat);
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createTradeCommand(): Command {
  const trade = new Command("trade")
    .description("Place trades on Pacifica DEX");

  withTradeOptions(
    trade
      .command("buy <symbol> <size>")
      .description("Place a buy/long order"),
  ).action(async (symbol: string, size: string, opts: TradeOptions) => {
    await executeTrade("bid", symbol, parseFloat(size), opts);
  });

  withTradeOptions(
    trade
      .command("sell <symbol> <size>")
      .description("Place a sell/short order"),
  ).action(async (symbol: string, size: string, opts: TradeOptions) => {
    await executeTrade("ask", symbol, parseFloat(size), opts);
  });

  return trade;
}

// ---------------------------------------------------------------------------
// Trade execution
// ---------------------------------------------------------------------------

async function executeTrade(
  side: OrderSide,
  rawSymbol: string,
  size: number,
  opts: TradeOptions,
): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    // -- 1. Load config & build client --------------------------------------
    const config = await loadConfig();
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network: config.network, signer });

    // -- 2. Validate inputs -------------------------------------------------
    const symbol = rawSymbol.toUpperCase();
    const orderType = opts.type.toLowerCase();

    if (orderType !== "market" && orderType !== "limit") {
      console.error(theme.error(`Invalid order type: "${opts.type}". Use "market" or "limit".`));
      return;
    }

    if (!Number.isFinite(size) || size <= 0) {
      console.error(theme.error("Size must be a positive number."));
      return;
    }

    if (orderType === "limit" && (opts.price === undefined || !Number.isFinite(opts.price))) {
      console.error(theme.error("Limit orders require --price <n>."));
      return;
    }

    const leverage = opts.leverage ?? config.defaults.leverage;
    const slippage = opts.slippage ?? config.defaults.slippage;

    // -- 3. Set leverage if specified ---------------------------------------
    if (opts.leverage !== undefined) {
      await client.updateLeverage(symbol, opts.leverage);
    }

    // -- 4. Build TP/SL config ----------------------------------------------
    let takeProfit: TpSlConfig | undefined;
    let stopLoss: TpSlConfig | undefined;

    if (opts.tp !== undefined) {
      takeProfit = { stop_price: String(opts.tp) };
    }
    if (opts.sl !== undefined) {
      stopLoss = { stop_price: String(opts.sl) };
    }

    // -- 5. Show order summary ----------------------------------------------
    const sideLabel = side === "bid" ? "BUY (Long)" : "SELL (Short)";
    const typeLabel = orderType === "market" ? "Market" : "Limit";

    console.log();
    console.log(theme.header("Order Summary"));
    console.log(theme.muted("─────────────"));
    console.log(`  ${theme.label("Symbol:")}    ${symbol}`);
    console.log(`  ${theme.label("Side:")}      ${sideLabel}`);
    console.log(`  ${theme.label("Size:")}      ${formatAmount(size)}`);
    console.log(`  ${theme.label("Type:")}      ${typeLabel}`);
    if (orderType === "limit" && opts.price !== undefined) {
      console.log(`  ${theme.label("Price:")}     ${formatPrice(opts.price)}`);
    }
    console.log(`  ${theme.label("Leverage:")}  ${leverage}x`);
    if (orderType === "market") {
      console.log(`  ${theme.label("Slippage:")}  ${slippage}%`);
    }
    if (opts.tp !== undefined) {
      console.log(`  ${theme.label("TP:")}        ${formatPrice(opts.tp)}`);
    }
    if (opts.sl !== undefined) {
      console.log(`  ${theme.label("SL:")}        ${formatPrice(opts.sl)}`);
    }
    console.log();

    // -- 6. Confirm ---------------------------------------------------------
    const confirmed = await confirm({
      message: "Place this order?",
      default: true,
    });

    if (!confirmed) {
      console.log(theme.muted("Order cancelled."));
      return;
    }

    // -- 7. Execute ---------------------------------------------------------
    let orderId: number;

    if (orderType === "market") {
      const req: MarketOrderRequest = {
        symbol,
        amount: String(size),
        side,
        slippage_percent: String(slippage),
        reduce_only: false,
        take_profit: takeProfit,
        stop_loss: stopLoss,
      };
      const result = await client.placeMarketOrder(req);
      orderId = result.orderId;
    } else {
      const req: LimitOrderRequest = {
        symbol,
        price: String(opts.price!),
        amount: String(size),
        side,
        tif: "GTC",
        reduce_only: false,
        take_profit: takeProfit,
        stop_loss: stopLoss,
      };
      const result = await client.placeLimitOrder(req);
      orderId = result.orderId;
    }

    // -- 8. Success ---------------------------------------------------------
    console.log();
    console.log(theme.success("  Order placed"));
    console.log(`  ${theme.label("Order ID:")}  ${orderId}`);
    console.log();

    // -- 9. Non-blocking intelligence capture (fire-and-forget) ------------
    // Failure here must NEVER surface to the trader — silent fail only.
    const markPrice = opts.price ?? 0; // limit price as proxy; 0 for market orders
    captureIntelligence(client, {
      asset: symbol,
      direction: side === "bid" ? "long" : "short",
      size_usd: size * (markPrice > 0 ? markPrice : size), // best-effort USD estimate
      entry_price: markPrice,
      api_key: config.private_key,
    }).catch(() => {});
  } catch (err: unknown) {
    // Handle Ctrl+C gracefully (ExitPromptError from @inquirer/prompts).
    if (isExitPromptError(err)) {
      console.log(theme.muted("\nOrder cancelled."));
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(theme.error(`\nTrade failed: ${message}\n`));
    process.exitCode = 1;
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect Ctrl+C cancellation from @inquirer/prompts.
 */
function isExitPromptError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed")) return true;
  return false;
}
