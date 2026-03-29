# Feature: Agent Guardrails Dashboard (M5)

> **Status:** `draft`
> **Phase:** v1 — P0
> **Last updated:** 2026-03-29

---

## Summary

The trust layer. Controls what the AI agent is allowed to do, tracks what it's done, and provides a kill switch. Answers the judge's first question: "but isn't letting an AI trade your money dangerous?" This is core to the product story — ship alongside MCP server, not after.

---

## Users

- **Minh:** Wants agent to trade but needs control. Checks guardrails dashboard to see what agent did while he was away.
- **Judges:** Need to understand the trust model in the demo.

---

## User Stories

- As a **trader**, I want a kill switch that instantly stops all agent trading so I have a safety net
- As a **trader**, I want spending limits on the agent so it can't blow up my account
- As a **trader**, I want an audit trail of every agent action so I know exactly what happened
- As an **AI agent**, I want to know what I'm allowed to do so I can operate within bounds

---

## Behaviour

### `pacifica agent status`
Dashboard showing: enabled/disabled, permissions, spending limits, daily usage, recent actions.

### `pacifica agent stop`
Kill switch. Immediately sets `agent.enabled: false`. All MCP write tools return "agent disabled". No confirmation prompt. Idempotent.

### `pacifica agent start`
Re-enable agent trading. Requires confirmation: "Are you sure you want to re-enable agent trading?"

### `pacifica agent config`
Interactive editor for limits: daily spend, max order size, max leverage, allowed/blocked actions, confirmation threshold.

### `pacifica agent log`
Full audit trail. Filterable: `--today`, `--market ETH-PERP`, `--action place_order`.

### Guardrail Enforcement (Core Logic)
Before every MCP write operation:
1. Is agent enabled? If no → reject with "Agent trading is disabled. Run `pacifica agent start` to re-enable."
2. Is this action in allowed_actions and not in blocked_actions? If no → reject with specific reason
3. Does this order exceed max_order_size? If yes → reject with "Order size $X exceeds limit of $Y"
4. Would this push daily spend over daily_spending_limit? If yes → reject with "Daily limit reached. Remaining: $Z"
5. Is order above require_confirmation_above? If yes → require human confirmation (how this works in MCP context TBD)

### Edge Cases & Rules
- Reset daily usage at midnight (local time). Persist across CLI restarts.
- If limit exceeded, return clear error with remaining budget — never silently fail
- Kill switch must be instant — no async operations, no confirmation
- Agent status MCP tool always works (read-only, no guardrails needed)

---

## Connections

- **Depends on:** Core config loader
- **Triggers:** All MCP write tools check guardrails before execution
- **Shares data with:** M8 (journal shares some agent action data), M6 (init sets initial guardrail values)

---

## MVP vs Full Version

| Aspect | MVP (v1) | Full Version |
|--------|----------|--------------|
| Limits | Daily spend, max order, max leverage | Per-market limits, time-based limits |
| Confirmation | Threshold-based | Interactive confirmation in terminal |
| Dashboard | Basic text output | Rich Ink dashboard with charts |
| Notifications | None | Alert when approaching limits |

---

## Security Considerations

- Guardrail enforcement MUST happen in core/, not at the MCP or CLI layer
- Kill switch file write must be atomic — no partial state
- Agent log is append-only — never allow deletion
- Spending tracker must be accurate — test edge cases (partial fills, cancelled orders)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T9 | `[ ]` | Build guardrail checker module (enabled, action list, spending limit, order size) |
| T10 | `[ ]` | Build daily spending tracker with midnight reset |
| T11 | `[ ]` | Build agent action logger (append to agent-log.json) |
| T12 | `[ ]` | Implement `pacifica agent status/stop/start/config/log` commands |

---

## User Acceptance Tests

**UAT Status:** `pending`

## Open Questions

- [ ] How should "require_confirmation_above" work for MCP-triggered orders? Agent can't prompt in terminal.

---

## Archive
