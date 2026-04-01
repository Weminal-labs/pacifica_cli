// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Terminal Theme & Number Formatting
// ---------------------------------------------------------------------------
// Centralizes all color functions and number formatting so that every
// command renders a consistent, readable terminal UI.
// ---------------------------------------------------------------------------

import chalk from "chalk";

// ---------------------------------------------------------------------------
// Color theme
// ---------------------------------------------------------------------------

export const theme = {
  profit: chalk.green,
  loss: chalk.red,
  warning: chalk.yellow,
  label: chalk.cyan,
  muted: chalk.dim,
  emphasis: chalk.bold.white,
  header: chalk.cyan.bold,
  success: chalk.green.bold,
  error: chalk.red.bold,
} as const;

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

/**
 * Format a price with contextual precision and a $ prefix.
 *
 * - < 1       : 4–6 significant decimals
 * - 1–999     : 2 decimals
 * - >= 1000   : comma-separated, 0–2 decimals
 */
export function formatPrice(n: number): string {
  if (n < 0.0001) {
    return "$" + n.toFixed(6);
  }
  if (n < 1) {
    return "$" + n.toFixed(4);
  }
  if (n < 1000) {
    return "$" + n.toFixed(2);
  }
  // >= 1000: comma-separated with up to 2 decimals, trimming trailing zeros
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return "$" + formatted;
}

// ---------------------------------------------------------------------------
// PnL formatting
// ---------------------------------------------------------------------------

/**
 * Format a PnL value with sign, $ prefix, and color.
 *
 * Examples: +$21.00  -$85.00
 */
export function formatPnl(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n).toFixed(2);
  const text = `${sign}$${abs}`;
  return n >= 0 ? theme.profit(text) : theme.loss(text);
}

// ---------------------------------------------------------------------------
// Percent formatting
// ---------------------------------------------------------------------------

/**
 * Format a percentage with sign and color.
 *
 * Examples: +3.20%  -0.80%
 */
export function formatPercent(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  const abs = Math.abs(n);
  // Clamp display to avoid blowing out column width
  const formatted = abs >= 1000
    ? abs.toFixed(0)
    : abs.toFixed(2);
  const text = `${sign}${formatted}%`;
  return n >= 0 ? theme.profit(text) : theme.loss(text);
}

// ---------------------------------------------------------------------------
// Volume formatting
// ---------------------------------------------------------------------------

/**
 * Format a volume with K/M/B abbreviation and $ prefix.
 *
 * Examples: $890K  $2.1M  $1.5B
 */
export function formatVolume(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return "$" + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + "B";
  }
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return "$" + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + "M";
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return "$" + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + "K";
  }
  return "$" + n.toFixed(0);
}

// ---------------------------------------------------------------------------
// Funding rate formatting
// ---------------------------------------------------------------------------

/**
 * Format a funding rate as a 4-decimal percentage.
 *
 * Example: 0.0120%
 */
export function formatFundingRate(n: number): string {
  // API returns raw decimal (e.g. 0.000015 = 0.0015%), multiply by 100 for display
  const pct = n * 100;
  return pct.toFixed(4) + "%";
}

// ---------------------------------------------------------------------------
// Amount formatting
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount with up to 4 decimals, trimming trailing zeros.
 *
 * Examples: 1.5  0.0023  100
 */
export function formatAmount(n: number): string {
  // toFixed(4) then strip trailing zeros and a trailing decimal point
  return parseFloat(n.toFixed(4)).toString();
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

/**
 * Format a timestamp as relative time or HH:MM:SS.
 *
 * - < 60s    : "Xs ago"
 * - < 60m    : "Xm ago"
 * - < 24h    : "Xh ago"
 * - >= 24h   : HH:MM:SS
 *
 * Accepts ISO 8601 strings, Unix ms numbers, or Unix second numbers.
 */
export function formatTimestamp(ts: string | number): string {
  let date: Date;

  if (typeof ts === "string") {
    date = new Date(ts);
  } else {
    // Heuristic: if the number is small enough to be seconds (before year 2100
    // in seconds ≈ 4.1e9), treat as seconds; otherwise milliseconds.
    date = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
  }

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    // Future timestamp — just show the time
    return formatHMS(date);
  }

  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }

  return formatHMS(date);
}

/**
 * Format a Date as HH:MM:SS (24-hour, zero-padded).
 */
function formatHMS(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
