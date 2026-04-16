# Pacifica CLI Skills Index

Lean skill set aligned with the v2 thesis: **CLI + MCP + pattern primitive.** Each skill is a small composable capability. `pacifica-shared` is always loaded first.

---

## Skills

| Skill | Directory | Description | Risk |
|---|---|---|---|
| `pacifica-shared` | `skills/pacifica-shared/` | CLI + MCP surface, pattern artifact format, safety invariants | safe |
| `pacifica-author-pattern` | `skills/author-pattern/` | Encode a trader's verbal setup as a YAML pattern in `~/.pacifica/patterns/` | safe |
| `pacifica-pattern-confirmed-entry` | `skills/pattern-confirmed-entry/` | Enter a trade only when a user-authored pattern matches live state | dangerous |
| `pacifica-funding-arb-single-venue` | `skills/funding-arb-single-venue/` | Open a single-venue funding-carry position via a pattern | dangerous |
| `pacifica-risk-check-before-trade` | `skills/risk-check-before-trade/` | Account risk assessment — leverage, margin, concentration | safe |
| `pacifica-validate-before-live` | `skills/validate-before-live/` | Dry-run every order with `--validate` before submitting | safe |
| `pacifica-journal-trade` | `skills/journal-trade/` | Log every trade with context and rationale to the journal | safe |

---

## Workflows

Compose skills to get end-to-end flows. There are no top-level "recipe" files in v2 — Claude composes skills on demand from the trader's request.

**Canonical entry flow** (the core thesis demo):

```
author-pattern      → write it once
pattern-confirmed-entry → run it every time you want to execute
  ├─ risk-check-before-trade
  ├─ validate-before-live
  └─ journal-trade
```

---

## Risk Levels

| Level | Meaning |
|---|---|
| **safe** | Read-only or simulation. Cannot cause financial loss. |
| **dangerous** | Places or cancels live orders. Always review before running. |

---

## What's Gone (and Why)

Removed in v2 "lean-to-thesis" refactor (2026-04-15):

- **Copy-trading skills** (copy-top-trader, copy-watch-filtered, reputation-screen, leaderboard-monitor, whale-follow) — different product; intelligence signals are now user-authored patterns, not third-party reputation.
- **Autonomous safety scaffolding** (dead-man-switch, drawdown-circuit-breaker, emergency-flatten, alert-on-liquidation-risk) — the MCP guardrail layer covers this without needing separate skills.
- **Execution strategies** (dca-into-position, twap-order, grid-bot-setup) — should be expressed as patterns, not skills.
- **Recipes** — superseded by Claude composing primitives on demand.

If a trader needs one of these, the answer is usually "encode it as a pattern."
