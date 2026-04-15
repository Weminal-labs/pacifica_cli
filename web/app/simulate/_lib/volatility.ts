// ---------------------------------------------------------------------------
// Realised volatility helpers — pure functions, no React
// ---------------------------------------------------------------------------

export interface Candle {
  t: number; // open time ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface VolatilityResult {
  dailyStdevPct: number;   // 1 standard deviation of daily price move, in %
  weeklyStdevPct: number;  // scaled to 7-day horizon
  scenarios: { label: string; pct: number; sigma: number }[]; // ±1σ/2σ/3σ
  dataPoints: number;
}

/** Compute realized volatility from hourly OHLC log-return series */
export function calcRealizedVol(candles: Candle[]): VolatilityResult | null {
  if (candles.length < 12) return null; // need at least 12h

  const logRets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].c > 0 && candles[i].c > 0) {
      logRets.push(Math.log(candles[i].c / candles[i - 1].c));
    }
  }
  if (logRets.length < 2) return null;

  const mean = logRets.reduce((a, b) => a + b, 0) / logRets.length;
  const variance = logRets.reduce((a, b) => a + (b - mean) ** 2, 0) / (logRets.length - 1);
  const hourlyStdev = Math.sqrt(variance);

  // Scale: 1h → 24h → 7d (assumes i.i.d. returns — honest approximation)
  const dailyStdev  = hourlyStdev * Math.sqrt(24);
  const weeklyStdev = hourlyStdev * Math.sqrt(24 * 7);

  const dailyStdevPct  = dailyStdev  * 100;
  const weeklyStdevPct = weeklyStdev * 100;

  // Build ±1σ/2σ/3σ scenario pcts (positive = price up, negative = price down)
  const scenarios = [
    { label: `+3σ`,  pct:  +(dailyStdevPct * 3), sigma:  3 },
    { label: `+2σ`,  pct:  +(dailyStdevPct * 2), sigma:  2 },
    { label: `+1σ`,  pct:  +(dailyStdevPct * 1), sigma:  1 },
    { label: `-1σ`,  pct:  -(dailyStdevPct * 1), sigma: -1 },
    { label: `-2σ`,  pct:  -(dailyStdevPct * 2), sigma: -2 },
    { label: `-3σ`,  pct:  -(dailyStdevPct * 3), sigma: -3 },
  ];

  return { dailyStdevPct, weeklyStdevPct, scenarios, dataPoints: logRets.length };
}

/** Reorder scenarios so profits come first (based on side) */
export function orderScenariosForSide(
  scenarios: VolatilityResult["scenarios"],
  side: "long" | "short",
): VolatilityResult["scenarios"] {
  // For long: positive price moves = profit; for short: negative = profit
  const profit = scenarios.filter((s) => (side === "long" ? s.sigma > 0 : s.sigma < 0));
  const loss   = scenarios.filter((s) => (side === "long" ? s.sigma < 0 : s.sigma > 0));
  return [...profit.sort((a, b) => Math.abs(a.sigma) - Math.abs(b.sigma)),
          ...loss.sort((a, b) => Math.abs(a.sigma) - Math.abs(b.sigma))];
}
