// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Guardrail Checker
// ---------------------------------------------------------------------------
// Enforces safety rules before AI agent trading operations.  Every MCP write
// operation passes through `GuardrailChecker.check()` which validates the
// request against the current AgentConfig and daily spending state.
//
// Autonomy levels (config.autonomy_level):
//   0 READ_ONLY   — rejects all write actions unconditionally
//   1 PAPER       — rejects all live writes (paper-* actions allowed)
//   2 CONFIRM     — allows writes but always sets needsConfirmation=true
//   3 GUARDED     — enforces all limits; needsConfirmation based on threshold
//   4 AUTONOMOUS  — enforces limits only; needsConfirmation always false
// ---------------------------------------------------------------------------

import type { AgentConfig } from "../config/types.js";

// ---- Public interfaces -----------------------------------------------------

export interface GuardrailCheckRequest {
  action: string;        // e.g. "place_order", "close_position", "cancel_order", "set_tpsl"
  orderSizeUsd?: number; // USD value of the order
  leverage?: number;     // leverage for this order
  symbol?: string;       // trading symbol (e.g. "ETH-USDC-PERP")
}

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;               // Human-readable rejection reason
  needsConfirmation: boolean;    // True if agent must wait for human confirmation
  remainingDailyBudget: number;
  autonomy_level: number;        // Active autonomy level (for logging/display)
}

// ---- Write action categories -----------------------------------------------

/** Actions that move real money or change live positions. */
const LIVE_WRITE_ACTIONS = new Set([
  "place_order",
  "close_position",
  "cancel_order",
  "set_tpsl",
  "arb_open",
  "arb_close",
  "arb_configure",
  "update_leverage",
]);

/** Paper-mode actions — allowed at autonomy level 1. */
const PAPER_ACTIONS = new Set([
  "paper_buy",
  "paper_sell",
  "paper_close",
  "paper_reset",
]);

// ---- Time window helpers ---------------------------------------------------

/**
 * Parse "HH:MM" → minutes since midnight.
 * Returns NaN if the format is invalid.
 */
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/**
 * Returns true if the current UTC time is inside the [from, to) window.
 * Wraps correctly across midnight (e.g. from: "22:00", to: "04:00").
 */
function isInsideTradeWindow(from: string, to: string): boolean {
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const fromMins = parseHHMM(from);
  const toMins = parseHHMM(to);
  if (Number.isNaN(fromMins) || Number.isNaN(toMins)) return true; // invalid config → open
  if (fromMins < toMins) {
    // Same-day window: 09:00–17:00
    return nowMins >= fromMins && nowMins < toMins;
  }
  // Overnight window: 22:00–04:00
  return nowMins >= fromMins || nowMins < toMins;
}

// ---- Guardrail checker -----------------------------------------------------

export class GuardrailChecker {
  private config: AgentConfig;
  private getDailySpend: () => number;

  constructor(config: AgentConfig, getDailySpend: () => number) {
    this.config = config;
    this.getDailySpend = getDailySpend;
  }

  /**
   * Run all guardrail checks against the given request.
   *
   * Checks are evaluated in order; the first failure short-circuits.
   * If every check passes, `needsConfirmation` reflects whether human
   * sign-off is required before executing the action.
   */
  check(request: GuardrailCheckRequest): GuardrailCheckResult {
    const dailySpend = this.getDailySpend();
    const remainingDailyBudget = this.config.daily_spending_limit - dailySpend;
    const level = this.config.autonomy_level ?? 3;

    const reject = (reason: string): GuardrailCheckResult => ({
      allowed: false,
      reason,
      needsConfirmation: false,
      remainingDailyBudget,
      autonomy_level: level,
    });

    // ── 1. Agent enabled ──────────────────────────────────────────────────
    if (!this.config.enabled) {
      return reject("Agent trading is disabled. Run `pacifica agent start` to re-enable.");
    }

    // ── 2. Autonomy level gate ────────────────────────────────────────────
    const isLiveWrite = LIVE_WRITE_ACTIONS.has(request.action);
    const isPaper = PAPER_ACTIONS.has(request.action);

    if (level === 0) {
      // READ_ONLY — no writes at all
      if (isLiveWrite || isPaper) {
        return reject("Autonomy level 0 (READ_ONLY): all write actions are blocked");
      }
    } else if (level === 1) {
      // PAPER — only paper trades
      if (isLiveWrite) {
        return reject(
          "Autonomy level 1 (PAPER): live write actions are blocked. " +
          "Use `pacifica paper *` commands or raise autonomy_level.",
        );
      }
    }
    // level 2 (CONFIRM), 3 (GUARDED), 4 (AUTONOMOUS) pass through to further checks

    // ── 3. Action blocklist ───────────────────────────────────────────────
    if (this.config.blocked_actions.includes(request.action)) {
      return reject(`Action '${request.action}' is explicitly blocked`);
    }

    // ── 4. Action allowlist ───────────────────────────────────────────────
    if (!this.config.allowed_actions.includes(request.action)) {
      return reject(`Action '${request.action}' is not in the allowed_actions list`);
    }

    // ── 5. Symbol restrictions ────────────────────────────────────────────
    if (request.symbol) {
      const sym = request.symbol.toUpperCase();

      if (
        this.config.forbidden_symbols &&
        this.config.forbidden_symbols.some((s) => s.toUpperCase() === sym)
      ) {
        return reject(`Symbol '${sym}' is in the forbidden_symbols list`);
      }

      if (
        this.config.allowed_symbols &&
        this.config.allowed_symbols.length > 0 &&
        !this.config.allowed_symbols.some((s) => s.toUpperCase() === sym)
      ) {
        return reject(
          `Symbol '${sym}' is not in the allowed_symbols list. ` +
          `Permitted: ${this.config.allowed_symbols.join(", ")}`,
        );
      }
    }

    // ── 6. Trade window ───────────────────────────────────────────────────
    if (isLiveWrite && this.config.trade_window) {
      const { from, to } = this.config.trade_window;
      if (!isInsideTradeWindow(from, to)) {
        return reject(
          `Outside trade window ${from}–${to} UTC. No live orders permitted right now.`,
        );
      }
    }

    // ── 7. Per-order size limit ───────────────────────────────────────────
    if (
      request.orderSizeUsd !== undefined &&
      request.orderSizeUsd > this.config.max_order_size
    ) {
      return reject(
        `Order size $${request.orderSizeUsd.toFixed(2)} exceeds per-order limit of $${this.config.max_order_size}`,
      );
    }

    // ── 8. Leverage limit ─────────────────────────────────────────────────
    if (
      request.leverage !== undefined &&
      request.leverage > this.config.max_leverage
    ) {
      return reject(
        `Leverage ${request.leverage}x exceeds configured maximum of ${this.config.max_leverage}x`,
      );
    }

    // ── 9. Daily spending limit ───────────────────────────────────────────
    if (
      request.orderSizeUsd !== undefined &&
      dailySpend + request.orderSizeUsd > this.config.daily_spending_limit
    ) {
      return reject(
        `Daily limit would be exceeded. ` +
        `Spent: $${dailySpend.toFixed(2)} / $${this.config.daily_spending_limit}. ` +
        `Remaining: $${remainingDailyBudget.toFixed(2)}`,
      );
    }

    // ── 10. Determine confirmation requirement ────────────────────────────
    let needsConfirmation: boolean;
    if (level === 4) {
      // AUTONOMOUS: never ask for confirmation
      needsConfirmation = false;
    } else if (level === 2) {
      // CONFIRM: always ask
      needsConfirmation = isLiveWrite;
    } else {
      // GUARDED (3): ask only above the threshold
      needsConfirmation =
        request.orderSizeUsd !== undefined &&
        request.orderSizeUsd > this.config.require_confirmation_above;
    }

    return {
      allowed: true,
      needsConfirmation,
      remainingDailyBudget,
      autonomy_level: level,
    };
  }

  /** Describe the current autonomy level as a human-readable string. */
  describeAutonomyLevel(): string {
    const labels: Record<number, string> = {
      0: "READ_ONLY — no writes permitted",
      1: "PAPER — paper trades only, no live orders",
      2: "CONFIRM — every write requires human confirmation",
      3: "GUARDED — limits enforced, confirmation above threshold",
      4: "AUTONOMOUS — limits only, no confirmation required",
    };
    return labels[this.config.autonomy_level ?? 3] ?? "unknown";
  }

  /** Replace the active config (used by agent start/stop/config commands). */
  updateConfig(config: AgentConfig): void {
    this.config = config;
  }

  /** Return the active guardrail config. */
  getConfig(): AgentConfig {
    return this.config;
  }
}
