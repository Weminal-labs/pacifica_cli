// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Alert Commands
// ---------------------------------------------------------------------------
// `pacifica alerts list [--json]`                   List all alerts
// `pacifica alerts add --symbol <s> --above|--below|... <value>`  Add alert
// `pacifica alerts remove <id>`                     Remove alert by ID
// `pacifica alerts check [--all] [--json]`          Check alerts vs live data
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { AlertManager } from "../../core/intelligence/alerts.js";
import type { AlertType } from "../../core/intelligence/schema.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Daemon PID helpers
// ---------------------------------------------------------------------------

const PACIFICA_DIR  = join(homedir(), ".pacifica");
const DAEMON_PID    = join(PACIFICA_DIR, "alerts-daemon.pid");

async function readDaemonPid(): Promise<number | null> {
  try {
    const raw = await readFile(DAEMON_PID, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    if (isNaN(pid)) return null;
    process.kill(pid, 0); // throws ESRCH if not running
    return pid;
  } catch {
    return null;
  }
}

async function writeDaemonPid(pid: number): Promise<void> {
  if (!existsSync(PACIFICA_DIR)) {
    await mkdir(PACIFICA_DIR, { recursive: true });
  }
  await writeFile(DAEMON_PID, String(pid), { encoding: "utf-8", mode: 0o600 });
}

async function removeDaemonPid(): Promise<void> {
  try { await unlink(DAEMON_PID); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Daemon polling loop (runs in-process; user can background with shell & or tmux)
// ---------------------------------------------------------------------------

async function runDaemonLoop(intervalSecs: number): Promise<void> {
  const config = await loadConfig();
  const manager = new AlertManager();
  const notified = new Set<string>(); // alert IDs already bell'd this session

  const list = await manager.listAlerts();
  if (list.length === 0) {
    console.log(theme.muted("  No alerts configured. Use 'pacifica alerts add' to add one."));
    return;
  }

  console.log();
  console.log(theme.header("  Pacifica Alert Daemon"));
  console.log(
    theme.muted(`  Monitoring ${list.length} alert${list.length !== 1 ? "s" : ""}`) +
    theme.muted(`  —  ${intervalSecs}s interval  —  Ctrl+C to stop`),
  );
  console.log();

  await writeDaemonPid(process.pid);

  const poll = async () => {
    try {
      const client = new PacificaClient({ network: config.network });
      try {
        const markets = await client.getMarkets();
        const results = await manager.checkAlerts(markets, new Map());
        const now = new Date().toLocaleTimeString("en-US", { hour12: false });

        for (const r of results) {
          if (r.urgency === "triggered" && !notified.has(r.alert.id)) {
            notified.add(r.alert.id);
            const sym  = r.alert.symbol;
            const type = r.alert.type;
            const thr  = formatThreshold(r.alert.type, r.alert.threshold);
            const cur  = r.currentValue > 0
              ? theme.muted(`  (current: ${formatCurrentValue(r.alert.type, r.currentValue)})`)
              : "";
            process.stdout.write("\x07"); // terminal bell
            console.log(
              `  [${now}] ` +
              theme.loss("⚡ TRIGGERED: ") +
              theme.emphasis(`${sym} ${type} ${thr}`) +
              cur,
            );
          } else if (r.urgency !== "triggered") {
            // Allow re-triggering if condition clears and re-occurs
            notified.delete(r.alert.id);
          }
        }
      } finally {
        client.destroy();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ts  = new Date().toLocaleTimeString("en-US", { hour12: false });
      console.error(theme.error(`  [${ts}] poll error: ${msg}`));
    }
  };

  // Immediate first poll
  await poll();

  const timer = setInterval(() => { void poll(); }, intervalSecs * 1_000);

  const shutdown = async () => {
    clearInterval(timer);
    await removeDaemonPid();
    console.log(theme.muted("\n  Alert daemon stopped."));
    process.exit(0);
  };

  process.on("SIGINT",  () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });

  // Keep the process alive indefinitely
  await new Promise<never>(() => { /* intentionally never resolves */ });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function statusColor(status: string): string {
  switch (status) {
    case "triggered": return theme.loss(status);
    case "near":      return theme.warning(status);
    case "active":    return theme.profit(status);
    case "dismissed": return theme.muted(status);
    default:          return status;
  }
}

function urgencyColor(urgency: string, text: string): string {
  switch (urgency) {
    case "triggered": return theme.loss(text);
    case "near":      return theme.warning(text);
    case "dormant":   return theme.muted(text);
    default:          return text;
  }
}

function urgencyIcon(urgency: string): string {
  switch (urgency) {
    case "triggered": return "\u25cf"; // ●
    case "near":      return "\u25c6"; // ◆
    default:          return "\u25a1"; // □
  }
}

function formatThreshold(type: AlertType, value: number): string {
  if (type === "funding_above" || type === "funding_below") {
    return (value * 100).toFixed(4) + "%";
  }
  if (type === "volume_spike") {
    if (value >= 1_000_000_000) return "$" + (value / 1_000_000_000).toFixed(1) + "B";
    if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1) + "M";
    if (value >= 1_000) return "$" + (value / 1_000).toFixed(1) + "K";
    return "$" + value.toFixed(0);
  }
  return formatPrice(value);
}

function formatCurrentValue(type: AlertType, value: number): string {
  return formatThreshold(type, value);
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createAlertsCommand(): Command {
  const alerts = new Command("alerts")
    .description("Manage price and funding alerts");

  // -------------------------------------------------------------------------
  // pacifica alerts list [--json]
  // -------------------------------------------------------------------------
  alerts
    .command("list")
    .description("List all configured alerts with current status")
    .option("--json", "Output JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const manager = new AlertManager();
        const list = await manager.listAlerts();

        if (opts.json) {
          console.log(JSON.stringify(list, null, 2));
          return;
        }

        if (list.length === 0) {
          console.log(theme.muted("No alerts configured. Use 'pacifica alerts add' to create one."));
          return;
        }

        const width = 70;
        const title = ` ALERTS (${list.length}) `;
        const dashLen = Math.max(0, width - title.length - 2);
        const dashRight = "\u2500".repeat(dashLen);

        console.log();
        console.log(theme.header("\u250c\u2500" + title + dashRight + "\u2510"));

        // Header row
        console.log(
          theme.label(
            "\u2502 " +
            pad("ID", 8) + "  " +
            pad("SYMBOL", 8) + "  " +
            pad("TYPE", 15) + "  " +
            pad("THRESHOLD", 12) + "  " +
            pad("STATUS", 10) +
            " \u2502",
          ),
        );
        console.log(theme.muted("\u2502 " + "\u2500".repeat(width - 2) + " \u2502"));

        for (const alert of list) {
          const idStr   = pad(shortId(alert.id), 8);
          const symStr  = pad(alert.symbol.toUpperCase(), 8);
          const typeStr = pad(alert.type, 15);
          const thrStr  = pad(formatThreshold(alert.type, alert.threshold), 12);
          const statStr = pad(alert.status, 10);

          // Build raw row then apply color to status only
          const row =
            "\u2502 " +
            idStr + "  " +
            symStr + "  " +
            typeStr + "  " +
            thrStr + "  " +
            statusColor(alert.status) +
            " ".repeat(Math.max(0, 10 - alert.status.length)) +
            " \u2502";

          console.log(row);
          void statStr; // suppress unused-variable warning
        }

        console.log(theme.header("\u2514" + "\u2500".repeat(width) + "\u2518"));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica alerts add --symbol <s> --above|--below|... <value> [--note <t>]
  // -------------------------------------------------------------------------
  alerts
    .command("add")
    .description("Add a new price or funding alert")
    .requiredOption("--symbol <symbol>", "Market symbol (e.g. BTC)")
    .option("--above <price>", "Trigger when price goes above value", parseFloat)
    .option("--below <price>", "Trigger when price goes below value", parseFloat)
    .option("--funding-above <rate>", "Trigger when funding rate > value", parseFloat)
    .option("--funding-below <rate>", "Trigger when funding rate < value", parseFloat)
    .option("--volume-spike <usd>", "Trigger when 24h volume > USD value", parseFloat)
    .option("--note <text>", "Optional label for this alert")
    .action(async (opts: {
      symbol: string;
      above?: number;
      below?: number;
      fundingAbove?: number;
      fundingBelow?: number;
      volumeSpike?: number;
      note?: string;
    }) => {
      try {
        // Map flags to [AlertType, value] pairs
        const conditions: Array<[AlertType, number]> = [];
        if (opts.above !== undefined)        conditions.push(["price_above", opts.above]);
        if (opts.below !== undefined)        conditions.push(["price_below", opts.below]);
        if (opts.fundingAbove !== undefined) conditions.push(["funding_above", opts.fundingAbove]);
        if (opts.fundingBelow !== undefined) conditions.push(["funding_below", opts.fundingBelow]);
        if (opts.volumeSpike !== undefined)  conditions.push(["volume_spike", opts.volumeSpike]);

        // Validate exactly one condition
        if (conditions.length === 0) {
          console.error(theme.error("Error: Provide exactly one condition flag."));
          console.log(theme.muted("  Examples:"));
          console.log(theme.muted("    pacifica alerts add --symbol BTC --above 100000"));
          console.log(theme.muted("    pacifica alerts add --symbol ETH --below 2000 --note 'dip buy'"));
          console.log(theme.muted("    pacifica alerts add --symbol BTC --funding-above 0.0005"));
          console.log(theme.muted("    pacifica alerts add --symbol ETH --volume-spike 50000000"));
          process.exitCode = 1;
          return;
        }

        if (conditions.length > 1) {
          console.error(theme.error("Error: Provide exactly one condition flag (got multiple)."));
          process.exitCode = 1;
          return;
        }

        const [type, threshold] = conditions[0];
        const symbol = opts.symbol.toUpperCase();

        const manager = new AlertManager();
        const alert = await manager.addAlert({
          symbol,
          type,
          threshold,
          note: opts.note,
        });

        console.log();
        console.log(theme.success("  Alert created."));
        console.log(`  ${theme.label("ID:")}        ${shortId(alert.id)}`);
        console.log(`  ${theme.label("Symbol:")}    ${alert.symbol}`);
        console.log(`  ${theme.label("Type:")}      ${alert.type}`);
        console.log(`  ${theme.label("Threshold:")} ${formatThreshold(alert.type, alert.threshold)}`);
        if (alert.note) {
          console.log(`  ${theme.label("Note:")}      ${alert.note}`);
        }
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica alerts remove <id>
  // -------------------------------------------------------------------------
  alerts
    .command("remove <id>")
    .description("Remove an alert by ID (first 8 chars is enough)")
    .action(async (id: string) => {
      try {
        const manager = new AlertManager();
        const list = await manager.listAlerts();

        // Find by prefix match against first 8 chars
        const match = list.find(
          (a) => a.id === id || a.id.startsWith(id) || shortId(a.id) === id,
        );

        if (!match) {
          console.error(theme.error(`Alert not found: ${id}`));
          console.log(theme.muted("  Use 'pacifica alerts list' to see available IDs."));
          process.exitCode = 1;
          return;
        }

        const removed = await manager.removeAlert(match.id);
        if (removed) {
          console.log(theme.success(`  Alert ${shortId(match.id)} removed.`));
        } else {
          console.error(theme.error(`Failed to remove alert ${shortId(match.id)}.`));
          process.exitCode = 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica alerts check [--all] [--json]
  // -------------------------------------------------------------------------
  alerts
    .command("check")
    .description("Check all alerts against current market data")
    .option("--all", "Include dormant alerts in output")
    .option("--json", "Output JSON")
    .action(async (opts: { all?: boolean; json?: boolean }) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        client = new PacificaClient({ network: config.network });

        const markets = await client.getMarkets();

        const manager = new AlertManager();
        // Pass empty funding-rate map — market.fundingRate is used as fallback
        const results = await manager.checkAlerts(markets, new Map());

        // Filter based on --all flag
        const displayResults = opts.all
          ? results
          : results.filter((r) => r.urgency === "triggered" || r.urgency === "near");

        if (opts.json) {
          console.log(JSON.stringify(displayResults, null, 2));
          return;
        }

        if (displayResults.length === 0) {
          console.log(theme.muted("No triggered or near-trigger alerts."));
          if (!opts.all) {
            console.log(theme.muted("  Use --all to include dormant alerts."));
          }
          return;
        }

        const triggered = displayResults.filter((r) => r.urgency === "triggered");
        const near      = displayResults.filter((r) => r.urgency === "near");
        const dormant   = displayResults.filter((r) => r.urgency === "dormant");

        const width = 70;
        const titleStr = " ALERT TRIAGE ";
        const dashLen = Math.max(0, width - titleStr.length - 2);

        console.log();
        console.log(theme.header("\u250c\u2500" + titleStr + "\u2500".repeat(dashLen) + "\u2510"));

        // --- TRIGGERED ---
        if (triggered.length > 0) {
          console.log(theme.loss(`\u2502 TRIGGERED (${triggered.length})` + " ".repeat(width - 15 - String(triggered.length).length) + " \u2502"));
          for (const r of triggered) {
            const icon = urgencyIcon("triggered");
            const sym  = r.alert.symbol.padEnd(5);
            const type = r.alert.type.padEnd(16);
            const thr  = formatThreshold(r.alert.type, r.alert.threshold).padEnd(12);
            const cur  = r.currentValue > 0
              ? "current: " + formatCurrentValue(r.alert.type, r.currentValue)
              : "";
            const dist = r.distancePct !== 0
              ? " | " + Math.abs(r.distancePct).toFixed(1) + "% past"
              : "";

            const line = `\u2502  ${icon} ${sym} ${type} ${thr} ${cur}${dist}`;
            console.log(theme.loss(line));
          }
          console.log(theme.muted("\u2502"));
        }

        // --- NEAR ---
        if (near.length > 0) {
          console.log(theme.warning(`\u2502 NEAR TRIGGER (${near.length})` + " ".repeat(Math.max(0, width - 16 - String(near.length).length)) + " \u2502"));
          for (const r of near) {
            const icon = urgencyIcon("near");
            const sym  = r.alert.symbol.padEnd(5);
            const type = r.alert.type.padEnd(16);
            const thr  = formatThreshold(r.alert.type, r.alert.threshold).padEnd(12);
            const cur  = r.currentValue > 0
              ? "current: " + formatCurrentValue(r.alert.type, r.currentValue)
              : "";
            const dist = r.distancePct > 0
              ? " | +" + r.distancePct.toFixed(1) + "% away"
              : "";

            const line = `\u2502  ${icon} ${sym} ${type} ${thr} ${cur}${dist}`;
            console.log(theme.warning(line));
          }
        }

        // --- DORMANT (only shown with --all) ---
        if (dormant.length > 0) {
          if (triggered.length > 0 || near.length > 0) {
            console.log(theme.muted("\u2502"));
          }
          console.log(theme.muted(`\u2502 DORMANT (${dormant.length})` + " ".repeat(Math.max(0, width - 13 - String(dormant.length).length)) + " \u2502"));
          for (const r of dormant) {
            const icon = urgencyIcon("dormant");
            const sym  = r.alert.symbol.padEnd(5);
            const type = r.alert.type.padEnd(16);
            const thr  = formatThreshold(r.alert.type, r.alert.threshold);
            const line = `\u2502  ${icon} ${sym} ${type} ${thr}`;
            console.log(urgencyColor("dormant", line));
          }
        }

        console.log(theme.header("\u2514" + "\u2500".repeat(width) + "\u2518"));
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
  // pacifica alerts daemon <start|stop|status>
  // -------------------------------------------------------------------------

  const daemon = new Command("daemon")
    .description("Manage the background alert monitoring daemon");

  daemon
    .command("start")
    .description("Start the alert daemon (polls every <interval> seconds)")
    .option("--interval <s>", "Poll interval in seconds", "30")
    .action(async (opts: { interval: string }) => {
      try {
        const existing = await readDaemonPid();
        if (existing !== null) {
          console.log(theme.warning(`  Daemon already running (PID ${existing}).`));
          console.log(theme.muted("  Use 'pacifica alerts daemon stop' to stop it."));
          return;
        }

        const intervalSecs = Math.max(5, parseInt(opts.interval, 10) || 30);
        await runDaemonLoop(intervalSecs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  daemon
    .command("stop")
    .description("Stop the alert daemon")
    .action(async () => {
      try {
        const pid = await readDaemonPid();
        if (pid === null) {
          console.log(theme.muted("  No daemon is running."));
          return;
        }
        process.kill(pid, "SIGTERM");
        await removeDaemonPid();
        console.log(theme.success(`  Alert daemon stopped (PID ${pid}).`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  daemon
    .command("status")
    .description("Show whether the alert daemon is running")
    .action(async () => {
      try {
        const pid = await readDaemonPid();
        if (pid === null) {
          console.log(theme.muted("  Alert daemon is not running."));
          console.log(theme.muted("  Start it with: pacifica alerts daemon start"));
        } else {
          const manager = new AlertManager();
          const list = await manager.listAlerts();
          console.log();
          console.log(theme.success(`  Alert daemon running`) + theme.muted(` (PID ${pid})`));
          console.log(theme.muted(`  Monitoring ${list.length} alert${list.length !== 1 ? "s" : ""}`));
          console.log(theme.muted(`  PID file: ${DAEMON_PID}`));
          console.log();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  alerts.addCommand(daemon);

  return alerts;
}
