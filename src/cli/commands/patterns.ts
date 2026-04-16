// ---------------------------------------------------------------------------
// `pacifica patterns` — manage user-authored patterns in ~/.pacifica/patterns/
// ---------------------------------------------------------------------------
//   pacifica patterns list          list every pattern
//   pacifica patterns show <name>   print one pattern
//   pacifica patterns validate <file>  parse a file and report errors
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import {
  loadPatterns,
  loadPattern,
  getPatternsDir,
  parsePattern,
  PatternParseError,
} from "../../core/patterns/loader.js";
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

  return cmd;
}
