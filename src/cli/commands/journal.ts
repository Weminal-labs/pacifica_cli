// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Journal Command
// ---------------------------------------------------------------------------
// View trade history and PnL from the Pacifica API.  Supports filtering by
// symbol and limiting the number of entries.
//
// Usage:
//   pacifica journal              -- Recent trades (default 20)
//   pacifica journal --all        -- All trades (up to 100)
//   pacifica journal --symbol ETH -- Filter by symbol
//   pacifica journal --limit 50   -- Custom limit
//   pacifica journal --json       -- JSON output
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSigner } from "../../core/sdk/signer.js";
import type { TradeHistory } from "../../core/sdk/types.js";
import {
  theme,
  formatPrice,
  formatPnl,
  formatAmount,
} from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalOpts {
  all?: boolean;
  symbol?: string;
  limit: string;
  json?: boolean;
  testnet?: boolean;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createJournalCommand(): Command {
  const journal = new Command("journal")
    .description("View trade journal and PnL history")
    .option("--all", "Show all trades (up to 100)")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--limit <n>", "Number of entries", "20")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await showJournal({ ...opts, ...globalOpts });
    });

  return journal;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function showJournal(opts: JournalOpts): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    const config = await loadConfig();
    const network = opts.testnet ? "testnet" as const : config.network;
    const signer = createSigner(config.private_key);
    client = new PacificaClient({ network, signer });

    const limit = opts.all ? 100 : parseInt(opts.limit, 10);
    const symbol = opts.symbol?.toUpperCase();

    const entries = await client.getTradeHistory(symbol, limit);

    // --json: structured output
    if (opts.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    renderTradeList(entries, symbol);
  } catch (err) {
    handleError(err);
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Render: Trade list
// ---------------------------------------------------------------------------

function renderTradeList(entries: TradeHistory[], symbol?: string): void {
  const title = symbol ? `Trades — ${symbol}` : "Trade Journal";

  console.log();
  console.log(theme.header(title));
  console.log(theme.muted("\u2550".repeat(4 + title.length)));

  if (entries.length === 0) {
    console.log(theme.muted("  No trades found."));
    console.log();
    return;
  }

  // Column header
  const header = formatTradeRow(
    "Time",
    "Symbol",
    "Side",
    "Size",
    "Price",
    "Entry",
    "PnL",
    "Fee",
  );
  console.log(theme.muted(header));

  let totalPnl = 0;
  let totalFees = 0;

  for (const entry of entries) {
    const time = formatDateTime(entry.createdAt);
    const sideDisplay = formatSide(entry.side);
    const pnlDisplay = formatPnl(entry.pnl);

    totalPnl += entry.pnl;
    totalFees += entry.fee;

    const row = formatTradeRow(
      time,
      entry.symbol,
      sideDisplay,
      formatAmount(entry.amount),
      formatPrice(entry.price),
      formatPrice(entry.entryPrice),
      pnlDisplay,
      formatPrice(entry.fee),
    );
    console.log(row);
  }

  // Footer summary
  console.log();
  console.log(
    theme.muted(
      `  ${entries.length} trade${entries.length !== 1 ? "s" : ""}`,
    ) +
    ` | Total PnL: ${formatPnl(totalPnl)}` +
    ` | Total Fees: ${formatPrice(totalFees)}`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTradeRow(
  time: string,
  symbol: string,
  side: string,
  size: string,
  price: string,
  entry: string,
  pnl: string,
  fee: string,
): string {
  return (
    "  " +
    pad(time, 18) +
    pad(symbol, 8) +
    pad(side, 14) +
    pad(size, 10) +
    pad(price, 12) +
    pad(entry, 12) +
    pad(pnl, 14) +
    fee
  );
}

function formatSide(side: string): string {
  const s = side.replace(/_/g, " ");
  if (side.includes("open") && side.includes("long") || side === "bid") {
    return theme.profit(s);
  }
  if (side.includes("open") && side.includes("short") || side === "ask") {
    return theme.loss(s);
  }
  if (side.includes("close")) {
    return theme.emphasis(s);
  }
  return s;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${m}`;
}

function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  const padding = Math.max(0, width - visible.length);
  return text + " ".repeat(padding);
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
