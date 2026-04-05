# Phase 04: CLI Commands

**Parent plan:** [plan.md](./plan.md)
**Depends on:** Phase 02 (intelligence core), Phase 03 (MCP tools for reference patterns)
**Status:** `[ ]` Not started
**Priority:** Medium — terminal UX for human traders

---

## Overview

Two CLI tasks:
1. **New command:** `pacifica alerts` — alert CRUD + check
2. **Enhancement:** `pacifica scan` — add `--gainers`, `--losers`, `--min-volume`, `--json` flags

---

## 4A: `pacifica alerts` Command

### File: `src/cli/commands/alerts.ts`

Pattern: follow `src/cli/commands/smart.ts` (subcommand group with `createXxxCommand()` factory).

```typescript
export function createAlertsCommand(): Command {
  const alerts = new Command("alerts")
    .description("Manage price and funding alerts");

  alerts
    .command("list")
    .description("List all configured alerts with current status")
    .option("--json", "Output JSON")
    .action(async (opts) => { /* ... */ });

  alerts
    .command("add")
    .description("Add a new alert")
    .requiredOption("--symbol <symbol>", "Market symbol (e.g. BTC)")
    .option("--above <price>", "Trigger when price goes above value", parseFloat)
    .option("--below <price>", "Trigger when price goes below value", parseFloat)
    .option("--funding-above <rate>", "Trigger when funding rate > value", parseFloat)
    .option("--funding-below <rate>", "Trigger when funding rate < value", parseFloat)
    .option("--volume-spike <usd>", "Trigger when 24h volume > USD value", parseFloat)
    .option("--note <text>", "Optional label for this alert")
    .action(async (opts) => { /* ... */ });

  alerts
    .command("remove <id>")
    .description("Remove an alert by ID")
    .action(async (id) => { /* ... */ });

  alerts
    .command("check")
    .description("Check all alerts against current market data")
    .option("--all", "Include dormant alerts in output")
    .option("--json", "Output JSON")
    .action(async (opts) => { /* ... */ });

  return alerts;
}
```

### `alerts list` output (chalk, non-Ink):

```
┌─ ALERTS (3) ─────────────────────────────────────────────────┐
│ ID       SYMBOL  TYPE         THRESHOLD  STATUS   DISTANCE   │
│ abc123   BTC     price_above  100000     active   +2.3%      │
│ def456   ETH     price_below  2800       triggered  -0.5%    │
│ ghi789   SOL     funding_above 0.0005   active   +45%       │
└──────────────────────────────────────────────────────────────┘
```

Status colors: triggered=red, near=yellow, active=green, dismissed=dim.

### `alerts add` flow:

Validate that exactly one condition flag is provided (`--above`, `--below`, `--funding-above`, `--funding-below`, `--volume-spike`). If none or multiple, print error and exit.

### `alerts check` output:

```
┌─ ALERT TRIAGE ───────────────────────────────────────────────┐
│ TRIGGERED (1)                                                │
│  ● ETH  price_below $2800  │ current: $2756  │ -1.6% past   │
│                                                              │
│ NEAR TRIGGER (1)                                             │
│  ◆ BTC  price_above $100k  │ current: $97.8k │ +2.3% away   │
└──────────────────────────────────────────────────────────────┘
```

---

## 4B: `pacifica scan` Enhancements

### File: `src/cli/commands/scan.tsx` (existing)

Add flags to `scanCommand` options type and the export function signature:

```typescript
// Before
export async function scanCommand(options: { testnet?: boolean; json?: boolean }): Promise<void>

// After
export async function scanCommand(options: {
  testnet?: boolean;
  json?: boolean;
  gainers?: boolean;
  losers?: boolean;
  minVolume?: number;
}): Promise<void>
```

**Flag logic (applied before rendering):**

```typescript
let filteredMarkets = markets;

// Apply volume filter first
if (options.minVolume && options.minVolume > 0) {
  filteredMarkets = liquidityFilter(filteredMarkets, options.minVolume);
}

// Apply sort
if (options.gainers) {
  filteredMarkets = [...filteredMarkets].sort((a, b) => b.change24h - a.change24h);
} else if (options.losers) {
  filteredMarkets = [...filteredMarkets].sort((a, b) => a.change24h - b.change24h);
}
```

**`--json` flag (existing but ensure it works with new filters):**

When `--json` is set, output `JSON.stringify(filteredMarkets, null, 2)` and exit immediately (no Ink, no WebSocket). This is pipe-friendly stable output.

**CLI registration update in `src/cli/index.ts`:**

```typescript
// Existing scan command — add options
const scanCmd = new Command("scan")
  .description("Scan markets for trading opportunities")
  .option("--gainers", "Sort by 24h gain (descending)")
  .option("--losers", "Sort by 24h loss (descending)")
  .option("--min-volume <usd>", "Filter markets with volume below threshold (USD)", parseFloat)
  .action(async () => {
    const { scanCommand } = await import("./commands/scan.js");
    await scanCommand(program.opts());
  });
```

**Note:** `program.opts()` returns global options. Local scan options need to be passed from `scanCmd.opts()` — refactor the action to merge both:

```typescript
.action(async () => {
  const { scanCommand } = await import("./commands/scan.js");
  await scanCommand({ ...program.opts(), ...scanCmd.opts() });
});
```

---

## Register `alerts` in `src/cli/index.ts`

Add after existing `smartCmd` registration:

```typescript
const { createAlertsCommand } = await import("./commands/alerts.js");
const alertsCmd = createAlertsCommand();

program.addCommand(alertsCmd);
```

---

## Related Code Files

- `src/cli/commands/smart.ts` — subcommand factory pattern reference
- `src/cli/commands/scan.tsx` — existing file to modify
- `src/cli/index.ts` — command registration
- `src/cli/theme.ts` — `formatVolume`, color utilities
- `src/core/intelligence/alerts.ts` — AlertManager
- `src/core/intelligence/filter.ts` — liquidityFilter, topGainers, topLosers
- `src/core/sdk/client.ts` — PacificaClient

---

## Implementation Steps

1. Read `src/cli/commands/smart.ts` fully (pattern reference)
2. Create `src/cli/commands/alerts.ts`:
   - `createAlertsCommand()` factory
   - `list`, `add`, `remove`, `check` subcommands
   - chalk-based output (no Ink — these are one-shot commands)
3. Update `src/cli/commands/scan.tsx`:
   - Extend options type
   - Add filter/sort logic
   - Verify `--json` outputs filtered markets
4. Update `src/cli/index.ts`:
   - Add `--gainers`, `--losers`, `--min-volume` to scanCmd
   - Fix `scanCmd.opts()` merge
   - Register `alertsCmd`
5. Run `pnpm tsc --noEmit`

---

## Success Criteria

- [ ] `pacifica alerts list` shows all alerts with status
- [ ] `pacifica alerts add --symbol BTC --above 100000` creates alert
- [ ] `pacifica alerts remove <id>` removes alert
- [ ] `pacifica alerts check` shows triggered/near in priority order
- [ ] `pacifica scan --gainers` sorts by 24h change desc
- [ ] `pacifica scan --min-volume 5000000` filters low-volume markets
- [ ] `pacifica scan --json` outputs valid JSON array (pipe-friendly)
- [ ] `pnpm tsc --noEmit` passes

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `program.opts()` doesn't include scan-specific flags | Merge `scanCmd.opts()` in action handler |
| Ink rendering breaks when 0 markets match filter | Guard: if `filteredMarkets.length === 0`, print "No markets match filter" and exit |
| `alerts add` requires exactly one condition — UX error if user passes none | Validate in action, print helpful error with examples |
| `scan.tsx` options type change breaks WebSocket path | WebSocket feeds prices by symbol — only update display array, not WS subscription list |

## Security Considerations

- Alert `id` is `crypto.randomUUID()` — not user-controlled
- `remove <id>` validates ID against existing alerts before deletion (no path traversal)
- No shell execution in any alert handler
