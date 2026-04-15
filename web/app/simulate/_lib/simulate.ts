// ---------------------------------------------------------------------------
// Simulate — core math (pure functions, no React)
// ---------------------------------------------------------------------------

export interface SimResult {
  side:             "long" | "short";
  symbol:           string;
  size:             number;
  leverage:         number;
  entryPrice:       number;
  liquidationPrice: number;
  marginRequired:   number;
  scenarios: { label: string; pricePct: number; pnl: number; pnlPct: number }[];
  funding: { label: string; cost: number }[];
}

const MAINTENANCE_MARGIN = 0.005; // 0.5%

export function calcLiquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
): number {
  if (side === "long") {
    return entryPrice * (1 - 1 / leverage + MAINTENANCE_MARGIN);
  }
  return entryPrice * (1 + 1 / leverage - MAINTENANCE_MARGIN);
}

/** Run simulation with fixed ±pct scenarios */
export function simulate(
  side: "long" | "short",
  symbol: string,
  sizeUsd: number,
  leverage: number,
  entryPrice: number,
  fundingRate8h: number,
  scenarioPcts?: number[], // override; default ±5/10/20
): SimResult {
  const marginRequired = sizeUsd / leverage;
  const positionSize   = sizeUsd / entryPrice;
  const liquidationPrice = calcLiquidationPrice(side, entryPrice, leverage);

  const defaultPcts = side === "long"
    ? [5, 10, 20, -5, -10, -20]
    : [-5, -10, -20, 5, 10, 20];
  const pctMoves = scenarioPcts ?? defaultPcts;

  const scenarios = pctMoves.map((pct) => {
    const exitPrice  = entryPrice * (1 + pct / 100);
    const priceDelta = side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;
    const pnl        = priceDelta * positionSize;
    return {
      label:    pct > 0 ? `+${pct}%` : `${pct}%`,
      pricePct: pct,
      pnl,
      pnlPct: (pnl / marginRequired) * 100,
    };
  });

  const fundingPerInterval = sizeUsd * fundingRate8h;
  const funding = [
    { label: "8h",  cost: fundingPerInterval },
    { label: "24h", cost: fundingPerInterval * 3 },
    { label: "7d",  cost: fundingPerInterval * 3 * 7 },
  ];

  return {
    side, symbol, size: sizeUsd, leverage,
    entryPrice, liquidationPrice, marginRequired,
    scenarios, funding,
  };
}
