# Environment Variables

> This project uses `.pacifica.yaml` for config instead of `.env` files.
> The YAML config lives in the user's home directory or current working directory.
> Never commit real API keys. This file documents what config values are needed and why.

## Config File: `.pacifica.yaml`

### Required

| Key | Description | Set During |
|-----|-------------|-----------|
| `network` | `testnet` or `mainnet` | `pacifica init` |
| `api_key` | Pacifica API key | `pacifica init` |
| `api_secret` | Pacifica API secret | `pacifica init` |

### Trading Defaults (Optional)

| Key | Description | Default |
|-----|-------------|---------|
| `defaults.leverage` | Default leverage for new orders | `5` |
| `defaults.tp_distance` | Default take-profit distance (%) | `3` |
| `defaults.sl_distance` | Default stop-loss distance (%) | `2` |

### Agent Guardrails (Optional)

| Key | Description | Default |
|-----|-------------|---------|
| `agent.enabled` | Whether agent trading is active | `true` |
| `agent.daily_spending_limit` | Max daily agent spend ($) | `5000` |
| `agent.max_order_size` | Max single order size ($) | `2000` |
| `agent.max_leverage` | Max leverage agent can use | `5` |
| `agent.allowed_actions` | Whitelist of permitted MCP write actions | `[place_order, close_position, modify_order, set_trailing_stop, set_partial_tp]` |
| `agent.blocked_actions` | Actions never allowed | `[withdraw, change_leverage]` |
| `agent.require_confirmation_above` | Human confirmation threshold ($) | `1000` |

### Event Hooks (Optional)

| Key | Description | Default |
|-----|-------------|---------|
| `hooks.on_fill` | Shell commands to run on order fill | `[]` |
| `hooks.on_liquidation_warning` | Shell commands on liq warning | `[]` |
| `hooks.on_funding` | Shell commands on funding settlement | `[]` |
| `hooks.on_smart_order_trigger` | Shell commands on smart order fire | `[]` |
| `hooks.on_large_pnl_change` | Shell commands on big PnL move | `[]` |
| `hooks.on_position_open` | Shell commands on position open | `[]` |
| `hooks.on_position_close` | Shell commands on position close | `[]` |

## API Endpoints

| Service | Testnet URL | Mainnet URL |
|---------|-------------|-------------|
| Pacifica REST | TBD (need API docs) | TBD |
| Pacifica WebSocket | TBD (need API docs) | TBD |
| Binance Public | `https://fapi.binance.com` | Same (public) |
| Bybit Public | `https://api.bybit.com` | Same (public) |

## Local Data Files

All stored in `.pacifica/` directory (created automatically):

| File | Purpose |
|------|---------|
| `.pacifica/journal.json` | Trade journal — append-only |
| `.pacifica/agent-log.json` | Agent action audit trail — append-only |
| `.pacifica/smart-orders.json` | Active smart order state |
| `.pacifica/hooks-log.json` | Hook execution log — append-only |
| `.pacifica/webhook-log.json` | Webhook execution log — append-only |
| `.pacifica/agent-daily.json` | Agent daily spending tracker (resets at midnight) |

## Setup Instructions

1. Run `pacifica init --testnet`
2. Enter Pacifica testnet API key and secret (get from Pacifica testnet dashboard)
3. Set trading defaults and agent guardrails
4. Wizard verifies connection automatically
