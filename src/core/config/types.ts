// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Configuration Types
// ---------------------------------------------------------------------------
// The config stores a Solana wallet private key (Base58-encoded Ed25519
// secret key, 64 bytes) instead of traditional API key/secret.  The wallet
// signs all trading operations via Ed25519 signatures.
// ---------------------------------------------------------------------------

export interface AgentConfig {
  enabled: boolean;
  daily_spending_limit: number;  // USD
  max_order_size: number;        // USD
  max_leverage: number;
  allowed_actions: string[];
  blocked_actions: string[];
  require_confirmation_above: number; // USD
}

export interface ArbConfig {
  enabled: boolean;
  /** Minimum annualized APR (%) to enter a position. Default: 40 */
  min_apr_threshold: number;
  /** Max number of concurrent arb positions. Default: 3 */
  max_concurrent_positions: number;
  /** Notional size per position in USD. Default: 500 */
  position_size_usd: number;
  /** Minimum 24h volume (USD) for a market to be eligible. Default: 5_000_000 */
  min_market_volume_24h_usd: number;
  /** Maximum book spread in basis points. Default: 20 */
  max_spread_bps: number;
  /** How often to scan for new opportunities (ms). Default: 30_000 */
  scan_interval_ms: number;
  /** Exit policy. Default: "settlement" */
  exit_policy: "settlement" | "rate_inverted" | "apr_below" | "pnl_target";
  /** APR floor for "apr_below" exit policy. Default: 15 */
  exit_apr_floor: number;
  /** Fetch and compare Binance/Bybit public funding rates. Default: true */
  use_external_rates: boolean;
  /** Minimum Pacifica-vs-external divergence in bps to score positively. Default: 50 */
  external_divergence_bps: number;
  /** Stop bot and log error if net arb loss exceeds this in USD per day. Default: 200 */
  max_daily_loss_usd: number;
}

/** Optional Elfa social intelligence configuration. */
export interface ElfaConfig {
  api_key: string;
  /** Minutes to cache per-ticker social data. Default: 5 */
  cache_ttl_minutes?: number;
  /** If true, enrich every trade capture with social context (costs credits). Default: false */
  auto_capture?: boolean;
}

export interface PacificaConfig {
  network: "testnet" | "mainnet";
  private_key: string;   // Base58-encoded Ed25519 secret key (64 bytes)
  account?: string;       // Main wallet public key (required when using agent keys)
  /** Builder code for Pacifica Builder Program — included in every signed order. */
  builder_code?: string;
  defaults: {
    leverage: number;       // default: 5
    slippage: number;       // default: 1 (percent)
    tp_distance: number;    // default: 3 (percent)
    sl_distance: number;    // default: 2 (percent)
  };
  agent: AgentConfig;
  arb: ArbConfig;
  /** Optional — social intelligence via Elfa API. */
  elfa?: ElfaConfig;
}

export const DEFAULT_CONFIG: PacificaConfig = {
  network: "testnet",
  private_key: "",
  defaults: {
    leverage: 5,
    slippage: 1,
    tp_distance: 3,
    sl_distance: 2,
  },
  agent: {
    enabled: true,
    daily_spending_limit: 5000,
    max_order_size: 2000,
    max_leverage: 5,
    allowed_actions: ["place_order", "close_position", "cancel_order", "set_tpsl", "arb_open", "arb_close", "arb_configure"],
    blocked_actions: ["withdraw"],
    require_confirmation_above: 1000,
  },
  arb: {
    enabled: false,
    min_apr_threshold: 40,
    max_concurrent_positions: 3,
    position_size_usd: 500,
    min_market_volume_24h_usd: 5_000_000,
    max_spread_bps: 20,
    scan_interval_ms: 30_000,
    exit_policy: "settlement",
    exit_apr_floor: 15,
    use_external_rates: true,
    external_divergence_bps: 50,
    max_daily_loss_usd: 200,
  },
};
