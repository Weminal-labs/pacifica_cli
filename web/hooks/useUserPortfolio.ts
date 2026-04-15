"use client";

import useSWR from "swr";
import type { PortfolioComposite } from "../lib/types";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Portfolio API ${r.status}`);
    return r.json() as Promise<PortfolioComposite>;
  });

export function useUserPortfolio(address: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PortfolioComposite>(
    address ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4242"}/api/portfolio/${address}` : null,
    fetcher,
    {
      refreshInterval: 10_000,   // poll every 10s
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
    },
  );

  return {
    portfolio: data ?? null,
    isLoading,
    isError: !!error,
    refresh: mutate,
  };
}
