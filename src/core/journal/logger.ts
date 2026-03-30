// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Trade Journal Logger
// ---------------------------------------------------------------------------
// Auto-logs every trade fill, position close, and smart order trigger to a
// local JSON journal file (~/.pacifica/journal.json).  Provides filtering by
// period and symbol, plus summary statistics for performance review.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir } from "../config/loader.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEntry {
  id: string;                // crypto.randomUUID()
  timestamp: string;         // ISO 8601
  type: "fill" | "position_close" | "smart_order_trigger";
  symbol: string;
  side: string;              // "buy" | "sell" | "long" | "short"
  size: number;
  price: number;
  pnl?: number;             // for closes
  fees: number;
  leverage: number;
  duration?: number;         // seconds, for position closes
  triggeredBy: "human" | "agent" | "smart_order";
}

export interface JournalSummary {
  period: string;            // "today", "week", "month", "all"
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;           // percentage
  totalPnl: number;
  totalFees: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  avgDuration?: number;      // seconds
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOURNAL_FILENAME = "journal.json";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

type PeriodFilter = "today" | "week" | "month" | "all";

// ---------------------------------------------------------------------------
// JournalLogger
// ---------------------------------------------------------------------------

export class JournalLogger {
  private dataDir: string | null = null;

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Lazily resolve and cache the data directory path.
   * Creates `~/.pacifica/` with 0o700 permissions if it does not exist.
   */
  private async resolveDataDir(): Promise<string> {
    if (this.dataDir) return this.dataDir;
    this.dataDir = await getDataDir();
    return this.dataDir;
  }

  /**
   * Full path to the journal file.
   */
  async getJournalPath(): Promise<string> {
    const dir = await this.resolveDataDir();
    return join(dir, JOURNAL_FILENAME);
  }

  /**
   * Read all journal entries from disk.
   * Returns an empty array when the file does not exist yet.
   */
  private async readEntries(): Promise<JournalEntry[]> {
    const filePath = await this.getJournalPath();

    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      // File not found – this is fine on first run.
      if (isNodeError(err) && err.code === "ENOENT") {
        return [];
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read journal at ${filePath}: ${message}`);
    }

    // Handle empty file gracefully.
    const trimmed = raw.trim();
    if (trimmed.length === 0) return [];

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error("Journal file does not contain a JSON array");
      }
      return parsed as JournalEntry[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse journal at ${filePath}: ${message}`);
    }
  }

  /**
   * Persist the full entry list back to disk with restricted permissions.
   */
  private async writeEntries(entries: JournalEntry[]): Promise<void> {
    const filePath = await this.getJournalPath();
    const dir = await this.resolveDataDir();

    // Ensure directory exists (idempotent).
    await mkdir(dir, { recursive: true, mode: DIR_MODE });

    const json = JSON.stringify(entries, null, 2) + "\n";
    await writeFile(filePath, json, { encoding: "utf-8", mode: FILE_MODE });

    // Ensure permissions are correct even if the file already existed.
    await chmod(filePath, FILE_MODE);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Log a trade event.
   *
   * Accepts all fields except `id` and `timestamp` which are generated
   * automatically.  The entry is appended to the journal file and the
   * complete entry (with generated fields) is returned.
   */
  async log(
    entry: Omit<JournalEntry, "id" | "timestamp">,
  ): Promise<JournalEntry> {
    const fullEntry: JournalEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    const entries = await this.readEntries();
    entries.push(fullEntry);
    await this.writeEntries(entries);

    return fullEntry;
  }

  /**
   * Retrieve journal entries with optional filters.
   *
   * @param options.period  - Time window: "today", "week", "month", or "all".
   * @param options.symbol  - Filter by trading pair symbol (case-insensitive).
   * @param options.limit   - Maximum number of entries to return (most recent first).
   */
  async getEntries(options?: {
    period?: PeriodFilter;
    symbol?: string;
    limit?: number;
  }): Promise<JournalEntry[]> {
    let entries = await this.readEntries();

    // Period filter
    const period = options?.period ?? "all";
    if (period !== "all") {
      const cutoff = getCutoffDate(period);
      entries = entries.filter((e) => new Date(e.timestamp) >= cutoff);
    }

    // Symbol filter
    if (options?.symbol) {
      const sym = options.symbol.toUpperCase();
      entries = entries.filter((e) => e.symbol.toUpperCase() === sym);
    }

    // Sort newest first for limit/display purposes.
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Limit
    if (options?.limit !== undefined && options.limit > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Compute summary statistics for a given period.
   *
   * - wins: trades with pnl > 0
   * - losses: trades with pnl < 0 or pnl undefined
   * - winRate: wins / totalTrades * 100
   * - avgWin: sum of positive pnl / wins
   * - avgLoss: sum of negative pnl / losses
   * - bestTrade: maximum pnl
   * - worstTrade: minimum pnl
   * - avgDuration: average duration of position_close entries (seconds)
   */
  async getSummary(period: PeriodFilter): Promise<JournalSummary> {
    const entries = await this.getEntries({ period });
    const totalTrades = entries.length;

    if (totalTrades === 0) {
      return {
        period,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        totalFees: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgDuration: undefined,
      };
    }

    // Classify wins / losses.
    const winEntries: JournalEntry[] = [];
    const lossEntries: JournalEntry[] = [];

    for (const entry of entries) {
      if (entry.pnl !== undefined && entry.pnl > 0) {
        winEntries.push(entry);
      } else {
        // pnl <= 0 or undefined counts as a loss.
        lossEntries.push(entry);
      }
    }

    const wins = winEntries.length;
    const losses = lossEntries.length;
    const winRate = (wins / totalTrades) * 100;

    // PnL aggregates – treat undefined pnl as 0.
    const pnlValues = entries.map((e) => e.pnl ?? 0);
    const totalPnl = pnlValues.reduce((sum, v) => sum + v, 0);
    const totalFees = entries.reduce((sum, e) => sum + e.fees, 0);

    const positiveSum = winEntries.reduce((sum, e) => sum + (e.pnl ?? 0), 0);
    const negativeSum = lossEntries.reduce((sum, e) => sum + (e.pnl ?? 0), 0);

    const avgWin = wins > 0 ? positiveSum / wins : 0;
    const avgLoss = losses > 0 ? negativeSum / losses : 0;

    const bestTrade = Math.max(...pnlValues);
    const worstTrade = Math.min(...pnlValues);

    // Average duration for position closes only.
    const closesWithDuration = entries.filter(
      (e) => e.type === "position_close" && e.duration !== undefined,
    );
    const avgDuration =
      closesWithDuration.length > 0
        ? closesWithDuration.reduce((sum, e) => sum + (e.duration ?? 0), 0) /
          closesWithDuration.length
        : undefined;

    return {
      period,
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnl,
      totalFees,
      avgWin,
      avgLoss,
      bestTrade,
      worstTrade,
      avgDuration,
    };
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Return the start-of-day cutoff Date for a given period label.
 */
function getCutoffDate(period: "today" | "week" | "month"): Date {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    case "week": {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      cutoff.setHours(0, 0, 0, 0);
      return cutoff;
    }
    case "month": {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
      cutoff.setHours(0, 0, 0, 0);
      return cutoff;
    }
  }
}

/**
 * Type guard for Node.js system errors that carry a `code` property.
 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
