"use client";

import { useState, useEffect } from "react";
import { fetchAccount } from "../lib/pacifica-signed";
import type { PacificaMasterAccount } from "../lib/types";

export function usePacificaAccount(address: string | null) {
  const [account, setAccount]     = useState<PacificaMasterAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setAccount(null); return; }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchAccount(address)
      .then((data) => { if (!cancelled) setAccount(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  return { account, isLoading, error };
}
