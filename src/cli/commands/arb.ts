// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Funding Rate Arbitrage Commands
// ---------------------------------------------------------------------------
// pacifica arb scan    - One-shot opportunity scan
// pacifica arb start   - Start the arb bot daemon
// pacifica arb stop    - Graceful stop
// pacifica arb status  - Live TUI status
// pacifica arb list    - Tabular position history
// pacifica arb close   - Manual close a position
// pacifica arb config  - View/update arb config
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { ArbManager } from "../../core/arb/manager.js";
import { theme } from "../theme.js";
import type { ArbConfig } from "../../core/config/types.js";
import { buildPnlSummary } from "../../core/arb/pnl.js";

// ---------------------------------------------------------------------------
// PID file helpers (for start/stop)
// ---------------------------------------------------------------------------

const PID_FILE = join(homedir(), ".pacifica", "arb.pid");

function writePid(): void {
  try {
    writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 });
  } catch { /* best-effort */ }
}

function removePid(): void {
  try { if (existsSync(PID_FILE)) unlinkSync(PID_FILE); } catch { /* best-effort */ }
}

function readPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function fmtUsd(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createArbCommand(): Command {
  const arb = new Command("arb")
    .description("Funding rate arbitrage bot");

  arb.addCommand(buildScanCmd());
  arb.addCommand(buildStartCmd());
  arb.addCommand(buildStopCmd());
  arb.addCommand(buildStatusCmd());
  arb.addCommand(buildListCmd());
  arb.addCommand(buildCloseCmd());
  arb.addCommand(buildConfigCmd());

  return arb;
}

// ---------------------------------------------------------------------------
// arb scan
// ---------------------------------------------------------------------------

function buildScanCmd(): Command {
  return new Command("scan")
    .description("Scan for funding rate arbitrage opportunities")
    .option("--min-apr <n>", "Minimum annualized APR threshold", parseFloat)
    .option("--json", "Output raw JSON")
    .action(async (opts: { minApr?: number; json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

        const arbConfig: ArbConfig = opts.minApr
          ? { ...config.arb, min_apr_threshold: opts.minApr }
          : config.arb;

        const manager = new ArbManager(client, arbConfig);
        manager.load();

        console.log(theme.muted("Scanning markets..."));
        const context = await manager.scanAllMarkets();

        // Apply threshold filter locally
        const threshold = arbConfig.min_apr_threshold;
        const matches = context.allOpportunities.filter(
          (o) => o.annualizedApr >= threshold,
        );

        if (opts.json) {
          console.log(JSON.stringify({ opportunities: matches, context }, null, 2));
          return;
        }

        // Regime header — always shown
        const regimeStr = context.regime === "HOT"
          ? theme.profit(context.regime)
          : context.regime === "WARM"
          ? theme.emphasis(context.regime)
          : theme.muted(context.regime);
        const maxAprStr = context.maxAprFound > 0
          ? theme.muted(`Max APR: ${fmtPct(context.maxAprFound)} (${context.maxAprSymbol})`)
          : theme.muted("No eligible markets");

        console.log();
        console.log(theme.header("Funding Rate Arbitrage Opportunities"));
        console.log(theme.muted("─".repeat(90)));
        console.log(`  Regime: ${regimeStr}  ${maxAprStr}  ${theme.muted(`${context.eligibleMarkets} markets scanned`)}`);
        console.log(theme.muted("─".repeat(90)));

        const printRows = (opps: typeof matches): void => {
          console.log(
            `  ${pad("Symbol", 8)} ${padLeft("Rate", 10)} ${padLeft("APR", 10)} ${pad("Side", 16)} ${padLeft("Volume 24h", 12)} ${padLeft("Score", 8)} ${padLeft("Ext Div", 10)}`,
          );
          console.log(theme.muted("  " + "─".repeat(84)));
          for (const opp of opps) {
            const rate = (opp.currentRate * 100).toFixed(4) + "%";
            const apr = fmtPct(opp.annualizedApr);
            const aprColor = opp.annualizedApr > 80 ? theme.profit(apr)
              : opp.annualizedApr > 40 ? theme.emphasis(apr)
              : theme.muted(apr);
            const side = opp.side === "short_collects"
              ? theme.profit("▼ short earns")
              : theme.warning("▲ long earns");
            const vol = "$" + (opp.volume24hUsd / 1e6).toFixed(1) + "M";
            const div = opp.divergenceBps !== undefined
              ? (opp.divergenceBps > 0 ? "+" : "") + opp.divergenceBps + "bps"
              : "—";
            console.log(
              `  ${pad(opp.symbol, 8)} ${padLeft(rate, 21)} ${padLeft(aprColor, 21)} ${pad(side, 27)} ${padLeft(vol, 12)} ${padLeft(opp.score.toFixed(1), 8)} ${padLeft(div, 10)}`,
            );
          }
        };

        if (matches.length > 0) {
          console.log();
          printRows(matches);
          console.log();
          console.log(theme.muted(`  ${matches.length} opportunities found. Use 'pacifica arb start' to activate the bot.`));
        } else {
          console.log();
          console.log(theme.muted(`  No opportunities above ${threshold}% APR.`));

          const topN = context.allOpportunities.slice(0, 3);
          if (topN.length > 0) {
            console.log();
            console.log(theme.muted("  Best available (below threshold):"));
            console.log();
            printRows(topN);
            console.log();
            const suggestApr = Math.max(Math.floor(topN[0].annualizedApr), 1);
            console.log(theme.muted(`  Tip: run 'pacifica arb scan --min-apr ${suggestApr}' to see these.`));
          }
        }
        console.log();
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// arb start
// ---------------------------------------------------------------------------

function buildStartCmd(): Command {
  return new Command("start")
    .description("Start the funding rate arbitrage bot")
    .option("--size <usd>", "Position size in USD", parseFloat)
    .option("--min-apr <n>", "Minimum APR threshold", parseFloat)
    .option("--max-positions <n>", "Max concurrent positions", parseInt)
    .option("--dry-run", "Simulate entries without placing orders — prints what the bot would open, then exits")
    .action(async (opts: { size?: number; minApr?: number; maxPositions?: number; dryRun?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

        const arbConfig: ArbConfig = {
          ...config.arb,
          enabled: true,
          ...(opts.size !== undefined ? { position_size_usd: opts.size } : {}),
          ...(opts.minApr !== undefined ? { min_apr_threshold: opts.minApr } : {}),
          ...(opts.maxPositions !== undefined ? { max_concurrent_positions: opts.maxPositions } : {}),
        };

        const manager = new ArbManager(client, arbConfig);
        manager.load();

        // ── Dry-run: scan, apply guardrails, print simulated entries, exit ──
        if (opts.dryRun) {
          console.log();
          console.log(theme.header("Arb Bot — Dry Run"));
          console.log(theme.muted("─".repeat(90)));
          console.log(`  Min APR:       ${arbConfig.min_apr_threshold}%`);
          console.log(`  Size per pos:  ${fmtUsd(arbConfig.position_size_usd)}`);
          console.log(`  Max positions: ${arbConfig.max_concurrent_positions}`);
          console.log(`  Exit policy:   ${arbConfig.exit_policy}`);
          console.log(theme.muted("─".repeat(90)));
          console.log();
          console.log(theme.muted("  Scanning markets..."));

          const context = await manager.scanAllMarkets();
          const threshold = arbConfig.min_apr_threshold;
          const above = context.allOpportunities.filter((o) => o.annualizedApr >= threshold);

          if (above.length === 0) {
            console.log();
            console.log(theme.muted(`  No opportunities above ${threshold}% APR. Bot would stay idle.`));
            const top = context.allOpportunities[0];
            if (top) {
              console.log(theme.muted(`  Best available: ${top.symbol} at ${fmtPct(top.annualizedApr)} APR (below threshold)`));
            }
            console.log();
            return;
          }

          // Apply canEnter guardrails to see what the bot would actually take
          type Sim = { opp: typeof above[0]; wouldEnter: boolean; reason?: string };
          const simulated: Sim[] = [];
          let remainingSlots = arbConfig.max_concurrent_positions;
          for (const opp of above) {
            const wouldEnter = manager.canEnter(opp) && remainingSlots > 0;
            if (wouldEnter) remainingSlots--;
            simulated.push({
              opp,
              wouldEnter,
              reason: !wouldEnter
                ? (remainingSlots === 0 ? "max positions reached" : "guardrail blocked (cooldown / fee ratio / daily loss)")
                : undefined,
            });
          }

          const taken = simulated.filter((s) => s.wouldEnter);
          const skipped = simulated.filter((s) => !s.wouldEnter);

          if (taken.length > 0) {
            console.log();
            console.log(theme.success(`  Would open ${taken.length} position(s):`));
            console.log();
            console.log(
              `  ${pad("Symbol", 8)} ${pad("Side", 16)} ${padLeft("Rate", 10)} ${padLeft("APR", 10)} ${padLeft("Size", 10)} ${padLeft("Est 8h earn", 14)} ${padLeft("Next funding", 14)}`,
            );
            console.log(theme.muted("  " + "─".repeat(88)));
            for (const { opp } of taken) {
              const rate = (opp.currentRate * 100).toFixed(4) + "%";
              const apr = fmtPct(opp.annualizedApr);
              const side = opp.side === "short_collects" ? theme.profit("▼ short earns") : theme.warning("▲ long earns");
              const size = fmtUsd(arbConfig.position_size_usd);
              // Estimated earning per 8h = size * |rate| - fees (approximate with no fees here; fee gate already passed)
              const est8h = arbConfig.position_size_usd * Math.abs(opp.currentRate);
              const estStr = theme.profit("+" + fmtUsd(est8h));
              const nextMin = Math.max(0, Math.round(opp.msToFunding / 60_000));
              const nextStr = nextMin < 60 ? `${nextMin}m` : `${Math.floor(nextMin / 60)}h${nextMin % 60}m`;
              console.log(
                `  ${pad(opp.symbol, 8)} ${pad(side, 27)} ${padLeft(rate, 10)} ${padLeft(apr, 10)} ${padLeft(size, 10)} ${padLeft(estStr, 25)} ${padLeft(nextStr, 14)}`,
              );
            }
            const totalSize = taken.length * arbConfig.position_size_usd;
            const total8h = taken.reduce((sum, { opp }) => sum + arbConfig.position_size_usd * Math.abs(opp.currentRate), 0);
            console.log(theme.muted("  " + "─".repeat(88)));
            console.log(
              `  ${pad("TOTAL", 8)} ${pad("", 27)} ${padLeft("", 10)} ${padLeft("", 10)} ${padLeft(fmtUsd(totalSize), 10)} ${padLeft(theme.profit("+" + fmtUsd(total8h)), 25)}`,
            );
          } else {
            console.log();
            console.log(theme.muted("  No positions would be opened (all blocked by guardrails)."));
          }

          if (skipped.length > 0) {
            console.log();
            console.log(theme.muted(`  Skipped ${skipped.length} opportunity(s):`));
            for (const { opp, reason } of skipped) {
              console.log(theme.muted(`    - ${opp.symbol} (${fmtPct(opp.annualizedApr)} APR) · ${reason}`));
            }
          }

          console.log();
          console.log(theme.muted("  This was a dry run. No orders were placed."));
          console.log(theme.muted("  Run without --dry-run to activate the bot."));
          console.log();
          return;
        }

        manager.start();

        console.log();
        console.log(theme.success("Arb bot started"));
        console.log(`  Strategy:       Single-sided funding collection`);
        console.log(`  Min APR:        ${arbConfig.min_apr_threshold}%`);
        console.log(`  Position size:  ${fmtUsd(arbConfig.position_size_usd)}`);
        console.log(`  Max positions:  ${arbConfig.max_concurrent_positions}`);
        console.log(`  Exit policy:    ${arbConfig.exit_policy}`);
        console.log(`  External rates: ${arbConfig.use_external_rates ? "enabled" : "disabled"}`);
        if (config.builder_code) {
          console.log(`  Builder code:   ${config.builder_code}`);
        }
        console.log();
        console.log(theme.muted("  Bot is running. Use 'pacifica arb status' to monitor."));
        console.log(theme.muted("  Use 'pacifica arb stop' to halt."));
        console.log();

        writePid();

        // Keep process alive while running
        await new Promise<void>((resolve) => {
          const shutdown = (): void => {
            console.log(theme.muted("\nStopping arb bot..."));
            manager.stop();
            removePid();
            resolve();
          };
          process.on("SIGINT", shutdown);
          process.on("SIGTERM", shutdown);
        });
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// arb stop
// ---------------------------------------------------------------------------

function buildStopCmd(): Command {
  return new Command("stop")
    .description("Stop the arbitrage bot (leaves positions open)")
    .action(async () => {
      const pid = readPid();
      if (!pid) {
        console.log(theme.muted("No running arb bot found."));
        return;
      }
      try {
        process.kill(pid, "SIGTERM");
        removePid();
        console.log(theme.success(`Arb bot (PID ${pid}) stopped.`));
        console.log(theme.muted("Open positions remain active — use 'pacifica arb list' to view them."));
      } catch {
        console.log(theme.warning(`Could not signal PID ${pid} — process may have already exited.`));
        removePid();
      }
    });
}

// ---------------------------------------------------------------------------
// arb status
// ---------------------------------------------------------------------------

function buildStatusCmd(): Command {
  return new Command("status")
    .description("Show arb bot status and active positions")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

        const manager = new ArbManager(client, config.arb);
        manager.load();

        const positions = manager.getPositions();
        const lifetime = manager.getLifetimeStats();
        const summary = buildPnlSummary(positions, lifetime);

        if (opts.json) {
          console.log(JSON.stringify({ positions, lifetime, summary }, null, 2));
          return;
        }

        console.log();
        console.log(theme.header("Arb Bot Status"));
        console.log(theme.muted("─".repeat(60)));

        // Lifetime stats
        const netSign = summary.totalNetPnlUsd >= 0 ? "+" : "";
        console.log(`  Funding collected:  ${fmtUsd(summary.totalFundingCollectedUsd)}`);
        console.log(`  Fees paid:          ${fmtUsd(summary.totalFeesPaidUsd)}`);
        console.log(`  Net P&L:            ${netSign}${fmtUsd(summary.totalNetPnlUsd)}`);
        console.log(`  Positions:          ${summary.positionsClosed} closed / ${summary.activePositions} active`);
        if (summary.positionsClosed > 0) {
          console.log(`  Win rate:           ${summary.winRate.toFixed(1)}%`);
        }
        console.log();

        const active = positions.filter((p) => p.status === "active" || p.status === "pending");
        if (active.length === 0) {
          console.log(theme.muted("  No active positions."));
        } else {
          console.log(theme.label("  Active Positions"));
          console.log(theme.muted("  " + "─".repeat(56)));
          for (const pos of active) {
            const fundingEarned = fmtUsd(pos.realizedFundingUsd);
            const entryApr = pos.entryApr.toFixed(1) + "% APR";
            const openedAgo = formatAgo(pos.openedAt);
            console.log(
              `  ${pad(pos.symbol, 8)} ${pad(pos.status, 10)} ${pad(entryApr, 12)} funding: ${fundingEarned}  (${openedAgo})`,
            );
            console.log(theme.muted(`    id: ${pos.id}`));
          }
        }
        console.log();
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// arb list
// ---------------------------------------------------------------------------

function buildListCmd(): Command {
  return new Command("list")
    .description("List arb positions")
    .option("--status <s>", "Filter by status (active, closed, error, all)", "all")
    .option("--json", "Output raw JSON")
    .action(async (opts: { status: string; json?: boolean }) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

        const manager = new ArbManager(client, config.arb);
        manager.load();

        const filter = opts.status !== "all" ? { status: opts.status } : undefined;
        const positions = manager.getPositions(filter);

        if (opts.json) {
          console.log(JSON.stringify(positions, null, 2));
          return;
        }

        if (positions.length === 0) {
          console.log(theme.muted("\nNo positions found.\n"));
          return;
        }

        console.log();
        console.log(theme.header(`Arb Positions (${positions.length})`));
        console.log(theme.muted("─".repeat(80)));
        console.log(
          `  ${pad("Symbol", 8)} ${pad("Status", 10)} ${padLeft("Entry APR", 12)} ${padLeft("Funding", 10)} ${padLeft("Net P&L", 10)} ${pad("Opened", 12)}`,
        );
        console.log(theme.muted("  " + "─".repeat(74)));

        for (const pos of positions) {
          const netPnl = pos.realizedFundingUsd + pos.realizedPnlUsd - pos.totalFeesUsd;
          const pnlStr = (netPnl >= 0 ? "+" : "") + fmtUsd(netPnl);
          const pnlColor = netPnl >= 0 ? theme.profit(pnlStr) : theme.loss(pnlStr);
          const statusColor = pos.status === "active"
            ? theme.success(pos.status)
            : pos.status === "error"
            ? theme.error(pos.status)
            : theme.muted(pos.status);

          console.log(
            `  ${pad(pos.symbol, 8)} ${pad(statusColor, 21)} ${padLeft(pos.entryApr.toFixed(1) + "%", 12)} ${padLeft(fmtUsd(pos.realizedFundingUsd), 21)} ${padLeft(pnlColor, 21)} ${pad(formatAgo(pos.openedAt), 12)}`,
          );
        }
        console.log();
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// arb close
// ---------------------------------------------------------------------------

function buildCloseCmd(): Command {
  return new Command("close")
    .description("Manually close an arb position")
    .argument("<id>", "Position ID (from arb list)")
    .action(async (id: string) => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer, builderCode: config.builder_code });

        const manager = new ArbManager(client, config.arb);
        manager.load();

        console.log(theme.muted(`Closing position ${id}...`));
        const result = await manager.closePosition(id);

        if (result.success) {
          console.log(theme.success("Position closed."));
        } else {
          console.error(theme.error(`Failed: ${result.error}`));
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// arb config
// ---------------------------------------------------------------------------

function buildConfigCmd(): Command {
  return new Command("config")
    .description("View or update arb bot configuration")
    .option("--show", "Show current config")
    .option("--min-apr <n>", "Set minimum APR threshold", parseFloat)
    .option("--size <usd>", "Set position size (USD)", parseFloat)
    .option("--max-positions <n>", "Set max concurrent positions", parseInt)
    .option("--exit <policy>", "Set exit policy (settlement|rate_inverted|apr_below|pnl_target)")
    .option("--enable", "Enable the arb bot")
    .option("--disable", "Disable the arb bot")
    .action(async (opts: {
      show?: boolean;
      minApr?: number;
      size?: number;
      maxPositions?: number;
      exit?: string;
      enable?: boolean;
      disable?: boolean;
    }) => {
      try {
        const config = await loadConfig();

        // Apply updates
        let updated = false;
        if (opts.enable) { config.arb.enabled = true; updated = true; }
        if (opts.disable) { config.arb.enabled = false; updated = true; }
        if (opts.minApr !== undefined) { config.arb.min_apr_threshold = opts.minApr; updated = true; }
        if (opts.size !== undefined) { config.arb.position_size_usd = opts.size; updated = true; }
        if (opts.maxPositions !== undefined) { config.arb.max_concurrent_positions = opts.maxPositions; updated = true; }
        if (opts.exit) {
          const valid = ["settlement", "rate_inverted", "apr_below", "pnl_target"];
          if (!valid.includes(opts.exit)) {
            console.error(theme.error(`Invalid exit policy. Choose: ${valid.join(", ")}`));
            process.exitCode = 1;
            return;
          }
          config.arb.exit_policy = opts.exit as ArbConfig["exit_policy"];
          updated = true;
        }

        if (updated) {
          await saveConfig(config);
          console.log(theme.success("Config saved."));
        }

        // Always show config after
        console.log();
        console.log(theme.header("Arb Configuration"));
        console.log(theme.muted("─".repeat(50)));
        const arb = config.arb;
        console.log(`  enabled:              ${arb.enabled ? theme.success("yes") : theme.muted("no")}`);
        console.log(`  min_apr_threshold:    ${arb.min_apr_threshold}%`);
        console.log(`  position_size_usd:    ${fmtUsd(arb.position_size_usd)}`);
        console.log(`  max_concurrent:       ${arb.max_concurrent_positions}`);
        console.log(`  exit_policy:          ${arb.exit_policy}`);
        console.log(`  use_external_rates:   ${arb.use_external_rates}`);
        console.log(`  max_daily_loss_usd:   ${fmtUsd(arb.max_daily_loss_usd)}`);
        if (config.builder_code) {
          console.log(`  builder_code:         ${config.builder_code}`);
        }
        console.log();
      } catch (err) {
        console.error(theme.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`));
        process.exitCode = 1;
      }
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
