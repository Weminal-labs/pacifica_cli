// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Live Leaderboard
// ---------------------------------------------------------------------------
// `pacifica leaderboard [--limit <n>] [--live] [--json]
//                      [--watch] [--filter <rising|falling|consistent>]`
//
// Shows the Pacifica testnet leaderboard with 1D/7D/30D/all-time P&L columns.
// --live   : fetches each top trader's current open positions.
// --watch  : polls every 30s and highlights row-level deltas since last tick.
// --filter : rising    = 1D > 25% of 7D   (and 1D > 0)
//            falling   = 1D < 0
//            consistent= 3 of 4 timeframes positive
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme } from "../theme.js";

// ---------------------------------------------------------------------------
// ANSI-safe padding helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function vLen(s: string): number { return s.replace(ANSI_RE, "").length; }
function padR(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? s + " ".repeat(e) : s; }
function padL(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? " ".repeat(e) + s : s; }

function fmtPnl(n: number): string {
  const abs = Math.abs(n);
  let str: string;
  if (abs >= 1_000_000) {
    str = `$${(n / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    str = `${n >= 0 ? "+" : "-"}$${(abs / 1_000).toFixed(1)}K`;
  } else {
    str = `${n >= 0 ? "+" : "-"}$${abs.toFixed(0)}`;
  }
  return n >= 0 ? theme.profit(str) : theme.loss(str);
}

// ---------------------------------------------------------------------------
// Positions fetch (public endpoint, no signing)
// ---------------------------------------------------------------------------

async function fetchPositionsForAddress(
  baseUrl: string,
  address: string,
): Promise<string> {
  try {
    const url = `${baseUrl}/api/v1/positions?account=${encodeURIComponent(address)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return "—";
    const json = (await res.json()) as { data?: unknown[] };
    const positions = json?.data ?? [];
    if (!Array.isArray(positions) || positions.length === 0) return theme.muted("flat");

    const summary = positions
      .slice(0, 2)
      .map((p) => {
        const pos = p as Record<string, unknown>;
        const side = String(pos.side ?? "?").toUpperCase();
        const sym  = String(pos.symbol ?? "?").replace("-USDC-PERP", "").replace("-USDC", "");
        return `${side} ${sym}`;
      })
      .join(", ");

    return positions.length > 2
      ? `${summary} +${positions.length - 2} more`
      : summary;
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

type FilterMode = "rising" | "falling" | "consistent";

interface TraderRow {
  rank: number;
  trader_id: string;
  overall_rep_score: number;
  overall_win_rate: number;
  onchain: {
    pnl_1d: number;
    pnl_7d: number;
    pnl_30d: number;
    pnl_all_time: number;
  };
}

function applyFilter(traders: TraderRow[], mode: FilterMode): TraderRow[] {
  switch (mode) {
    case "rising":
      return traders.filter((t) => {
        const d1 = t.onchain.pnl_1d;
        const d7 = t.onchain.pnl_7d;
        if (d1 <= 0 || d7 === 0) return false;
        return d1 / d7 > 0.25;
      });
    case "falling":
      return traders.filter((t) => t.onchain.pnl_1d < 0);
    case "consistent":
      return traders.filter((t) => {
        const c = [t.onchain.pnl_1d, t.onchain.pnl_7d, t.onchain.pnl_30d, t.onchain.pnl_all_time]
          .filter((v) => v > 0).length;
        return c >= 3;
      });
  }
}

// ---------------------------------------------------------------------------
// Render a single snapshot to stdout
// ---------------------------------------------------------------------------

interface RenderOptions {
  traders:      TraderRow[];
  positionMap:  Map<string, string>;
  showPositions: boolean;
  lastPnl:      Map<string, number>;  // per-trader 1D PnL on the previous tick
  watchLabel:   string | null;
}

function renderTable(opts: RenderOptions): void {
  const { traders, positionMap, showPositions, lastPnl, watchLabel } = opts;

  const W = {
    rank:   4,
    trader: 16,
    score:  5,
    wr:     7,
    pnl1d:  10,
    pnl7d:  10,
    pnl30d: 10,
    pnlAll: 11,
    delta:  10,
    now:    showPositions ? 20 : 0,
  };

  const showDelta = lastPnl.size > 0;
  const totalWidth =
    2 + W.rank + 2 + W.trader + 2 + W.score + 2 + W.wr + 2 +
    W.pnl1d + 2 + W.pnl7d + 2 + W.pnl30d + 2 + W.pnlAll +
    (showDelta ? 2 + W.delta : 0) +
    (showPositions ? 2 + W.now : 0);
  const divider = theme.muted("─".repeat(totalWidth));

  console.log();
  const headerText = watchLabel
    ? `  Pacifica Testnet Leaderboard  ${watchLabel}`
    : `  Pacifica Testnet Leaderboard`;
  console.log(
    theme.header(headerText) +
    theme.muted(` — top ${traders.length} by all-time P&L`),
  );
  console.log(divider);

  // Header row
  const hRank   = padL("Rank",     W.rank);
  const hTrader = padR("Trader",   W.trader);
  const hScore  = padL("Rep",      W.score);
  const hWr     = padL("Win%",     W.wr);
  const hPnl1d  = padL("1D",       W.pnl1d);
  const hPnl7d  = padL("7D",       W.pnl7d);
  const hPnl30d = padL("30D",      W.pnl30d);
  const hPnlAll = padL("All-Time", W.pnlAll);
  const hDelta  = showDelta ? `  ${padL("Δ1D", W.delta)}` : "";
  const hNow    = showPositions ? `  ${padR("Now", W.now)}` : "";
  console.log(
    theme.muted(`  ${hRank}  ${hTrader}  ${hScore}  ${hWr}  ${hPnl1d}  ${hPnl7d}  ${hPnl30d}  ${hPnlAll}${hDelta}${hNow}`),
  );
  console.log(divider);

  for (const t of traders) {
    const rank   = padL(String(t.rank), W.rank);
    const trader = padR(t.trader_id.slice(0, 14) + "..", W.trader);

    const score      = t.overall_rep_score;
    const scoreStr   = String(score);
    const scoreColored =
      score >= 70 ? theme.profit(scoreStr)
      : score >= 50 ? theme.warning(scoreStr)
      : theme.muted(scoreStr);

    const wr     = padL(`${(t.overall_win_rate * 100).toFixed(0)}%`, W.wr);
    const pnl1d  = padL(fmtPnl(t.onchain.pnl_1d), W.pnl1d);
    const pnl7d  = padL(fmtPnl(t.onchain.pnl_7d), W.pnl7d);
    const pnl30d = padL(fmtPnl(t.onchain.pnl_30d), W.pnl30d);
    const pnlAll = padL(fmtPnl(t.onchain.pnl_all_time), W.pnlAll);

    let deltaCol = "";
    if (showDelta) {
      const prev = lastPnl.get(t.trader_id);
      if (prev === undefined) {
        deltaCol = `  ${padL(theme.muted("new"), W.delta)}`;
      } else {
        const d = t.onchain.pnl_1d - prev;
        if (Math.abs(d) < 0.5) {
          deltaCol = `  ${padL(theme.muted("—"), W.delta)}`;
        } else {
          deltaCol = `  ${padL(fmtPnl(d), W.delta)}`;
        }
      }
    }

    const nowStr = showPositions
      ? `  ${padR(positionMap.get(t.trader_id) ?? "—", W.now)}`
      : "";

    console.log(
      `  ${rank}  ${theme.label(trader)}  ${padL(scoreColored, W.score)}  ${wr}  ${pnl1d}  ${pnl7d}  ${pnl30d}  ${pnlAll}${deltaCol}${nowStr}`,
    );
  }

  console.log(divider);
  console.log(
    theme.muted(`  Source: test-api.pacifica.fi`) +
    (showPositions ? theme.muted("  |  Positions: top 5 only") : "") +
    (showDelta    ? theme.muted("  |  Δ1D vs. previous tick")   : ""),
  );
  if (!watchLabel) {
    console.log(
      theme.muted(`  Hint: `) +
      theme.label(`pacifica leaderboard --watch`) +
      theme.muted(`  or  `) +
      theme.label(`pacifica leaderboard --filter rising`),
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Single fetch tick — returns the enriched traders + position map
// ---------------------------------------------------------------------------

async function fetchTick(
  client: PacificaClient,
  limit: number,
  live: boolean,
): Promise<{ traders: TraderRow[]; positionMap: Map<string, string> }> {
  const traders = (await client.getLeaderboard(limit)) as unknown as TraderRow[];
  const positionMap = new Map<string, string>();

  if (live && traders.length > 0) {
    const baseUrl = (client as unknown as { baseUrl: string }).baseUrl
      ?? "https://test-api.pacifica.fi";

    const results = await Promise.allSettled(
      traders.slice(0, Math.min(limit, 5)).map(async (t) => {
        const pos = await fetchPositionsForAddress(baseUrl, t.trader_id);
        return [t.trader_id, pos] as [string, string];
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") positionMap.set(r.value[0], r.value[1]);
    }
  }

  return { traders, positionMap };
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createLeaderboardCommand(): Command {
  const cmd = new Command("leaderboard")
    .description("Live Pacifica testnet trader leaderboard with P&L breakdown")
    .option("--limit <n>", "Number of traders to show", "10")
    .option("--live",  "Show each trader's current open positions (slower)")
    .option("--json",  "Output JSON")
    .option("--watch", "Refresh every 30s with delta highlighting")
    .option("--filter <mode>", "Filter: rising | falling | consistent")
    .action(async (opts: {
      limit:   string;
      live?:   boolean;
      json?:   boolean;
      watch?:  boolean;
      filter?: string;
    }) => {
      let client: PacificaClient | undefined;
      let intervalHandle: ReturnType<typeof setInterval> | null = null;

      // Validate filter
      let filterMode: FilterMode | null = null;
      if (opts.filter) {
        if (opts.filter === "rising" || opts.filter === "falling" || opts.filter === "consistent") {
          filterMode = opts.filter;
        } else {
          console.error(theme.error(`\nError: --filter must be one of: rising, falling, consistent\n`));
          process.exitCode = 1;
          return;
        }
      }

      // Guard: --watch is incompatible with --json (interactive vs. machine-readable)
      if (opts.watch && opts.json) {
        console.error(theme.error(`\nError: --watch cannot be combined with --json.\n`));
        process.exitCode = 1;
        return;
      }

      try {
        const limit = Math.min(parseInt(opts.limit, 10) || 10, 50);
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        // Track previous 1D PnL per trader for delta rendering
        const lastPnl = new Map<string, number>();
        let tickNumber = 0;

        const runOnce = async (): Promise<void> => {
          tickNumber += 1;
          if (!opts.watch) {
            process.stdout.write(theme.muted("Fetching live leaderboard...\r"));
          }

          const { traders: rawTraders, positionMap } = await fetchTick(
            client!, limit, !!opts.live,
          );

          if (!opts.watch) process.stdout.write("                                \r");

          if (rawTraders.length === 0) {
            console.log(theme.muted("No leaderboard data returned from Pacifica testnet."));
            return;
          }

          const traders = filterMode
            ? applyFilter(rawTraders, filterMode)
            : rawTraders;

          if (traders.length === 0) {
            console.log(theme.muted(`No traders match filter "${filterMode}".`));
            return;
          }

          // JSON output (one-shot only)
          if (opts.json) {
            const output = traders.map((t) => ({
              ...t,
              current_positions: positionMap.get(t.trader_id) ?? null,
            }));
            console.log(JSON.stringify(output, null, 2));
            return;
          }

          // Clear screen in watch mode (ANSI: clear + home)
          if (opts.watch) {
            process.stdout.write("\x1B[2J\x1B[H");
          }

          const watchLabel = opts.watch
            ? theme.muted(`· tick #${tickNumber} · ${new Date().toLocaleTimeString()}`)
            : null;
          const filterLabel = filterMode
            ? theme.warning(`· filter: ${filterMode}`)
            : "";

          renderTable({
            traders,
            positionMap,
            showPositions: !!opts.live,
            lastPnl:       opts.watch ? lastPnl : new Map(),
            watchLabel:    watchLabel || filterLabel ? `${watchLabel ?? ""}${filterLabel}`.trim() : null,
          });

          if (opts.watch) {
            console.log(
              theme.muted("  Press Ctrl+C to exit.  Next refresh in 30s."),
            );
            console.log();
          }

          // Update lastPnl map AFTER rendering (so deltas compare prev→current)
          lastPnl.clear();
          for (const t of rawTraders) {
            lastPnl.set(t.trader_id, t.onchain.pnl_1d);
          }
        };

        await runOnce();

        if (opts.watch) {
          intervalHandle = setInterval(() => {
            runOnce().catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(theme.error(`\nTick error: ${msg}`));
            });
          }, 30_000);

          // Keep the process alive and handle Ctrl+C gracefully
          await new Promise<void>((resolve) => {
            const onExit = () => {
              if (intervalHandle) clearInterval(intervalHandle);
              console.log(theme.muted("\n  Leaderboard watch stopped.\n"));
              resolve();
            };
            process.on("SIGINT",  onExit);
            process.on("SIGTERM", onExit);
          });
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        if (intervalHandle) clearInterval(intervalHandle);
        client?.destroy();
      }
    });

  return cmd;
}
