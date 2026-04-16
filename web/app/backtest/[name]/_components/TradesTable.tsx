// ---------------------------------------------------------------------------
// TradesTable — compact row-per-trade listing with exit reason + P&L.
// ---------------------------------------------------------------------------

import type { BacktestTrade, ExitReason } from "@pacifica/core/patterns/backtest";

interface Props {
  trades: BacktestTrade[];
}

function fmtIso(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

function fmtUsd(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function fmtPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(4)}`;
}

const REASON_LABEL: Record<ExitReason, string> = {
  stop_loss: "SL",
  take_profit: "TP",
  liquidation: "LIQ",
  exit_clause: "EXIT",
  window_end: "END",
};

const REASON_CLASS: Record<ExitReason, string> = {
  stop_loss:   "text-red-400 border-red-500/30 bg-red-500/5",
  take_profit: "text-green-400 border-green-500/30 bg-green-500/5",
  liquidation: "text-red-500 border-red-600/50 bg-red-600/10",
  exit_clause: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  window_end:  "text-neutral-500 border-neutral-600/30 bg-neutral-800/20",
};

export function TradesTable({ trades }: Props) {
  if (trades.length === 0) return null;

  return (
    <div className="bg-[#111111] border border-neutral-500/10">
      <div className="px-4 py-2 border-b border-neutral-500/10">
        <span className="font-mono text-[11px] text-neutral-400 tracking-widest">
          TRADES ({trades.length})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="text-neutral-600 uppercase tracking-wider border-b border-neutral-500/10">
              <th className="text-left  px-3 py-2 font-normal">#</th>
              <th className="text-left  px-3 py-2 font-normal">Entry</th>
              <th className="text-left  px-3 py-2 font-normal">Exit</th>
              <th className="text-left  px-3 py-2 font-normal">Side</th>
              <th className="text-right px-3 py-2 font-normal">Entry px</th>
              <th className="text-right px-3 py-2 font-normal">Exit px</th>
              <th className="text-right px-3 py-2 font-normal">P&amp;L</th>
              <th className="text-right px-3 py-2 font-normal">% margin</th>
              <th className="text-left  px-3 py-2 font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.index} className="border-b border-neutral-500/5 hover:bg-neutral-500/5">
                <td className="px-3 py-1.5 text-neutral-600">{t.index}</td>
                <td className="px-3 py-1.5 text-neutral-400">{fmtIso(t.entry_time)}</td>
                <td className="px-3 py-1.5 text-neutral-400">{fmtIso(t.exit_time)}</td>
                <td className="px-3 py-1.5">
                  <span className={t.side === "long" ? "text-green-400" : "text-red-400"}>
                    {t.side}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-neutral-300">{fmtPrice(t.entry_price)}</td>
                <td className="px-3 py-1.5 text-right text-neutral-300">{fmtPrice(t.exit_price)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold ${t.pnl_usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtUsd(t.pnl_usd)}
                </td>
                <td className={`px-3 py-1.5 text-right ${t.pnl_pct_on_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {t.pnl_pct_on_margin >= 0 ? "+" : ""}{t.pnl_pct_on_margin.toFixed(1)}%
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 border text-[9px] ${REASON_CLASS[t.exit_reason]}`}>
                    {REASON_LABEL[t.exit_reason]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
