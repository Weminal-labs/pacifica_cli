// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Trade Simulator
// ---------------------------------------------------------------------------
// `pacifica simulate <side> <market> <size> [--leverage <n>] [--entry <price>]`
//
// Pure-math P&L and liquidation calculator. Fetches current market price and
// funding rate; all remaining calculations are local. No signing required.
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { loadPatterns } from "../../core/intelligence/store.js";
import { scanForActiveSignals } from "../../core/intelligence/engine.js";
import { theme, formatPrice } from "../theme.js";

// ---------------------------------------------------------------------------
// Helpers — ANSI-safe padding
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function vLen(s: string): number { return s.replace(ANSI_RE, "").length; }
function padR(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? s + " ".repeat(e) : s; }
function padL(s: string, w: number): string { const e = w - vLen(s); return e > 0 ? " ".repeat(e) + s : s; }

// ---------------------------------------------------------------------------
// Liquidation math (isolated margin, standard 0.5% maintenance margin rate)
// ---------------------------------------------------------------------------

const MAINTENANCE_MARGIN_RATE = 0.005; // 0.5%

function liquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
): number {
  if (side === "long") {
    return entryPrice * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE);
  }
  return entryPrice * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);
}

function pnlAtPrice(
  side: "long" | "short",
  entryPrice: number,
  targetPrice: number,
  sizeUsd: number,
): number {
  if (entryPrice === 0) return 0;
  const priceDelta = side === "long"
    ? (targetPrice - entryPrice) / entryPrice
    : (entryPrice - targetPrice) / entryPrice;
  return priceDelta * sizeUsd;
}

function marginPct(pnl: number, margin: number): string {
  if (margin === 0) return "—";
  const pct = (pnl / margin) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% of margin`;
}

// ---------------------------------------------------------------------------
// Normalize market symbol
// ---------------------------------------------------------------------------

function normalizeSymbol(raw: string): string {
  const up = raw.toUpperCase();
  if (up.includes("-USDC-PERP")) return up;
  if (up.includes("-PERP")) return up.replace("-PERP", "-USDC-PERP");
  return `${up}-USDC-PERP`;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createSimulateCommand(): Command {
  const cmd = new Command("simulate")
    .description("Simulate a trade: liquidation level, P&L scenarios, funding cost")
    .argument("<side>", "Trade direction: long or short")
    .argument("<market>", "Market symbol, e.g. ETH or ETH-USDC-PERP")
    .argument("<size>", "Position size in USD (notional value)")
    .option("--leverage <n>", "Leverage multiplier", "5")
    .option("--entry <price>", "Override entry price (default: current mark price)")
    .option("--json", "Output JSON")
    .action(async (sideRaw: string, marketRaw: string, sizeRaw: string, opts: {
      leverage: string;
      entry?: string;
      json?: boolean;
    }) => {
      let client: PacificaClient | undefined;
      try {
        // ── Validate inputs ────────────────────────────────────────────────
        const side = sideRaw.toLowerCase();
        if (side !== "long" && side !== "short") {
          throw new Error(`Side must be "long" or "short", got "${sideRaw}"`);
        }

        const symbol = normalizeSymbol(marketRaw);
        const notionalUsd = parseFloat(sizeRaw);
        if (isNaN(notionalUsd) || notionalUsd <= 0) {
          throw new Error(`Size must be a positive number, got "${sizeRaw}"`);
        }

        const leverage = parseFloat(opts.leverage);
        if (isNaN(leverage) || leverage < 1 || leverage > 100) {
          throw new Error(`Leverage must be 1–100, got "${opts.leverage}"`);
        }

        // ── Fetch live market data ─────────────────────────────────────────
        process.stdout.write(theme.muted("Fetching market data...\r"));
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const markets = await client.getMarkets();
        // API returns bare symbols (e.g. "SOL") — match by base OR full symbol
        const base = symbol.replace(/-USDC-PERP$/, "").replace(/-PERP$/, "");
        const market = markets.find(
          (m) => m.symbol === symbol || m.symbol === base || m.symbol === `${base}-USDC-PERP`,
        );
        if (!market) {
          throw new Error(`Market "${base}" not found. Available: ${markets.slice(0, 8).map((m) => m.symbol).join(", ")}…`);
        }
        process.stdout.write("                                \r"); // clear

        const entryPrice = opts.entry ? parseFloat(opts.entry) : (market.markPrice || market.price);
        if (isNaN(entryPrice) || entryPrice <= 0) {
          throw new Error(`Could not determine entry price. Use --entry <price>`);
        }

        const fundingRate = market.fundingRate; // raw decimal (e.g. -0.000021)
        const marginUsd = notionalUsd / leverage;

        // ── Calculations ────────────────────────────────────────────────────
        const liqPrice = liquidationPrice(side as "long" | "short", entryPrice, leverage);
        const liqPct = ((liqPrice - entryPrice) / entryPrice) * 100;

        const scenarios = [
          { label: "-20%", factor: -0.20 },
          { label: "-10%", factor: -0.10 },
          { label:  "-5%", factor: -0.05 },
          { label:  "+5%", factor:  0.05 },
          { label: "+10%", factor:  0.10 },
          { label: "+20%", factor:  0.20 },
        ];

        const pnlScenarios = scenarios.map(({ label, factor }) => {
          const targetPrice = entryPrice * (1 + factor);
          const pnl = pnlAtPrice(side as "long" | "short", entryPrice, targetPrice, notionalUsd);
          return { label, targetPrice, pnl };
        });

        // Funding cost projections (negative = you pay, positive = you earn)
        // For long: you pay if funding > 0, earn if funding < 0
        // For short: reversed
        const rawFundingImpact = side === "long" ? -fundingRate : fundingRate;
        const fundingPerInterval = rawFundingImpact * notionalUsd; // per 8h interval
        const funding8h  = fundingPerInterval;
        const funding24h = fundingPerInterval * 3;
        const funding7d  = fundingPerInterval * 3 * 7;

        // ── Intelligence signal check ────────────────────────────────────────
        let signalTip: string | undefined;
        try {
          const patterns = await loadPatterns();
          if (patterns.length > 0) {
            const signals = await scanForActiveSignals(client, patterns);
            const match = signals.find((s) =>
              s.asset === symbol && s.direction === side,
            );
            if (match) {
              signalTip = `Matches "${match.pattern.name}" (${(match.pattern.win_rate * 100).toFixed(1)}% win rate, n=${match.pattern.sample_size})`;
            }
          }
        } catch {
          // intelligence is optional — silent skip
        }

        // ── JSON output ──────────────────────────────────────────────────────
        if (opts.json) {
          console.log(JSON.stringify({
            market: symbol, side, notional_usd: notionalUsd, leverage,
            entry_price: entryPrice, liquidation_price: liqPrice, margin_usd: marginUsd,
            funding_rate: fundingRate, funding_8h: funding8h, funding_24h: funding24h, funding_7d: funding7d,
            scenarios: pnlScenarios, signal_tip: signalTip ?? null,
          }, null, 2));
          return;
        }

        // ── Formatted output ─────────────────────────────────────────────────
        const displayBase = symbol.replace("-USDC-PERP", "").replace("-USDC", "");
        const dirStr = side === "long" ? "LONG ↑" : "SHORT ↓";
        const dirColored = side === "long" ? theme.profit(dirStr) : theme.loss(dirStr);
        const width = 62;
        const divider = theme.muted("─".repeat(width));

        console.log();
        console.log(theme.header(`  Trade Simulation — ${dirColored} ${displayBase}-USDC-PERP`));
        console.log(divider);

        // Position summary
        const W1 = 20; const W2 = 18;
        const row = (label: string, value: string) =>
          `  ${padR(theme.muted(label), W1)}  ${value}`;

        console.log(row("Size (notional):", theme.emphasis(`$${notionalUsd.toLocaleString()}`)));
        console.log(row("Leverage:",        theme.emphasis(`${leverage}x`)));
        console.log(row("Margin required:", theme.label(`$${marginUsd.toFixed(2)}`)));
        console.log(row("Entry price:",     formatPrice(entryPrice)));

        const liqPctStr = `${liqPct >= 0 ? "+" : ""}${liqPct.toFixed(1)}%`;
        const liqColored = side === "long" ? theme.loss(formatPrice(liqPrice)) : theme.profit(formatPrice(liqPrice));
        console.log(row("Liquidation:",     `${liqColored}  ${theme.muted("(" + liqPctStr + ")")}`));

        console.log(divider);
        console.log(theme.label(`  P&L scenarios`));
        console.log(divider);

        for (const { label, targetPrice, pnl } of pnlScenarios) {
          const priceStr = padR(formatPrice(targetPrice), W1);
          const changeStr = padR(theme.muted(label), 6);
          const pnlStr = pnl >= 0 ? theme.profit(`+$${pnl.toFixed(2)}`) : theme.loss(`-$${Math.abs(pnl).toFixed(2)}`);
          const marginStr = theme.muted(marginPct(pnl, marginUsd));
          console.log(`  ${changeStr}  ${priceStr}  ${padR(pnlStr, 14)}  ${marginStr}`);
        }

        console.log(divider);
        console.log(theme.label(`  Funding cost (rate: ${(fundingRate * 100).toFixed(4)}%/8h)`));
        console.log(divider);

        const fmtFunding = (f: number) => {
          const sign = f >= 0 ? "+" : "";
          const colored = f >= 0 ? theme.profit(`${sign}$${f.toFixed(2)}`) : theme.loss(`${sign}$${f.toFixed(2)}`);
          return colored;
        };

        const earn = fundingPerInterval >= 0
          ? theme.muted("← you earn")
          : theme.muted("← you pay");

        console.log(`  ${padR(theme.muted("8 hours:"),  12)}  ${padL(fmtFunding(funding8h),  10)}  ${earn}`);
        console.log(`  ${padR(theme.muted("24 hours:"), 12)}  ${padL(fmtFunding(funding24h), 10)}`);
        console.log(`  ${padR(theme.muted("7 days:"),   12)}  ${padL(fmtFunding(funding7d),  10)}`);

        if (signalTip) {
          console.log(divider);
          console.log(`  ${theme.profit("✓")} ${theme.emphasis("Intelligence signal:")} ${theme.muted(signalTip)}`);
        }

        console.log(divider);
        console.log(
          theme.muted(`  Hint: `) +
          theme.label(`pacifica trade --market ${symbol} --side ${side === "long" ? "buy" : "sell"} --size ${notionalUsd / entryPrice} --leverage ${leverage}`),
        );
        console.log();

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${message}\n`));
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });

  return cmd;
}
