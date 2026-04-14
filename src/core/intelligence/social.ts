// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Elfa Social Intelligence Client
// ---------------------------------------------------------------------------
// Fetches social context (mention velocity, smart-follower sentiment,
// trending narratives) from the Elfa API and assembles it into a SocialContext
// struct compatible with MarketContext.
//
// All methods are safe to call without an API key — they return undefined
// rather than throwing.  This module is optional enrichment only.
// ---------------------------------------------------------------------------

import type { SocialContext, SocialSentiment } from "./schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELFA_BASE = "https://api.elfa.ai";

/** In-memory cache entry. */
interface CacheEntry {
  ctx: SocialContext;
  ts: number;
}

// ---------------------------------------------------------------------------
// ElfaClient
// ---------------------------------------------------------------------------

export class ElfaClient {
  private readonly headers: Record<string, string>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(apiKey: string, cacheTtlMinutes = 5) {
    this.headers = {
      "x-elfa-api-key": apiKey,
      "Content-Type": "application/json",
    };
    this.cacheTtlMs = cacheTtlMinutes * 60 * 1000;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Build a complete SocialContext for a ticker (e.g. "ETH", "BTC").
   * Returns undefined on any error — social context is optional enrichment.
   */
  async getSocialContext(ticker: string): Promise<SocialContext | undefined> {
    const key = ticker.toUpperCase();

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return cached.ctx;
    }

    try {
      const [velocity, sentimentResult, narratives, snippets] = await Promise.all([
        this.getMentionVelocity(key),
        this.getSmartFollowerSentiment(key),
        this.getTrendingNarratives(key),
        this.getTopPostSnippets(key),
      ]);

      const ctx: SocialContext = {
        mention_velocity: velocity,
        sentiment: sentimentResult.sentiment,
        smart_follower_score: sentimentResult.score,
        narrative_tags: narratives,
        top_post_snippets: snippets,
        fetched_at: new Date().toISOString(),
        source: "elfa",
      };

      this.cache.set(key, { ctx, ts: Date.now() });
      return ctx;
    } catch (err) {
      console.warn(`[social] Elfa fetch failed for ${ticker}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Internal fetch helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch mention velocity: ratio of last-hour mentions vs 24h hourly baseline.
   * 1.0 = baseline, 3.0 = 3× spike.
   */
  private async getMentionVelocity(ticker: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const oneDayAgo = now - 86400;

    const [lastHour, lastDay] = await Promise.all([
      this.fetchMentionCount(ticker, oneHourAgo, now),
      this.fetchMentionCount(ticker, oneDayAgo, now),
    ]);

    // Hourly baseline = 24h total / 24
    const baseline = lastDay / 24;
    if (baseline < 1) return 1.0;

    return Math.round((lastHour / baseline) * 10) / 10;
  }

  private async fetchMentionCount(
    ticker: string,
    from: number,
    to: number,
  ): Promise<number> {
    const params = new URLSearchParams({
      keywords: `$${ticker}`,
      from: String(from),
      to: String(to),
      limit: "100",
    });

    const res = await fetch(`${ELFA_BASE}/v2/data/top-mentions?${params}`, {
      headers: this.headers,
    });

    if (!res.ok) return 0;

    const json = await res.json() as { data?: { data?: unknown[] } };
    return json?.data?.data?.length ?? 0;
  }

  /**
   * Estimate smart-follower-weighted sentiment from top mentions.
   * Uses keyword heuristics on post text — sufficient for hackathon.
   */
  private async getSmartFollowerSentiment(
    ticker: string,
  ): Promise<{ sentiment: SocialSentiment; score: number }> {
    const now = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      keywords: `$${ticker}`,
      from: String(now - 86400),
      to: String(now),
      limit: "50",
    });

    const res = await fetch(`${ELFA_BASE}/v2/data/top-mentions?${params}`, {
      headers: this.headers,
    });

    if (!res.ok) return { sentiment: "neutral", score: 0.5 };

    const json = await res.json() as {
      data?: {
        data?: Array<{
          content?: string;
          smartEngagementPoints?: number;
          mentions?: Array<{ smartEngagementPoints?: number }>;
        }>;
      };
    };

    const posts = json?.data?.data ?? [];
    if (posts.length === 0) return { sentiment: "neutral", score: 0.5 };

    const bullishKeywords = [
      "bullish", "long", "buy", "accumulate", "breakout", "moon", "pump",
      "support", "uptrend", "rally", "buy the dip", "btd", "accumulation",
      "inflows", "unlock", "ath",
    ];
    const bearishKeywords = [
      "bearish", "short", "sell", "dump", "breakdown", "crash", "rug",
      "resistance", "downtrend", "correction", "distribution", "exit",
    ];

    let bullishWeight = 0;
    let bearishWeight = 0;
    let totalWeight = 0;

    for (const post of posts) {
      const text = (post.content ?? "").toLowerCase();
      const weight = post.smartEngagementPoints ?? 1;
      totalWeight += weight;

      const hasBullish = bullishKeywords.some((kw) => text.includes(kw));
      const hasBearish = bearishKeywords.some((kw) => text.includes(kw));

      if (hasBullish && !hasBearish) bullishWeight += weight;
      else if (hasBearish && !hasBullish) bearishWeight += weight;
    }

    if (totalWeight === 0) return { sentiment: "neutral", score: 0.5 };

    const bullishRatio = bullishWeight / totalWeight;
    const bearishRatio = bearishWeight / totalWeight;

    let sentiment: SocialSentiment;
    let score: number;

    if (bullishRatio > 0.55) {
      sentiment = "bullish";
      score = Math.round(bullishRatio * 100) / 100;
    } else if (bearishRatio > 0.45) {
      sentiment = "bearish";
      score = Math.round((1 - bearishRatio) * 100) / 100;
    } else {
      sentiment = "neutral";
      score = 0.5;
    }

    return { sentiment, score };
  }

  /**
   * Fetch trending narrative tags relevant to a ticker.
   */
  private async getTrendingNarratives(ticker: string): Promise<string[]> {
    const res = await fetch(`${ELFA_BASE}/v2/data/trending-narratives`, {
      headers: this.headers,
    });

    if (!res.ok) return [];

    const json = await res.json() as {
      data?: Array<{ narrative?: string; tokens?: string[] }>;
    };

    const narratives = json?.data ?? [];
    const tickerUpper = ticker.toUpperCase();

    // Filter narratives that mention the ticker or are broadly relevant
    return narratives
      .filter((n) =>
        (n.tokens ?? []).some((t) => t.toUpperCase().includes(tickerUpper)) ||
        (n.narrative ?? "").toUpperCase().includes(tickerUpper),
      )
      .map((n) => n.narrative ?? "")
      .filter(Boolean)
      .slice(0, 5);
  }

  /**
   * Fetch top 3 post snippets by relevance (text only — no author info).
   */
  private async getTopPostSnippets(ticker: string): Promise<string[]> {
    const now = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      keywords: `$${ticker}`,
      from: String(now - 3600 * 6),
      to: String(now),
      limit: "3",
    });

    const res = await fetch(`${ELFA_BASE}/v2/data/top-mentions?${params}`, {
      headers: this.headers,
    });

    if (!res.ok) return [];

    const json = await res.json() as {
      data?: { data?: Array<{ content?: string }> };
    };

    return (json?.data?.data ?? [])
      .map((p) => {
        const text = p.content ?? "";
        // Truncate to 120 chars, strip newlines
        return text.replace(/\s+/g, " ").trim().slice(0, 120);
      })
      .filter(Boolean);
  }
}

// ---------------------------------------------------------------------------
// Singleton builder — exported convenience function
// ---------------------------------------------------------------------------

/**
 * Fetch social context for a ticker, returning undefined if:
 *   - No Elfa API key is provided
 *   - Any error occurs (network, rate-limit, parse)
 *
 * Pass optional cacheTtlMinutes to override the 5-minute default.
 */
export async function fetchSocialContext(
  ticker: string,
  elfaApiKey?: string,
  cacheTtlMinutes?: number,
): Promise<SocialContext | undefined> {
  if (!elfaApiKey) return undefined;

  // Normalise: take just the base token from "BTC-USDC-PERP" → "BTC"
  const baseTicker = ticker.split("-")[0] ?? ticker;

  // Re-use a module-level singleton per API key (keyed by first 8 chars to avoid log leakage)
  const client = getOrCreateClient(elfaApiKey, cacheTtlMinutes);
  return client.getSocialContext(baseTicker);
}

// ---------------------------------------------------------------------------
// Module-level client singleton pool (keyed by API key prefix)
// ---------------------------------------------------------------------------

const _clients = new Map<string, ElfaClient>();

function getOrCreateClient(apiKey: string, cacheTtlMinutes?: number): ElfaClient {
  const keyPrefix = apiKey.slice(0, 8);
  let client = _clients.get(keyPrefix);
  if (!client) {
    client = new ElfaClient(apiKey, cacheTtlMinutes ?? 5);
    _clients.set(keyPrefix, client);
  }
  return client;
}
