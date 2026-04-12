# Phase 05: Agent Skill + Final Docs

**Parent plan:** [plan.md](./plan.md)
**Depends on:** Phases 02-04 (all code complete)
**Status:** `[ ]` Not started
**Priority:** Medium — completes the agent-native story

---

## Overview

Two tasks:
1. Create `.claude/commands/intelligence.md` — the agent recipe slash command
2. Final README.md update to document M10 tools

---

## 5A: `.claude/commands/intelligence.md` — Agent Intelligence Skill

This is a Claude Code skill (slash command) that orchestrates the new MCP tools into a coherent analysis workflow. When a user or agent types `/intelligence` or `/pacifica intelligence`, Claude runs the recipe chain.

### Skill Design

```markdown
# /intelligence — Pacifica Market Intelligence Workflow

This skill orchestrates the M10 agent-readable tools into a complete analysis.

## Workflow

Run these MCP tools in sequence:

### Step 1: Market Overview
Call `pacifica_top_markets` with:
- sort_by: "gainers", limit: 5, min_volume_usd: 1000000

### Step 2: Liquidity Validation
Take the symbols from Step 1 results.
Call `pacifica_liquidity_scan` with:
- symbols: [symbols from step 1]

Filter out any symbols with:
- liquidityScore < 40
- slippage50k > 0.5% (too slippery for meaningful position)

### Step 3: Alert Triage
Call `pacifica_alert_triage` with:
- include_dormant: false

### Step 4: Pattern Check (optional, for top 1-2 symbols)
For the highest-ranked liquid market, call `pacifica_trade_patterns` with:
- symbol: top_symbol
- limit: 100

### Step 5: Synthesis
Combine all results and provide:
1. Top tradeable opportunities (gainers that pass liquidity filter)
2. Active alerts requiring attention (triggered or near)
3. Trade pattern signal for top opportunity (if bullish/bearish/neutral)
4. Recommended next action: trade suggestion OR "monitor" OR "no clear opportunity"

## Agent Recipe #2: Alert-Driven Triage
If the user says "check my alerts":
1. Call `pacifica_alert_triage({})`
2. For each triggered alert, call `pacifica_get_ticker({symbol})`
3. Confirm the trigger is still valid (price hasn't reversed)
4. Suggest action per triggered alert

## Output Format
- Lead with the most actionable finding
- Show opportunity table (symbol, change, liquidity score, pattern signal)
- Show triggered alerts prominently
- End with a single recommended action
```

### File location: `.claude/commands/intelligence.md`

---

## 5B: README Update

Locate the MCP tools section in `README.md` and:

1. Update tool count: "23 tools" → "28 tools"
2. Add **Intelligence Tools** subsection after Analytics Tools:

```markdown
#### Intelligence Tools (5 — agent-readable data)

| Tool | Purpose |
|------|---------|
| `pacifica_top_markets` | Ranked markets by gainers/losers/volume/OI/funding with optional liquidity gate |
| `pacifica_liquidity_scan` | Order book depth, spread%, slippage estimates for tradeable sizing |
| `pacifica_trade_patterns` | Buy pressure, VWAP, whale order detection, momentum signal |
| `pacifica_alert_triage` | Prioritized alert list: triggered first, near-trigger second |
| `pacifica_market_snapshot` | Full market intelligence in one stable JSON response (schemaVersion: "1.0") |
```

3. Add **Alerts CLI** section:

```markdown
### Alert Management

```bash
# Add a price alert
pacifica alerts add --symbol BTC --above 100000

# Add a funding rate alert
pacifica alerts add --symbol ETH --funding-above 0.001 --note "funding squeeze"

# Check triggered alerts
pacifica alerts check

# List all alerts
pacifica alerts list

# Remove an alert
pacifica alerts remove <id>
```

4. Update `pacifica scan` docs to mention new flags:
```bash
pacifica scan --gainers --min-volume 5000000   # top movers with liquidity
pacifica scan --losers                          # biggest 24h declines
pacifica scan --json | jq '.[0]'               # pipe-friendly output
```

---

## 5C: Context Folder Final Sync (from Phase 01)

Verify all Phase 01 context updates were applied. Check:
- [ ] `context/features/m10-agent-intelligence.md` exists
- [ ] `context/technical/API_CONTRACTS.md` has 5 new tools
- [ ] `context/technical/DATA_MODELS.md` has intelligence schema
- [ ] `context/project/TASK-LIST.md` has T44-T56 marked `[x]`
- [ ] `context/project/ROADMAP.md` has M10
- [ ] `context/project/OVERVIEW.md` updated tool count
- [ ] `context/project/DECISIONS.md` has D9

---

## Implementation Steps

1. Read existing `.claude/commands/scan.md` for format reference
2. Create `.claude/commands/intelligence.md`
3. Read `README.md` — find MCP tools section
4. Update README tool count and add intelligence section
5. Mark T44-T56 as `[x]` in TASK-LIST.md
6. Final `pnpm tsc --noEmit` check

---

## Success Criteria

- [ ] `.claude/commands/intelligence.md` exists with 2 agent recipes
- [ ] README updated with 28-tool count and intelligence section
- [ ] All T44-T56 marked `[x]` in TASK-LIST.md
- [ ] `pnpm tsc --noEmit` passes (final check)

---

## Unresolved Questions

1. **Skill invocation name:** Should it be `/intelligence` or `/pacifica intelligence`? Check existing `.claude/commands/` naming convention.
2. **README structure:** Does README have a specific format for skills? Check before appending.
