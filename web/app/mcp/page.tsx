"use client";

import { useState } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Prompt {
  text: string;
  tool: string;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompts: Prompt[];
}

const CATEGORIES: Category[] = [
  {
    id: "markets",
    label: "Markets & Prices",
    icon: "chart",
    description: "Real-time market data, prices, order books, and volume.",
    prompts: [
      { text: "Show me all markets", tool: "pacifica_get_markets" },
      { text: "What's the BTC price right now?", tool: "pacifica_get_ticker" },
      { text: "How's ETH doing?", tool: "pacifica_get_ticker" },
      { text: "Show me the SOL order book", tool: "pacifica_get_orderbook" },
      { text: "What's the spread on BTC?", tool: "pacifica_get_orderbook" },
      { text: "Which markets have the highest volume?", tool: "pacifica_get_markets" },
      { text: "Find me markets with negative funding", tool: "pacifica_get_markets" },
    ],
  },
  {
    id: "funding",
    label: "Funding Rates",
    icon: "percent",
    description: "Funding rates, APR calculations, and historical data.",
    prompts: [
      { text: "Show funding rates", tool: "pacifica_funding_rates" },
      { text: "Which coins pay you to hold long?", tool: "pacifica_funding_rates" },
      { text: "What's the funding APR on BTC?", tool: "pacifica_funding_rates" },
      { text: "Show me BTC funding history", tool: "pacifica_funding_history" },
      { text: "Has ETH funding been negative this week?", tool: "pacifica_funding_history" },
    ],
  },
  {
    id: "account",
    label: "Account & Positions",
    icon: "wallet",
    description: "Balance, positions, P&L, orders, and trade history.",
    prompts: [
      { text: "What are my positions?", tool: "pacifica_get_positions" },
      { text: "Am I in profit?", tool: "pacifica_get_positions" },
      { text: "Show my account balance", tool: "pacifica_get_account" },
      { text: "How much margin am I using?", tool: "pacifica_get_account" },
      { text: "Do I have any open orders?", tool: "pacifica_get_orders" },
      { text: "What's my total P&L?", tool: "pacifica_pnl_summary" },
      { text: "Show my win rate", tool: "pacifica_pnl_summary" },
      { text: "Show my recent trades", tool: "pacifica_trade_journal" },
      { text: "Show my ETH trade history", tool: "pacifica_trade_journal" },
    ],
  },
  {
    id: "trading",
    label: "Place Trades",
    icon: "zap",
    description: "Market orders, limit orders, leverage, and TP/SL.",
    prompts: [
      { text: "Buy 0.01 BTC", tool: "pacifica_place_order" },
      { text: "Long 0.5 ETH with 3x leverage", tool: "pacifica_place_order" },
      { text: "Short 100 WIF at 5x", tool: "pacifica_place_order" },
      { text: "Buy 10 SOL with TP at 90 and SL at 80", tool: "pacifica_place_order" },
      { text: "Place a limit buy on ETH at $2,300", tool: "pacifica_place_order" },
      { text: "Long 0.01 BTC with 2x leverage, take profit at 80000, stop loss at 70000", tool: "pacifica_place_order" },
    ],
  },
  {
    id: "manage",
    label: "Manage Positions",
    icon: "settings",
    description: "Close positions, set TP/SL, cancel orders.",
    prompts: [
      { text: "Close my BTC position", tool: "pacifica_close_position" },
      { text: "Close everything on SOL", tool: "pacifica_close_position" },
      { text: "Set take profit on my ETH at $2,500", tool: "pacifica_set_tpsl" },
      { text: "Put a stop loss on BTC at $70,000", tool: "pacifica_set_tpsl" },
      { text: "Set TP at 90 and SL at 75 on my SOL long", tool: "pacifica_set_tpsl" },
      { text: "Cancel order 308830202", tool: "pacifica_cancel_order" },
    ],
  },
  {
    id: "patterns-browse",
    label: "Browse & Create Patterns",
    icon: "code",
    description: "List, inspect, and author YAML trading patterns.",
    prompts: [
      { text: "List my patterns", tool: "pacifica_list_patterns" },
      { text: "Show me the funding-carry-btc pattern", tool: "pacifica_get_pattern" },
      { text: "What patterns do I have?", tool: "pacifica_list_patterns" },
      { text: "Write me a pattern that longs BTC when funding is deeply negative", tool: "pacifica_save_pattern" },
      { text: "Create a pattern that shorts ETH when momentum is above 0.7", tool: "pacifica_save_pattern" },
      { text: "Write a mean-reversion pattern for SOL that enters when buy pressure exceeds 80%", tool: "pacifica_save_pattern" },
      { text: "Save a pattern called 'my-first-btc' that longs BTC when price breaks above 75000 with 3x leverage and 2% stop loss", tool: "pacifica_save_pattern" },
    ],
  },
  {
    id: "patterns-test",
    label: "Test & Run Patterns",
    icon: "play",
    description: "Evaluate patterns live, simulate entries, and backtest against history.",
    prompts: [
      { text: "Does my funding-carry-btc pattern match right now?", tool: "pacifica_run_pattern" },
      { text: "Run my trend-continuation-eth pattern against the current market", tool: "pacifica_run_pattern" },
      { text: "Check if any of my patterns are triggering", tool: "pacifica_run_pattern" },
      { text: "Simulate my funding-carry-btc pattern", tool: "pacifica_simulate_pattern" },
      { text: "What would happen if I entered with my price-breakout-btc pattern?", tool: "pacifica_simulate_pattern" },
      { text: "Backtest funding-carry-btc over 30 days", tool: "pacifica_backtest_pattern" },
      { text: "How did my price-breakout-btc pattern perform over the last 60 days?", tool: "pacifica_backtest_pattern" },
      { text: "Backtest all my patterns and tell me which one has the best win rate", tool: "pacifica_backtest_pattern" },
    ],
  },
  {
    id: "patterns-stats",
    label: "Pattern Performance",
    icon: "bar-chart",
    description: "Track win rates and P&L per pattern over time.",
    prompts: [
      { text: "How is my funding-carry-btc pattern performing?", tool: "pacifica_journal_pattern_stats" },
      { text: "Show me win rate per pattern", tool: "pacifica_journal_pattern_stats" },
      { text: "Which pattern makes me the most money?", tool: "pacifica_journal_pattern_stats" },
    ],
  },
  {
    id: "agent",
    label: "Agent & Safety",
    icon: "shield",
    description: "Guardrails, spending limits, and audit trail.",
    prompts: [
      { text: "What are my guardrail settings?", tool: "pacifica_agent_status" },
      { text: "How much of my daily budget have I used?", tool: "pacifica_agent_status" },
      { text: "Show me the agent audit log", tool: "pacifica_agent_log" },
      { text: "What did the agent do today?", tool: "pacifica_agent_log" },
    ],
  },
  {
    id: "workflows",
    label: "Multi-Step Workflows",
    icon: "layers",
    description: "Complex requests where Claude chains multiple tools automatically.",
    prompts: [
      { text: "Scan for opportunities and suggest a trade", tool: "multi-tool" },
      { text: "Run all my patterns and tell me what's matching", tool: "multi-tool" },
      { text: "I want to do a funding carry trade \u2014 find the best opportunity", tool: "multi-tool" },
      { text: "Review my portfolio and suggest what to close", tool: "multi-tool" },
      { text: "Write me a pattern, backtest it, and if it looks good, run it", tool: "multi-tool" },
      { text: "Compare my BTC and ETH positions \u2014 which should I add to?", tool: "multi-tool" },
      { text: "Create a conservative long pattern for SOL, test it over 30 days", tool: "multi-tool" },
      { text: "What's the safest trade I can make right now based on funding?", tool: "multi-tool" },
      { text: "Am I at risk of liquidation on any position?", tool: "multi-tool" },
      { text: "Morning briefing \u2014 balance, positions, funding, pattern matches", tool: "multi-tool" },
      { text: "End of day report \u2014 P&L, trades, agent activity", tool: "multi-tool" },
      { text: "Help me build a pattern from scratch", tool: "multi-tool" },
      { text: "Is it a good time to long BTC?", tool: "multi-tool" },
    ],
  },
];

const SETUP_TABS = ["Claude Desktop", "claude.ai (Web)", "Claude Code", "Cursor"] as const;
type SetupTab = (typeof SETUP_TABS)[number];

const SETUP_CONTENT: Record<SetupTab, { steps: string[]; config: string }> = {
  "Claude Desktop": {
    steps: [
      "Download Claude Desktop from claude.ai/download",
      "Edit ~/Library/Application Support/Claude/claude_desktop_config.json",
      "Add the config below and restart Claude Desktop",
      "Click the hammer icon to see 23 Pacifica tools",
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["tsx", "/path/to/pacifica_cli/src/mcp/server.ts"]
    }
  }
}`,
  },
  "claude.ai (Web)": {
    steps: [
      "Start the HTTP MCP server: npx tsx src/mcp/server-http.ts",
      "Expose via tunnel: ngrok http 4243",
      "Add the tunnel URL to Claude Desktop config as remote MCP",
      "Restart Claude Desktop \u2014 tools are now available remotely",
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "url": "https://your-tunnel-url.ngrok.app/sse"
    }
  }
}`,
  },
  "Claude Code": {
    steps: [
      "Clone the repo and install dependencies",
      "cd into the project directory",
      "Run 'claude' \u2014 it auto-detects the MCP server",
    ],
    config: `cd pacifica_cli
pnpm install
claude`,
  },
  Cursor: {
    steps: [
      "Open your project in Cursor",
      "Edit .cursor/mcp.json in your project root",
      "Add the config below",
      "Restart Cursor",
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["tsx", "/path/to/pacifica_cli/src/mcp/server.ts"]
    }
  }
}`,
  },
};

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid dependencies)
// ---------------------------------------------------------------------------

function Icon({ name }: { name: string }) {
  const cls = "w-4 h-4";
  switch (name) {
    case "chart":     return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case "percent":   return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>;
    case "wallet":    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a1 1 0 100 2 1 1 0 000-2z"/></svg>;
    case "zap":       return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case "settings":  return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
    case "code":      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case "play":      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case "bar-chart": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
    case "shield":    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case "layers":    return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>;
    default:          return null;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`shrink-0 text-[10px] font-mono px-2 py-1 border transition-all ${
        copied
          ? "border-green-500/40 text-green-400 bg-green-500/10"
          : "border-neutral-500/20 text-neutral-500 hover:text-orange-400 hover:border-orange-500/30"
      }`}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function PromptRow({ prompt }: { prompt: Prompt }) {
  return (
    <div className="group flex items-center gap-3 py-2.5 px-3 hover:bg-white/[0.02] transition-colors">
      <span className="flex-1 text-sm text-neutral-300 font-mono">
        &ldquo;{prompt.text}&rdquo;
      </span>
      <span className="hidden sm:inline text-[10px] font-mono text-neutral-600 bg-neutral-800/50 px-2 py-0.5 border border-neutral-700/30 shrink-0">
        {prompt.tool}
      </span>
      <CopyButton text={prompt.text} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function McpUsagePage() {
  const [activeSetup, setActiveSetup] = useState<SetupTab>("Claude Desktop");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const totalPrompts = CATEGORIES.reduce((s, c) => s + c.prompts.length, 0);

  return (
    <div className="px-6 py-12 pb-20 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <OrangeLabel text="/ MCP USAGE GUIDE" />
        <h1 className="text-3xl font-bold text-white mt-2">
          Talk to Pacifica through Claude
        </h1>
        <p className="text-neutral-500 text-sm mt-2 font-mono max-w-2xl">
          {totalPrompts} example prompts across {CATEGORIES.length} categories.
          Connect Claude to your Pacifica account via MCP, then just talk naturally.
        </p>
      </div>

      {/* Setup Section */}
      <section className="mb-12">
        <OrangeLabel text="/ SETUP" />
        <h2 className="text-xl font-bold text-white mt-2 mb-4">
          Connect Claude to Pacifica
        </h2>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-neutral-500/20 mb-4">
          {SETUP_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSetup(tab)}
              className={`px-4 py-2.5 text-sm font-mono transition-colors border-b-2 -mb-px ${
                activeSetup === tab
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

          <ol className="space-y-2 mb-4">
            {SETUP_CONTENT[activeSetup].steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-orange-500 font-mono font-bold shrink-0">
                  {i + 1}.
                </span>
                <span className="text-neutral-300">{step}</span>
              </li>
            ))}
          </ol>

          <div className="relative">
            <pre className="bg-black/50 border border-neutral-500/10 px-4 py-3 text-sm font-mono text-neutral-300 overflow-x-auto">
              {SETUP_CONTENT[activeSetup].config}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={SETUP_CONTENT[activeSetup].config} />
            </div>
          </div>
        </div>
      </section>

      {/* 23 Tools badge */}
      <div className="flex items-center gap-4 mb-8 p-4 bg-[#111111] border border-neutral-500/10">
        <span className="text-2xl font-bold text-orange-500 font-mono">23</span>
        <div>
          <p className="text-white text-sm font-semibold">MCP Tools Available</p>
          <p className="text-neutral-500 text-[11px] font-mono">
            8 read + 2 analytics + 2 funding + 4 write + 7 pattern
          </p>
        </div>
      </div>

      {/* Category Grid */}
      <section className="mb-8">
        <OrangeLabel text="/ WHAT YOU CAN SAY" />
        <h2 className="text-xl font-bold text-white mt-2 mb-6">
          Example prompts by category
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setActiveCategory(activeCategory === cat.id ? null : cat.id)
              }
              className={`flex items-center gap-2 px-3 py-2.5 text-left text-sm font-mono border transition-all ${
                activeCategory === cat.id
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : activeCategory === null
                  ? "border-neutral-500/15 text-neutral-400 hover:text-white hover:border-neutral-500/30"
                  : "border-neutral-500/10 text-neutral-600"
              }`}
            >
              <Icon name={cat.icon} />
              <span className="truncate text-[11px]">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Prompts */}
      <div className="space-y-6">
        {CATEGORIES.filter(
          (cat) => activeCategory === null || activeCategory === cat.id,
        ).map((cat) => (
          <section key={cat.id}>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-orange-500">
                <Icon name={cat.icon} />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">{cat.label}</h3>
                <p className="text-neutral-600 text-[11px] font-mono">
                  {cat.description}
                </p>
              </div>
              <span className="ml-auto text-[10px] font-mono text-neutral-600 bg-neutral-800/50 px-2 py-0.5 border border-neutral-700/30">
                {cat.prompts.length}
              </span>
            </div>

            <div className="border border-neutral-500/10 divide-y divide-neutral-500/10 bg-[#0D0D0D]">
              {cat.prompts.map((p, i) => (
                <PromptRow key={i} prompt={p} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Pro tip */}
      <div className="mt-12 p-5 bg-[#111111] border border-orange-500/20 relative">
        <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
        <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

        <p className="text-orange-400 text-sm font-semibold mb-2">Pro tip</p>
        <p className="text-neutral-400 text-sm">
          You don&apos;t need to memorize tool names. Just talk naturally &mdash;
          Claude figures out which tools to call. The more context you give
          (&ldquo;I want to long BTC with tight risk management&rdquo;), the
          better Claude&apos;s tool selection becomes.
        </p>
      </div>

      {/* Bottom nav */}
      <div className="mt-10 flex gap-3">
        <Link
          href="/patterns"
          className="text-sm text-neutral-500 hover:text-orange-400 font-mono transition-colors"
        >
          Pattern Library
        </Link>
        <span className="text-neutral-700">/</span>
        <Link
          href="/simulate"
          className="text-sm text-neutral-500 hover:text-orange-400 font-mono transition-colors"
        >
          Simulate
        </Link>
        <span className="text-neutral-700">/</span>
        <a
          href="https://github.com/Weminal-labs/pacifica_cli"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-500 hover:text-orange-400 font-mono transition-colors"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
