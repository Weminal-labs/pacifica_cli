import { describe, it, expect } from "vitest";
import { cacheGet, cacheSet, cacheDel, cacheFlushAddress } from "../cache.js";

// The cache module uses a module-level Map. Each test uses unique key prefixes
// and cleans up with cacheDel so tests remain independent.

describe("cache", () => {
  describe("cacheGet", () => {
    it("returns null for a key that has never been set", () => {
      const result = cacheGet("never-set-key-xyz");
      expect(result).toBeNull();
    });

    it("returns { data, stale: false } for a fresh entry", () => {
      const key = "fresh-entry-test";
      cacheSet(key, { value: 42 }, 60_000); // 60s TTL
      const result = cacheGet<{ value: number }>(key);
      expect(result).not.toBeNull();
      expect(result!.data).toEqual({ value: 42 });
      expect(result!.stale).toBe(false);
      cacheDel(key);
    });

    it("returns { data, stale: true } for an entry whose TTL has already elapsed", () => {
      const key = "expired-entry-test";
      // TTL of -1ms means expiresAt is in the past → Date.now() > expiresAt is true
      cacheSet(key, "some-data", -1);
      const result = cacheGet<string>(key);
      expect(result).not.toBeNull();
      expect(result!.data).toBe("some-data");
      expect(result!.stale).toBe(true);
      cacheDel(key);
    });

    it("preserves the exact data shape stored", () => {
      const key = "complex-shape-test";
      const payload = { nested: { arr: [1, 2, 3], flag: true } };
      cacheSet(key, payload, 60_000);
      const result = cacheGet<typeof payload>(key);
      expect(result!.data).toEqual(payload);
      cacheDel(key);
    });

    it("returns stale: false immediately after set with a large positive TTL", () => {
      const key = "large-ttl-test";
      cacheSet(key, "data", 3_600_000); // 1 hour
      const result = cacheGet<string>(key);
      expect(result!.stale).toBe(false);
      cacheDel(key);
    });
  });

  describe("cacheDel", () => {
    it("removes a specific key so subsequent cacheGet returns null", () => {
      const key = "delete-me-test";
      cacheSet(key, "to-be-deleted", 60_000);
      expect(cacheGet(key)).not.toBeNull();
      cacheDel(key);
      expect(cacheGet(key)).toBeNull();
    });

    it("is a no-op when the key does not exist", () => {
      // Should not throw
      expect(() => cacheDel("nonexistent-key-abc")).not.toThrow();
    });
  });

  describe("cacheFlushAddress", () => {
    it("removes all keys containing the address substring", () => {
      const address = "0xDEADBEEF";
      const keys = [
        `${address}:positions`,
        `${address}:funding`,
        `prefix:${address}:suffix`,
      ];
      for (const k of keys) cacheSet(k, "data", 60_000);

      cacheFlushAddress(address);

      for (const k of keys) {
        expect(cacheGet(k)).toBeNull();
      }
    });

    it("does not remove keys that do not contain the address", () => {
      const address = "0xFLUSH";
      const unrelatedKey = "0xOTHER:positions";
      cacheSet(unrelatedKey, "keep-me", 60_000);
      cacheSet(`${address}:positions`, "flush-me", 60_000);

      cacheFlushAddress(address);

      expect(cacheGet(unrelatedKey)).not.toBeNull();
      expect(cacheGet(`${address}:positions`)).toBeNull();

      cacheDel(unrelatedKey);
    });

    it("is a no-op when no keys match the address", () => {
      // Should not throw even when store has no matching keys
      expect(() => cacheFlushAddress("0xNONEXISTENT")).not.toThrow();
    });
  });

  describe("cacheSet eviction", () => {
    // Fills the cache to MAX_ENTRIES (500) and verifies the oldest key is
    // evicted when a new entry is added.
    it("evicts the oldest entry when at MAX_ENTRIES (500)", () => {
      const MAX_ENTRIES = 500;
      const prefix = "eviction-test-";
      const firstKey = `${prefix}0`;

      // Fill the cache to exactly MAX_ENTRIES using fresh unique keys
      for (let i = 0; i < MAX_ENTRIES; i++) {
        cacheSet(`${prefix}${i}`, i, 60_000);
      }

      // The first key should still be present before overflow
      expect(cacheGet(firstKey)).not.toBeNull();

      // Adding one more entry should evict the oldest (firstKey)
      const overflowKey = `${prefix}overflow`;
      cacheSet(overflowKey, "overflow", 60_000);

      expect(cacheGet(firstKey)).toBeNull();
      expect(cacheGet(overflowKey)).not.toBeNull();

      // Clean up
      for (let i = 1; i < MAX_ENTRIES; i++) {
        cacheDel(`${prefix}${i}`);
      }
      cacheDel(overflowKey);
    });
  });
});
