"use client";

import { useState } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";
import { PositionCard } from "../../components/portfolio/PositionCard";
import { EquityStrip } from "../../components/portfolio/EquityStrip";
import { useSignedPortfolio, type SignedPortfolioAccount } from "../../hooks/useSignedPortfolio";
import { useSubaccountLabels } from "../../hooks/useSubaccountLabels";
import { usePhantomWallet } from "../../hooks/usePhantomWallet";
import type { LivePosition } from "../../lib/types";
import type { PacificaPosition } from "../../lib/pacifica-signed";

// ── Helpers ────────────────────────────────────────────────────────────────

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

/** Attach a null overlay so PositionCard renders without intelligence signals */
function asLivePosition(pos: PacificaPosition): LivePosition {
  return { ...pos, overlay: { pattern_match: null, rep_signal: null, funding_watch: null } };
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-4 w-32 bg-neutral-800 rounded" />
      <div className="h-8 w-64 bg-neutral-800 rounded" />
      <div className="h-12 bg-neutral-800 rounded mt-4" />
      <div className="flex gap-2 mt-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-14 w-32 bg-neutral-800 rounded" />)}
      </div>
      <div className="space-y-3 mt-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-40 bg-neutral-800 rounded" />)}
      </div>
    </div>
  );
}

// ── No positions state ─────────────────────────────────────────────────────

function NoPositions() {
  return (
    <div className="border border-neutral-800 p-8 text-center">
      <p className="text-neutral-400 mb-2">No open positions on this account.</p>
      <a
        href="https://test-app.pacifica.fi/trade/BTC"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-orange-400 hover:text-orange-300 transition-colors font-mono"
      >
        Open Pacifica testnet to trade ↗
      </a>
    </div>
  );
}

// ── Quick links ────────────────────────────────────────────────────────────

function QuickLinks({ address }: { address: string }) {
  const links = [
    { href: "/patterns",          label: "Pattern Library",   sub: "Verified patterns" },
    { href: "/reputation",        label: "Reputation Ledger", sub: "Top trader rankings" },
    { href: "/snapshot/ETH",      label: "ETH Snapshot",      sub: "Live market intel" },
    { href: `/trader/${address}`, label: "Public Profile",    sub: "Share your record" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {links.map(({ href, label, sub }) => (
        <Link key={href} href={href}
          className="relative group bg-[#111111] border border-neutral-800 hover:border-orange-500/40 p-4 transition-colors"
        >
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/30 group-hover:border-orange-500 transition-colors" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/30 group-hover:border-orange-500 transition-colors" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/30 group-hover:border-orange-500 transition-colors" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/30 group-hover:border-orange-500 transition-colors" />
          <p className="text-white text-sm font-semibold">{label}</p>
          <p className="text-neutral-500 text-[11px] mt-0.5">{sub}</p>
          <span className="text-orange-500 text-xs mt-2 block">→</span>
        </Link>
      ))}
    </div>
  );
}

// ── Account tab switcher ───────────────────────────────────────────────────

function AccountTabs({
  accounts,
  activeAddress,
  onSelect,
  labels,
}: {
  accounts: SignedPortfolioAccount[];
  activeAddress: string;
  onSelect: (addr: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {accounts.map((acc) => {
        const label = labels[acc.address] ?? (acc.is_master ? "Master" : truncate(acc.address));
        const active = acc.address === activeAddress;
        return (
          <button
            key={acc.address}
            onClick={() => onSelect(acc.address)}
            className={`shrink-0 px-3 py-1.5 text-xs font-mono border transition-colors ${
              active
                ? "border-orange-500/60 text-orange-400 bg-orange-500/5"
                : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white"
            }`}
          >
            {label}
            <span className="ml-1.5 text-neutral-600">({acc.positions.length})</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function NotConnected({ connect, isInstalled }: { connect: () => void; isInstalled: boolean }) {
  return (
    <div className="max-w-5xl mx-auto px-6 py-24 flex flex-col items-center text-center gap-6">
      <OrangeLabel text="/ MY PORTFOLIO" />
      <h1 className="text-4xl font-bold text-white">Connect your wallet</h1>
      <p className="text-neutral-400 max-w-sm">
        Connect Phantom to see your live Pacifica positions with intelligence overlays.
      </p>
      <button
        onClick={connect}
        className="text-black bg-orange-500 px-6 py-2.5 text-sm font-semibold hover:bg-orange-400 transition-colors"
      >
        {isInstalled ? "Connect Phantom" : "Install Phantom ↗"}
      </button>
    </div>
  );
}

export default function PortfolioPage() {
  const { ready, connected, address, isInstalled, connect } = usePhantomWallet();
  const { portfolio, isLoading, error } = useSignedPortfolio(address);
  const { labels, rename: _rename } = useSubaccountLabels();

  const [activeAddress, setActiveAddress] = useState<string | null>(null);

  if (!ready) return <Skeleton />;
  if (!connected || !address) return <NotConnected connect={connect} isInstalled={isInstalled} />;
  if (isLoading && !portfolio) return <Skeleton />;

  // Error or no data
  if (error && !portfolio) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <OrangeLabel text="/ MY PORTFOLIO" />
        <h1 className="text-3xl font-bold text-white mt-3 mb-2">My Portfolio</h1>
        <p className="text-[11px] font-mono text-neutral-500 mb-8 break-all">{address}</p>
        <QuickLinks address={address} />
        <div className="mt-6 border border-neutral-800 p-8 text-center">
          <p className="text-neutral-400 mb-2">
            {error?.includes("sign") || error?.includes("wallet")
              ? "Approve the signature request in Phantom to load your portfolio."
              : "Could not load Pacifica data right now."}
          </p>
          <a href="https://test-app.pacifica.fi" target="_blank" rel="noopener noreferrer"
            className="text-xs text-orange-400 hover:text-orange-300 font-mono">
            Open Pacifica testnet ↗
          </a>
        </div>
      </div>
    );
  }

  const accounts      = portfolio?.accounts ?? [];
  const masterAccount = portfolio?.masterAccount ?? null;
  const effectiveAddr = activeAddress ?? address;
  const activeAcc     = accounts.find((a) => a.address === effectiveAddr) ?? accounts[0];
  const totalPositions = accounts.reduce((n, a) => n + a.positions.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <OrangeLabel text="/ MY PORTFOLIO" />
          <h1 className="text-2xl font-bold text-white mt-2 mb-1">My Portfolio</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-mono text-neutral-500">{truncate(address)}</span>
            {portfolio?.stale && (
              <span className="text-[10px] text-yellow-500/70 font-mono">stale data</span>
            )}
            <a href="https://test-app.pacifica.fi/subaccount" target="_blank" rel="noopener noreferrer"
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors font-mono">
              Manage on Pacifica ↗
            </a>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">
            {masterAccount
              ? `$${parseFloat(masterAccount.account_equity).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : "—"}
          </p>
          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">total equity</p>
        </div>
      </div>

      {/* ── Equity strip ────────────────────────────────────────────────── */}
      {masterAccount && (
        <div className="mb-4">
          <EquityStrip master={masterAccount} />
        </div>
      )}

      {/* ── Account tabs (only if subaccounts exist) ─────────────────── */}
      {accounts.length > 1 && (
        <div className="mb-4">
          <AccountTabs
            accounts={accounts}
            activeAddress={effectiveAddr}
            onSelect={setActiveAddress}
            labels={labels}
          />
        </div>
      )}

      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Open Positions", value: String(totalPositions) },
          { label: "Accounts",       value: String(accounts.length) },
          { label: "Balance",        value: masterAccount ? `$${parseFloat(masterAccount.balance).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="relative bg-[#111111] border border-neutral-800 p-4">
            <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/40" />
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/40" />
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">{label}</p>
            <p className="text-xl font-bold text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Position cards ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wider font-mono">
            Open Positions
            {activeAcc && (
              <span className="ml-2 text-neutral-600 normal-case">
                — {labels[activeAcc.address] ?? (activeAcc.is_master ? "Master" : truncate(activeAcc.address))}
              </span>
            )}
          </h2>
          <a href="https://test-app.pacifica.fi" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-neutral-500 hover:text-orange-400 transition-colors font-mono">
            Open Pacifica ↗
          </a>
        </div>

        {!activeAcc || activeAcc.positions.length === 0 ? (
          <NoPositions />
        ) : (
          <div className="space-y-3">
            {activeAcc.positions.map((pos) => (
              <PositionCard
                key={`${pos.symbol}-${pos.side}-${pos.entry_price}`}
                position={asLivePosition(pos)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Quick links ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-neutral-300 uppercase tracking-wider font-mono mb-3">
          Intelligence Features
        </h2>
        <QuickLinks address={address} />
      </div>

    </div>
  );
}
