// ---------------------------------------------------------------------------
// Volatility — scenario math (pure functions, no React)
// ---------------------------------------------------------------------------

import type { Candle } from "@pacifica/core/patterns/candles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { Candle };

export interface Scenario {
  label:  string;
  price:  number;
  pnl:    number;
  pnlPct: number;
}

// ---------------------------------------------------------------------------
// Realised volatility
// ---------------------------------------------------------------------------

/**
 * Annualised historical volatility from hourly close-to-close log returns.
 * Returns 0 when fewer than 2 candles are provided.
 */
export function calcRealisedVol(candles: Candle[]): number {
  if (candles.length < 2) return 0;

  // Compute log returns
  const logReturns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].c;
    const curr = candles[i].c;
    if (prev <= 0 || curr <= 0) continue;
    logReturns.push(Math.log(curr / prev));
  }

  if (logReturns.length < 2) return 0;

  const n    = logReturns.length;
  const mean = logReturns.reduce((s, r) => s + r, 0) / n;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1 || 1);
  const hourlyStd = Math.sqrt(variance);

  // Annualise: 24 hours/day * 365 days/year = 8 760 hourly periods
  const HOURLY_PERIODS_PER_YEAR = 8_760;
  return hourlyStd * Math.sqrt(HOURLY_PERIODS_PER_YEAR);
}

// ---------------------------------------------------------------------------
// Volatility scenarios
// ---------------------------------------------------------------------------

export interface VolScenarioParams {
  entryPrice:  number;
  side:        "long" | "short";
  sizeUsd:     number;
  leverage:    number;
  realisedVol: number;
}

/**
 * Generate 6 volatility-based price scenarios: +/-1σ, +/-2σ, +/-3σ daily moves.
 *
 * P&L math mirrors `simulate.ts` so numbers are consistent across the page.
 */
export function volatilityScenarios(params: VolScenarioParams): Scenario[] {
  const { entryPrice, side, sizeUsd, leverage, realisedVol } = params;

  const dailyVol       = realisedVol / Math.sqrt(365);
  const marginRequired = sizeUsd / leverage;
  const positionSize   = sizeUsd / entryPrice;

  const sigmas = [1, 2, 3, -1, -2, -3];

  return sigmas.map((n) => {
    const move      = dailyVol * n;
    const price     = entryPrice * (1 + move);
    const priceDelta =
      side === "long" ? price - entryPrice : entryPrice - price;
    const pnl    = priceDelta * positionSize;
    const pnlPct = (pnl / marginRequired) * 100;

    const label = n > 0 ? `+${n}\u03C3` : `${n}\u03C3`;

    return { label, price, pnl, pnlPct };
  });
}
