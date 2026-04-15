// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Commands
// ---------------------------------------------------------------------------
// `pacifica intelligence patterns [--json]`          Verified patterns
// `pacifica intelligence reputation [--json]`        Trader leaderboard
// `pacifica intelligence run`                        Run pattern engine
// `pacifica intelligence seed [--count <n>] [--clear]` Seed dev data
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { Command } from "commander";
import { loadPatterns, loadRecords, loadReputation } from "../../core/intelligence/store.js";
import { runPatternEngine, scanForActiveSignals, detectPatterns } from "../../core/intelligence/engine.js";
import { computeReputation } from "../../core/intelligence/reputation.js";
import { seedIntelligenceData } from "../../core/intelligence/seed.js";
import { startServer } from "../../intelligence-api/server.js";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme } from "../theme.js";

// ---------------------------------------------------------------------------
// Helpers — ANSI-safe padding
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function vLen(s: string): number { return s.replace(ANSI_RE, "").length; }
function padR(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? s + " ".repeat(e) : s; }
function padL(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? " ".repeat(e) + s : s; }

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
            padR("Rank", 6) +
            padR("Pattern", 40) +
            padR("Win Rate", 10) +
            padR("Sample", 8) +
            "Avg P&L",
          ),
        );
        console.log(theme.muted("\u2500".repeat(width)));

        verified.forEach((p, idx) => {
          const rank = padR(String(idx + 1), 6);
          const name = padR(p.name, 40);
          const wr   = padR(fmtPct(p.win_rate), 10);
          const sz   = padR(String(p.sample_size), 8);
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
  // pacifica intelligence reputation [--json] [--limit <n>]
  // -------------------------------------------------------------------------
  intel
    .command("reputation")
    .description("Live Pacifica testnet trader leaderboard")
    .option("--json", "Output JSON")
    .option("--limit <n>", "Number of traders to show", "10")
    .action(async (opts: { json?: boolean; limit: string }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const limit = parseInt(opts.limit, 10);
        process.stdout.write(theme.muted("Fetching live leaderboard...\r"));
        const traders = await client.getLeaderboard(limit);
        process.stdout.write("                                \r"); // clear line

        if (opts.json) {
          console.log(JSON.stringify(traders, null, 2));
          return;
        }

        if (traders.length === 0) {
          console.log(theme.muted("No leaderboard data returned from Pacifica testnet."));
          return;
        }

        // Enrich with local intelligence data where available (pattern accuracy)
        const repMap = await loadReputation().catch(() => new Map());

        // Column widths
        const W = { rank: 4, trader: 16, score: 9, wr: 8, pnl: 12, equity: 10 };
        const width = 2 + W.rank + 2 + W.trader + 2 + W.score + 2 + W.wr + 2 + W.pnl + 2 + W.equity;
        const divider = theme.muted("─".repeat(width));

        console.log();
        console.log(theme.header(`  Pacifica Leaderboard`) + theme.muted(" — live testnet data"));
        console.log(divider);

        const hRank   = padL("Rank",      W.rank);
        const hTrader = padR("Trader",    W.trader);
        const hScore  = padL("Rep",       W.score);
        const hWr     = padL("Win %",     W.wr);
        const hPnl    = padL("PnL All-Time", W.pnl);
        const hEq     = padL("Equity",    W.equity);
        console.log(theme.muted(`  ${hRank}  ${hTrader}  ${hScore}  ${hWr}  ${hPnl}  ${hEq}`));
        console.log(divider);

        for (const t of traders) {
          const rank   = padL(String(t.rank), W.rank);
          const trader = padR(t.trader_id.slice(0, 14) + "..", W.trader);

          // Merge local intelligence score if we have it
          const local = repMap.get(t.trader_id);
          const score = local?.overall_rep_score ?? t.overall_rep_score;
          const rawScore = String(score);
          const scoreColored =
            score >= 70 ? theme.profit(rawScore)
            : score >= 50 ? theme.warning(rawScore)
            : theme.muted(rawScore);

          const wr  = padL(fmtPct(t.overall_win_rate), W.wr);
          const pnl = t.onchain.pnl_all_time;
          const pnlStr = (pnl >= 0 ? "+" : "") + "$" + Math.abs(pnl / 1000).toFixed(1) + "K";
          const pnlColored = pnl >= 0 ? theme.profit(pnlStr) : theme.loss(pnlStr);
          const eq  = "$" + (t.onchain.equity_current / 1000).toFixed(1) + "K";

          console.log(
            `  ${rank}  ${theme.label(trader)}  ${padL(scoreColored, W.score)}  ${wr}  ${padL(pnlColored, W.pnl)}  ${padL(theme.muted(eq), W.equity)}`,
          );
        }

        console.log(divider);
        console.log(theme.muted(`  Source: test-api.pacifica.fi/api/v1/leaderboard`));
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
  // pacifica intelligence run [--patterns] [--json]
  // -------------------------------------------------------------------------
  intel
    .command("run")
    .description("Scan live markets for active intelligence signals")
    .option("--patterns", "Also show the full verified pattern list")
    .option("--json", "Output JSON { patterns, signals }")
    .action(async (opts: { patterns?: boolean; json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        // Step 1 — pattern engine
        process.stdout.write(theme.muted("Running pattern engine... "));
        const patterns = await runPatternEngine();
        process.stdout.write(theme.muted(`${patterns.length} patterns verified.\n`));

        if (patterns.length === 0) {
          console.log(theme.warning("No patterns detected. Run 'intelligence seed' to add data first."));
          return;
        }

        // Step 2 — live market scan
        process.stdout.write(theme.muted("Scanning live markets..."));
        let signals: Awaited<ReturnType<typeof scanForActiveSignals>> = [];
        try {
          const config = await loadConfig();
          const signer = createSignerFromConfig(config);
          client = new PacificaClient({ network: config.network, signer });
          signals = await scanForActiveSignals(client, patterns);
          process.stdout.write(theme.muted(` ${signals.length} signal(s) found.\n`));
        } catch {
          process.stdout.write(theme.muted(" (offline — skipped)\n"));
        }

        // JSON output
        if (opts.json) {
          console.log(JSON.stringify({ patterns, signals }, null, 2));
          return;
        }

        console.log();

        // ── Active Signals ──────────────────────────────────────────────
        const W = { asset: 14, dir: 7, pattern: 38, wr: 8, apr: 8 };
        const width = 2 + W.asset + 2 + W.dir + 2 + W.pattern + 2 + W.wr + 2 + W.apr;
        const divider = theme.muted("─".repeat(width));

        console.log(theme.header("  Active Market Signals"));
        console.log(divider);

        if (signals.length === 0) {
          console.log(theme.muted("  No live markets currently match any verified pattern."));
        } else {
          const hAsset   = padR("Market",   W.asset);
          const hDir     = padR("Signal",   W.dir);
          const hPattern = padR("Pattern",  W.pattern);
          const hWr      = padL("Win Rate", W.wr);
          const hApr     = padL("APR",      W.apr);
          console.log(theme.muted(`  ${hAsset}  ${hDir}  ${hPattern}  ${hWr}  ${hApr}`));
          console.log(divider);

          for (const s of signals) {
            const base  = s.asset.replace("-USDC-PERP", "").replace("-USDC", "");
            const asset = padR(base, W.asset);
            const dirRaw = s.direction === "long" ? "LONG ↑" : "SHORT ↓";
            const dirColored = s.direction === "long" ? theme.profit(dirRaw) : theme.loss(dirRaw);
            const dir   = padR(dirColored, W.dir);
            const confidence = s.fullMatch ? "" : theme.muted("~");
            const pat   = padR(confidence + s.pattern.name, W.pattern);
            const wr    = padL(fmtPct(s.pattern.win_rate), W.wr);
            const apr   = s.fundingRate * 3 * 365;
            const aprStr = (apr >= 0 ? "+" : "") + apr.toFixed(1) + "%";
            const aprColored = apr > 5 ? theme.profit(aprStr) : apr < -5 ? theme.loss(aprStr) : theme.muted(aprStr);
            const aprCell = padL(aprColored, W.apr);
            console.log(`  ${asset}  ${dir}  ${pat}  ${wr}  ${aprCell}`);
          }

          console.log(divider);
          const best = signals[0]!;
          const bestBase = best.asset.replace("-USDC-PERP", "").replace("-USDC", "");
          const bestDir = best.direction.toUpperCase();
          console.log(
            theme.muted(`  ${signals.length} signal(s) | Strongest: `) +
            theme.emphasis(`${bestBase} ${bestDir}`) +
            theme.muted(` (${fmtPct(best.pattern.win_rate)} win rate, n=${best.pattern.sample_size})`),
          );
          console.log(
            theme.muted(`  Hint: `) +
            theme.label(`pacifica trade --market ${best.asset} --side ${best.direction} --size 500`),
          );
        }

        console.log();

        // ── Optional pattern list ────────────────────────────────────────
        if (opts.patterns) {
          console.log(theme.header("  Verified Patterns"));
          console.log(theme.muted("─".repeat(width)));
          patterns.forEach((p, idx) => {
            const wr  = fmtPct(p.win_rate);
            const pnl = fmtSigned(p.avg_pnl_pct);
            console.log(
              `  ${theme.muted(String(idx + 1) + ".")} ${padR(p.name, 42)}` +
              `${theme.emphasis(wr)}  ` +
              (p.avg_pnl_pct >= 0 ? theme.profit(pnl) : theme.loss(pnl)) +
              `  ${theme.muted("n=" + p.sample_size)}`,
            );
          });
          console.log();
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
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
  // pacifica intelligence me [--json]
  // -------------------------------------------------------------------------
  intel
    .command("me")
    .description("Your personal trading intelligence profile based on your trade history")
    .option("--json", "Output JSON")
    .action(async (opts: { json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);

        // Hash the private key to match trader_id stored in intelligence records
        const myTraderId = createHash("sha256")
          .update(config.private_key)
          .digest("hex");

        const wallet = signer.publicKey;

        process.stdout.write(theme.muted("Analysing your intelligence records...\r"));

        // Load all records and filter to this trader
        const allRecords = await loadRecords();
        const myRecords = allRecords.filter((r) => r.trader_id === myTraderId);

        process.stdout.write("                                          \r");

        if (myRecords.length === 0) {
          console.log();
          console.log(theme.muted("  No intelligence records found for your wallet."));
          console.log(theme.muted("  Records are captured automatically when you trade:"));
          console.log(theme.label("    pacifica trade --market ETH-USDC-PERP --side buy --size 0.1"));
          console.log();
          return;
        }

        // Compute personal reputation
        const repMap = computeReputation(myRecords);
        const myRep = repMap.get(myTraderId);

        // Detect personal patterns
        const myPatterns = detectPatterns(myRecords);

        // Per-market breakdown
        const byMarket = new Map<string, { total: number; wins: number; pnl: number }>();
        for (const r of myRecords.filter((r) => r.outcome !== undefined)) {
          const k = r.asset;
          const m = byMarket.get(k) ?? { total: 0, wins: 0, pnl: 0 };
          m.total++;
          if (r.outcome!.profitable) m.wins++;
          m.pnl += r.outcome!.pnl_pct;
          byMarket.set(k, m);
        }
        const topMarkets = [...byMarket.entries()]
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 5);

        // Leaderboard comparison
        let lbAvgScore: number | undefined;
        try {
          client = new PacificaClient({ network: config.network, signer });
          const lb = await client.getLeaderboard(20);
          if (lb.length > 0) {
            lbAvgScore = Math.round(lb.slice(0, 10).reduce((s, t) => s + t.overall_rep_score, 0) / Math.min(lb.length, 10));
          }
        } catch {
          // leaderboard is optional
        }

        // ── JSON ──────────────────────────────────────────────────────────
        if (opts.json) {
          console.log(JSON.stringify({
            wallet,
            trader_id: myTraderId,
            total_records: myRecords.length,
            closed_trades: myRep?.closed_trades ?? 0,
            overall_rep_score: myRep?.overall_rep_score ?? 0,
            overall_win_rate: myRep?.overall_win_rate ?? 0,
            top_patterns: myRep?.top_patterns ?? [],
            accuracy_by_condition: myRep?.accuracy_by_condition ?? {},
            personal_patterns: myPatterns,
            top_markets: topMarkets.map(([asset, m]) => ({ asset, ...m })),
            leaderboard_avg_score: lbAvgScore ?? null,
          }, null, 2));
          return;
        }

        // ── Display ────────────────────────────────────────────────────────
        const width = 68;
        const divider = theme.muted("─".repeat(width));

        console.log();
        console.log(theme.header(`  Your Trading Intelligence Profile`));
        console.log(divider);

        const shortWallet = wallet.slice(0, 14) + "..." + wallet.slice(-6);
        console.log(`  ${theme.muted("Wallet:")}  ${theme.label(shortWallet)}`);
        console.log(
          `  ${theme.muted("Trades:")}  ${theme.emphasis(String(myRep?.total_trades ?? myRecords.length))} total  ` +
          `${theme.muted("|")}  ${theme.emphasis(String(myRep?.closed_trades ?? 0))} closed`
        );

        if (myRep) {
          const repScore = myRep.overall_rep_score;
          const repColored = repScore >= 70 ? theme.profit(String(repScore))
            : repScore >= 50 ? theme.warning(String(repScore))
            : theme.muted(String(repScore));

          const winPct = (myRep.overall_win_rate * 100).toFixed(1) + "%";
          console.log(
            `  ${theme.muted("Rep Score:")} ${repColored}` +
            (lbAvgScore !== undefined
              ? theme.muted(`  (top-10 avg: ${lbAvgScore})`)
              : ""),
          );
          console.log(`  ${theme.muted("Win Rate:")}  ${theme.emphasis(winPct)}`);
        }

        // ── Strongest conditions ───────────────────────────────────────────
        if (myRep && Object.keys(myRep.accuracy_by_condition).length > 0) {
          console.log(divider);
          console.log(theme.label(`  Your strongest conditions`));
          console.log(divider);

          const conditions = Object.values(myRep.accuracy_by_condition)
            .filter((c) => c.total_trades >= 2)
            .sort((a, b) => b.win_rate - a.win_rate)
            .slice(0, 6);

          if (conditions.length > 0) {
            const W = { cond: 28, wr: 9, trades: 8, pnl: 12 };
            console.log(
              theme.muted(
                `  ${padR("Condition", W.cond)}  ${padL("Win Rate", W.wr)}  ${padL("Trades", W.trades)}  ${padL("Avg P&L%", W.pnl)}`
              )
            );
            console.log(divider);

            for (const c of conditions) {
              const label = padR(c.condition_key.replace(/_/g, " "), W.cond);
              const wr = padL((c.win_rate * 100).toFixed(1) + "%", W.wr);
              const wrColored = c.win_rate >= 0.70 ? theme.profit(wr) : c.win_rate >= 0.55 ? theme.warning(wr) : theme.muted(wr);
              const trades = padL(String(c.total_trades), W.trades);
              const pnl = c.avg_pnl_pct;
              const pnlStr = (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + "%";
              const pnlColored = padL(pnl >= 0 ? theme.profit(pnlStr) : theme.loss(pnlStr), W.pnl);
              console.log(`  ${label}  ${wrColored}  ${trades}  ${pnlColored}`);
            }
          } else {
            console.log(theme.muted("  More trades needed to compute condition accuracy."));
          }
        }

        // ── Markets you trade best ─────────────────────────────────────────
        if (topMarkets.length > 0) {
          console.log(divider);
          console.log(theme.label(`  Markets you trade best`));
          console.log(divider);

          const W = { asset: 20, trades: 8, wr: 9, pnl: 12 };
          console.log(
            theme.muted(
              `  ${padR("Market", W.asset)}  ${padL("Trades", W.trades)}  ${padL("Win Rate", W.wr)}  ${padL("Avg P&L%", W.pnl)}`
            )
          );

          for (const [asset, m] of topMarkets) {
            const base = asset.replace("-USDC-PERP", "").replace("-USDC", "");
            const a = padR(base, W.asset);
            const t = padL(String(m.total), W.trades);
            const wr = m.total > 0 ? m.wins / m.total : 0;
            const wrStr = padL((wr * 100).toFixed(1) + "%", W.wr);
            const wrColored = wr >= 0.60 ? theme.profit(wrStr) : theme.warning(wrStr);
            const avgPnl = m.total > 0 ? m.pnl / m.total : 0;
            const pnlStr = (avgPnl >= 0 ? "+" : "") + avgPnl.toFixed(2) + "%";
            const pnlColored = padL(avgPnl >= 0 ? theme.profit(pnlStr) : theme.loss(pnlStr), W.pnl);
            console.log(`  ${theme.label(a)}  ${t}  ${wrColored}  ${pnlColored}`);
          }
        }

        // ── Personal patterns ──────────────────────────────────────────────
        if (myPatterns.length > 0) {
          console.log(divider);
          console.log(theme.label(`  Your personal patterns (${myPatterns.length} detected)`));
          console.log(divider);

          for (const [idx, p] of myPatterns.slice(0, 3).entries()) {
            const wr = (p.win_rate * 100).toFixed(1) + "%";
            const pnl = (p.avg_pnl_pct >= 0 ? "+" : "") + p.avg_pnl_pct.toFixed(2) + "%";
            console.log(
              `  ${theme.muted(String(idx + 1) + ".")} ${padR(p.name, 38)} ` +
              `${theme.emphasis(wr)}  ` +
              (p.avg_pnl_pct >= 0 ? theme.profit(pnl) : theme.loss(pnl)) +
              `  ${theme.muted("n=" + p.sample_size)}`
            );
          }
        }

        console.log(divider);
        if (lbAvgScore !== undefined && myRep) {
          const delta = myRep.overall_rep_score - lbAvgScore;
          const deltaStr = (delta >= 0 ? "+" : "") + delta;
          const deltaColored = delta >= 0 ? theme.profit(deltaStr) : theme.loss(deltaStr);
          console.log(
            `  ${theme.muted("vs top-10 traders:")}  rep ${deltaColored}  vs avg ${lbAvgScore}`
          );
        }
        console.log(theme.muted("  Hint: ") + theme.label("pacifica leaderboard  |  pacifica intelligence patterns"));
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
  // pacifica intelligence signal  (alias for "run" — same logic, friendly name)
  // -------------------------------------------------------------------------
  intel
    .command("signal")
    .description("Show live market signals matching verified patterns (alias for 'run')")
    .option("--json", "Output JSON { patterns, signals }")
    .action(async (opts: { json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        process.stdout.write(theme.muted("Running pattern engine... "));
        const patterns = await runPatternEngine();
        process.stdout.write(theme.muted(`${patterns.length} patterns verified.\n`));

        if (patterns.length === 0) {
          console.log(theme.warning("No patterns yet. Run 'pacifica intelligence seed' to add data first."));
          return;
        }

        process.stdout.write(theme.muted("Scanning live markets..."));
        let signals: Awaited<ReturnType<typeof scanForActiveSignals>> = [];
        try {
          const config = await loadConfig();
          const signer = createSignerFromConfig(config);
          client = new PacificaClient({ network: config.network, signer });
          signals = await scanForActiveSignals(client, patterns);
          process.stdout.write(theme.muted(` ${signals.length} signal(s) found.\n`));
        } catch {
          process.stdout.write(theme.muted(" (offline — skipped)\n"));
        }

        if (opts.json) {
          console.log(JSON.stringify({ patterns, signals }, null, 2));
          return;
        }

        console.log();
        const W = { asset: 14, dir: 7, pattern: 38, wr: 8, apr: 8 };
        const width = 2 + W.asset + 2 + W.dir + 2 + W.pattern + 2 + W.wr + 2 + W.apr;
        const divider = theme.muted("─".repeat(width));

        console.log(theme.header("  Active Market Signals"));
        console.log(divider);

        if (signals.length === 0) {
          console.log(theme.muted("  No live markets currently match any verified pattern."));
        } else {
          console.log(theme.muted(`  ${padR("Market", W.asset)}  ${padR("Signal", W.dir)}  ${padR("Pattern", W.pattern)}  ${padL("Win Rate", W.wr)}  ${padL("APR", W.apr)}`));
          console.log(divider);

          for (const s of signals) {
            const base     = s.asset.replace("-USDC-PERP", "").replace("-USDC", "");
            const dirRaw   = s.direction === "long" ? "LONG ↑" : "SHORT ↓";
            const dirColor = s.direction === "long" ? theme.profit(dirRaw) : theme.loss(dirRaw);
            const confidence = s.fullMatch ? "" : theme.muted("~");
            const apr    = s.fundingRate * 3 * 365;
            const aprStr = (apr >= 0 ? "+" : "") + apr.toFixed(1) + "%";
            const aprColor = apr > 5 ? theme.profit(aprStr) : apr < -5 ? theme.loss(aprStr) : theme.muted(aprStr);
            console.log(
              `  ${padR(base, W.asset)}  ${padR(dirColor, W.dir)}  ${padR(confidence + s.pattern.name, W.pattern)}  ${padL(fmtPct(s.pattern.win_rate), W.wr)}  ${padL(aprColor, W.apr)}`
            );
          }

          console.log(divider);
          const best = signals[0]!;
          const bestBase = best.asset.replace("-USDC-PERP", "").replace("-USDC", "");
          console.log(
            theme.muted(`  Strongest: `) +
            theme.emphasis(`${bestBase} ${best.direction.toUpperCase()}`) +
            theme.muted(` — ${fmtPct(best.pattern.win_rate)} win rate`)
          );
          console.log(theme.muted(`  Hint: `) + theme.label(`pacifica trade --market ${best.asset} --side ${best.direction} --size 500`));
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
  // pacifica intelligence serve [--port <n>]
  // -------------------------------------------------------------------------
  intel
    .command("serve")
    .description("Start the Intelligence REST API server (default port 4242)")
    .option("--port <n>", "Port to listen on", "4242")
    .option("--force", "Kill any existing process on the port before starting")
    .action(async (opts: { port: string; force?: boolean }) => {
      const port = parseInt(opts.port, 10);

      // If --force, proactively free the port before binding
      if (opts.force) {
        try {
          const { execSync } = await import("node:child_process");
          const pids = execSync(`lsof -ti :${port} 2>/dev/null || true`, { encoding: "utf-8" })
            .trim()
            .split("\n")
            .filter(Boolean);
          if (pids.length > 0) {
            console.log(theme.muted(`Freeing port ${port} (killing PID ${pids.join(", ")})...`));
            execSync(`kill ${pids.join(" ")}`);
            await new Promise((r) => setTimeout(r, 400));
          }
        } catch { /* best-effort */ }
      }

      console.log(theme.muted(`Starting Intelligence API on port ${port}...`));
      try {
        await startServer(port);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Detect EADDRINUSE — offer interactive fix
        if (message.includes("EADDRINUSE")) {
          console.error();
          console.error(theme.error(`Port ${port} is already in use.`));

          let holderPid: string | null = null;
          let holderCmd: string | null = null;
          try {
            const { execSync } = await import("node:child_process");
            const info = execSync(`lsof -i :${port} 2>/dev/null | tail -n +2`, { encoding: "utf-8" }).trim();
            if (info) {
              const parts = info.split("\n")[0].split(/\s+/);
              holderCmd = parts[0];
              holderPid = parts[1];
              console.error(theme.muted(`  Held by: ${holderCmd} (PID ${holderPid})`));
            }
          } catch { /* best-effort */ }

          // Interactive prompt — only when stdin is a TTY (i.e. real terminal use)
          if (process.stdin.isTTY && holderPid) {
            console.error();
            process.stderr.write(theme.emphasis(`  Kill PID ${holderPid} and start fresh? [Y/n] `));

            const answer = await new Promise<string>((resolve) => {
              process.stdin.resume();
              process.stdin.setEncoding("utf-8");
              process.stdin.once("data", (d) => {
                process.stdin.pause();
                resolve(String(d).trim().toLowerCase());
              });
            });

            if (answer === "" || answer === "y" || answer === "yes") {
              try {
                const { execSync } = await import("node:child_process");
                execSync(`kill ${holderPid}`);
                console.log(theme.muted(`  Killed PID ${holderPid}, restarting...\n`));
                await new Promise((r) => setTimeout(r, 500));
                await startServer(port);
                return; // success — don't fall through to the error path
              } catch (killErr) {
                console.error(theme.error(`  Failed to restart: ${killErr instanceof Error ? killErr.message : String(killErr)}`));
              }
            } else {
              console.error(theme.muted("  Cancelled."));
            }
          } else {
            // Non-interactive — just print the guidance
            console.error();
            console.error(theme.muted("  Options to fix:"));
            console.error(theme.muted(`    1. Free the port:    pacifica intelligence serve --force`));
            console.error(theme.muted(`    2. Use another port: pacifica intelligence serve --port 4243`));
            console.error(theme.muted(`    3. Kill it manually: lsof -ti :${port} | xargs kill`));
          }
          console.error();
        } else {
          console.error(theme.error(`\nFailed to start server: ${message}\n`));
        }
        process.exitCode = 1;
      }
    });

  return intel;
}
