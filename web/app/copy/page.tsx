"use client";
// ---------------------------------------------------------------------------
// Pacifica Intelligence — Copy Trading
// Mirrors: pacifica copy watch <address> / copy list
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

const PACIFICA_API = "https://test-api.pacifica.fi/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Position {
  symbol:            string;
  side:              "bid" | "ask";
  amount:            string;
  entry_price:       string;
  liquidation_price: string;
  funding:           string;
  margin:            string;
}

interface LeaderEntry {
  address:     string;
  pnl_all_time: string;
  pnl_7d:      string;
  pnl_1d:      string;
  equity_current: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortAddr(a: string) { return a.slice(0, 8) + "…" + a.slice(-4); }

function fmtPnl(n: number) {
  const abs = Math.abs(n);
  const str = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M`
    : abs >= 1_000 ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${abs.toFixed(0)}`;
  return (n >= 0 ? "+" : "-") + str;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CopyPage() {
  const [address,   setAddress]   = useState("");
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [traders,   setTraders]   = useState<(LeaderEntry & { repScore: number })[]>([]);
  const [lbLoading, setLbLoading] = useState(true);

  // Load top traders for quick-pick
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${PACIFICA_API}/leaderboard`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: LeaderEntry[] };
        const sorted = (json?.data ?? [])
          .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
          .slice(0, 10)
          .map((t, i) => ({ ...t, repScore: Math.max(99 - i * 7, 35) }));
        setTraders(sorted);
      } catch { /* ignore */ }
      setLbLoading(false);
    })();
  }, []);

  const lookupPositions = useCallback(async (addr: string) => {
    const target = addr.trim();
    if (!target) { setError("Enter a wallet address."); return; }
    setLoading(true);
    setError("");
    setPositions(null);
    try {
      const res = await fetch(`${PACIFICA_API}/positions?account=${encodeURIComponent(target)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = (await res.json()) as { data?: Position[] };
      setPositions(json?.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch positions");
    }
    setLoading(false);
  }, []);

  return (
    <div className="px-6 py-12 pb-20">

      {/* Header */}
      <div className="mb-10">
        <OrangeLabel text="/ COPY TRADING" />
        <h1 className="text-3xl font-bold text-white mt-2">Copy a Trader</h1>
        <p className="text-neutral-500 text-sm mt-1 font-mono">
          Enter any wallet address to see their live open positions.
          Use the CLI <span className="text-orange-500">pacifica copy watch</span> to mirror trades automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">

        {/* ── Left panel: input + top traders ── */}
        <div className="space-y-6">

          {/* Address input */}
          <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
            <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
            <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
            <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
            <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

            <label className="block text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
              Wallet Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void lookupPositions(address)}
              placeholder="Solana wallet address…"
              className="w-full bg-[#0A0A0A] border border-neutral-500/20 text-white text-sm px-3 py-2.5 font-mono placeholder:text-neutral-600 focus:outline-none focus:border-orange-500/50 mb-3"
            />
            {error && <p className="text-red-400 text-xs font-mono mb-3">{error}</p>}
            <button
              onClick={() => void lookupPositions(address)}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-semibold py-2.5 text-sm transition-colors"
            >
              {loading ? "Fetching…" : "Look Up Positions →"}
            </button>
          </div>

          {/* Top traders quick-pick */}
          <div>
            <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-3">
              Top Traders — Click to Load
            </p>
            {lbLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-neutral-900 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {traders.map((t, i) => {
                  const pnl = parseFloat(t.pnl_all_time);
                  const eq  = parseFloat(t.equity_current);
                  return (
                    <button
                      key={t.address}
                      onClick={() => { setAddress(t.address); void lookupPositions(t.address); }}
                      className={`w-full relative flex items-center justify-between bg-[#111111] border px-4 py-3 text-left transition-colors hover:border-orange-500/30 ${
                        address === t.address ? "border-orange-500/40" : "border-neutral-500/10"
                      }`}
                    >
                      <span className="absolute top-0 left-0 h-1 w-1 border-t border-l border-orange-500/30" />
                      <span className="absolute bottom-0 right-0 h-1 w-1 border-b border-r border-orange-500/30" />
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-600 font-mono text-xs w-5">{i + 1}</span>
                        <div>
                          <p className="text-white text-sm font-mono">{shortAddr(t.address)}</p>
                          <p className="text-neutral-600 text-[11px] font-mono">
                            Equity: ${(eq / 1_000).toFixed(0)}K
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-sm font-semibold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {fmtPnl(pnl)}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 bg-orange-500/10 text-orange-500 border border-orange-500/20 font-mono">
                          {t.repScore}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: positions ── */}
        <div>
          {loading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-[#111111] animate-pulse border border-neutral-500/10" />
              ))}
            </div>
          )}

          {!loading && positions === null && (
            <div className="flex items-center justify-center border border-neutral-500/10 bg-[#111111] min-h-[300px]">
              <p className="text-neutral-600 font-mono text-sm">
                Select a trader or enter an address to see their positions
              </p>
            </div>
          )}

          {!loading && positions !== null && positions.length === 0 && (
            <div className="flex items-center justify-center border border-neutral-500/10 bg-[#111111] min-h-[200px]">
              <div className="text-center">
                <p className="text-neutral-400 font-mono text-sm mb-1">Trader is currently flat</p>
                <p className="text-neutral-600 text-xs font-mono">No open positions</p>
              </div>
            </div>
          )}

          {!loading && positions !== null && positions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                  {positions.length} Open Position{positions.length !== 1 ? "s" : ""}
                </p>
                <Link
                  href={`/trader/${address.trim()}`}
                  className="text-[11px] text-orange-500 hover:text-orange-400 font-mono transition-colors"
                >
                  Full Profile →
                </Link>
              </div>

              {positions.map((p, i) => {
                const sym  = p.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
                const long = p.side === "bid";
                const ep   = parseFloat(p.entry_price);
                const liq  = parseFloat(p.liquidation_price);
                const size = parseFloat(p.amount);
                const notional = size * ep;

                return (
                  <div key={i} className="relative bg-[#111111] border border-neutral-500/10 p-5">
                    <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
                    <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
                    <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
                    <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold font-mono px-2 py-0.5 border ${
                          long
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-red-500/30 bg-red-500/10 text-red-400"
                        }`}>
                          {long ? "↑ LONG" : "↓ SHORT"}
                        </span>
                        <span className="text-white font-bold text-lg">{sym}</span>
                      </div>
                      {/* Simulate this position */}
                      <Link
                        href={`/simulate?side=${long ? "long" : "short"}&symbol=${sym}&price=${ep.toFixed(4)}`}
                        className="text-[11px] font-mono text-orange-500 hover:text-orange-400 border border-orange-500/30 px-3 py-1.5 transition-colors"
                      >
                        Simulate →
                      </Link>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-wider">Size</p>
                        <p className="text-white font-mono text-sm mt-0.5">
                          {size.toFixed(4)} {sym}
                        </p>
                        <p className="text-neutral-600 text-[11px] font-mono">
                          ≈ ${notional.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-wider">Entry</p>
                        <p className="text-white font-mono text-sm mt-0.5">
                          ${ep.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-wider">Liquidation</p>
                        <p className="text-red-400 font-mono text-sm mt-0.5">
                          ${liq > 1_000_000 ? "∞" : liq.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-wider">Funding</p>
                        <p className="text-neutral-400 font-mono text-sm mt-0.5">
                          ${parseFloat(p.funding || "0").toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* CLI copy hint */}
              <div className="border border-neutral-500/10 bg-[#0A0A0A] px-4 py-3 mt-2">
                <p className="text-neutral-500 text-xs font-mono">
                  To auto-copy these trades via CLI:{" "}
                  <span className="text-orange-400">
                    pacifica copy watch {address.trim().slice(0, 20)}… --multiplier 0.1
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
