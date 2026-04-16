"use client";

import Link from "next/link";
import type { Pattern } from "../../lib/types";

function stripSym(asset: string): string {
  return asset.replace(/-USDC-PERP$/, "").replace(/-USDC$/, "").split("-")[0];
}

function deriveSide(pattern: Pattern): "long" | "short" {
  for (const c of pattern.conditions) {
    const axis = (c.axis || "").toLowerCase();
    if (axis.includes("negative_funding") || axis.includes("buy_pressure")) return "long";
    if (axis.includes("positive_funding") || axis.includes("sell_pressure")) return "short";
  }
  return "long";
}

export function LiveSignalBanner({ initialSignals }: { initialSignals: Pattern[] }) {
  const signals = initialSignals;

  if (signals.length === 0) {
    return (
      <div className="mb-6 p-4 bg-[#0F0F0F] border border-neutral-500/20">
        <p className="text-neutral-500 text-sm font-mono">
          No live signals · Install the CLI and connect Claude to see live patterns
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
        <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-orange-500">
          / SHOWCASE SIGNALS
        </span>
        <span className="text-neutral-500 text-[11px] font-mono">
          ({signals.length} example patterns)
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {signals.map((p) => {
          const side = deriveSide(p);
          const sym = stripSym(p.primary_assets[0] ?? "ETH");
          const dirColor = side === "long" ? "text-green-400" : "text-red-400";
          const dirArrow = side === "long" ? "↑" : "↓";
          return (
            <div
              key={p.id}
              className="relative flex-shrink-0 min-w-[220px] bg-[#111111] border border-neutral-500/20 p-4"
            >
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/60" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/60" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/60" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/60" />

              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[10px] font-bold font-mono ${dirColor} border ${side === "long" ? "border-green-400/40 bg-green-400/10" : "border-red-400/40 bg-red-400/10"} px-2 py-0.5`}
                >
                  {side.toUpperCase()} {dirArrow}
                </span>
                <span className="text-white font-semibold text-sm">{sym}</span>
              </div>
              <p className="text-white text-xs font-medium mb-2 truncate">{p.name}</p>
              <div className="flex items-center justify-between">
                <span className="text-orange-500 font-bold text-sm font-mono">
                  {(p.win_rate * 100).toFixed(0)}%
                </span>
                <Link
                  href={`/simulate?side=${side}&symbol=${sym}`}
                  className="text-[11px] font-mono text-neutral-400 hover:text-orange-500 transition-colors"
                >
                  Simulate →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
