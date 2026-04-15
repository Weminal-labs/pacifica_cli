import Link from "next/link";
import type { LivePosition } from "../../lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function pnlColor(val: number): string {
  return val >= 0 ? "text-emerald-400" : "text-red-400";
}

function fmtFunding(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

// ── Intelligence overlay sub-lines ────────────────────────────────────────

function PatternMatchLine({ match }: { match: NonNullable<LivePosition["overlay"]["pattern_match"]> }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono">
          PATTERN
        </span>
        <Link href="/patterns" className="text-xs text-white hover:text-orange-400 transition-colors">
          {match.pattern_name}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-emerald-400">{(match.win_rate * 100).toFixed(0)}% win</span>
        <span className="text-[10px] text-neutral-500">{match.sample_size} trades</span>
      </div>
    </div>
  );
}

function RepSignalLine({ signal }: { signal: NonNullable<LivePosition["overlay"]["rep_signal"]> }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
          REP
        </span>
        <span className="text-xs text-neutral-300">
          {signal.count} high-rep trader{signal.count !== 1 ? "s" : ""} in same position
        </span>
      </div>
      <Link href="/reputation" className="text-[10px] text-neutral-500 hover:text-white transition-colors">
        view →
      </Link>
    </div>
  );
}

function FundingWatchLine({ watch, side }: {
  watch: NonNullable<LivePosition["overlay"]["funding_watch"]>;
  side: "bid" | "ask";
}) {
  const isBad = (side === "bid" && watch.trend === "rising") || (side === "ask" && watch.trend === "falling");
  const color = watch.trend === "flat" ? "text-neutral-400" : isBad ? "text-red-400" : "text-emerald-400";
  const icon  = watch.trend === "rising" ? "↑" : watch.trend === "falling" ? "↓" : "→";
  const diff  = Math.max(0, watch.next_settlement_ms - Date.now());
  const h     = Math.floor(diff / 3_600_000);
  const m     = Math.floor((diff % 3_600_000) / 60_000);
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-neutral-700 text-neutral-300 border border-neutral-600 font-mono">
          FUNDING
        </span>
        <span className={`text-xs font-mono ${color}`}>
          {(watch.current_rate * 100).toFixed(4)}% {icon}
        </span>
      </div>
      <span className="text-[10px] text-neutral-500">next settle {h}h {m}m</span>
    </div>
  );
}

// ── Main card ──────────────────────────────────────────────────────────────

export function PositionCard({ position }: { position: LivePosition }) {
  const isLong   = position.side === "bid";
  const asset    = position.symbol.split("-")[0];  // "SOL-USDC-PERP" → "SOL", or just "SOL"
  const size     = parseFloat(position.amount);
  const entry    = parseFloat(position.entry_price);
  const funding  = parseFloat(position.funding);
  const liq      = parseFloat(position.liquidation_price);
  const tradeUrl = `https://test-app.pacifica.fi/trade/${asset}`;

  const { pattern_match, rep_signal, funding_watch } = position.overlay;

  return (
    <div className="relative bg-[#111111] border border-neutral-800 hover:border-neutral-700 transition-colors">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base">{asset}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
              isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            }`}>
              {isLong ? "LONG" : "SHORT"}
            </span>
            <span className="text-[10px] text-neutral-500 font-mono border border-neutral-700 px-1 py-0.5">
              {position.isolated ? "isolated" : "cross"}
            </span>
          </div>
          <a href={tradeUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors font-mono border border-orange-500/30 px-2 py-0.5 hover:border-orange-500/60">
            Trade on Pacifica ↗
          </a>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 mb-1">
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Size</p>
            <p className="text-sm text-white font-medium">{size} {asset}</p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Entry</p>
            <p className="text-sm text-white font-mono">${entry.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Funding</p>
            <p className={`text-sm font-bold ${pnlColor(funding)}`}>{fmtFunding(position.funding)}</p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Liq. Price</p>
            <p className={`text-sm font-mono ${liq < 0 ? "text-neutral-500" : "text-red-400/80"}`}>
              {liq < 0 ? "N/A" : `$${liq.toLocaleString()}`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Margin</p>
            <p className="text-sm text-white font-mono">
              {parseFloat(position.margin) > 0 ? `$${parseFloat(position.margin).toFixed(2)}` : "Cross"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Snapshot</p>
            <Link href={`/snapshot/${asset}`} className="text-sm text-orange-400 hover:text-orange-300 transition-colors">
              View →
            </Link>
          </div>
        </div>

        {/* Intelligence overlays */}
        {pattern_match && <PatternMatchLine match={pattern_match} />}
        {rep_signal    && <RepSignalLine signal={rep_signal} />}
        {funding_watch && <FundingWatchLine watch={funding_watch} side={position.side} />}

        {!pattern_match && !rep_signal && !funding_watch && (
          <div className="border-t border-neutral-800 pt-2 mt-1">
            <p className="text-[11px] text-neutral-600 font-mono">No active intelligence signals.</p>
          </div>
        )}
      </div>
    </div>
  );
}
