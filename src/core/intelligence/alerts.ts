// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Alert Manager
// ---------------------------------------------------------------------------
// Manages persistent price / funding / volume alerts stored in
// ~/.pacifica/alerts.json.  Follows the same lazy-load, read/write pattern
// as JournalLogger: no state is held between calls except the cached data
// directory path.
// ---------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDataDir } from "../config/loader.js";
import type { FundingRate, Market } from "../sdk/types.js";
import type {
  Alert,
  AlertStatus,
  AlertTriageResult,
  AlertType,
  AlertUrgency,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALERTS_FILENAME = "alerts.json";
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

// ---------------------------------------------------------------------------
// Node error type guard
// ---------------------------------------------------------------------------

/**
 * Type guard for Node.js system errors that carry a `code` property.
 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

// ---------------------------------------------------------------------------
// AlertManager
// ---------------------------------------------------------------------------

/**
 * Manages creation, retrieval, and triage of persistent market alerts.
 *
 * Alerts are stored in `~/.pacifica/alerts.json` with 0o600 file permissions.
 * Instantiate once and pass the instance around — the data directory is
 * resolved lazily and then cached for the lifetime of the instance.
 */
export class AlertManager {
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
   * Read all alerts from disk.
   * Returns an empty array when the file does not exist yet (first run).
   */
  private async readAlerts(): Promise<Alert[]> {
    const dir = await this.resolveDataDir();
    const filePath = join(dir, ALERTS_FILENAME);

    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      // File not found – normal on first run.
      if (isNodeError(err) && err.code === "ENOENT") {
        return [];
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read alerts at ${filePath}: ${message}`);
    }

    // Handle empty file gracefully.
    const trimmed = raw.trim();
    if (trimmed.length === 0) return [];

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error("Alerts file does not contain a JSON array");
      }
      return parsed as Alert[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse alerts at ${filePath}: ${message}`);
    }
  }

  /**
   * Persist the full alert list to disk atomically (write-to-temp + rename).
   * A crash mid-write never corrupts the live alerts file.
   */
  private async writeAlerts(alerts: Alert[]): Promise<void> {
    const dir = await this.resolveDataDir();
    const filePath = join(dir, ALERTS_FILENAME);
    const tmpPath = join(dir, `alerts-${randomBytes(6).toString("hex")}.tmp`);

    // Ensure directory exists (idempotent).
    await mkdir(dir, { recursive: true, mode: DIR_MODE });

    const json = JSON.stringify(alerts, null, 2) + "\n";
    await writeFile(tmpPath, json, { encoding: "utf-8", mode: FILE_MODE });
    await rename(tmpPath, filePath);

    // Enforce permissions even when the file already existed.
    await chmod(filePath, FILE_MODE);
  }

  // -------------------------------------------------------------------------
  // Public API — CRUD
  // -------------------------------------------------------------------------

  /**
   * Return all stored alerts (all statuses).
   */
  async listAlerts(): Promise<Alert[]> {
    return this.readAlerts();
  }

  /**
   * Create and persist a new alert.
   *
   * The `id`, `status`, and `createdAt` fields are generated automatically.
   * Returns the full persisted alert.
   *
   * @param input - Symbol, alert type, threshold value, and optional note.
   */
  async addAlert(input: {
    symbol: string;
    type: AlertType;
    threshold: number;
    note?: string;
  }): Promise<Alert> {
    const alert: Alert = {
      id: randomUUID(),
      symbol: input.symbol,
      type: input.type,
      threshold: input.threshold,
      status: "active" as AlertStatus,
      createdAt: new Date().toISOString(),
      ...(input.note !== undefined ? { note: input.note } : {}),
    };

    const alerts = await this.readAlerts();
    alerts.push(alert);
    await this.writeAlerts(alerts);

    return alert;
  }

  /**
   * Remove an alert by id.
   *
   * @returns `true` when the alert was found and removed, `false` when it did
   *          not exist.
   */
  async removeAlert(id: string): Promise<boolean> {
    const alerts = await this.readAlerts();
    const index = alerts.findIndex((a) => a.id === id);
    if (index === -1) return false;

    alerts.splice(index, 1);
    await this.writeAlerts(alerts);
    return true;
  }

  /**
   * Mark an alert as dismissed so it no longer appears in triage results.
   *
   * @returns `true` when the alert was found and updated, `false` otherwise.
   */
  async dismissAlert(id: string): Promise<boolean> {
    const alerts = await this.readAlerts();
    const alert = alerts.find((a) => a.id === id);
    if (!alert) return false;

    alert.status = "dismissed";
    await this.writeAlerts(alerts);
    return true;
  }

  // -------------------------------------------------------------------------
  // Public API — triage
  // -------------------------------------------------------------------------

  /**
   * Evaluate all active alerts against current market data.
   *
   * For each alert the method computes:
   * - `currentValue` — the market value relevant to the alert type.
   * - `distancePct`  — how far the value is from the threshold.
   *   - Negative: threshold already breached (triggered).
   *   - Positive: still approaching the threshold.
   * - `urgency`      — "triggered" | "near" (≤ 5 %) | "dormant" (> 5 %).
   *
   * When an alert transitions to "triggered" its `status` and `triggeredAt`
   * fields are updated on disk.
   *
   * Results are sorted: triggered first, near second, dormant last.
   *
   * @param markets      - Current market snapshots (keyed by symbol).
   * @param fundingRates - Optional map from symbol → latest FundingRate.
   */
  async checkAlerts(
    markets: Market[],
    fundingRates?: Map<string, FundingRate>,
  ): Promise<AlertTriageResult[]> {
    const alerts = await this.readAlerts();

    // Only evaluate active alerts.
    const activeAlerts = alerts.filter((a) => a.status === "active");
    if (activeAlerts.length === 0) return [];

    // Build a fast lookup map for markets.
    const marketMap = new Map<string, Market>();
    for (const m of markets) {
      marketMap.set(m.symbol, m);
    }

    const results: AlertTriageResult[] = [];
    let dirty = false; // track whether any alert status changed

    for (const alert of activeAlerts) {
      const market = marketMap.get(alert.symbol);

      // If the market is not present in the supplied data, skip this alert.
      if (!market) continue;

      let currentValue: number;
      let triggered: boolean;

      switch (alert.type) {
        case "price_above":
          currentValue = market.markPrice;
          triggered = currentValue >= alert.threshold;
          break;

        case "price_below":
          currentValue = market.markPrice;
          triggered = currentValue <= alert.threshold;
          break;

        case "funding_above": {
          const fr = fundingRates?.get(alert.symbol);
          currentValue = fr?.fundingRate ?? market.fundingRate;
          triggered = currentValue >= alert.threshold;
          break;
        }

        case "funding_below": {
          const fr = fundingRates?.get(alert.symbol);
          currentValue = fr?.fundingRate ?? market.fundingRate;
          triggered = currentValue <= alert.threshold;
          break;
        }

        case "volume_spike":
          currentValue = market.volume24h;
          triggered = currentValue >= alert.threshold;
          break;

        default:
          continue;
      }

      // Compute distancePct:
      //   triggered → negative  ((current - threshold) / threshold * 100)
      //   pending   → positive  ((threshold - current) / threshold * 100)
      const distancePct =
        alert.threshold !== 0
          ? triggered
            ? ((currentValue - alert.threshold) / alert.threshold) * 100
            : ((alert.threshold - currentValue) / alert.threshold) * 100
          : 0;

      // Urgency classification:
      //   triggered: distancePct <= 0
      //   near:      0 < distancePct <= 5
      //   dormant:   distancePct > 5
      const urgency: AlertUrgency =
        distancePct <= 0 ? "triggered" : distancePct <= 5 ? "near" : "dormant";

      // Persist state change when the alert fires for the first time.
      // `alert` is a direct reference into `alerts` (via Array.filter which
      // copies references, not values), so mutating it here is sufficient.
      if (triggered && alert.status === "active") {
        alert.status = "triggered";
        alert.triggeredAt = new Date().toISOString();
        dirty = true;
      }

      results.push({ alert: { ...alert }, currentValue, distancePct, urgency });
    }

    // Persist updated statuses if any alert was triggered.
    if (dirty) {
      await this.writeAlerts(alerts);
    }

    // Sort: triggered first, near second, dormant last.
    return sortTriageResults(results);
  }

  /**
   * Return a triage view of all non-dismissed alerts without making any
   * API calls.  Uses the last-known status stored on disk to assign urgency.
   *
   * Alerts with `status === "triggered"` are treated as urgency "triggered".
   * All other active alerts are returned as urgency "dormant" with
   * `currentValue = 0` and `distancePct = 0` (no live data available).
   *
   * Dismissed alerts are excluded.  Dormant results are only included when
   * `includeDormant` is `true`.
   *
   * @param includeDormant - When `true`, dormant alerts are included in results.
   */
  async triage(includeDormant = false): Promise<AlertTriageResult[]> {
    const alerts = await this.readAlerts();

    const results: AlertTriageResult[] = [];

    for (const alert of alerts) {
      // Skip dismissed alerts entirely.
      if (alert.status === "dismissed") continue;

      let urgency: AlertUrgency;
      let distancePct: number;

      if (alert.status === "triggered") {
        urgency = "triggered";
        distancePct = 0; // threshold already breached; exact distance unknown without live data
      } else {
        // "active" — no live data available in this path.
        urgency = "dormant";
        distancePct = 0;
      }

      if (!includeDormant && urgency === "dormant") continue;

      results.push({
        alert,
        currentValue: 0,
        distancePct,
        urgency,
      });
    }

    return sortTriageResults(results);
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Sort triage results so that the most urgent alerts appear first:
 *   1. triggered
 *   2. near
 *   3. dormant
 */
function sortTriageResults(results: AlertTriageResult[]): AlertTriageResult[] {
  const urgencyOrder: Record<AlertUrgency, number> = {
    triggered: 0,
    near: 1,
    dormant: 2,
  };

  return results.sort(
    (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency],
  );
}
