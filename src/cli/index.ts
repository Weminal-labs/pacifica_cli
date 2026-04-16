#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Entry Point
// ---------------------------------------------------------------------------
// Registers all subcommands, parses global options, and handles uncaught
// errors with user-friendly messages (no raw stack traces).
//
// --mcp flag: start the MCP server over stdio (for Claude Desktop / Cursor).
//   npx -y pacifica-cli --mcp
// ---------------------------------------------------------------------------

import { Command } from "commander";

const VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// --mcp: delegate to the MCP server and stop here
// ---------------------------------------------------------------------------

if (process.argv.includes("--mcp")) {
  import("../mcp/server.js").catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to start Pacifica MCP server: ${msg}`);
    process.exit(1);
  });
} else {

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("pacifica")
  .description(
    "Agent-native trading terminal for Pacifica DEX\n\n" +
    "JSON mode: pass -j / --json to any command for machine-readable output.\n" +
    "In JSON mode stdout is always the envelope; stderr carries human messages.",
  )
  .version(VERSION, "-v, --version")
  .option("--testnet", "Override network to testnet")
  .option("-j, --json", "Machine-readable JSON output (for AI agents)");

// ---------------------------------------------------------------------------
// Subcommands – lean v1 surface (thesis: CLI + MCP + pattern primitive)
// ---------------------------------------------------------------------------

async function registerCommands(): Promise<void> {
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

  const { createTradeCommand } = await import("./commands/trade.js");
  const tradeCmd = createTradeCommand();

  const { createOrdersCommand } = await import("./commands/orders.js");
  const ordersCmd = createOrdersCommand();

  const { createPositionsCommand } = await import("./commands/positions.js");
  const positionsCmd = createPositionsCommand();

  const { createAgentCommand } = await import("./commands/agent.js");
  const agentCmd = createAgentCommand();

  const { createJournalCommand } = await import("./commands/journal.js");
  const journalCmd = createJournalCommand();

  const { createFundingCommand } = await import("./commands/funding.js");
  const fundingCmd = createFundingCommand();

  const { createSimulateCommand } = await import("./commands/simulate.js");
  const simulateCmd = createSimulateCommand();

  const { createPatternsCommand } = await import("./commands/patterns.js");
  const patternsCmd = createPatternsCommand();

  const { createBacktestCommand } = await import("./commands/backtest.js");
  const backtestCmd = createBacktestCommand();

  program.addCommand(initCmd);
  program.addCommand(scanCmd);
  program.addCommand(tradeCmd);
  program.addCommand(ordersCmd);
  program.addCommand(positionsCmd);
  program.addCommand(agentCmd);
  program.addCommand(journalCmd);
  program.addCommand(fundingCmd);
  program.addCommand(simulateCmd);
  program.addCommand(patternsCmd);
  program.addCommand(backtestCmd);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await registerCommands();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const message =
    err instanceof Error ? err.message : String(err);
  console.error(`\nError: ${message}\n`);
  process.exitCode = 1;
});

} // end else (CLI path)
