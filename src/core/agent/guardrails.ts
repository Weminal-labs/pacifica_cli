// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Guardrail Checker
// ---------------------------------------------------------------------------
// Enforces safety rules before AI agent trading operations.  Every MCP write
// operation passes through `GuardrailChecker.check()` which validates the
// request against the current AgentConfig and daily spending state.
// ---------------------------------------------------------------------------

import { AgentConfig } from "../config/types.js";

// ---- Public interfaces -----------------------------------------------------

export interface GuardrailCheckRequest {
  action: string; // e.g. "place_order", "close_position", "cancel_order", "set_tpsl"
  orderSizeUsd?: number; // USD value of the order
  leverage?: number; // leverage for this order
}

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string; // Human-readable rejection reason
  needsConfirmation: boolean; // True if above confirmation threshold
  remainingDailyBudget: number;
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
   * Checks are evaluated in order – the first failure short-circuits and
   * returns immediately.  If every check passes the result has `allowed: true`
   * and `needsConfirmation` is set when the order size exceeds the
   * confirmation threshold.
   */
  check(request: GuardrailCheckRequest): GuardrailCheckResult {
    const dailySpend = this.getDailySpend();
    const remainingDailyBudget =
      this.config.daily_spending_limit - dailySpend;

    const reject = (reason: string): GuardrailCheckResult => ({
      allowed: false,
      reason,
      needsConfirmation: false,
      remainingDailyBudget,
    });

    // 1. Agent must be enabled
    if (!this.config.enabled) {
      return reject(
        "Agent trading is disabled. Run `pacifica agent start` to re-enable.",
      );
    }

    // 2a. Action must not be explicitly blocked
    if (this.config.blocked_actions.includes(request.action)) {
      return reject(`Action '${request.action}' is blocked`);
    }

    // 2b. Action must be in the allow-list
    if (!this.config.allowed_actions.includes(request.action)) {
      return reject(`Action '${request.action}' is not allowed`);
    }

    // 3. Order size must not exceed per-order limit
    if (
      request.orderSizeUsd !== undefined &&
      request.orderSizeUsd > this.config.max_order_size
    ) {
      return reject(
        `Order size $${request.orderSizeUsd} exceeds limit of $${this.config.max_order_size}`,
      );
    }

    // 4. Leverage must not exceed configured maximum
    if (
      request.leverage !== undefined &&
      request.leverage > this.config.max_leverage
    ) {
      return reject(
        `Leverage ${request.leverage}x exceeds limit of ${this.config.max_leverage}x`,
      );
    }

    // 5. Daily spending limit must not be exceeded
    if (
      request.orderSizeUsd !== undefined &&
      dailySpend + request.orderSizeUsd > this.config.daily_spending_limit
    ) {
      return reject(
        `Daily limit would be exceeded. Remaining: $${remainingDailyBudget}`,
      );
    }

    // 6. Determine whether manual confirmation is required
    const needsConfirmation =
      request.orderSizeUsd !== undefined &&
      request.orderSizeUsd > this.config.require_confirmation_above;

    return {
      allowed: true,
      needsConfirmation,
      remainingDailyBudget,
    };
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
