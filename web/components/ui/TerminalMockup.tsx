"use client";
import { useEffect, useState } from "react";

const LINES = [
  "$ pacifica intelligence patterns",
  "> Scanning 80 intelligence records...",
  "> 3 patterns verified ✓",
  "> ETH: Neg Funding + Rising OI  →  72.3% win rate",
  "> BTC: Whale Activity + Momentum →  68.1% win rate",
  "> SOL: High Buy Pressure         →  65.6% win rate",
  "> Intelligence layer ready.",
];

export function TerminalMockup() {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < LINES.length) {
        setVisibleLines((prev) => [...prev, LINES[i]!]);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-bg-surface border border-border rounded-xl p-5 font-mono text-sm max-w-lg w-full">
      <div className="flex gap-1.5 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-500/60" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
        <div className="w-3 h-3 rounded-full bg-green-500/60" />
      </div>
      <div className="space-y-1 min-h-[140px]">
        {visibleLines.map((line, i) => (
          <p
            key={i}
            className={
              line.startsWith("$")
                ? "text-accent"
                : line.includes("✓")
                  ? "text-green-400"
                  : "text-muted"
            }
          >
            {line}
          </p>
        ))}
        <span className="inline-block w-2 h-4 bg-accent animate-pulse" />
      </div>
    </div>
  );
}
