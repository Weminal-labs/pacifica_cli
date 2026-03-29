// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Heatmap Command
// ---------------------------------------------------------------------------
// Visualize position risk with ASCII heatmaps in the terminal.
//
// Usage:
//   pacifica heatmap            -- Full position heatmap with bars
//   pacifica heatmap --compact  -- One-line-per-position compact view
// ---------------------------------------------------------------------------

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSigner } from "../../core/sdk/signer.js";
import type { Position, Market, Account } from "../../core/sdk/types.js";
import {
  theme,
  formatPrice,
  formatPnl,
  formatPercent,
  formatAmount,
} from "../theme.js";
import {
  calculatePositionRisk,
  calculateRiskSummary,
  type PositionRisk,
  type RiskSummary,
} from "../../core/risk/calculator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default bar width in characters. */
const DEFAULT_BAR_WIDTH = 50;

/** Padding to reserve for labels on each side of the bar. */
const BAR_LABEL_PADDING = 20;

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createHeatmapCommand(): Command {
  const heatmap = new Command("heatmap")
    .description("Visualize position risk with ASCII heatmaps")
    .option("--compact", "One-line compact view")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      await showHeatmap({ ...opts, ...globalOpts });
    });

  return heatmap;
}

// ---------------------------------------------------------------------------
// Main heatmap logic
// ---------------------------------------------------------------------------

interface HeatmapOptions {
  compact?: boolean;
  json?: boolean;
  testnet?: boolean;
}

async function showHeatmap(opts: HeatmapOptions): Promise<void> {
  const config = await loadConfig();
  const network = opts.testnet ? ("testnet" as const) : config.network;
  const signer = createSigner(config.private_key);
  const client = new PacificaClient({ network, signer });

  try {
    const [positions, markets, account] = await Promise.all([
      client.getPositions(),
      client.getMarkets(),
      client.getAccount(),
    ]);

    // Build mark-price lookup
    const markPriceMap = new Map<string, number>();
    for (const m of markets) {
      markPriceMap.set(m.symbol, m.markPrice);
    }

    const summary = calculateRiskSummary(positions, markets, account);

    // --json: structured risk data output
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    // No positions
    if (positions.length === 0) {
      console.log(theme.muted("No open positions."));
      return;
    }

    if (opts.compact) {
      renderCompactView(summary);
    } else {
      renderFullView(summary, positions, markPriceMap);
    }
  } catch (err) {
    handleError(err);
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Full view rendering
// ---------------------------------------------------------------------------

function renderFullView(
  summary: RiskSummary,
  positions: Position[],
  markPriceMap: Map<string, number>,
): void {
  console.log();
  console.log(theme.header("Position Heatmap"));
  console.log(theme.muted("\u2550".repeat(16)));

  const barWidth = getBarWidth();

  for (const risk of summary.positions) {
    const position = positions.find((p) => p.symbol === risk.symbol)!;
    const markPrice = markPriceMap.get(position.symbol) ?? position.entryPrice;

    console.log();
    renderPositionHeader(risk);
    renderPriceBar(position, markPrice, barWidth);
  }

  console.log();
  renderRiskSummary(summary);
  console.log();
}

/**
 * Render the one-line header for a position in the full view.
 *
 * Format: ETH  LONG  0.5 ETH  5x  PnL: +$21.00 (+0.55%)
 */
function renderPositionHeader(risk: PositionRisk): void {
  const sideLabel =
    risk.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");

  const leverageLabel = theme.muted(`${risk.leverage}x`);
  const pnlLabel = `PnL: ${formatPnl(risk.pnlUsd)} (${formatPercent(risk.pnlPercent)})`;

  console.log(
    `${theme.emphasis(risk.symbol)}  ${sideLabel}  ${formatAmount(risk.size)} ${risk.symbol}  ${leverageLabel}  ${pnlLabel}`,
  );
}

/**
 * Render the ASCII price bar for a single position.
 *
 * The bar maps a price range onto a fixed number of characters. Key price
 * levels (LIQ, ENTRY, NOW, TP) are placed proportionally. The bar is
 * colored in three zones:
 *   - Red  (danger zone):  between liquidation and entry
 *   - Green (safe zone):   between entry and take-profit direction
 *   - Yellow (current):    a small region around the current price
 */
function renderPriceBar(
  position: Position,
  markPrice: number,
  barWidth: number,
): void {
  // Collect key price levels
  const liqPrice = position.liquidationPrice;
  const entryPrice = position.entryPrice;

  // We don't have TP/SL from positions data, so we estimate boundaries.
  // Use liq price, entry price, and mark price to build the range.
  const priceLevels: number[] = [entryPrice, markPrice];
  if (liqPrice !== undefined && liqPrice > 0) {
    priceLevels.push(liqPrice);
  }

  const minLevel = Math.min(...priceLevels);
  const maxLevel = Math.max(...priceLevels);

  // Expand range by 5% on each side for visual padding
  const rangePadding = (maxLevel - minLevel) * 0.05 || maxLevel * 0.02;
  const rangeMin = minLevel - rangePadding;
  const rangeMax = maxLevel + rangePadding;
  const rangeSpan = rangeMax - rangeMin;

  // Map a price to a bar position (0-based index)
  const toBarPos = (price: number): number => {
    if (rangeSpan === 0) return Math.floor(barWidth / 2);
    const ratio = (price - rangeMin) / rangeSpan;
    return Math.max(0, Math.min(barWidth - 1, Math.round(ratio * (barWidth - 1))));
  };

  const entryPos = toBarPos(entryPrice);
  const nowPos = toBarPos(markPrice);
  const liqPos = liqPrice !== undefined && liqPrice > 0 ? toBarPos(liqPrice) : -1;

  // Build the bar character by character
  const barChars: string[] = [];
  for (let i = 0; i < barWidth; i++) {
    barChars.push(colorBarChar(i, entryPos, nowPos, liqPos, position.side));
  }

  // Build the price label line above the bar
  const labelLine = buildLabelLine(
    barWidth,
    entryPrice,
    markPrice,
    liqPrice,
    entryPos,
    nowPos,
    liqPos,
  );

  // Build the marker label line below (LIQ, ENTRY, NOW)
  const markerLine = buildMarkerLine(
    barWidth,
    entryPos,
    nowPos,
    liqPos,
    liqPrice !== undefined && liqPrice > 0,
  );

  console.log(labelLine);
  console.log(markerLine);
  console.log(barChars.join(""));
}

/**
 * Determine the colored character for a given bar position.
 *
 * For a LONG position:
 *   - liq is below entry, danger zone is liq..entry
 *   - safe zone is entry..beyond
 *
 * For a SHORT position:
 *   - liq is above entry, danger zone is entry..liq
 *   - safe zone is below..entry
 */
function colorBarChar(
  i: number,
  entryPos: number,
  nowPos: number,
  liqPos: number,
  side: "long" | "short",
): string {
  // Current price marker zone: 1 char on each side of now
  if (Math.abs(i - nowPos) <= 1) {
    return chalk.yellow("\u2593");
  }

  if (side === "long") {
    // Long: liq is to the left of entry
    if (liqPos >= 0 && i >= liqPos && i < entryPos) {
      return chalk.red("\u2591");
    }
    if (i >= entryPos) {
      return chalk.green("\u2588");
    }
    // Outside known range
    return chalk.red("\u2591");
  } else {
    // Short: liq is to the right of entry
    if (liqPos >= 0 && i > entryPos && i <= liqPos) {
      return chalk.red("\u2591");
    }
    if (i <= entryPos) {
      return chalk.green("\u2588");
    }
    // Outside known range
    return chalk.red("\u2591");
  }
}

/**
 * Build the price labels line positioned above the bar.
 */
function buildLabelLine(
  barWidth: number,
  entryPrice: number,
  markPrice: number,
  liqPrice: number | undefined,
  entryPos: number,
  nowPos: number,
  liqPos: number,
): string {
  // We place labels at their bar positions. Labels can overlap so we do a
  // simple left-to-right placement that skips if there is not enough room.
  interface Label {
    pos: number;
    text: string;
  }

  const labels: Label[] = [];

  if (liqPrice !== undefined && liqPrice > 0 && liqPos >= 0) {
    labels.push({ pos: liqPos, text: formatPrice(liqPrice) });
  }
  labels.push({ pos: entryPos, text: formatPrice(entryPrice) });
  labels.push({ pos: nowPos, text: formatPrice(markPrice) });

  // Sort by position
  labels.sort((a, b) => a.pos - b.pos);

  return placeLabelsSafely(labels, barWidth);
}

/**
 * Build the marker line (LIQ, ENTRY, NOW) below the bar.
 */
function buildMarkerLine(
  barWidth: number,
  entryPos: number,
  nowPos: number,
  liqPos: number,
  hasLiq: boolean,
): string {
  interface Label {
    pos: number;
    text: string;
  }

  const labels: Label[] = [];

  if (hasLiq && liqPos >= 0) {
    labels.push({ pos: liqPos, text: chalk.red("LIQ") });
  }
  labels.push({ pos: entryPos, text: theme.muted("ENTRY") });
  labels.push({ pos: nowPos, text: chalk.yellow("\u25BC NOW") });

  labels.sort((a, b) => a.pos - b.pos);

  return placeLabelsSafely(labels, barWidth);
}

/**
 * Place labels on a fixed-width line, adjusting positions to avoid overlap.
 * Each label is positioned as close to its target as possible without
 * colliding with previously placed labels.
 */
function placeLabelsSafely(
  labels: { pos: number; text: string }[],
  lineWidth: number,
): string {
  // We work with visible character widths to handle ANSI codes in labels.
  const line = new Array(lineWidth).fill(" ");
  let cursor = 0; // tracks the next available column

  for (const label of labels) {
    const visibleLen = stripAnsi(label.text).length;
    // Place at label.pos but no earlier than cursor, and clamp to fit
    let startCol = Math.max(label.pos, cursor);
    if (startCol + visibleLen > lineWidth) {
      startCol = Math.max(0, lineWidth - visibleLen);
    }

    // We write the visible text into the character array. Since the label
    // may contain ANSI codes we insert the full string at startCol.
    // First, clear the region then splice in the raw string.
    // (For simplicity, we build the final string by layering.)
    line[startCol] = label.text;
    // blank out positions occupied by this label's visible chars
    for (let j = startCol + 1; j < startCol + visibleLen && j < lineWidth; j++) {
      line[j] = "";
    }
    cursor = startCol + visibleLen + 1;
  }

  return line.join("");
}

// ---------------------------------------------------------------------------
// Compact view rendering
// ---------------------------------------------------------------------------

function renderCompactView(summary: RiskSummary): void {
  console.log();
  console.log(theme.header("Position Heatmap (compact)"));
  console.log(theme.muted("\u2500".repeat(26)));
  console.log();

  // Column headers
  const headerLine = formatCompactRow(
    "Symbol",
    "Side",
    "PnL",
    "LiqDist",
    "Risk",
  );
  console.log(theme.muted(headerLine));

  for (const risk of summary.positions) {
    const sideLabel =
      risk.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");

    const pnlLabel = formatPnl(risk.pnlUsd);

    const liqDistLabel =
      risk.liqDistancePercent !== undefined
        ? colorByRiskLevel(
            `${risk.liqDistancePercent.toFixed(1)}%`,
            risk.riskLevel,
          )
        : theme.muted("\u2014");

    const riskBar = renderCompactBar(risk, 20);

    const row = formatCompactRow(
      risk.symbol,
      sideLabel,
      pnlLabel,
      liqDistLabel,
      riskBar,
    );
    console.log(row);
  }

  // Summary line
  console.log();
  console.log(
    theme.muted(
      `${summary.totalPositions} position${summary.totalPositions !== 1 ? "s" : ""}`,
    ) +
      "  " +
      `Total PnL: ${formatPnl(summary.totalPnl)}`,
  );
  console.log();
}

/**
 * Render a compact 20-char bar showing how close the position is to
 * liquidation vs. being in profit.
 *
 * The bar fills based on how far the current price is from liquidation
 * relative to the entry-to-liquidation distance. A fuller green bar means
 * the position is healthier.
 */
function renderCompactBar(risk: PositionRisk, width: number): string {
  if (
    risk.liqDistancePercent === undefined ||
    risk.liquidationPrice === undefined ||
    risk.liquidationPrice <= 0
  ) {
    // No liquidation data -- show a neutral gray bar
    return theme.muted("\u2591".repeat(width));
  }

  // Calculate the health ratio:
  // distance from liq to mark / distance from liq to entry
  const liqToEntry = Math.abs(risk.entryPrice - risk.liquidationPrice);
  const liqToMark = Math.abs(risk.markPrice - risk.liquidationPrice);

  // If liqToEntry is 0 (unlikely), avoid division by zero
  if (liqToEntry === 0) {
    return theme.muted("\u2591".repeat(width));
  }

  // Ratio > 1 means mark has moved beyond entry (in profit for the
  // position's direction). Clamp to [0, 2] for bar display purposes.
  const healthRatio = Math.min(liqToMark / liqToEntry, 2.0);
  const filledChars = Math.round((healthRatio / 2.0) * width);
  const emptyChars = width - filledChars;

  // Color the filled portion based on risk level
  let filledColor: (s: string) => string;
  if (risk.riskLevel === "danger") {
    filledColor = chalk.red;
  } else if (risk.riskLevel === "watch") {
    filledColor = chalk.yellow;
  } else {
    filledColor = chalk.green;
  }

  return (
    filledColor("\u2588".repeat(filledChars)) +
    theme.muted("\u2591".repeat(emptyChars))
  );
}

/**
 * Format a compact-view row with fixed-width columns.
 */
function formatCompactRow(
  symbol: string,
  side: string,
  pnl: string,
  liqDist: string,
  risk: string,
): string {
  return (
    "  " +
    pad(symbol, 9) +
    pad(side, 9) +
    pad(pnl, 14) +
    pad(liqDist, 10) +
    risk
  );
}

// ---------------------------------------------------------------------------
// Risk summary rendering (full view)
// ---------------------------------------------------------------------------

function renderRiskSummary(summary: RiskSummary): void {
  console.log(theme.label("Risk Summary"));
  console.log(theme.muted("\u2500".repeat(12)));

  // Closest to liquidation
  if (summary.closestToLiq) {
    const distText = colorByRiskLevel(
      `${summary.closestToLiq.distance.toFixed(1)}%`,
      riskLevelFromDistance(summary.closestToLiq.distance),
    );
    console.log(
      `  Closest to liquidation:  ${theme.emphasis(summary.closestToLiq.symbol)} (${distText})`,
    );
  } else {
    console.log(
      `  Closest to liquidation:  ${theme.muted("\u2014")}`,
    );
  }

  // Margin health
  const marginColor =
    summary.marginUsedPercent > 80
      ? theme.loss
      : summary.marginUsedPercent > 50
        ? theme.warning
        : theme.profit;
  console.log(
    `  Margin health:           ${marginColor(`${summary.marginUsedPercent.toFixed(1)}% used`)}`,
  );

  // Total unrealized PnL
  console.log(
    `  Total unrealized PnL:    ${formatPnl(summary.totalPnl)}`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the available bar width based on terminal size.
 */
function getBarWidth(): number {
  const cols = process.stdout.columns ?? 80;
  return Math.max(20, Math.min(cols - BAR_LABEL_PADDING, DEFAULT_BAR_WIDTH));
}

/**
 * Color text based on risk level.
 */
function colorByRiskLevel(
  text: string,
  level: "ok" | "watch" | "danger",
): string {
  switch (level) {
    case "danger":
      return theme.loss(text);
    case "watch":
      return theme.warning(text);
    case "ok":
      return theme.profit(text);
  }
}

/**
 * Derive a risk level from a liquidation distance percentage.
 */
function riskLevelFromDistance(
  distance: number,
): "ok" | "watch" | "danger" {
  if (distance < 5) return "danger";
  if (distance < 10) return "watch";
  return "ok";
}

/**
 * Right-pad a string to `width`, accounting for invisible ANSI escape codes.
 */
function pad(text: string, width: number): string {
  const visible = stripAnsi(text);
  const padding = Math.max(0, width - visible.length);
  return text + " ".repeat(padding);
}

/**
 * Strip ANSI escape sequences so we can measure the visible character width.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Print a user-friendly error message and set a non-zero exit code.
 */
function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(theme.error(`Error: ${message}`));
  process.exitCode = 1;
}
