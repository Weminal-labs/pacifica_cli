"use client";
// ---------------------------------------------------------------------------
// usePattern — fetch a pattern by ID with fallback chain:
//   1. local intelligence server (localhost:4242) — 1.5s timeout
//   2. SEED_PATTERNS in web/lib/seed-patterns.ts
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { SEED_PATTERNS } from "../../../lib/seed-patterns";
import type { Pattern } from "../../../lib/types";

interface PatternState {
  pattern: Pattern | null;
  loading: boolean;
}

export function usePattern(patternId: string | null): PatternState {
  const [state, setState] = useState<PatternState>({ pattern: null, loading: false });

  useEffect(() => {
    if (!patternId) { setState({ pattern: null, loading: false }); return; }

    setState({ pattern: null, loading: true });

    (async () => {
      // 1. Try local intelligence server
      try {
        const res = await fetch(
          `http://localhost:4242/api/intelligence/patterns`,
          { signal: AbortSignal.timeout(1500) },
        );
        if (res.ok) {
          const list = await res.json() as Pattern[];
          const found = list.find((p) => p.id === patternId);
          if (found) { setState({ pattern: found, loading: false }); return; }
        }
      } catch {
        // fall through to seeds
      }

      // 2. Seed patterns
      const seed = SEED_PATTERNS.find((p) => p.id === patternId);
      setState({ pattern: seed ?? null, loading: false });
    })();
  }, [patternId]);

  return state;
}
