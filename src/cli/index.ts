#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Entry Point
// ---------------------------------------------------------------------------
// Registers all subcommands, parses global options, and handles uncaught
// errors with user-friendly messages (no raw stack traces).
// ---------------------------------------------------------------------------

import { Command } from "commander";

const VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("pacifica")
  .description("Agent-native trading terminal for Pacifica DEX")
  .version(VERSION, "-v, --version")
  .option("--testnet", "Override network to testnet")
  .option("--json", "Output JSON instead of formatted text");

// ---------------------------------------------------------------------------
// Subcommands – real implementations
// ---------------------------------------------------------------------------

async function registerCommands(): Promise<void> {
  // Lazy-import so the CLI boots fast; command modules are only loaded when
  // the user actually invokes them.

  const initCmd = new Command("init")
    .description("Initialize Pacifica CLI configuration")
    .action(async () => {
      const { initCommand } = await import("./commands/init.js");
      await initCommand(program.opts());
    });

  const scanCmd = new Command("scan")
    .description("Scan markets for trading opportunities")
    .option("--gainers", "Sort by 24h gain (descending)")
    .option("--losers", "Sort by 24h loss (descending)")
    .option("--min-volume <usd>", "Filter markets below this 24h volume in USD", parseFloat)
    .action(async () => {
      const { scanCommand } = await import("./commands/scan.js");
      await scanCommand({ ...program.opts(), ...scanCmd.opts() });
    });

  // ---------------------------------------------------------------------------
  // Subcommands – lazy-loaded implementations
  // ---------------------------------------------------------------------------

  const { createTradeCommand } = await import("./commands/trade.js");
  const tradeCmd = createTradeCommand();

  const { createOrdersCommand } = await import("./commands/orders.js");
  const ordersCmd = createOrdersCommand();

  const { createPositionsCommand } = await import("./commands/positions.js");
  const positionsCmd = createPositionsCommand();

  const { createHeatmapCommand } = await import("./commands/heatmap.js");
  const heatmapCmd = createHeatmapCommand();

  const { createAgentCommand } = await import("./commands/agent.js");
  const agentCmd = createAgentCommand();

  const { createJournalCommand } = await import("./commands/journal.js");
  const journalCmd = createJournalCommand();

  const { createFundingCommand } = await import("./commands/funding.js");
  const fundingCmd = createFundingCommand();

  const { createSmartCommand } = await import("./commands/smart.js");
  const smartCmd = createSmartCommand();

  const { createAlertsCommand } = await import("./commands/alerts.js");
  const alertsCmd = createAlertsCommand();

  program.addCommand(initCmd);
  program.addCommand(scanCmd);
  program.addCommand(tradeCmd);
  program.addCommand(ordersCmd);
  program.addCommand(positionsCmd);
  program.addCommand(heatmapCmd);
  program.addCommand(agentCmd);
  program.addCommand(journalCmd);
  program.addCommand(fundingCmd);
  program.addCommand(smartCmd);
  program.addCommand(alertsCmd);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await registerCommands();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  // Print a clean, user-friendly error — never a raw stack trace.
  const message =
    err instanceof Error ? err.message : String(err);
  console.error(`\nError: ${message}\n`);
  process.exitCode = 1;
});
