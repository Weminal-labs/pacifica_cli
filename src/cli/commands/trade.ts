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
import { ok as envOk, writeSuccess, writeError, classifyError } from "../../output/envelope.js";

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
  validate?: boolean;
  json?: boolean;
  cancelAfter?: number;
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
    .option("--slippage <n>", "Slippage percentage", parseFloat)
    .option("-V, --validate", "Preview trade details without submitting (dry-run)")
    .option("-j, --json", "Machine-readable JSON output (for AI agents)")
    .option("--cancel-after <n>", "Auto-cancel order after N seconds (dead-man switch)", parseInt);
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
// Trade preview (--validate dry-run)
// ---------------------------------------------------------------------------

interface TradePreview {
  symbol: string;
  side: "LONG" | "SHORT";
  size: number;
  entry_price: number;
  notional: number;
  leverage: number;
  margin_required: number;
  liquidation_price: number;
  order_type: string;
  dry_run: true;
}

async function executeValidate(
  side: OrderSide,
  symbol: string,
  size: number,
  opts: TradeOptions,
): Promise<void> {
  let client: PacificaClient | undefined;
  const jsonMode = opts.json ?? false;

  try {
    const config = await loadConfig();
    // Public endpoint -- no signer needed to fetch mark price.
    client = new PacificaClient({ network: config.network });

    const markets = await client.getMarkets();
    const market = markets.find((m) => m.symbol === symbol);
    const markPrice = market?.markPrice ?? 0;

    if (markPrice === 0) {
      const e = { ok: false as const, error: "validation" as const, message: `Could not fetch mark price for ${symbol}. Verify the symbol is correct.`, retryable: false };
      writeError(e, jsonMode);
      return;
    }

    const leverage = opts.leverage ?? config.defaults.leverage;
    const orderType = opts.type.toLowerCase();
    const entryPrice = orderType === "limit" && opts.price !== undefined
      ? opts.price
      : markPrice;

    const notional = size * entryPrice;
    const marginRequired = notional / leverage;

    // Simplified liquidation price estimate (ignores maintenance margin):
    //   Long:  entry × (1 - 1/leverage)
    //   Short: entry × (1 + 1/leverage)
    const liqPrice = side === "bid"
      ? entryPrice * (1 - 1 / leverage)
      : entryPrice * (1 + 1 / leverage);

    const preview: TradePreview = {
      symbol,
      side: side === "bid" ? "LONG" : "SHORT",
      size,
      entry_price: entryPrice,
      notional,
      leverage,
      margin_required: marginRequired,
      liquidation_price: liqPrice,
      order_type: orderType,
      dry_run: true,
    };

    if (jsonMode) {
      writeSuccess(preview, true);
      return;
    }

    // Human-readable preview table.
    const w = 14; // label column width
    const line = "─".repeat(61);
    console.log();
    console.log(theme.header(`  ${"─".repeat(4)} TRADE PREVIEW (dry-run, not submitted) ${"─".repeat(18)}`));
    console.log(`  ${theme.label("Symbol".padEnd(w))}${symbol}`);
    console.log(`  ${theme.label("Side".padEnd(w))}${preview.side}`);
    console.log(`  ${theme.label("Size".padEnd(w))}${formatAmount(size)} ${symbol.split("-")[0] ?? symbol}`);
    console.log(`  ${theme.label("Entry (est.)".padEnd(w))}${formatPrice(entryPrice)}`);
    console.log(`  ${theme.label("Notional".padEnd(w))}${formatPrice(notional)}`);
    console.log(`  ${theme.label("Leverage".padEnd(w))}${leverage}×`);
    console.log(`  ${theme.label("Margin req.".padEnd(w))}${formatPrice(marginRequired)}`);
    console.log(`  ${theme.label("Liq. price".padEnd(w))}${formatPrice(liqPrice)}`);
    console.log(`  ${theme.muted(line)}`);
    console.log(`  ${theme.muted("Use without --validate to submit this order.")}`);
    console.log();
  } catch (thrown: unknown) {
    if (isExitPromptError(thrown)) {
      console.log(theme.muted("\nCancelled."));
      return;
    }
    const e = classifyError(thrown);
    writeError(e, jsonMode);
  } finally {
    client?.destroy();
  }
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
  const symbol = rawSymbol.toUpperCase();
  const jsonMode = opts.json ?? false;

  // --validate: dry-run preview, never submit.
  if (opts.validate) {
    await executeValidate(side, symbol, size, opts);
    return;
  }

  let client: PacificaClient | undefined;

  try {
    // -- 1. Load config & build client --------------------------------------
    const config = await loadConfig();
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network: config.network, signer });

    // -- 2. Validate inputs -------------------------------------------------
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

    if (!jsonMode) {
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
    }

    // -- 6. Confirm (skip in json mode -- agents don't need interactive prompts) --
    if (!jsonMode) {
      const confirmed = await confirm({
        message: "Place this order?",
        default: true,
      });

      if (!confirmed) {
        console.log(theme.muted("Order cancelled."));
        return;
      }
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
    if (jsonMode) {
      writeSuccess(
        {
          order_id: orderId,
          symbol,
          side,
          size,
          order_type: orderType,
          leverage,
        },
        true,
      );
    } else {
      console.log();
      console.log(theme.success("  Order placed"));
      console.log(`  ${theme.label("Order ID:")}  ${orderId}`);
      console.log();
    }

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

    // -- 10. Dead-man switch (optional) ------------------------------------
    if (opts.cancelAfter !== undefined && opts.cancelAfter > 0) {
      await runDeadManSwitch(client, symbol, orderId, opts.cancelAfter, jsonMode);
    }
  } catch (err: unknown) {
    // Handle Ctrl+C gracefully (ExitPromptError from @inquirer/prompts).
    if (isExitPromptError(err)) {
      console.log(theme.muted("\nOrder cancelled."));
      return;
    }

    if (jsonMode) {
      writeError(classifyError(err), true);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error(theme.error(`\nTrade failed: ${message}\n`));
      process.exitCode = 1;
    }
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Dead-man switch
// ---------------------------------------------------------------------------

/**
 * Hold open for `seconds` then automatically cancel the order.
 * Ctrl+C during the countdown aborts the auto-cancel — the order stays open.
 */
async function runDeadManSwitch(
  client: PacificaClient,
  symbol: string,
  orderId: number,
  seconds: number,
  jsonMode: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    let aborted = false;
    let elapsed = 0;

    // Schedule the cancel_scheduled JSON event immediately.
    const cancelAt = new Date(Date.now() + seconds * 1000).toISOString();
    if (jsonMode) {
      process.stdout.write(
        JSON.stringify({ type: "cancel_scheduled", cancel_at: cancelAt, order_id: String(orderId) }) + "\n",
      );
    } else {
      process.stderr.write(
        `  ${theme.warning(`Dead-man switch: order will auto-cancel in ${seconds}s unless confirmed`)}\n`,
      );
    }

    // SIGINT handler: abort the countdown, leave order open.
    const onSigint = () => {
      aborted = true;
      clearInterval(ticker);
      if (jsonMode) {
        process.stdout.write(
          JSON.stringify({ type: "cancel_aborted", order_id: String(orderId) }) + "\n",
        );
      } else {
        process.stderr.write(`\r  ${theme.muted("Countdown aborted — order remains open")}        \n`);
      }
      resolve();
    };

    process.once("SIGINT", onSigint);

    const ticker = setInterval(() => {
      elapsed += 1;
      const remaining = seconds - elapsed;

      if (!jsonMode) {
        // Overwrite the same line with a countdown.
        process.stderr.write(`\r  ${theme.muted(`Auto-cancel in ${remaining}s...`)}   `);
      }

      if (elapsed >= seconds) {
        clearInterval(ticker);
        process.removeListener("SIGINT", onSigint);

        if (aborted) {
          resolve();
          return;
        }

        // Fire the cancel.
        client.cancelOrder(symbol, orderId)
          .then(() => {
            if (jsonMode) {
              process.stdout.write(
                JSON.stringify({ type: "cancelled", order_id: String(orderId) }) + "\n",
              );
            } else {
              process.stderr.write(
                `\r  ${theme.warning(`Dead-man switch triggered — order ${orderId} cancelled`)}        \n`,
              );
            }
          })
          .catch((cancelErr: unknown) => {
            const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
            if (jsonMode) {
              process.stdout.write(
                JSON.stringify({ type: "cancel_failed", order_id: String(orderId), message: msg }) + "\n",
              );
            } else {
              process.stderr.write(
                `\r  ${theme.error(`Dead-man switch: cancel failed — ${msg}`)}\n`,
              );
            }
          })
          .finally(() => {
            resolve();
          });
      }
    }, 1000);
  });
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
