// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Init Wizard Command
// ---------------------------------------------------------------------------
// Interactive 5-step onboarding wizard that walks the user through network
// selection, wallet configuration, connection testing, trading defaults,
// and agent guardrails.  Produces a ~/.pacifica.yaml config file.
// ---------------------------------------------------------------------------

import { input, select, confirm, number } from "@inquirer/prompts";
import { saveConfig, configExists, getConfigPath } from "../../core/config/loader.js";
import { DEFAULT_CONFIG } from "../../core/config/types.js";
import type { PacificaConfig, ArbConfig } from "../../core/config/types.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSigner } from "../../core/sdk/signer.js";
import { PacificaWebSocket } from "../../core/sdk/websocket.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_KEY_ATTEMPTS = 3;
const WS_PROBE_TIMEOUT_MS = 2_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Abbreviate a public key for display: first 8 chars + "..." + last 4 chars.
 */
function abbreviateKey(publicKey: string): string {
  if (publicKey.length <= 12) return publicKey;
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-4)}`;
}

/**
 * Format a dollar amount with commas for the summary display.
 */
function formatDollar(n: number): string {
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

export async function initCommand(options: { testnet?: boolean }): Promise<void> {
  try {
    await runWizard(options);
  } catch (err: unknown) {
    // Inquirer throws ExitPromptError when the user presses Ctrl+C.
    if (isUserCancellation(err)) {
      console.log(theme.muted("\nSetup cancelled."));
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Wizard implementation
// ---------------------------------------------------------------------------

async function runWizard(options: { testnet?: boolean }): Promise<void> {
  // -- Welcome banner ------------------------------------------------------
  console.log();
  console.log(theme.header("Pacifica CLI Setup"));
  console.log(theme.header("=================="));
  console.log("Let's get you trading in 60 seconds.");
  console.log();

  // -- Step 1/5: Network ---------------------------------------------------
  console.log(theme.label("[1/5] Network"));

  let network: "testnet" | "mainnet";

  if (options.testnet) {
    network = "testnet";
    console.log(`  Network: ${theme.emphasis("Testnet")}`);
  } else {
    network = await select<"testnet" | "mainnet">({
      message: "Which network?",
      choices: [
        { name: "Testnet (recommended)", value: "testnet" },
        { name: "Mainnet", value: "mainnet" },
      ],
      default: "testnet",
    });
    console.log(`  Network: ${theme.emphasis(network === "testnet" ? "Testnet" : "Mainnet")}`);
  }
  console.log();

  // -- Step 2/5: Wallet Private Key ----------------------------------------
  console.log(theme.label("[2/5] Wallet Private Key"));

  // Check for existing config and ask to overwrite.
  if (configExists()) {
    const overwrite = await confirm({
      message: "Config already exists. Overwrite?",
      default: false,
    });
    if (!overwrite) {
      console.log(theme.muted("  Keeping existing config. Setup cancelled."));
      return;
    }
  }

  let privateKey = "";
  let publicKey = "";

  for (let attempt = 1; attempt <= MAX_KEY_ATTEMPTS; attempt++) {
    const keyInput = await input({
      message: "Enter your wallet private key (Base58):",
    });

    try {
      // Strip any non-Base58 characters that terminal/prompt might inject
      const cleanKey = keyInput.replace(/[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/g, "");
      const signer = createSigner(cleanKey);
      privateKey = cleanKey;
      publicKey = signer.publicKey;
      break;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_KEY_ATTEMPTS) {
        console.log(theme.warning(`  Invalid key: ${message}. Please try again. (${attempt}/${MAX_KEY_ATTEMPTS})`));
      } else {
        console.log(theme.error(`  Failed after ${MAX_KEY_ATTEMPTS} attempts: ${message}`));
        console.log(theme.muted("  Get your private key from your Solana wallet."));
        console.log(theme.muted("  For testnet, generate a new keypair at test.pacifica.fi"));
        return;
      }
    }
  }

  console.log(`  Wallet: ${theme.emphasis(abbreviateKey(publicKey))}`);
  console.log(theme.muted("  Get your private key from your Solana wallet. For testnet, generate a new keypair at test.pacifica.fi"));
  console.log();

  // -- Step 3/5: Test Connection -------------------------------------------
  console.log(theme.label("[3/5] Test Connection"));
  console.log("  Testing connection...");

  const signer = createSigner(privateKey);
  const client = new PacificaClient({ network, signer });

  try {
    const result = await client.testConnection();
    if (result.connected) {
      console.log(theme.success("  Connected") + ` to Pacifica ${network === "testnet" ? "Testnet" : "Mainnet"}`);
      if (result.balance !== undefined && result.balance > 0) {
        console.log(`  Balance: ${formatPrice(result.balance)}`);
      }
    } else {
      console.log(theme.warning("  Could not connect (might be a network issue, continuing...)"));
    }
  } catch {
    console.log(theme.warning("  Could not connect (might be a network issue, continuing...)"));
  }

  // WebSocket probe.
  try {
    const wsConnected = await probeWebSocket(network, publicKey);
    if (wsConnected) {
      console.log(`  WebSocket: ${theme.success("Live data confirmed")}`);
    } else {
      console.log(`  WebSocket: ${theme.warning("Could not connect (live data may not work)")}`);
    }
  } catch {
    console.log(`  WebSocket: ${theme.warning("Could not connect (live data may not work)")}`);
  }

  client.destroy();
  console.log();

  // -- Builder Code (optional) --------------------------------------------
  const hasBuilderCode = await confirm({
    message: "Do you have a Pacifica builder code? (earns fees on your orders)",
    default: false,
  });

  let builderCode: string | undefined;
  if (hasBuilderCode) {
    const rawCode = await input({
      message: "Builder code (alphanumeric, max 16 chars):",
      validate: (value) => {
        if (!value) return "Builder code cannot be empty";
        if (!/^[a-zA-Z0-9]{1,16}$/.test(value)) return "Must be alphanumeric, max 16 chars";
        return true;
      },
    });
    builderCode = rawCode;
    console.log(`  Builder code: ${theme.emphasis(builderCode)}`);
  }
  console.log();

  // -- Step 4/5: Trading Defaults ------------------------------------------
  console.log(theme.label("[4/5] Trading Defaults"));

  const leverage = await number({
    message: "Default leverage:",
    default: DEFAULT_CONFIG.defaults.leverage,
    min: 1,
    max: 100,
    validate: (value) => {
      if (value === undefined) return "Leverage is required";
      if (!Number.isInteger(value)) return "Leverage must be a whole number";
      if (value < 1 || value > 100) return "Leverage must be between 1 and 100";
      return true;
    },
  }) ?? DEFAULT_CONFIG.defaults.leverage;

  const slippage = await number({
    message: "Default slippage (%):",
    default: DEFAULT_CONFIG.defaults.slippage,
    validate: (value) => {
      if (value === undefined) return "Slippage is required";
      if (value < 0.1 || value > 10) return "Slippage must be between 0.1% and 10%";
      return true;
    },
  }) ?? DEFAULT_CONFIG.defaults.slippage;

  const tpDistance = await number({
    message: "Default take-profit distance (%):",
    default: DEFAULT_CONFIG.defaults.tp_distance,
    validate: (value) => {
      if (value === undefined) return "TP distance is required";
      if (value < 0.1 || value > 50) return "TP distance must be between 0.1% and 50%";
      return true;
    },
  }) ?? DEFAULT_CONFIG.defaults.tp_distance;

  const slDistance = await number({
    message: "Default stop-loss distance (%):",
    default: DEFAULT_CONFIG.defaults.sl_distance,
    validate: (value) => {
      if (value === undefined) return "SL distance is required";
      if (value < 0.1 || value > 50) return "SL distance must be between 0.1% and 50%";
      return true;
    },
  }) ?? DEFAULT_CONFIG.defaults.sl_distance;

  console.log();

  // -- Step 5/5: Agent Guardrails ------------------------------------------
  console.log(theme.label("[5/5] Agent Guardrails"));

  const agentEnabled = await confirm({
    message: "Enable AI agent trading?",
    default: true,
  });

  let dailySpendingLimit = DEFAULT_CONFIG.agent.daily_spending_limit;
  let maxOrderSize = DEFAULT_CONFIG.agent.max_order_size;
  let requireConfirmationAbove = DEFAULT_CONFIG.agent.require_confirmation_above;

  if (agentEnabled) {
    dailySpendingLimit = await number({
      message: "Daily spending limit ($):",
      default: DEFAULT_CONFIG.agent.daily_spending_limit,
      validate: (value) => {
        if (value === undefined) return "Daily limit is required";
        if (value <= 0) return "Daily limit must be greater than $0";
        return true;
      },
    }) ?? DEFAULT_CONFIG.agent.daily_spending_limit;

    maxOrderSize = await number({
      message: "Max single order size ($):",
      default: DEFAULT_CONFIG.agent.max_order_size,
      validate: (value) => {
        if (value === undefined) return "Max order size is required";
        if (value <= 0) return "Max order size must be greater than $0";
        return true;
      },
    }) ?? DEFAULT_CONFIG.agent.max_order_size;

    requireConfirmationAbove = await number({
      message: "Require confirmation above ($):",
      default: DEFAULT_CONFIG.agent.require_confirmation_above,
      validate: (value) => {
        if (value === undefined) return "Confirmation threshold is required";
        if (value < 0) return "Confirmation threshold must be $0 or greater";
        return true;
      },
    }) ?? DEFAULT_CONFIG.agent.require_confirmation_above;
  }

  console.log();

  // -- Save config ---------------------------------------------------------
  const config: PacificaConfig = {
    network,
    private_key: privateKey,
    ...(builderCode ? { builder_code: builderCode } : {}),
    defaults: {
      leverage,
      slippage,
      tp_distance: tpDistance,
      sl_distance: slDistance,
    },
    agent: {
      enabled: agentEnabled,
      autonomy_level: DEFAULT_CONFIG.agent.autonomy_level,
      daily_spending_limit: dailySpendingLimit,
      max_order_size: maxOrderSize,
      max_leverage: leverage,
      allowed_actions: DEFAULT_CONFIG.agent.allowed_actions,
      blocked_actions: DEFAULT_CONFIG.agent.blocked_actions,
      require_confirmation_above: requireConfirmationAbove,
    },
    arb: DEFAULT_CONFIG.arb,
  };

  await saveConfig(config);

  // -- Summary -------------------------------------------------------------
  const configPath = getConfigPath();
  const agentSummary = agentEnabled
    ? `Enabled (limit: ${formatDollar(dailySpendingLimit)}/day)`
    : "Disabled";

  // Seed example patterns into ~/.pacifica/patterns/ (idempotent, only writes
  // files that don't already exist). Gives every new trader a working starter
  // library to backtest and modify.
  const { seedExamplePatterns } = await import("../../core/patterns/seed.js");
  const seeded = await seedExamplePatterns().catch(() => ({ copied: [], skipped: [], examplesDir: null }));

  console.log(theme.success("Setup Complete!"));
  console.log(theme.success("==============="));
  console.log(`  Network:    ${network === "testnet" ? "Testnet" : "Mainnet"}`);
  console.log(`  Wallet:     ${abbreviateKey(publicKey)}`);
  console.log(`  Leverage:   ${leverage}x`);
  console.log(`  Agent:      ${agentSummary}`);
  if (builderCode) {
    console.log(`  Builder:    ${builderCode}`);
  }
  if (seeded.copied.length > 0) {
    console.log(`  Patterns:   ${seeded.copied.length} starter pattern(s) installed`);
  } else if (seeded.skipped.length > 0) {
    console.log(`  Patterns:   ${seeded.skipped.length} existing (kept your edits)`);
  }
  console.log();
  console.log(theme.muted(`  Config saved to: ${configPath}`));
  console.log();
  // -- Optional: create first pattern now -----------------------------------
  const createNow = await confirm({
    message: "Would you like to create your first pattern now?",
    default: true,
  });

  if (createNow) {
    const { runNewPatternWizard } = await import("./patterns.js");
    await runNewPatternWizard();
  } else {
    console.log(theme.muted("You can create patterns anytime with `pacifica patterns new`"));
    console.log();
  }

  console.log("Next steps:");
  console.log(`  ${theme.label("pacifica patterns list")}          See your starter patterns`);
  console.log(`  ${theme.label("pacifica backtest price-breakout-btc")}  Run a 30-day replay`);
  console.log(`  ${theme.label("pacifica --mcp")}                   Start MCP server for Claude`);
  console.log();
}

// ---------------------------------------------------------------------------
// WebSocket probe
// ---------------------------------------------------------------------------

/**
 * Briefly connect to the WebSocket, subscribe to prices, and wait for the
 * first update.  Returns true if live data was received within the timeout.
 */
async function probeWebSocket(
  network: "testnet" | "mainnet",
  account?: string,
): Promise<boolean> {
  const ws = new PacificaWebSocket({ network, account });

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const cleanup = (): void => {
      if (!settled) {
        settled = true;
        ws.disconnect();
      }
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, WS_PROBE_TIMEOUT_MS);

    // Allow the Node process to exit despite the timer.
    if (timer && typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }

    ws.on("prices", () => {
      if (!settled) {
        clearTimeout(timer);
        cleanup();
        resolve(true);
      }
    });

    ws.on("error", () => {
      if (!settled) {
        clearTimeout(timer);
        cleanup();
        resolve(false);
      }
    });

    ws.connect()
      .then(() => {
        ws.subscribePrices();
      })
      .catch(() => {
        if (!settled) {
          clearTimeout(timer);
          cleanup();
          resolve(false);
        }
      });
  });
}

// ---------------------------------------------------------------------------
// Cancellation detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the error represents a user-initiated cancellation
 * (e.g., Ctrl+C during an Inquirer prompt).
 */
function isUserCancellation(err: unknown): boolean {
  if (err === null || err === undefined) return false;

  // @inquirer/prompts throws an ExitPromptError on Ctrl+C.
  if (err instanceof Error && err.name === "ExitPromptError") return true;

  // Fallback: some versions use a different class name or message.
  if (err instanceof Error && err.message.includes("User force closed")) return true;

  return false;
}
