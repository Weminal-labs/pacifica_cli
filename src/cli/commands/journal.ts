// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Journal Command
// ---------------------------------------------------------------------------
// View the trade journal and PnL history.  Supports daily, weekly, monthly,
// and all-time views, with optional symbol filtering.
//
// Usage:
//   pacifica journal              -- Today's trades
//   pacifica journal --week       -- This week's summary
//   pacifica journal --month      -- This month's summary
//   pacifica journal --all        -- All trades
//   pacifica journal --symbol ETH -- Filter by symbol
// ---------------------------------------------------------------------------

import { Command } from "commander";
import {
  JournalLogger,
  type JournalEntry,
  type JournalSummary,
} from "../../core/journal/logger.js";
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
  week?: boolean;
  month?: boolean;
  all?: boolean;
  symbol?: string;
  limit: string;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createJournalCommand(): Command {
  const journal = new Command("journal")
    .description("View trade journal and PnL history")
    .option("--week", "Show weekly summary")
    .option("--month", "Show monthly summary")
    .option("--all", "Show all trades")
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
  const logger = new JournalLogger();

  // Determine the period from mutually exclusive flags.
  const period = opts.week
    ? "week" as const
    : opts.month
      ? "month" as const
      : opts.all
        ? "all" as const
        : "today" as const;

  try {
    // --json: structured output for scripting
    if (opts.json) {
      if (opts.week || opts.month) {
        const summary = await logger.getSummary(period);
        console.log(JSON.stringify(summary, null, 2));
      } else {
        const entries = await logger.getEntries({
          period,
          symbol: opts.symbol,
          limit: parseInt(opts.limit, 10),
        });
        console.log(JSON.stringify(entries, null, 2));
      }
      return;
    }

    // Summary view for --week / --month
    if (opts.week || opts.month) {
      const summary = await logger.getSummary(period);
      renderSummary(summary, period);
      return;
    }

    // Trade list view (default, --all, or --symbol)
    const entries = await logger.getEntries({
      period,
      symbol: opts.symbol,
      limit: parseInt(opts.limit, 10),
    });
    renderTradeList(entries, period);
  } catch (err) {
    handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Render: Trade list
// ---------------------------------------------------------------------------

function renderTradeList(
  entries: JournalEntry[],
  period: string,
): void {
  const title = periodLabel(period);

  console.log();
  console.log(theme.header(`Trade Journal \u2014 ${title}`));
  console.log(theme.muted("\u2550".repeat(22 + title.length)));

  if (entries.length === 0) {
    console.log(theme.muted("  No trades recorded for this period."));
    console.log();
    return;
  }

  // Determine whether to show HH:MM (today) or YYYY-MM-DD (other periods).
  const useShortTime = period === "today";

  // Column header
  const header = formatTradeRow(
    "Time",
    "Type",
    "Symbol",
    "Side",
    "Size",
    "Price",
    "PnL",
    "Fees",
    "By",
  );
  console.log(theme.muted(header));

  // Sort oldest-first for chronological display (getEntries returns newest
  // first, so we reverse).
  const sorted = [...entries].reverse();

  let totalPnl = 0;
  let totalFees = 0;

  for (const entry of sorted) {
    const time = useShortTime
      ? formatHHMM(entry.timestamp)
      : formatDate(entry.timestamp);

    const typeDisplay = formatType(entry.type);
    const sideDisplay = formatSide(entry.side);
    const pnlDisplay = entry.pnl !== undefined
      ? formatPnl(entry.pnl)
      : theme.muted("\u2014");
    const feesDisplay = formatPrice(entry.fees);
    const byDisplay = entry.triggeredBy;

    if (entry.pnl !== undefined) {
      totalPnl += entry.pnl;
    }
    totalFees += entry.fees;

    const row = formatTradeRow(
      time,
      typeDisplay,
      entry.symbol,
      sideDisplay,
      formatAmount(entry.size),
      formatPrice(entry.price),
      pnlDisplay,
      feesDisplay,
      byDisplay,
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
// Render: Summary
// ---------------------------------------------------------------------------

function renderSummary(
  summary: JournalSummary,
  period: string,
): void {
  const title = periodLabel(period);

  console.log();
  console.log(theme.header(`Trade Summary \u2014 ${title}`));
  console.log(theme.muted("\u2550".repeat(23 + title.length)));

  if (summary.totalTrades === 0) {
    console.log(theme.muted("  No trades recorded for this period."));
    console.log();
    return;
  }

  const winRateText = `${summary.winRate.toFixed(1)}%`;
  const winRateColored = summary.winRate > 50
    ? theme.profit(winRateText)
    : summary.winRate < 50
      ? theme.loss(winRateText)
      : winRateText;

  const winLossDetail = theme.muted(
    `(${summary.wins} win${summary.wins !== 1 ? "s" : ""} / ${summary.losses} loss${summary.losses !== 1 ? "es" : ""})`,
  );

  console.log(`  ${theme.label("Total Trades:")}    ${summary.totalTrades}`);
  console.log(`  ${theme.label("Win Rate:")}        ${winRateColored} ${winLossDetail}`);
  console.log(`  ${theme.label("Total PnL:")}       ${formatPnl(summary.totalPnl)}`);
  console.log(`  ${theme.label("Total Fees:")}      ${formatPrice(summary.totalFees)}`);
  console.log(`  ${theme.label("Avg Win:")}         ${formatPnl(summary.avgWin)}`);
  console.log(`  ${theme.label("Avg Loss:")}        ${formatPnl(summary.avgLoss)}`);
  console.log(`  ${theme.label("Best Trade:")}      ${formatPnl(summary.bestTrade)}`);
  console.log(`  ${theme.label("Worst Trade:")}     ${formatPnl(summary.worstTrade)}`);

  if (summary.avgDuration !== undefined) {
    console.log(
      `  ${theme.label("Avg Duration:")}    ${formatDuration(summary.avgDuration)}`,
    );
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a trade table row with fixed-width columns.
 */
function formatTradeRow(
  time: string,
  type: string,
  symbol: string,
  side: string,
  size: string,
  price: string,
  pnl: string,
  fees: string,
  by: string,
): string {
  return (
    "  " +
    pad(time, 12) +
    pad(type, 20) +
    pad(symbol, 8) +
    pad(side, 8) +
    pad(size, 10) +
    pad(price, 14) +
    pad(pnl, 14) +
    pad(fees, 9) +
    by
  );
}

/**
 * Map a period key to a human-readable label.
 */
function periodLabel(period: string): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "Last 7 Days";
    case "month":
      return "Last 30 Days";
    case "all":
      return "All Time";
    default:
      return period;
  }
}

/**
 * Format an entry type with theme styling.
 */
function formatType(type: JournalEntry["type"]): string {
  switch (type) {
    case "fill":
      return theme.muted("fill");
    case "position_close":
      return theme.emphasis("position_close");
    case "smart_order_trigger":
      return theme.warning("smart_order_trigger");
  }
}

/**
 * Format a trade side with directional color.
 */
function formatSide(side: string): string {
  const upper = side.toUpperCase();
  switch (upper) {
    case "BUY":
    case "LONG":
      return theme.profit(upper);
    case "SELL":
    case "SHORT":
      return theme.loss(upper);
    default:
      return upper;
  }
}

/**
 * Format an ISO timestamp as HH:MM (local time).
 */
function formatHHMM(iso: string): string {
  const date = new Date(iso);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Format an ISO timestamp as YYYY-MM-DD.
 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a duration in seconds to a human-readable string.
 *
 * Examples: "45s", "12m 30s", "2h 15m", "1d 3h"
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.round((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
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
 * Print a user-friendly error message and set a non-zero exit code.
 */
function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
