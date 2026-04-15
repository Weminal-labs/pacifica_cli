# Phase 03: Web UI + REST API

> Parent plan: [plan.md](./plan.md)
> Spec: [m11-intelligence-layer.md](../../context/features/m11-intelligence-layer.md)
> Can run parallel to: Phase 02 (use seed data while patterns compute)
> Priority: P1
> Status: todo

---

## Overview

Next.js 14 web dashboard + Fastify REST API that exposes the intelligence layer to browsers.
Dark cinematic design (reference: OpenReview — #0A0A0A bg, #F97316 orange accent).
4 pages: Intelligence Feed, Market Snapshot, Pattern Library, Reputation Ledger.

---

## Key Insights

- REST API is a thin wrapper over the same JSON stores used by CLI — no new data layer
- Fastify already in stack (from M4 webhook bridge) — reuse the import
- Next.js lives in `web/` subdirectory — separate package.json, deployed independently
- For hackathon: all data is static seed JSON served via API — no live WebSocket needed in web UI
- Design reference (screenshots shared): split-panel hero, B&W mountain texture, orange pill labels, Inter font

---

## Requirements

- REST API: Fastify on port 4242, CORS open for localhost:3000
- API must serve seed data even without live Pacifica connection
- Web UI: Next.js 14 App Router, Tailwind CSS, shadcn/ui, Framer Motion
- All 4 pages functional for demo
- Mobile-responsive (judges may check on phone)
- Dark mode only (no light mode toggle needed)

---

## Directory Structure

```
web/
  package.json              (next, react, tailwind, framer-motion, shadcn)
  tailwind.config.ts
  app/
    layout.tsx              (root layout: Inter font, dark bg, nav)
    page.tsx                (Intelligence Feed — default route)
    snapshot/
      [market]/
        page.tsx            (Market Snapshot)
    patterns/
      page.tsx              (Pattern Library)
      [id]/
        page.tsx            (Pattern detail)
    reputation/
      page.tsx              (Reputation Ledger)
  components/
    nav/
      Navbar.tsx            (wordmark + "Intelligence" orange pill)
    feed/
      HeroSection.tsx
      LivePatternFeed.tsx
      WhaleActivityFeed.tsx
      HighRepSignals.tsx
    snapshot/
      MarketConditionsCard.tsx
      PatternMatchResult.tsx
      AgentSummaryCard.tsx
      ConditionsList.tsx
    patterns/
      PatternFilterBar.tsx
      PatternCard.tsx
      PatternDetailModal.tsx
    reputation/
      ReputationLeaderboard.tsx
      AccuracyByCondition.tsx
      IntelligenceNFTSection.tsx
      NFTCard.tsx
    ui/
      OrangeLabel.tsx       (reusable "/ SECTION NAME" orange small-cap label)
      RepBadge.tsx          (reputation score badge)
      WinRateBadge.tsx      (win % orange pill)
      ConditionTag.tsx      (individual condition chip)

src/intelligence-api/
  server.ts                 (Fastify REST API, port 4242)
  routes/
    feed.ts
    snapshot.ts
    patterns.ts
    reputation.ts
    records.ts
```

---

## Design System Implementation

```typescript
// tailwind.config.ts
colors: {
  bg: {
    primary: '#0A0A0A',
    surface: '#141414',
    card:    '#1C1C1C',
  },
  accent:  '#F97316',
  text: {
    primary: '#FFFFFF',
    muted:   '#6B7280',
  },
  border:  '#1F1F1F',
}

// globals.css
body { background: #0A0A0A; color: #FFFFFF; font-family: 'Inter', sans-serif; }
```

---

## Key Component Specs

### `<OrangeLabel text="/ INTELLIGENCE FEED" />`
```tsx
<span className="text-[11px] font-semibold tracking-widest uppercase text-accent">
  {text}
</span>
```

### `<PatternCard pattern={DetectedPattern} />`
```tsx
<div className="bg-card border border-border rounded-lg p-5 hover:border-accent/40 transition">
  <div className="flex items-center gap-2 mb-3">
    <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full font-bold">
      VERIFIED
    </span>
  </div>
  <h3 className="text-white font-semibold text-lg">{pattern.name}</h3>
  <div className="grid grid-cols-3 gap-4 mt-4">
    <Stat label="Win Rate"    value={`${(pattern.win_rate * 100).toFixed(1)}%`} highlight />
    <Stat label="Sample"      value={pattern.sample_size} />
    <Stat label="Avg P&L"     value={`+${pattern.avg_pnl_pct.toFixed(1)}%`} />
  </div>
  <div className="mt-3 flex gap-1 flex-wrap">
    {pattern.primary_assets.map(a => (
      <ConditionTag key={a} label={a} />
    ))}
  </div>
  <p className="text-muted text-xs mt-2">Last seen: {timeAgo(pattern.last_seen_at)}</p>
</div>
```

### `<HeroSection />`
```tsx
// Full-width centered, dot-grid texture overlay
<section className="relative min-h-[70vh] flex flex-col items-center justify-center px-6">
  <div className="absolute inset-0 dot-grid-texture opacity-20" />
  <h1 className="text-5xl font-bold text-center text-white max-w-3xl leading-tight">
    Markets are 24/7.<br />Your intelligence should be too.
  </h1>
  <p className="text-muted text-lg text-center mt-4 max-w-xl">
    Every trade teaches the system. Patterns emerge from behavior.
    Intelligence compounds over time.
  </p>
  <div className="flex gap-4 mt-8">
    <Button variant="accent">View Live Feed</Button>
    <Button variant="ghost">Connect Agent</Button>
  </div>
  <TerminalMockup className="mt-12" />  {/* animated CLI output */}
</section>
```

### `<TerminalMockup />`
Animated typewriter showing:
```
$ pacifica intelligence patterns --json
> Scanning 80 records across BTC ETH SOL...
> 3 patterns verified ✓
> ETH: Negative Funding + Rising OI  →  72.3% win rate
> BTC: Whale Activity + Bullish Momentum  →  68.1% win rate
```

### Split-section layout (for Snapshot + Pattern detail pages)
```tsx
<div className="grid grid-cols-5 gap-0 min-h-screen">
  {/* Left 40%: mountain texture bg + floating card */}
  <div className="col-span-2 relative bg-surface overflow-hidden">
    <img src="/mountain-bg.jpg" className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale" />
    <div className="relative z-10 p-8">
      <FloatingCard>{leftContent}</FloatingCard>
    </div>
  </div>
  {/* Right 60%: story */}
  <div className="col-span-3 flex flex-col justify-center px-16 py-12">
    <OrangeLabel text={sectionLabel} />
    <h2 className="text-4xl font-bold text-white mt-3 leading-tight">{headline}</h2>
    <p className="text-muted mt-4 text-lg">{body}</p>
    <Button variant="accent" className="mt-8 w-fit">{cta}</Button>
  </div>
</div>
```

---

## REST API Implementation

```typescript
// src/intelligence-api/server.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadRecords } from "../core/intelligence/store.js";
import { detectPatterns } from "../core/intelligence/engine.js";
import { computeReputation } from "../core/intelligence/reputation.js";

const app = Fastify();
await app.register(cors, { origin: ["http://localhost:3000"] });

// Routes registered from routes/
app.register(feedRoutes,       { prefix: "/api/intelligence" });
app.register(snapshotRoutes,   { prefix: "/api/intelligence" });
app.register(patternsRoutes,   { prefix: "/api/intelligence" });
app.register(reputationRoutes, { prefix: "/api/intelligence" });

await app.listen({ port: 4242 });
```

```typescript
// src/intelligence-api/routes/feed.ts
export async function feedRoutes(app: FastifyInstance) {
  app.get("/feed", async (req, reply) => {
    const records  = await loadRecords();
    const patterns = detectPatterns(records);
    const repMap   = computeReputation(records);

    // High-rep signals: open records from traders with rep_score > 70
    const highRepSignals = records
      .filter(r => !r.closed_at && (repMap.get(r.trader_id)?.overall_rep_score ?? 0) > 70)
      .map(r => ({
        asset: r.asset, direction: r.direction,
        rep_score: repMap.get(r.trader_id)!.overall_rep_score,
        opened_at: r.opened_at,
      }));

    // Whale activity: from trade pattern data (use seeded mock for hackathon)
    const whaleActivity = getWhaleActivityFromRecords(records);

    return { active_patterns: patterns, whale_activity: whaleActivity,
             high_rep_signals: highRepSignals, generated_at: new Date().toISOString() };
  });
}
```

---

## Mountain Texture Asset

For demo: use a free-license B&W mountain image (Unsplash). Place at `web/public/mountain-bg.jpg`.
CSS: `filter: grayscale(100%) brightness(0.3)` — dark, moody, cinematic.
Dot grid: CSS `background-image: radial-gradient(#1F1F1F 1px, transparent 1px)`.

---

## Todo

**REST API:**
- [ ] Scaffold `src/intelligence-api/server.ts` with Fastify + CORS
- [ ] Implement `/feed` route
- [ ] Implement `/snapshot/:market` route
- [ ] Implement `/patterns` + `/patterns/:id` routes
- [ ] Implement `/reputation` route
- [ ] Add `pacifica intelligence serve` CLI command to start API

**Web UI:**
- [ ] Scaffold `web/` Next.js 14 app with Tailwind + shadcn
- [ ] Configure design tokens in tailwind.config.ts
- [ ] Build `Navbar.tsx` + root `layout.tsx`
- [ ] Build `HeroSection.tsx` with `TerminalMockup`
- [ ] Build `LivePatternFeed.tsx` + `PatternCard.tsx`
- [ ] Build `WhaleActivityFeed.tsx`
- [ ] Build `HighRepSignals.tsx`
- [ ] Build Market Snapshot page + components
- [ ] Build Pattern Library page + `PatternFilterBar`
- [ ] Build Reputation Ledger + `ReputationLeaderboard`
- [ ] Build `IntelligenceNFTSection.tsx` (static concept cards for demo)
- [ ] Wire all pages to REST API
- [ ] Add Framer Motion entrance animations (stagger on card grid)
- [ ] Test: all 4 pages render with seed data
- [ ] Test: Mobile responsive (375px viewport)

---

## Success Criteria

- Web app loads at `localhost:3000` with no errors
- All 4 pages render correctly with seed data
- Pattern cards show win rate, sample size, assets
- Market Snapshot shows "Current conditions match: [pattern name]"
- Reputation leaderboard shows top 5 anonymized traders
- NFT section shows concept cards (static)
- Framer Motion animations fire on page load
- Mobile viewport looks clean (single column)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| REST API CORS blocks web UI | Low | Medium | `@fastify/cors` with explicit localhost:3000 |
| Mountain image too heavy | Low | Low | Use WebP, max 500kb |
| shadcn components don't match dark theme | Medium | Low | Override CSS vars in globals.css |
| Next.js API routes vs Fastify confusion | Low | Low | Keep them separate: Next.js for web, Fastify for intelligence API |
| Animation jank on older machines | Low | Low | Reduce Motion query + simple fade-in only |

---

## Security Considerations

- REST API: localhost only in Phase 1 — no auth needed
- CORS: whitelist `localhost:3000` explicitly, not wildcard `*`
- No sensitive data in web UI: trader IDs are truncated hashes, never full keys
- No user input in Phase 1 web UI — all read-only

---

## Next Steps

After all 3 phases ship:
- Run full demo script (10-minute path in spec)
- Update TASK-LIST.md T57–T70 to `[x]`
- Dispatch context-updater to sync OVERVIEW, STACK, DATA_MODELS
- Phase 2 work: real aggregation, NFT minting, subscription model
