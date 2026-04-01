// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- MarketTable Component
// ---------------------------------------------------------------------------
// DexScreener-inspired terminal UI with box borders, row numbers,
// directional arrows, and information-dense layout.
// ---------------------------------------------------------------------------

import React from "react";
import { Box, Text } from "ink";
import type { Market } from "../../core/sdk/types.js";
import { formatPrice, formatVolume, formatFundingRate } from "../theme.js";

// ---------------------------------------------------------------------------
// Unicode visual elements
// ---------------------------------------------------------------------------

const ARROW_UP = "\u25b2";   // ▲
const ARROW_DOWN = "\u25bc"; // ▼
const DOT = "\u25cf";        // ●
const DIAMOND = "\u25c6";    // ◆
const VLINE = "\u2502";      // │

// ---------------------------------------------------------------------------
// Colors (hex palette matching DexScreener CLI aesthetic)
// ---------------------------------------------------------------------------

const C = {
  border: "#3a3d4a",
  borderDim: "#2a2d3a",
  title: "#e5e7eb",
  label: "#6b7280",
  dim: "#4b5563",
  text: "#d1d5db",
  green: "#4ade80",
  greenBright: "#22c55e",
  red: "#f87171",
  redBright: "#ef4444",
  gold: "#fbbf24",
  cyan: "#67e8f9",
  white: "#f9fafb",
  rowAlt: "#1e2029",
} as const;

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------

const COL_RANK = 5;
const COL_MARKET = 10;
const COL_PRICE = 14;
const COL_CHANGE = 14;
const COL_VOLUME = 12;
const COL_OI = 12;
const COL_FUNDING = 12;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MarketTableProps {
  markets: Market[];
}

// ---------------------------------------------------------------------------
// MarketTable
// ---------------------------------------------------------------------------

export function MarketTable({ markets }: MarketTableProps): React.ReactElement {
  if (markets.length === 0) {
    return (
      <Box marginTop={1}>
        <Text color={C.dim}>No markets available.</Text>
      </Box>
    );
  }

  const totalWidth = COL_RANK + COL_MARKET + COL_PRICE + COL_CHANGE + COL_VOLUME + COL_OI + COL_FUNDING;
  const separator = "\u2500".repeat(totalWidth); // ─

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Box width={COL_RANK}>
          <Text color={C.label} bold> #</Text>
        </Box>
        <Box width={COL_MARKET}>
          <Text color={C.label} bold>Market</Text>
        </Box>
        <Box width={COL_PRICE} justifyContent="flex-end">
          <Text color={C.label} bold>Price</Text>
        </Box>
        <Box width={COL_CHANGE} justifyContent="flex-end">
          <Text color={C.label} bold>24h</Text>
        </Box>
        <Box width={COL_VOLUME} justifyContent="flex-end">
          <Text color={C.label} bold>24h Vol</Text>
        </Box>
        <Box width={COL_OI} justifyContent="flex-end">
          <Text color={C.label} bold>OI</Text>
        </Box>
        <Box width={COL_FUNDING} justifyContent="flex-end">
          <Text color={C.label} bold>Funding</Text>
        </Box>
      </Box>

      {/* Separator */}
      <Text color={C.border}>{separator}</Text>

      {/* Data rows */}
      {markets.map((market, i) => (
        <MarketRow key={market.symbol} market={market} rank={i + 1} alt={i % 2 === 1} />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MarketRow
// ---------------------------------------------------------------------------

function MarketRow({ market, rank, alt }: { market: Market; rank: number; alt: boolean }): React.ReactElement {
  const pctStyle = getPctStyle(market.change24h);
  const arrow = market.change24h >= 0 ? ARROW_UP : ARROW_DOWN;
  const fundingPct = market.fundingRate * 100;
  const fundingStyle = getFundingStyle(market.fundingRate);

  return (
    <Box>
      {/* Rank */}
      <Box width={COL_RANK}>
        <Text color={rank <= 3 ? C.gold : C.dim}>
          {rank <= 3 ? `${DIAMOND} ${rank}` : ` ${rank}`}
        </Text>
      </Box>

      {/* Symbol */}
      <Box width={COL_MARKET}>
        <Text bold color={C.gold}>{market.symbol}</Text>
      </Box>

      {/* Price */}
      <Box width={COL_PRICE} justifyContent="flex-end">
        <Text color={C.text}>{formatPrice(market.price)}</Text>
      </Box>

      {/* 24h Change with arrow */}
      <Box width={COL_CHANGE} justifyContent="flex-end">
        <Text color={pctStyle.color} bold={pctStyle.bold}>
          {arrow} {formatChangeValue(market.change24h)}
        </Text>
      </Box>

      {/* Volume */}
      <Box width={COL_VOLUME} justifyContent="flex-end">
        <Text color={getVolColor(market.volume24h)}>{formatVolume(market.volume24h)}</Text>
      </Box>

      {/* OI */}
      <Box width={COL_OI} justifyContent="flex-end">
        <Text color={C.text}>{formatVolume(market.openInterest)}</Text>
      </Box>

      {/* Funding */}
      <Box width={COL_FUNDING} justifyContent="flex-end">
        <Text color={fundingStyle}>{formatFundingRate(market.fundingRate)}</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function getPctStyle(value: number): { color: string; bold: boolean } {
  const abs = Math.abs(value);
  if (value >= 0) {
    if (abs >= 100) return { color: C.greenBright, bold: true };
    if (abs >= 10) return { color: C.green, bold: true };
    return { color: C.green, bold: false };
  }
  if (abs >= 30) return { color: C.redBright, bold: true };
  if (abs >= 10) return { color: C.red, bold: true };
  return { color: C.red, bold: false };
}

function getFundingStyle(rate: number): string {
  const abs = Math.abs(rate);
  if (abs >= 0.01) return rate > 0 ? C.greenBright : C.redBright;
  if (abs >= 0.001) return rate > 0 ? C.green : C.red;
  return C.dim;
}

function getVolColor(vol: number): string {
  if (vol >= 10_000_000) return C.white;
  if (vol >= 1_000_000) return C.text;
  if (vol >= 100_000) return C.label;
  return C.dim;
}

function formatChangeValue(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return abs.toFixed(0) + "%";
  return abs.toFixed(2) + "%";
}
