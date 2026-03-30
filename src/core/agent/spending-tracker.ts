// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Daily Spending Tracker
// ---------------------------------------------------------------------------
// Tracks how much the AI agent has spent today (in USD).  Data is persisted
// to ~/.pacifica/spending.json so it survives CLI restarts.  The tracker
// resets automatically at midnight local time.
// ---------------------------------------------------------------------------

import { readFile, writeFile, rename, chmod, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getDataDir } from "../config/loader.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpendingTransaction {
  timestamp: string; // ISO-8601 UTC
  amount: number; // USD
  action: string; // e.g. "place_order"
  symbol: string; // e.g. "ETH"
}

export interface SpendingData {
  date: string; // YYYY-MM-DD local time
  totalSpent: number;
  transactions: SpendingTransaction[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPENDING_FILENAME = "spending.json";

// ---------------------------------------------------------------------------
// SpendingTracker
// ---------------------------------------------------------------------------

export class SpendingTracker {
  private data: SpendingData;
  private dataDir: string | null = null;

  constructor() {
    this.data = this.freshData();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load spending data from disk.  Call once at startup.
   *
   * If the file does not exist or contains stale (previous-day) data the
   * tracker starts fresh.
   */
  async load(): Promise<void> {
    this.dataDir = await getDataDir();

    try {
      const raw = await readFile(this.filePath(), "utf-8");
      const parsed: unknown = JSON.parse(raw);

      if (this.isValidSpendingData(parsed)) {
        this.data = parsed;
      } else {
        this.data = this.freshData();
      }
    } catch {
      // File missing, unreadable, or corrupt – start fresh.
      this.data = this.freshData();
    }

    // If the persisted date is not today, reset.
    this.ensureToday();
  }

  /** Get today's total spend in USD. */
  getDailySpend(): number {
    this.ensureToday();
    return this.data.totalSpent;
  }

  /**
   * Record a new spending transaction.
   *
   * Adds the transaction to today's ledger, updates `totalSpent`, and
   * persists to disk immediately.
   */
  async recordSpend(
    amount: number,
    action: string,
    symbol: string,
  ): Promise<void> {
    this.ensureToday();

    const tx: SpendingTransaction = {
      timestamp: new Date().toISOString(),
      amount,
      action,
      symbol,
    };

    this.data.transactions.push(tx);
    this.data.totalSpent += amount;

    await this.save();
  }

  /** Return a copy of today's transactions. */
  getTransactions(): SpendingTransaction[] {
    this.ensureToday();
    return [...this.data.transactions];
  }

  /** Persist current state to disk (public for testing). */
  async save(): Promise<void> {
    if (this.dataDir === null) {
      this.dataDir = await getDataDir();
    }

    const target = this.filePath();
    const tempFile = join(
      this.dataDir,
      `.spending_tmp_${randomBytes(8).toString("hex")}`,
    );

    try {
      const json = JSON.stringify(this.data, null, 2) + "\n";
      await writeFile(tempFile, json, { encoding: "utf-8", mode: 0o600 });
      await rename(tempFile, target);
      // Ensure permissions are correct even if the file already existed.
      await chmod(target, 0o600);
    } catch (err) {
      // Best-effort cleanup of the temp file.
      try {
        await access(tempFile, fsConstants.F_OK);
        const { unlink } = await import("node:fs/promises");
        await unlink(tempFile);
      } catch {
        // Already gone – nothing to do.
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to write spending data: ${message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Return an empty spending record for today. */
  private freshData(): SpendingData {
    return {
      date: this.todayString(),
      totalSpent: 0,
      transactions: [],
    };
  }

  /** Return today's date as YYYY-MM-DD in local time. */
  private todayString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** If the stored date is not today, reset to a fresh ledger. */
  private ensureToday(): void {
    if (this.data.date !== this.todayString()) {
      this.data = this.freshData();
    }
  }

  /** Absolute path to the spending JSON file. */
  private filePath(): string {
    if (this.dataDir === null) {
      throw new Error(
        "SpendingTracker has not been initialised. Call load() first.",
      );
    }
    return join(this.dataDir, SPENDING_FILENAME);
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * Lightweight runtime check that `value` looks like a valid `SpendingData`
   * object.  We intentionally avoid pulling in a validation library here to
   * keep the module dependency-free (except the config loader).
   */
  private isValidSpendingData(value: unknown): value is SpendingData {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const obj = value as Record<string, unknown>;

    if (typeof obj.date !== "string") return false;
    if (typeof obj.totalSpent !== "number") return false;
    if (!Array.isArray(obj.transactions)) return false;

    // Validate each transaction has the expected shape.
    for (const tx of obj.transactions) {
      if (typeof tx !== "object" || tx === null || Array.isArray(tx)) {
        return false;
      }
      const t = tx as Record<string, unknown>;
      if (typeof t.timestamp !== "string") return false;
      if (typeof t.amount !== "number") return false;
      if (typeof t.action !== "string") return false;
      if (typeof t.symbol !== "string") return false;
    }

    return true;
  }
}
