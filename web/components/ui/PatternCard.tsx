import { WinRateBadge } from "./WinRateBadge";
import type { Pattern } from "../../lib/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent/40 transition-colors cursor-pointer group">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full font-bold tracking-wider">
          VERIFIED
        </span>
      </div>
      <h3 className="text-white font-semibold text-base mb-4 group-hover:text-accent transition-colors">
        {pattern.name}
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-muted mb-1">Win Rate</p>
          <WinRateBadge rate={pattern.win_rate} />
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1">Sample</p>
          <p className="text-white font-semibold text-sm">{pattern.sample_size}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted mb-1">Avg P&amp;L</p>
          <p className="text-green-400 font-semibold text-sm">+{pattern.avg_pnl_pct.toFixed(1)}%</p>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {pattern.primary_assets.map((a) => (
          <span key={a} className="text-[10px] px-2 py-0.5 bg-bg-surface border border-border rounded text-muted">
            {a.split("-")[0]}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted/60">Last seen {timeAgo(pattern.last_seen_at)}</p>
    </div>
  );
}
