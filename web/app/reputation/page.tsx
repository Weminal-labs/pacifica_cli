import { OrangeLabel } from "../../components/ui/OrangeLabel";
import type { ReputationEntry } from "../../lib/types";
import { DEMO_REP } from "../../lib/demo-data";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getReputation(): Promise<ReputationEntry[]> {
  try {
    const res = await fetch("http://localhost:4242/api/intelligence/reputation", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("API unavailable");
    const data = await res.json();
    return (data.leaderboard ?? data) as ReputationEntry[];
  } catch {
    return DEMO_REP;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReputationPage() {
  const entries = await getReputation();

  return (
    <div className="min-h-screen bg-bg-primary max-w-6xl mx-auto px-6 py-12">
      <OrangeLabel text="/ REPUTATION LEDGER" />
      <h1 className="text-4xl font-bold text-white mt-3 mb-2">Intelligence Reputation</h1>
      <p className="text-muted mb-10">
        Accuracy built from actual P&amp;L — not self-reported. Ground truth is the outcome.
      </p>

      {/* Leaderboard table */}
      <div className="border border-border rounded-xl overflow-hidden mb-12">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-surface border-b border-border">
              <th className="text-left px-5 py-3 text-muted font-medium">Rank</th>
              <th className="text-left px-5 py-3 text-muted font-medium">Trader</th>
              <th className="text-left px-5 py-3 text-muted font-medium">Rep Score</th>
              <th className="text-left px-5 py-3 text-muted font-medium">Win Rate</th>
              <th className="text-left px-5 py-3 text-muted font-medium">Trades</th>
              <th className="text-left px-5 py-3 text-muted font-medium">Top Conditions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr
                key={e.trader_id}
                className="border-b border-border hover:bg-bg-surface/50 transition-colors"
              >
                <td className="px-5 py-4 text-muted">#{i + 1}</td>
                <td className="px-5 py-4 font-mono text-white text-xs">
                  {e.trader_id.slice(0, 12)}...
                </td>
                <td className="px-5 py-4">
                  <span className="text-accent font-bold">{e.overall_rep_score}</span>
                </td>
                <td className="px-5 py-4 text-white">
                  {(e.overall_win_rate * 100).toFixed(1)}%
                </td>
                <td className="px-5 py-4 text-white">{e.closed_trades}</td>
                <td className="px-5 py-4">
                  <div className="flex gap-1 flex-wrap">
                    {e.top_patterns.slice(0, 2).map((p) => (
                      <span
                        key={p}
                        className="text-[10px] px-1.5 py-0.5 bg-bg-card border border-border rounded text-muted"
                      >
                        {p.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Intelligence NFTs concept section */}
      <div className="border border-border rounded-xl p-8 bg-bg-surface">
        <OrangeLabel text="/ INTELLIGENCE NFTs" />
        <h2 className="text-2xl font-bold text-white mt-3 mb-2">
          Verified patterns as permanent records
        </h2>
        <p className="text-muted mb-6">
          When a pattern crosses the verification threshold, it becomes a permanent intelligence
          record — mintable onchain.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              name: "Negative Funding + Rising OI",
              sample: 34,
              win: "72.3%",
              status: "Verified",
            },
            {
              name: "Whale Activity + Bullish Momentum",
              sample: 27,
              win: "68.1%",
              status: "Verified",
            },
            {
              name: "High Buy Pressure + Neg Funding",
              sample: 19,
              win: "65.6%",
              status: "Pending",
            },
          ].map((nft) => (
            <div key={nft.name} className="bg-bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    nft.status === "Verified"
                      ? "bg-accent text-white"
                      : "bg-border text-muted"
                  }`}
                >
                  {nft.status.toUpperCase()}
                </span>
              </div>
              <p className="text-white font-medium text-sm mb-3">{nft.name}</p>
              <div className="flex justify-between text-xs text-muted">
                <span>{nft.sample} trades</span>
                <span className="text-accent font-semibold">{nft.win}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
