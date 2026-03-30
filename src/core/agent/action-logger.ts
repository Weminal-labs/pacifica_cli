// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Agent Action Logger
// ---------------------------------------------------------------------------
// Append-only logger that records every action the AI agent takes (or
// attempts).  Entries are persisted to ~/.pacifica/agent-log.json as a JSON
// array.  The file is never truncated – only new entries are appended.
//
// This intentionally reads the full file on every write.  For a hackathon-
// scale project this is perfectly adequate and keeps the implementation
// simple and debuggable.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { getDataDir } from "../config/loader.js";

// ---- Public interfaces -----------------------------------------------------

export interface AgentLogEntry {
  timestamp: string; // ISO 8601
  tool: string; // MCP tool name, e.g. "pacifica_place_order"
  action: string; // action type: "place_order", "cancel_order", etc.
  params: Record<string, unknown>; // tool input parameters
  result: "success" | "rejected" | "error";
  rejectionReason?: string; // why it was rejected
  response?: Record<string, unknown>; // response data on success
  symbol?: string;
  side?: string;
  amountUsd?: number;
}

const LOG_FILENAME = "agent-log.json";

// ---- Logger class ----------------------------------------------------------

export class AgentActionLogger {
  private dataDir: string | null = null;

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Lazily resolve the data directory so that construction is synchronous but
   * the directory is created (with 0o700 permissions) before first use.
   */
  private async resolveDataDir(): Promise<string> {
    if (this.dataDir === null) {
      this.dataDir = await getDataDir();
    }
    return this.dataDir;
  }

  /** Full path to the log file. */
  private async resolveLogPath(): Promise<string> {
    const dir = await this.resolveDataDir();
    return join(dir, LOG_FILENAME);
  }

  /**
   * Read and parse the existing log file.  Returns an empty array when the
   * file does not yet exist or is unreadable.
   */
  private async readEntries(): Promise<AgentLogEntry[]> {
    const logPath = await this.resolveLogPath();
    try {
      const raw = await readFile(logPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as AgentLogEntry[];
    } catch {
      // File missing, empty, or corrupt – start fresh.
      return [];
    }
  }

  /**
   * Persist the full entry array back to disk.
   * File permissions are locked to 0o600 (owner read/write only).
   */
  private async writeEntries(entries: AgentLogEntry[]): Promise<void> {
    const logPath = await this.resolveLogPath();
    const dir = await this.resolveDataDir();

    // Ensure the parent directory exists (idempotent).
    await mkdir(dir, { recursive: true, mode: 0o700 });

    const json = JSON.stringify(entries, null, 2);
    await writeFile(logPath, json, { encoding: "utf-8", mode: 0o600 });
  }

  /**
   * Append a single entry to the log file.
   */
  private async append(entry: AgentLogEntry): Promise<void> {
    const entries = await this.readEntries();
    entries.push(entry);
    await this.writeEntries(entries);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Log a successful action.
   */
  async logSuccess(
    entry: Omit<AgentLogEntry, "timestamp" | "result">,
  ): Promise<void> {
    await this.append({
      ...entry,
      timestamp: new Date().toISOString(),
      result: "success",
    });
  }

  /**
   * Log a rejected action (blocked by guardrails or policy).
   */
  async logRejection(
    entry: Omit<AgentLogEntry, "timestamp" | "result" | "response"> & {
      rejectionReason: string;
    },
  ): Promise<void> {
    await this.append({
      ...entry,
      timestamp: new Date().toISOString(),
      result: "rejected",
    });
  }

  /**
   * Log an action that resulted in an error.
   */
  async logError(
    entry: Omit<AgentLogEntry, "timestamp" | "result"> & {
      response: { error: string };
    },
  ): Promise<void> {
    await this.append({
      ...entry,
      timestamp: new Date().toISOString(),
      result: "error",
    });
  }

  /**
   * Retrieve log entries, optionally filtered.
   *
   * Filters:
   *   - `today`  – only entries whose timestamp falls on today (local time)
   *   - `action` – exact match on the `action` field
   *   - `symbol` – exact match on the `symbol` field
   *   - `limit`  – return at most the last N entries (applied after filtering)
   */
  async getEntries(filter?: {
    today?: boolean;
    action?: string;
    symbol?: string;
    limit?: number;
  }): Promise<AgentLogEntry[]> {
    let entries = await this.readEntries();

    if (filter) {
      if (filter.today) {
        const now = new Date();
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).getTime();
        const todayEnd = todayStart + 24 * 60 * 60 * 1000;

        entries = entries.filter((e) => {
          const ts = new Date(e.timestamp).getTime();
          return ts >= todayStart && ts < todayEnd;
        });
      }

      if (filter.action !== undefined) {
        entries = entries.filter((e) => e.action === filter.action);
      }

      if (filter.symbol !== undefined) {
        entries = entries.filter((e) => e.symbol === filter.symbol);
      }

      if (filter.limit !== undefined && filter.limit > 0) {
        entries = entries.slice(-filter.limit);
      }
    }

    return entries;
  }

  /**
   * Return the absolute path to the log file.
   *
   * Note: this is synchronous and returns the *expected* path.  The file may
   * not exist yet if no entries have been written.
   */
  getLogPath(): string {
    return join(this.dataDir ?? join(homedir(), ".pacifica"), LOG_FILENAME);
  }
}
