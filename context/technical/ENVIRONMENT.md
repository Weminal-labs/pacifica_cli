# Environment Variables

> This project uses `.pacifica.yaml` for config instead of `.env` files.
> The YAML config lives in the user's home directory or current working directory.
> Never commit real API keys. This file documents what config values are needed and why.

## Config File: `.pacifica.yaml`

### Required

| Key | Description | Set During |
|-----|-------------|-----------|
| `network` | `testnet` or `mainnet` | `pacifica init` |
| `private_key` | Base58-encoded Ed25519 secret key (Solana wallet) | `pacifica init` |

### Trading Defaults (Optional)

| Key | Description | Default |
|-----|-------------|---------|
| `defaults.leverage` | Default leverage for new orders | `5` |
| `defaults.tp_distance` | Default take-profit distance (%) | `3` |
| `defaults.sl_distance` | Default stop-loss distance (%) | `2` |
| `defaults.slippage` | Default slippage tolerance (%) | `0.5` |

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
| Pacifica REST | `https://test-api.pacifica.fi/api/v1` | `https://api.pacifica.fi/api/v1` |
| Pacifica WebSocket | `wss://test-ws.pacifica.fi/ws` | `wss://ws.pacifica.fi/ws` |

## Authentication

Pacifica uses **Solana Ed25519 wallet signatures**, not HMAC API keys.

- The `private_key` in config is a Base58-encoded Ed25519 secret key
- Request signing: recursively sort keys, compact JSON serialize, sign with Ed25519, Base58-encode signature
- Libraries used: `tweetnacl` for signing, `bs58` for Base58 encoding/decoding
- No API key management needed — just a wallet keypair

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

### Prerequisites — Activate wallet on Pacifica web app

Before using the CLI, you must activate your wallet on the Pacifica web app:

1. Go to [test-app.pacifica.fi](https://test-app.pacifica.fi) (testnet) or [app.pacifica.fi](https://app.pacifica.fi) (mainnet)
2. Connect your Solana wallet (e.g. Phantom)
3. Enter access code **`Pacifica`** when prompted
4. Use the [Faucet](https://test-app.pacifica.fi/faucet) to mint test USDP (testnet only)

Without this step, all trading API calls will fail with: `"Beta access required. Signer must redeem a valid beta code."`

### CLI setup

1. Run `pacifica init --testnet`
2. Enter Base58-encoded Ed25519 private key (same wallet activated above)
3. Set trading defaults and agent guardrails
4. Wizard verifies connection automatically
