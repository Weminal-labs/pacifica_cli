// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- orders command
// ---------------------------------------------------------------------------
// Manage open orders: list, cancel a single order, or cancel all orders.
//
// Usage:
//   pacifica orders                   List open orders
//   pacifica orders cancel <id>       Cancel a specific order
//   pacifica orders cancel-all [sym]  Cancel all open orders
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme, formatPrice, formatAmount, formatTimestamp } from "../theme.js";
import type { Order } from "../../core/sdk/types.js";
import { PacificaApiError } from "../../core/sdk/types.js";

// ---------------------------------------------------------------------------
// Global-options type (subset of what Commander exposes from the root program)
// ---------------------------------------------------------------------------

interface GlobalOpts {
  testnet?: boolean;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createOrdersCommand(): Command {
  const orders = new Command("orders")
    .description("Manage open orders")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await listOrders(globalOpts);
    });

  orders
    .command("cancel <orderId>")
    .description("Cancel a specific order")
    .action(async (orderId: string, _opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      await cancelOrder(orderId, globalOpts);
    });

  orders
    .command("cancel-all [symbol]")
    .description("Cancel all open orders")
    .action(async (symbol: string | undefined, _opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      await cancelAllOrders(symbol, globalOpts);
    });

  return orders;
}

// ---------------------------------------------------------------------------
// Client bootstrap helper
// ---------------------------------------------------------------------------

async function buildClient(globalOpts: GlobalOpts): Promise<{ client: PacificaClient; network: string }> {
  const config = await loadConfig();
  const network = globalOpts.testnet ? "testnet" : config.network;
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network, signer });
  return { client, network };
}

// ---------------------------------------------------------------------------
// pacifica orders -- list open orders
// ---------------------------------------------------------------------------

async function listOrders(globalOpts: GlobalOpts): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    const result = await buildClient(globalOpts);
    client = result.client;

    const orders = await client.getOrders();

    // --json: dump raw data and exit.
    if (globalOpts.json) {
      console.log(JSON.stringify(orders, null, 2));
      return;
    }

    if (orders.length === 0) {
      console.log(theme.muted("No open orders."));
      return;
    }

    // Header
    console.log();
    console.log(theme.header("Open Orders"));
    console.log(theme.muted("\u2500".repeat(100)));

    // Column headers
    const header = [
      "  " + "ID".padEnd(10),
      "Symbol".padEnd(9),
      "Side".padEnd(7),
      "Type".padEnd(10),
      "Price".padEnd(14),
      "Size".padEnd(11),
      "Filled".padEnd(11),
      "Created",
    ].join("");
    console.log(theme.muted(header));

    // Rows
    for (const order of orders) {
      const row = formatOrderRow(order);
      console.log(row);
    }

    // Summary
    console.log();
    console.log(theme.muted(`${orders.length} open order${orders.length === 1 ? "" : "s"}`));
    console.log();
  } catch (err) {
    printError(err);
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// pacifica orders cancel <orderId>
// ---------------------------------------------------------------------------

async function cancelOrder(orderIdStr: string, globalOpts: GlobalOpts): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    const orderId = Number(orderIdStr);
    if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isInteger(orderId)) {
      console.error(theme.error("Invalid order ID. Must be a positive integer."));
      process.exitCode = 1;
      return;
    }

    const result = await buildClient(globalOpts);
    client = result.client;

    // Look up the order to find its symbol. The cancel endpoint requires
    // both symbol and orderId.
    const orders = await client.getOrders();
    const match = orders.find((o) => o.orderId === orderId);

    if (!match) {
      // The order might have already been filled or is not in the current
      // open orders list. We cannot determine the symbol, so inform the user.
      console.error(
        theme.warning(`Order ${orderId} not found in open orders. It may have already been filled or cancelled.`),
      );
      process.exitCode = 1;
      return;
    }

    await client.cancelOrder(match.symbol, orderId);

    if (globalOpts.json) {
      console.log(JSON.stringify({ cancelled: true, orderId }));
    } else {
      console.log(theme.success(`\u2713 Order ${orderId} cancelled`));
    }
  } catch (err) {
    if (err instanceof PacificaApiError && isNotFoundError(err)) {
      console.error(theme.warning(`Order ${orderIdStr} not found. It may have already been filled or cancelled.`));
      process.exitCode = 1;
    } else {
      printError(err);
    }
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// pacifica orders cancel-all [symbol]
// ---------------------------------------------------------------------------

async function cancelAllOrders(symbol: string | undefined, globalOpts: GlobalOpts): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    const result = await buildClient(globalOpts);
    client = result.client;

    // Prompt for confirmation (unless outputting JSON, which implies scripted use).
    if (!globalOpts.json) {
      const msg = symbol
        ? `Cancel all ${symbol} orders? This cannot be undone.`
        : "Cancel all orders? This cannot be undone.";

      let confirmed: boolean;
      try {
        confirmed = await confirm({ message: msg, default: false });
      } catch {
        // User pressed Ctrl+C.
        console.log(theme.muted("\nCancelled."));
        return;
      }

      if (!confirmed) {
        console.log(theme.muted("Aborted."));
        return;
      }
    }

    const { cancelledCount } = await client.cancelAllOrders(symbol);

    if (globalOpts.json) {
      console.log(JSON.stringify({ cancelled: true, cancelledCount, symbol: symbol ?? null }));
    } else {
      if (cancelledCount === 0) {
        console.log(theme.muted("No orders to cancel."));
      } else {
        console.log(
          theme.success(`\u2713 Cancelled ${cancelledCount} order${cancelledCount === 1 ? "" : "s"}`),
        );
      }
    }
  } catch (err) {
    printError(err);
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a single order as a padded table row with colored side indicator.
 */
function formatOrderRow(order: Order): string {
  const id = String(order.orderId).padEnd(10);
  const symbol = order.symbol.padEnd(9);

  // Side: "bid" -> green "BUY", "ask" -> red "SELL"
  const sideLabel = order.side === "bid" ? "BUY" : "SELL";
  const sideColored = order.side === "bid"
    ? theme.profit(sideLabel.padEnd(7))
    : theme.loss(sideLabel.padEnd(7));

  const orderType = order.orderType.padEnd(10);

  // Price: show formatted price, or em-dash for market orders (price = 0).
  const priceStr = order.price === 0
    ? "\u2014".padEnd(14)
    : formatPrice(order.price).padEnd(14);

  const size = formatAmount(order.initialAmount).padEnd(11);
  const filled = formatAmount(order.filledAmount).padEnd(11);
  const created = formatTimestamp(order.createdAt);

  return `  ${id}${symbol}${sideColored}${orderType}${priceStr}${size}${filled}${created}`;
}

/**
 * Check if a PacificaApiError represents a "not found" condition.
 */
function isNotFoundError(err: PacificaApiError): boolean {
  return err.code === 404 || err.message.toLowerCase().includes("not found");
}

/**
 * Print a user-friendly error message and set the exit code.
 */
function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
