# Research: Backtest UX Patterns & AI Agent Learning Loops

> Researcher-01 · 2026-04-15 · ≤150 lines

---

## Topic A: Backtesting UX in Trading Platforms

### What separates a useful backtest from a calculator

A calculator replays a single strategy against history and returns P&L.
A useful backtest answers: *under what conditions does this strategy break down?*

The gap is context-awareness. Good backtests are not entry→exit simulators.
They are condition→outcome explorers. The unit of value is the *slice of history
that looks like today*, not the aggregate curve.

---

### Data requirements

| Data layer | Why it matters |
|---|---|
| OHLCV (1m minimum) | Entry/exit fill accuracy; slippage modeling |
| Funding rate history (8h snapshots) | Perp strategies accumulate funding drag silently — it can erase a winning setup |
| Open interest deltas | Position crowding context — identical conditions with different OI have different outcomes |
| Liquidation event stream | Wicks caused by liquidation cascades behave differently from organic price moves |
| Mark price vs index | For perp backtest, fill at mark not mid-book or trades will overfit on ghost candles |

For perpetual futures specifically, omitting funding history and OI gives dangerously
misleading results. A 65% win rate strategy at neutral funding may be a 40% win
rate strategy when funding is persistently negative.

---

### UX patterns from platforms

**TradingView Strategy Tester**
- Summary tab: net profit, max drawdown, win rate, profit factor, avg trade
- List of trades: entry/exit, size, P&L per trade — scannable
- Weakness: no condition-level breakdown. You see aggregate stats, not which setups worked

**Hyperliquid (no native backtest, but pattern worth noting)**
- Users manually reconstruct via portfolio history + funding rate CSV export
- Gap the market is clearly aware of: high demand for "what would this have done"

**dYdX / GMX**
- Neither has native backtest UX — both offload to community tooling (e.g. Dune dashboards)
- Pattern: on-chain protocols lean on analytics layers rather than building in-house

**QuantConnect / Jesse / Backtrader (off-chain frameworks)**
- Strategy results exposed as structured objects or JSON — designed for programmatic consumption
- Jesse: `Result` dict with `total_trades`, `win_rate`, `max_drawdown`, `sharpe_ratio`,
  `calmar_ratio`, per-trade log, equity curve as array
- QuantConnect: `Statistics` dict + full order log + benchmark comparison
- Backtrader: `Analyzer` plugin pattern — attach analyzers to strategy, serialize on completion
- Key pattern: **results are first-class data objects, not just rendered HTML**

---

### Visualizations that make outcomes actionable

| Visualization | What it answers |
|---|---|
| Equity curve (cumulative P&L over time) | Is the strategy improving, degrading, or regime-dependent? |
| Drawdown chart (depth + duration) | Can you psychologically hold this? What's max pain? |
| Win/loss scatter (entry time vs P&L) | Are wins clustered in certain hours/sessions? Do losses cluster too? |
| Heatmap by time-of-day / day-of-week | When does the strategy work? Asia session vs US session often diverge |
| Condition breakdown table | Which condition sets had highest win rate — this is the bridge to pattern detection |
| Funding drag overlay on equity curve | Shows exactly where funding ate the edge |

The most actionable single visualization is the **condition breakdown table** — it
answers "which of my setups actually worked" rather than averaging across everything.

---

### Metrics that matter most

1. **Max drawdown** — position-sizing and survival question, not just aesthetics
2. **Sharpe ratio** — return per unit risk; needs funding-adjusted returns for perps
3. **Win rate + average R:R** — always view together; 35% win rate with 3:1 R:R beats 65% with 0.8:1
4. **Funding drag (total)** — for perpetual strategies, often the silent killer
5. **Profit factor** (gross profit / gross loss) — single number that survives sample-size variance better than win rate alone
6. **Average trade duration** — distinguishes scalp strategies from swing; relevant for funding accumulation

---

### Paper trading + backtest connection

The pattern used in Jesse and QuantConnect: a paper trade is executed against a
simulated order book using historical OHLCV — same code path as a live trade,
just with a mock exchange adapter. This means a paper trade *is* a backtest slice
with one entry.

"Replay against history" pattern: capture the market state snapshot at paper entry,
then run forward through historical data to find the equivalent bar, and simulate
the outcome. This is exactly the IntelligenceRecord model in M11 — the `market_context`
snapshot at entry is the replay anchor.

---

## Topic B: AI Agent Learning Loops in Trading

### How agents improve from simulations

An agent does not improve from raw P&L. It improves from *labeled condition→outcome pairs*.
The data format needed is: `{conditions_at_entry, action_taken, outcome}` — structured
so the agent (or a fine-tuned model) can find correlations.

For LLM-based agents specifically, the learning loop is not gradient descent.
It is **in-context pattern retrieval**: the agent is shown its own historical
records and asked "given that similar conditions produced X outcome Y% of the
time, what should you do now?"

This is the core insight behind M11's pattern engine — it builds the lookup table
that makes in-context learning possible.

---

### Recipe tracing

Recipe tracing is the practice of logging not just the outcome of a trade,
but the full chain of conditions that led to the decision:

```
{
  "recipe_id": "r_01j...",
  "conditions": {
    "funding_rate": -0.0004,
    "oi_change_4h_pct": 12.3,
    "momentum_signal": "bullish",
    "buy_pressure": 0.71
  },
  "action": { "direction": "long", "size_usd": 500, "leverage": 5 },
  "outcome": { "pnl_pct": 8.3, "duration_minutes": 94, "profitable": true }
}
```

The agent can then query: *"how often did this condition_set produce a profitable outcome?"*
That query IS the intelligence layer. The pattern engine in M11 performs exactly
this aggregation — grouping `IntelligenceRecord` objects by `pattern_tags` and
computing `win_rate` per cluster.

---

### condition_set → outcome → reinforcement: data model

Minimum viable shape:

```typescript
interface TraceRecord {
  id: string
  timestamp: string
  condition_set: Record<string, number | string>  // axis → value
  action: { direction: "long" | "short"; size_usd: number }
  outcome: {
    pnl_pct: number
    profitable: boolean
    duration_minutes: number
  } | null  // null until position closes
  tags: string[]  // human-readable condition cluster labels
}
```

Reinforcement for an LLM agent means: at inference time, retrieve all `TraceRecord`
objects with `tags` matching current conditions, compute the win rate, inject that
as context into the prompt. The agent then has calibrated priors, not just vibes.

---

### Minimum viable feedback loop for an LLM-based trading agent

Four components, in order:

1. **Capture** — at trade entry, snapshot market state into a `TraceRecord`
2. **Resolve** — when position closes, attach outcome to the record
3. **Aggregate** — group records by condition tags, compute win_rate per group
4. **Inject** — at next decision point, retrieve matching historical aggregates and
   prepend to the agent prompt: *"In 47 historical trades matching these conditions,
   win rate was 72%. Average P&L was +6.8%."*

No fine-tuning required. No RL loop required. The feedback loop is:
*trade → record → aggregate → context injection → better decision*.

This is exactly the loop M11 implements via `pacifica_intelligence_patterns()`.

---

### How external frameworks expose simulation results

**QuantConnect**
- `algorithm.Statistics` dict after backtest — accessible via REST API
- Full `OrderEvent` list serializable to JSON
- Integration pattern: backtest → download result JSON → feed to external LLM

**Jesse**
- `--csv` flag exports full trade log; `result` object in Python callback
- Designed for programmatic downstream processing

**Backtrader**
- `Analyzer` objects attached to strategy; call `analyzer.get_analysis()` → OrderedDict
- Common pattern: custom analyzer that writes to JSON file on `stop()`

Common thread: all three expose results as **flat structured records** (not charts).
The chart is a rendering of the data. The data is what an agent can consume.
The M11 `IntelligenceRecord` + `DetectedPattern` schema follows this same principle.

---

## Key Synthesis for Pacifica Simulate/Backtest Feature

1. The `MarketContext` snapshot already captured in M11 is the correct anchor for backtest replay
2. Funding rate history must be included in backtest data — without it, perp results are misleading
3. The condition breakdown table (which condition sets won) is the highest-value output
4. The recipe tracing pattern maps directly to `IntelligenceRecord.pattern_tags` + `TradeOutcome`
5. Minimum viable agent learning loop needs 4 steps: capture → resolve → aggregate → inject
6. Equity curve + drawdown chart + condition heatmap are the three visualizations that
   turn historical data into forward-looking decisions
