// ---------------------------------------------------------------------------
// Pacifica public API helpers — no auth required for read-only data.
// Account equity and positions are publicly accessible GET endpoints.
// Wallet address is stored in sessionStorage so user enters it once.
// ---------------------------------------------------------------------------

import type { PacificaMasterAccount } from "./types";

const BASE       = "https://test-api.pacifica.fi/api/v1";
const SESSION_KEY = "pacifica_wallet_address";

// ── Address management ─────────────────────────────────────────────────────

export function saveWalletAddress(address: string): void {
  try { sessionStorage.setItem(SESSION_KEY, address); } catch { /* ignore */ }
}

export function clearWalletAddress(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export function getSavedAddress(): string | null {
  if (typeof window === "undefined") return null;
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

// ── Fetch helper ───────────────────────────────────────────────────────────

async function pacificaGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`Pacifica API ${res.status}`);
  const json = await res.json() as { success?: boolean; data?: T } | T;
  if (json && typeof json === "object" && "data" in (json as object)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

// ── Public API ─────────────────────────────────────────────────────────────

export type { PacificaMasterAccount as PacificaAccountInfo } from "./types";

export interface PacificaPosition {
  symbol:            string;
  side:              "bid" | "ask";
  amount:            string;
  entry_price:       string;
  margin:            string;
  funding:           string;
  isolated:          boolean;
  liquidation_price: string;
  created_at:        number;
  updated_at:        number;
}

export interface PacificaSubaccountInfo {
  address:   string;
  balance:   string;
  fee_level: number;
  fee_mode:  string;
  created_at: number;
}

export async function fetchAccount(address: string): Promise<PacificaMasterAccount> {
  return pacificaGet<PacificaMasterAccount>(`/account?account=${encodeURIComponent(address)}`);
}

export async function fetchPositions(address: string): Promise<PacificaPosition[]> {
  type Raw = PacificaPosition[] | { positions: PacificaPosition[] };
  const data = await pacificaGet<Raw>(`/positions?account=${encodeURIComponent(address)}`);
  if (Array.isArray(data)) return data;
  if (data && "positions" in data) return (data as { positions: PacificaPosition[] }).positions;
  return [];
}

export async function fetchSubaccounts(address: string): Promise<PacificaSubaccountInfo[]> {
  type Raw = PacificaSubaccountInfo[] | { list: PacificaSubaccountInfo[] } | { subaccounts: PacificaSubaccountInfo[] };
  const data = await pacificaGet<Raw>(`/subaccounts/list?account=${encodeURIComponent(address)}`).catch(() => []);
  if (Array.isArray(data)) return data;
  if ("list" in (data as object)) return (data as { list: PacificaSubaccountInfo[] }).list;
  if ("subaccounts" in (data as object)) return (data as { subaccounts: PacificaSubaccountInfo[] }).subaccounts;
  return [];
}
