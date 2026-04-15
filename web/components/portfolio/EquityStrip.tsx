import type { PacificaMasterAccount } from "../../lib/types";

function fmt(val: string, prefix = "$"): string {
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(2)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function mmrColor(mmr: string): string {
  const n = parseFloat(mmr);
  if (isNaN(n)) return "text-neutral-400";
  if (n < 0.1)  return "text-red-400";
  if (n < 0.3)  return "text-yellow-400";
  return "text-emerald-400";
}

export function EquityStrip({ master }: { master: PacificaMasterAccount }) {
  const stats = [
    { label: "Equity",       value: fmt(master.account_equity) },
    { label: "Available",    value: fmt(master.available_to_spend) },
    { label: "MMR",  value: parseFloat(master.cross_mmr).toFixed(2),
      colorClass: mmrColor(master.cross_mmr) },
    { label: "Fee Tier",     value: `L${master.fee_level}` },
    { label: "Maker / Taker",value: `${(parseFloat(master.maker_fee) * 100).toFixed(3)}% / ${(parseFloat(master.taker_fee) * 100).toFixed(3)}%` },
    { label: "Open Positions",value: String(master.positions_count) },
    { label: "Open Orders",  value: String(master.orders_count) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-[#111111] border border-neutral-800">
      {stats.map(({ label, value, colorClass }) => (
        <div key={label} className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono">{label}</span>
          <span className={`text-sm font-semibold ${colorClass ?? "text-white"}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
