# Pacifica CLI Skills Index

This index lists all available skills and recipes for the Pacifica CLI agent framework.
Skills are single-purpose building blocks. Recipes compose multiple skills into complete
end-to-end workflows.

Load `pacifica-shared` first in any agent session. It defines the full command surface,
safety invariants, and terminology that all other skills depend on.

---

## Skills

| Skill | Directory | Description | Category | Risk Level |
|---|---|---|---|---|
| `pacifica-shared` | `skills/pacifica-shared/` | Shared context, CLI conventions, and safety rules for all skills | shared | safe |
| `pacifica-copy-top-trader` | `skills/copy-top-trader/` | Copy the #1 rep-score trader's positions in real time | copy-trading | dangerous |
| `pacifica-copy-watch-filtered` | `skills/copy-watch-filtered/` | Copy only traders with reputation score >= 80 | copy-trading | dangerous |
| `pacifica-reputation-screen` | `skills/reputation-screen/` | Screen and score traders before copying or following | copy-trading | safe |
| `pacifica-leaderboard-monitor` | `skills/leaderboard-monitor/` | Watch the leaderboard for rank changes and rising traders | copy-trading | safe |
| `pacifica-whale-follow` | `skills/whale-follow/` | Detect and follow large position changes from top-ranked traders | copy-trading | dangerous |
| `pacifica-funding-arb-single-venue` | `skills/funding-arb-single-venue/` | Run the Pacifica arb bot against extreme funding rates | funding | dangerous |
| `pacifica-funding-monitor` | `skills/funding-monitor/` | Monitor funding rates and alert when any market crosses a threshold | funding | safe |
| `pacifica-funding-collection` | `skills/funding-collection/` | Collect funding by holding the receiving side of extreme rates | funding | dangerous |
| `pacifica-pattern-confirmed-entry` | `skills/pattern-confirmed-entry/` | Enter only when the intelligence engine confirms an active pattern signal | intelligence | dangerous |
| `pacifica-emergency-flatten` | `skills/emergency-flatten/` | Close ALL positions and cancel ALL orders immediately | risk | dangerous |
| `pacifica-drawdown-circuit-breaker` | `skills/drawdown-circuit-breaker/` | Halt all trading when daily losses exceed a set percentage | risk | dangerous |
| `pacifica-dead-man-switch` | `skills/dead-man-switch/` | Cancel orders if the agent process goes silent for too long | risk | dangerous |
| `pacifica-alert-on-liquidation-risk` | `skills/alert-on-liquidation-risk/` | Alert when any position approaches its liquidation price | risk | safe |
| `pacifica-hedge-existing-position` | `skills/hedge-existing-position/` | Open an opposite leg to reduce directional exposure on a live position | risk | dangerous |
| `pacifica-risk-check-before-trade` | `skills/risk-check-before-trade/` | Full account risk assessment — leverage, margin, concentration, funding | safety | safe |
| `pacifica-snapshot-before-trade` | `skills/snapshot-before-trade/` | Capture account state before any trade | safety | safe |
| `pacifica-validate-before-live` | `skills/validate-before-live/` | Dry-run every order with --validate before submitting live | safety | safe |
| `pacifica-simulate-first` | `skills/simulate-first/` | Always simulate before trading — mandatory in every entry workflow | safety | safe |
| `pacifica-daily-pnl-report` | `skills/daily-pnl-report/` | Generate a structured daily P&L summary from the journal | reporting | safe |
| `pacifica-journal-trade` | `skills/journal-trade/` | Log every trade with context and rationale | reporting | safe |
| `pacifica-dca-into-position` | `skills/dca-into-position/` | Dollar-cost average into a position over multiple tranches | execution | dangerous |
| `pacifica-twap-order` | `skills/twap-order/` | Time-weighted average price execution for large orders | execution | dangerous |
| `pacifica-grid-bot-setup` | `skills/grid-bot-setup/` | Set up a limit order ladder for range-bound markets | execution | dangerous |
| `pacifica-onboarding-paper-mode` | `skills/onboarding-paper-mode/` | Learn the CLI safely using simulation and testnet | onboarding | safe |

---

## Recipes

Recipes compose multiple skills into complete end-to-end workflows. Always load the
recipe's required skills before executing it.

| Recipe | Directory | Description | Risk Level |
|---|---|---|---|
| `pacifica-recipe-intelligence-driven-trade` | `skills/recipe-intelligence-driven-trade/` | Full workflow: check signal → snapshot → simulate → risk check → validate → trade → journal | dangerous |
| `pacifica-recipe-copy-and-monitor` | `skills/recipe-copy-and-monitor/` | Screen trader → copy with rep filter → circuit breaker → journal | dangerous |
| `pacifica-recipe-funding-hunt` | `skills/recipe-funding-hunt/` | Scan rates → identify tier → arb or collect → monitor → exit | dangerous |
| `pacifica-recipe-daily-routine` | `skills/recipe-daily-routine/` | Morning review: positions → P&L → leaderboard → signals → journal | safe |
| `pacifica-recipe-safe-autonomous-session` | `skills/recipe-safe-autonomous-session/` | Full safety setup: liquidation alerts + circuit breaker + dead man's switch + agent start | dangerous |

---

## Risk Levels

| Level | Meaning |
|---|---|
| **safe** | Read-only or simulation only. Cannot place orders or incur financial loss. |
| **supervised** | Places orders but includes confirmation prompts or explicit user approval gates. |
| **dangerous** | Can place or cancel live orders, close positions, or start autonomous sessions without per-action confirmation. Always review before running. |

---

## Skill Dependencies

The diagram below shows which skills load which other skills:

```
pacifica-shared (required by all)
│
├── copy-top-trader
│   └── reputation-screen → pacifica-shared
│
├── copy-watch-filtered
│   └── reputation-screen → pacifica-shared
│
├── pattern-confirmed-entry
│   ├── simulate-first → pacifica-shared
│   └── snapshot-before-trade → pacifica-shared
│
├── funding-arb-single-venue → pacifica-shared
├── funding-collection
│   ├── simulate-first
│   └── snapshot-before-trade
│
├── emergency-flatten → pacifica-shared
├── drawdown-circuit-breaker
│   └── emergency-flatten
│
├── dead-man-switch
│   └── emergency-flatten
│
├── risk-check-before-trade
│   └── snapshot-before-trade
│
└── recipe-safe-autonomous-session
    ├── drawdown-circuit-breaker
    ├── dead-man-switch
    ├── alert-on-liquidation-risk
    ├── emergency-flatten
    ├── snapshot-before-trade
    ├── simulate-first
    ├── validate-before-live
    └── risk-check-before-trade
```

---

## Quick Reference: Which Skill for Which Task

| I want to... | Use this skill or recipe |
|---|---|
| Find good copy targets | `reputation-screen` |
| Copy the best trader automatically | `copy-top-trader` |
| Copy with quality filtering | `copy-watch-filtered` |
| Watch the leaderboard live | `leaderboard-monitor` |
| React to large whale moves | `whale-follow` |
| Run the funding arb bot | `funding-arb-single-venue` |
| Collect funding manually | `funding-collection` |
| Monitor funding for opportunities | `funding-monitor` |
| Enter based on intelligence signals | `pattern-confirmed-entry` |
| Do a safe practice run | `onboarding-paper-mode` |
| Close everything immediately | `emergency-flatten` |
| Stop trading after a bad day | `drawdown-circuit-breaker` |
| Protect against agent crashes | `dead-man-switch` |
| Check risk before any trade | `risk-check-before-trade` |
| Simulate a trade | `simulate-first` |
| Validate an order | `validate-before-live` |
| Build a position slowly | `dca-into-position` |
| Execute a large order with low impact | `twap-order` |
| Trade a range-bound market | `grid-bot-setup` |
| Hedge an existing position | `hedge-existing-position` |
| Get today's P&L summary | `daily-pnl-report` |
| Record a trade | `journal-trade` |
| Run a complete disciplined trade | `recipe-intelligence-driven-trade` |
| Run a complete copy session | `recipe-copy-and-monitor` |
| Hunt for funding opportunities | `recipe-funding-hunt` |
| Start the day with full context | `recipe-daily-routine` |
| Set up a safe autonomous session | `recipe-safe-autonomous-session` |
