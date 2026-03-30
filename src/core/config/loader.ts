// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Configuration Loader / Writer
// ---------------------------------------------------------------------------
// Handles reading, validating, and persisting .pacifica.yaml configuration
// files.  Uses atomic writes (temp + rename) to prevent corruption.
// ---------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir, access, chmod } from "node:fs/promises";
import { accessSync, constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod/v4";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DEFAULT_CONFIG } from "./types.js";
import type { PacificaConfig } from "./types.js";

const CONFIG_FILENAME = ".pacifica.yaml";
const CONFIG_DIR = ".pacifica";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const agentConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.agent.enabled),
  daily_spending_limit: z
    .number()
    .nonnegative()
    .default(DEFAULT_CONFIG.agent.daily_spending_limit),
  max_order_size: z
    .number()
    .positive()
    .default(DEFAULT_CONFIG.agent.max_order_size),
  max_leverage: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(DEFAULT_CONFIG.agent.max_leverage),
  allowed_actions: z
    .array(z.string())
    .default(DEFAULT_CONFIG.agent.allowed_actions),
  blocked_actions: z
    .array(z.string())
    .default(DEFAULT_CONFIG.agent.blocked_actions),
  require_confirmation_above: z
    .number()
    .nonnegative()
    .default(DEFAULT_CONFIG.agent.require_confirmation_above),
});

export const configSchema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  private_key: z.string().min(1, "Private key is required"),
  defaults: z
    .object({
      leverage: z
        .number()
        .int()
        .positive()
        .max(100)
        .default(DEFAULT_CONFIG.defaults.leverage),
      slippage: z
        .number()
        .positive()
        .default(DEFAULT_CONFIG.defaults.slippage),
      tp_distance: z
        .number()
        .positive()
        .default(DEFAULT_CONFIG.defaults.tp_distance),
      sl_distance: z
        .number()
        .positive()
        .default(DEFAULT_CONFIG.defaults.sl_distance),
    })
    .default(DEFAULT_CONFIG.defaults),
  agent: agentConfigSchema.default(DEFAULT_CONFIG.agent),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mask sensitive fields so they never leak into error messages.
 * Shows only the last 4 characters (or "****" if shorter).
 */
function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

/**
 * Build a human-readable error string from a zod error, masking secrets.
 */
function formatValidationError(
  error: z.ZodError,
  raw: Record<string, unknown>,
): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join(".");
    return `  - ${path}: ${issue.message}`;
  });

  const masked: Record<string, unknown> = { ...raw };
  if (typeof masked.private_key === "string") {
    masked.private_key = maskSecret(masked.private_key);
  }

  return [
    "Invalid Pacifica configuration:",
    ...issues,
    "",
    `Config (secrets masked): ${JSON.stringify(masked, null, 2)}`,
  ].join("\n");
}

/**
 * Return true if the file at `filePath` exists and is readable.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the config file path.
 *
 * Search order:
 *   1. `.pacifica.yaml` in the current working directory
 *   2. `~/.pacifica.yaml`
 *
 * Returns the first path that exists, or `~/.pacifica.yaml` as default.
 */
export function getConfigPath(): string {
  const cwdPath = join(process.cwd(), CONFIG_FILENAME);
  try {
    accessSync(cwdPath, fsConstants.R_OK);
    return cwdPath;
  } catch {
    // fall through
  }

  return join(homedir(), CONFIG_FILENAME);
}

/**
 * Returns true when a config file already exists at the resolved path.
 */
export function configExists(): boolean {
  const configPath = getConfigPath();
  try {
    accessSync(configPath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load and validate Pacifica configuration from a YAML file.
 *
 * Falls back to `DEFAULT_CONFIG` for any missing fields via a deep merge so
 * that older config files remain forward-compatible.
 */
export async function loadConfig(
  configPath?: string,
): Promise<PacificaConfig> {
  const resolved = configPath ?? getConfigPath();

  if (!(await fileExists(resolved))) {
    throw new Error(
      `Configuration file not found at ${resolved}. Run "pacifica init" to create one.`,
    );
  }

  let raw: string;
  try {
    raw = await readFile(resolved, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config at ${resolved}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse YAML config at ${resolved}: ${message}`);
  }

  // Deep-merge with defaults so missing optional keys are filled in.
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    (parsed ?? {}) as Record<string, unknown>,
  );

  const result = configSchema.safeParse(merged);

  if (!result.success) {
    throw new Error(
      formatValidationError(
        result.error,
        merged as Record<string, unknown>,
      ),
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

const YAML_HEADER = [
  "# Pacifica DEX CLI configuration",
  "# Docs: https://docs.pacifica.exchange/cli/config",
  "",
].join("\n");

/**
 * Persist a `PacificaConfig` to disk as YAML.
 *
 * Uses atomic writes (write to temp, then rename) so a crash mid-write never
 * leaves a corrupted config on disk.  File permissions are set to 0o600
 * (owner read/write only) to protect the private key.
 */
export async function saveConfig(
  config: PacificaConfig,
  configPath?: string,
): Promise<void> {
  const resolved = configPath ?? join(homedir(), CONFIG_FILENAME);
  const dir = dirname(resolved);

  // Ensure the parent directory exists with restricted permissions.
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const yamlContent =
    YAML_HEADER +
    stringifyYaml(config, {
      indent: 2,
      lineWidth: 120,
    });

  // Atomic write: temp file in the same directory (same filesystem) to
  // guarantee `rename` is atomic.
  const tempFile = join(
    dir,
    `.pacifica_tmp_${randomBytes(8).toString("hex")}`,
  );

  try {
    await writeFile(tempFile, yamlContent, { encoding: "utf-8", mode: 0o600 });
    await rename(tempFile, resolved);
    // Ensure permissions are correct even if the file already existed.
    await chmod(resolved, 0o600);
  } catch (err) {
    // Clean up the temp file on failure (best-effort).
    try {
      await access(tempFile, fsConstants.F_OK);
      const { unlink } = await import("node:fs/promises");
      await unlink(tempFile);
    } catch {
      // temp file already gone — nothing to do
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write config to ${resolved}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

/**
 * Returns the path to `~/.pacifica/`.
 * Creates the directory with 0o700 permissions if it does not exist.
 */
export async function getDataDir(): Promise<string> {
  const dir = join(homedir(), CONFIG_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge `source` into `target`.  Arrays in `source` replace
 * those in `target` wholesale (no element-level merge).
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}
