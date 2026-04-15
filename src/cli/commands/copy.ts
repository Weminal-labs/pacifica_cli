// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Copy Trading
// ---------------------------------------------------------------------------
// `pacifica copy watch <address> [--multiplier <x>] [--auto]`
//   Watch a trader's positions; prompt (or auto-copy) when they change.
//
// `pacifica copy list`
//   Show recently watched trader addresses.
//
// The watch loop is foreground. Run it in a spare terminal or under tmux.
// Press Ctrl+C to stop.
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedPosition {
  symbol: string;
  side: string;
  size: string;
  entryPrice: string;
}

interface WatchState {
  address: string;
  positions: TrackedPosition[];
  lastSeen: string; // ISO date
}

// ---------------------------------------------------------------------------
// State file — persists recently watched addresses
// ---------------------------------------------------------------------------

const PACIFICA_DIR  = join(homedir(), ".pacifica");
const WATCH_STATE   = join(PACIFICA_DIR, "copy-watch.json");

async function loadWatchStates(): Promise<WatchState[]> {
  try {
    const raw = await readFile(WATCH_STATE, "utf-8");
    return JSON.parse(raw) as WatchState[];
  } catch {
    return [];
  }
}

async function saveWatchState(state: WatchState): Promise<void> {
  try {
    await mkdir(PACIFICA_DIR, { recursive: true });
    const states = await loadWatchStates();
    const filtered = states.filter((s) => s.address !== state.address);
    filtered.unshift(state); // most recent first
    await writeFile(
      WATCH_STATE,
      JSON.stringify(filtered.slice(0, 20), null, 2),
      { encoding: "utf-8", mode: 0o600 },
    );
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Fetch positions for an arbitrary public address
// ---------------------------------------------------------------------------

async function fetchPositions(
  baseUrl: string,
  address: string,
): Promise<TrackedPosition[]> {
  const url = `${baseUrl}/api/v1/positions?account=${encodeURIComponent(address)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return [];

  const json = (await res.json()) as { data?: unknown[] };
  const raw = json?.data ?? [];
  if (!Array.isArray(raw)) return [];

  return raw.map((p) => {
    const pos = p as Record<string, unknown>;
    return {
      symbol:     String(pos.symbol     ?? "?"),
      side:       String(pos.side       ?? "?"),
      size:       String(pos.size       ?? "0"),
      entryPrice: String(pos.entryPrice ?? pos.entry_price ?? "0"),
    };
  });
}

// ---------------------------------------------------------------------------
// Diff two position snapshots
// ---------------------------------------------------------------------------

interface PositionDiff {
  opened: TrackedPosition[];
  closed: TrackedPosition[];
}

function diffPositions(
  prev: TrackedPosition[],
  next: TrackedPosition[],
): PositionDiff {
  const key = (p: TrackedPosition) => `${p.symbol}:${p.side}`;
  const prevKeys = new Set(prev.map(key));
  const nextKeys = new Set(next.map(key));

  return {
    opened: next.filter((p) => !prevKeys.has(key(p))),
    closed: prev.filter((p) => !nextKeys.has(key(p))),
  };
}

// ---------------------------------------------------------------------------
// Interactive copy prompt
// ---------------------------------------------------------------------------

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });
}

// ---------------------------------------------------------------------------
// Summarise a position for display
// ---------------------------------------------------------------------------

function describePos(p: TrackedPosition): string {
  const sym    = p.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
  const side   = p.side.toUpperCase();
  const ep     = parseFloat(p.entryPrice);
  const epStr  = ep > 0 ? ` @ ${formatPrice(ep)}` : "";
  return `${side} ${sym}${epStr}`;
}

// ---------------------------------------------------------------------------
// Main watch loop
// ---------------------------------------------------------------------------

async function runCopyWatch(
  address: string,
  multiplier: number,
  auto: boolean,
  intervalSecs: number,
): Promise<void> {
  const config = await loadConfig();

  let baseUrl: string;
  if (config.network === "mainnet") {
    baseUrl = "https://api.pacifica.fi";
  } else {
    baseUrl = "https://test-api.pacifica.fi";
  }

  // Resolve leaderboard rank for this address (optional — for display)
  let repStr = "";
  try {
    const signer = createSignerFromConfig(config);
    const client = new PacificaClient({ network: config.network, signer });
    const lb = await client.getLeaderboard(50);
    const entry = lb.find((e) => e.address === address);
    if (entry) {
      repStr = ` | Rep ${entry.repScore}`;
    }
    client.destroy();
  } catch { /* best-effort */ }

  const shortAddr = address.slice(0, 12) + "…";

  console.log();
  console.log(theme.header("  Pacifica Copy Watch"));
  console.log(
    theme.muted("  Watching: ") +
    theme.emphasis(shortAddr) +
    theme.muted(repStr) +
    theme.muted(`  —  ${intervalSecs}s polling  —  Ctrl+C to stop`),
  );
  if (multiplier !== 1) {
    console.log(theme.muted(`  Multiplier: ${multiplier}x (copy sizes scaled)`));
  }
  if (auto) {
    console.log(theme.warning("  AUTO-COPY enabled — trades will execute without confirmation"));
  }
  console.log();

  // Initial snapshot
  let prevPositions = await fetchPositions(baseUrl, address);

  if (prevPositions.length > 0) {
    console.log(
      theme.muted("  Current positions: ") +
      prevPositions.map(describePos).join(", "),
    );
  } else {
    console.log(theme.muted("  Trader is currently flat."));
  }
  console.log();

  const poll = async () => {
    const nextPositions = await fetchPositions(baseUrl, address);
    const diff = diffPositions(prevPositions, nextPositions);
    prevPositions = nextPositions;

    const now = new Date().toLocaleTimeString("en-US", { hour12: false });

    // --- Opened positions ---
    for (const p of diff.opened) {
      const sym  = p.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
      const size = parseFloat(p.size) || 0;
      const copySz = (size * multiplier).toFixed(4);
      const sideLabel = p.side.toUpperCase();
      const sideColor = p.side.includes("long") || p.side === "bid"
        ? theme.profit(sideLabel)
        : theme.loss(sideLabel);

      console.log(
        `  [${now}] ` +
        theme.emphasis("→ OPENED ") +
        sideColor + " " +
        theme.emphasis(sym) +
        theme.muted(` size ${size}${multiplier !== 1 ? ` (copy: ${copySz})` : ""}`),
      );

      // Prompt or auto-copy
      if (auto || (await prompt(
        `  ${theme.muted(`Copy this trade? (${multiplier}x = ${copySz} ${sym})`)}\n  [y] copy  [n] skip > `,
      )) === "y") {
        await executeCopyTrade(config, p, multiplier, auto);
      } else {
        console.log(theme.muted("  Skipped."));
      }
    }

    // --- Closed positions ---
    for (const p of diff.closed) {
      const sym = p.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
      console.log(
        `  [${now}] ` +
        theme.muted("← CLOSED  ") +
        theme.emphasis(sym),
      );
    }

    // Persist watch state
    await saveWatchState({ address, positions: nextPositions, lastSeen: new Date().toISOString() });
  };

  // Immediate first diff (gives real-time startup sense)
  await poll();

  const timer = setInterval(() => { void poll(); }, intervalSecs * 1_000);

  const shutdown = () => {
    clearInterval(timer);
    console.log(theme.muted("\n  Copy watch stopped."));
    process.exit(0);
  };

  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise<never>(() => { /* never resolves */ });
}

// ---------------------------------------------------------------------------
// Execute a copy trade (places a market order matching the watched position)
// ---------------------------------------------------------------------------

async function executeCopyTrade(
  config: Awaited<ReturnType<typeof loadConfig>>,
  pos: TrackedPosition,
  multiplier: number,
  silent: boolean,
): Promise<void> {
  try {
    const signer = createSignerFromConfig(config);
    const client = new PacificaClient({ network: config.network, signer });

    try {
      const size = parseFloat(pos.size) * multiplier;
      if (size <= 0) {
        console.log(theme.muted("  Skipping — computed copy size is zero."));
        return;
      }

      // Normalise side: the API expects "bid" (long) or "ask" (short)
      const side: "bid" | "ask" =
        pos.side.includes("long") || pos.side === "bid" ? "bid" : "ask";

      const result = await client.placeMarketOrder({
        symbol:           pos.symbol,
        amount:           String(size),
        side,
        slippage_percent: "1",
        reduce_only:      false,
      });

      if (silent) {
        console.log(
          theme.success(`  Auto-copied: ${side === "bid" ? "LONG" : "SHORT"} ${pos.symbol.replace("-USDC-PERP", "")} size ${size.toFixed(4)}`) +
          theme.muted(` (order ${result.orderId})`),
        );
      } else {
        console.log(
          theme.success(`  Copied → order ${result.orderId}`),
        );
      }
    } finally {
      client.destroy();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(theme.error(`  Copy failed: ${msg}`));
  }
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createCopyCommand(): Command {
  const copy = new Command("copy")
    .description("Copy a top trader's positions in real time");

  // -------------------------------------------------------------------------
  // pacifica copy watch <address> [--multiplier <x>] [--auto] [--interval <s>]
  // -------------------------------------------------------------------------
  copy
    .command("watch <address>")
    .description("Watch a trader's positions and optionally copy their trades")
    .option("--multiplier <x>", "Size multiplier for copied trades (e.g. 0.1)", "1")
    .option("--auto", "Auto-copy without confirmation prompts (use with care!)")
    .option("--interval <s>", "Poll interval in seconds", "60")
    .action(async (address: string, opts: { multiplier: string; auto?: boolean; interval: string }) => {
      const multiplier   = Math.max(0.001, parseFloat(opts.multiplier) || 1);
      const intervalSecs = Math.max(10, parseInt(opts.interval, 10) || 60);

      try {
        await runCopyWatch(address, multiplier, !!opts.auto, intervalSecs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  // -------------------------------------------------------------------------
  // pacifica copy list
  // -------------------------------------------------------------------------
  copy
    .command("list")
    .description("Show recently watched trader addresses")
    .action(async () => {
      try {
        const states = await loadWatchStates();

        if (states.length === 0) {
          console.log(theme.muted("No copy-watch history. Use 'pacifica copy watch <address>' to start."));
          return;
        }

        console.log();
        console.log(theme.header("  Recently Watched Traders"));
        console.log(theme.muted("  " + "─".repeat(60)));

        for (const s of states) {
          const shortAddr  = s.address.slice(0, 16) + "…";
          const lastSeen   = new Date(s.lastSeen).toLocaleString();
          const posCount   = s.positions.length;
          const posSummary = posCount > 0
            ? s.positions.slice(0, 2).map(describePos).join(", ") +
              (posCount > 2 ? ` +${posCount - 2}` : "")
            : theme.muted("flat");

          console.log(`  ${theme.emphasis(shortAddr)}  ${theme.muted(lastSeen)}`);
          console.log(`    ${theme.muted("Positions:")} ${posSummary}`);
        }

        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      }
    });

  return copy;
}
