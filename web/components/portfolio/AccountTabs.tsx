"use client";

import type { PortfolioAccount } from "../../lib/types";

interface Props {
  accounts: PortfolioAccount[];
  activeAddress: string;
  onSelect: (address: string) => void;
  labels: Record<string, string>;
  onRename: (address: string, name: string) => void;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function AccountTabs({ accounts, activeAddress, onSelect, labels, onRename }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {accounts.map((acc) => {
        const isActive  = acc.address === activeAddress;
        const label     = labels[acc.address] ?? (acc.is_master ? "Master" : truncate(acc.address));
        const posCount  = acc.positions.length;
        const equity    = parseFloat(acc.equity);
        const equityStr = isNaN(equity)
          ? "—"
          : equity >= 1_000
          ? `$${(equity / 1_000).toFixed(1)}K`
          : `$${equity.toFixed(0)}`;

        return (
          <button
            key={acc.address}
            onClick={() => onSelect(acc.address)}
            className={`relative flex flex-col items-start px-4 py-2 text-left border transition-colors shrink-0 group ${
              isActive
                ? "border-orange-500/60 bg-orange-500/5 text-white"
                : "border-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-white"
            }`}
          >
            {/* Corner brackets on active */}
            {isActive && (
              <>
                <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500" />
                <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500" />
                <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500" />
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500" />
              </>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              {posCount > 0 && (
                <span className="text-[9px] px-1 py-0.5 bg-orange-500/20 text-orange-400 font-bold font-mono">
                  {posCount}
                </span>
              )}
              {/* Rename pencil — only on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const next = window.prompt("Rename account:", label);
                  if (next?.trim()) onRename(acc.address, next.trim());
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-600 hover:text-neutral-300 text-xs"
                title="Rename"
              >
                ✎
              </button>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">{equityStr}</span>
          </button>
        );
      })}
    </div>
  );
}
