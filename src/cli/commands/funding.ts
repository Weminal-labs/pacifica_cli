// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Funding Rate Commands
// ---------------------------------------------------------------------------
// `pacifica funding`     - Show Pacifica funding rates for all markets
// `pacifica funding-arb` - Compare funding rates across Pacifica/Binance/Bybit
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSigner } from "../../core/sdk/signer.js";
import { getBinanceFundingRates } from "../../core/funding/binance.js";
import { getBybitFundingRates } from "../../core/funding/bybit.js";
import { toBinanceSymbolFallback, toBybitSymbolFallback } from "../../core/funding/symbol-map.js";
import { theme, formatFundingRate } from "../theme.js";
import type { Market } from "../../core/sdk/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function colorRate(rate: number): string {
  const formatted = formatFundingRate(rate);
  if (rate > 0.01) return theme.profit(formatted);
  if (rate < -0.01) return theme.loss(formatted);
  return theme.muted(formatted);
}

function formatCountdown(isoString: string): string {
  try {
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return "now";
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m`;
  } catch {
    return "N/A";
  }
}

// ---------------------------------------------------------------------------
// pacifica funding
// ---------------------------------------------------------------------------

export function createFundingCommand(): Command {
  return new Command("funding")
    .description("Show funding rates for all Pacifica markets")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        const signer = createSigner(config.private_key);
        client = new PacificaClient({ network: config.network, signer });

        const markets = await client.getMarkets();

        if (opts.json) {
          const data = markets.map((m) => ({
            symbol: m.symbol,
            fundingRate: m.fundingRate,
            nextFundingRate: m.nextFundingRate,
            price: m.price,
          }));
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (markets.length === 0) {
          console.log(theme.muted("No markets found."));
          return;
        }

        // Sort by absolute funding rate descending
        const sorted = [...markets].sort(
          (a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate),
        );

        console.log();
        console.log(theme.header("Pacifica Funding Rates"));
        console.log(theme.muted("─".repeat(68)));

        // Header
        console.log(
          `  ${pad("Symbol", 10)} ${padLeft("Current", 12)} ${padLeft("Predicted", 12)} ${padLeft("APR (8h)", 12)} ${padLeft("Price", 14)}`,
        );
        console.log(theme.muted("  " + "─".repeat(62)));

        for (const m of sorted) {
          const apr = m.fundingRate * 3 * 365; // 8h funding = 3x daily
          const aprStr = apr >= 0 ? `+${apr.toFixed(1)}%` : `${apr.toFixed(1)}%`;
          const aprColor = apr > 10
            ? theme.profit(aprStr)
            : apr < -10
              ? theme.loss(aprStr)
              : theme.muted(aprStr);

          console.log(
            `  ${pad(m.symbol, 10)} ${padLeft(colorRate(m.fundingRate), 23)} ${padLeft(colorRate(m.nextFundingRate), 23)} ${padLeft(aprColor, 23)} ${padLeft("$" + m.price.toLocaleString("en-US", { maximumFractionDigits: 2 }), 14)}`,
          );
        }

        console.log();
        console.log(theme.muted("  Rates are 8-hourly. APR = rate x 3 x 365."));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// pacifica funding-arb
// ---------------------------------------------------------------------------

export function createFundingArbCommand(): Command {
  return new Command("funding-arb")
    .description("Compare funding rates across Pacifica, Binance, and Bybit")
    .option("--json", "Output raw JSON")
    .option("--min-spread <n>", "Minimum spread to show (%)", parseFloat)
    .action(async (opts: { json?: boolean; minSpread?: number }) => {
      let client: PacificaClient | undefined;

      try {
        const config = await loadConfig();
        const signer = createSigner(config.private_key);
        client = new PacificaClient({ network: config.network, signer });

        // 1. Fetch all in parallel
        const markets = await client.getMarkets();

        const binanceSymbols = markets.map((m) => toBinanceSymbolFallback(m.symbol));
        const bybitSymbols = markets.map((m) => toBybitSymbolFallback(m.symbol));

        const [binanceRates, bybitRates] = await Promise.all([
          getBinanceFundingRates(binanceSymbols),
          getBybitFundingRates(bybitSymbols),
        ]);

        // 2. Build comparison rows
        const rows = buildArbRows(markets, binanceRates, bybitRates);

        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        // 3. Filter by min spread
        const minSpread = opts.minSpread ?? 0;
        const filtered = rows.filter((r) => Math.abs(r.bestSpread) >= minSpread);

        if (filtered.length === 0) {
          console.log(theme.muted("No arbitrage opportunities found."));
          return;
        }

        // Sort by absolute spread descending
        filtered.sort((a, b) => Math.abs(b.bestSpread) - Math.abs(a.bestSpread));

        console.log();
        console.log(theme.header("Funding Rate Arbitrage Scanner"));
        console.log(theme.muted("─".repeat(90)));

        // Header
        console.log(
          `  ${pad("Symbol", 8)} ${padLeft("Pacifica", 10)} ${padLeft("Binance", 10)} ${padLeft("Bybit", 10)} ${padLeft("Best Spread", 12)} ${padLeft("APR", 10)} ${pad("Signal", 18)}`,
        );
        console.log(theme.muted("  " + "─".repeat(80)));

        for (const row of filtered) {
          const pacRate = row.pacificaRate !== null ? colorRate(row.pacificaRate) : theme.muted("N/A".padStart(8));
          const binRate = row.binanceRate !== null ? colorRate(row.binanceRate) : theme.muted("N/A".padStart(8));
          const bybRate = row.bybitRate !== null ? colorRate(row.bybitRate) : theme.muted("N/A".padStart(8));

          const spreadStr = formatFundingRate(row.bestSpread);
          const spreadColor = Math.abs(row.bestSpread) >= 0.02
            ? theme.emphasis(spreadStr)
            : theme.muted(spreadStr);

          const aprStr = `${row.apr >= 0 ? "+" : ""}${row.apr.toFixed(1)}%`;
          const aprColor = Math.abs(row.apr) >= 20
            ? theme.profit(aprStr)
            : theme.muted(aprStr);

          const signalColor = row.signal.startsWith("LONG")
            ? theme.profit(row.signal)
            : row.signal.startsWith("SHORT")
              ? theme.loss(row.signal)
              : theme.muted(row.signal);

          console.log(
            `  ${pad(row.symbol, 8)} ${padLeft(pacRate, 21)} ${padLeft(binRate, 21)} ${padLeft(bybRate, 21)} ${padLeft(spreadColor, 23)} ${padLeft(aprColor, 21)} ${signalColor}`,
          );
        }

        const actionable = filtered.filter((r) => Math.abs(r.bestSpread) >= 0.02);
        console.log();
        if (actionable.length > 0) {
          console.log(theme.success(`  ${actionable.length} actionable spread${actionable.length === 1 ? "" : "s"} (>0.02%)`));
        }
        console.log(theme.muted("  APR = spread x 3 x 365. Signal shows which direction to trade on Pacifica."));
        console.log();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}

// ---------------------------------------------------------------------------
// Arb row builder
// ---------------------------------------------------------------------------

interface ArbRow {
  symbol: string;
  pacificaRate: number | null;
  binanceRate: number | null;
  bybitRate: number | null;
  bestSpread: number;
  apr: number;
  signal: string;
  bestAgainst: string;
}

function buildArbRows(
  markets: Market[],
  binanceRates: Map<string, { fundingRate: number }>,
  bybitRates: Map<string, { fundingRate: number }>,
): ArbRow[] {
  const rows: ArbRow[] = [];

  for (const market of markets) {
    const pacRate = market.fundingRate;
    const binSymbol = toBinanceSymbolFallback(market.symbol).toUpperCase();
    const bybSymbol = toBybitSymbolFallback(market.symbol).toUpperCase();

    const binData = binanceRates.get(binSymbol);
    const bybData = bybitRates.get(bybSymbol);

    const binRate = binData?.fundingRate ?? null;
    const bybRate = bybData?.fundingRate ?? null;

    // Find the best spread (max absolute difference)
    let bestSpread = 0;
    let bestAgainst = "";

    if (binRate !== null) {
      const spread = pacRate - binRate;
      if (Math.abs(spread) > Math.abs(bestSpread)) {
        bestSpread = spread;
        bestAgainst = "Binance";
      }
    }

    if (bybRate !== null) {
      const spread = pacRate - bybRate;
      if (Math.abs(spread) > Math.abs(bestSpread)) {
        bestSpread = spread;
        bestAgainst = "Bybit";
      }
    }

    // APR = spread x (365 x 3) for 8h funding
    const apr = bestSpread * 3 * 365;

    // Signal: if Pacifica rate is higher, SHORT PAC (pay funding); if lower, LONG PAC (earn funding)
    let signal = "—";
    if (Math.abs(bestSpread) >= 0.005) {
      if (bestSpread > 0) {
        signal = `SHORT PAC/${bestAgainst}`;
      } else {
        signal = `LONG PAC/${bestAgainst}`;
      }
    }

    rows.push({
      symbol: market.symbol,
      pacificaRate: pacRate,
      binanceRate: binRate,
      bybitRate: bybRate,
      bestSpread,
      apr,
      signal,
      bestAgainst,
    });
  }

  return rows;
}
