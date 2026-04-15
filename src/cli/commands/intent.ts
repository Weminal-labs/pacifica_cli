// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Intent Command
// ---------------------------------------------------------------------------
// Parses natural language trading intent into structured JSON, then optionally
// executes it. Demo-worthy AI-native feature — no external API required.
//
// Usage:
//   pacifica intent "buy 0.1 ETH with 5x leverage"
//   pacifica intent "short 0.5 SOL at 150 with 10x, sl 145, tp 165"
//   pacifica intent "close my ETH position"
//   pacifica intent "cancel all orders on BTC"
//   pacifica intent "how exposed am I to ETH?"
//   pacifica intent "buy 0.1 ETH 5x" --execute
//   pacifica intent "long 1 BTC" --json
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { spawnSync } from "node:child_process";
import { theme } from "../theme.js";
import { writeSuccess, writeError } from "../../output/envelope.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedIntent {
  type: "trade" | "close" | "cancel" | "query" | "unknown";
  confidence: number; // 0–1
  params: {
    side?: "buy" | "sell";
    symbol?: string;     // normalized: ETH-USDC-PERP
    size?: number;
    leverage?: number;
    price?: number;
    sl?: number;
    tp?: number;
    query_type?: "exposure" | "positions" | "balance" | "pnl";
  };
  raw: string;
  suggestion: string; // CLI command equivalent
}

// ---------------------------------------------------------------------------
// Symbol normalisation
// ---------------------------------------------------------------------------

const KNOWN_BASES = new Set([
  "ETH", "BTC", "SOL", "AVAX", "ARB", "OP", "SUI", "APT",
  "DOGE", "MATIC", "LINK", "DOT", "ADA", "XRP", "ATOM",
]);

function normalizeSymbol(raw: string): string {
  // Strip whitespace, uppercase
  let s = raw.trim().toUpperCase();

  // If it already has a -USDC-PERP or -PERP suffix, strip it and re-add
  s = s.replace(/-USDC-PERP$/, "").replace(/-PERP$/, "").replace(/-USDC$/, "");

  // If not a known base, return as-is with suffix (best effort)
  return `${s}-USDC-PERP`;
}

// ---------------------------------------------------------------------------
// Regex-based parser
// ---------------------------------------------------------------------------

export function parseIntent(input: string): ParsedIntent {
  const raw = input.trim();
  const text = raw.toLowerCase();

  const params: ParsedIntent["params"] = {};
  let type: ParsedIntent["type"] = "unknown";

  // ── 1. Detect intent type ────────────────────────────────────────────────

  const isBuy = /\b(buy|long|bid)\b/.test(text);
  const isSell = /\b(sell|short|ask)\b/.test(text);
  const isClose = /\b(close|flatten)\b/.test(text);
  const isCancel = /\bcancel\b/.test(text);
  const isQuery = /\b(how|what|exposure|position|balance|pnl|profit|loss|expose)\b/.test(text);

  if (isClose) {
    type = "close";
  } else if (isCancel) {
    type = "cancel";
  } else if (isBuy || isSell) {
    type = "trade";
    params.side = isBuy ? "buy" : "sell";
  } else if (isQuery) {
    type = "query";
  }

  // ── 2. Extract symbol ────────────────────────────────────────────────────
  //
  // Match any known base token (case-insensitive) in the input text.
  // Also accept already-qualified symbols like ETH-USDC-PERP.

  const symbolRe = new RegExp(
    `\\b(${[...KNOWN_BASES].join("|")}(?:-USDC-PERP|-PERP)?)\\b`,
    "i",
  );
  const symbolMatch = raw.match(symbolRe);
  if (symbolMatch) {
    params.symbol = normalizeSymbol(symbolMatch[1]);
  }

  // ── 3. Extract size ──────────────────────────────────────────────────────
  //
  // Patterns:
  //   "0.1 ETH"  →  number before/after a token name
  //   "buy 2 BTC"
  //   Look for a standalone decimal/integer NOT followed by 'x' (that's leverage).

  // First try: number directly adjacent to a known symbol
  if (params.symbol) {
    const base = params.symbol.split("-")[0]!;
    const adjRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${base}\\b|\\b${base}\\s*(\\d+(?:\\.\\d+)?)`, "i");
    const adjMatch = raw.match(adjRe);
    if (adjMatch) {
      const n = adjMatch[1] ?? adjMatch[2];
      if (n) params.size = parseFloat(n);
    }
  }

  // Fallback: first standalone number after action word that isn't leverage
  if (params.size === undefined && type === "trade") {
    // Match numbers not followed by x/X (those are leverage)
    const sizeRe = /\b(\d+(?:\.\d+)?)\b(?!\s*[xX])/g;
    let m: RegExpExecArray | null;
    while ((m = sizeRe.exec(raw)) !== null) {
      const candidate = parseFloat(m[1]);
      // Skip if it looks like a price (very large) — we'll parse price separately
      if (candidate > 0 && candidate <= 10000) {
        params.size = candidate;
        break;
      }
    }
  }

  // ── 4. Leverage ──────────────────────────────────────────────────────────
  const levRe = /(\d+(?:\.\d+)?)\s*[xX]\b|leverage\s+(\d+(?:\.\d+)?)|lev\s+(\d+(?:\.\d+)?)/i;
  const levMatch = raw.match(levRe);
  if (levMatch) {
    params.leverage = parseFloat(levMatch[1] ?? levMatch[2] ?? levMatch[3] ?? "1");
  }

  // ── 5. Price (at / @ / price) ────────────────────────────────────────────
  const priceRe = /(?:at|@|price)\s*(\d+(?:\.\d+)?)/i;
  const priceMatch = raw.match(priceRe);
  if (priceMatch) {
    params.price = parseFloat(priceMatch[1]);
  }

  // ── 6. Stop-loss ─────────────────────────────────────────────────────────
  const slRe = /(?:sl|stop(?:-loss)?)\s+(\d+(?:\.\d+)?)/i;
  const slMatch = raw.match(slRe);
  if (slMatch) {
    params.sl = parseFloat(slMatch[1]);
  }

  // ── 7. Take-profit ───────────────────────────────────────────────────────
  const tpRe = /(?:tp|take[-\s]?profit|target)\s+(\d+(?:\.\d+)?)/i;
  const tpMatch = raw.match(tpRe);
  if (tpMatch) {
    params.tp = parseFloat(tpMatch[1]);
  }

  // ── 8. Query type ────────────────────────────────────────────────────────
  if (type === "query") {
    if (/\b(expos|position)\b/i.test(text)) {
      params.query_type = "exposure";
    } else if (/\bbalance\b/i.test(text)) {
      params.query_type = "balance";
    } else if (/\b(pnl|profit|loss)\b/i.test(text)) {
      params.query_type = "pnl";
    } else {
      params.query_type = "positions";
    }
  }

  // ── 9. Confidence ────────────────────────────────────────────────────────
  let confidence: number;

  if (type === "unknown") {
    confidence = 0.0;
  } else if (type === "trade") {
    if (params.symbol && params.size !== undefined) {
      confidence = 1.0;
    } else if (params.symbol) {
      confidence = 0.7;
    } else {
      confidence = 0.5;
    }
  } else if (type === "close" || type === "cancel") {
    confidence = params.symbol ? 1.0 : 0.7;
  } else {
    // query
    confidence = params.symbol ? 0.9 : 0.7;
  }

  // ── 10. Build CLI suggestion ─────────────────────────────────────────────
  const suggestion = buildSuggestion(type, params);

  return { type, confidence, params, raw, suggestion };
}

// ---------------------------------------------------------------------------
// CLI suggestion builder
// ---------------------------------------------------------------------------

function buildSuggestion(type: ParsedIntent["type"], params: ParsedIntent["params"]): string {
  const sym = params.symbol ?? "<symbol>";

  switch (type) {
    case "trade": {
      const side = params.side ?? "buy";
      const size = params.size !== undefined ? String(params.size) : "<size>";
      const parts: string[] = [`pacifica trade ${side} ${sym} ${size}`];
      if (params.leverage !== undefined) parts.push(`--leverage ${params.leverage}`);
      if (params.price !== undefined) parts.push(`--type limit --price ${params.price}`);
      if (params.sl !== undefined) parts.push(`--sl ${params.sl}`);
      if (params.tp !== undefined) parts.push(`--tp ${params.tp}`);
      return parts.join(" ");
    }
    case "close":
      return `pacifica positions close ${sym}`;
    case "cancel":
      return params.symbol
        ? `pacifica orders cancel --symbol ${sym}`
        : `pacifica orders cancel --all`;
    case "query":
      switch (params.query_type) {
        case "balance":
          return "pacifica positions --balance";
        case "pnl":
          return params.symbol
            ? `pacifica positions --pnl --symbol ${sym}`
            : "pacifica positions --pnl";
        default:
          return params.symbol
            ? `pacifica positions --symbol ${sym}`
            : "pacifica positions";
      }
    default:
      return "pacifica --help";
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function confidenceBar(confidence: number, width = 10): string {
  const filled = Math.round(confidence * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function renderTable(intent: ParsedIntent): void {
  const { type, confidence, params, suggestion } = intent;
  const border = "═".repeat(50);

  console.log();
  console.log(theme.header(`╔══ INTENT PARSED ${"═".repeat(33)}╗`));
  console.log();

  // Type line
  const typeLabel = type === "trade"
    ? `trade (${params.side ?? "?"})`
    : type;
  console.log(`  ${theme.label("Type:".padEnd(12))}${typeLabel}`);

  // Symbol
  if (params.symbol) {
    console.log(`  ${theme.label("Symbol:".padEnd(12))}${params.symbol}`);
  }

  // Size
  if (params.size !== undefined) {
    const base = params.symbol ? params.symbol.split("-")[0] : "";
    console.log(`  ${theme.label("Size:".padEnd(12))}${params.size} ${base}`);
  }

  // Leverage
  if (params.leverage !== undefined) {
    console.log(`  ${theme.label("Leverage:".padEnd(12))}${params.leverage}×`);
  }

  // Price
  if (params.price !== undefined) {
    console.log(`  ${theme.label("Price:".padEnd(12))}$${params.price}`);
  }

  // Stop-loss
  if (params.sl !== undefined) {
    console.log(`  ${theme.label("Stop-loss:".padEnd(12))}$${params.sl}`);
  }

  // Take-profit
  if (params.tp !== undefined) {
    console.log(`  ${theme.label("Take-profit:".padEnd(12))}$${params.tp}`);
  }

  // Query type
  if (params.query_type) {
    console.log(`  ${theme.label("Query:".padEnd(12))}${params.query_type}`);
  }

  // Confidence bar
  const pct = Math.round(confidence * 100);
  const bar = confidence >= 0.7
    ? theme.success(confidenceBar(confidence))
    : theme.warning(confidenceBar(confidence));
  const pctLabel = confidence >= 0.7 ? theme.success(`${pct}%`) : theme.warning(`${pct}%`);
  console.log();
  console.log(`  ${theme.label("Confidence:".padEnd(12))}${bar} ${pctLabel}`);

  // CLI equivalent
  console.log();
  console.log(`  ${theme.muted("CLI equivalent:")}`);
  console.log(`  ${theme.emphasis(suggestion)}`);
  console.log();
  console.log(theme.header(`╚${"═".repeat(border.length + 2)}╝`));
  console.log();
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createIntentCommand(): Command {
  return new Command("intent")
    .description("Parse natural language trading intent into a structured command")
    .argument("<text...>", "Natural language trading intent")
    .option("-j, --json", "Machine-readable JSON output (for AI agents)")
    .option("-e, --execute", "Execute the parsed command after confirmation")
    .action(async (textParts: string[], opts: { json?: boolean; execute?: boolean }, cmd: Command) => {
      const input = textParts.join(" ");
      // Check both local opts and parent program opts for --json
      const parentJson = (cmd.parent?.opts() as { json?: boolean } | undefined)?.json ?? false;
      const jsonMode = (opts.json ?? false) || parentJson;
      const executeMode = opts.execute ?? false;

      // Parse
      const intent = parseIntent(input);

      // JSON mode — emit envelope and exit
      if (jsonMode) {
        writeSuccess(intent, true);
        return;
      }

      // Human-readable table
      renderTable(intent);

      // Low confidence warning
      if (intent.confidence < 0.5) {
        console.log(
          theme.warning("  Low confidence — please use explicit commands (pacifica --help)"),
        );
        console.log();
        return;
      }

      // --execute flag
      if (executeMode) {
        if (intent.confidence < 0.7) {
          console.log(
            theme.warning(
              `  Confidence too low (${Math.round(intent.confidence * 100)}%) to auto-execute.\n` +
              "  Increase specificity or run the CLI command manually.",
            ),
          );
          console.log();
          return;
        }

        // Confirm
        let confirmed: boolean;
        try {
          confirmed = await confirm({
            message: `Execute: ${intent.suggestion}?`,
            default: true,
          });
        } catch {
          console.log(theme.muted("\nCancelled."));
          return;
        }

        if (!confirmed) {
          console.log(theme.muted("Cancelled."));
          return;
        }

        // Build arg list from suggestion string
        // suggestion is always "pacifica <sub> <args...>"
        const parts = intent.suggestion.split(/\s+/);
        // parts[0] is "pacifica" — skip it; the rest are args to the CLI
        const cliArgs = parts.slice(1);

        console.log(theme.muted(`\nRunning: ${process.execPath} ${process.argv[1]} ${cliArgs.join(" ")}\n`));

        const result = spawnSync(
          process.execPath,
          [process.argv[1]!, ...cliArgs],
          { stdio: "inherit" },
        );

        if (result.status !== 0) {
          const e = {
            ok: false as const,
            error: "sdk" as const,
            message: `Command exited with code ${result.status ?? "unknown"}`,
            retryable: false,
          };
          writeError(e, false);
        }
      }
    });
}
