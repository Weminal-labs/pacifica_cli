"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAccount,
  fetchPositions,
  fetchSubaccounts,
  type PacificaPosition,
  type PacificaSubaccountInfo,
} from "../lib/pacifica-signed";
import type { PacificaMasterAccount } from "../lib/types";

export interface SignedPortfolioAccount {
  address:   string;
  is_master: boolean;
  label:     string;
  account:   PacificaMasterAccount | null;
  subInfo:   PacificaSubaccountInfo | null;
  positions: PacificaPosition[];
}

export interface SignedPortfolio {
  masterAccount: PacificaMasterAccount | null;
  accounts:      SignedPortfolioAccount[];
  stale:         boolean;
}

export interface UseSignedPortfolio {
  portfolio: SignedPortfolio | null;
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
}

const POLL_INTERVAL = 15_000;

export function useSignedPortfolio(address: string | null): UseSignedPortfolio {
  const [portfolio, setPortfolio] = useState<SignedPortfolio | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef               = useRef(false);

  const load = useCallback(async () => {
    if (!address || fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const [masterAccount, positions, subaccounts] = await Promise.all([
        fetchAccount(address),
        fetchPositions(address),
        fetchSubaccounts(address).catch(() => [] as PacificaSubaccountInfo[]),
      ]);

      const masterEntry: SignedPortfolioAccount = {
        address,
        is_master: true,
        label: "Master",
        account: masterAccount,
        subInfo: null,
        positions,
      };

      const subEntries: SignedPortfolioAccount[] = await Promise.all(
        subaccounts.map(async (sub) => ({
          address:   sub.address,
          is_master: false,
          label:     `Sub ${sub.address.slice(0, 6)}`,
          account:   null,
          subInfo:   sub,
          positions: await fetchPositions(sub.address).catch(() => []),
        })),
      );

      setPortfolio({ masterAccount, accounts: [masterEntry, ...subEntries], stale: false });
    } catch (err: unknown) {
      const msg = (err as Error).message ?? "Failed to load portfolio";
      setError(msg);
      setPortfolio((prev) => prev ? { ...prev, stale: true } : null);
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) { setPortfolio(null); return; }
    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [address, load]);

  return { portfolio, isLoading, error, refresh: load };
}
