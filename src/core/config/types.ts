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

export interface PacificaConfig {
  network: "testnet" | "mainnet";
  private_key: string;   // Base58-encoded Ed25519 secret key (64 bytes)
  account?: string;       // Main wallet public key (required when using agent keys)
  defaults: {
    leverage: number;       // default: 5
    slippage: number;       // default: 1 (percent)
    tp_distance: number;    // default: 3 (percent)
    sl_distance: number;    // default: 2 (percent)
  };
  agent: AgentConfig;
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
    allowed_actions: ["place_order", "close_position", "cancel_order", "set_tpsl"],
    blocked_actions: ["withdraw"],
    require_confirmation_above: 1000,
  },
};
