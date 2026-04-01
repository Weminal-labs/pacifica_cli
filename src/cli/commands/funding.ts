// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Funding Rate Commands
// ---------------------------------------------------------------------------
// `pacifica funding` - Show Pacifica funding rates for all markets
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme, formatFundingRate } from "../theme.js";

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
        const signer = createSignerFromConfig(config);
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

