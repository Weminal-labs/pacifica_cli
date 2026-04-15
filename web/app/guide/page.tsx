// ---------------------------------------------------------------------------
// /guide — Web Dashboard Usage Guide
// Explains every page, every element, and the full trader workflow
// ---------------------------------------------------------------------------

import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Section({ id, label, title, sub, children }: {
  id: string; label: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="pb-16 border-b border-neutral-500/10 last:border-0">
      <OrangeLabel text={label} />
      <h2 className="text-3xl font-bold text-white mt-3 mb-1">{title}</h2>
      <p className="text-neutral-500 text-sm mb-8 max-w-2xl">{sub}</p>
      {children}
    </section>
  );
}

function PageCard({ href, label, title, desc, tags }: {
  href: string; label: string; title: string; desc: string; tags: string[];
}) {
  return (
    <Link
      href={href}
      className="relative block bg-[#111111] border border-neutral-500/20 p-5 hover:border-orange-500/40 transition-colors group"
    >
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />
      <p className="text-[10px] font-mono text-orange-500 mb-2 uppercase tracking-wider">{label}</p>
      <h3 className="text-white font-semibold text-base mb-2 group-hover:text-orange-500 transition-colors">{title}</h3>
      <p className="text-neutral-500 text-sm mb-3">{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => (
          <span key={t} className="text-[10px] font-mono px-2 py-0.5 bg-[#0A0A0A] border border-neutral-500/20 text-neutral-500">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}

function Step({ n, title, desc, action }: {
  n: number; title: string; desc: string; action?: { label: string; href: string };
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full border border-orange-500/40 bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold text-sm font-mono mt-0.5">
        {n}
      </div>
      <div className="flex-1 pb-8 border-b border-neutral-500/10 last:border-0 last:pb-0">
        <h3 className="text-white font-semibold mb-1">{title}</h3>
        <p className="text-neutral-500 text-sm mb-3">{desc}</p>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 text-[12px] font-mono text-orange-500 border border-orange-500/30 px-3 py-1.5 hover:bg-orange-500/10 transition-colors"
          >
            {action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}

function Callout({ type, title, body }: { type: "info" | "tip" | "warn"; title: string; body: string }) {
  const styles = {
    info: "border-neutral-500/30 bg-[#111111] text-neutral-400",
    tip:  "border-orange-500/30 bg-orange-500/5 text-orange-300",
    warn: "border-yellow-500/30 bg-yellow-500/5 text-yellow-300",
  };
  const icons = { info: "ℹ", tip: "⚡", warn: "⚠" };
  return (
    <div className={`border p-4 rounded-sm ${styles[type]}`}>
      <p className="font-semibold text-sm mb-1">{icons[type]} {title}</p>
      <p className="text-sm opacity-80">{body}</p>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className={`inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] px-6 py-12 pb-24 max-w-5xl">

      {/* ── Hero ── */}
      <div className="mb-16">
        <OrangeLabel text="/ WEB DASHBOARD GUIDE" />
        <h1 className="text-4xl font-bold text-white mt-3 mb-3 leading-tight">
          How to use Pacifica Intelligence
        </h1>
        <p className="text-neutral-400 text-base max-w-2xl mb-6">
          The web dashboard is the visual layer on top of the Pacifica CLI.
          It shows your patterns, market conditions, and signals in real time —
          and connects directly to your local intelligence server when it&apos;s running.
        </p>

        {/* Quick nav */}
        <div className="flex flex-wrap gap-2 text-[12px] font-mono">
          {[
            { label: "Overview", href: "#overview" },
            { label: "Feed", href: "#feed" },
            { label: "Patterns", href: "#patterns" },
            { label: "Market Scanner", href: "#scanner" },
            { label: "Simulate", href: "#simulate" },
            { label: "Leaderboard", href: "#leaderboard" },
            { label: "Copy Trading", href: "#copy" },
            { label: "Watch", href: "#watch" },
            { label: "Reputation", href: "#reputation" },
            { label: "CLI + MCP", href: "#cli" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="px-3 py-1 border border-neutral-500/20 text-neutral-400 hover:text-orange-500 hover:border-orange-500/40 transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-16">

        {/* ── Overview ── */}
        <Section id="overview" label="/ 01 OVERVIEW" title="How everything connects" sub="The dashboard reads from two sources — your local intelligence server and the Pacifica testnet API.">
          <div className="bg-[#0D0D0D] border border-neutral-500/15 p-6 font-mono text-sm text-neutral-400 leading-loose mb-6">
            <p className="text-orange-500 mb-1"># Data flow</p>
            <p>Your machine → pacifica intelligence serve → localhost:4242</p>
            <p className="text-neutral-600 pl-4">↓ if offline</p>
            <p>Pacifica testnet API → test-api.pacifica.fi</p>
            <p className="text-neutral-600 pl-4">↓ for market data always</p>
            <p>Web dashboard → shows real data or honest empty state</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Callout type="tip" title="Intelligence server running" body="All pages show YOUR patterns, YOUR signals, and live condition matching from your trade history." />
            <Callout type="info" title="Intelligence server offline" body="Pages fall back to real testnet market data. Pattern pages show example patterns so the UI is never empty." />
            <Callout type="warn" title="New to Pacifica?" body="Install the CLI first. Run pacifica init --testnet to connect your wallet. Then start trading." />
          </div>
        </Section>

        {/* ── Feed ── */}
        <Section id="feed" label="/ 02 FEED PAGE" title="Your live signal feed" sub="The home page. Shows active patterns, whale activity, and high-reputation trader positions right now.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Active Patterns section</p>
              <ul className="text-neutral-500 text-sm space-y-2">
                <li>→ Shows patterns currently firing from your trade history</li>
                <li>→ Each card has a <Badge color="bg-orange-500 text-white" label="LIVE" /> badge when the setup is active</li>
                <li>→ Click any card to see full condition detail</li>
                <li>→ If intelligence server is offline: shows a CLI hint instead of empty grid</li>
              </ul>
            </div>
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Whale Activity + High Rep Signals</p>
              <ul className="text-neutral-500 text-sm space-y-2">
                <li>→ Fetched live from Pacifica testnet API</li>
                <li>→ Whale Activity = top-volume markets with large order clusters</li>
                <li>→ High Rep Signals = positions held by top-ranked traders</li>
                <li>→ Direction chip: <Badge color="bg-green-400/20 text-green-400 border border-green-400/30" label="LONG" /> or <Badge color="bg-red-400/20 text-red-400 border border-red-400/30" label="SHORT" /></li>
              </ul>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
              Open Feed →
            </Link>
          </div>
        </Section>

        {/* ── Patterns ── */}
        <Section id="patterns" label="/ 03 PATTERNS" title="Verified market patterns" sub="Your library of statistically verified trading setups — detected automatically from your trade history.">
          <div className="space-y-4 mb-6">
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-3">Live Signal Banner (top of page)</p>
              <p className="text-neutral-500 text-sm mb-2">
                A scrolling row of patterns that are <strong className="text-white">firing right now</strong> across all your watched markets.
                Auto-refreshes every 60 seconds. Only shown when the intelligence server is running.
              </p>
              <p className="text-neutral-600 text-xs font-mono">Each signal shows: asset chip · LONG↑ or SHORT↓ · win rate · Simulate button</p>
            </div>

            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-3">Pattern Cards</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-neutral-500">
                <div>
                  <p className="text-white text-xs font-mono mb-1">What each card shows:</p>
                  <ul className="space-y-1">
                    <li>→ Pattern name + <Badge color="bg-orange-500 text-white text-[9px]" label="VERIFIED" /> badge</li>
                    <li>→ Top 2 conditions as chips (e.g. <code className="text-orange-400 text-xs">funding &lt; -0.03%</code>)</li>
                    <li>→ Win rate, sample size, avg P&amp;L</li>
                    <li>→ Clickable asset tags → Market Scanner</li>
                    <li>→ <Badge color="bg-orange-500 text-white text-[9px]" label="● LIVE" /> badge when pattern is currently active</li>
                  </ul>
                </div>
                <div>
                  <p className="text-white text-xs font-mono mb-1">Action bar at card bottom:</p>
                  <ul className="space-y-1">
                    <li>→ <strong className="text-neutral-300">Snapshot →</strong> see live conditions for primary asset</li>
                    <li>→ <strong className="text-neutral-300">Simulate →</strong> pre-fills risk calculator with correct side + symbol</li>
                    <li>→ <strong className="text-neutral-300">Details →</strong> full condition breakdown page</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/patterns" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
              Open Patterns →
            </Link>
          </div>
        </Section>

        {/* ── Pattern Detail ── */}
        <Section id="pattern-detail" label="/ 04 PATTERN DETAIL" title="/patterns/[id]" sub="The full drill-down for a single pattern — see exactly which conditions match right now in each market.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Condition Cards</p>
              <p className="text-neutral-500 text-sm mb-2">Each condition shows:</p>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2 bg-[#0A0A0A] p-2 border border-green-400/20">
                  <span className="text-green-400 font-bold">✓ MATCH</span>
                  <span className="text-neutral-400">funding &lt; -0.03% · current: -0.071%</span>
                </div>
                <div className="flex items-center gap-2 bg-[#0A0A0A] p-2 border border-yellow-500/20">
                  <span className="text-yellow-400 font-bold">~ NEAR</span>
                  <span className="text-neutral-400">buy pressure &gt; 65% · current: 58.3%</span>
                </div>
                <div className="flex items-center gap-2 bg-[#0A0A0A] p-2 border border-red-400/20">
                  <span className="text-red-400 font-bold">✗ NO</span>
                  <span className="text-neutral-400">OI &gt; $120M · current: $89M</span>
                </div>
              </div>
            </div>
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Live Market Scan</p>
              <p className="text-neutral-500 text-sm">
                Checks every primary asset for this pattern against current conditions.
                The best-matching market is pre-filled in the Simulate button.
              </p>
              <p className="text-neutral-600 text-xs font-mono mt-3">
                Requires intelligence server running locally
              </p>
            </div>
          </div>
        </Section>

        {/* ── Scanner ── */}
        <Section id="scanner" label="/ 05 MARKET SCANNER" title="All markets at a glance" sub="Find WHERE the opportunity is right now — not just confirm one market you already chose.">
          <div className="bg-[#111111] border border-neutral-500/20 p-5 mb-4">
            <p className="text-white font-semibold text-sm mb-3">What the scanner shows</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono text-neutral-500">
              {[
                ["Market", "Symbol — click to deep-dive"],
                ["Funding", "Color-coded: green=negative (long setup), red=positive (short setup)"],
                ["24h Vol", "Trading volume in last 24 hours"],
                ["Price", "Current mark price"],
                ["Signal", "Pattern firing + direction + win rate if detected"],
                ["Actions", "Snapshot → or Simulate → pre-filled"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-orange-500 mb-0.5">{k}</p>
                  <p>{v}</p>
                </div>
              ))}
            </div>
          </div>
          <Callout type="tip" title="Pattern rows glow orange" body="When your intelligence server has detected a pattern for a market, that row has an orange tint and a pulsing dot. Those are your highest-signal setups." />
          <div className="mt-4">
            <Link href="/snapshot" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
              Open Market Scanner →
            </Link>
          </div>
        </Section>

        {/* ── Simulate ── */}
        <Section id="simulate" label="/ 06 RISK SIMULATOR" title="Know your risk before you enter" sub="Calculate liquidation price, P&L scenarios, and funding cost before committing a single dollar.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="space-y-3">
              <div className="bg-[#111111] border border-neutral-500/20 p-4">
                <p className="text-white text-sm font-semibold mb-1">Inputs</p>
                <ul className="text-neutral-500 text-sm space-y-1">
                  <li>→ Side: Long or Short</li>
                  <li>→ Market: 14 preset markets or custom</li>
                  <li>→ Position size (USD)</li>
                  <li>→ Leverage: 1x – 50x slider</li>
                  <li>→ Entry price (auto-filled from testnet)</li>
                </ul>
              </div>
              <Callout type="tip" title="Pre-filled from patterns" body='Pattern cards and scanner rows link directly to Simulate with side + symbol already set. Just hit "Simulate →" and review.' />
            </div>
            <div className="space-y-3">
              <div className="bg-[#111111] border border-neutral-500/20 p-4">
                <p className="text-white text-sm font-semibold mb-1">What you get</p>
                <ul className="text-neutral-500 text-sm space-y-1">
                  <li>→ <strong className="text-red-400">Liquidation price</strong> — exact level where you get wiped</li>
                  <li>→ P&L at ±5%, ±10%, ±20% moves (bar chart)</li>
                  <li>→ Funding cost at 8h, 24h, 7d hold times</li>
                  <li>→ Risk/reward ratio at each scenario</li>
                </ul>
              </div>
            </div>
          </div>
          <Link href="/simulate" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
            Open Simulator →
          </Link>
        </Section>

        {/* ── Leaderboard ── */}
        <Section id="leaderboard" label="/ 07 LEADERBOARD" title="Top traders on Pacifica" sub="Ranked by all-time P&L and reputation score. See exactly what they're holding right now.">
          <div className="bg-[#111111] border border-neutral-500/20 p-5 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-500">
              <div>
                <p className="text-white font-semibold mb-2 text-sm">Columns</p>
                <ul className="space-y-1">
                  <li>→ Rank (🥇🥈🥉 for top 3)</li>
                  <li>→ Wallet address (truncated)</li>
                  <li>→ REP score badge</li>
                  <li>→ P&L: 1d / 7d / 30d / all-time</li>
                  <li>→ Current open positions as pills</li>
                </ul>
              </div>
              <div>
                <p className="text-white font-semibold mb-2 text-sm">Actions</p>
                <ul className="space-y-1">
                  <li>→ Click trader row → full profile page</li>
                  <li>→ Position pills show side + size</li>
                  <li>→ Copy Trading button → pre-fills copy page with their address</li>
                </ul>
              </div>
            </div>
          </div>
          <Link href="/leaderboard" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
            Open Leaderboard →
          </Link>
        </Section>

        {/* ── Copy ── */}
        <Section id="copy" label="/ 08 COPY TRADING" title="Mirror top traders" sub="See exactly what any trader is holding right now. Use the CLI to copy their positions automatically.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Pick a trader</p>
              <ul className="text-neutral-500 text-sm space-y-1">
                <li>→ Left panel: top 10 from leaderboard as quick-pick</li>
                <li>→ Or paste any wallet address directly</li>
                <li>→ Click → loads their live positions on the right</li>
              </ul>
            </div>
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Positions panel</p>
              <ul className="text-neutral-500 text-sm space-y-1">
                <li>→ Symbol, side, size, entry price</li>
                <li>→ Liquidation price + funding rate</li>
                <li>→ Simulate → link pre-fills the risk calculator</li>
                <li>→ Use CLI to actually mirror: <code className="text-orange-400 text-xs">pacifica copy watch &lt;address&gt;</code></li>
              </ul>
            </div>
          </div>
          <Callout type="tip" title="CLI completes the loop" body="The web shows what traders hold. The CLI actually copies it. Run: pacifica copy watch <address> --multiplier 0.1 to mirror at 10% size." />
          <div className="mt-4">
            <Link href="/copy" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
              Open Copy Trading →
            </Link>
          </div>
        </Section>

        {/* ── Watch ── */}
        <Section id="watch" label="/ 09 WATCH" title="Live market monitor" sub="A real-time view of active signals and top trader positions. Refreshes every 30 seconds automatically.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Active Signals panel</p>
              <p className="text-neutral-500 text-sm">
                Patterns firing right now from your intelligence server.
                Each row: asset, direction, pattern name, win rate, time since detected.
              </p>
            </div>
            <div className="bg-[#111111] border border-neutral-500/20 p-5">
              <p className="text-white font-semibold text-sm mb-2">Top Trader Positions panel</p>
              <p className="text-neutral-500 text-sm">
                What the highest-rep traders are currently holding, pulled live from Pacifica testnet.
                Updates every 30s with a countdown timer.
              </p>
            </div>
          </div>
          <Link href="/watch" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
            Open Watch →
          </Link>
        </Section>

        {/* ── Reputation ── */}
        <Section id="reputation" label="/ 10 REPUTATION" title="On-chain reputation scores" sub="Traders earn reputation through consistent, risk-adjusted performance — not just biggest P&L.">
          <div className="bg-[#111111] border border-neutral-500/20 p-5 mb-4">
            <p className="text-white font-semibold text-sm mb-3">How REP score is calculated</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono text-neutral-500">
              {[
                ["Win Rate", "% of profitable closed trades"],
                ["Consistency", "Wins across multiple market conditions"],
                ["Risk-Adjusted", "Penalises excessive leverage"],
                ["Sample Size", "More trades = more reliable score"],
              ].map(([k, v]) => (
                <div key={k} className="bg-[#0A0A0A] p-3 border border-neutral-500/10">
                  <p className="text-orange-500 mb-1">{k}</p>
                  <p>{v}</p>
                </div>
              ))}
            </div>
          </div>
          <Callout type="info" title="REP 70+ = high signal" body="Traders with REP above 70 appear in the High Rep Signals section of the feed. Their positions are worth watching." />
          <div className="mt-4">
            <Link href="/reputation" className="text-sm font-mono text-orange-500 border border-orange-500/30 px-4 py-2 hover:bg-orange-500/10 transition-colors">
              Open Reputation Ledger →
            </Link>
          </div>
        </Section>

        {/* ── Full trader journey ── */}
        <Section id="workflow" label="/ 11 FULL WORKFLOW" title="The complete trader loop" sub="From first signal to executed trade — the recommended flow using both CLI and web together.">
          <div className="space-y-0">
            <Step n={1} title="Start the intelligence server" desc="This feeds the dashboard with live data from your trade history. Run once, leave it running in the background." action={{ label: "Install CLI", href: "/install" }} />
            <Step n={2} title="Open the Market Scanner" desc="Check which markets have active pattern signals right now. Orange-tinted rows = pattern firing. Look for high win rate + negative funding." action={{ label: "Open Scanner", href: "/snapshot" }} />
            <Step n={3} title="Click a pattern for the full breakdown" desc="See which conditions are matching (✓) vs near-match (~) vs not yet (✗). Find the best-matching market in the Live Market Scan." action={{ label: "Browse Patterns", href: "/patterns" }} />
            <Step n={4} title="Simulate before you risk" desc='Click "Simulate →" from the pattern card. The side and symbol are pre-filled. Adjust size and leverage, check your liquidation price and P&L scenarios.' action={{ label: "Open Simulator", href: "/simulate" }} />
            <Step n={5} title="Check what top traders are doing" desc="Cross-reference with the Leaderboard. Are high-rep traders positioned the same way? If yes, the signal is stronger." action={{ label: "Leaderboard", href: "/leaderboard" }} />
            <Step n={6} title="Execute via CLI" desc="Once confident, execute in one command. The CLI records the trade, and the intelligence server learns from it." />
            <Step n={7} title="Set an alert daemon" desc="Don't watch the screen all day. The daemon rings when the next setup fires." />
          </div>

          <div className="mt-8 bg-[#0D0D0D] border border-neutral-500/15 p-5 font-mono text-sm text-neutral-400 leading-relaxed">
            <p className="text-orange-500 mb-2"># The commands behind steps 6 + 7</p>
            <p><span className="text-neutral-600">$</span> pacifica simulate long ETH --size 500 --leverage 3</p>
            <p><span className="text-neutral-600">$</span> pacifica trade buy ETH 500 --leverage 3</p>
            <p><span className="text-neutral-600">$</span> pacifica alerts add --asset ETH --condition <span className="text-green-400">&quot;funding &lt; -0.05%&quot;</span></p>
            <p><span className="text-neutral-600">$</span> pacifica alerts daemon start</p>
          </div>
        </Section>

        {/* ── CLI + MCP ── */}
        <Section id="cli" label="/ 12 CLI + AI AGENTS" title="Terminal and AI access" sub="Every feature on this dashboard is also available as a CLI command and an MCP tool for AI agents.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <PageCard href="/install" label="CLI" title="Terminal Interface" desc="20+ commands for trading, intelligence, alerts, copy trading, and journal export." tags={["npm install -g pacifica-cli", "Node ≥ 18"]} />
            <PageCard href="/install#mcp" label="MCP" title="AI Agent Access" desc="41 tools exposing every feature to Claude, Cursor, or any MCP-compatible AI host." tags={["Claude Desktop", "Cursor", "npx pacifica-cli mcp"]} />
            <div className="relative bg-[#111111] border border-neutral-500/20 p-5">
              <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
              <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
              <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />
              <p className="text-[10px] font-mono text-orange-500 mb-2 uppercase tracking-wider">CLOUDFLARE</p>
              <p className="text-white font-semibold text-base mb-2">Web Dashboard</p>
              <p className="text-neutral-500 text-sm mb-3">This dashboard. Deployed on Cloudflare Pages. Live market data, no server required.</p>
              <div className="flex flex-wrap gap-1.5">
                {["Next.js 14", "Edge Runtime", "Testnet API"].map(t => (
                  <span key={t} className="text-[10px] font-mono px-2 py-0.5 bg-[#0A0A0A] border border-neutral-500/20 text-neutral-500">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ── CTA ── */}
        <div className="relative border border-neutral-500/20 p-10 text-center">
          <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
          <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
          <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
          <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />
          <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">/ ready?</p>
          <h3 className="text-white font-bold text-2xl mb-2">Start with the market scanner</h3>
          <p className="text-neutral-500 text-sm mb-6">Find where the signal is. Simulate the risk. Execute with confidence.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/snapshot" className="bg-orange-500 hover:bg-orange-400 text-black font-semibold px-6 py-2.5 text-sm transition-colors">
              Open Market Scanner →
            </Link>
            <Link href="/patterns" className="border border-neutral-500/30 text-neutral-300 hover:text-white hover:border-neutral-500/60 px-6 py-2.5 text-sm transition-colors">
              Browse Patterns
            </Link>
            <Link href="/install" className="border border-neutral-500/30 text-neutral-300 hover:text-white hover:border-neutral-500/60 px-6 py-2.5 text-sm transition-colors">
              Install CLI
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
