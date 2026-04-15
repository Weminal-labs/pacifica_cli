# M12 — Pacifica DEX Integration (Intelligence Overlay)

**Status:** Planned  
**Priority:** High  
**Sprint:** M12

## Overview
Integrate the Pacifica Intelligence web app (localhost:3000) with the real Pacifica DEX testnet. The app becomes a read-heavy intelligence overlay — users see their live Pacifica positions enriched with patterns, rep signals, and funding alerts.

## Core Principle
The intelligence app is NOT a trading UI. It is the tab you keep open next to app.pacifica.fi. No order placement, no deposits, no chart rendering. Deep-link to app.pacifica.fi for execution.

## Data Flow
Browser → 4242 API server → test-api.pacifica.fi (GET, no auth)
Browser never talks to Pacifica API directly.

## Testnet Endpoints
- REST: https://test-api.pacifica.fi/api/v1
- WebSocket: wss://test-ws.pacifica.fi/ws
- Auth: GET = no auth, POST = Ed25519 deterministic signatures

## New 4242 Backend Routes
- GET /api/pacifica/account/:address — master account equity, balance, mmr
- GET /api/pacifica/subaccounts/:address — list subaccounts
- GET /api/pacifica/positions/:address — open positions (fans out across master + all subs)
- GET /api/pacifica/funding_history?symbol=X&hours=N — historical funding rates
- GET /api/portfolio/:address — COMPOSITE: account + subaccounts + positions + intelligence overlay

## Portfolio Page (redesigned)
Shows live Pacifica positions as primary content. Each position card has:
- Position details (size, entry, mark, PnL, liquidation price)
- Pattern match (best matching verified pattern for this asset/direction)
- Rep signal (how many high-rep traders are in a similar position)
- Funding watch (current rate + trend direction)
- "Trade on Pacifica →" deep link button

## Subaccount Architecture
- Fan out position fetch across all subaccount addresses in parallel
- Per-subaccount tabs in portfolio UI
- Local labels stored in localStorage (no backend storage needed)
- Position overlay computed per subaccount

## Signing (Phase F — stretch)
- Use Privy's wallet.signMessage() for Ed25519 signing
- Only signed action: Create Subaccount
- POST proxied through 4242 (not direct from browser)
- Reference: https://github.com/pacifica-fi/python-sdk

## Out of Scope
- Order placement, TP/SL, cancel orders
- Deposits/withdrawals
- Chart rendering
- WebSocket fan-out from 4242 to browser
- Multi-wallet comparison
- Mainnet switch
- Mobile responsive beyond Tailwind defaults

## Tasks

| # | Status | Task | Phase |
|---|--------|------|-------|
| T76 | `[ ]` | Add `src/intelligence-api/pacifica-client.ts` — GET-only fetch wrapper | A |
| T77 | `[ ]` | Add `src/intelligence-api/cache.ts` — in-memory TTL cache | A |
| T78 | `[ ]` | Add GET /api/pacifica/account/:address route | A |
| T79 | `[ ]` | Add GET /api/pacifica/subaccounts/:address route | A |
| T80 | `[ ]` | Add GET /api/pacifica/positions/:address route | A |
| T81 | `[ ]` | Build composite GET /api/portfolio/:address endpoint | B |
| T82 | `[ ]` | Add SWR and create web/hooks/useUserPortfolio.ts | B |
| T83 | `[ ]` | Build PositionCard component | B |
| T84 | `[ ]` | Build EquityStrip and AccountTabs components | B |
| T85 | `[ ]` | Rewrite web/app/portfolio/page.tsx | B |
| T86 | `[ ]` | Build useSubaccountLabels hook | B |
| T87 | `[ ]` | Add "Trade on Pacifica →" deep-link buttons | C |
| T88 | `[ ]` | Verify deep-link URL params with app.pacifica.fi | C |
| T89 | `[ ]` | Subaccount performance comparison view | D |
| T90 | `[ ]` | Copy pass on subaccount-aware overlay messaging | D |
| T91 | `[ ]` | Drill-down slide-over for rep signal detail | E |
| T92 | `[ ]` | /watchlist page for starred markets | E |
| T93 | `[ ]` | Funding-flip toast on portfolio change | E |
| T94 | `[ ]` | Ed25519 signing via Privy for subaccount creation | F |
| T95 | `[ ]` | POST /api/pacifica/subaccount/create proxy route | F |
| T96 | `[ ]` | "Create subaccount from intelligence" modal UI | F |
