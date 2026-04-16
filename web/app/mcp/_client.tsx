"use client";

import { useState } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * Status indicates what a prompt needs to work:
 *  - ready:     Works immediately after MCP is connected (no setup)
 *  - account:   Needs `pacifica init --testnet` (account configured)
 *  - positions: Needs open positions (or will return empty)
 *  - patterns:  Needs patterns in ~/.pacifica/patterns/ (auto-seeded by init)
 *  - journal:   Needs pattern-tagged journal entries (seed or place tagged trades)
 *  - order:     Places a REAL order on the testnet — costs testnet USDC
 *  - multi:     Multi-step workflow (Claude chains multiple tools)
 */
type Status = "ready" | "account" | "positions" | "patterns" | "journal" | "order" | "multi";

interface Prompt {
  text: string;
  tool: string;
  status: Status;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompts: Prompt[];
}

const STATUS_META: Record<Status, { label: string; color: string; desc: string }> = {
  ready:     { label: "READY",     color: "text-green-400 border-green-400/40 bg-green-400/10",   desc: "Works instantly" },
  account:   { label: "ACCOUNT",   color: "text-blue-400 border-blue-400/40 bg-blue-400/10",      desc: "Needs `pacifica init`" },
  positions: { label: "POSITIONS", color: "text-cyan-400 border-cyan-400/40 bg-cyan-400/10",      desc: "Needs open positions" },
  patterns:  { label: "PATTERNS",  color: "text-orange-400 border-orange-400/40 bg-orange-400/10",desc: "Patterns auto-seeded by init" },
  journal:   { label: "JOURNAL",   color: "text-purple-400 border-purple-400/40 bg-purple-400/10",desc: "Needs pattern-tagged trades" },
  order:     { label: "PLACES ORDER", color: "text-red-400 border-red-400/40 bg-red-400/10",      desc: "Will place a REAL testnet order" },
  multi:     { label: "MULTI-STEP",color: "text-amber-400 border-amber-400/40 bg-amber-400/10",   desc: "Chains multiple tools" },
};

const CATEGORIES: Category[] = [
  {
    id: "markets",
    label: "Markets & Prices",
    icon: "chart",
    description: "Real-time market data, prices, order books, and volume.",
    prompts: [
      { text: "Show me all markets", tool: "pacifica_get_markets", status: "ready" },
      { text: "What's the BTC price right now?", tool: "pacifica_get_ticker", status: "ready" },
      { text: "How's ETH doing?", tool: "pacifica_get_ticker", status: "ready" },
      { text: "Show me the SOL order book", tool: "pacifica_get_orderbook", status: "ready" },
      { text: "What's the spread on BTC?", tool: "pacifica_get_orderbook", status: "ready" },
      { text: "Which markets have the highest volume?", tool: "pacifica_get_markets", status: "ready" },
      { text: "Find me markets with negative funding", tool: "pacifica_get_markets", status: "ready" },
    ],
  },
  {
    id: "funding",
    label: "Funding Rates",
    icon: "percent",
    description: "Funding rates, APR calculations, and historical data.",
    prompts: [
      { text: "Show funding rates", tool: "pacifica_funding_rates", status: "ready" },
      { text: "Which coins pay you to hold long?", tool: "pacifica_funding_rates", status: "ready" },
      { text: "What's the funding APR on BTC?", tool: "pacifica_funding_rates", status: "ready" },
      { text: "Show me BTC funding history", tool: "pacifica_funding_history", status: "ready" },
      { text: "Has ETH funding been negative this week?", tool: "pacifica_funding_history", status: "ready" },
    ],
  },
  {
    id: "account",
    label: "Account & Positions",
    icon: "wallet",
    description: "Balance, positions, P&L, orders, and trade history.",
    prompts: [
      { text: "Show my account balance", tool: "pacifica_get_account", status: "account" },
      { text: "How much margin am I using?", tool: "pacifica_get_account", status: "account" },
      { text: "What are my positions?", tool: "pacifica_get_positions", status: "positions" },
      { text: "Am I in profit?", tool: "pacifica_get_positions", status: "positions" },
      { text: "Do I have any open orders?", tool: "pacifica_get_orders", status: "account" },
      { text: "Show my overall P&L summary", tool: "pacifica_pnl_summary", status: "account" },
      { text: "Show my win rate from Pacifica history", tool: "pacifica_pnl_summary", status: "account" },
      { text: "Show my recent trades", tool: "pacifica_trade_journal", status: "account" },
      { text: "Show my ETH trade history", tool: "pacifica_trade_journal", status: "account" },
    ],
  },
  {
    id: "trading",
    label: "Place Trades",
    icon: "zap",
    description: "Market orders, limit orders, leverage, and TP/SL. Uses real testnet USDC.",
    prompts: [
      { text: "Buy 0.01 BTC with 3x leverage", tool: "pacifica_place_order", status: "order" },
      { text: "Long 0.5 SOL with 3x leverage", tool: "pacifica_place_order", status: "order" },
      { text: "Short 100 WIF at 5x", tool: "pacifica_place_order", status: "order" },
      { text: "Buy 0.01 BTC with TP at 80000 and SL at 70000", tool: "pacifica_place_order", status: "order" },
      { text: "Place a limit buy on ETH 0.1 at $2,300", tool: "pacifica_place_order", status: "order" },
    ],
  },
  {
    id: "manage",
    label: "Manage Positions",
    icon: "settings",
    description: "Close positions, set TP/SL, cancel orders.",
    prompts: [
      { text: "Close my BTC position", tool: "pacifica_close_position", status: "positions" },
      { text: "Close my SOL position", tool: "pacifica_close_position", status: "positions" },
      { text: "Set take profit on my ETH long at $2,500", tool: "pacifica_set_tpsl", status: "positions" },
      { text: "Put a stop loss on BTC at $70,000", tool: "pacifica_set_tpsl", status: "positions" },
      { text: "Cancel order 308830202", tool: "pacifica_cancel_order", status: "account" },
    ],
  },
  {
    id: "patterns-browse",
    label: "Browse & Create Patterns",
    icon: "code",
    description: "List, inspect, and author YAML trading patterns.",
    prompts: [
      { text: "List my patterns", tool: "pacifica_list_patterns", status: "patterns" },
      { text: "Show me the funding-carry-btc pattern", tool: "pacifica_get_pattern", status: "patterns" },
      { text: "Show me the price-breakout-btc pattern", tool: "pacifica_get_pattern", status: "patterns" },
      { text: "What patterns do I have?", tool: "pacifica_list_patterns", status: "patterns" },
      { text: "Write me a pattern that longs BTC when funding is deeply negative, call it my-carry-btc", tool: "pacifica_save_pattern", status: "ready" },
      { text: "Create a pattern called my-breakout that longs BTC when price breaks above 75000 with 3x leverage", tool: "pacifica_save_pattern", status: "ready" },
      { text: "Save a pattern that shorts ETH when momentum is above 0.7, 2x leverage, call it overbought-eth", tool: "pacifica_save_pattern", status: "ready" },
    ],
  },
  {
    id: "patterns-test",
    label: "Test & Run Patterns",
    icon: "play",
    description: "Evaluate patterns live, simulate entries, and backtest against history.",
    prompts: [
      { text: "Does my funding-carry-btc pattern match right now?", tool: "pacifica_run_pattern", status: "patterns" },
      { text: "Run my price-breakout-btc pattern against the current market", tool: "pacifica_run_pattern", status: "patterns" },
      { text: "Check if any of my patterns are triggering", tool: "pacifica_run_pattern", status: "patterns" },
      { text: "Simulate my funding-carry-btc pattern", tool: "pacifica_simulate_pattern", status: "patterns" },
      { text: "What would happen if I entered with my price-breakout-btc pattern?", tool: "pacifica_simulate_pattern", status: "patterns" },
      { text: "Backtest price-breakout-btc over 30 days", tool: "pacifica_backtest_pattern", status: "patterns" },
      { text: "How did my price-breakout-btc pattern perform over the last 60 days?", tool: "pacifica_backtest_pattern", status: "patterns" },
      { text: "Backtest all my price-based patterns and compare win rates", tool: "pacifica_backtest_pattern", status: "multi" },
    ],
  },
  {
    id: "patterns-stats",
    label: "Pattern Performance",
    icon: "bar-chart",
    description: "Track win rates and P&L per pattern over time.",
    prompts: [
      { text: "How is my funding-carry-btc pattern performing?", tool: "pacifica_journal_pattern_stats", status: "journal" },
      { text: "Show me win rate per pattern", tool: "pacifica_journal_pattern_stats", status: "journal" },
      { text: "Which pattern makes me the most money?", tool: "pacifica_journal_pattern_stats", status: "journal" },
    ],
  },
  {
    id: "agent",
    label: "Agent & Safety",
    icon: "shield",
    description: "Guardrails, spending limits, and audit trail.",
    prompts: [
      { text: "What are my guardrail settings?", tool: "pacifica_agent_status", status: "account" },
      { text: "How much of my daily budget have I used?", tool: "pacifica_agent_status", status: "account" },
      { text: "Show me the agent audit log", tool: "pacifica_agent_log", status: "account" },
      { text: "What did the agent do today?", tool: "pacifica_agent_log", status: "account" },
    ],
  },
  {
    id: "workflows",
    label: "Multi-Step Workflows",
    icon: "layers",
    description: "Complex requests where Claude chains multiple tools automatically.",
    prompts: [
      { text: "Scan for opportunities and suggest a trade", tool: "multi", status: "multi" },
      { text: "Run all my patterns and tell me what's matching", tool: "multi", status: "multi" },
      { text: "I want to do a funding carry trade \u2014 find the best opportunity", tool: "multi", status: "multi" },
      { text: "Review my portfolio and suggest what to close", tool: "multi", status: "multi" },
      { text: "Write me a pattern, backtest it, and if it looks good, run it", tool: "multi", status: "multi" },
      { text: "Compare my BTC and ETH positions \u2014 which should I add to?", tool: "multi", status: "multi" },
      { text: "Create a conservative long pattern for SOL, test it over 30 days", tool: "multi", status: "multi" },
      { text: "What's the safest trade I can make right now based on funding?", tool: "multi", status: "multi" },
      { text: "Am I at risk of liquidation on any position?", tool: "multi", status: "multi" },
      { text: "Morning briefing \u2014 balance, positions, funding, pattern matches", tool: "multi", status: "multi" },
      { text: "End of day report \u2014 P&L, trades, agent activity", tool: "multi", status: "multi" },
      { text: "Help me build a pattern from scratch", tool: "multi", status: "multi" },
      { text: "Is it a good time to long BTC?", tool: "multi", status: "multi" },
    ],
  },
];

const SETUP_TABS = ["Claude Desktop", "claude.ai (Web)", "Claude Code", "Cursor"] as const;
type SetupTab = (typeof SETUP_TABS)[number];

interface SetupStep {
  text: string;
  link?: { url: string; label: string };
  code?: string;
}

const SETUP_CONTENT: Record<SetupTab, { steps: SetupStep[]; config: string; note?: string }> = {
  "Claude Desktop": {
    steps: [
      {
        text: "Download and install Claude Desktop",
        link: { url: "https://claude.ai/download", label: "claude.ai/download" },
      },
      {
        text: "Clone the Pacifica CLI repository",
        code: "git clone https://github.com/Weminal-labs/pacifica_cli.git && cd pacifica_cli && pnpm install",
      },
      {
        text: "Initialize your Pacifica account (you need a wallet from test-app.pacifica.fi with test USDC from the Faucet). This command also auto-seeds example patterns into ~/.pacifica/patterns/.",
        link: { url: "https://test-app.pacifica.fi", label: "test-app.pacifica.fi" },
        code: "npx tsx src/cli/index.ts init --testnet",
      },
      {
        text: "Open the Claude Desktop config file. On macOS:",
        code: "open ~/Library/Application\\ Support/Claude/claude_desktop_config.json",
      },
      {
        text: "Add the Pacifica MCP server config (see below). Replace the path with your actual clone location.",
      },
      {
        text: "Restart Claude Desktop (Cmd+Q, then reopen). Click the hammer icon \u2014 you should see 23 Pacifica tools.",
      },
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/YOUR_USERNAME/pacifica_cli/src/mcp/server.ts"
      ]
    }
  }
}`,
    note: "Replace /Users/YOUR_USERNAME/pacifica_cli with the actual path where you cloned the repo. Run 'pwd' in terminal inside the project folder to get it.",
  },
  "claude.ai (Web)": {
    steps: [
      {
        text: "Clone and set up the Pacifica CLI (same as Claude Desktop steps 2\u20133 above)",
        code: "git clone https://github.com/Weminal-labs/pacifica_cli.git && cd pacifica_cli && pnpm install\nnpx tsx src/cli/index.ts init --testnet",
      },
      {
        text: "Start the HTTP MCP server (runs on port 4243)",
        code: "npx tsx src/mcp/server-http.ts",
      },
      {
        text: "In a new terminal, expose it publicly with ngrok (free account required)",
        link: { url: "https://ngrok.com", label: "ngrok.com" },
        code: "ngrok http 4243",
      },
      {
        text: "Copy the ngrok URL (looks like https://xxxx-xx-xx.ngrok-free.app) and add /sse at the end",
      },
      {
        text: "Add the URL to your Claude Desktop config as a remote MCP server (see below)",
        code: "open ~/Library/Application\\ Support/Claude/claude_desktop_config.json",
      },
      {
        text: "Restart Claude Desktop. The tools now work through the tunnel \u2014 you can use them from any device.",
      },
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "url": "https://xxxx-xx-xx.ngrok-free.app/sse"
    }
  }
}`,
    note: "Replace the URL with your actual ngrok tunnel URL. The tunnel must be running for the connection to work. For persistent tunnels, use ngrok's paid plan or Cloudflare Tunnel (cloudflared tunnel --url http://localhost:4243).",
  },
  "Claude Code": {
    steps: [
      {
        text: "Install Claude Code (Anthropic's CLI for developers)",
        link: { url: "https://docs.anthropic.com/en/docs/claude-code", label: "docs.anthropic.com/claude-code" },
        code: "npm install -g @anthropic-ai/claude-code",
      },
      {
        text: "Clone the Pacifica CLI repository",
        code: "git clone https://github.com/Weminal-labs/pacifica_cli.git && cd pacifica_cli && pnpm install",
      },
      {
        text: "Initialize your Pacifica account",
        code: "npx tsx src/cli/index.ts init --testnet",
      },
      {
        text: "Start Claude Code inside the project \u2014 it auto-detects the MCP server from the repo config",
        code: "claude",
      },
    ],
    config: `# No config needed! Claude Code auto-detects
# the MCP server from this repository.
#
# Just cd into the project and run:
cd pacifica_cli
claude

# Then try: "What are my positions?"`,
  },
  Cursor: {
    steps: [
      {
        text: "Clone the Pacifica CLI and install dependencies",
        code: "git clone https://github.com/Weminal-labs/pacifica_cli.git && cd pacifica_cli && pnpm install",
      },
      {
        text: "Initialize your Pacifica account",
        link: { url: "https://test-app.pacifica.fi", label: "test-app.pacifica.fi" },
        code: "npx tsx src/cli/index.ts init --testnet",
      },
      {
        text: "Open the project folder in Cursor",
        code: "cursor .",
      },
      {
        text: "Create .cursor/mcp.json in the project root with the config below",
        code: "mkdir -p .cursor && nano .cursor/mcp.json",
      },
      {
        text: "Restart Cursor. The Pacifica tools will appear in the AI chat.",
      },
    ],
    config: `{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": [
        "tsx",
        "./src/mcp/server.ts"
      ]
    }
  }
}`,
    note: "Cursor runs the MCP server relative to the project root, so you can use ./src/mcp/server.ts instead of an absolute path.",
  },
};

// ---------------------------------------------------------------------------
// Icons
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

function StatusPill({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.desc}
      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border ${meta.color} shrink-0 tracking-wider`}
    >
      {meta.label}
    </span>
  );
}

function PromptRow({ prompt }: { prompt: Prompt }) {
  return (
    <div className="group flex items-center gap-3 py-2.5 px-3 hover:bg-white/[0.02] transition-colors">
      <span className="flex-1 text-sm text-neutral-300 font-mono">
        &ldquo;{prompt.text}&rdquo;
      </span>
      <StatusPill status={prompt.status} />
      <span className="hidden md:inline text-[10px] font-mono text-neutral-600 bg-neutral-800/50 px-2 py-0.5 border border-neutral-700/30 shrink-0">
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
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  const totalPrompts = CATEGORIES.reduce((s, c) => s + c.prompts.length, 0);

  // Filter prompts by status if a filter is active
  const filteredCategories = CATEGORIES.map((cat) => ({
    ...cat,
    prompts: statusFilter
      ? cat.prompts.filter((p) => p.status === statusFilter)
      : cat.prompts,
  })).filter((cat) => cat.prompts.length > 0);

  const shownCategories = filteredCategories.filter(
    (cat) => activeCategory === null || activeCategory === cat.id,
  );

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

      {/* Before You Start — prominent prerequisites */}
      <section className="mb-10 relative bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/30 p-5">
        <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
        <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

        <p className="text-orange-400 text-[11px] font-mono uppercase tracking-wider mb-2">
          / Before you start &mdash; 3 steps
        </p>
        <ol className="space-y-2 text-sm text-neutral-300">
          <li>
            <span className="text-orange-500 font-bold font-mono mr-2">1.</span>
            Go to{" "}
            <a
              href="https://test-app.pacifica.fi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 underline hover:text-orange-300"
            >
              test-app.pacifica.fi
            </a>
            , connect your Solana wallet, enter access code{" "}
            <code className="bg-black/40 px-1.5 py-0.5 text-orange-400 font-mono text-xs">
              Pacifica
            </code>
            , and use the Faucet to get test USDC.
          </li>
          <li>
            <span className="text-orange-500 font-bold font-mono mr-2">2.</span>
            Clone the repo and run the init wizard &mdash; this auto-seeds 9 example patterns into{" "}
            <code className="bg-black/40 px-1.5 py-0.5 text-orange-400 font-mono text-xs">
              ~/.pacifica/patterns/
            </code>
            .
          </li>
          <li>
            <span className="text-orange-500 font-bold font-mono mr-2">3.</span>
            Configure your Claude client (see the Setup section below) and
            restart it. The hammer icon should show 23 Pacifica tools.
          </li>
        </ol>
        <div className="mt-3 relative">
          <pre className="bg-black/60 border border-neutral-500/10 px-3 py-2 text-[12px] font-mono text-green-400/90 overflow-x-auto">
            git clone https://github.com/Weminal-labs/pacifica_cli.git{"\n"}cd pacifica_cli && pnpm install{"\n"}npx tsx src/cli/index.ts init --testnet
          </pre>
          <div className="absolute top-1 right-1">
            <CopyButton text="git clone https://github.com/Weminal-labs/pacifica_cli.git && cd pacifica_cli && pnpm install && npx tsx src/cli/index.ts init --testnet" />
          </div>
        </div>
      </section>

      {/* Setup Section */}
      <section className="mb-12">
        <OrangeLabel text="/ SETUP" />
        <h2 className="text-xl font-bold text-white mt-2 mb-4">
          Connect Claude to Pacifica
        </h2>

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

        <div className="relative bg-[#111111] border border-neutral-500/10 p-5">
          <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
          <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
          <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
          <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />

          <ol className="space-y-4 mb-5">
            {SETUP_CONTENT[activeSetup].steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-orange-500 font-mono font-bold shrink-0 mt-0.5">
                  {i + 1}.
                </span>
                <div className="flex-1 space-y-2">
                  <span className="text-neutral-300">{step.text}</span>
                  {step.link && (
                    <a
                      href={step.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-orange-400 hover:text-orange-300 underline underline-offset-2 text-sm font-mono"
                    >
                      {step.link.label} &rarr;
                    </a>
                  )}
                  {step.code && (
                    <div className="relative mt-1.5">
                      <pre className="bg-black/60 border border-neutral-500/10 px-3 py-2 text-[12px] font-mono text-green-400/90 overflow-x-auto whitespace-pre-wrap">
                        {step.code}
                      </pre>
                      <div className="absolute top-1 right-1">
                        <CopyButton text={step.code} />
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
            Config to add
          </p>
          <div className="relative">
            <pre className="bg-black/50 border border-neutral-500/10 px-4 py-3 text-sm font-mono text-neutral-300 overflow-x-auto">
              {SETUP_CONTENT[activeSetup].config}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={SETUP_CONTENT[activeSetup].config} />
            </div>
          </div>

          {SETUP_CONTENT[activeSetup].note && (
            <div className="mt-3 flex gap-2 text-[11px] font-mono text-neutral-500 bg-orange-500/5 border border-orange-500/10 px-3 py-2">
              <span className="text-orange-500 shrink-0">Note:</span>
              <span>{SETUP_CONTENT[activeSetup].note}</span>
            </div>
          )}
        </div>
      </section>

      {/* 23 Tools badge */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-[#111111] border border-neutral-500/10">
        <span className="text-2xl font-bold text-orange-500 font-mono">23</span>
        <div className="flex-1">
          <p className="text-white text-sm font-semibold">MCP Tools Available</p>
          <p className="text-neutral-500 text-[11px] font-mono">
            8 read + 2 analytics + 2 funding + 4 write + 7 pattern
          </p>
        </div>
      </div>

      {/* Status legend */}
      <div className="mb-6">
        <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
          / Prompt status legend &mdash; click to filter
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter(null)}
            className={`text-[10px] font-mono font-bold px-2 py-1 border tracking-wider transition-all ${
              statusFilter === null
                ? "border-white/40 bg-white/10 text-white"
                : "border-neutral-500/20 text-neutral-500 hover:text-white"
            }`}
          >
            ALL &middot; {totalPrompts}
          </button>
          {(Object.keys(STATUS_META) as Status[]).map((s) => {
            const count = CATEGORIES.reduce(
              (n, c) => n + c.prompts.filter((p) => p.status === s).length,
              0,
            );
            if (count === 0) return null;
            const meta = STATUS_META[s];
            return (
              <button
                key={s}
                title={meta.desc}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`text-[10px] font-mono font-bold px-2 py-1 border tracking-wider transition-all ${
                  statusFilter === s ? meta.color : "border-neutral-500/20 text-neutral-500 hover:text-white"
                }`}
              >
                {meta.label} &middot; {count}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Grid */}
      <section className="mb-6">
        <OrangeLabel text="/ WHAT YOU CAN SAY" />
        <h2 className="text-xl font-bold text-white mt-2 mb-4">
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
        {shownCategories.map((cat) => (
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

        {shownCategories.length === 0 && (
          <div className="p-8 text-center border border-neutral-500/10 bg-[#0D0D0D]">
            <p className="text-neutral-500 font-mono text-sm">
              No prompts match this filter.
            </p>
          </div>
        )}
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
          Claude figures out which tools to call. Start with{" "}
          <span className="text-green-400 font-mono font-bold">READY</span>{" "}
          prompts (work instantly), then place a trade to unlock{" "}
          <span className="text-cyan-400 font-mono font-bold">POSITIONS</span>{" "}
          prompts.
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
