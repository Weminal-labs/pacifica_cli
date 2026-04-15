// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Stable machine-readable output envelope
// ---------------------------------------------------------------------------
// In --json mode: write ONLY this to stdout. All human chrome goes to stderr.
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | "auth"
  | "validation"
  | "rate_limit"
  | "network"
  | "sdk"
  | "onchain"
  | "intelligence"
  | "guardrail"
  | "config"
  | "parse";

export interface SuccessEnvelope<T = unknown> {
  ok: true;
  data: T;
  meta?: { latency_ms?: number; venue?: string; timestamp?: string };
}

export interface ErrorEnvelope {
  ok: false;
  error: ErrorCategory;
  message: string;
  suggestion?: string;
  retryable?: boolean;
  docs_url?: string;
}

export type Envelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

export function ok<T>(
  data: T,
  meta?: SuccessEnvelope<T>["meta"],
): SuccessEnvelope<T> {
  return { ok: true, data, ...(meta ? { meta } : {}) };
}

export function err(
  category: ErrorCategory,
  message: string,
  opts?: Partial<Omit<ErrorEnvelope, "ok" | "error" | "message">>,
): ErrorEnvelope {
  return { ok: false, error: category, message, ...opts };
}

/**
 * Write success to stdout in json mode.
 * In table mode, this is a no-op — the caller handles rendering directly.
 */
export function writeSuccess<T>(
  data: T,
  jsonMode: boolean,
  meta?: SuccessEnvelope<T>["meta"],
): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(ok(data, meta)) + "\n");
  }
}

/**
 * Write an error envelope to stdout (json) or stderr (table) and set exit
 * code to 1. Does not call process.exit() — allows cleanup handlers to run.
 */
export function writeError(e: ErrorEnvelope, jsonMode: boolean): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(e) + "\n");
  } else {
    process.stderr.write(
      `\nError [${e.error}]: ${e.message}\n${e.suggestion ? `Hint: ${e.suggestion}\n` : ""}`,
    );
  }
  process.exitCode = 1;
}

/**
 * Classify an unknown thrown error into an ErrorEnvelope.
 * Applies heuristic pattern matching on the error message so callers don't
 * need to know which category applies.
 */
export function classifyError(thrown: unknown): ErrorEnvelope {
  const msg = thrown instanceof Error ? thrown.message : String(thrown);

  if (
    msg.includes("403") ||
    msg.includes("401") ||
    msg.includes("auth") ||
    msg.includes("sign")
  ) {
    return {
      ok: false,
      error: "auth",
      message: msg,
      suggestion: "Check your wallet address and agent key in config.",
      retryable: false,
    };
  }

  if (msg.includes("429") || msg.includes("rate")) {
    return {
      ok: false,
      error: "rate_limit",
      message: msg,
      suggestion: "Wait a moment and retry.",
      retryable: true,
    };
  }

  if (
    msg.includes("timeout") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("network") ||
    msg.includes("fetch")
  ) {
    return {
      ok: false,
      error: "network",
      message: msg,
      suggestion: "Check your internet connection.",
      retryable: true,
    };
  }

  if (
    msg.includes("config") ||
    msg.includes("not initialized") ||
    msg.includes("No config")
  ) {
    return {
      ok: false,
      error: "config",
      message: msg,
      suggestion: "Run `pacifica init` to set up your config.",
      retryable: false,
    };
  }

  if (
    msg.includes("guardrail") ||
    msg.includes("spending") ||
    msg.includes("limit")
  ) {
    return {
      ok: false,
      error: "guardrail",
      message: msg,
      suggestion: "Adjust your agent guardrails in config.",
      retryable: false,
    };
  }

  if (
    msg.includes("invalid") ||
    msg.includes("parse") ||
    msg.includes("JSON")
  ) {
    return { ok: false, error: "parse", message: msg, retryable: false };
  }

  if (
    msg.includes("validation") ||
    msg.includes("required") ||
    msg.includes("minimum")
  ) {
    return { ok: false, error: "validation", message: msg, retryable: false };
  }

  return { ok: false, error: "sdk", message: msg, retryable: false };
}
