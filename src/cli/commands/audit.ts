// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Audit Log Command
// ---------------------------------------------------------------------------
// Subcommands:
//   pacifica audit tail [--n <count>]      — display last N entries
//   pacifica audit verify                  — verify chain integrity
//   pacifica audit export [--output <path>] — export full log to a file
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { theme } from "../theme.js";
import {
  tailAuditLog,
  verifyAuditLog,
  readAuditLog,
  type AuditEntry,
} from "../../core/audit/logger.js";

// ---------------------------------------------------------------------------
// ANSI-safe column padding helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function padR(s: string, w: number): string {
  const extra = w - stripAnsi(s).length;
  return extra > 0 ? s + " ".repeat(extra) : s;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  } catch {
    return iso;
  }
}

function resultColor(result: AuditEntry["result"]): string {
  switch (result) {
    case "ok":
      return theme.success(result);
    case "error":
      return theme.error(result);
    case "rejected":
      return theme.warning(result);
    default:
      return String(result);
  }
}

// ---------------------------------------------------------------------------
// Subcommand: tail
// ---------------------------------------------------------------------------

async function cmdTail(count: number): Promise<void> {
  const entries = await tailAuditLog(count);

  if (entries.length === 0) {
    console.log(theme.muted("\n  No audit entries found.\n"));
    return;
  }

  const SEQ_W = 5;
  const TS_W = 23;
  const ACTION_W = 20;
  const RESULT_W = 12;

  const divider = theme.muted(
    "  " + "─".repeat(SEQ_W + TS_W + ACTION_W + RESULT_W + 6),
  );

  console.log();
  console.log(
    "  " +
    padR(theme.muted("#"), SEQ_W) +
    padR(theme.muted("Timestamp"), TS_W) +
    padR(theme.muted("Action"), ACTION_W) +
    theme.muted("Result"),
  );
  console.log(divider);

  for (const entry of entries) {
    const seqStr = String(entry.seq);
    const ts = formatTimestamp(entry.timestamp);
    const action = entry.action;
    const result = resultColor(entry.result);

    console.log(
      "  " +
      padR(seqStr, SEQ_W) +
      padR(ts, TS_W) +
      padR(action, ACTION_W) +
      result +
      (entry.error_msg ? theme.muted(`  ${entry.error_msg}`) : ""),
    );
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: verify
// ---------------------------------------------------------------------------

async function cmdVerify(): Promise<void> {
  console.log();
  console.log(theme.muted("  Verifying audit chain..."));

  const result = await verifyAuditLog();

  if (result.error) {
    console.log(
      `  \x1b[31m✗\x1b[0m Failed to read audit log — ${result.error}`,
    );
    console.log();
    return;
  }

  if (result.entries === 0) {
    console.log(theme.muted("  No entries in audit log."));
    console.log();
    return;
  }

  if (result.valid) {
    console.log(
      `  ${theme.success("✓")} Audit log verified — ${result.entries} ${result.entries === 1 ? "entry" : "entries"}, chain intact`,
    );
  } else {
    console.log(
      `  \x1b[31m✗\x1b[0m Chain broken at entry #${result.first_broken_at ?? "?"} — possible tampering detected`,
    );
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: export
// ---------------------------------------------------------------------------

async function cmdExport(outputPath: string): Promise<void> {
  const entries = await readAuditLog();

  if (entries.length === 0) {
    console.log(theme.muted("\n  No audit entries to export.\n"));
    return;
  }

  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(outputPath, lines, "utf-8");

  console.log();
  console.log(theme.success(`  Exported ${entries.length} ${entries.length === 1 ? "entry" : "entries"} to ${outputPath}`));
  console.log();
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createAuditCommand(): Command {
  const audit = new Command("audit")
    .description("View and verify the tamper-evident audit log");

  // -- tail ------------------------------------------------------------------
  audit
    .command("tail")
    .description("Show the last N audit log entries (default 20)")
    .option("-n, --n <count>", "Number of entries to show", parseInt)
    .action(async (opts: { n?: number }) => {
      const count = opts.n && opts.n > 0 ? opts.n : 20;
      try {
        await cmdTail(count);
      } catch (err) {
        console.error(theme.muted(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

  // -- verify ----------------------------------------------------------------
  audit
    .command("verify")
    .description("Verify audit log chain integrity")
    .action(async () => {
      try {
        await cmdVerify();
      } catch (err) {
        console.error(theme.muted(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

  // -- export ----------------------------------------------------------------
  audit
    .command("export")
    .description("Export the full audit log to a file")
    .option("-o, --output <path>", "Output file path", "audit-export.jsonl")
    .action(async (opts: { output: string }) => {
      try {
        await cmdExport(opts.output);
      } catch (err) {
        console.error(theme.muted(`  Error: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

  return audit;
}
