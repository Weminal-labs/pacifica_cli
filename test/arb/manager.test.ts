import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ArbManager } from "../../src/core/arb/manager.js";
import type { ArbConfig } from "../../src/core/config/types.js";
import type { ArbOpportunity } from "../../src/core/arb/types.js";

// ---------------------------------------------------------------------------
// Mock: file system (state persistence)
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<ArbConfig> = {}): ArbConfig {
  return {
    enabled: true,
    min_apr_threshold: 40,
    max_concurrent_positions: 3,
    position_size_usd: 500,
    min_market_volume_24h_usd: 5_000_000,
    max_spread_bps: 20,
    scan_interval_ms: 30_000,
    exit_policy: "settlement",
    exit_apr_floor: 15,
    use_external_rates: false,
    external_divergence_bps: 50,
    max_daily_loss_usd: 200,
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<ArbOpportunity> = {}): ArbOpportunity {
  return {
    symbol: "BTC",
    // 0.003 per interval → ~328.5% APR; passes fee-ratio gate (fees=$0.50 < 50% of funding=$1.50)
    currentRate: 0.003,
    predictedRate: 0.003,
    annualizedApr: 328.5,
    side: "short_collects",
    markPrice: 71000,
    volume24hUsd: 50_000_000,
    bookSpreadBps: 5,
    nextFundingAt: "",
    msToFunding: Infinity,
    score: 100,
    ...overrides,
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    placeMarketOrder: vi.fn().mockResolvedValue({ orderId: 9999 }),
    getPositions: vi.fn().mockResolvedValue([]),
    getMarkets: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as import("../../src/core/sdk/client.js").PacificaClient;
}

// ---------------------------------------------------------------------------
// canEnter() — guardrail checks
// ---------------------------------------------------------------------------

describe("ArbManager.canEnter()", () => {
  let manager: ArbManager;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
    manager = new ArbManager(client, makeConfig());
    manager.load(); // no state file → clean slate
  });

  it("returns true for a valid opportunity", () => {
    expect(manager.canEnter(makeOpportunity())).toBe(true);
  });

  it("returns false when bot is disabled", () => {
    manager = new ArbManager(client, makeConfig({ enabled: false }));
    manager.load();
    expect(manager.canEnter(makeOpportunity())).toBe(false);
  });

  it("returns false when concurrent notional cap is reached", async () => {
    // Fill all 3 slots (max_concurrent_positions = 3, position_size_usd = 500)
    for (let i = 0; i < 3; i++) {
      const opp = makeOpportunity({ symbol: `COIN${i}` });
      await manager.openPosition(opp);
    }
    expect(manager.canEnter(makeOpportunity({ symbol: "ETH" }))).toBe(false);
  });

  it("returns false when fee-to-funding ratio is unacceptable (zero rate)", () => {
    // Rate = 0 → funding = 0 → fees > 50% of funding
    const opp = makeOpportunity({ currentRate: 0, annualizedApr: 0 });
    expect(manager.canEnter(opp)).toBe(false);
  });

  it("returns false when daily loss limit is exceeded", async () => {
    // Open and immediately force-close a position at a loss by manipulating
    // the lifetime stats directly via closePosition() feedback.
    // Easier: inject lifetime state by opening a position and patching loss.
    // We test this by running canEnter() after reaching the $200 limit.
    const managerWithLoss = new ArbManager(client, makeConfig({ max_daily_loss_usd: 0 }));
    managerWithLoss.load();
    // dailyLossUsd starts at 0, limit is 0 → 0 >= 0 → exceeded
    expect(managerWithLoss.canEnter(makeOpportunity())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openPosition()
// ---------------------------------------------------------------------------

describe("ArbManager.openPosition()", () => {
  let manager: ArbManager;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    client = makeClient();
    manager = new ArbManager(client, makeConfig());
    manager.load();
  });

  it("returns success and creates an active position", async () => {
    const result = await manager.openPosition(makeOpportunity());
    expect(result.success).toBe(true);
    expect(result.positionId).toBeTruthy();

    const positions = manager.getPositions({ status: "active" });
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("BTC");
    expect(positions[0].status).toBe("active");
  });

  it("sets leg side to ask for short_collects", async () => {
    await manager.openPosition(makeOpportunity({ side: "short_collects" }));
    const [pos] = manager.getPositions({ status: "active" });
    expect(pos.leg.side).toBe("ask");
  });

  it("sets leg side to bid for long_collects", async () => {
    await manager.openPosition(makeOpportunity({ side: "long_collects" }));
    const [pos] = manager.getPositions({ status: "active" });
    expect(pos.leg.side).toBe("bid");
  });

  it("increments positionsOpened in lifetime stats", async () => {
    await manager.openPosition(makeOpportunity());
    expect(manager.getLifetimeStats().positionsOpened).toBe(1);
  });

  it("marks position as error when order fails", async () => {
    client.placeMarketOrder = vi.fn().mockRejectedValue(new Error("Network error"));
    const result = await manager.openPosition(makeOpportunity());
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");

    const positions = manager.getPositions();
    expect(positions[0].status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// closePosition()
// ---------------------------------------------------------------------------

describe("ArbManager.closePosition()", () => {
  let manager: ArbManager;
  let client: ReturnType<typeof makeClient>;

  beforeEach(async () => {
    client = makeClient();
    // Simulate existing open position on the exchange for exitPosition()
    client.getPositions = vi.fn().mockResolvedValue([
      { symbol: "BTC", side: "short", amount: "0.007" },
    ]);
    manager = new ArbManager(client, makeConfig());
    manager.load();
    // Pre-open a position
    await manager.openPosition(makeOpportunity());
  });

  it("closes an active position successfully", async () => {
    const [pos] = manager.getPositions({ status: "active" });
    const result = await manager.closePosition(pos.id);
    expect(result.success).toBe(true);

    const updated = manager.getPosition(pos.id);
    expect(updated?.status).toBe("closed");
    expect(updated?.exitReason).toBe("manual_close");
    expect(updated?.closedAt).toBeTruthy();
  });

  it("updates lifetime stats on close", async () => {
    const [pos] = manager.getPositions({ status: "active" });
    await manager.closePosition(pos.id);
    const stats = manager.getLifetimeStats();
    expect(stats.positionsClosed).toBe(1);
  });

  it("returns error for non-existent position", async () => {
    const result = await manager.closePosition("bad-id");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Position not found");
  });

  it("returns error for already-closed position", async () => {
    const [pos] = manager.getPositions({ status: "active" });
    await manager.closePosition(pos.id);
    const result = await manager.closePosition(pos.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Already closed");
  });

  it("records daily loss when net PnL is negative", async () => {
    // Make the position lose money: fund + pnl - fees < 0
    const [pos] = manager.getPositions({ status: "active" });
    pos.realizedFundingUsd = 0;
    pos.realizedPnlUsd = 0;
    pos.totalFeesUsd = 1.5; // net = -1.5

    await manager.closePosition(pos.id);
    expect(manager.getLifetimeStats().dailyLossUsd).toBeCloseTo(1.5);
  });

  it("does not record daily loss when profitable", async () => {
    const [pos] = manager.getPositions({ status: "active" });
    pos.realizedFundingUsd = 2;
    pos.realizedPnlUsd = 0;
    pos.totalFeesUsd = 0.5; // net = +1.5

    await manager.closePosition(pos.id);
    expect(manager.getLifetimeStats().dailyLossUsd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getActiveCount()
// ---------------------------------------------------------------------------

describe("ArbManager.getActiveCount()", () => {
  let manager: ArbManager;

  beforeEach(async () => {
    const client = makeClient();
    manager = new ArbManager(client, makeConfig());
    manager.load();
    await manager.openPosition(makeOpportunity({ symbol: "BTC" }));
    await manager.openPosition(makeOpportunity({ symbol: "ETH" }));
  });

  it("counts active and pending positions", () => {
    expect(manager.getActiveCount()).toBe(2);
  });

  it("excludes closed positions", async () => {
    const client = makeClient();
    client.getPositions = vi.fn().mockResolvedValue([
      { symbol: "BTC", side: "short", amount: "0.007" },
    ]);
    const [pos] = manager.getPositions({ status: "active" });
    // Manually close
    manager["positions"].find((p) => p.id === pos.id)!.status = "closed";
    expect(manager.getActiveCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// start() / stop() lifecycle
// ---------------------------------------------------------------------------

describe("ArbManager start/stop", () => {
  let manager: ArbManager;

  beforeEach(() => {
    const client = makeClient();
    manager = new ArbManager(client, makeConfig());
    manager.load();
  });

  afterEach(() => {
    manager.stop();
  });

  it("starts and reports running", () => {
    expect(manager.isRunning()).toBe(false);
    manager.start();
    expect(manager.isRunning()).toBe(true);
  });

  it("stops and reports not running", () => {
    manager.start();
    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it("calling start() twice is idempotent", () => {
    manager.start();
    manager.start();
    expect(manager.isRunning()).toBe(true);
  });
});
