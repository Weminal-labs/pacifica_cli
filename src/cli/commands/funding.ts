// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Funding Rate Commands
// ---------------------------------------------------------------------------
// `pacifica funding` - Show Pacifica funding rates for all markets
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { theme, formatFundingRate, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Layout helpers — ANSI-safe padding
// ---------------------------------------------------------------------------

// Strip ANSI escape codes to get the visible character count
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visibleLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

// Left-align: pad on the right with spaces (works with colored strings)
function padR(s: string, width: number): string {
  const extra = width - visibleLen(s);
  return extra > 0 ? s + " ".repeat(extra) : s;
}

// Right-align: pad on the left with spaces (works with colored strings)
function padL(s: string, width: number): string {
  const extra = width - visibleLen(s);
  return extra > 0 ? " ".repeat(extra) + s : s;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function colorRate(rate: number): string {
  // rate is a raw decimal from the API (e.g. 0.04 = 4%)
  const pct = rate * 100;
  const sign = pct >= 0 ? "+" : "";
  const text = `${sign}${pct.toFixed(4)}%`;
  if (pct > 0.5)  return theme.profit(text);
  if (pct < -0.5) return theme.loss(text);
  return theme.muted(text);
}

function formatApr(rate: number): string {
  // rate is raw decimal (0.04 = 4%). APR = rate * 3 * 365 gives e.g. 43.8 → display as "43.8%"
  const apr = rate * 3 * 365;
  const sign = apr >= 0 ? "+" : "";
  const text = `${sign}${apr.toFixed(1)}%`;
  if (apr > 5)   return theme.profit(text);
  if (apr < -5)  return theme.loss(text);
  return theme.muted(text);
}

function formatMktPrice(price: number): string {
  if (!price || price === 0) return theme.muted("—");
  return formatPrice(price);
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

        // Sort by absolute APR descending
        const sorted = [...markets].sort(
          (a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate),
        );

        // Column widths (visible characters)
        const W = { sym: 10, rate: 11, pred: 11, apr: 9, price: 12 };
        const totalW = 2 + W.sym + 2 + W.rate + 2 + W.pred + 2 + W.apr + 2 + W.price;

        const divider = theme.muted("─".repeat(totalW));
        const thin    = theme.muted("─".repeat(totalW));

        console.log();
        console.log(theme.header("  Pacifica Funding Rates"));
        console.log(divider);

        // Header row (plain text, no color — so padR/padL work fine)
        const hSym   = padR("Symbol",    W.sym);
        const hRate  = padL("Current",   W.rate);
        const hPred  = padL("Predicted", W.pred);
        const hApr   = padL("APR (8h)", W.apr);
        const hPrice = padL("Price",     W.price);
        console.log(theme.muted(`  ${hSym}  ${hRate}  ${hPred}  ${hApr}  ${hPrice}`));
        console.log(thin);

        for (const m of sorted) {
          const sym   = padR(m.symbol,                  W.sym);
          const rate  = padL(colorRate(m.fundingRate),  W.rate);
          const pred  = padL(colorRate(m.nextFundingRate), W.pred);
          const apr   = padL(formatApr(m.fundingRate),  W.apr);
          const price = padL(formatMktPrice(m.price),   W.price);

          console.log(`  ${sym}  ${rate}  ${pred}  ${apr}  ${price}`);
        }

        console.log(divider);
        console.log(theme.muted("  Rates settle every 8 h. APR = rate × 3 × 365."));
        console.log(theme.muted("  " + theme.profit("■") + " longs pay shorts  " + theme.loss("■") + " shorts pay longs"));
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

