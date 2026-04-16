// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Journal Command
// ---------------------------------------------------------------------------
// View trade history and PnL from the Pacifica API.
//
// Usage:
//   pacifica journal              -- Recent 20 trades
//   pacifica journal --all        -- All trades (up to 100)
//   pacifica journal --weekly     -- Daily P&L breakdown for last 7 days
//   pacifica journal --monthly    -- Weekly P&L breakdown for last 30 days
//   pacifica journal --symbol ETH -- Filter by symbol
//   pacifica journal --limit 50   -- Custom limit
//   pacifica journal --json       -- JSON output
// ---------------------------------------------------------------------------

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import type { TradeHistory } from "../../core/sdk/types.js";
import { JournalLogger } from "../../core/journal/logger.js";
import type { PatternSummary } from "../../core/journal/logger.js";
import { theme, formatPrice, formatPnl, formatAmount } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalOpts {
  all?: boolean;
  weekly?: boolean;
  monthly?: boolean;
  symbol?: string;
  pattern?: string;
  limit: string;
  json?: boolean;
  testnet?: boolean;
}

interface PeriodBucket {
  label: string;
  trades: TradeHistory[];
  pnl: number;
  fees: number;
  wins: number;
}

// ---------------------------------------------------------------------------
// ANSI-safe padding helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}
function padR(s: string, w: number): string {
  const extra = w - visibleLen(s);
  return extra > 0 ? s + " ".repeat(extra) : s;
}
function padL(s: string, w: number): string {
  const extra = w - visibleLen(s);
  return extra > 0 ? " ".repeat(extra) + s : s;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createJournalCommand(): Command {
  const journalCmd = new Command("journal")
    .description("View trade journal and P&L history")
    .option("--all", "Show all trades (up to 100)")
    .option("--weekly", "Daily P&L breakdown for the last 7 days")
    .option("--monthly", "Weekly P&L breakdown for the last 30 days")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--pattern <name>", "Filter by pattern name (shows pattern stats)")
    .option("--limit <n>", "Number of entries to fetch", "100")
    .option("--json", "Output raw JSON")
    .action(async (opts: JournalOpts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await runJournal({ ...opts, ...globalOpts });
    });

  // -------------------------------------------------------------------------
  // pacifica journal export [--format csv|json] [--out <file>] [--from <date>]
  //                          [--to <date>] [--symbol <symbol>] [--limit <n>]
  // -------------------------------------------------------------------------
  journalCmd
    .command("export")
    .description("Export trade history to a CSV or JSON file")
    .option("--format <fmt>", "Output format: csv or json", "csv")
    .option("--out <path>", "Output file path (default: ~/pacifica-trades.<ext>)")
    .option("--from <date>", "Start date (YYYY-MM-DD), inclusive")
    .option("--to <date>", "End date (YYYY-MM-DD), inclusive")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--limit <n>", "Max entries to export", "500")
    .action(async (opts: {
      format: string;
      out?: string;
      from?: string;
      to?: string;
      symbol?: string;
      limit: string;
    }) => {
      let client: PacificaClient | undefined;
      try {
        const fmt = opts.format.toLowerCase();
        if (fmt !== "csv" && fmt !== "json") {
          throw new Error(`Unsupported format "${opts.format}". Use csv or json.`);
        }

        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const limit = parseInt(opts.limit, 10) || 500;
        const symbol = opts.symbol?.toUpperCase();

        process.stdout.write(theme.muted("Fetching trade history...\r"));
        let trades = await client.getTradeHistory(symbol, limit);
        process.stdout.write("                                \r");

        // Apply date-range filters
        if (opts.from) {
          const from = new Date(opts.from + "T00:00:00Z").getTime();
          if (!isNaN(from)) {
            trades = trades.filter((t) => new Date(t.createdAt).getTime() >= from);
          }
        }
        if (opts.to) {
          const to = new Date(opts.to + "T23:59:59Z").getTime();
          if (!isNaN(to)) {
            trades = trades.filter((t) => new Date(t.createdAt).getTime() <= to);
          }
        }

        if (trades.length === 0) {
          console.log(theme.muted("No trades found matching the specified filters."));
          return;
        }

        // Determine output path
        const ext = fmt;
        const defaultName = `pacifica-trades-${new Date().toISOString().slice(0, 10)}.${ext}`;
        const outPath = resolve(opts.out ?? defaultName);

        // Serialize
        let content: string;
        if (fmt === "json") {
          content = JSON.stringify(trades, null, 2) + "\n";
        } else {
          // CSV
          const CSV_HEADERS = ["date", "market", "side", "amount", "price", "entry_price", "pnl", "fee"];
          const rows = trades.map((t) => [
            t.createdAt,
            t.symbol,
            t.side,
            t.amount,
            t.price,
            t.entryPrice ?? "",
            t.pnl,
            t.fee,
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
          content = [CSV_HEADERS.join(","), ...rows].join("\n") + "\n";
        }

        await writeFile(outPath, content, { encoding: "utf-8", mode: 0o600 });

        console.log();
        console.log(
          theme.success(`  Exported ${trades.length} trades`) +
          theme.muted(` → ${outPath}`),
        );
        if (fmt === "csv") {
          console.log(
            theme.muted(`  Columns: date, market, side, amount, price, entry_price, pnl, fee`),
          );
        }
        console.log();

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${msg}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });

  return journalCmd;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function runJournal(opts: JournalOpts): Promise<void> {
  let client: PacificaClient | undefined;

  try {
    const config = await loadConfig();
    const network = opts.testnet ? ("testnet" as const) : config.network;
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network, signer });

    const limit = opts.all || opts.weekly || opts.monthly ? 100 : parseInt(opts.limit, 10);
    const symbol = opts.symbol?.toUpperCase();
    const entries = await client.getTradeHistory(symbol, limit);

    if (opts.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    if (opts.weekly) {
      renderPeriodView(entries, "daily", 7, symbol);
    } else if (opts.monthly) {
      renderPeriodView(entries, "weekly", 30, symbol);
    } else {
      renderTradeList(entries, symbol);
    }

    // When --pattern is supplied, show pattern-specific stats from the local journal.
    if (opts.pattern) {
      const journal = new JournalLogger();
      const stats = await journal.getPatternSummary(opts.pattern);
      renderPatternStats(stats);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(theme.error(`Error: ${msg}`));
    process.exitCode = 1;
  } finally {
    client?.destroy();
  }
}

// ---------------------------------------------------------------------------
// Period view (daily / weekly grouped P&L)
// ---------------------------------------------------------------------------

function renderPeriodView(
  entries: TradeHistory[],
  mode: "daily" | "weekly",
  days: number,
  symbol?: string,
): void {
  const now = Date.now();
  const cutoff = now - days * 86_400_000;

  // Build period buckets
  const buckets = new Map<string, PeriodBucket>();

  for (const entry of entries) {
    const ts = new Date(entry.createdAt).getTime();
    if (ts < cutoff) continue;

    const label =
      mode === "daily"
        ? dayLabel(entry.createdAt)
        : weekLabel(entry.createdAt);

    if (!buckets.has(label)) {
      buckets.set(label, { label, trades: [], pnl: 0, fees: 0, wins: 0 });
    }
    const b = buckets.get(label)!;
    b.trades.push(entry);
    b.pnl += entry.pnl;
    b.fees += entry.fee;
    if (entry.pnl > 0) b.wins++;
  }

  // Fill missing days/weeks with empty buckets
  for (let i = 0; i < days; i++) {
    const d = new Date(now - i * 86_400_000).toISOString();
    const label = mode === "daily" ? dayLabel(d) : weekLabel(d);
    if (!buckets.has(label)) {
      buckets.set(label, { label, trades: [], pnl: 0, fees: 0, wins: 0 });
    }
  }

  // Sort chronologically
  const sorted = Array.from(buckets.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  const title =
    symbol
      ? `${symbol} — ${mode === "daily" ? "7-Day Daily" : "30-Day Weekly"} P&L`
      : mode === "daily"
      ? "7-Day Daily P&L"
      : "30-Day Weekly P&L";

  const divider = "─".repeat(60);

  console.log();
  console.log(theme.header(`  ${title}`));
  console.log(theme.muted(divider));

  // Column headers
  const hPeriod  = padR("Period",   mode === "daily" ? 12 : 16);
  const hTrades  = padL("Trades",   7);
  const hWinRate = padL("Win %",    7);
  const hFees    = padL("Fees",    10);
  const hPnl     = padL("Net P&L", 12);
  console.log(theme.muted(`  ${hPeriod}  ${hTrades}  ${hWinRate}  ${hFees}  ${hPnl}`));
  console.log(theme.muted(divider));

  let grandPnl  = 0;
  let grandFees = 0;
  let grandWins = 0;
  let grandTrades = 0;

  for (const b of sorted) {
    const count    = b.trades.length;
    const winRate  = count > 0 ? Math.round((b.wins / count) * 100) : 0;
    const pnlStr   = count > 0 ? formatPnl(b.pnl) : theme.muted("—");
    const feesStr  = count > 0 ? formatPrice(b.fees) : theme.muted("—");
    const countStr = count > 0 ? String(count) : theme.muted("0");
    const winStr   = count > 0 ? `${winRate}%` : theme.muted("—");

    const period = padR(b.label, mode === "daily" ? 12 : 16);
    const trades = padL(countStr, 7);
    const wr     = padL(winStr,   7);
    const fees   = padL(feesStr, 10);
    const pnl    = padL(pnlStr,  12);

    console.log(`  ${period}  ${trades}  ${wr}  ${fees}  ${pnl}`);

    grandPnl    += b.pnl;
    grandFees   += b.fees;
    grandWins   += b.wins;
    grandTrades += count;
  }

  const overallWin = grandTrades > 0 ? Math.round((grandWins / grandTrades) * 100) : 0;

  console.log(theme.muted(divider));
  console.log(
    `  ${theme.muted("Total")}` +
    `  ${padL(theme.muted(String(grandTrades)), 7 + (mode === "daily" ? 12 : 16) + 2)}` +
    `  ${padL(theme.muted(`${overallWin}%`), 7)}` +
    `  ${padL(theme.muted(formatPrice(grandFees)), 10)}` +
    `  ${padL(formatPnl(grandPnl), 12)}`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Trade list (default view)
// ---------------------------------------------------------------------------

function renderTradeList(entries: TradeHistory[], symbol?: string): void {
  const title = symbol ? `Trades — ${symbol}` : "Trade Journal";
  const divider = "═".repeat(Math.max(title.length + 4, 20));

  console.log();
  console.log(theme.header(title));
  console.log(theme.muted(divider));

  if (entries.length === 0) {
    console.log(theme.muted("  No trades found."));
    console.log();
    return;
  }

  // Header
  const hTime   = padR("Time",   18);
  const hSym    = padR("Symbol",  8);
  const hSide   = padR("Side",   14);
  const hSize   = padL("Size",   10);
  const hPrice  = padL("Price",  12);
  const hEntry  = padL("Entry",  12);
  const hPnl    = padL("P&L",    12);
  const hFee    = padL("Fee",     8);
  console.log(theme.muted(`  ${hTime}${hSym}${hSide}${hSize}${hPrice}${hEntry}${hPnl}${hFee}`));

  let totalPnl  = 0;
  let totalFees = 0;

  for (const entry of entries) {
    const time  = padR(formatDateTime(entry.createdAt), 18);
    const sym   = padR(entry.symbol,                    8);
    const side  = padR(formatSide(entry.side),         14);
    const size  = padL(formatAmount(entry.amount),     10);
    const price = padL(formatPrice(entry.price),       12);
    const ep    = padL(formatPrice(entry.entryPrice),  12);
    const pnl   = padL(formatPnl(entry.pnl),           12);
    const fee   = padL(formatPrice(entry.fee),          8);

    console.log(`  ${time}${sym}${side}${size}${price}${ep}${pnl}${fee}`);

    totalPnl  += entry.pnl;
    totalFees += entry.fee;
  }

  console.log();
  console.log(
    theme.muted(`  ${entries.length} trade${entries.length !== 1 ? "s" : ""}`) +
    ` | Total P&L: ${formatPnl(totalPnl)}` +
    ` | Total Fees: ${formatPrice(totalFees)}`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Pattern stats
// ---------------------------------------------------------------------------

function renderPatternStats(stats: PatternSummary): void {
  const divider = "─".repeat(50);

  console.log();
  console.log(theme.header(`  Pattern Stats — ${stats.patternName}`));
  console.log(theme.muted(divider));

  if (stats.totalTrades === 0) {
    console.log(theme.muted("  No trades tagged with this pattern."));
    console.log();
    return;
  }

  const winRate = stats.winRate.toFixed(1);
  const winColor = stats.winRate >= 50 ? theme.profit : theme.loss;

  console.log(`  Trades:   ${stats.totalTrades}`);
  console.log(`  Wins:     ${stats.wins}    Losses: ${stats.losses}`);
  console.log(`  Win Rate: ${winColor(`${winRate}%`)}`);
  console.log(`  Total P&L: ${formatPnl(stats.totalPnl)}`);
  console.log(`  Avg P&L:   ${formatPnl(stats.avgPnl)}`);
  console.log();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSide(side: string): string {
  const s = side.replace(/_/g, " ");
  if ((side.includes("open") && side.includes("long")) || side === "bid")
    return theme.profit(s);
  if ((side.includes("open") && side.includes("short")) || side === "ask")
    return theme.loss(s);
  if (side.includes("close")) return theme.emphasis(s);
  return s;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const h  = String(d.getHours()).padStart(2, "0");
  const m  = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${dy} ${h}:${m}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${dy}`;
}

function weekLabel(iso: string): string {
  const d  = new Date(iso);
  const day = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (x: Date) =>
    `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`;
  return `${fmt(monday)}–${fmt(sunday)}`;
}
