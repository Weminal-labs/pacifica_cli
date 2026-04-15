"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePhantomWallet } from "../../hooks/usePhantomWallet";

function truncate(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletButton() {
  const { ready, connected, address, isInstalled, connect, disconnect } = usePhantomWallet();
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);
  const dropRef             = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDisconnect() {
    setOpen(false);
    await disconnect();
  }

  if (!ready) {
    return <div className="h-7 w-28 bg-neutral-800 rounded-sm animate-pulse" />;
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!connected || !address) {
    return (
      <button
        onClick={connect}
        className="text-black bg-orange-500 px-3 py-1 text-xs font-semibold hover:bg-orange-400 transition-colors rounded-sm"
      >
        {isInstalled ? "Connect Phantom" : "Install Phantom"}
      </button>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 border border-orange-500/40 px-3 py-1 text-xs font-mono text-orange-400 hover:border-orange-500 hover:text-orange-300 transition-colors rounded-sm"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        {truncate(address)}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-[#111111] border border-neutral-500/20 py-1 z-50 shadow-xl">
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />

          <p className="px-3 py-1.5 text-[10px] font-mono text-neutral-500 border-b border-neutral-500/10 truncate">
            {address}
          </p>

          <button
            onClick={copyAddress}
            className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors font-mono"
          >
            {copied ? "Copied!" : "Copy Address"}
          </button>

          <Link
            href="/portfolio"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors font-mono"
          >
            My Portfolio
          </Link>

          <div className="border-t border-neutral-500/10 mt-1 pt-1">
            <button
              onClick={handleDisconnect}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors font-mono"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
