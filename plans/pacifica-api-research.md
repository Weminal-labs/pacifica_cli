# Pacifica DEX API Research Report

## Executive Summary

Pacifica is a perpetual futures DEX on Solana. Authentication uses Ed25519 wallet signatures (not traditional API keys/HMAC). The API offers complete REST and WebSocket interfaces for market data, trading, and account management.

---

## 1. Base URLs

| Environment | REST API | WebSocket |
|-------------|----------|-----------|
| **Mainnet** | `https://api.pacifica.fi/api/v1` | `wss://ws.pacifica.fi/ws` |
| **Testnet** | `https://test-api.pacifica.fi/api/v1` | `wss://test-ws.pacifica.fi/ws` |

- All requests and responses use JSON
- Content-Type header: `application/json`

---

## 2. Authentication & Signing

### Overview
- **POST requests** require Ed25519 signatures
- **GET requests and WebSocket subscriptions** do NOT require signatures
- No traditional API keys or HMAC - uses Solana wallet keypair signing
- Library: `solders` (Python) for Ed25519, `base58` for encoding

### Dependencies (Python SDK reference)
```
requests>=2.31.0
solders>=0.19.0
websockets>=10.4
base58>=2.1.1
```

### Signing Process (Step by Step)

**Step 1: Create signature header**
```json
{
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "type": "create_order"
}
```

**Step 2: Create signature payload** (the operation-specific data)
```json
{
  "symbol": "BTC",
  "price": "100000",
  "amount": "0.1",
  "side": "bid",
  "tif": "GTC",
  "reduce_only": false,
  "client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Step 3: Merge header + payload under "data" key**
```json
{
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "type": "create_order",
  "data": {
    "symbol": "BTC",
    "price": "100000",
    "amount": "0.1",
    "side": "bid",
    "tif": "GTC",
    "reduce_only": false,
    "client_order_id": "..."
  }
}
```

**Step 4: Recursively sort ALL keys alphabetically** (at every nesting level)

**Step 5: Serialize to compact JSON** (no whitespace, separators=(",", ":"))

**Step 6: Convert to UTF-8 bytes, sign with Ed25519 keypair**

**Step 7: Encode signature as Base58 string**

**Step 8: Build final request** (merge header fields + payload at top level, no "data" wrapper)
```json
{
  "account": "<wallet_public_key>",
  "signature": "<base58_signature>",
  "timestamp": 1716200000000,
  "expiry_window": 5000,
  "symbol": "BTC",
  "price": "100000",
  "amount": "0.1",
  "side": "bid",
  "tif": "GTC",
  "reduce_only": false,
  "client_order_id": "..."
}
```

### Operation Types (for signing "type" field)
| Operation Type | Used For |
|---------------|----------|
| `create_order` | Limit orders |
| `create_market_order` | Market orders |
| `create_stop_order` | Stop orders |
| `cancel_order` | Cancel single order |
| `cancel_all_orders` | Cancel all orders |
| `cancel_stop_order` | Cancel stop order |
| `edit_order` | Edit existing order |
| `update_leverage` | Change leverage |
| `update_margin_mode` | Change margin mode |
| `set_position_tpsl` | Set position TP/SL |
| `withdraw` | Request withdrawal |
| `subaccount_initiate` | Create subaccount (main sig) |
| `subaccount_confirm` | Create subaccount (sub sig) |
| `subaccount_transfer` | Transfer between subaccounts |
| `create_api_key` | Create agent wallet |
| `revoke_api_key` | Revoke agent wallet |
| `list_api_keys` | List agent wallets |
| `bind_agent_wallet` | Bind agent wallet |

NOTE: Batch order endpoint does NOT have its own operation type - each action in batch is individually signed with its own type.

### API Agent Keys (Agent Wallets)
- Generated at `app.pacifica.fi/apikey` or programmatically via SDK
- Allow a separate keypair to sign on behalf of the main account
- Usage: sign with agent private key, include `agent_wallet: <agent_public_key>` in request, keep `account` as the main wallet address
- Equivalent to traditional exchange API keys

### Signing Errors
| Error | Cause |
|-------|-------|
| "Invalid signature" | Malformed base58 or failed Ed25519 validation |
| "Invalid message" | Expired timestamp, invalid JSON, bad format |
| "Invalid public key" | Account address not valid Ed25519 public key |
| "Verification failed" | Wrong private key, message altered after signing |

---

## 3. REST API Endpoints

### 3.1 Markets (Public, No Auth)

#### GET /api/v1/info
Get all market specifications.
- **Params:** None
- **Response fields:** `symbol`, `tick_size`, `min_tick`, `max_tick`, `lot_size`, `max_leverage`, `isolated_only`, `min_order_size`, `max_order_size`, `funding_rate`, `next_funding_rate`, `created_at`

#### GET /api/v1/info/prices
Get prices for all symbols.
- **Params:** None
- **Response fields:** `symbol`, `funding`, `mark`, `mid`, `next_funding`, `open_interest`, `oracle`, `timestamp`, `volume_24h`, `yesterday_price`

#### GET /api/v1/kline
Get historical candles.
- **Params:** `symbol` (required), `interval` (required: 1m/3m/5m/15m/30m/1h/2h/4h/8h/12h/1d), `start_time` (required, ms), `end_time` (optional, ms)
- **Response fields:** `t` (start), `T` (end), `s` (symbol), `i` (interval), `o`, `c`, `h`, `l` (OHLC strings), `v` (volume), `n` (trade count)

#### GET /api/v1/kline/mark
Get mark price candles.
- **Params:** Same as /kline
- **Response:** Same format as /kline

#### GET /api/v1/book
Get orderbook.
- **Params:** `symbol` (required), `agg_level` (optional, default 1)
- **Response:** `s` (symbol), `l` (array: [bids[], asks[]] up to 10 levels), `t` (timestamp)
- Each level: `p` (price), `a` (amount), `n` (order count)

#### GET /api/v1/trades
Get recent trades.
- **Params:** `symbol` (required)
- **Response fields:** `event_type` (fulfill_taker/fulfill_maker), `price`, `amount`, `side` (open_long/open_short/close_long/close_short), `cause` (normal/market_liquidation/backstop_liquidation/settlement), `created_at`, `last_order_id`

#### GET /api/v1/funding_rate/history
Get historical funding rates.
- **Params:** `symbol` (required), `limit` (optional, default 100, max 4000), `cursor` (optional)
- **Response fields:** `oracle_price`, `bid_impact_price`, `ask_impact_price`, `funding_rate`, `next_funding_rate`, `created_at`
- **Pagination:** `next_cursor`, `has_more`

### 3.2 Account (Auth required for POST, account param for GET)

#### GET /api/v1/account
Get account info.
- **Params:** `account` (required)
- **Response fields:** `balance`, `fee_level`, `maker_fee`, `taker_fee`, `account_equity`, `available_to_spend`, `available_to_withdraw`, `pending_balance`, `total_margin_used`, `cross_mmr`, `positions_count`, `orders_count`, `stop_orders_count`, `updated_at`, `use_ltp_for_stop_orders`

#### GET /api/v1/account/settings
Get account margin/leverage settings.
- **Params:** `account` (required)
- **Response:** `margin_settings` array with `symbol`, `isolated`, `leverage`, `created_at`, `updated_at`
- NOTE: Default settings (cross, max leverage) return blank

#### POST /api/v1/account/leverage
Update leverage for a symbol.
- **Signed:** type = `update_leverage`
- **Body:** `account`, `signature`, `timestamp`, `symbol`, `leverage` (integer), `expiry_window`?, `agent_wallet`?
- **Response:** `{"success": true}`
- NOTE: Can only increase leverage for open positions

#### POST /api/v1/account/margin
Update margin mode.
- **Signed:** type = `update_margin_mode`
- **Body:** `account`, `signature`, `timestamp`, `symbol`, `is_isolated` (boolean), `expiry_window`?, `agent_wallet`?
- **Response:** `{"success": true}`
- NOTE: Cannot change margin mode with open positions

#### GET /api/v1/positions
Get current positions.
- **Params:** `account` (required)
- **Response fields:** `symbol`, `side` (long/short), `amount`, `entry_price`, `margin`, `funding`, `isolated`, `created_at`, `updated_at`
- Also returns `last_order_id` (exchange-wide nonce)

#### GET /api/v1/trades/history
Get trade history.
- **Params:** `account` (required), `symbol`?, `start_time`?, `end_time`?, `limit`? (default 100), `cursor`?
- **Response fields:** `history_id`, `order_id`, `client_order_id`, `symbol`, `amount`, `price`, `entry_price`, `fee`, `pnl`, `event_type`, `side`, `created_at`, `cause`
- **Pagination:** `next_cursor`, `has_more`

#### GET /api/v1/funding/history
Get funding payment history.
- **Params:** `account` (required), `limit`?, `cursor`?
- **Response fields:** `history_id`, `symbol`, `side`, `amount`, `payout`, `rate`, `created_at`
- **Pagination:** `next_cursor`, `has_more`

#### GET /api/v1/portfolio
Get account equity/PnL history.
- **Params:** `account` (required), `time_range` (required: 1d/7d/14d/30d/all), `start_time`?, `end_time`?, `limit`? (default 100)
- **Response fields:** `account_equity`, `pnl`, `timestamp`

#### GET /api/v1/account/balance/history
Get balance change history.
- **Params:** `account` (required), `limit`?, `cursor`?
- **Response fields:** `amount`, `balance`, `pending_balance`, `event_type`, `created_at`
- **Event types:** deposit, deposit_release, withdraw, trade, market_liquidation, backstop_liquidation, adl_liquidation, subaccount_transfer, funding, payout
- **Pagination:** `next_cursor`, `has_more`

#### POST /api/v1/account/withdraw
Request withdrawal.
- **Signed:** type = `withdraw`
- **Body:** `account`, `signature`, `timestamp`, `amount` (USDC string), `agent_wallet`?, `expiry_window`?
- **Response:** `{"success": true}`

### 3.3 Orders (All POST endpoints require signing)

#### POST /api/v1/orders/create_market
Create market order.
- **Signed:** type = `create_market_order`
- **Body:**
  - Required: `account`, `signature`, `timestamp`, `symbol`, `amount`, `side` ("bid"/"ask"), `slippage_percent`, `reduce_only`
  - Optional: `client_order_id` (UUID), `take_profit` {stop_price, limit_price?, client_order_id?}, `stop_loss` {stop_price, limit_price?, client_order_id?}, `agent_wallet`, `expiry_window`
- **Response:** `{"order_id": 12345}`
- NOTE: ~200ms delay on market orders

#### POST /api/v1/orders/create
Create limit order.
- **Signed:** type = `create_order`
- **Body:**
  - Required: `account`, `signature`, `timestamp`, `symbol`, `price`, `amount`, `side` ("bid"/"ask"), `tif` ("GTC"/"IOC"/"ALO"/"TOB"), `reduce_only`
  - Optional: `client_order_id` (UUID), `take_profit`, `stop_loss`, `agent_wallet`, `expiry_window`
- **Response:** `{"order_id": 12345}`
- **TIF values:** GTC = Good Till Cancel, IOC = Immediate Or Cancel, ALO = Add Liquidity Only (Post Only), TOB = Top of Book
- NOTE: GTC and IOC orders subject to ~200ms delay

#### POST /api/v1/orders/stop/create
Create stop order.
- **Signed:** type = `create_stop_order`
- **Body:**
  - Required: `account`, `signature`, `timestamp`, `symbol`, `side` ("bid"/"ask"), `reduce_only`, `stop_order` object
  - `stop_order`: `stop_price` (required), `amount` (required), `limit_price`?, `client_order_id`?
  - Optional: `agent_wallet`, `expiry_window`
- **Response:** `{"order_id": 12345}`

#### POST /api/v1/positions/tpsl
Set position TP/SL.
- **Signed:** type = `set_position_tpsl`
- **Body:**
  - Required: `account`, `signature`, `timestamp`, `symbol`, `side` ("bid"/"ask")
  - At least one required: `take_profit` {stop_price, limit_price?, client_order_id?}, `stop_loss` {stop_price, limit_price?, client_order_id?}
  - Optional: `agent_wallet`, `expiry_window`
- **Response:** `{"success": true}`

#### POST /api/v1/orders/cancel
Cancel single order.
- **Signed:** type = `cancel_order`
- **Body:** `account`, `signature`, `timestamp`, `symbol`, either `order_id` (int) or `client_order_id` (UUID), `agent_wallet`?, `expiry_window`?
- **Response:** `{"success": true}`
- NOTE: Cancels bypass speed bump

#### POST /api/v1/orders/cancel_all
Cancel all orders.
- **Signed:** type = `cancel_all_orders`
- **Body:** `account`, `signature`, `timestamp`, `all_symbols` (boolean), `exclude_reduce_only` (boolean), `symbol`? (required if all_symbols=false), `agent_wallet`?, `expiry_window`?
- **Response:** `{"cancelled_count": 5}`

#### POST /api/v1/orders/stop/cancel
Cancel stop order.
- **Signed:** type = `cancel_stop_order`
- **Body:** `account`, `signature`, `timestamp`, `symbol`, either `order_id` or `client_order_id`, `agent_wallet`?, `expiry_window`?
- **Response:** `{"success": true}`

#### POST /api/v1/orders/edit
Edit existing order (cancel + replace).
- **Signed:** type = `edit_order`
- **Body:** `account`, `signature`, `timestamp`, `symbol`, `price`, `amount`, either `order_id` or `client_order_id`, `agent_wallet`?, `expiry_window`?
- **Response:** `{"order_id": 123498765}` (new order ID)
- NOTE: Creates new order with TIF=ALO, maintains original side/reduce_only/client_order_id. Not subject to speed bump.

#### POST /api/v1/orders/batch
Batch operations (up to 10 actions).
- **Body:** `actions` array, each with `type` ("Create"/"Cancel") and `data` (individually signed payload)
- **Response:** `results` array with `success`, `order_id`, `error` per action
- NOTE: Each action individually signed. Max 10 actions. Executed in order. Failed actions don't block subsequent ones.
- Speed bump applies to batches containing market/GTC/IOC orders

#### GET /api/v1/orders
Get open orders.
- **Params:** `account` (required)
- **Response fields:** `order_id`, `client_order_id`, `symbol`, `side`, `price`, `initial_amount`, `filled_amount`, `cancelled_amount`, `stop_price`, `order_type`, `stop_parent_order_id`, `reduce_only`, `created_at`, `updated_at`
- Also returns `last_order_id`

#### GET /api/v1/orders/history
Get order history.
- **Params:** `account` (required), `limit`? (default 100), `cursor`?
- **Response fields:** `order_id`, `client_order_id`, `symbol`, `side`, `initial_price`, `average_filled_price`, `amount`, `filled_amount`, `order_status`, `order_type`, `stop_price`, `stop_parent_order_id`, `reduce_only`, `reason`, `created_at`, `updated_at`
- **Order statuses:** open, partially_filled, filled, cancelled, rejected
- **Pagination:** `next_cursor`, `has_more`

#### GET /api/v1/orders/history_by_id
Get detailed order history by ID.
- **Params:** `order_id` (required, integer)
- **Response fields:** `history_id`, `order_id`, `client_order_id`, `symbol`, `side`, `price`, `initial_amount`, `filled_amount`, `cancelled_amount`, `event_type`, `order_type`, `order_status`, `stop_price`, `stop_parent_order_id`, `reduce_only`, `created_at`
- **Event types:** make, stop_created, twap_created, fulfill_market, fulfill_limit, adjust, stop_parent_order_filled, stop_triggered, stop_upgrade, twap_triggered, cancel, force_cancel, expired, post_only_rejected, self_trade_prevented

### 3.4 Subaccounts

#### POST /api/v1/account/subaccount/create
- **Body:** `main_account`, `subaccount`, `timestamp`, `main_signature`, `sub_signature`, `expiry_window`?
- Both main and sub accounts must sign

#### POST /api/v1/account/subaccount/list
- **Signed Body:** `account`, `signature`, `timestamp`, `expiry_window`?
- **Response:** Array of subaccounts with `address`, `balance`, `pending_balance`, `fee_level`, `fee_mode`, `use_ltp_for_stop_orders`, `created_at`

#### POST /api/v1/account/subaccount/transfer
- **Signed Body:** `account`, `signature`, `timestamp`, `to_account`, `amount` (USDC string), `expiry_window`?

---

## 4. WebSocket API

### Connection
- Mainnet: `wss://ws.pacifica.fi/ws`
- Testnet: `wss://test-ws.pacifica.fi/ws`
- Auto-close if no message for 60 seconds
- Auto-close after 24 hours
- Send `{"method": "ping"}` for heartbeat, receive `{"channel": "pong"}`
- Max 300 connections per IP
- Max 20 subscriptions per channel per connection

### Subscribe/Unsubscribe Format
```json
{"method": "subscribe", "params": { ... }}
{"method": "unsubscribe", "params": { ... }}
```

### 4.1 Public Subscription Channels

#### prices
```json
{"method": "subscribe", "params": {"source": "prices"}}
```
Data: array of `{symbol, funding, mark, mid, next_funding, open_interest, oracle, timestamp, volume_24h, yesterday_price}`

#### book
```json
{"method": "subscribe", "params": {"source": "book", "symbol": "SOL", "agg_level": 1}}
```
- `agg_level`: 1, 10, 100, 1000, or 10000
- Data: `{s, l: [[bids], [asks]], t, li}`
- Each level: `{p, a, n}`
- Updates every 250ms

#### trades
```json
{"method": "subscribe", "params": {"source": "trades", "symbol": "SOL"}}
```
Data: `{h, s, a, p, d (side), tc (cause), t, li}`

#### candle
```json
{"method": "subscribe", "params": {"source": "candle", "symbol": "SOL", "interval": "1m"}}
```
Data: `{t, T, s, i, o, c, h, l, v, n}`

#### mark_price_candle
```json
{"method": "subscribe", "params": {"source": "mark_price_candle", "symbol": "BTC", "interval": "1m"}}
```
Data: Same format as candle (v is always "0")

### 4.2 Account Subscription Channels (No signing required, just account address)

#### account_info
```json
{"method": "subscribe", "params": {"source": "account_info", "account": "42trU9A5..."}}
```
Data: `{ae (equity), as (available_to_spend), aw (available_to_withdraw), b (balance), f (fee_tier), mu (margin_used), cm (cross_mmr), oc (orders_count), pb (pending_balance), pc (positions_count), sc (stop_orders_count), t}`

#### account_positions
```json
{"method": "subscribe", "params": {"source": "account_positions", "account": "42trU9A5..."}}
```
Data: `{s (symbol), d (side: bid/ask), a (amount), p (entry_price), m (margin), f (funding), i (isolated), l (liquidation_price), t, li}`
- Sends initial snapshot, then streams changes

#### account_order_updates
```json
{"method": "subscribe", "params": {"source": "account_order_updates", "account": "42trU9A5..."}}
```
Data: `{i (order_id), I (client_order_id), u (account), s (symbol), d (side), p (avg_price), ip (initial_price), lp (last_price), a (amount), f (filled), oe (event_type), os (order_status), ot (order_type), sp (stop_price), si (stop_parent_id), r (reduce_only), ct (created_at), ut (updated_at), li}`

Event types: make, stop_created, fulfill_market, fulfill_limit, adjust, stop_parent_order_filled, stop_triggered, stop_upgrade, cancel, force_cancel, expired, post_only_rejected, self_trade_prevented
Order statuses: open, partially_filled, filled, cancelled, rejected

#### account_trades
```json
{"method": "subscribe", "params": {"source": "account_trades", "account": "42trU9A5..."}}
```
Data: `{h (history_id), i (order_id), I (client_order_id), u (account), s (symbol), p (price), o (entry_price), a (amount), te (maker/taker), ts (side), tc (cause), f (fee), n (pnl), t, li}`

#### account_margin
```json
{"method": "subscribe", "params": {"source": "account_margin", "account": "42trU9A5..."}}
```
Data: `{u (account), s (symbol), i (is_isolated), t}`

#### account_leverage
```json
{"method": "subscribe", "params": {"source": "account_leverage", "account": "42trU9A5..."}}
```
Data: `{u (account), s (symbol), l (leverage), t}`

### 4.3 WebSocket Trading (Requires signing)

WebSocket trading uses the same signing as REST but wraps in WS message format:

```json
{
  "id": "<uuid>",
  "params": {
    "<operation_name>": {
      "account": "...",
      "signature": "...",
      "timestamp": ...,
      "expiry_window": ...,
      ...operation_specific_fields
    }
  }
}
```

**Supported WS trading operations:**
| WS Param Key | Equivalent |
|---------------|-----------|
| `create_market_order` | POST /api/v1/orders/create_market |
| `create_order` | POST /api/v1/orders/create |
| `create_stop_order` | POST /api/v1/orders/stop/create |
| `set_position_tpsl` | POST /api/v1/positions/tpsl |
| `cancel_order` | POST /api/v1/orders/cancel |
| `cancel_all_orders` | POST /api/v1/orders/cancel_all |
| `cancel_stop_order` | POST /api/v1/orders/stop/cancel |
| `edit_order` | POST /api/v1/orders/edit |

The `id` field (UUID) is used to correlate responses to requests.

---

## 5. Rate Limits

### Credit Quotas
| Tier | Credits per 60 seconds |
|------|----------------------|
| No API key (IP only) | 125 |
| Valid API Config Key | 300 |
| Fee Tier 1 | 300 |
| Fee Tier 2 | 600 |
| Fee Tier 3 | 1200 |
| Fee Tier 4 | 2400 |
| Fee Tier 5 | 6000 |
| VIP1 | 20,000 |
| VIP2 | 30,000 |
| VIP3 | 40,000 |

Credits shared across main account + all subaccounts.

### Credit Costs
| Action | With API Key | Without API Key |
|--------|-------------|----------------|
| Standard request | 1 | 1 |
| Order cancellation | 0.5 | 0.5 |
| Heavy GET requests | 1-3 | 3-12 |

### Rate Limit Response
- REST: HTTP 429 when exhausted
- REST header: `ratelimit: "credits";r=1200;t=32`
- WebSocket: `rl` field in response with `r` (remaining), `t` (seconds until refresh), `q` (total quota), `w` (window seconds)
- All credit values multiplied by 10 (to support fractional costs)

### WebSocket Limits
- Max 300 concurrent connections per IP
- Max 20 subscriptions per channel per connection

---

## 6. Testnet Setup

- Testnet REST: `https://test-api.pacifica.fi/api/v1`
- Testnet WS: `wss://test-ws.pacifica.fi/ws`
- Testnet UI: `test.pacifica.fi` (presumed, based on URL pattern)
- Agent keys can be generated at `app.pacifica.fi/apikey` (mainnet) or testnet equivalent
- No specific faucet documentation found - likely available through Discord/Telegram support

---

## 7. Error Codes

### REST HTTP Codes
| Code | Meaning |
|------|---------|
| 400 | Bad Request |
| 403 | Forbidden (no access/restricted region) |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Business Logic Error (see subcodes) |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |
| 504 | Gateway Timeout |

### Business Logic Subcodes (HTTP 422)
| Code | Meaning |
|------|---------|
| 0 | UNKNOWN |
| 1 | ACCOUNT_NOT_FOUND |
| 2 | BOOK_NOT_FOUND |
| 3 | INVALID_TICK_LEVEL |
| 4 | INSUFFICIENT_BALANCE |
| 5 | ORDER_NOT_FOUND |
| 6 | OVER_WITHDRAWAL |
| 7 | INVALID_LEVERAGE |
| 8 | CANNOT_UPDATE_MARGIN |
| 9 | POSITION_NOT_FOUND |
| 10 | POSITION_TPSL_LIMIT_EXCEEDED |

### WebSocket Error Codes
| Code | Meaning |
|------|---------|
| 200 | SUCCESS |
| 400 | INVALID_REQUEST |
| 401 | INVALID_SIGNATURE |
| 402 | INVALID_SIGNER |
| 403 | UNAUTHORIZED_REQUEST |
| 420 | ENGINE_ERROR |
| 429 | RATE_LIMIT_EXCEEDED |
| 500 | UNKNOWN_ERROR |

---

## 8. Market Symbol Conventions

- All uppercase: `BTC`, `ETH`, `SOL`
- Exception: abbreviated numerical prefixes use lowercase: `kBONK`, `kPEPE`
- Case-sensitive validation (e.g., `btc` or `Btc` will be rejected)

---

## 9. Standard Response Envelope

### Success
```json
{
  "success": true,
  "data": [...],
  "error": null,
  "code": null
}
```

### With Pagination
```json
{
  "success": true,
  "data": [...],
  "next_cursor": "11114Lz77",
  "has_more": true
}
```

### Error
```json
{
  "success": false,
  "data": null,
  "error": "Error message",
  "code": 400
}
```

### Exchange Nonce
Many responses include `last_order_id` - an exchange-wide nonce for determining event ordering.

---

## 10. Key Implementation Notes for SDK

1. **No HMAC** - Uses Ed25519 wallet signatures, not API key + secret HMAC
2. **Recursive key sorting** is critical for signature validity
3. **Compact JSON** with no whitespace for signing
4. **Timestamp in milliseconds** (not seconds)
5. **Default expiry_window** is 30,000ms if not specified
6. **Speed bump**: ~200ms delay on market orders and GTC/IOC limit orders (for LP protection)
7. **Cancel operations** bypass speed bump
8. **ALO/TOB orders** bypass speed bump
9. **Edit order** = cancel + create new (gets new order_id, TIF=ALO)
10. **Batch max 10 actions**, each individually signed
11. **Funding rate** paid hourly
12. **Sides**: REST uses "bid"/"ask" for orders; positions show "long"/"short"
13. **All numeric values** are decimal strings (not numbers) except counts and timestamps
14. **WebSocket ping** required within 60 seconds to keep connection alive
15. **Orderbook WS** updates every 250ms
