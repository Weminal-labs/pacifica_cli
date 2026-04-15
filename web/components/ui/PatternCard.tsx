"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { WinRateBadge } from "./WinRateBadge";
import type { Pattern } from "../../lib/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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

export function PatternCard({
  pattern,
  isLive = false,
}: {
  pattern: Pattern;
  isLive?: boolean;
}) {
  const router = useRouter();
  const side = deriveSide(pattern);
  const primaryAsset = pattern.primary_assets[0] ?? "ETH";
  const primarySym = stripSym(primaryAsset);
  const topConditions = pattern.conditions.slice(0, 2);

  return (
    <div
      onClick={() => router.push(`/patterns/${pattern.id}`)}
      className="relative block bg-[#111111] border border-neutral-500/20 rounded-xl p-5 hover:border-orange-500/40 transition-colors group cursor-pointer"
    >
      {/* corner brackets */}
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold tracking-wider">
          VERIFIED
        </span>
        {isLive && (
          <span className="text-[10px] text-orange-500 font-bold font-mono tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <h3 className="text-white font-semibold text-base mb-3 group-hover:text-orange-500 transition-colors">
        {pattern.name}
      </h3>

      {/* Top 2 conditions as chips */}
      {topConditions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {topConditions.map((c, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-2 py-0.5 bg-[#0A0A0A] border border-neutral-500/20 rounded text-neutral-400"
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-neutral-500 mb-1">Win Rate</p>
          <WinRateBadge rate={pattern.win_rate} />
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 mb-1">Sample</p>
          <p className="text-white font-semibold text-sm">{pattern.sample_size}</p>
        </div>
        <div>
          <p className="text-[11px] text-neutral-500 mb-1">Avg P&amp;L</p>
          <p className="text-green-400 font-semibold text-sm">+{pattern.avg_pnl_pct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Clickable asset chips */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {pattern.primary_assets.map((a) => {
          const sym = stripSym(a);
          return (
            <Link
              key={a}
              href={`/snapshot/${sym}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] px-2 py-0.5 bg-[#0A0A0A] border border-neutral-500/20 rounded text-neutral-400 hover:border-orange-500/40 hover:text-orange-500 transition-colors"
            >
              {sym}
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-500/60 mb-3">
        Last seen {timeAgo(pattern.last_seen_at)}
      </p>

      {/* Action bar */}
      <div className="flex items-center gap-2 pt-3 border-t border-neutral-500/10 text-[11px] font-mono">
        <Link
          href={`/snapshot/${primarySym}`}
          onClick={(e) => e.stopPropagation()}
          className="text-neutral-400 hover:text-orange-500 transition-colors"
        >
          Snapshot →
        </Link>
        <span className="text-neutral-600">·</span>
        <Link
          href={`/simulate?side=${side}&symbol=${primarySym}&patternId=${pattern.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-neutral-400 hover:text-orange-500 transition-colors"
        >
          Simulate →
        </Link>
        <span className="text-neutral-600">·</span>
        <Link
          href={`/patterns/${pattern.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-neutral-400 hover:text-orange-500 transition-colors"
        >
          Details →
        </Link>
      </div>
    </div>
  );
}
