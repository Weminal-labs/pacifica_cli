// ---------------------------------------------------------------------------
// Pacifica DEX testnet GET-only client (T-76)
// All reads go through here. No auth required for GET endpoints.
// ---------------------------------------------------------------------------

const BASE = "https://test-api.pacifica.fi/api/v1";
const TIMEOUT_MS = 4_000;

// ── Raw Pacifica shapes ────────────────────────────────────────────────────

export interface PacificaAccount {
  address?: string;
  balance: string;
  account_equity: string;
  pending_balance?: string;
  available_to_spend: string;
  available_to_withdraw: string;
  total_margin_used?: string;
  positions_count: number;
  orders_count: number;
  stop_orders_count?: number;
  fee_level: number;
  maker_fee: string;
  taker_fee: string;
  cross_mmr: string;
  updated_at?: number;
}

export interface PacificaSubaccount {
  address: string;
  balance: string;
  pending_balance: string;
  fee_level: number;
  fee_mode: string;
  use_ltp_for_stop_orders?: boolean;
  created_at: number;
}

export interface PacificaPosition {
  symbol:            string;
  side:              "bid" | "ask";   // bid = long, ask = short
  amount:            string;          // position size
  entry_price:       string;
  margin:            string;
  funding:           string;          // cumulative funding paid/received
  isolated:          boolean;         // false = cross, true = isolated
  liquidation_price: string;
  created_at:        number;
  updated_at:        number;
}

export interface PacificaFundingPoint {
  t: number;
  rate: string;
}

// ── Fetch helper ───────────────────────────────────────────────────────────

async function pacificaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Pacifica API ${res.status} for ${path}`);
  }
  const json = await res.json() as { success?: boolean; data?: T } | T;
  // Some endpoints wrap in { success, data }, others return the array/object directly
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getAccount(address: string): Promise<PacificaAccount> {
  return pacificaGet<PacificaAccount>(`/account?account=${encodeURIComponent(address)}`);
}

export async function getSubaccounts(address: string): Promise<PacificaSubaccount[]> {
  const data = await pacificaGet<PacificaSubaccount[] | { list: PacificaSubaccount[] }>(
    `/subaccounts/list?account=${encodeURIComponent(address)}`,
  );
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "list" in data) return (data as { list: PacificaSubaccount[] }).list;
  return [];
}

export async function getPositions(address: string): Promise<PacificaPosition[]> {
  type RawData = PacificaPosition[] | { positions: PacificaPosition[] } | { data: PacificaPosition[] };
  const data = await pacificaGet<RawData>(`/positions?account=${encodeURIComponent(address)}`);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "positions" in data) return (data as { positions: PacificaPosition[] }).positions;
  return [];
}

export async function getFundingHistory(
  symbol: string,
  hours = 24,
): Promise<PacificaFundingPoint[]> {
  const data = await pacificaGet<PacificaFundingPoint[] | { funding_history: PacificaFundingPoint[] }>(
    `/funding_history?symbol=${encodeURIComponent(symbol)}&limit=${hours * 3}`,
  );
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "funding_history" in data) {
    return (data as { funding_history: PacificaFundingPoint[] }).funding_history;
  }
  return [];
}
