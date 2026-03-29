// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- MarketTable Component
// ---------------------------------------------------------------------------
// Renders market data as a dense, aligned table in the terminal.
// Bloomberg Terminal aesthetic: no frills, high information density.
// ---------------------------------------------------------------------------

import React from "react";
import { Box, Text } from "ink";
import type { Market } from "../../core/sdk/types.js";
import { formatPrice, formatPercent, formatVolume, formatFundingRate } from "../theme.js";

// ---------------------------------------------------------------------------
// Column widths
// ---------------------------------------------------------------------------

const COL_MARKET = 12;
const COL_PRICE = 14;
const COL_CHANGE = 10;
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
        <Text dimColor>No markets available.</Text>
      </Box>
    );
  }

  // Sort by 24h volume descending.
  const sorted = [...markets].sort((a, b) => b.volume24h - a.volume24h);

  const separator = "-".repeat(
    COL_MARKET + COL_PRICE + COL_CHANGE + COL_VOLUME + COL_OI + COL_FUNDING
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Box width={COL_MARKET}>
          <Text color="cyan" bold>Market</Text>
        </Box>
        <Box width={COL_PRICE} justifyContent="flex-end">
          <Text color="cyan" bold>Price</Text>
        </Box>
        <Box width={COL_CHANGE} justifyContent="flex-end">
          <Text color="cyan" bold>24h%</Text>
        </Box>
        <Box width={COL_VOLUME} justifyContent="flex-end">
          <Text color="cyan" bold>Volume</Text>
        </Box>
        <Box width={COL_OI} justifyContent="flex-end">
          <Text color="cyan" bold>OI</Text>
        </Box>
        <Box width={COL_FUNDING} justifyContent="flex-end">
          <Text color="cyan" bold>Funding</Text>
        </Box>
      </Box>

      {/* Separator */}
      <Text dimColor>{separator}</Text>

      {/* Data rows */}
      {sorted.map((market) => (
        <MarketRow key={market.symbol} market={market} />
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MarketRow
// ---------------------------------------------------------------------------

function MarketRow({ market }: { market: Market }): React.ReactElement {
  const changeColor = market.change24h >= 0 ? "green" : "red";
  const fundingColor = market.fundingRate >= 0 ? "green" : "red";

  return (
    <Box>
      <Box width={COL_MARKET}>
        <Text bold color="white">{market.symbol}</Text>
      </Box>
      <Box width={COL_PRICE} justifyContent="flex-end">
        <Text color="white">{formatPrice(market.price)}</Text>
      </Box>
      <Box width={COL_CHANGE} justifyContent="flex-end">
        <Text color={changeColor}>{formatPercent(market.change24h)}</Text>
      </Box>
      <Box width={COL_VOLUME} justifyContent="flex-end">
        <Text color="white">{formatVolume(market.volume24h)}</Text>
      </Box>
      <Box width={COL_OI} justifyContent="flex-end">
        <Text color="white">{formatVolume(market.openInterest)}</Text>
      </Box>
      <Box width={COL_FUNDING} justifyContent="flex-end">
        <Text color={fundingColor}>{formatFundingRate(market.fundingRate)}</Text>
      </Box>
    </Box>
  );
}
