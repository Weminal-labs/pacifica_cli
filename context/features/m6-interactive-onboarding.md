# Feature: Interactive Onboarding — `pacifica init` (M6)

> **Status:** `draft`
> **Phase:** v1 — P0 (build FIRST)
> **Last updated:** 2026-03-29

---

## Summary

First-run experience. 5-step wizard that takes a user from zero to live data in 60 seconds. If a judge can't set it up, nothing else matters. This is the first thing built.

---

## Users

- **Judges:** First thing they see. Must be smooth, fast, and impressive.
- **Minh:** One-time setup. Wants it done in under a minute.

---

## User Stories

- As a **new user**, I want a guided setup that gets me from install to live data in 60 seconds
- As a **demo judge**, I want to see a professional onboarding that proves this tool is polished

---

## Behaviour

### `pacifica init` (or `pacifica init --testnet`)

**Step 1/5: Network**
- If `--testnet` flag: skip this step, default to testnet
- Otherwise: prompt "Which network?" → Testnet (recommended) / Mainnet

**Step 2/5: API Credentials**
- Prompt for API key and secret
- Test connection immediately
- If invalid: allow retry, don't exit
- Show: "Connected! Account: 0x... Balance: $10,000 (testnet)"

**Step 3/5: Default Trading Settings**
- Default leverage (default: 5x)
- Default TP distance (default: 3%)
- Default SL distance (default: 2%)

**Step 4/5: Agent Guardrails**
- Enable AI agent trading? (default: yes)
- Daily spending limit (default: $5,000)
- Max single order size (default: $2,000)
- Require confirmation above (default: $1,000)

**Step 5/5: Verify**
- Test API connection: check mark or X
- Test WebSocket feed: show live price as proof
- Show guardrails summary
- Save config to `.pacifica.yaml`
- Print "You're ready!" with suggested next commands

### `pacifica init --reset`
- Confirm: "This will replace your current config. Continue?"
- Re-run full wizard

### Edge Cases & Rules
- If API key invalid: allow retry (don't exit wizard)
- If WebSocket fails: warn but continue (might be firewall) — "WebSocket connection failed. Live data may not work."
- Timeout after 10s if connection fails
- Show specific error: auth failed vs network error
- `--testnet` flag available on any command, not just init

---

## Connections

- **Depends on:** Core SDK client (for connection test), Core config loader
- **Triggers:** Creates `.pacifica.yaml` used by all other commands
- **Shares data with:** M5 (sets initial guardrail values)

---

## Security Considerations

- API secret input should be masked (show `****`)
- Config file should be created with restrictive permissions
- Never echo the full API secret back to the user

## Tasks

| Task # | Status | What needs to be done |
|--------|--------|-----------------------|
| T1 | `[ ]` | Project scaffolding: pnpm init, tsconfig, tsup config, commander setup, package.json bin |
| T26 | `[ ]` | Build config loader/writer (read/write .pacifica.yaml with validation) |
| T27 | `[ ]` | Implement `pacifica init` wizard with @inquirer/prompts |
| T28 | `[ ]` | Implement connection verification step (REST + WebSocket test) |

---

## User Acceptance Tests

**UAT Status:** `pending`

## Open Questions

- [ ] Where should `.pacifica.yaml` be created? Home directory (`~/.pacifica.yaml`) or cwd?
- [ ] How to get Pacifica testnet API keys? (need to document for judges)

---

## Archive
