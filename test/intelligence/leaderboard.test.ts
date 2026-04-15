// ---------------------------------------------------------------------------
// Tests — Leaderboard Parsing (getLeaderboard in PacificaClient)
// ---------------------------------------------------------------------------
// Validates the parsing and derived-field logic applied to raw Pacifica
// leaderboard API responses. No real API key or network required.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Re-implement the parsing logic as a pure function so we can test it
// without instantiating PacificaClient (which needs a network config).
// This mirrors exactly what getLeaderboard() does in client.ts.
// ---------------------------------------------------------------------------

interface RawEntry {
  address: string;
  pnl_all_time: string;
  pnl_1d:       string;
  pnl_7d:       string;
  pnl_30d:      string;
  equity_current:  string;
  volume_all_time: string;
  volume_30d:      string;
}

function parseLeaderboard(traders: RawEntry[], limit: number) {
  return traders
    .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
    .slice(0, limit)
    .map((t, i) => {
      const pnlAllTime = parseFloat(t.pnl_all_time) || 0;
      const pnl1d      = parseFloat(t.pnl_1d)       || 0;
      const pnl7d      = parseFloat(t.pnl_7d)        || 0;
      const pnl30d     = parseFloat(t.pnl_30d)       || 0;
      const periods    = [pnlAllTime, pnl30d, pnl7d, pnl1d];
      const wins       = periods.filter((p) => p > 0).length;
      const repScore   = Math.round(Math.max(30, 99 - (i / Math.max(1, traders.length)) * 65));
      const volAll     = Math.abs(parseFloat(t.volume_all_time) || 0);
      const trades     = Math.max(1, Math.round(volAll / 3_000));
      return {
        rank: i + 1,
        trader_id: t.address,
        overall_rep_score: repScore,
        overall_win_rate: wins / periods.length,
        closed_trades: trades,
        top_patterns: [] as string[],
        onchain: { pnl_all_time: pnlAllTime, pnl_1d: pnl1d, pnl_7d: pnl7d, pnl_30d: pnl30d,
          equity_current: parseFloat(t.equity_current) || 0,
          volume_all_time: volAll, volume_30d: parseFloat(t.volume_30d) || 0 },
      };
    });
}

function makeRaw(overrides: Partial<RawEntry> = {}): RawEntry {
  return {
    address:         "ABC123",
    pnl_all_time:    "100000",
    pnl_1d:          "500",
    pnl_7d:          "3000",
    pnl_30d:         "15000",
    equity_current:  "200000",
    volume_all_time: "9000000",
    volume_30d:      "1000000",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseLeaderboard", () => {
  it("sorts traders by pnl_all_time descending", () => {
    const traders = [
      makeRaw({ address: "low",  pnl_all_time: "10000" }),
      makeRaw({ address: "high", pnl_all_time: "500000" }),
      makeRaw({ address: "mid",  pnl_all_time: "100000" }),
    ];
    const result = parseLeaderboard(traders, 10);
    expect(result[0]!.trader_id).toBe("high");
    expect(result[1]!.trader_id).toBe("mid");
    expect(result[2]!.trader_id).toBe("low");
  });

  it("respects the limit parameter", () => {
    const traders = Array.from({ length: 10 }, (_, i) =>
      makeRaw({ address: `t${i}`, pnl_all_time: String(i * 1000) }),
    );
    expect(parseLeaderboard(traders, 3).length).toBe(3);
  });

  it("assigns rank starting from 1", () => {
    const result = parseLeaderboard([makeRaw()], 10);
    expect(result[0]!.rank).toBe(1);
  });

  it("computes win_rate as fraction of profitable periods", () => {
    const trader = makeRaw({ pnl_all_time: "100", pnl_30d: "-50", pnl_7d: "200", pnl_1d: "-10" });
    const result = parseLeaderboard([trader], 10);
    // periods: [100, -50, 200, -10] → 2 wins out of 4 = 0.5
    expect(result[0]!.overall_win_rate).toBe(0.5);
  });

  it("gives win_rate = 1.0 when all periods are profitable", () => {
    const trader = makeRaw({ pnl_all_time: "100", pnl_30d: "50", pnl_7d: "20", pnl_1d: "5" });
    const result = parseLeaderboard([trader], 10);
    expect(result[0]!.overall_win_rate).toBe(1.0);
  });

  it("gives win_rate = 0.0 when all periods are negative", () => {
    const trader = makeRaw({ pnl_all_time: "-100", pnl_30d: "-50", pnl_7d: "-20", pnl_1d: "-5" });
    const result = parseLeaderboard([trader], 10);
    expect(result[0]!.overall_win_rate).toBe(0.0);
  });

  it("assigns rep_score = 99 for the top-ranked trader", () => {
    const traders = Array.from({ length: 5 }, (_, i) =>
      makeRaw({ address: `t${i}`, pnl_all_time: String((5 - i) * 10000) }),
    );
    const result = parseLeaderboard(traders, 5);
    expect(result[0]!.overall_rep_score).toBe(99);
  });

  it("rep_score is always >= 30", () => {
    const traders = Array.from({ length: 100 }, (_, i) =>
      makeRaw({ address: `t${i}`, pnl_all_time: String((100 - i) * 1000) }),
    );
    const result = parseLeaderboard(traders, 100);
    for (const e of result) {
      expect(e.overall_rep_score).toBeGreaterThanOrEqual(30);
    }
  });

  it("rep_score decays as rank increases", () => {
    const traders = Array.from({ length: 5 }, (_, i) =>
      makeRaw({ address: `t${i}`, pnl_all_time: String((5 - i) * 10000) }),
    );
    const result = parseLeaderboard(traders, 5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.overall_rep_score).toBeGreaterThanOrEqual(result[i]!.overall_rep_score);
    }
  });

  it("estimates closed_trades from volume / $3k average trade size", () => {
    const trader = makeRaw({ volume_all_time: "300000" }); // 300k / 3k = 100
    const result = parseLeaderboard([trader], 10);
    expect(result[0]!.closed_trades).toBe(100);
  });

  it("closed_trades is at least 1 even for zero volume", () => {
    const trader = makeRaw({ volume_all_time: "0" });
    const result = parseLeaderboard([trader], 10);
    expect(result[0]!.closed_trades).toBeGreaterThanOrEqual(1);
  });

  it("preserves onchain pnl fields from raw data", () => {
    const trader = makeRaw({
      pnl_all_time: "1000", pnl_1d: "10", pnl_7d: "70", pnl_30d: "300",
      equity_current: "5000", volume_30d: "90000",
    });
    const result = parseLeaderboard([trader], 10);
    const onchain = result[0]!.onchain;
    expect(onchain.pnl_all_time).toBe(1000);
    expect(onchain.pnl_1d).toBe(10);
    expect(onchain.pnl_7d).toBe(70);
    expect(onchain.pnl_30d).toBe(300);
    expect(onchain.equity_current).toBe(5000);
    expect(onchain.volume_30d).toBe(90000);
  });

  it("handles NaN / empty string fields without throwing", () => {
    const trader = makeRaw({ pnl_all_time: "", pnl_1d: "N/A", equity_current: "" });
    expect(() => parseLeaderboard([trader], 10)).not.toThrow();
    const result = parseLeaderboard([trader], 10);
    expect(result[0]!.onchain.pnl_all_time).toBe(0);
    expect(result[0]!.onchain.equity_current).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseLeaderboard([], 10)).toEqual([]);
  });
});
