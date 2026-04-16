// ---------------------------------------------------------------------------
// Tests: JournalLogger — patternName field, filtering, and stats
// ---------------------------------------------------------------------------
// The JournalLogger writes to ~/.pacifica/journal.json via getDataDir().
// We mock getDataDir() to point at a temp directory per test so no real
// filesystem state is shared across tests.
// ---------------------------------------------------------------------------

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock getDataDir BEFORE importing the module under test so that vitest
// hoists the mock before any top-level import resolution.
// ---------------------------------------------------------------------------

vi.mock("../../config/loader.js", () => ({
  getDataDir: vi.fn(),
}));

// After mocking, import the module under test and the mock utility.
import { JournalLogger } from "../logger.js";
import { getDataDir } from "../../config/loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetDataDir = getDataDir as ReturnType<typeof vi.fn>;

/** Minimal valid entry fields (excluding id, timestamp, patternName). */
function baseEntry(overrides: Partial<Parameters<JournalLogger["log"]>[0]> = {}) {
  return {
    type: "position_close" as const,
    symbol: "BTC-USDC-PERP",
    side: "long",
    size: 0.1,
    price: 65_000,
    fees: 2.5,
    leverage: 5,
    triggeredBy: "human" as const,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test lifecycle — fresh temp dir per test
// ---------------------------------------------------------------------------

let tempDir: string;
let logger: JournalLogger;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pacifica-journal-test-"));
  mockGetDataDir.mockResolvedValue(tempDir);
  logger = new JournalLogger();
});

afterEach(async () => {
  vi.clearAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// JournalEntry.patternName field
// ---------------------------------------------------------------------------

describe("JournalEntry — patternName field", () => {
  it("stores patternName on the logged entry when provided", async () => {
    const entry = await logger.log(
      baseEntry({ patternName: "funding-carry", pnl: 120 }),
    );
    expect(entry.patternName).toBe("funding-carry");
  });

  it("leaves patternName undefined when not provided", async () => {
    const entry = await logger.log(baseEntry({ pnl: 50 }));
    expect(entry.patternName).toBeUndefined();
  });

  it("persists patternName so it survives a read-back cycle", async () => {
    await logger.log(baseEntry({ patternName: "breakout", pnl: 75 }));
    const [fetched] = await logger.getEntries();
    expect(fetched.patternName).toBe("breakout");
  });
});

// ---------------------------------------------------------------------------
// getEntries({ patternName }) — filtering
// ---------------------------------------------------------------------------

describe("getEntries — patternName filter", () => {
  beforeEach(async () => {
    // Seed three entries: two with "dca-down", one with "breakout", one without.
    await logger.log(baseEntry({ patternName: "dca-down", pnl: 40 }));
    await logger.log(baseEntry({ patternName: "dca-down", pnl: -20 }));
    await logger.log(baseEntry({ patternName: "breakout", pnl: 100 }));
    await logger.log(baseEntry({ pnl: 10 })); // no patternName
  });

  it("returns only entries matching the requested pattern", async () => {
    const entries = await logger.getEntries({ patternName: "dca-down" });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.patternName === "dca-down")).toBe(true);
  });

  it("returns an empty array when no entries match the pattern", async () => {
    const entries = await logger.getEntries({ patternName: "no-such-pattern" });
    expect(entries).toHaveLength(0);
  });

  it("matches pattern names case-insensitively", async () => {
    const entries = await logger.getEntries({ patternName: "DCA-DOWN" });
    expect(entries).toHaveLength(2);
  });

  it("does not return entries without a patternName", async () => {
    const entries = await logger.getEntries({ patternName: "dca-down" });
    expect(entries.every((e) => e.patternName !== undefined)).toBe(true);
  });

  it("returns all entries when no patternName filter is supplied", async () => {
    const entries = await logger.getEntries();
    expect(entries).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// getPatternSummary — per-pattern stats
// ---------------------------------------------------------------------------

describe("getPatternSummary", () => {
  it("returns zero stats for a pattern with no matching entries", async () => {
    const summary = await logger.getPatternSummary("ghost-pattern");
    expect(summary.patternName).toBe("ghost-pattern");
    expect(summary.totalTrades).toBe(0);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.totalPnl).toBe(0);
    expect(summary.avgPnl).toBe(0);
  });

  it("counts wins as pnl > 0, losses as pnl <= 0, skips undefined pnl from win/loss", async () => {
    await logger.log(baseEntry({ patternName: "test", pnl: 50 }));   // win
    await logger.log(baseEntry({ patternName: "test", pnl: -30 }));  // loss
    await logger.log(baseEntry({ patternName: "test" }));             // undefined pnl → skipped

    const summary = await logger.getPatternSummary("test");
    expect(summary.totalTrades).toBe(3);
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(1);  // only closed trades with pnl <= 0
    expect(summary.winRate).toBe(50); // 1 win / 2 closed trades
  });

  it("computes winRate as wins / totalTrades * 100", async () => {
    await logger.log(baseEntry({ patternName: "p1", pnl: 100 }));
    await logger.log(baseEntry({ patternName: "p1", pnl: 50 }));
    await logger.log(baseEntry({ patternName: "p1", pnl: -20 }));
    await logger.log(baseEntry({ patternName: "p1", pnl: -10 }));

    const summary = await logger.getPatternSummary("p1");
    expect(summary.totalTrades).toBe(4);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(2);
    expect(summary.winRate).toBeCloseTo(50, 10);
  });

  it("computes totalPnl as the sum of all pnl values (treating undefined as 0)", async () => {
    await logger.log(baseEntry({ patternName: "p2", pnl: 120 }));
    await logger.log(baseEntry({ patternName: "p2", pnl: -40 }));
    await logger.log(baseEntry({ patternName: "p2" })); // undefined → 0

    const summary = await logger.getPatternSummary("p2");
    expect(summary.totalPnl).toBeCloseTo(80, 10);
  });

  it("computes avgPnl as totalPnl / totalTrades", async () => {
    await logger.log(baseEntry({ patternName: "p3", pnl: 90 }));
    await logger.log(baseEntry({ patternName: "p3", pnl: 30 }));

    const summary = await logger.getPatternSummary("p3");
    expect(summary.avgPnl).toBeCloseTo(60, 10);
  });

  it("gives winRate of 100 when all trades are winners", async () => {
    await logger.log(baseEntry({ patternName: "always-win", pnl: 10 }));
    await logger.log(baseEntry({ patternName: "always-win", pnl: 20 }));

    const summary = await logger.getPatternSummary("always-win");
    expect(summary.winRate).toBe(100);
    expect(summary.losses).toBe(0);
  });

  it("gives winRate of 0 when all trades are losers", async () => {
    await logger.log(baseEntry({ patternName: "always-lose", pnl: -10 }));
    await logger.log(baseEntry({ patternName: "always-lose", pnl: -5 }));

    const summary = await logger.getPatternSummary("always-lose");
    expect(summary.winRate).toBe(0);
    expect(summary.wins).toBe(0);
  });

  it("only considers entries tagged with the requested pattern", async () => {
    await logger.log(baseEntry({ patternName: "alpha", pnl: 200 }));
    await logger.log(baseEntry({ patternName: "beta", pnl: 999 }));

    const summary = await logger.getPatternSummary("alpha");
    expect(summary.totalTrades).toBe(1);
    expect(summary.totalPnl).toBeCloseTo(200, 10);
  });
});

// ---------------------------------------------------------------------------
// getPatternStats — grouped + sorted stats
// ---------------------------------------------------------------------------

describe("getPatternStats", () => {
  it("returns an empty array when journal is empty", async () => {
    const stats = await logger.getPatternStats();
    expect(stats).toHaveLength(0);
  });

  it("excludes entries that have no patternName", async () => {
    await logger.log(baseEntry({ pnl: 50 }));  // no patternName
    await logger.log(baseEntry({ pnl: -10 })); // no patternName

    const stats = await logger.getPatternStats();
    expect(stats).toHaveLength(0);
  });

  it("returns one summary per distinct pattern", async () => {
    await logger.log(baseEntry({ patternName: "alpha", pnl: 10 }));
    await logger.log(baseEntry({ patternName: "beta", pnl: 20 }));
    await logger.log(baseEntry({ patternName: "alpha", pnl: 30 }));

    const stats = await logger.getPatternStats();
    expect(stats).toHaveLength(2);
    const names = stats.map((s) => s.patternName);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  it("sorts by totalTrades descending (most-traded pattern first)", async () => {
    // alpha: 3 trades; beta: 1 trade; gamma: 2 trades
    await logger.log(baseEntry({ patternName: "alpha", pnl: 10 }));
    await logger.log(baseEntry({ patternName: "alpha", pnl: 20 }));
    await logger.log(baseEntry({ patternName: "alpha", pnl: -5 }));
    await logger.log(baseEntry({ patternName: "gamma", pnl: 15 }));
    await logger.log(baseEntry({ patternName: "gamma", pnl: -5 }));
    await logger.log(baseEntry({ patternName: "beta", pnl: 30 }));

    const stats = await logger.getPatternStats();
    expect(stats[0].patternName).toBe("alpha");
    expect(stats[0].totalTrades).toBe(3);
    expect(stats[1].patternName).toBe("gamma");
    expect(stats[1].totalTrades).toBe(2);
    expect(stats[2].patternName).toBe("beta");
    expect(stats[2].totalTrades).toBe(1);
  });

  it("computes correct wins, losses and winRate for each group", async () => {
    await logger.log(baseEntry({ patternName: "trend-follow", pnl: 100 }));  // win
    await logger.log(baseEntry({ patternName: "trend-follow", pnl: -50 })); // loss
    await logger.log(baseEntry({ patternName: "trend-follow", pnl: 80 }));  // win

    const stats = await logger.getPatternStats();
    const tf = stats.find((s) => s.patternName === "trend-follow")!;
    expect(tf.wins).toBe(2);
    expect(tf.losses).toBe(1);
    expect(tf.winRate).toBeCloseTo(66.67, 1);
    expect(tf.totalPnl).toBeCloseTo(130, 10);
    expect(tf.avgPnl).toBeCloseTo(130 / 3, 10);
  });

  it("entries without patternName do not inflate any group's trade count", async () => {
    await logger.log(baseEntry({ patternName: "solo", pnl: 5 }));
    await logger.log(baseEntry({ pnl: 99 })); // no pattern — must not appear

    const stats = await logger.getPatternStats();
    expect(stats).toHaveLength(1);
    expect(stats[0].totalTrades).toBe(1);
  });
});
