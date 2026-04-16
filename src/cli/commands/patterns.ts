// ---------------------------------------------------------------------------
// `pacifica patterns` — manage user-authored patterns in ~/.pacifica/patterns/
// ---------------------------------------------------------------------------
//   pacifica patterns list              list every pattern
//   pacifica patterns show <name>       print one pattern
//   pacifica patterns validate <file>   parse a file and report errors
//   pacifica patterns new               interactive wizard to create a pattern
//   pacifica patterns copy <example>    copy an example pattern to user dir
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { readFile, readdir, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { input, select, number as numberPrompt, confirm } from "@inquirer/prompts";
import {
  loadPatterns,
  loadPattern,
  getPatternsDir,
  parsePattern,
  savePattern,
  PatternParseError,
} from "../../core/patterns/loader.js";
import type { Pattern, ConditionAxis, ConditionOp, PatternCondition } from "../../core/patterns/types.js";
import { theme } from "../theme.js";

export function createPatternsCommand(): Command {
  const cmd = new Command("patterns")
    .description("Manage user-authored trading patterns");

  cmd
    .command("list")
    .description("List every pattern in ~/.pacifica/patterns/")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const patterns = await loadPatterns();
      if (opts.json) {
        console.log(JSON.stringify(patterns, null, 2));
        return;
      }
      const dir = await getPatternsDir();
      if (patterns.length === 0) {
        console.log(theme.muted(`No patterns found in ${dir}`));
        console.log(theme.muted("Copy one from examples/patterns/ to get started."));
        return;
      }
      console.log(theme.emphasis(`Patterns (${patterns.length}) in ${dir}`));
      console.log();
      for (const p of patterns) {
        console.log(`  ${theme.success(p.name)}${theme.muted(` — ${p.market}`)}`);
        if (p.description) console.log(`    ${theme.muted(p.description)}`);
        console.log(
          `    ${theme.muted(`when: ${p.when.length} condition(s)  entry: ${p.entry.side} $${p.entry.size_usd}  exit: ${p.exit.length} rule(s)`)}`,
        );
        console.log();
      }
    });

  cmd
    .command("show <name>")
    .description("Show one pattern by name")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      const p = await loadPattern(name);
      if (!p) {
        console.error(theme.error(`No pattern named '${name}' in ${await getPatternsDir()}`));
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(p, null, 2));
        return;
      }
      console.log(theme.emphasis(p.name));
      if (p.description) console.log(theme.muted(p.description));
      console.log();
      console.log(`  Market: ${p.market}`);
      console.log(`  Tags:   ${p.tags.join(", ") || "—"}`);
      console.log();
      console.log(`  when (all must be true):`);
      for (const c of p.when) {
        console.log(`    - ${c.axis} ${c.op} ${c.value}${c.label ? theme.muted(`  — ${c.label}`) : ""}`);
      }
      console.log();
      console.log(`  entry:`);
      console.log(`    side: ${p.entry.side}   size: $${p.entry.size_usd}   lev: ${p.entry.leverage}x`);
      if (p.entry.stop_loss_pct !== undefined) console.log(`    stop: ${p.entry.stop_loss_pct}%`);
      if (p.entry.take_profit_pct !== undefined) console.log(`    take: ${p.entry.take_profit_pct}%`);
      if (p.exit.length > 0) {
        console.log();
        console.log(`  exit (any true):`);
        for (const c of p.exit) {
          console.log(`    - ${c.axis} ${c.op} ${c.value}${c.label ? theme.muted(`  — ${c.label}`) : ""}`);
        }
      }
    });

  cmd
    .command("validate <file>")
    .description("Parse a pattern YAML file and report any errors")
    .action(async (file: string) => {
      try {
        const src = await readFile(file, "utf-8");
        const p = parsePattern(src, file);
        console.log(theme.success(`OK  ${p.name} — ${p.when.length} when / ${p.exit.length} exit`));
      } catch (err) {
        if (err instanceof PatternParseError) {
          console.error(theme.error(`Invalid: ${err.detail}`));
        } else {
          console.error(theme.error(`Error: ${(err as Error).message}`));
        }
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // `pacifica patterns new` — interactive wizard for creating a pattern
  // -------------------------------------------------------------------------

  cmd
    .command("new")
    .description("Create a new pattern with an interactive wizard")
    .action(async () => {
      try {
        await runNewPatternWizard();
      } catch (err: unknown) {
        if (isUserCancellation(err)) {
          console.log(theme.muted("\nPattern creation cancelled."));
          return;
        }
        throw err;
      }
    });

  // -------------------------------------------------------------------------
  // `pacifica patterns copy <example>` — copy an example pattern to user dir
  // -------------------------------------------------------------------------

  cmd
    .command("copy <example>")
    .description("Copy an example pattern to ~/.pacifica/patterns/")
    .action(async (example: string) => {
      const examplesDir = findExamplesDir();
      if (!examplesDir) {
        console.error(theme.error("Could not locate the examples/patterns/ directory."));
        process.exitCode = 1;
        return;
      }

      // Try both .yaml and .yml extensions
      let sourceFile: string | null = null;
      for (const ext of [".yaml", ".yml"]) {
        const candidate = join(examplesDir, `${example}${ext}`);
        try {
          await readFile(candidate);
          sourceFile = candidate;
          break;
        } catch {
          // not found, try next
        }
      }

      if (!sourceFile) {
        // List available examples
        console.error(theme.error(`No example pattern named '${example}' found.`));
        console.log();
        try {
          const entries = await readdir(examplesDir);
          const yamls = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
          if (yamls.length > 0) {
            console.log("Available examples:");
            for (const f of yamls) {
              console.log(`  ${theme.label(f.replace(/\.ya?ml$/, ""))}`);
            }
          }
        } catch { /* ignore */ }
        process.exitCode = 1;
        return;
      }

      const targetDir = await getPatternsDir();
      const fileName = sourceFile.split("/").pop()!;
      const targetPath = join(targetDir, fileName);

      await copyFile(sourceFile, targetPath);
      console.log(theme.success(`Copied to ${targetPath}`));
      console.log(theme.muted("Edit it to make it yours."));
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// Pattern-creation wizard
// ---------------------------------------------------------------------------

const KNOWN_MARKETS = [
  "BTC-USDC-PERP",
  "ETH-USDC-PERP",
  "SOL-USDC-PERP",
  "ARB-USDC-PERP",
  "DOGE-USDC-PERP",
  "WIF-USDC-PERP",
];

const LEVERAGE_PRESETS = [
  { name: "2x (conservative)", value: 2 },
  { name: "3x (moderate)", value: 3 },
  { name: "5x (standard)", value: 5 },
  { name: "10x (aggressive)", value: 10 },
  { name: "Custom", value: 0 },
];

interface ConditionTemplate {
  name: string;
  axis: ConditionAxis;
  op: ConditionOp;
  value: number;
  label: string;
}

const CONDITION_TEMPLATES: ConditionTemplate[] = [
  { name: "Funding rate is low (negative)", axis: "funding_rate", op: "lt", value: -0.0003, label: "negative funding — shorts are paying longs" },
  { name: "Funding rate is high (positive)", axis: "funding_rate", op: "gt", value: 0.0003, label: "high funding — longs are paying shorts" },
  { name: "Strong bullish momentum", axis: "momentum_value", op: "gt", value: 0.5, label: "strong bullish momentum" },
  { name: "Strong bearish momentum", axis: "momentum_value", op: "lt", value: -0.5, label: "strong bearish momentum" },
  { name: "High 24h volume", axis: "volume_24h_usd", op: "gt", value: 50_000_000, label: "high volume environment" },
  { name: "Whale activity (large orders)", axis: "large_orders_count", op: "gt", value: 5, label: "whales are active" },
  { name: "Price above a level", axis: "mark_price", op: "gt", value: 0, label: "price above level" },
  { name: "Price below a level", axis: "mark_price", op: "lt", value: 0, label: "price below level" },
];

/**
 * Convert a human-readable string to kebab-case.
 * "My Cool Pattern" → "my-cool-pattern"
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function runNewPatternWizard(): Promise<string | null> {
  console.log();
  console.log(theme.header("Create a New Pattern"));
  console.log(theme.header("===================="));
  console.log(theme.muted("Answer a few questions and we'll generate the YAML for you."));
  console.log();

  // -- Pattern name ---------------------------------------------------------
  const rawName = await input({
    message: "Pattern name:",
    validate: (v) => v.trim().length > 0 || "Name cannot be empty",
  });
  const name = toKebabCase(rawName);
  console.log(theme.muted(`  → ${name}`));

  // -- Description ----------------------------------------------------------
  const description = await input({
    message: "Description (one line):",
    default: "",
  });

  // -- Market ---------------------------------------------------------------
  const marketChoice = await select<string>({
    message: "Market:",
    choices: [
      ...KNOWN_MARKETS.map((m) => ({ name: m, value: m })),
      { name: "ANY (scan all markets)", value: "ANY" },
      { name: "Custom...", value: "__custom__" },
    ],
  });

  let market = marketChoice;
  if (marketChoice === "__custom__") {
    market = await input({
      message: "Custom market symbol (e.g. MATIC-USDC-PERP):",
      validate: (v) => v.trim().length > 0 || "Market symbol cannot be empty",
    });
  }

  // -- Direction ------------------------------------------------------------
  const side = await select<"long" | "short">({
    message: "Direction:",
    choices: [
      { name: "Long (buy)", value: "long" },
      { name: "Short (sell)", value: "short" },
    ],
  });

  // -- Size -----------------------------------------------------------------
  const sizeUsd = await numberPrompt({
    message: "Position size in USD:",
    default: 500,
    min: 1,
    validate: (v) => {
      if (v === undefined) return "Size is required";
      if (v <= 0) return "Size must be greater than 0";
      return true;
    },
  }) ?? 500;

  // -- Leverage -------------------------------------------------------------
  const leverageChoice = await select<number>({
    message: "Leverage:",
    choices: LEVERAGE_PRESETS,
    default: 3,
  });

  let leverage = leverageChoice;
  if (leverageChoice === 0) {
    leverage = await numberPrompt({
      message: "Custom leverage (1-50):",
      default: 3,
      min: 1,
      max: 50,
      validate: (v) => {
        if (v === undefined) return "Leverage is required";
        if (!Number.isInteger(v)) return "Leverage must be a whole number";
        return true;
      },
    }) ?? 3;
  }

  // -- Stop-loss ------------------------------------------------------------
  const wantSl = await confirm({
    message: "Set a stop-loss?",
    default: true,
  });

  let stopLossPct: number | undefined;
  if (wantSl) {
    stopLossPct = await numberPrompt({
      message: "Stop-loss distance (%):",
      default: 2.0,
      validate: (v) => {
        if (v === undefined) return "Value is required";
        if (v <= 0 || v > 50) return "Must be between 0.1% and 50%";
        return true;
      },
    }) ?? 2.0;
  }

  // -- Take-profit ----------------------------------------------------------
  const wantTp = await confirm({
    message: "Set a take-profit?",
    default: true,
  });

  let takeProfitPct: number | undefined;
  if (wantTp) {
    takeProfitPct = await numberPrompt({
      message: "Take-profit distance (%):",
      default: 3.0,
      validate: (v) => {
        if (v === undefined) return "Value is required";
        if (v <= 0 || v > 100) return "Must be between 0.1% and 100%";
        return true;
      },
    }) ?? 3.0;
  }

  // -- Conditions -----------------------------------------------------------
  console.log();
  console.log(theme.label("Conditions (when should this pattern trigger?)"));
  console.log(theme.muted("Pick at least one. You can add multiple."));
  console.log();

  const conditions: PatternCondition[] = [];
  let addMore = true;

  while (addMore) {
    const templateIdx = await select<number>({
      message: conditions.length === 0 ? "First condition:" : "Add another condition:",
      choices: CONDITION_TEMPLATES.map((t, i) => ({
        name: t.name,
        value: i,
      })),
    });

    const template = CONDITION_TEMPLATES[templateIdx];

    // For price-based conditions, ask for the actual level
    let value = template.value;
    if (template.axis === "mark_price") {
      value = await numberPrompt({
        message: `Price level ($):`,
        validate: (v) => {
          if (v === undefined) return "Price is required";
          if (v <= 0) return "Price must be positive";
          return true;
        },
      }) ?? 0;
    } else if (template.axis === "volume_24h_usd") {
      const volChoice = await select<number>({
        message: "Volume threshold:",
        choices: [
          { name: "$10M+", value: 10_000_000 },
          { name: "$50M+", value: 50_000_000 },
          { name: "$100M+", value: 100_000_000 },
          { name: "$500M+", value: 500_000_000 },
        ],
        default: 50_000_000,
      });
      value = volChoice;
    }

    const label = template.axis === "mark_price"
      ? `price ${template.op === "gt" ? "above" : "below"} $${value.toLocaleString()}`
      : template.label;

    conditions.push({
      axis: template.axis,
      op: template.op,
      value,
      label,
    });

    console.log(theme.success(`  + ${label}`));

    addMore = await confirm({
      message: "Add another condition?",
      default: false,
    });
  }

  // -- Build the pattern object ---------------------------------------------
  const pattern: Pattern = {
    name,
    description,
    tags: [],
    market,
    include: [],
    when: conditions,
    entry: {
      side,
      size_usd: sizeUsd,
      leverage,
      ...(stopLossPct !== undefined ? { stop_loss_pct: stopLossPct } : {}),
      ...(takeProfitPct !== undefined ? { take_profit_pct: takeProfitPct } : {}),
    },
    exit: [],
  };

  // -- Save -----------------------------------------------------------------
  const savedPath = await savePattern(pattern);

  console.log();
  console.log(theme.success("Pattern saved!"));
  console.log(theme.muted(`  ${savedPath}`));
  console.log();
  console.log(`Run ${theme.label(`pacifica patterns show ${name}`)} to review it.`);
  console.log(`Run ${theme.label(`pacifica backtest ${name}`)} to test it against historical data.`);
  console.log();

  return name;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Locate the bundled examples/patterns/ directory by walking up from this file.
 */
function findExamplesDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (let dir = here, i = 0; i < 6; i++, dir = dirname(dir)) {
    const candidate = join(dir, "examples", "patterns");
    // We'll verify existence at call time with readdir/readFile
    return candidate;
  }
  return null;
}

/**
 * Returns true if the error represents a user-initiated cancellation
 * (e.g., Ctrl+C during an Inquirer prompt).
 */
function isUserCancellation(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed")) return true;
  return false;
}
