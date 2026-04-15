// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Verifiable Audit Logger
// ---------------------------------------------------------------------------
// Every significant action is recorded as an append-only chain of entries in
// ~/.pacifica/audit.jsonl.  Each entry carries a SHA-256 hash of the previous
// entry so that tampering with history is detectable.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  seq: number;
  timestamp: string;
  action: string;
  params: Record<string, unknown>;
  result: "ok" | "error" | "rejected";
  error_msg?: string;
  prev_hash: string;
  hash: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const AUDIT_DIR = join(homedir(), ".pacifica");
const AUDIT_PATH = join(AUDIT_DIR, "audit.jsonl");

function ensureAuditDir(): void {
  mkdirSync(AUDIT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hashEntry(entryWithoutHash: Omit<AuditEntry, "hash">): string {
  return sha256(JSON.stringify(entryWithoutHash));
}

// ---------------------------------------------------------------------------
// Internal: read all entries from the log
// ---------------------------------------------------------------------------

async function readAllEntries(): Promise<AuditEntry[]> {
  try {
    const raw = await readFile(AUDIT_PATH, "utf-8");
    const lines = raw.trim().split("\n").filter((l) => l.trim() !== "");
    const entries: AuditEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip malformed lines silently
      }
    }
    return entries;
  } catch {
    // File missing – start fresh
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append a new audit entry to ~/.pacifica/audit.jsonl.
 * The entry is chained to the previous one via SHA-256 hashes.
 */
export async function appendAuditEntry(
  action: string,
  params: Record<string, unknown>,
  result: "ok" | "error" | "rejected",
  errorMsg?: string,
): Promise<void> {
  ensureAuditDir();

  const entries = await readAllEntries();
  const last = entries.length > 0 ? entries[entries.length - 1] : null;

  const seq = last ? last.seq + 1 : 1;
  const prevHash = last ? last.hash : "genesis";

  const entryWithoutHash: Omit<AuditEntry, "hash"> = {
    seq,
    timestamp: new Date().toISOString(),
    action,
    params,
    result,
    ...(errorMsg !== undefined ? { error_msg: errorMsg } : {}),
    prev_hash: prevHash,
  };

  const hash = hashEntry(entryWithoutHash);

  const fullEntry: AuditEntry = { ...entryWithoutHash, hash };

  await appendFile(AUDIT_PATH, JSON.stringify(fullEntry) + "\n", "utf-8");
}

/**
 * Verify the integrity of the audit chain.
 * Returns whether the chain is valid, the number of verified entries,
 * and (if broken) the sequence number of the first broken entry.
 */
export async function verifyAuditLog(): Promise<{
  valid: boolean;
  entries: number;
  first_broken_at?: number;
  error?: string;
}> {
  let entries: AuditEntry[];
  try {
    entries = await readAllEntries();
  } catch (err) {
    return {
      valid: false,
      entries: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (entries.length === 0) {
    return { valid: true, entries: 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify this entry's own hash
    const { hash, ...entryWithoutHash } = entry;
    const expectedHash = hashEntry(entryWithoutHash as Omit<AuditEntry, "hash">);
    if (hash !== expectedHash) {
      return { valid: false, entries: i, first_broken_at: entry.seq };
    }

    // Verify prev_hash chain
    if (i === 0) {
      if (entry.prev_hash !== "genesis") {
        return { valid: false, entries: 0, first_broken_at: entry.seq };
      }
    } else {
      const prevEntry = entries[i - 1];
      if (entry.prev_hash !== prevEntry.hash) {
        return { valid: false, entries: i, first_broken_at: entry.seq };
      }
    }
  }

  return { valid: true, entries: entries.length };
}

/**
 * Return the last N entries from the audit log.
 */
export async function tailAuditLog(n: number): Promise<AuditEntry[]> {
  const entries = await readAllEntries();
  return entries.slice(-n);
}

/**
 * Return ALL entries from the audit log.
 */
export async function readAuditLog(): Promise<AuditEntry[]> {
  return readAllEntries();
}
