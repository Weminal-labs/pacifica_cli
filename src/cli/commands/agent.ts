// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Agent Command
// ---------------------------------------------------------------------------
// Manage the AI trading agent: view status dashboard, start/stop the agent,
// edit guardrail configuration, and view the action audit trail.
//
// Usage:
//   pacifica agent status              Show agent dashboard
//   pacifica agent stop                Immediately disable agent trading
//   pacifica agent start               Re-enable agent trading
//   pacifica agent config              Interactive guardrail editor
//   pacifica agent log [--today] ...   View action audit trail
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm, number } from "@inquirer/prompts";
import { loadConfig, saveConfig } from "../../core/config/loader.js";
import { SpendingTracker } from "../../core/agent/spending-tracker.js";
import { AgentActionLogger } from "../../core/agent/action-logger.js";
import type { AgentLogEntry } from "../../core/agent/action-logger.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Global-options type (subset exposed by the root Commander program)
// ---------------------------------------------------------------------------

interface GlobalOpts {
  testnet?: boolean;
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createAgentCommand(): Command {
  const agent = new Command("agent")
    .description("Configure and manage the AI trading agent");

  agent
    .command("status")
    .description("Show agent dashboard with limits and recent activity")
    .action(async (_opts, cmd) => {
      const globalOpts = resolveGlobalOpts(cmd);
      await showStatus(globalOpts);
    });

  agent
    .command("stop")
    .description("Immediately disable agent trading (kill switch)")
    .action(async () => {
      await stopAgent();
    });

  agent
    .command("start")
    .description("Re-enable agent trading")
    .action(async () => {
      await startAgent();
    });

  agent
    .command("config")
    .description("Edit agent guardrail settings")
    .action(async () => {
      await editConfig();
    });

  agent
    .command("log")
    .description("View agent action audit trail")
    .option("--today", "Show today's actions only")
    .option("--action <type>", "Filter by action type")
    .option("--symbol <symbol>", "Filter by symbol")
    .option("--limit <n>", "Number of entries", "20")
    .action(async (opts, cmd) => {
      const globalOpts = resolveGlobalOpts(cmd);
      await showLog(opts, globalOpts);
    });

  return agent;
}

// ---------------------------------------------------------------------------
// Resolve global options
// ---------------------------------------------------------------------------

/**
 * Walk up the Commander parent chain to find the root program's options.
 */
function resolveGlobalOpts(cmd: Command): GlobalOpts {
  let current: Command | null = cmd;
  while (current?.parent) {
    current = current.parent;
  }
  return (current?.opts() ?? {}) as GlobalOpts;
}

// ---------------------------------------------------------------------------
// pacifica agent status
// ---------------------------------------------------------------------------

async function showStatus(globalOpts: GlobalOpts): Promise<void> {
  try {
    const config = await loadConfig();
    const agentCfg = config.agent;

    // Load spending data for today.
    const tracker = new SpendingTracker();
    await tracker.load();
    const spentToday = tracker.getDailySpend();
    const remaining = Math.max(0, agentCfg.daily_spending_limit - spentToday);
    const spentPercent =
      agentCfg.daily_spending_limit > 0
        ? (spentToday / agentCfg.daily_spending_limit) * 100
        : 0;

    // Load recent actions (last 5).
    const logger = new AgentActionLogger();
    const recentActions = await logger.getEntries({ limit: 5 });

    // --json: structured output
    if (globalOpts.json) {
      console.log(
        JSON.stringify(
          {
            enabled: agentCfg.enabled,
            daily_spending_limit: agentCfg.daily_spending_limit,
            spent_today: spentToday,
            spent_percent: Math.round(spentPercent * 10) / 10,
            remaining,
            max_order_size: agentCfg.max_order_size,
            max_leverage: agentCfg.max_leverage,
            require_confirmation_above: agentCfg.require_confirmation_above,
            allowed_actions: agentCfg.allowed_actions,
            blocked_actions: agentCfg.blocked_actions,
            recent_actions: recentActions,
          },
          null,
          2,
        ),
      );
      return;
    }

    // -- Dashboard display ---------------------------------------------------
    console.log();
    console.log(theme.header("Agent Status"));
    console.log(theme.header("\u2550".repeat(12)));

    const statusLabel = agentCfg.enabled
      ? theme.success("\u2713 Enabled")
      : theme.error("\u2717 Disabled");

    console.log(`  Status:         ${statusLabel}`);
    console.log(`  Daily Limit:    ${formatDollar(agentCfg.daily_spending_limit)}`);
    console.log(
      `  Spent Today:    ${formatDollar(spentToday)} (${spentPercent.toFixed(1)}%)`,
    );
    console.log(`  Remaining:      ${formatDollar(remaining)}`);
    console.log(`  Max Order:      ${formatDollar(agentCfg.max_order_size)}`);
    console.log(`  Max Leverage:   ${agentCfg.max_leverage}x`);
    console.log(
      `  Confirm Above:  ${formatDollar(agentCfg.require_confirmation_above)}`,
    );
    console.log();

    // Allowed / blocked actions
    console.log(
      `  Allowed:  ${agentCfg.allowed_actions.join(", ") || theme.muted("none")}`,
    );
    console.log(
      `  Blocked:  ${agentCfg.blocked_actions.join(", ") || theme.muted("none")}`,
    );

    // -- Recent actions ------------------------------------------------------
    if (recentActions.length > 0) {
      console.log();
      console.log(theme.label("Recent Actions (last 5)"));
      console.log(theme.muted("\u2500".repeat(23)));

      for (const entry of recentActions) {
        console.log(formatLogRow(entry, { compact: true }));
      }
    }

    console.log();
  } catch (err) {
    printError(err);
  }
}

// ---------------------------------------------------------------------------
// pacifica agent stop
// ---------------------------------------------------------------------------

async function stopAgent(): Promise<void> {
  try {
    const config = await loadConfig();

    if (!config.agent.enabled) {
      console.log(theme.muted("Agent trading is already disabled."));
      return;
    }

    config.agent.enabled = false;
    await saveConfig(config);

    console.log(theme.success("\u2713 Agent trading disabled"));
  } catch (err) {
    printError(err);
  }
}

// ---------------------------------------------------------------------------
// pacifica agent start
// ---------------------------------------------------------------------------

async function startAgent(): Promise<void> {
  try {
    const config = await loadConfig();

    if (config.agent.enabled) {
      console.log(theme.muted("Agent trading is already enabled."));
      return;
    }

    const ok = await confirm({
      message: "Are you sure you want to re-enable agent trading?",
      default: false,
    });

    if (!ok) {
      console.log(theme.muted("Cancelled."));
      return;
    }

    config.agent.enabled = true;
    await saveConfig(config);

    console.log(theme.success("\u2713 Agent trading enabled"));
  } catch (err) {
    if (isUserCancellation(err)) {
      console.log(theme.muted("\nCancelled."));
      return;
    }
    printError(err);
  }
}

// ---------------------------------------------------------------------------
// pacifica agent config
// ---------------------------------------------------------------------------

async function editConfig(): Promise<void> {
  try {
    const config = await loadConfig();
    const agentCfg = config.agent;

    console.log();
    console.log(theme.header("Edit Agent Guardrails"));
    console.log(theme.muted("Press Enter to keep the current value."));
    console.log();

    const dailyLimit =
      (await number({
        message: "Daily spending limit ($):",
        default: agentCfg.daily_spending_limit,
        validate: (value) => {
          if (value === undefined) return "Daily limit is required";
          if (value <= 0) return "Daily limit must be greater than $0";
          return true;
        },
      })) ?? agentCfg.daily_spending_limit;

    const maxOrder =
      (await number({
        message: "Max single order size ($):",
        default: agentCfg.max_order_size,
        validate: (value) => {
          if (value === undefined) return "Max order size is required";
          if (value <= 0) return "Max order size must be greater than $0";
          return true;
        },
      })) ?? agentCfg.max_order_size;

    const maxLeverage =
      (await number({
        message: "Max leverage:",
        default: agentCfg.max_leverage,
        validate: (value) => {
          if (value === undefined) return "Max leverage is required";
          if (!Number.isInteger(value)) return "Leverage must be a whole number";
          if (value < 1 || value > 100)
            return "Leverage must be between 1 and 100";
          return true;
        },
      })) ?? agentCfg.max_leverage;

    const confirmAbove =
      (await number({
        message: "Require confirmation above ($):",
        default: agentCfg.require_confirmation_above,
        validate: (value) => {
          if (value === undefined) return "Confirmation threshold is required";
          if (value < 0) return "Confirmation threshold must be $0 or greater";
          return true;
        },
      })) ?? agentCfg.require_confirmation_above;

    // Apply changes and persist.
    config.agent.daily_spending_limit = dailyLimit;
    config.agent.max_order_size = maxOrder;
    config.agent.max_leverage = maxLeverage;
    config.agent.require_confirmation_above = confirmAbove;

    await saveConfig(config);

    console.log();
    console.log(theme.success("\u2713 Agent guardrails updated"));
    console.log(`  Daily Limit:    ${formatDollar(dailyLimit)}`);
    console.log(`  Max Order:      ${formatDollar(maxOrder)}`);
    console.log(`  Max Leverage:   ${maxLeverage}x`);
    console.log(`  Confirm Above:  ${formatDollar(confirmAbove)}`);
    console.log();
  } catch (err) {
    if (isUserCancellation(err)) {
      console.log(theme.muted("\nCancelled."));
      return;
    }
    printError(err);
  }
}

// ---------------------------------------------------------------------------
// pacifica agent log
// ---------------------------------------------------------------------------

interface LogOpts {
  today?: boolean;
  action?: string;
  symbol?: string;
  limit?: string;
}

async function showLog(opts: LogOpts, globalOpts: GlobalOpts): Promise<void> {
  try {
    const logger = new AgentActionLogger();

    const limit = opts.limit !== undefined ? parseInt(opts.limit, 10) : 20;
    const validLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;

    const entries = await logger.getEntries({
      today: opts.today,
      action: opts.action,
      symbol: opts.symbol?.toUpperCase(),
      limit: validLimit,
    });

    // --json: structured output
    if (globalOpts.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    if (entries.length === 0) {
      console.log(theme.muted("No log entries found."));
      return;
    }

    console.log();
    console.log(theme.header("Agent Action Log"));
    console.log(theme.muted("\u2500".repeat(16)));

    for (const entry of entries) {
      console.log(formatLogRow(entry, { compact: false }));
    }

    console.log();
    console.log(theme.muted(`${entries.length} entr${entries.length === 1 ? "y" : "ies"}`));
    console.log();
  } catch (err) {
    printError(err);
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a dollar amount with commas and $ prefix.
 */
function formatDollar(n: number): string {
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a log entry as a single line.
 *
 * `compact: true`  uses time-only (HH:MM) for the status dashboard.
 * `compact: false` uses full date-time (YYYY-MM-DD HH:MM:SS) for the log view.
 */
function formatLogRow(
  entry: AgentLogEntry,
  opts: { compact: boolean },
): string {
  const ts = new Date(entry.timestamp);

  let timeStr: string;
  if (opts.compact) {
    // HH:MM
    const h = String(ts.getHours()).padStart(2, "0");
    const m = String(ts.getMinutes()).padStart(2, "0");
    timeStr = `${h}:${m}`;
  } else {
    // YYYY-MM-DD HH:MM:SS
    const y = ts.getFullYear();
    const mo = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");
    const h = String(ts.getHours()).padStart(2, "0");
    const mi = String(ts.getMinutes()).padStart(2, "0");
    const s = String(ts.getSeconds()).padStart(2, "0");
    timeStr = `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  const action = (entry.action ?? "").padEnd(14);
  const symbol = (entry.symbol ?? "").padEnd(5);
  const side = (entry.side ?? "").toUpperCase().padEnd(6);
  const amount =
    entry.amountUsd !== undefined ? formatPrice(entry.amountUsd).padEnd(10) : "".padEnd(10);

  let resultStr: string;
  if (entry.result === "success") {
    resultStr = theme.profit("\u2713 success");
  } else if (entry.result === "rejected") {
    const reason = entry.rejectionReason
      ? `\u2717 rejected: ${entry.rejectionReason}`
      : "\u2717 rejected";
    resultStr = theme.loss(reason);
  } else {
    // "error"
    const errMsg =
      entry.response && typeof entry.response.error === "string"
        ? `\u2717 error: ${entry.response.error}`
        : "\u2717 error";
    resultStr = theme.loss(errMsg);
  }

  return `  ${timeStr}  ${action}${symbol}${side}${amount}${resultStr}`;
}

// ---------------------------------------------------------------------------
// Error / cancellation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the error represents a user-initiated cancellation
 * (e.g., Ctrl+C during an Inquirer prompt).
 */
function isUserCancellation(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed"))
    return true;
  return false;
}

/**
 * Print a user-friendly error message and set the exit code.
 */
function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
