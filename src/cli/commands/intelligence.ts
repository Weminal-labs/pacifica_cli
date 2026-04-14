// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Commands
// ---------------------------------------------------------------------------
// `pacifica intelligence patterns [--json]`          Verified patterns
// `pacifica intelligence reputation [--json]`        Trader leaderboard
// `pacifica intelligence run`                        Run pattern engine
// `pacifica intelligence seed [--count <n>] [--clear]` Seed dev data
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadPatterns, loadReputation } from "../../core/intelligence/store.js";
import { runPatternEngine } from "../../core/intelligence/engine.js";
import { seedIntelligenceData } from "../../core/intelligence/seed.js";
import { startServer } from "../../intelligence-api/server.js";
import { theme } from "../theme.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function fmtSigned(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createIntelligenceCommand(): Command {
  const intel = new Command("intelligence")
    .description("Market intelligence: patterns, reputation, and signal engine");

  // -------------------------------------------------------------------------
  // pacifica intelligence patterns [--json]
  // -------------------------------------------------------------------------
  intel
    .command("patterns")
    .description("Display verified market patterns")
    .option("--json", "Output JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const patterns = await loadPatterns();
        const verified = patterns.filter((p) => p.verified);

        if (opts.json) {
          console.log(JSON.stringify(verified, null, 2));
          return;
        }

        if (verified.length === 0) {
          console.log(theme.muted("No verified patterns found. Run 'pacifica intelligence run' to generate them."));
          return;
        }

        const width = 72;
        const title = ` Intelligence Patterns (${verified.length} verified) `;
        const dashLen = Math.max(0, width - title.length);

        console.log();
        console.log(theme.header(title + "\u2500".repeat(dashLen)));
        console.log(theme.muted("\u2500".repeat(width)));

        // Header
        console.log(
          theme.label(
            "  " +
            pad("Rank", 6) +
            pad("Pattern", 40) +
            pad("Win Rate", 10) +
            pad("Sample", 8) +
            "Avg P&L",
          ),
        );
        console.log(theme.muted("\u2500".repeat(width)));

        verified.forEach((p, idx) => {
          const rank = pad(String(idx + 1), 6);
          const name = pad(p.name, 40);
          const wr   = pad(fmtPct(p.win_rate), 10);
          const sz   = pad(String(p.sample_size), 8);
          const pnl  = fmtSigned(p.avg_pnl_pct);

          const pnlColored = p.avg_pnl_pct >= 0
            ? theme.profit(pnl)
            : theme.loss(pnl);

          console.log("  " + rank + name + theme.emphasis(wr) + theme.muted(sz) + pnlColored);
        });

        console.log(theme.muted("\u2500".repeat(width)));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica intelligence reputation [--json]
  // -------------------------------------------------------------------------
  intel
    .command("reputation")
    .description("Display anonymised trader reputation leaderboard")
    .option("--json", "Output JSON")
    .option("--limit <n>", "Number of traders to show", "10")
    .action(async (opts: { json?: boolean; limit: string }) => {
      try {
        const repMap = await loadReputation();
        const limit = parseInt(opts.limit, 10);

        const traders = Array.from(repMap.values())
          .sort((a, b) => b.overall_rep_score - a.overall_rep_score)
          .slice(0, limit);

        if (opts.json) {
          console.log(JSON.stringify(traders, null, 2));
          return;
        }

        if (traders.length === 0) {
          console.log(theme.muted("No reputation data found. Run 'pacifica intelligence run' first."));
          return;
        }

        const width = 64;
        const title = ` Reputation Leaderboard (${traders.length} traders) `;
        const dashLen = Math.max(0, width - title.length);

        console.log();
        console.log(theme.header(title + "\u2500".repeat(dashLen)));
        console.log(theme.muted("\u2500".repeat(width)));

        // Header
        console.log(
          theme.label(
            "  " +
            pad("Rank", 6) +
            pad("Trader", 14) +
            pad("Rep Score", 11) +
            pad("Win Rate", 10) +
            "Trades",
          ),
        );
        console.log(theme.muted("\u2500".repeat(width)));

        traders.forEach((t, idx) => {
          const rank     = pad(String(idx + 1), 6);
          const trader   = pad(t.trader_id.slice(0, 12) + "..", 14);
          const score    = pad(String(t.overall_rep_score), 11);
          const wr       = pad(fmtPct(t.overall_win_rate), 10);
          const trades   = String(t.closed_trades);

          const scoreColored = t.overall_rep_score >= 70
            ? theme.profit(score)
            : t.overall_rep_score >= 50
              ? theme.warning(score)
              : theme.muted(score);

          console.log("  " + rank + theme.label(trader) + scoreColored + wr + trades);
        });

        console.log(theme.muted("\u2500".repeat(width)));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica intelligence run
  // -------------------------------------------------------------------------
  intel
    .command("run")
    .description("Run the pattern detection engine over closed records")
    .action(async () => {
      try {
        console.log(theme.muted("Running pattern engine..."));
        const patterns = await runPatternEngine();

        if (patterns.length === 0) {
          console.log(theme.warning("No patterns detected. Need at least 20 closed records per condition to qualify."));
          return;
        }

        console.log();
        console.log(theme.success(`Pattern engine complete — ${patterns.length} pattern(s) detected.`));
        console.log();

        patterns.forEach((p, idx) => {
          const wr  = fmtPct(p.win_rate);
          const pnl = fmtSigned(p.avg_pnl_pct);
          console.log(
            `  ${theme.label(String(idx + 1) + ".")} ${p.name}  ` +
            theme.emphasis(wr) + " win rate, " +
            (p.avg_pnl_pct >= 0 ? theme.profit(pnl) : theme.loss(pnl)) + " avg P&L, " +
            theme.muted(`n=${p.sample_size}`),
          );
        });

        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica intelligence seed [--count <n>] [--clear]
  // -------------------------------------------------------------------------
  intel
    .command("seed")
    .description("[DEV ONLY] Seed the intelligence store with mock data")
    .option("--count <n>", "Number of records to generate (default 80)", "80")
    .option("--clear", "Clear existing records before seeding")
    .action(async (opts: { count: string; clear?: boolean }) => {
      console.log();
      console.log(theme.warning("  WARNING: This is a DEV-ONLY command. Do not use in production."));
      console.log();

      try {
        const count = parseInt(opts.count, 10);
        await seedIntelligenceData(count, opts.clear ?? false);
        console.log(theme.success("  Seed complete."));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica intelligence serve [--port <n>]
  // -------------------------------------------------------------------------
  intel
    .command("serve")
    .description("Start the Intelligence REST API server (default port 4242)")
    .option("--port <n>", "Port to listen on", "4242")
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10);
      console.log(theme.muted(`Starting Intelligence API on port ${port}...`));
      try {
        await startServer(port);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nFailed to start server: ${message}\n`));
        process.exitCode = 1;
      }
    });

  return intel;
}
