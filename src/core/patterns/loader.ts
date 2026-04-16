// ---------------------------------------------------------------------------
// Pattern loader — reads ~/.pacifica/patterns/*.yaml
// ---------------------------------------------------------------------------

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getDataDir } from "../config/loader.js";
import { PatternSchema, type Pattern } from "./types.js";

const PATTERNS_DIRNAME = "patterns";

export async function getPatternsDir(): Promise<string> {
  const dir = join(await getDataDir(), PATTERNS_DIRNAME);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export class PatternParseError extends Error {
  constructor(public readonly file: string, public readonly detail: string) {
    super(`Failed to parse pattern ${file}: ${detail}`);
    this.name = "PatternParseError";
  }
}

export function parsePattern(source: string, filename = "<inline>"): Pattern {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (err) {
    throw new PatternParseError(filename, (err as Error).message);
  }
  const result = PatternSchema.safeParse(raw);
  if (!result.success) {
    throw new PatternParseError(filename, result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"} — ${i.message}`,
    ).join("; "));
  }
  return result.data;
}

/** Load every pattern from ~/.pacifica/patterns/. Invalid files throw. */
export async function loadPatterns(): Promise<Pattern[]> {
  const dir = await getPatternsDir();
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const patterns: Pattern[] = [];
  for (const file of files) {
    const src = await readFile(join(dir, file), "utf-8");
    patterns.push(parsePattern(src, file));
  }
  return patterns;
}

/** Load one pattern by name. Returns null if it doesn't exist. */
export async function loadPattern(name: string): Promise<Pattern | null> {
  const dir = await getPatternsDir();
  for (const ext of [".yaml", ".yml"]) {
    try {
      const src = await readFile(join(dir, `${name}${ext}`), "utf-8");
      return parsePattern(src, `${name}${ext}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Include resolution — compose patterns by inheriting `when:` conditions
// ---------------------------------------------------------------------------

/**
 * Resolve a pattern's `include:` references against the full library.
 * Included patterns' `when:` conditions are prepended (in order) to the
 * pattern's own `when:` conditions. Resolution is flat — one level deep.
 * Circular includes and missing references throw PatternParseError.
 */
export function resolveIncludes(
  pattern: Pattern,
  allPatterns: Pattern[],
): Pattern {
  if (pattern.include.length === 0) return pattern;

  const byName = new Map(allPatterns.map((p) => [p.name, p]));

  // Circular detection: if any included pattern also includes the current one
  const includedConditions = pattern.include.flatMap((refName) => {
    const ref = byName.get(refName);
    if (!ref) {
      throw new PatternParseError(
        pattern.name,
        `include references unknown pattern "${refName}"`,
      );
    }
    if (ref.include.includes(pattern.name)) {
      throw new PatternParseError(
        pattern.name,
        `circular include detected: "${pattern.name}" <-> "${refName}"`,
      );
    }
    return ref.when;
  });

  return {
    ...pattern,
    when: [...includedConditions, ...pattern.when],
  };
}

/** Write a pattern to disk as YAML. Used by Claude via MCP. */
export async function savePattern(pattern: Pattern): Promise<string> {
  // Re-validate before writing so callers can't persist garbage.
  const valid = PatternSchema.parse(pattern);
  const dir = await getPatternsDir();
  const path = join(dir, `${valid.name}.yaml`);
  const yaml = await import("yaml");
  await writeFile(path, yaml.stringify(valid), { mode: 0o600 });
  return path;
}
