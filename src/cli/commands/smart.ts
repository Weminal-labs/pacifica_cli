// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Smart Order Commands
// ---------------------------------------------------------------------------
// `pacifica smart trailing <symbol> --distance <n%>`  Set trailing stop
// `pacifica smart list`                               List smart orders
// `pacifica smart cancel <id>`                        Cancel a smart order
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { SmartOrderManager } from "../../core/smart/manager.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function statusColor(status: string): string {
  switch (status) {
    case "active": return theme.profit(status);
    case "triggered": return theme.label(status);
    case "cancelled": return theme.muted(status);
    case "error": return theme.loss(status);
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createSmartCommand(): Command {
  const smart = new Command("smart")
    .description("Smart order management (trailing stops, etc.)");

  // -------------------------------------------------------------------------
  // pacifica smart trailing <symbol> --distance <n>
  // -------------------------------------------------------------------------
  smart
    .command("trailing <symbol>")
    .description("Set a trailing stop on an open position")
    .requiredOption("-d, --distance <percent>", "Trail distance in percent (e.g. 2 for 2%)", parseFloat)
    .action(async (symbol: string, opts: { distance: number }) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const upperSymbol = symbol.toUpperCase();

        // Validate distance
        if (!Number.isFinite(opts.distance) || opts.distance <= 0 || opts.distance > 50) {
          console.error(theme.error("Distance must be between 0.1% and 50%."));
          return;
        }

        // Find the open position
        const positions = await client.getPositions();
        const position = positions.find((p) => p.symbol.toUpperCase() === upperSymbol);

        if (!position) {
          console.error(theme.error(`No open position found for ${upperSymbol}.`));
          console.log(theme.muted("  Use 'pacifica positions' to see open positions."));
          return;
        }

        // Get current mark price
        const markets = await client.getMarkets();
        const market = markets.find((m) => m.symbol.toUpperCase() === upperSymbol);
        const markPrice = market?.markPrice ?? 0;

        // Show summary
        console.log();
        console.log(theme.header("Trailing Stop"));
        console.log(theme.muted("─────────────"));
        console.log(`  ${theme.label("Symbol:")}    ${upperSymbol}`);
        console.log(`  ${theme.label("Side:")}      ${position.side}`);
        console.log(`  ${theme.label("Size:")}      ${position.amount}`);
        console.log(`  ${theme.label("Entry:")}     ${formatPrice(position.entryPrice)}`);
        console.log(`  ${theme.label("Mark:")}      ${markPrice > 0 ? formatPrice(markPrice) : "N/A"}`);
        console.log(`  ${theme.label("Distance:")}  ${opts.distance}%`);

        if (markPrice > 0) {
          const initialTrigger = position.side === "long"
            ? markPrice * (1 - opts.distance / 100)
            : markPrice * (1 + opts.distance / 100);
          console.log(`  ${theme.label("Initial trigger:")} ~${formatPrice(initialTrigger)}`);
        }
        console.log();

        const confirmed = await confirm({
          message: "Activate trailing stop?",
          default: true,
        });

        if (!confirmed) {
          console.log(theme.muted("Cancelled."));
          return;
        }

        // Create the smart order
        const manager = new SmartOrderManager(client);
        manager.load();

        const order = manager.addTrailingStop({
          symbol: upperSymbol,
          positionSide: position.side,
          distancePercent: opts.distance,
        });

        // Start polling
        manager.start();

        console.log();
        console.log(theme.success("  Trailing stop activated"));
        console.log(`  ${theme.label("ID:")} ${shortId(order.id)}`);
        console.log();
        console.log(theme.muted("  Smart order is polling every 5s. Press Ctrl+C to stop."));
        console.log(theme.muted("  The order will resume on next 'pacifica smart trailing' start."));
        console.log();

        // Keep process alive while polling
        await new Promise<void>((resolve) => {
          const onSignal = (): void => {
            manager.stop();
            console.log(theme.muted("\n  Smart order manager stopped. Order state preserved."));
            resolve();
          };
          process.on("SIGINT", onSignal);
          process.on("SIGTERM", onSignal);
        });
      } catch (err) {
        if (isExitPromptError(err)) {
          console.log(theme.muted("\nCancelled."));
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });

  // -------------------------------------------------------------------------
  // pacifica smart list
  // -------------------------------------------------------------------------
  smart
    .command("list")
    .description("List all smart orders")
    .option("--active", "Show only active orders")
    .option("--json", "Output raw JSON")
    .action(async (opts: { active?: boolean; json?: boolean }) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const manager = new SmartOrderManager(client);
        manager.load();

        const filter = opts.active ? { status: "active" } : undefined;
        const orders = manager.getOrders(filter);

        if (opts.json) {
          console.log(JSON.stringify(orders, null, 2));
          return;
        }

        if (orders.length === 0) {
          console.log(theme.muted("No smart orders found."));
          return;
        }

        console.log();
        console.log(theme.header("Smart Orders"));
        console.log(theme.muted("─".repeat(80)));

        console.log(
          `  ${pad("ID", 10)} ${pad("Type", 15)} ${pad("Symbol", 8)} ${pad("Side", 6)} ${pad("Distance", 10)} ${pad("Extreme", 12)} ${pad("Trigger", 12)} ${pad("Status", 12)}`,
        );
        console.log(theme.muted("  " + "─".repeat(78)));

        for (const order of orders) {
          console.log(
            `  ${pad(shortId(order.id), 10)} ${pad(order.type, 15)} ${pad(order.symbol, 8)} ${pad(order.positionSide, 6)} ${padLeft(order.distancePercent + "%", 10)} ${padLeft(order.extremePrice > 0 ? formatPrice(order.extremePrice) : "—", 12)} ${padLeft(order.triggerPrice > 0 ? formatPrice(order.triggerPrice) : "—", 12)} ${statusColor(order.status)}`,
          );
        }
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });

  // -------------------------------------------------------------------------
  // pacifica smart cancel <id>
  // -------------------------------------------------------------------------
  smart
    .command("cancel <id>")
    .description("Cancel a smart order by ID (first 8 chars is enough)")
    .action(async (id: string) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const manager = new SmartOrderManager(client);
        manager.load();

        // Find by prefix match
        const orders = manager.getOrders();
        const match = orders.find(
          (o) => o.id.startsWith(id) || o.id === id,
        );

        if (!match) {
          console.error(theme.error(`Smart order not found: ${id}`));
          return;
        }

        if (match.status !== "active") {
          console.log(theme.muted(`Order ${shortId(match.id)} is already ${match.status}.`));
          return;
        }

        const result = manager.cancel(match.id);
        if (result) {
          console.log(theme.success(`  Smart order ${shortId(result.id)} cancelled.`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });

  return smart;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExitPromptError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed")) return true;
  return false;
}
