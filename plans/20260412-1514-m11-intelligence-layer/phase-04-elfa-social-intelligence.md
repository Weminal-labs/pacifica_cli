# Phase 04: Elfa Social Intelligence Integration (M12)

> Parent plan: [plan.md](./plan.md)
> Spec: [m11-intelligence-layer.md](../../context/features/m11-intelligence-layer.md)
> Depends on: Phase 01-03 complete
> Priority: P1 — Hackathon differentiator
> Status: planning
> Elfa docs: https://go.elfa.ai/docs-hackathon
> Elfa credits: 20,000 free via hackathon claim

---

## What & Why

The M11 intelligence layer captures **onchain behavioral signals** — funding, OI, momentum,
whale orders. Elfa adds the **offchain narrative layer** — social velocity, sentiment, and
smart-follower-weighted account activity across X and Telegram.

**The insight:** Two independent signals pointing the same direction = substantially stronger edge.

```
Pattern fires onchain:
  "Negative Funding + Rising OI" → 72.3% historical win rate

Elfa confirms offchain:
  ETH mentions +340% velocity (vs 24h baseline)
  Smart follower sentiment: bullish (score: 0.78)
  Trending narrative: "ETH accumulation ahead of Q2 unlock"

Combined signal:
  Confidence: HIGH (vs MEDIUM onchain-only)
  Agent can weight position sizing accordingly
```

Without Elfa: agent sees structure. With Elfa: agent sees structure + narrative context.
This is the gap between a 72% pattern and an actionable trade.

---

## Elfa Endpoints Used

| Endpoint | Purpose | Credits/call |
|----------|---------|-------------|
| `GET /v2/data/top-mentions` | Most significant posts for a ticker | Low |
| `GET /v2/aggregations/trending-tokens` | High mention-velocity tokens right now | Low |
| `GET /v2/data/trending-narratives` | Dominant narratives forming across X | Low |
| `GET /v2/account/smart-stats` | Smart follower metrics for accounts | Medium |
| `POST /v2/chat` (tokenAnalysis mode) | In-depth narrative + trade setup context | High |

**Budget strategy:** `trending-tokens` + `top-mentions` per-asset are the workhorses.
`tokenAnalysis` chat is reserved for explicit agent requests — not called automatically.
20,000 credits covers extensive hackathon usage at these rates.

---

## Architecture

### New files

```
src/core/intelligence/
  social.ts         ← Elfa API client + SocialContext builder

src/mcp/tools/
  social.ts         ← MCP tool: pacifica_social_context (added to server.ts)
```

### Modified files

```
src/core/intelligence/schema.ts     ← Add SocialContext type, extend MarketContext (optional fields)
src/core/intelligence/capture.ts    ← Optionally fetch social context at capture time
src/core/intelligence/engine.ts     ← Social confirmation scoring on pattern matches
src/core/intelligence/seed.ts       ← Add mock social context to seeded records
src/intelligence-api/server.ts      ← Add /api/intelligence/social/:asset route
web/app/page.tsx                    ← Add social signals panel to Intelligence Feed
web/app/snapshot/[market]/page.tsx  ← Show social context alongside onchain conditions
.pacifica.yaml schema               ← Add elfa.api_key optional config field
```

---

## Data Models

```typescript
// ─── Social context (optional — only present when Elfa key is configured) ──

export type SocialSentiment = "bullish" | "bearish" | "neutral";

export interface SocialContext {
  /** Mention count velocity: ratio of last-hour mentions vs 24h baseline.
   *  1.0 = baseline, 3.0 = 3x spike. */
  mention_velocity: number;
  /** Quality-weighted sentiment derived from smart-follower accounts. */
  sentiment: SocialSentiment;
  /** Smart follower signal strength 0.0–1.0 (quality-adjusted bullish pressure). */
  smart_follower_score: number;
  /** Active narrative tags from Elfa trending-narratives. */
  narrative_tags: string[];
  /** Top 3 posts by relevance score (text only, no author info). */
  top_post_snippets: string[];
  /** ISO 8601 timestamp of fetch. */
  fetched_at: string;
  /** Elfa data source confirmation. */
  source: "elfa";
}

/** Confidence classification combining onchain pattern + social confirmation. */
export type SignalConfidence = "high" | "medium" | "low" | "unconfirmed";

/** Combined signal: onchain pattern + optional social confirmation. */
export interface ConfirmedSignal {
  pattern: DetectedPattern;
  social?: SocialContext;
  confidence: SignalConfidence;
  confidence_reason: string;  // e.g. "Pattern (72%) + bullish social spike (3.4x)"
}
```

**MarketContext extension (backward-compatible optional fields):**

```typescript
// Add to existing MarketContext interface:
export interface MarketContext {
  // ... existing fields unchanged ...

  /** Social context from Elfa — undefined when API key not configured. */
  social?: SocialContext;
}
```

Adding `social?` as optional means all existing records remain valid.
Capture will populate it when `elfa.api_key` is set in config.

---

## Elfa Client (social.ts)

```typescript
// src/core/intelligence/social.ts

const ELFA_BASE = "https://api.elfa.ai";

export interface ElfaConfig {
  api_key: string;
}

export class ElfaClient {
  private headers: Record<string, string>;

  constructor(config: ElfaConfig) {
    this.headers = {
      "x-elfa-api-key": config.api_key,
      "Content-Type": "application/json",
    };
  }

  /** Fetch mention velocity: compare last-hour count to 24h baseline. */
  async getMentionVelocity(ticker: string): Promise<number>

  /** Fetch smart-follower-weighted sentiment for a ticker. */
  async getSmartFollowerSentiment(ticker: string): Promise<{
    sentiment: SocialSentiment;
    score: number;
  }>

  /** Fetch trending narrative tags (from /v2/data/trending-narratives). */
  async getTrendingNarratives(ticker: string): Promise<string[]>

  /** Fetch top 3 post snippets for a ticker (no author info — privacy-safe). */
  async getTopPostSnippets(ticker: string): Promise<string[]>

  /** Build a complete SocialContext for a ticker. Single exported function. */
  async getSocialContext(ticker: string): Promise<SocialContext>
}

/** Exported singleton builder — returns null when Elfa not configured. */
export async function fetchSocialContext(
  ticker: string,
  elfaApiKey?: string,
): Promise<SocialContext | undefined>
```

**getMentionVelocity implementation:**
```typescript
// Call /v2/data/top-mentions with time_from = last 1h and 24h
// velocity = count_1h / (count_24h / 24) — ratio vs hourly baseline
// Returns 1.0 for baseline, higher for spikes
```

**getSmartFollowerSentiment implementation:**
```typescript
// Call /v2/data/top-mentions with limit=50
// For each post, check if author qualifies as smart (use /v2/account/smart-stats)
// Cache smart-status for 1h to avoid repeat calls
// Sentiment: bullish keywords weighted by smart_follower_count
// Score: fraction of smart-account volume that is bullish
```

**Rate limiting:**
- Cache social context per ticker for 5 minutes (Map<string, {ctx, ts}>)
- Never call Elfa if last fetch < 5 min ago for same ticker
- All errors silent — social context is optional enrichment only

---

## Signal Confidence Scoring

In `engine.ts`, add a `scoreConfidence()` function:

```typescript
export function scoreConfidence(
  pattern: DetectedPattern,
  social?: SocialContext,
): { confidence: SignalConfidence; reason: string } {

  // Onchain-only base
  if (!social) {
    if (pattern.win_rate >= 0.70) return { confidence: "medium", reason: `Pattern ${(pattern.win_rate*100).toFixed(0)}% win rate (no social data)` };
    return { confidence: "low", reason: `Pattern ${(pattern.win_rate*100).toFixed(0)}% win rate` };
  }

  const socialBullish = social.sentiment === "bullish" && social.smart_follower_score > 0.5;
  const velocitySpike = social.mention_velocity > 2.0;  // 2x+ baseline

  // High: strong onchain pattern + social confirmation
  if (pattern.win_rate >= 0.65 && socialBullish && velocitySpike) {
    return {
      confidence: "high",
      reason: `Pattern ${(pattern.win_rate*100).toFixed(0)}% + bullish social spike (${social.mention_velocity.toFixed(1)}x) + smart follower score ${(social.smart_follower_score*100).toFixed(0)}%`,
    };
  }

  // Medium: pattern confirmed by at least one social signal
  if (pattern.win_rate >= 0.60 && (socialBullish || velocitySpike)) {
    return {
      confidence: "medium",
      reason: `Pattern ${(pattern.win_rate*100).toFixed(0)}% + partial social confirmation`,
    };
  }

  // Unconfirmed: social contradicts pattern
  if (social.sentiment === "bearish" && pattern.win_rate < 0.70) {
    return {
      confidence: "unconfirmed",
      reason: `Pattern valid but social sentiment bearish — wait for confirmation`,
    };
  }

  return { confidence: "medium", reason: `Pattern ${(pattern.win_rate*100).toFixed(0)}% win rate` };
}
```

---

## MCP Tool: `pacifica_social_context`

```typescript
server.tool(
  "pacifica_social_context",
  "Get Elfa social intelligence for an asset: mention velocity, smart-follower sentiment, trending narratives, and combined signal confidence vs onchain patterns.",
  {
    asset: z.string().describe("Asset ticker, e.g. ETH, BTC, SOL"),
    include_pattern_match: z.boolean().optional()
      .describe("If true, also match current onchain patterns and score combined confidence"),
  },
  async ({ asset, include_pattern_match }) => {
    try {
      const ticker = asset.toUpperCase().split("-")[0] ?? asset;

      // Social context
      const elfaKey = config.elfa?.api_key;
      if (!elfaKey) return fail("Elfa API key not configured. Add elfa.api_key to .pacifica.yaml");

      const social = await fetchSocialContext(ticker, elfaKey);
      if (!social) return fail("Failed to fetch social context from Elfa");

      let result: Record<string, unknown> = { asset: ticker, social };

      // Optional: combine with onchain pattern matching
      if (include_pattern_match) {
        const patterns = await loadPatterns();
        const markets = await client.getMarkets();
        const market = markets.find(m => m.symbol.toUpperCase().startsWith(ticker));

        if (market && patterns.length > 0) {
          const confirmedSignals: ConfirmedSignal[] = patterns.map(p => ({
            pattern: p,
            social,
            ...scoreConfidence(p, social),
          }));
          confirmedSignals.sort((a, b) =>
            ["high","medium","low","unconfirmed"].indexOf(a.confidence) -
            ["high","medium","low","unconfirmed"].indexOf(b.confidence)
          );
          result.confirmed_signals = confirmedSignals;
          result.best_signal = confirmedSignals[0] ?? null;
        }
      }

      return ok(result);
    } catch (err) {
      return fail(`Social context error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);
```

**Example agent usage:**
```
Claude: pacifica_intelligence_patterns({ market: "ETH-USDC-PERP" })
  → "Negative Funding + Rising OI" matches (72% win rate)

Claude: pacifica_social_context({ asset: "ETH", include_pattern_match: true })
  → sentiment: bullish, velocity: 3.4x, smart_follower_score: 0.78
  → best_signal: { confidence: "high", reason: "Pattern 72% + social spike 3.4x + smart 78%" }

Claude: "Current ETH conditions show HIGH confidence — entering long recommended."
```

---

## Config Extension (.pacifica.yaml)

```yaml
# Optional — social intelligence via Elfa API
elfa:
  api_key: "your-elfa-api-key"
  cache_ttl_minutes: 5        # how long to cache per-ticker social data
  auto_capture: false         # if true, enriches every trade capture with social context
```

Add to `src/core/config/types.ts`:
```typescript
export interface ElfaConfig {
  api_key: string;
  cache_ttl_minutes?: number;   // default: 5
  auto_capture?: boolean;       // default: false (to conserve credits)
}

// Add to PacificaConfig:
export interface PacificaConfig {
  // ... existing fields ...
  elfa?: ElfaConfig;
}
```

Auto-capture is off by default — each enriched capture costs Elfa credits.
Agent can request social context on-demand via MCP tool without draining credits on every trade.

---

## Web UI: Social Signals Panel

### Intelligence Feed page — add "Social Signals" section:

```
/ SOCIAL INTELLIGENCE  (powered by Elfa)

┌─────────────────────────────────────────────────────────┐
│  Trending Now  │  Sentiment  │  Smart Activity           │
│                │             │                           │
│  1. ETH    🔥  │  BTC  🟢    │  87 smart accounts        │
│     3.4x vel   │  Bullish    │  active on ETH (24h)      │
│                │  Score: 78% │                           │
│  2. BTC    📈  │  ETH  🟢    │  Top narrative:           │
│     2.1x vel   │  Bullish    │  "Q2 accumulation phase"  │
│                │  Score: 71% │                           │
│  3. SOL    →   │  SOL  ⚪    │                           │
│     1.2x vel   │  Neutral    │                           │
└─────────────────────────────────────────────────────────┘
```

New component: `web/components/feed/SocialSignalsPanel.tsx`
- Fetches from `/api/intelligence/social/ETH,BTC,SOL` (batch endpoint)
- Shows mention velocity bars, sentiment badges, narrative tags
- Orange accent for bullish spike, neutral for baseline, red for divergence

### Market Snapshot page — social confirmation card:

Alongside the `PatternMatchResult` card, add a `SocialConfirmationCard`:
```
Social Confirmation
───────────────────
Mention velocity:  3.4x baseline  [████████░░]
Smart sentiment:   BULLISH (78%)  [🟢]
Narratives:        ETH ETF inflows · Q2 unlock · accumulation

Combined confidence:  HIGH
"Pattern 72% + social spike 3.4x + smart follower 78%"
```

### New REST API route: `GET /api/intelligence/social/:asset`

```typescript
// In src/intelligence-api/server.ts
app.get("/api/intelligence/social/:asset", async (req, reply) => {
  const { asset } = req.params as { asset: string };
  const elfaKey = loadElfaConfig()?.api_key;
  if (!elfaKey) return reply.code(503).send({ error: "Elfa not configured" });

  const social = await fetchSocialContext(asset, elfaKey);
  return reply.send(social ?? { error: "Failed to fetch" });
});
```

---

## Implementation Tasks (TI21–TI30)

| # | Task | File | Priority |
|---|------|------|--------|
| TI21 | Add `SocialContext`, `ConfirmedSignal`, `SignalConfidence` to schema.ts | schema.ts | P0 |
| TI22 | Extend `MarketContext` with optional `social?: SocialContext` | schema.ts | P0 |
| TI23 | Add `ElfaConfig` to config types + .pacifica.yaml schema | types.ts | P0 |
| TI24 | Create `src/core/intelligence/social.ts` — Elfa client + getSocialContext | social.ts | P0 |
| TI25 | Add `scoreConfidence()` to `engine.ts` | engine.ts | P1 |
| TI26 | Add `pacifica_social_context` MCP tool to server.ts | server.ts | P0 |
| TI27 | Add `/api/intelligence/social/:asset` route to intelligence API | server.ts | P1 |
| TI28 | Add `SocialSignalsPanel` component to web feed page | web/ | P1 |
| TI29 | Add `SocialConfirmationCard` to web snapshot page | web/ | P1 |
| TI30 | Update seed.ts to include mock SocialContext on seeded records | seed.ts | P2 |

**Critical path:** TI21 → TI22 → TI23 → TI24 → TI26 (MCP tool unblocks agent demo)

---

## Demo Script Addition (Act 4.5)

Insert between Act 4 (agent uses intelligence) and the closing:

> "One more layer. Social intelligence."

```
Claude: pacifica_social_context({ asset: "ETH", include_pattern_match: true })

Response:
  mention_velocity: 3.4x  (significant spike)
  sentiment: bullish
  smart_follower_score: 0.78
  narratives: ["Q2 accumulation", "ETH ETF inflows"]

  best_signal: {
    pattern: "Negative Funding + Rising OI",
    confidence: "HIGH",
    reason: "Pattern 72% win rate + social spike 3.4x + smart follower score 78%"
  }

Claude: "ETH shows HIGH confidence — onchain structure confirmed by social narrative.
         Recommend entering long at current levels."
```

> "Two independent signal layers — onchain behavior and social narrative — pointing the same direction.
>  That's the intelligence gap closed."

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Elfa API rate limits | Medium | Medium | 5-min cache per ticker; batch calls where possible |
| Credits exhausted mid-demo | Low | High | Pre-warm cache before demo; use seed mock data as fallback |
| Social signal contradicts good onchain pattern | Expected | Low | This is a feature — "unconfirmed" confidence is honest signal |
| API key not configured | Expected | None | All social features gracefully degrade to "not configured" |
| Elfa API down during demo | Low | High | Mock social context in demo fallback path |

---

## Open Questions

1. **Auto-capture:** Should social context be fetched on every trade capture (costs credits) or only on-demand via MCP? Recommendation: on-demand only (auto_capture: false default).

2. **Sentiment aggregation:** Elfa's `top-mentions` doesn't expose direct sentiment scores — need to either use keyword heuristics or `tokenAnalysis` chat mode. Chat mode costs more credits. Heuristic approach is sufficient for hackathon.

3. **Anonymity:** Top post snippets included in SocialContext — should text content be stripped before persisting to local JSON? Yes, store only aggregate scores, not raw post content.

4. **Narrative matching:** Should Elfa narratives influence `pattern_tags` on IntelligenceRecords? E.g., a trade captured during "ETH ETF inflows" narrative gets that tag. Post-hackathon feature — adds complexity to pattern engine.
