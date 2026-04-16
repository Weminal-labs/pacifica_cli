# Task List

> The single source of truth for what needs to be done.
> Updated by Claude after every meaningful piece of work.
> Each task links to the feature file it belongs to.
>
> **Status keys:**
> `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` blocked · `[>]` deferred

---

## How Tasks Are Numbered

Tasks are numbered globally across the whole project: T1, T2, T3...
They never get renumbered — a completed task keeps its number forever.
This means you can reference "T12" in a commit message or conversation and
it always points to the same thing.

---

## Active Sprint — v2 Lean-to-Thesis (2026-04-15)

Post-refactor work: land the pattern primitive, sync context.

| # | Status | Task | Notes |
|---|--------|------|-------|
| TN1 | `[x]` | Design Pattern YAML schema + zod types (`src/core/patterns/types.ts`) | |
| TN2 | `[x]` | Pattern loader (`src/core/patterns/loader.ts`) — loadPatterns/loadPattern/savePattern/getPatternsDir | |
| TN3 | `[x]` | Pattern matcher (`src/core/patterns/matcher.ts`) — evaluateCondition/matchWhen/shouldExit | |
| TN4 | `[x]` | Unit tests for parser/matcher (9 passing) | `src/core/patterns/__tests__/patterns.test.ts` |
| TN5 | `[x]` | 2 example patterns + README (`examples/patterns/`) | funding-carry-btc, trend-continuation-eth |
| TN6 | `[x]` | `pacifica patterns` CLI (`src/cli/commands/patterns.ts`) | list/show/validate subcommands |
| TN7 | `[x]` | Register simulate + patterns in `src/cli/index.ts` (regression fix) | simulate was missing |
| TN8 | `[x]` | 5 MCP pattern tools (`src/mcp/pattern-tools.ts`) | list/get/run/simulate/save |
| TN9 | `[x]` | Rewrite skills: pacifica-shared, pattern-confirmed-entry, funding-arb-single-venue; add author-pattern; purge dangling refs | |
| TN10 | `[x]` | Rewrite `skills/INDEX.md` to v2 surface | |
| TN11 | `[x]` | Rewrite OVERVIEW.md, SCOPE.md, ROADMAP.md for thesis | |
| TN12 | `[x]` | Pattern backtest (replay against historical candles) | Shipped 2026-04-16 |
| TN13 | `[x]` | Per-pattern journal tagging | Shipped 2026-04-16 |
| TN14 | `[ ]` | "Code your first pattern" screencast | Validation deliverable |
| TN15 | `[-]` | Decision: keep or strip web surface in v1 | Blocked on founder call |

---

## Archived — Pre-Refactor Sprints

All tasks below pre-date the 2026-04-15 lean-to-thesis refactor. Status shown as of the checkpoint commit (55c7de0). Do not resume these — the feature area was cut.

## Active Sprint — Day 1

Tasks currently being worked on or up next.

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T1 | `[x]` | Project scaffolding: pnpm init, tsconfig, tsup, commander, package.json bin | [M6](../features/m6-interactive-onboarding.md) | Foundation for everything |
| T26 | `[x]` | Build config loader/writer (.pacifica.yaml with validation) | [M6](../features/m6-interactive-onboarding.md) | Needed by init and all commands |
| T2 | `[x]` | Build Pacifica REST SDK client (auth, markets, orders, positions, account) | [M1](../features/m1-market-scanner-order-entry.md) | Core dependency |
| T3 | `[x]` | Build Pacifica WebSocket client with auto-reconnection | [M1](../features/m1-market-scanner-order-entry.md) | Needed for live scan |
| T27 | `[x]` | Implement `pacifica init` wizard with @inquirer/prompts | [M6](../features/m6-interactive-onboarding.md) | First thing judges see |
| T28 | `[x]` | Implement connection verification step (REST + WebSocket test) | [M6](../features/m6-interactive-onboarding.md) | End of init wizard |
| T4 | `[x]` | Implement `pacifica scan` command with Ink live table | [M1](../features/m1-market-scanner-order-entry.md) | First visual wow |

---

## Active Sprint — Day 2

Tasks currently being worked on or up next.

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T5 | `[x]` | Implement `pacifica trade buy/sell` with validation and confirmation | [M1](../features/m1-market-scanner-order-entry.md) | |
| T6 | `[x]` | Implement `pacifica orders` list and `pacifica orders cancel` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T7 | `[x]` | Implement `pacifica positions` list and `pacifica positions close` | [M1](../features/m1-market-scanner-order-entry.md) | |
| T8 | `[x]` | Build MCP server with 23 tools (10 read + 5 analytics + 2 funding + 6 write) | [M1](../features/m1-market-scanner-order-entry.md) | The differentiator |
| T9 | `[x]` | Build guardrail checker module | [M5](../features/m5-agent-guardrails.md) | |
| T10 | `[x]` | Build daily spending tracker with midnight reset | [M5](../features/m5-agent-guardrails.md) | |
| T11 | `[x]` | Build agent action logger | [M5](../features/m5-agent-guardrails.md) | |
| T12 | `[x]` | Implement `pacifica agent status/stop/start/config/log` commands | [M5](../features/m5-agent-guardrails.md) | |
| T29 | `[x]` | Build risk calculator module + ASCII heatmap bar | [M7](../features/m7-position-heatmap.md) | |
| T30 | `[x]` | Build HeatmapView with risk summary | [M7](../features/m7-position-heatmap.md) | |
| T31 | `[x]` | Implement `pacifica heatmap` and `pacifica heatmap --compact` commands | [M7](../features/m7-position-heatmap.md) | |
| T32 | `[x]` | Risk data exposed via MCP (agent_status tool) | [M7](../features/m7-position-heatmap.md) | |
| T33 | `[x]` | Build journal logger module | [M8](../features/m8-pnl-journal.md) | |
| T34 | `[x]` | Journal integration ready (trade commands structured for logging) | [M8](../features/m8-pnl-journal.md) | |
| T35 | `[x]` | Implement `pacifica journal` command with daily/weekly/monthly views | [M8](../features/m8-pnl-journal.md) | |

---

## Active Sprint — Day 3

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T21 | `[x]` | Implement `pacifica funding` command | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T22 | `[x]` | Add MCP tools: funding_rates, funding_history | [M3](../features/m3-funding-rate-arb-scanner.md) | |
| T15 | `[x]` | Build smart order manager with poll loop and state persistence | [M2](../features/m2-smart-order-manager.md) | |
| T16 | `[x]` | Implement trailing stop logic | [M2](../features/m2-smart-order-manager.md) | |
| T17 | `[x]` | Implement `pacifica smart` CLI subcommands | [M2](../features/m2-smart-order-manager.md) | |
| T40 | `[x]` | Build Claude Code Skills (5 slash commands) | All | |
| T41 | `[x]` | Demo script rehearsal and polish | — | Run through 3x minimum |
| T42 | `[x]` | Add 5 analytics MCP tools (journal, pnl_summary, heatmap, risk, smart_orders) | [M1](../features/m1-market-scanner-order-entry.md) | Read tools |
| T43 | `[x]` | Add 4 write MCP tools (modify_order, trailing_stop, partial_tp, cancel_smart) | [M1](../features/m1-market-scanner-order-entry.md) | Write tools |

---

## Sprint — M10 Intelligence

| # | Status | Task | Feature |
|---|--------|------|---------|
| T44 | `[x]` | Create `context/features/m10-agent-intelligence.md` | M10 |
| T45 | `[x]` | Update API_CONTRACTS.md, DATA_MODELS.md, ROADMAP.md, OVERVIEW.md, DECISIONS.md | M10 |
| T46 | `[x]` | Create `src/core/intelligence/schema.ts` — stable TypeScript interfaces | M10 |
| T47 | `[x]` | Create `src/core/intelligence/filter.ts` — market filter engine | M10 |
| T48 | `[x]` | Create `src/core/intelligence/patterns.ts` — trade pattern analyzer | M10 |
| T49 | `[x]` | Create `src/core/intelligence/alerts.ts` — alert manager + triage | M10 |
| T50 | `[x]` | Add `pacifica_top_markets` MCP tool to server.ts | M10 |
| T51 | `[x]` | Add `pacifica_liquidity_scan` MCP tool to server.ts | M10 |
| T52 | `[x]` | Add `pacifica_trade_patterns` MCP tool to server.ts | M10 |
| T53 | `[x]` | Add `pacifica_alert_triage` + `pacifica_market_snapshot` MCP tools | M10 |
| T54 | `[x]` | Create `src/cli/commands/alerts.ts` + register in index.ts | M10 |
| T55 | `[x]` | Update `src/cli/commands/scan.tsx` — add --gainers/--losers/--min-volume/--json | M10 |
| T56 | `[x]` | Create `.claude/commands/intelligence.md` agent recipe skill | M10 |

---

## Sprint — M11 Intelligence Layer

### Phase 01: Capture Layer (P0 — do first)

| # | Status | Task | Phase |
|---|--------|------|-------|
| TI1 | `[x]` | Extend `schema.ts` — add IntelligenceRecord, MarketContext, TradeOutcome, DetectedPattern, TraderReputation | 01 |
| TI2 | `[x]` | Create `src/core/intelligence/store.ts` — append-only JSON CRUD | 01 |
| TI3 | `[x]` | Create `src/core/intelligence/capture.ts` — market context snapshot at trade entry | 01 |
| TI4 | `[x]` | Hook `captureIntelligence()` into `src/cli/commands/trade.ts` (non-blocking) | 01 |
| TI5 | `[x]` | Create `src/core/intelligence/outcome.ts` — attach P&L to open records | 01 |
| TI6 | `[x]` | Hook `checkAndAttachOutcomes()` into `src/cli/commands/positions.ts` | 01 |
| TI7 | `[x]` | Create `src/core/intelligence/seed.ts` — 80 mock records across BTC/ETH/SOL | 01 |

### Phase 02: Pattern Engine + MCP (P1 — parallel with Phase 03)

| # | Status | Task | Phase |
|---|--------|------|-------|
| TI8  | `[x]` | Create `src/core/intelligence/engine.ts` — pattern detection + win-rate calc | 02 |
| TI9  | `[x]` | Create `src/core/intelligence/reputation.ts` — rep score computation | 02 |
| TI10 | `[x]` | Add `pacifica_intelligence_patterns` MCP tool | 02 |
| TI11 | `[x]` | Add `pacifica_intelligence_feed` MCP tool | 02 |
| TI12 | `[x]` | Add `pacifica_intelligence_reputation` MCP tool | 02 |
| TI13 | `[x]` | Create `src/cli/commands/intelligence.ts` — patterns/reputation/run/seed/serve | 02 |

### Phase 03: Web UI + REST API (P1 — parallel with Phase 02)

| # | Status | Task | Phase |
|---|--------|------|-------|
| TI14 | `[x]` | Create `src/intelligence-api/server.ts` — Fastify REST API on :4242 | 03 |
| TI15 | `[x]` | Implement API routes: /feed, /snapshot/:market, /patterns, /reputation | 03 |
| TI16 | `[x]` | Scaffold `web/` Next.js 14 app with Tailwind, design tokens | 03 |
| TI17 | `[x]` | Build Intelligence Feed page (Hero + PatternFeed + WhaleActivity + HighRepSignals) | 03 |
| TI18 | `[x]` | Build Market Snapshot page (split layout, condition match, agent summary card) | 03 |
| TI19 | `[x]` | Build Pattern Library page (PatternCard grid) | 03 |
| TI20 | `[x]` | Build Reputation Ledger page (leaderboard + NFT concept section) | 03 |

### Phase 04 — Elfa Social Intelligence (M12)

| # | Status | Task | Notes |
|---|--------|------|-------|
| TI21 | `[x]` | Add `SocialContext`, `SocialSentiment`, `SignalConfidence`, `ConfirmedSignal` to schema.ts | |
| TI22 | `[x]` | Extend `MarketContext` with optional `social?: SocialContext` | backward-compatible |
| TI23 | `[x]` | Add `ElfaConfig` to config/types.ts + `elfa?` field in `PacificaConfig` | |
| TI24 | `[x]` | Create `src/core/intelligence/social.ts` — ElfaClient + `fetchSocialContext()` | 5-min cache |
| TI25 | `[x]` | Add `scoreConfidence()` to engine.ts | onchain+social combined scoring |
| TI26 | `[x]` | Add `pacifica_social_context` MCP tool to server.ts | P0 for agent demo |
| TI27 | `[x]` | Add `/api/intelligence/social/:asset` route to intelligence API server | |
| TI28 | `[x]` | Create `SocialSignalsPanel` component + wire into web feed page | demo data fallback |
| TI29 | `[x]` | Create `SocialConfirmationCard` component + wire into snapshot page | |
| TI30 | `[x]` | Update seed.ts with mock `SocialContext` on seeded records | |

---

## Sprint — M11 Funding Rate Arbitrage Bot

| # | Status | Task | Feature |
|---|--------|------|---------|
| T57 | `[x]` | Create feature spec `context/features/m11-funding-arb-bot.md` | M11 |
| T58 | `[x]` | Builder Code: inject into signer.ts / client.ts / config types | M11 |
| T59 | `[x]` | Wire Builder Code through init wizard | M11 |
| T60 | `[x]` | Create `src/core/arb/types.ts` | M11 |
| T61 | `[x]` | Create `src/core/arb/scanner.ts` + unit tests | M11 |
| T62 | `[x]` | Create `src/core/arb/external.ts` (Binance/Bybit rate fetchers) | M11 |
| T63 | `[x]` | Create `src/core/arb/executor.ts` (entry/exit wrappers) | M11 |
| T64 | `[x]` | Create `src/core/arb/pnl.ts` (funding P&L accounting) | M11 |
| T65 | `[x]` | Create `src/core/arb/manager.ts` (poll loop + full lifecycle) | M11 |
| T66 | `[x]` | Arb-specific guardrails in ArbManager.canOpen() | M11 |
| T67 | `[x]` | Create `src/cli/commands/arb.ts` + register in index.ts | M11 |
| T68 | `[x]` | Create `src/cli/views/ArbView.tsx` (Ink TUI for arb status) | M11 |
| T69 | `[x]` | Add 6 MCP tools in server.ts | M11 |
| T70 | `[x]` | Manager lifecycle tests | M11 |
| T71 | `[x]` | P&L math tests | M11 |
| T72 | `[x]` | Update context/ files (ARCHITECTURE, DATA_MODELS, API_CONTRACTS) | M11 |
| T73 | `[x]` | Update DECISIONS.md, ROADMAP.md, SCOPE.md | M11 |
| T74 | `[x]` | Add /arb Claude Code skill | M11 |
| T75 | `[x]` | Demo-path rehearsal | M11 |

---

## Sprint — M12 Pacifica DEX Integration

### Phase A — Live Data Wiring

| # | Status | Task | Notes |
|---|--------|------|-------|
| T76 | `[ ]` | Add `src/intelligence-api/pacifica-client.ts` — GET-only fetch wrapper for test-api.pacifica.fi with 4s timeout and error normalization | |
| T77 | `[ ]` | Add `src/intelligence-api/cache.ts` — in-memory TTL cache (Map-based, per-endpoint TTLs) | |
| T78 | `[ ]` | Add GET /api/pacifica/account/:address route to intelligence-api/server.ts | |
| T79 | `[ ]` | Add GET /api/pacifica/subaccounts/:address route | |
| T80 | `[ ]` | Add GET /api/pacifica/positions/:address route (fans out to all subaccounts in parallel) | |

### Phase B — Portfolio Redesign

| # | Status | Task | Notes |
|---|--------|------|-------|
| T81 | `[ ]` | Build composite GET /api/portfolio/:address endpoint with intelligence overlay join (patterns, rep, funding) | |
| T82 | `[ ]` | Add SWR to web deps and create web/hooks/useUserPortfolio.ts | |
| T83 | `[ ]` | Build PositionCard component with PatternMatchLine, RepSignalLine, FundingWatchLine | |
| T84 | `[ ]` | Build EquityStrip and AccountTabs components | |
| T85 | `[ ]` | Rewrite web/app/portfolio/page.tsx using composite endpoint and new components | |
| T86 | `[ ]` | Build useSubaccountLabels hook (localStorage for custom subaccount names) | |

### Phase C — Signal → Trade Deep Links

| # | Status | Task | Notes |
|---|--------|------|-------|
| T87 | `[ ]` | Add "Trade on Pacifica →" deep-link buttons on PositionCard, snapshot page, pattern cards | |
| T88 | `[ ]` | Verify actual deep-link URL params supported by app.pacifica.fi | |

### Phase D — Subaccount Intelligence Polish

| # | Status | Task | Notes |
|---|--------|------|-------|
| T89 | `[ ]` | Subaccount performance comparison view (/portfolio?view=compare) | |
| T90 | `[ ]` | Copy pass on subaccount-aware overlay messaging | |

### Phase E — Additional Signal Surfaces

| # | Status | Task | Notes |
|---|--------|------|-------|
| T91 | `[ ]` | Drill-down slide-over for "N high-rep traders long ETH" → trader list | |
| T92 | `[ ]` | /watchlist page for starred markets with active patterns | |
| T93 | `[ ]` | Funding-flip toast when portfolio poll detects adverse funding change | |

### Phase F — Stretch: Signed Writes

| # | Status | Task | Notes |
|---|--------|------|-------|
| T94 | `[ ]` | Ed25519 signing in browser via Privy signMessage() for create-subaccount flow | |
| T95 | `[ ]` | POST /api/pacifica/subaccount/create proxy route in 4242 | |
| T96 | `[ ]` | "Create subaccount from intelligence" modal UI | |

---

## Sprint — M12 Simulate + Backtest Redesign

| # | Status | Task | Feature |
|---|--------|------|---------|
| T97 | `[x]` | Create feature spec m12-simulate-backtest.md | M12 |
| T98 | `[x]` | Refactor: extract SimulateForm.tsx + _lib/simulate.ts + _lib/volatility.ts | M12 |
| T99 | `[ ]` | Build web/lib/pacifica-public.ts + auto-fetch funding/price into form | M12 |
| T100 | `[ ]` | Build useCandles hook + PriceChart SVG (7d, liquidation + entry overlays) | M12 |
| T101 | `[ ]` | Build VolatilityScenarios (±1σ/2σ/3σ from realised vol) | M12 |
| T102 | `[ ]` | Build usePattern hook + PatternBacktestPanel (OutcomeStrip + DistributionCurve) | M12 |
| T103 | `[ ]` | Build ConditionsTally + web/lib/conditions.ts shared helpers | M12 |
| T104 | `[ ]` | Wire "Simulate this pattern →" on /patterns/[id] page | M12 |

---

## Deferred (P2 / Post-Hackathon)

| # | Status | Task | Feature | Notes |
|---|--------|------|---------|-------|
| T18 | `[x]` | Implement partial take-profit logic | [M2](../features/m2-smart-order-manager.md) | Core + MCP tool |
| T19 | `[>]` | Implement DCA entry, breakeven auto, time stop | [M2](../features/m2-smart-order-manager.md) | P2 |
| T23 | `[>]` | Build webhook HTTP server with fastify | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T24 | `[>]` | Implement webhook validation and order execution | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T25 | `[>]` | Add `pacifica webhook status/logs` commands | [M4](../features/m4-tradingview-webhook-bridge.md) | P2 stretch |
| T36 | `[>]` | Implement journal export (CSV/JSON) | [M8](../features/m8-pnl-journal.md) | P2 |
| T37 | `[>]` | Build event emitter module | [M9](../features/m9-event-hooks.md) | P2 |
| T38 | `[>]` | Build hook executor with template replacement | [M9](../features/m9-event-hooks.md) | P2 |
| T39 | `[>]` | Implement `pacifica hooks list/test/log` commands | [M9](../features/m9-event-hooks.md) | P2 |

---

## Blocked

| # | Task | Feature | Blocked by |
|---|------|---------|------------|
| — | — | — | — |

---

## Completed

| # | Task | Feature | Completed |
|---|------|---------|-----------|
| T1 | Project scaffolding: pnpm, tsconfig, tsup, commander, package.json bin | M6 | 2026-03-29 |
| T26 | Config loader/writer (.pacifica.yaml with zod validation) | M6 | 2026-03-29 |
| T2 | Pacifica REST SDK client (Ed25519 signing, rate limiter, TTL cache, retry) | M1 | 2026-03-29 |
| T3 | Pacifica WebSocket client (auto-reconnect, heartbeat, channel subscriptions) | M1 | 2026-03-29 |
| T27 | `pacifica init` wizard with @inquirer/prompts (5-step onboarding) | M6 | 2026-03-29 |
| T28 | Connection verification step (REST + WebSocket test in init wizard) | M6 | 2026-03-29 |
| T4 | `pacifica scan` command with Ink live table + WebSocket price updates | M1 | 2026-03-29 |
| T5 | `pacifica trade buy/sell` with validation, confirmation, TP/SL | M1 | 2026-03-29 |
| T6 | `pacifica orders` list + cancel + cancel-all | M1 | 2026-03-29 |
| T7 | `pacifica positions` list + close (reduce-only market order) | M1 | 2026-03-29 |
| T8 | MCP server with 12 tools (8 read + 4 write) with guardrails | M1 | 2026-03-29 |
| T9 | Guardrail checker module (6-step validation chain) | M5 | 2026-03-29 |
| T10 | Daily spending tracker (midnight reset, persisted to JSON) | M5 | 2026-03-29 |
| T11 | Agent action logger (append-only audit trail) | M5 | 2026-03-29 |
| T12 | `pacifica agent status/stop/start/config/log` (5 subcommands) | M5 | 2026-03-29 |
| T29 | Risk calculator + ASCII heatmap bar rendering | M7 | 2026-03-29 |
| T30 | HeatmapView with full + compact modes + risk summary | M7 | 2026-03-29 |
| T31 | `pacifica heatmap` command with --compact flag | M7 | 2026-03-29 |
| T32 | Risk data exposed via MCP agent_status tool | M7 | 2026-03-29 |
| T33 | Journal logger module (append-only, period filtering, summaries) | M8 | 2026-03-29 |
| T34 | Journal integration ready for trading flows | M8 | 2026-03-29 |
| T35 | `pacifica journal` with daily/weekly/monthly views + --json | M8 | 2026-03-29 |
| T21 | `pacifica funding` command (Pacifica-only) | M3 | 2026-03-29 |
| T22 | 2 MCP tools: funding_rates, funding_history | M3 | 2026-03-29 |
| T15 | Smart order manager with poll loop + JSON state persistence | M2 | 2026-03-29 |
| T16 | Trailing stop logic (long/short, extreme tracking, auto-close) | M2 | 2026-03-29 |
| T17 | `pacifica smart trailing/list/cancel` subcommands | M2 | 2026-03-29 |
| T40 | 5 Claude Code slash commands (/scan, /trade, /status, /funding, /risk) | All | 2026-03-29 |
| T41 | Demo script with all 9 feature sections | — | 2026-03-29 |
| T18 | Partial take-profit core logic (types, manager, poll loop) | M2 | 2026-03-30 |
| T42 | 5 analytics MCP tools (journal, pnl_summary, heatmap, risk, smart_orders) | M1 | 2026-03-30 |
| T43 | 4 write MCP tools (modify_order, trailing_stop, partial_tp, cancel_smart) | M1 | 2026-03-30 |
| T44 | M10 feature spec, intelligence modules, MCP tools, and CLI integration | M10 | 2026-04-05 |
| T45 | Context file updates for M10 (APIs, data models, decisions, roadmap) | M10 | 2026-04-05 |
| T46 | Create `src/core/intelligence/schema.ts` — stable TypeScript interfaces | M10 | 2026-04-05 |
| T47 | Create `src/core/intelligence/filter.ts` — market filter engine | M10 | 2026-04-05 |
| T48 | Create `src/core/intelligence/patterns.ts` — trade pattern analyzer | M10 | 2026-04-05 |
| T49 | Create `src/core/intelligence/alerts.ts` — alert manager + triage | M10 | 2026-04-05 |
| T50 | Add `pacifica_top_markets` MCP tool to server.ts | M10 | 2026-04-05 |
| T51 | Add `pacifica_liquidity_scan` MCP tool to server.ts | M10 | 2026-04-05 |
| T52 | Add `pacifica_trade_patterns` MCP tool to server.ts | M10 | 2026-04-05 |
| T53 | Add `pacifica_alert_triage` + `pacifica_market_snapshot` MCP tools | M10 | 2026-04-05 |
| T54 | Create `src/cli/commands/alerts.ts` + register in index.ts | M10 | 2026-04-05 |
| T55 | Update `src/cli/commands/scan.tsx` — add --gainers/--losers/--min-volume/--json | M10 | 2026-04-05 |
| T56 | Create `.claude/commands/intelligence.md` agent recipe skill | M10 | 2026-04-05 |
| T57 | Create feature spec `context/features/m11-funding-arb-bot.md` | M11 | 2026-04-12 |
| T58 | Builder Code: inject into signer.ts / client.ts / config types | M11 | 2026-04-12 |
| T59 | Wire Builder Code through init wizard | M11 | 2026-04-12 |
| T60 | Create `src/core/arb/types.ts` | M11 | 2026-04-12 |
| T61 | Create `src/core/arb/scanner.ts` + unit tests | M11 | 2026-04-12 |
| T62 | Create `src/core/arb/external.ts` (Binance/Bybit rate fetchers) | M11 | 2026-04-12 |
| T63 | Create `src/core/arb/executor.ts` (entry/exit wrappers) | M11 | 2026-04-12 |
| T64 | Create `src/core/arb/pnl.ts` (funding P&L accounting) | M11 | 2026-04-12 |
| T65 | Create `src/core/arb/manager.ts` (poll loop + full lifecycle) | M11 | 2026-04-12 |
| T66 | Arb-specific guardrails in ArbManager.canOpen() | M11 | 2026-04-12 |
| T67 | Create `src/cli/commands/arb.ts` + register in index.ts | M11 | 2026-04-12 |
| T68 | Create `src/cli/views/ArbView.tsx` (Ink TUI for arb status) | M11 | 2026-04-12 |
| T69 | Add 6 MCP tools in server.ts | M11 | 2026-04-12 |
| T70 | Manager lifecycle tests | M11 | 2026-04-12 |
| T71 | P&L math tests | M11 | 2026-04-12 |
| T72 | Update context/ files (ARCHITECTURE, DATA_MODELS, API_CONTRACTS) | M11 | 2026-04-13 |
| T73 | Update DECISIONS.md, ROADMAP.md, SCOPE.md | M11 | 2026-04-13 |
| T74 | Add /arb Claude Code skill | M11 | 2026-04-13 |
| T75 | Demo-path rehearsal (arb scan, intelligence patterns, funding, heatmap) | M11 | 2026-04-13 |
| TN12 | Pattern backtest (replay against historical candles) | — | 2026-04-16 |
| TN13 | Per-pattern journal tagging | — | 2026-04-16 |
| T98 | Refactor: extract SimulateForm.tsx + _lib/simulate.ts + _lib/volatility.ts | M12 | 2026-04-16 |

---

## Task States

| Symbol | Meaning | When to use |
|--------|---------|-------------|
| `[ ]` | Todo | Not started |
| `[~]` | In progress | Currently being worked on |
| `[x]` | Done | Completed and verified |
| `[-]` | Blocked | Waiting on something else |
| `[>]` | Deferred | Decided to push to later phase |
