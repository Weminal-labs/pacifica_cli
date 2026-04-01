// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Positions Command
// ---------------------------------------------------------------------------
// View open positions and close them at market price.
//
// Usage:
//   pacifica positions              -- List open positions
//   pacifica positions close <sym>  -- Close a position via market order
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import type { Position, OrderSide } from "../../core/sdk/types.js";
import {
  theme,
  formatPrice,
  formatPnl,
  formatPercent,
  formatAmount,
  formatTimestamp,
} from "../theme.js";

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createPositionsCommand(): Command {
  const positions = new Command("positions")
    .description("View and manage open positions")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await listPositions(globalOpts);
    });

  positions
    .command("close <symbol>")
    .description("Close a position at market price")
    .action(async (symbol: string, _opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      await closePosition(symbol, globalOpts);
    });

  return positions;
}

// ---------------------------------------------------------------------------
// List positions
// ---------------------------------------------------------------------------

async function listPositions(
  globalOpts: Record<string, unknown>,
): Promise<void> {
  const config = await loadConfig();
  const network = globalOpts.testnet ? "testnet" as const : config.network;
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network, signer });

  try {
    const [positions, markets] = await Promise.all([
      client.getPositions(),
      client.getMarkets(),
    ]);

    // Build a mark-price lookup by symbol.
    const markPriceMap = new Map<string, number>();
    for (const m of markets) {
      markPriceMap.set(m.symbol, m.markPrice);
    }

    // --json: raw output
    if (globalOpts.json) {
      const enriched = positions.map((p) => {
        const markPrice = markPriceMap.get(p.symbol) ?? p.entryPrice;
        const pnlUsd = computePnl(p, markPrice);
        const pnlPercent = p.margin !== 0 ? (pnlUsd / p.margin) * 100 : 0;
        return { ...p, markPrice, pnlUsd, pnlPercent };
      });
      console.log(JSON.stringify(enriched, null, 2));
      return;
    }

    // No positions
    if (positions.length === 0) {
      console.log(theme.muted("No open positions."));
      return;
    }

    // Table header
    console.log();
    console.log(theme.header("Open Positions"));
    console.log(theme.muted("──────────────"));

    // Column headers
    const header = formatRow(
      "Symbol",
      "Side",
      "Size",
      "Entry",
      "Mark",
      "PnL",
      "Liq Price",
      "Margin",
    );
    console.log(theme.muted(header));

    // Position rows
    let totalPnl = 0;

    for (const p of positions) {
      const markPrice = markPriceMap.get(p.symbol) ?? p.entryPrice;
      const pnlUsd = computePnl(p, markPrice);
      const pnlPercent = p.margin !== 0 ? (pnlUsd / p.margin) * 100 : 0;
      totalPnl += pnlUsd;

      const sideLabel = p.side === "long"
        ? theme.profit("LONG")
        : theme.loss("SHORT");

      const liqDisplay = p.liquidationPrice !== undefined
        ? formatPrice(p.liquidationPrice)
        : theme.muted("\u2014");

      const pnlDisplay = `${formatPnl(pnlUsd)} ${formatPercent(pnlPercent)}`;

      const row = formatRow(
        p.symbol,
        sideLabel,
        formatAmount(p.amount),
        formatPrice(p.entryPrice),
        formatPrice(markPrice),
        pnlDisplay,
        liqDisplay,
        formatPrice(p.margin),
      );

      console.log(row);
    }

    // Summary
    console.log();
    console.log(
      theme.muted(`${positions.length} position${positions.length !== 1 ? "s" : ""}`) +
      "  " +
      `Total PnL: ${formatPnl(totalPnl)}`,
    );
    console.log();
  } catch (err) {
    handleError(err);
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Close position
// ---------------------------------------------------------------------------

async function closePosition(
  rawSymbol: string,
  globalOpts: Record<string, unknown>,
): Promise<void> {
  const symbol = rawSymbol.toUpperCase();
  const config = await loadConfig();
  const network = globalOpts.testnet ? "testnet" as const : config.network;
  const signer = createSignerFromConfig(config);
  const client = new PacificaClient({ network, signer });

  try {
    const positions = await client.getPositions();
    const position = positions.find((p) => p.symbol === symbol);

    if (!position) {
      console.log(theme.warning(`No open position for ${symbol}`));
      return;
    }

    // Confirm large positions
    if (position.margin > 1000) {
      const sideLabel = position.side === "long" ? "LONG" : "SHORT";
      const marginDisplay = formatPrice(position.margin);
      const ok = await confirm({
        message: `Close ${symbol} ${sideLabel} position (${marginDisplay} margin)?`,
        default: false,
      });

      if (!ok) {
        console.log(theme.muted("Cancelled."));
        return;
      }
    }

    // Determine the opposite side for closing.
    const closeSide: OrderSide = position.side === "long" ? "ask" : "bid";

    await client.placeMarketOrder({
      symbol,
      amount: String(position.amount),
      side: closeSide,
      slippage_percent: String(config.defaults.slippage),
      reduce_only: true,
    });

    // Success output
    const sideLabel = position.side === "long" ? "LONG" : "SHORT";

    console.log();
    console.log(theme.success("\u2713 Position closed"));
    console.log(`  Symbol:  ${theme.emphasis(symbol)}`);
    console.log(`  Side:    ${position.side === "long" ? theme.profit(sideLabel) : theme.loss(sideLabel)}`);
    console.log(`  Size:    ${formatAmount(position.amount)}`);
    console.log();
  } catch (err) {
    // Handle "position already closed" race condition gracefully.
    if (isPositionAlreadyClosed(err)) {
      console.log(theme.muted(`Position for ${symbol} is already closed.`));
      return;
    }

    // Handle Ctrl+C during confirmation prompt.
    if (isUserCancellation(err)) {
      console.log(theme.muted("\nCancelled."));
      return;
    }

    handleError(err);
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute unrealized PnL in USD for a position given the current mark price.
 */
function computePnl(position: Position, markPrice: number): number {
  if (position.side === "long") {
    return (markPrice - position.entryPrice) * position.amount;
  }
  return (position.entryPrice - markPrice) * position.amount;
}

/**
 * Format a table row with fixed-width columns.
 *
 * ANSI escape codes are stripped when measuring width so that colored text
 * aligns correctly.
 */
function formatRow(
  symbol: string,
  side: string,
  size: string,
  entry: string,
  mark: string,
  pnl: string,
  liq: string,
  margin: string,
): string {
  return (
    "  " +
    pad(symbol, 9) +
    pad(side, 9) +
    pad(size, 11) +
    pad(entry, 14) +
    pad(mark, 14) +
    pad(pnl, 22) +
    pad(liq, 13) +
    margin
  );
}

/**
 * Right-pad a string to `width`, accounting for invisible ANSI escape codes.
 */
function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  const padding = Math.max(0, width - visible.length);
  return text + " ".repeat(padding);
}

/**
 * Strip ANSI escape sequences so we can measure the visible character width.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Returns true if the error indicates the position was already closed
 * (race condition between fetching and closing).
 */
function isPositionAlreadyClosed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("position not found") ||
    msg.includes("no open position") ||
    msg.includes("already closed") ||
    msg.includes("reduce only order") ||
    msg.includes("position does not exist")
  );
}

/**
 * Returns true if the error represents a user-initiated cancellation
 * (e.g., Ctrl+C during an Inquirer prompt).
 */
function isUserCancellation(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed")) return true;
  return false;
}

/**
 * Print a user-friendly error message and set a non-zero exit code.
 */
function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
