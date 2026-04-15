// ---------------------------------------------------------------------------
// Simple in-memory TTL cache for Pacifica API responses (T-77)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;

export function cacheGet<T>(key: string): { data: T; stale: boolean } | null {
  const entry = store.get(key);
  if (!entry) return null;
  return { data: entry.data as T, stale: Date.now() > entry.expiresAt };
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  // Evict oldest entry if at cap
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key: string): void {
  store.delete(key);
}

export function cacheFlushAddress(address: string): void {
  for (const key of store.keys()) {
    if (key.includes(address)) store.delete(key);
  }
}
