export function WinRateBadge({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-accent/20 text-accent border border-accent/30">
      {pct}%
    </span>
  );
}
