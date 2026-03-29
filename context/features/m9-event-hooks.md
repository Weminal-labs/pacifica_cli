# Feature: Event Hooks System (M9)

> **Status:** `draft`
> **Phase:** v1 — P2
> **Last updated:** 2026-03-29

---

## Summary

Composable event hooks. YAML-configured shell commands triggered by trading events. Template variables replaced at execution. Turns the CLI from a tool into infrastructure. "20 lines of YAML config, and I have Telegram notifications."

---

## Users

- **Minh:** Wants Telegram notification on fills, sound on liquidation warning.
- **Engineers in audience:** Instantly see "I could wire this into anything."

---

## User Stories

- As a **trader**, I want notifications when my orders fill so I know what happened while I was away
- As a **trader**, I want an alert sound when I'm near liquidation so I can react immediately

---

## Behaviour

### 7 Event Types
| Event | Triggers When | Template Variables |
|-------|--------------|-------------------|
| `on_fill` | Order fills | `{{market}}`, `{{side}}`, `{{size}}`, `{{price}}`, `{{pnl}}` |
| `on_liquidation_warning` | Position at 80% of liq distance | `{{market}}`, `{{distance}}`, `{{liq_price}}` |
| `on_funding` | Funding rate settlement | `{{market}}`, `{{rate}}`, `{{payment}}` |
| `on_smart_order_trigger` | Smart order fires | `{{type}}`, `{{market}}`, `{{details}}` |
| `on_large_pnl_change` | PnL moves > threshold in 5min | `{{market}}`, `{{change}}`, `{{total_pnl}}` |
| `on_position_open` | New position opened | `{{market}}`, `{{side}}`, `{{size}}`, `{{leverage}}` |
| `on_position_close` | Position closed | `{{market}}`, `{{side}}`, `{{pnl}}`, `{{duration}}` |

### Edge Cases & Rules
- Shell-escape template variables before execution
- Run hooks async — don't block trading
- Timeout hooks after 10s
- Log every hook execution to `.pacifica/hooks-log.json`

---

## Connections

- **Depends on:** All modules emit events
- **Triggered by:** M1 (fills, position changes), M2 (smart order triggers), M3 (funding events)

---

## Security Considerations

- CRITICAL: Shell-escape all template variables to prevent injection
- Timeout hung processes after 10s
- Don't expose hook stderr to user by default (may contain secrets from curl commands)

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T37 | `[>]` | Build event emitter module |
| T38 | `[>]` | Build hook executor with template replacement and shell escaping |
| T39 | `[>]` | Implement `pacifica hooks list/test/log` commands |

---

## User Acceptance Tests

**UAT Status:** `pending`

---

## Archive
