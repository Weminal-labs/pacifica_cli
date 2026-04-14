// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Intelligence Store
// ---------------------------------------------------------------------------
// Append-only JSON persistence for intelligence records, verified patterns,
// and reputation scores.  Mirrors the pattern used by JournalLogger.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "../config/loader.js";
import type {
  IntelligenceRecord,
  DetectedPattern,
  TraderReputation,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

const RECORDS_FILE = "intelligence-records.json";
const PATTERNS_FILE = "patterns-verified.json";
const REPUTATION_FILE = "reputation-scores.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function filePath(filename: string): Promise<string> {
  const dir = await getDataDir();
  return join(dir, filename);
}

async function readJson<T>(filename: string): Promise<T[]> {
  const fp = await filePath(filename);
  let raw: string;
  try {
    raw = await readFile(fp, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read ${filename}: ${msg}`);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error(`${filename} is not a JSON array`);
    return parsed as T[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${filename}: ${msg}`);
  }
}

async function writeJson<T>(filename: string, data: T[]): Promise<void> {
  const fp = await filePath(filename);
  const dir = await getDataDir();
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(fp, json, { encoding: "utf-8", mode: FILE_MODE });
  await chmod(fp, FILE_MODE);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

// ---------------------------------------------------------------------------
// IntelligenceRecord API
// ---------------------------------------------------------------------------

/** Append a new record to the store. */
export async function appendRecord(record: IntelligenceRecord): Promise<void> {
  const records = await readJson<IntelligenceRecord>(RECORDS_FILE);
  records.push(record);
  await writeJson(RECORDS_FILE, records);
}

/** Load all intelligence records. */
export async function loadRecords(): Promise<IntelligenceRecord[]> {
  return readJson<IntelligenceRecord>(RECORDS_FILE);
}

/** Update specific fields on an existing record (by id). */
export async function updateRecord(
  id: string,
  update: Partial<IntelligenceRecord>,
): Promise<void> {
  const records = await readJson<IntelligenceRecord>(RECORDS_FILE);
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return; // record not found — silent no-op
  records[idx] = { ...records[idx], ...update } as IntelligenceRecord;
  await writeJson(RECORDS_FILE, records);
}

/** Return only records where closed_at is undefined (position still open). */
export async function getOpenRecords(): Promise<IntelligenceRecord[]> {
  const records = await loadRecords();
  return records.filter((r) => r.closed_at === undefined);
}

// ---------------------------------------------------------------------------
// DetectedPattern API
// ---------------------------------------------------------------------------

/** Overwrite the verified patterns file with a new set. */
export async function savePatterns(patterns: DetectedPattern[]): Promise<void> {
  await writeJson(PATTERNS_FILE, patterns);
}

/** Load all verified patterns. */
export async function loadPatterns(): Promise<DetectedPattern[]> {
  return readJson<DetectedPattern>(PATTERNS_FILE);
}

// ---------------------------------------------------------------------------
// TraderReputation API
// ---------------------------------------------------------------------------

/** Persist the full reputation map. */
export async function saveReputation(
  rep: Map<string, TraderReputation>,
): Promise<void> {
  const arr = Array.from(rep.values());
  await writeJson(REPUTATION_FILE, arr);
}

/** Load the reputation map keyed by trader_id. */
export async function loadReputation(): Promise<Map<string, TraderReputation>> {
  const arr = await readJson<TraderReputation>(REPUTATION_FILE);
  return new Map(arr.map((r) => [r.trader_id, r]));
}
