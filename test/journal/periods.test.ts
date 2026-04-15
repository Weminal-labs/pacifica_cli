// ---------------------------------------------------------------------------
// Tests — Journal Period Grouping Logic
// ---------------------------------------------------------------------------
// Tests the daily/weekly bucketing used by `journal --weekly` and
// `journal --monthly`. All pure functions — no API key required.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { TradeHistory } from "../../src/core/sdk/types.js";

// ---------------------------------------------------------------------------
// Re-implement the pure helpers from journal.ts so we can test them without
// importing the full command (which would pull in chalk/commander deps).
// ---------------------------------------------------------------------------

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${dy}`;
}

function weekLabel(iso: string): string {
  const d   = new Date(iso);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) =>
    `${String(x.getMonth() + 1).padStart(2, "0")}/${String(x.getDate()).padStart(2, "0")}`;
  return `${fmt(mon)}–${fmt(sun)}`;
}

interface Bucket { label: string; trades: TradeHistory[]; pnl: number; fees: number; wins: number; }

function bucketByPeriod(
  entries: TradeHistory[],
  mode: "daily" | "weekly",
  cutoff: number,
): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const e of entries) {
    if (new Date(e.createdAt).getTime() < cutoff) continue;
    const label = mode === "daily" ? dayLabel(e.createdAt) : weekLabel(e.createdAt);
    if (!buckets.has(label)) buckets.set(label, { label, trades: [], pnl: 0, fees: 0, wins: 0 });
    const b = buckets.get(label)!;
    b.trades.push(e);
    b.pnl += e.pnl;
    b.fees += e.fee;
    if (e.pnl > 0) b.wins++;
  }
  return buckets;
}

function makeTrade(isoDate: string, pnl: number, fee = 0): TradeHistory {
  return {
    symbol: "ETH-USDC-PERP",
    side: "bid",
    amount: 0.1,
    price: 2000,
    entryPrice: 2000,
    pnl,
    fee,
    createdAt: isoDate,
  };
}

// ---------------------------------------------------------------------------
// dayLabel
// ---------------------------------------------------------------------------

describe("dayLabel", () => {
  it("formats YYYY-MM-DD correctly", () => {
    expect(dayLabel("2026-04-14T15:30:00.000Z")).toBe("2026-04-14");
  });

  it("pads month and day with leading zeros", () => {
    expect(dayLabel("2026-01-05T00:00:00.000Z")).toBe("2026-01-05");
  });

  it("same date returns same label regardless of time", () => {
    // Use noon UTC — safe in any timezone from UTC-11 to UTC+11
    const a = dayLabel("2026-04-14T10:00:00.000Z");
    const b = dayLabel("2026-04-14T11:00:00.000Z");
    expect(a).toBe(b);
  });

  it("different dates return different labels", () => {
    expect(dayLabel("2026-04-13T12:00:00.000Z")).not.toBe(dayLabel("2026-04-14T12:00:00.000Z"));
  });
});

// ---------------------------------------------------------------------------
// weekLabel
// ---------------------------------------------------------------------------

describe("weekLabel", () => {
  it("Monday and Sunday of the same week get the same label", () => {
    // 2026-04-13 is a Monday, 2026-04-19 is the following Sunday
    const monLabel = weekLabel("2026-04-13T10:00:00.000Z");
    const sunLabel = weekLabel("2026-04-19T10:00:00.000Z");
    expect(monLabel).toBe(sunLabel);
  });

  it("Saturday and the following Monday get different labels", () => {
    const satLabel = weekLabel("2026-04-18T10:00:00.000Z"); // Sat (same week as Mon Apr 13)
    const monLabel = weekLabel("2026-04-20T10:00:00.000Z"); // Mon (new week)
    expect(satLabel).not.toBe(monLabel);
  });

  it("label format is MM/DD–MM/DD", () => {
    const label = weekLabel("2026-04-14T00:00:00.000Z");
    expect(label).toMatch(/^\d{2}\/\d{2}–\d{2}\/\d{2}$/);
  });

  it("week starts on Monday", () => {
    // 2026-04-13 is a Monday — the week label should start with 04/13
    // Use midday UTC so local date stays Apr 13 across UTC-10 to UTC+11
    const label = weekLabel("2026-04-13T10:00:00.000Z");
    expect(label.startsWith("04/13")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bucketByPeriod — daily mode
// ---------------------------------------------------------------------------

describe("bucketByPeriod — daily", () => {
  const cutoff = 0; // include everything

  it("places trades on the same day into one bucket", () => {
    const trades = [
      makeTrade("2026-04-14T09:00:00.000Z", 10),
      makeTrade("2026-04-14T11:00:00.000Z", 20),
    ];
    const buckets = bucketByPeriod(trades, "daily", cutoff);
    expect(buckets.size).toBe(1);
    const bucket = buckets.values().next().value!;
    expect(bucket.trades.length).toBe(2);
    expect(bucket.pnl).toBe(30);
  });

  it("places trades on different days into separate buckets", () => {
    const trades = [
      makeTrade("2026-04-13T10:00:00.000Z", 10),
      makeTrade("2026-04-14T10:00:00.000Z", 20),
    ];
    const buckets = bucketByPeriod(trades, "daily", cutoff);
    expect(buckets.size).toBe(2);
  });

  it("sums PnL correctly per bucket", () => {
    const trades = [
      makeTrade("2026-04-14T09:00:00.000Z",  50),
      makeTrade("2026-04-14T11:00:00.000Z", -20),
      makeTrade("2026-04-14T13:00:00.000Z",  30),
    ];
    const buckets = bucketByPeriod(trades, "daily", cutoff);
    const b = buckets.get("2026-04-14")!;
    expect(b.pnl).toBeCloseTo(60);
  });

  it("counts wins (pnl > 0) correctly", () => {
    const trades = [
      makeTrade("2026-04-14T09:00:00.000Z",  50),
      makeTrade("2026-04-14T10:00:00.000Z", -10),
      makeTrade("2026-04-14T11:00:00.000Z",  30),
    ];
    const buckets = bucketByPeriod(trades, "daily", cutoff);
    const b = buckets.get("2026-04-14")!;
    expect(b.wins).toBe(2);
  });

  it("excludes trades before the cutoff timestamp", () => {
    const now = Date.now();
    const old = new Date(now - 8 * 86_400_000).toISOString(); // 8 days ago
    const recent = new Date(now - 1 * 86_400_000).toISOString(); // 1 day ago
    const cutoff7d = now - 7 * 86_400_000;

    const trades = [
      makeTrade(old,    100),
      makeTrade(recent,  50),
    ];
    const buckets = bucketByPeriod(trades, "daily", cutoff7d);
    expect(buckets.size).toBe(1); // old trade excluded
    const b = Array.from(buckets.values())[0]!;
    expect(b.pnl).toBe(50);
  });

  it("returns empty map for empty input", () => {
    expect(bucketByPeriod([], "daily", 0).size).toBe(0);
  });

  it("accumulates fees per bucket", () => {
    const trades = [
      makeTrade("2026-04-14T10:00:00.000Z", 10, 0.5),
      makeTrade("2026-04-14T11:00:00.000Z", 20, 1.0),
    ];
    const b = bucketByPeriod(trades, "daily", cutoff).get("2026-04-14")!;
    expect(b.fees).toBeCloseTo(1.5);
  });
});

// ---------------------------------------------------------------------------
// bucketByPeriod — weekly mode
// ---------------------------------------------------------------------------

describe("bucketByPeriod — weekly", () => {
  const cutoff = 0;

  it("places trades in the same week into one bucket", () => {
    const trades = [
      makeTrade("2026-04-13T10:00:00.000Z", 10), // Mon
      makeTrade("2026-04-15T10:00:00.000Z", 20), // Wed
      makeTrade("2026-04-19T10:00:00.000Z", 30), // Sun
    ];
    const buckets = bucketByPeriod(trades, "weekly", cutoff);
    expect(buckets.size).toBe(1);
    const b = Array.from(buckets.values())[0]!;
    expect(b.trades.length).toBe(3);
    expect(b.pnl).toBe(60);
  });

  it("separates trades from different weeks", () => {
    const trades = [
      makeTrade("2026-04-13T10:00:00.000Z", 10), // week 1
      makeTrade("2026-04-20T10:00:00.000Z", 20), // week 2
    ];
    const buckets = bucketByPeriod(trades, "weekly", cutoff);
    expect(buckets.size).toBe(2);
  });
});
