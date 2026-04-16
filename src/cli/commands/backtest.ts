// ---------------------------------------------------------------------------
// `pacifica backtest <name>` — replay a user-authored pattern against history
// ---------------------------------------------------------------------------
//   pacifica backtest funding-carry-btc
//   pacifica backtest my-pattern --days 60 --market SOL
//   pacifica backtest my-pattern --json
//
// Loads the pattern from ~/.pacifica/patterns/, fetches hourly candles for
// the target market, runs the shared backtest engine, and prints a terse
// summary + equity sparkline + trade table. Same engine as MCP + web.
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadPattern, getPatternsDir } from "../../core/patterns/loader.js";
import { runBacktest, type BacktestResult } from "../../core/patterns/backtest.js";
import { getCandles, stripPerpSuffix } from "../../core/patterns/candles.js";
import { theme } from "../theme.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** Render a block-character sparkline of the cumulative equity curve. */
function sparkline(values: number[], width = 60): string {
  if (values.length === 0) return "";
  // Down-sample to `width` buckets (take average per bucket) for long runs.
  const buckets: number[] = [];
  const step = Math.max(1, Math.ceil(values.length / width));
  for (let i = 0; i < values.length; i += step) {
    const slice = values.slice(i, i + step);
    buckets.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const min = Math.min(0, ...buckets);
  const max = Math.max(0, ...buckets);
  const span = max - min || 1;
  return buckets.map((v) => {
    const idx = Math.round(((v - min) / span) * (BLOCKS.length - 1));
    return BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, idx))];
  }).join("");
}

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function reasonSymbol(r: BacktestResult["trades"][number]["exit_reason"]): string {
  switch (r) {
    case "take_profit":  return "TP";
    case "stop_loss":    return "SL";
    case "liquidation":  return "LIQ";
    case "exit_clause":  return "EXIT";
    case "window_end":   return "END";
  }
}

function fmtIsoShort(iso: string): string {
  // 2026-04-15T13:00:00.000Z → 04-15 13:00
  return iso.slice(5, 16).replace("T", " ");
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createBacktestCommand(): Command {
  const cmd = new Command("backtest")
    .description("Replay a pattern against historical candles — the honest pattern validator")
    .argument("<name>", "Pattern name (filename in ~/.pacifica/patterns/, without .yaml)")
    .option("--days <n>", "History window in days (default 30, max 90)", "30")
    .option("--market <symbol>", "Override pattern.market (required when pattern.market is ANY)")
    .option("--json", "Machine-readable JSON output")
    .action(async (name: string, opts: { days: string; market?: string; json?: boolean }) => {
      try {
        const pattern = await loadPattern(name);
        if (!pattern) {
          const dir = await getPatternsDir();
          throw new Error(`No pattern named '${name}' in ${dir}`);
        }

        const days = Math.min(90, Math.max(1, parseInt(opts.days, 10) || 30));
        const targetMarket = opts.market ?? (pattern.market === "ANY" ? undefined : pattern.market);
        if (!targetMarket) {
          throw new Error(`Pattern '${name}' has market=ANY — pass --market <symbol>.`);
        }
        const base = stripPerpSuffix(targetMarket);

        if (!opts.json) process.stdout.write(theme.muted(`Fetching ${days}d of hourly candles for ${base}...\r`));
        const candles = await getCandles(base, { days });
        if (!opts.json) process.stdout.write("                                              \r");

        if (candles.length < 24) {
          throw new Error(`Not enough candle history for ${base} (got ${candles.length}, need ≥24).`);
        }

        const result = runBacktest(pattern, candles, `${base}-USDC-PERP`);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        renderText(result, days);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${msg}\n`));
        process.exitCode = 1;
      }
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// Text rendering — lean, single screen
// ---------------------------------------------------------------------------

function renderText(r: BacktestResult, days: number): void {
  const { summary, trades, skipped_axes, all_conditions_skipped } = r;

  // Header line
  const winRatePct = (summary.win_rate * 100).toFixed(0);
  const totalStr = summary.total_pnl_usd >= 0
    ? theme.profit(fmtUsd(summary.total_pnl_usd))
    : theme.loss(fmtUsd(summary.total_pnl_usd));

  console.log();
  console.log(
    `  ${theme.emphasis(r.pattern)} ${theme.muted("·")} ${r.market} ${theme.muted("·")} ` +
    `${days}d ${theme.muted("·")} ${summary.n_trades} trades ${theme.muted("·")} ` +
    `${winRatePct}% win ${theme.muted("·")} ${totalStr} total`,
  );

  // Skipped-axes banner (loud when material)
  if (all_conditions_skipped) {
    console.log();
    console.log(theme.warning(
      `  ⚠ All when: conditions use axes we can't backtest from candles.`,
    ));
    console.log(theme.muted(
      `    (${skipped_axes.join(", ")}). Backtest produced zero trades by definition.`,
    ));
    console.log(theme.muted(
      `    Test the pattern live via 'pacifica_run_pattern' instead.`,
    ));
    console.log();
    return;
  }

  if (skipped_axes.length > 0) {
    console.log(theme.warning(
      `  ⚠ Skipped axes: ${skipped_axes.join(", ")} — treat as directional-only validation.`,
    ));
  }

  // Equity sparkline
  if (trades.length > 0) {
    console.log();
    const curve = [0, ...trades.map((t) => t.cumulative_pnl_usd)];
    const peak = Math.max(0, ...curve);
    console.log(`  Equity: ${theme.label(sparkline(curve, 60))}`);
    console.log(
      `  ${theme.muted("peak")} ${theme.profit(`+$${peak.toFixed(2)}`)}  ` +
      `${theme.muted("max drawdown")} ${theme.loss(`-$${summary.max_drawdown_usd.toFixed(2)}`)}  ` +
      `${theme.muted("avg/trade")} ${fmtUsd(summary.avg_pnl_usd)} (${summary.avg_pnl_pct_on_margin >= 0 ? "+" : ""}${summary.avg_pnl_pct_on_margin.toFixed(1)}% margin)`,
    );
  } else {
    console.log();
    console.log(theme.muted(`  No trades fired in the ${days}d window.`));
    return;
  }

  // Compact trade table — show up to 20, then summary count
  console.log();
  console.log(theme.muted("  #   entry            exit             side   pnl         reason"));
  const show = trades.slice(0, 20);
  for (const t of show) {
    const pnlStr = t.pnl_usd >= 0 ? theme.profit(fmtUsd(t.pnl_usd)) : theme.loss(fmtUsd(t.pnl_usd));
    const sideStr = t.side === "long" ? theme.profit("long ") : theme.loss("short");
    console.log(
      `  ${String(t.index).padStart(3)}  ` +
      `${fmtIsoShort(t.entry_time)}   ` +
      `${fmtIsoShort(t.exit_time)}   ` +
      `${sideStr}  ` +
      `${pnlStr.padEnd(16)} ` +
      `${theme.muted(reasonSymbol(t.exit_reason))}`,
    );
  }
  if (trades.length > show.length) {
    console.log(theme.muted(`  ... ${trades.length - show.length} more (use --json for full list)`));
  }
  console.log();
}
