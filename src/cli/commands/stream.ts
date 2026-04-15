// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Stream Command
// ---------------------------------------------------------------------------
// Streams market data as NDJSON to stdout (one JSON object per line).
// Designed for agents and tools like jq to pipe.
//
// Usage:
//   pacifica stream prices [--symbol <sym>] [--interval <ms>]
//   pacifica stream positions [--interval <ms>]
//   pacifica stream funding [--symbol <sym>] [--interval <ms>]
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { writeError, classifyError } from "../../output/envelope.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PRICES_INTERVAL_MS = 2000;
const DEFAULT_POSITIONS_INTERVAL_MS = 5000;
const DEFAULT_FUNDING_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// NDJSON helpers
// ---------------------------------------------------------------------------

function emit(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------

function registerShutdown(cleanup?: () => void): void {
  let exiting = false;

  const handler = () => {
    if (exiting) return;
    exiting = true;
    if (cleanup) cleanup();
    emit({ type: "stream_end", reason: "interrupted" });
    process.exit(0);
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}

// ---------------------------------------------------------------------------
// Subcommand: prices
// ---------------------------------------------------------------------------

async function streamPrices(opts: {
  symbol?: string;
  interval?: number;
}): Promise<void> {
  const intervalMs = opts.interval ?? DEFAULT_PRICES_INTERVAL_MS;

  let client: PacificaClient | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  registerShutdown(() => {
    if (timer) clearInterval(timer);
  });

  try {
    const config = await loadConfig();
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network: config.network, signer });
  } catch (err) {
    writeError(classifyError(err), false);
    process.exit(1);
  }

  const tick = async () => {
    try {
      const markets = await client!.getMarkets();
      const timestamp = new Date().toISOString();

      for (const m of markets) {
        if (opts.symbol && m.symbol !== opts.symbol.toUpperCase()) continue;
        emit({
          type: "price",
          symbol: m.symbol,
          mark_price: m.markPrice,
          index_price: m.oraclePrice,
          funding_rate: m.fundingRate,
          timestamp,
        });
      }
    } catch (err) {
      const classified = classifyError(err);
      emit({
        type: "error",
        error: classified.error,
        message: classified.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // First tick immediately, then poll
  await tick();
  timer = setInterval(tick, intervalMs);
}

// ---------------------------------------------------------------------------
// Subcommand: positions
// ---------------------------------------------------------------------------

async function streamPositions(opts: { interval?: number }): Promise<void> {
  const intervalMs = opts.interval ?? DEFAULT_POSITIONS_INTERVAL_MS;

  let client: PacificaClient | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  registerShutdown(() => {
    if (timer) clearInterval(timer);
  });

  try {
    const config = await loadConfig();
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network: config.network, signer });
  } catch (err) {
    writeError(classifyError(err), false);
    process.exit(1);
  }

  const tick = async () => {
    try {
      const [positions, markets] = await Promise.all([
        client!.getPositions(),
        client!.getMarkets(),
      ]);

      const markPriceMap = new Map<string, number>();
      for (const m of markets) {
        markPriceMap.set(m.symbol, m.markPrice);
      }

      const timestamp = new Date().toISOString();

      for (const p of positions) {
        const markPrice = markPriceMap.get(p.symbol) ?? p.entryPrice;

        // Compute unrealized PnL inline
        const unrealizedPnl =
          p.side === "long"
            ? (markPrice - p.entryPrice) * p.amount
            : (p.entryPrice - markPrice) * p.amount;

        emit({
          type: "position",
          symbol: p.symbol,
          side: p.side,
          size: p.amount,
          unrealized_pnl: unrealizedPnl,
          entry_price: p.entryPrice,
          mark_price: markPrice,
          timestamp,
        });
      }
    } catch (err) {
      const classified = classifyError(err);
      emit({
        type: "error",
        error: classified.error,
        message: classified.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  await tick();
  timer = setInterval(tick, intervalMs);
}

// ---------------------------------------------------------------------------
// Subcommand: funding
// ---------------------------------------------------------------------------

async function streamFunding(opts: {
  symbol?: string;
  interval?: number;
}): Promise<void> {
  const intervalMs = opts.interval ?? DEFAULT_FUNDING_INTERVAL_MS;

  let client: PacificaClient | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  registerShutdown(() => {
    if (timer) clearInterval(timer);
  });

  try {
    const config = await loadConfig();
    const signer = createSignerFromConfig(config);
    client = new PacificaClient({ network: config.network, signer });
  } catch (err) {
    writeError(classifyError(err), false);
    process.exit(1);
  }

  const tick = async () => {
    try {
      const [markets, positions] = await Promise.all([
        client!.getMarkets(),
        client!.getPositions().catch(() => []),
      ]);

      const timestamp = new Date().toISOString();

      // Build position map for payment estimation
      const posMap = new Map<string, { amount: number; fundingRate: number }>();
      for (const p of positions) {
        posMap.set(p.symbol, { amount: p.amount, fundingRate: 0 });
      }

      for (const m of markets) {
        if (opts.symbol && m.symbol !== opts.symbol.toUpperCase()) continue;

        const pos = posMap.get(m.symbol);
        // Estimate 8h funding payment if position exists: rate * notional
        const paymentUsd =
          pos
            ? Math.abs(m.fundingRate * pos.amount * m.markPrice)
            : 0;

        emit({
          type: "funding",
          symbol: m.symbol,
          funding_rate: m.fundingRate,
          payment_usd: paymentUsd,
          timestamp,
        });
      }
    } catch (err) {
      const classified = classifyError(err);
      emit({
        type: "error",
        error: classified.error,
        message: classified.message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  await tick();
  timer = setInterval(tick, intervalMs);
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createStreamCommand(): Command {
  const stream = new Command("stream")
    .description("Stream market data as NDJSON to stdout (Ctrl-C to stop)");

  // -- prices ----------------------------------------------------------------
  stream
    .command("prices")
    .description("Stream mark price, index price, and funding rate per tick")
    .option("--symbol <sym>", "Filter to a single market symbol (e.g. ETH-USDC-PERP)")
    .option("--interval <ms>", "Poll interval in milliseconds", parseInt)
    .action(async (opts: { symbol?: string; interval?: number }) => {
      try {
        await streamPrices(opts);
      } catch (err) {
        writeError(classifyError(err), false);
        process.exit(1);
      }
    });

  // -- positions -------------------------------------------------------------
  stream
    .command("positions")
    .description("Stream open positions with live unrealized PnL per tick")
    .option("--interval <ms>", "Poll interval in milliseconds", parseInt)
    .action(async (opts: { interval?: number }) => {
      try {
        await streamPositions(opts);
      } catch (err) {
        writeError(classifyError(err), false);
        process.exit(1);
      }
    });

  // -- funding ---------------------------------------------------------------
  stream
    .command("funding")
    .description("Stream funding rates and estimated payment per tick")
    .option("--symbol <sym>", "Filter to a single market symbol (e.g. ETH-USDC-PERP)")
    .option("--interval <ms>", "Poll interval in milliseconds", parseInt)
    .action(async (opts: { symbol?: string; interval?: number }) => {
      try {
        await streamFunding(opts);
      } catch (err) {
        writeError(classifyError(err), false);
        process.exit(1);
      }
    });

  return stream;
}
