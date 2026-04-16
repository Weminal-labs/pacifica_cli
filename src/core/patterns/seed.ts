// ---------------------------------------------------------------------------
// Pattern seeder — copies bundled example patterns into ~/.pacifica/patterns/
// on first-time setup so a new trader has something to backtest and modify.
// ---------------------------------------------------------------------------
// Design: seed is idempotent and non-destructive. It only writes a file if
// the target does not already exist. That means:
//   - first run after install → 3 examples land in ~/.pacifica/patterns/
//   - subsequent runs → user's edits are preserved, nothing overwritten
//   - user deletes an example → that specific example re-seeds on next init
//     (arguably surprising; caller can skip this behavior by passing
//      skipExisting=true at directory level — see below).
// ---------------------------------------------------------------------------

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPatternsDir } from "./loader.js";

// Resolve the bundled examples dir relative to THIS file, not the CWD, so it
// works regardless of where the user invokes pacifica from.
//   dev:   src/core/patterns/seed.ts → examples/patterns/
//   build: dist/..../seed.js          → ../examples/patterns/ (shipped via npm files[])
function findExamplesDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up looking for `examples/patterns/`. Covers dev (src/core/patterns)
  // and bundled (dist/...) layouts.
  for (let dir = here, i = 0; i < 6; i++, dir = dirname(dir)) {
    const candidate = join(dir, "examples", "patterns");
    try {
      readdirSync(candidate);
      return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

export interface SeedResult {
  copied: string[];
  skipped: string[];
  examplesDir: string | null;
}

/**
 * Copy example patterns into ~/.pacifica/patterns/ — only files that don't
 * already exist. Returns what was copied vs skipped so callers can report.
 */
export async function seedExamplePatterns(): Promise<SeedResult> {
  const target = await getPatternsDir();
  const examples = findExamplesDir();
  const result: SeedResult = { copied: [], skipped: [], examplesDir: examples };

  if (!examples) return result;

  let entries: string[];
  try {
    entries = await readdir(examples);
  } catch {
    return result; // bundled examples not present (shouldn't happen)
  }

  const yamls = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  for (const file of yamls) {
    const targetPath = join(target, file);
    // Skip if already exists — preserve user edits.
    try {
      await readFile(targetPath);
      result.skipped.push(file);
      continue;
    } catch {
      // ENOENT → proceed to copy
    }
    const src = await readFile(join(examples, file), "utf-8");
    await mkdir(target, { recursive: true, mode: 0o700 });
    await writeFile(targetPath, src, { mode: 0o600 });
    result.copied.push(file);
  }

  return result;
}
