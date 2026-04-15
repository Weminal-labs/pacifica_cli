# Phase 4: CLI Backtest Command

## Overview

| Field | Value |
|-------|-------|
| **Date** | 2026-04-15 |
| **Priority** | Medium |
| **Status** | Planned |
| **Estimated effort** | 2 days |
| **Depends on** | None — can be built in parallel with Phase 2 or 3 |

### Context Links
- Master plan: [plan.md](./plan.md)
- Previous phase: [phase-03-agent-recipe-export.md](./phase-03-agent-recipe-export.md)
- Schema types: `src/core/intelligence/schema.ts`
- Intelligence store: `src/core/intelligence/store.ts`
- CLI entry point: `src/cli/index.ts`
- Existing commands: `src/cli/commands/` (paper.ts, intelligence.ts, simulate.ts)
- Theme/output utilities: `src/cli/theme.ts`, `src/output/envelope.ts`

---

## Key Insight

The same condition-to-outcome matching that powers the web backtest panel can be
surfaced as a first-class CLI command. This gives agents and power users a way to:

1. Query pattern performance from the terminal without opening a browser
2. Validate patterns programmatically before trusting them in automated strategies
3. Generate structured JSON output for agent pipelines
4. Replay paper trading history to compare actual vs expected outcomes

---

## Requirements

### Command Structure

```
pacifica backtest pattern <pattern_id> [options]
pacifica backtest setup [options]
pacifica backtest paper --replay [options]
```

#### `pacifica backtest pattern <pattern_id>`

Loads a `DetectedPattern` by ID, runs the condition set against all `IntelligenceRecords`,
and reports performance metrics.

Options:
- `--limit <n>` — cap number of records to analyse (default: all)
- `--json` — output full structured JSON instead of formatted table
- `--validate` — if enough data, marks the pattern as `backtest_validated: true`
  in `patterns-verified.json` (requires `--validate` flag, not automatic)

#### `pacifica backtest setup`

Runs an ad-hoc backtest without a saved pattern — user specifies conditions inline.

Options (all optional except `--symbol` and `--direction`):
- `--symbol <sym>` (required) — e.g. `ETH`
- `--direction <long|short>` (required)
- `--leverage <n>` — filter to records using <= this leverage
- `--funding-min <f>` — minimum funding rate at entry
- `--funding-max <f>` — maximum funding rate at entry
- `--buy-pressure-min <f>` — minimum buy pressure ratio
- `--period <Nd>` — limit to records from the last N days (e.g. `--period 30d`)
- `--json` — structured JSON output

#### `pacifica backtest paper --replay`

Reads the paper trading history from `~/.pacifica/paper-state.json` and replays it
against the intelligence records to show how the paper trades compared to historical
pattern performance.

Options:
- `--json` — structured JSON output

---

## Output Format

### Default (formatted table output)

```
BACKTEST: ETH long  ·  last 30d  ·  47 matched trades
═══════════════════════════════════════════════════════

  Win Rate          68.1%   ██████████████░░░░░░░
  Avg P&L           +12.3%
  Median P&L         +8.1%
  Max Drawdown      -23.4%
  Avg Hold Time     4.2 hrs
  Liquidation Rate   2.1%

  Best trade:   +89.4%  (2026-02-14, 3.2 hrs)
  Worst trade:  -45.2%  (2026-01-08, 0.8 hrs)

  EQUITY CURVE
  ┌──────────────────────────────────────────────┐
  │  +150% ╭──────╮                              │
  │  +100%  ╰─╮   ╰─────────────╮               │
  │   +50%    ╰──╮              ╰──────────────  │
  │     0%       ╰──────────────                 │
  │   -50%                                       │
  └──────────────────────────────────────────────┘
  Trades: 47  ·  Final: +134.2%

  DURATION DISTRIBUTION
  < 1h     ████░░░░░░  8 trades  (62.5% wins)
  1–4h     ████████░░  21 trades (71.4% wins)
  4–24h    ██████░░░░  14 trades (71.4% wins)
  1–7d     ████░░░░░░  4 trades  (50.0% wins)
```

Win rate bar uses block characters (`█` = win fraction, `░` = loss fraction).
Equity curve uses a simple ASCII rendering (optional — can be skipped if terminal
width is too narrow, detected via `process.stdout.columns`).

### JSON output (`--json`)

```json
{
  "symbol": "ETH",
  "direction": "long",
  "filters": {
    "period_days": 30,
    "leverage_max": null,
    "funding_min": null,
    "funding_max": null,
    "buy_pressure_min": null
  },
  "matched": 47,
  "win_rate": 0.681,
  "avg_pnl_pct": 12.3,
  "median_pnl_pct": 8.1,
  "max_drawdown_pct": -23.4,
  "avg_duration_minutes": 252,
  "liquidation_rate": 0.021,
  "sharpe_estimate": 1.42,
  "best": { "pnl_pct": 89.4, "opened_at": "2026-02-14T10:22:00Z", "duration_minutes": 192 },
  "worst": { "pnl_pct": -45.2, "opened_at": "2026-01-08T14:05:00Z", "duration_minutes": 48 },
  "equity_curve": [
    { "index": 0, "trade_pnl": 15.2, "cumulative_pnl": 15.2 },
    ...
  ],
  "outcomes": [...],
  "generated_at": "2026-04-15T12:07:00Z"
}
```

---

## Architecture

```
src/cli/commands/backtest.ts       ← new file
  ├── backtestCommand (Commander.Command)
  │     ├── subcommand: pattern <id>
  │     ├── subcommand: setup
  │     └── subcommand: paper --replay
  └── shared helpers
        ├── queryRecords(filters) → MatchedRecord[]
        ├── computeStats(outcomes) → BacktestStats
        ├── buildEquityCurve(outcomes) → EquityCurvePoint[]
        ├── computeMaxDrawdown(curve) → number
        ├── computeSharpEstimate(returns) → number
        ├── renderTable(stats) → void   (uses theme.ts)
        └── renderAsciiEquityCurve(curve, width) → string

src/cli/index.ts
  └── program.addCommand(backtestCommand)
```

### BacktestStats type (internal to backtest.ts)

```typescript
interface BacktestStats {
  matched: number;
  win_rate: number;
  avg_pnl_pct: number;
  median_pnl_pct: number;
  max_drawdown_pct: number;
  avg_duration_minutes: number;
  liquidation_rate: number;
  sharpe_estimate: number;
  best: { pnl_pct: number; opened_at: string; duration_minutes: number } | null;
  worst: { pnl_pct: number; opened_at: string; duration_minutes: number } | null;
  equity_curve: EquityCurvePoint[];
  outcomes: OutcomePoint[];
}
```

### Pattern matching for `backtest pattern <id>`

```typescript
// Load the pattern, extract its conditions, filter records by conditions
const pattern = patterns.find(p => p.id === patternId);
if (!pattern) { writeError(`Pattern ${patternId} not found`); return; }

// For each condition in pattern.conditions, apply filter to records
// PatternCondition.axis maps to a key on IntelligenceRecord.market_context
// PatternCondition.op is "lt" | "gt" | "lte" | "gte" | "eq"
// PatternCondition.value is number | string
const filteredRecords = records.filter(r => {
  if (!r.outcome) return false;  // only closed trades
  return pattern.conditions.every(cond => evaluateCondition(r.market_context, cond));
});
```

### Sharpe estimate

Simple approximation from the returns series (no risk-free rate since this is
already on-margin):

```typescript
function computeSharpeEstimate(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  return stdDev === 0 ? 0 : parseFloat((mean / stdDev).toFixed(2));
}
```

### `--validate` flag behaviour

When `pacifica backtest pattern <id> --validate` is run:

1. Require `matched >= 20` (minimum sample for validation)
2. Write `backtest_validated: true` and `backtest_validated_at` timestamp to the
   pattern in `patterns-verified.json` using `savePatterns()`
3. Also update `TraderReputation.accuracy_by_condition` for each condition that
   appears in the pattern — boost the `win_rate` and `avg_pnl_pct` fields
   for condition keys matching the pattern's conditions

```typescript
// After validation, update reputation scores
const repMap = await loadReputation();
for (const [traderId, rep] of repMap) {
  for (const cond of pattern.conditions) {
    const key = `${cond.axis}_${cond.op}_${cond.value}`;
    if (rep.accuracy_by_condition[key]) {
      // re-score using backtest outcomes for this trader's records
    }
  }
}
await saveReputation(repMap);
```

### ASCII equity curve renderer

```typescript
function renderAsciiEquityCurve(
  curve: EquityCurvePoint[],
  width: number = 50,
  height: number = 6,
): string {
  if (curve.length === 0) return "(no data)";
  const values = curve.map(p => p.cumulative_pnl);
  const min = Math.min(0, ...values);  // always include 0 baseline
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  // Build rows × cols grid
  const rows: string[][] = Array.from({ length: height }, () => Array(width).fill(" "));

  // Plot each data point
  curve.forEach((p, i) => {
    const col = Math.floor((i / Math.max(1, curve.length - 1)) * (width - 1));
    const row = height - 1 - Math.floor(((p.cumulative_pnl - min) / range) * (height - 1));
    rows[Math.max(0, Math.min(height - 1, row))][col] = p.cumulative_pnl >= 0 ? "╌" : "·";
  });

  // Y-axis labels
  const topLabel    = `+${max.toFixed(0)}%`;
  const bottomLabel = `${min.toFixed(0)}%`;
  const zeroRow     = height - 1 - Math.floor(((0 - min) / range) * (height - 1));

  return rows.map((row, i) => {
    const prefix = i === 0 ? topLabel.padStart(8) :
                   i === zeroRow ? "    0%  " :
                   i === height - 1 ? bottomLabel.padStart(8) :
                   "        ";
    return prefix + "│" + row.join("");
  }).join("\n");
}
```

---

## Related Code Files

| File | Relationship |
|------|-------------|
| `src/cli/commands/backtest.ts` | New file — entire phase lives here |
| `src/cli/index.ts` | Add `program.addCommand(backtestCommand)` |
| `src/core/intelligence/store.ts` | `loadRecords()`, `loadPatterns()`, `savePatterns()`, `loadReputation()`, `saveReputation()` |
| `src/core/intelligence/schema.ts` | `IntelligenceRecord`, `DetectedPattern`, `PatternCondition`, `TraderReputation` |
| `src/cli/theme.ts` | `theme`, `formatPercent`, `formatTimestamp` — use for consistent output styling |
| `src/output/envelope.ts` | `writeSuccess`, `writeError`, `writeInfo` — for structured output |
| `src/cli/commands/paper.ts` | Reference for paper state file path and PaperTrade type |

---

## Implementation Steps

1. **Create `src/cli/commands/backtest.ts`**
   - Import Commander, store functions, schema types, theme utilities
   - Define `backtestCommand` as a `new Command("backtest")`
   - Add `.description("Backtest a trading setup or pattern against historical intelligence records")`

2. **Implement shared query helpers in backtest.ts**
   - `queryRecords(filters)` → filtered + sorted records
   - `computeStats(outcomes)` → `BacktestStats`
   - `buildEquityCurve(outcomes)` → `EquityCurvePoint[]`
   - `computeMaxDrawdown(curve)` → number
   - `computeSharpEstimate(returns)` → number
   - `renderAsciiEquityCurve(curve, width, height)` → string

3. **Implement `backtest setup` subcommand**
   - Options: `--symbol`, `--direction`, `--leverage`, `--funding-min`, `--funding-max`,
     `--buy-pressure-min`, `--period`, `--json`
   - Validate `--symbol` and `--direction` are present
   - Parse `--period` (e.g. `30d` → 30 days ago as a Date)
   - Load records, apply filters, compute stats
   - If `--json`: output JSON and exit
   - Else: render formatted table + ASCII equity curve

4. **Implement `backtest pattern <id>` subcommand**
   - Load patterns, find by ID (exact match or prefix match)
   - Extract conditions from `pattern.conditions`
   - Apply `evaluateCondition(market_context, condition)` for each condition
   - Compute stats on matched + closed records
   - If `--validate` flag: check minimum sample size, call `savePatterns` with
     `backtest_validated` field, update reputation where applicable
   - Render output

5. **Implement `backtest paper --replay` subcommand**
   - Read `~/.pacifica/paper-state.json` (use the `STATE_PATH` constant pattern from paper.ts)
   - For each closed `PaperTrade`, find matching intelligence records with same symbol,
     direction, and overlapping time window
   - Compare paper trade's `realized_pnl` against historical `avg_pnl_pct`
   - Show a comparison table: paper P&L vs historical median, win/loss alignment
   - Flag outliers (paper trades that performed significantly better or worse than history)

6. **Register in `src/cli/index.ts`**
   - Import `backtestCommand` from `./commands/backtest.js`
   - Add `program.addCommand(backtestCommand)` (maintain alphabetical order with other commands)

7. **Manual test**
   - `pacifica backtest setup --symbol ETH --direction long` (with seed data)
   - `pacifica backtest setup --symbol ETH --direction long --json | jq .win_rate`
   - `pacifica backtest pattern <first-pattern-id-from-seed>`
   - `pacifica backtest paper --replay` (requires paper trades in state)

---

## Todo List

- [ ] Create `src/cli/commands/backtest.ts` with command skeleton
- [ ] Implement `queryRecords(filters)` helper
- [ ] Implement `computeStats(outcomes)` helper
- [ ] Implement `buildEquityCurve`, `computeMaxDrawdown`, `computeSharpEstimate`
- [ ] Implement `renderAsciiEquityCurve`
- [ ] Implement `backtest setup` subcommand (formatted + JSON output)
- [ ] Implement `backtest pattern <id>` subcommand
- [ ] Implement `--validate` flag on `backtest pattern`
- [ ] Implement `backtest paper --replay` subcommand
- [ ] Register `backtestCommand` in `src/cli/index.ts`
- [ ] Test with seed data: verify win rate, avg P&L calculations
- [ ] Test `--validate` flag: verify pattern file is updated
- [ ] Test `--json` output: valid JSON, correct field names
- [ ] Test with 0 matched records (empty output, non-error exit)
- [ ] Test `--period 7d` filter: only records from last 7 days included

---

## Success Criteria

- `pacifica backtest setup --symbol ETH --direction long` prints formatted output
  with win rate, avg P&L, equity curve, and duration distribution
- `pacifica backtest setup ... --json` outputs valid JSON matching the defined schema
- `pacifica backtest pattern <id>` matches the same records that the web backtest
  panel returns for the same pattern's conditions
- `pacifica backtest pattern <id> --validate` with >= 20 matched records updates
  the pattern file with `backtest_validated: true`
- `pacifica backtest paper --replay` runs without error when paper history is non-empty
- All subcommands exit code 0 on success, non-zero on error
- Output respects `--json` flag and does not mix formatted and JSON output

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pattern condition `axis` values don't map to `market_context` keys | Medium | High | Document exact axis→key mapping; validate in `evaluateCondition`; log warning for unknown axes |
| ASCII equity curve too wide for narrow terminals | Medium | Low | Check `process.stdout.columns`; default width to `Math.min(50, columns - 15)` |
| `--validate` mutates pattern file without preview | Medium | Medium | Print a preview of what will be written and ask for confirmation via `@inquirer/prompts` |
| `paper --replay` fails when paper state file doesn't exist | High | Low | Check for file existence; show "No paper trading history found. Run `pacifica paper` first." |
| Sharpe estimate misleading with small sample sizes | High | Low | Only show Sharpe when `matched >= 10`; label it "estimate" clearly |

---

## Security Considerations

- `--validate` writes to `patterns-verified.json` — only allowed on local files
  (same location as all other intelligence store writes)
- No network calls in `backtest` command — pure local data processing
- Validate all CLI option values before use: `--leverage`, `--period`, `--funding-*`
  must be numeric; reject invalid values with a clear error message and non-zero exit
- Do not expose raw `trader_id` values in formatted output — the store already
  anonymises these as SHA-256 hashes but be mindful in output formatting

---

## Next Steps

After Phase 4 is complete, the full learning loop is closed:

1. Web simulate page → shows historical win rates (Phase 1)
2. Interactive charts show outcome distribution (Phase 2)
3. Recipe Builder exports AI agent recipes from simulation results (Phase 3)
4. CLI backtest validates patterns and feeds back into reputation scoring (Phase 4)

Future opportunities:
- `pacifica backtest pattern <id> --export-skill` → generate a SKILL.md file
  directly from the CLI (mirrors the web "Copy Recipe" feature from Phase 3)
- Scheduled backtest re-validation: cron job via `pacifica schedule` to re-run
  `backtest pattern --validate` on all verified patterns weekly
- Cross-pattern correlation: `pacifica backtest compare <id1> <id2>` to see
  whether two patterns have overlapping matched trades
