"use client";

// ---------------------------------------------------------------------------
// Pacifica Intelligence — CLI Install & Usage Guide
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { OrangeLabel } from "../../components/ui/OrangeLabel";

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] font-mono text-neutral-500 hover:text-orange-500 transition-colors px-2 py-0.5 border border-neutral-500/20 hover:border-orange-500/40"
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

function CodeBlock({ children, label, copy }: { children: string; label?: string; copy?: string }) {
  return (
    <div className="relative bg-[#0D0D0D] border border-neutral-500/15 rounded-sm overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-500/10 bg-[#111111]">
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">{label}</span>
          {copy !== undefined && <CopyBtn text={copy ?? children} />}
        </div>
      )}
      <pre className="p-4 text-sm font-mono text-neutral-300 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step number
// ---------------------------------------------------------------------------

function StepNum({ n }: { n: number }) {
  return (
    <div className="flex-shrink-0 w-8 h-8 rounded-full border border-orange-500/40 bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold text-sm font-mono">
      {n}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature card
// ---------------------------------------------------------------------------

function FeatureCard({ icon, title, desc, commands }: {
  icon: string; title: string; desc: string; commands: string[];
}) {
  return (
    <div className="relative bg-[#111111] border border-neutral-500/20 p-5 hover:border-orange-500/30 transition-colors">
      <span className="absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-orange-500/50" />
      <span className="absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-orange-500/50" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-orange-500/50" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 border-b border-r border-orange-500/50" />
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
      <p className="text-neutral-500 text-[12px] mb-3">{desc}</p>
      <div className="space-y-1">
        {commands.map((cmd) => (
          <div key={cmd} className="text-[11px] font-mono text-orange-400/80 bg-[#0A0A0A] px-2 py-0.5 border border-neutral-500/10">
            {cmd}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command section
// ---------------------------------------------------------------------------

function CmdSection({ title, lines }: { title: string; lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div>
      <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">{title}</p>
      <CodeBlock copy={text}>{text}</CodeBlock>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InstallPage() {
  return (
    <div className="px-6 py-12 pb-24 max-w-5xl">

      {/* ── Hero ── */}
      <div className="mb-14">
        <OrangeLabel text="/ GET THE CLI" />
        <h1 className="text-4xl font-bold text-white mt-3 mb-3 leading-tight">
          Pacifica CLI
          <span className="text-neutral-600 font-normal text-2xl ml-3">v0.1.0</span>
        </h1>
        <p className="text-neutral-400 text-base mb-2 max-w-xl">
          Agent-native trading terminal for Pacifica DEX. Terminal UI, MCP server for AI agents, and the intelligence layer powering this dashboard.
        </p>
        <p className="text-neutral-600 text-sm font-mono">
          One codebase · Three interfaces · Built for traders and AI agents
        </p>

        {/* Install hero command */}
        <div className="mt-8 flex items-center gap-3 max-w-lg">
          <div className="flex-1 bg-[#111111] border border-neutral-500/20 px-4 py-3 font-mono text-orange-400 text-sm">
            $ npm install -g pacifica-cli
          </div>
          <CopyBtn text="npm install -g pacifica-cli" />
        </div>
        <p className="text-[11px] font-mono text-neutral-600 mt-2">Requires Node.js ≥ 18</p>
      </div>

      {/* ── Vietnamese usage guide ── */}
      <div className="mb-14 border border-orange-500/20 bg-orange-500/5 p-6 rounded-sm">
        <p className="text-[10px] font-mono text-orange-500 uppercase tracking-widest mb-4">/ HƯỚNG DẪN SỬ DỤNG</p>

        <div className="space-y-6">
          {/* Install */}
          <div>
            <p className="text-white font-semibold text-sm mb-1">1. Cài đặt CLI</p>
            <p className="text-neutral-500 text-xs mb-2">Yêu cầu Node.js ≥ 18. Chạy lệnh sau để cài toàn cục:</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-[#0D0D0D] border border-neutral-500/20 px-4 py-2.5 font-mono text-orange-400 text-sm">
                npm install -g pacifica-cli
              </code>
              <CopyBtn text="npm install -g pacifica-cli" />
            </div>
          </div>

          {/* Init */}
          <div>
            <p className="text-white font-semibold text-sm mb-1">2. Khởi tạo cấu hình</p>
            <p className="text-neutral-500 text-xs mb-2">Chạy wizard để kết nối ví Solana và đặt giới hạn an toàn:</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-[#0D0D0D] border border-neutral-500/20 px-4 py-2.5 font-mono text-orange-400 text-sm">
                pacifica init --testnet
              </code>
              <CopyBtn text="pacifica init --testnet" />
            </div>
          </div>

          {/* MCP no-install */}
          <div>
            <p className="text-white font-semibold text-sm mb-1">3. Dùng làm MCP server cho AI (không cần cài đặt)</p>
            <p className="text-neutral-500 text-xs mb-2">
              Cho Claude Desktop, Cursor, hoặc bất kỳ AI host nào hỗ trợ MCP — không cần cài trước:
            </p>
            <div className="flex items-center gap-3 mb-3">
              <code className="flex-1 bg-[#0D0D0D] border border-neutral-500/20 px-4 py-2.5 font-mono text-orange-400 text-sm">
                npx -y pacifica-cli --mcp
              </code>
              <CopyBtn text="npx -y pacifica-cli --mcp" />
            </div>
            <p className="text-neutral-500 text-xs mb-2">
              Thêm vào file config của Claude Desktop hoặc Cursor (<code className="text-neutral-400">claude_desktop_config.json</code>):
            </p>
            <div className="relative">
              <CodeBlock
                label="claude_desktop_config.json"
                copy={`{\n  "mcpServers": {\n    "pacifica": {\n      "command": "npx",\n      "args": ["-y", "pacifica-cli", "--mcp"]\n    }\n  }\n}`}
              >{`{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["-y", "pacifica-cli", "--mcp"]
    }
  }
}`}</CodeBlock>
            </div>
          </div>

          {/* MCP path */}
          <div className="bg-[#0D0D0D] border border-neutral-500/15 p-4 text-xs font-mono text-neutral-500">
            <p className="text-orange-400 mb-1"># Đường dẫn file config</p>
            <p>macOS: <span className="text-neutral-300">~/Library/Application Support/Claude/claude_desktop_config.json</span></p>
            <p>Windows: <span className="text-neutral-300">%APPDATA%\Claude\claude_desktop_config.json</span></p>
            <p>Cursor: <span className="text-neutral-300">Cursor Settings → MCP → Add new global MCP server</span></p>
          </div>
        </div>
      </div>

      {/* ── Feature cards ── */}
      <div className="mb-14">
        <OrangeLabel text="/ WHAT YOU GET" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <FeatureCard
            icon="⚡"
            title="Terminal UI"
            desc="Rich live market feed, positions, P&L, heatmap — all in your terminal."
            commands={["pacifica scan", "pacifica positions", "pacifica heatmap"]}
          />
          <FeatureCard
            icon="🤖"
            title="MCP for AI Agents"
            desc="28 tools that give Claude, Cursor, or any MCP host full trading access."
            commands={["pacifica-mcp", "place_order tool", "get_positions tool"]}
          />
          <FeatureCard
            icon="🧠"
            title="Intelligence Layer"
            desc="Pattern detection, reputation scoring, and funding arb — feeds this dashboard."
            commands={["pacifica intelligence serve", "pacifica patterns", "pacifica arb start"]}
          />
          <FeatureCard
            icon="📊"
            title="Paper Trading"
            desc="Practice with real Pacifica mark prices, zero risk. Full P&L history."
            commands={["pacifica paper init", "pacifica paper buy ETH 0.1", "pacifica paper positions"]}
          />
        </div>
      </div>

      {/* ── Quick start ── */}
      <div className="mb-14">
        <OrangeLabel text="/ QUICK START" />
        <div className="mt-5 space-y-8">

          {/* Step 1 */}
          <div className="flex gap-4">
            <StepNum n={1} />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Activate your wallet on Pacifica testnet</h3>
              <p className="text-neutral-500 text-sm mb-3">
                Connect a Solana wallet, enter access code <code className="text-orange-400 bg-[#111] px-1">Pacifica</code>, and mint test USDC from the faucet.
              </p>
              <a
                href="https://test-app.pacifica.fi"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-mono text-orange-500 border border-orange-500/30 px-3 py-1.5 hover:bg-orange-500/10 transition-colors"
              >
                Open test-app.pacifica.fi →
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <StepNum n={2} />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Install and configure</h3>
              <p className="text-neutral-500 text-sm mb-3">
                The <code className="text-orange-400 bg-[#111] px-1">init</code> wizard asks for your private key and sets safe defaults for leverage, slippage, and agent guardrails.
              </p>
              <CodeBlock
                label="terminal"
                copy={"npm install -g pacifica-cli\npacifica init --testnet"}
              >{`npm install -g pacifica-cli
pacifica init --testnet`}</CodeBlock>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <StepNum n={3} />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Start trading</h3>
              <CodeBlock
                label="terminal"
                copy={"pacifica scan\npacifica trade buy ETH 0.5 --leverage 5\npacifica positions\npacifica journal"}
              >{`pacifica scan                           # live market feed
pacifica trade buy ETH 0.5 --leverage 5  # market order
pacifica positions                        # open positions + PnL
pacifica journal                          # trade history`}</CodeBlock>
            </div>
          </div>

          {/* Step 4 — Intelligence */}
          <div className="flex gap-4">
            <StepNum n={4} />
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">Start the intelligence engine</h3>
              <p className="text-neutral-500 text-sm mb-3">
                Runs in the background, detects patterns, builds reputation scores, and powers the dashboard at <Link href="/" className="text-orange-500 hover:underline">this URL</Link>.
              </p>
              <CodeBlock
                label="terminal"
                copy={"pacifica intelligence serve\npacifica intelligence status\npacifica intelligence patterns"}
              >{`pacifica intelligence serve     # background intelligence server
pacifica intelligence status    # pattern count, records, uptime
pacifica intelligence patterns  # verified patterns with win rates`}</CodeBlock>
            </div>
          </div>
        </div>
      </div>

      {/* ── Command reference ── */}
      <div className="mb-14">
        <OrangeLabel text="/ COMMAND REFERENCE" />
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">

          <CmdSection title="Markets" lines={[
            "pacifica scan                      # live prices, OI, funding",
            "pacifica scan --gainers            # top movers up",
            "pacifica scan --losers             # top movers down",
            "pacifica funding                   # funding rates by APR",
          ]} />

          <CmdSection title="Trading" lines={[
            "pacifica trade buy  ETH 0.5 --leverage 5",
            "pacifica trade sell BTC 0.1 --leverage 3 --tp 90000 --sl 80000",
            "pacifica trade buy  SOL 1.0 --validate    # dry-run preview",
            "pacifica trade buy  ETH 0.5 --cancel-after 300  # dead-man switch",
          ]} />

          <CmdSection title="Orders & Positions" lines={[
            "pacifica orders                    # list open orders",
            "pacifica orders cancel <id>        # cancel one",
            "pacifica orders cancel-all         # cancel everything",
            "pacifica positions                 # live P&L",
            "pacifica positions close ETH       # close at market",
          ]} />

          <CmdSection title="Intelligence" lines={[
            "pacifica intelligence serve        # start background server",
            "pacifica intelligence patterns     # verified signal patterns",
            "pacifica intelligence feed         # live signal feed",
            "pacifica arb start                 # funding arb bot",
            "pacifica arb status                # arb positions + APR",
          ]} />

          <CmdSection title="Paper Trading (zero risk)" lines={[
            "pacifica paper init --balance 10000",
            "pacifica paper buy ETH 0.1 --leverage 5",
            "pacifica paper positions",
            "pacifica paper history",
            "pacifica paper reset",
          ]} />

          <CmdSection title="Stream (NDJSON for agents)" lines={[
            "pacifica stream prices --symbol ETH   # tick-by-tick prices",
            "pacifica stream positions              # live position stream",
            "pacifica stream funding --interval 5000",
            "pacifica stream prices | jq '.mark_price'",
          ]} />

          <CmdSection title="Intent (natural language)" lines={[
            `pacifica intent "buy 0.1 ETH with 5x leverage"`,
            `pacifica intent "short SOL at 150 10x sl 140 tp 175"`,
            `pacifica intent "close my BTC position"`,
            `pacifica intent "buy 0.1 ETH 5x" --execute`,
          ]} />

          <CmdSection title="Audit & Safety" lines={[
            "pacifica audit tail                # last 20 actions",
            "pacifica audit verify              # verify chain integrity",
            "pacifica agent status              # guardrails + budget",
            "pacifica agent stop                # disable agent trading",
          ]} />

        </div>
      </div>

      {/* ── MCP config ── */}
      <div className="mb-14">
        <OrangeLabel text="/ AI AGENT SETUP (MCP)" />
        <p className="text-neutral-400 text-sm mt-3 mb-4 max-w-xl">
          Give Claude Desktop, Cursor, or any MCP-compatible AI full Pacifica trading access with 28 tools and built-in guardrails.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CodeBlock
            label="claude_desktop_config.json"
            copy={`{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["-y", "pacifica-cli", "--mcp"]
    }
  }
}`}
          >{`{
  "mcpServers": {
    "pacifica": {
      "command": "npx",
      "args": ["-y", "pacifica-cli", "--mcp"]
    }
  }
}`}</CodeBlock>

          <div className="space-y-3">
            <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Available MCP tools (28)</p>
            {[
              { cat: "Read (10)", tools: "get_markets · get_ticker · get_orderbook · get_positions · get_account · get_orders · get_order_history · get_trade_history · get_trades_stats · get_agent_status" },
              { cat: "Analytics (5)", tools: "get_funding_rates · analyze_risk · get_smart_orders · get_journal_stats · get_heatmap_data" },
              { cat: "Intelligence (5)", tools: "top_markets · liquidity_scan · trade_patterns · alert_triage · market_snapshot" },
              { cat: "Write (6)", tools: "place_order · close_position · cancel_order · set_position_tpsl · create_smart_order · cancel_smart_order" },
              { cat: "Funding (2)", tools: "get_funding_history · analyze_funding_arb" },
            ].map(({ cat, tools }) => (
              <div key={cat} className="bg-[#111111] border border-neutral-500/15 p-3">
                <p className="text-[10px] font-mono text-orange-500 mb-1">{cat}</p>
                <p className="text-[11px] font-mono text-neutral-500 leading-relaxed">{tools}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Safety guardrails note */}
        <div className="mt-6 bg-[#111111] border border-orange-500/20 p-4">
          <p className="text-[11px] font-mono text-orange-400 uppercase tracking-wider mb-2">⚠ Agent Safety</p>
          <p className="text-sm text-neutral-400">
            All write tools pass through guardrails: order size limit, leverage cap, daily spending budget, action whitelist, symbol restrictions, and time-window gates. Set{" "}
            <code className="text-orange-400 bg-[#0A0A0A] px-1">autonomy_level: 2</code> to require human confirmation before every trade.
          </p>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="border border-neutral-500/20 p-8 text-center relative">
        <span className="absolute top-0 left-0 h-2 w-2 border-t border-l border-orange-500" />
        <span className="absolute top-0 right-0 h-2 w-2 border-t border-r border-orange-500" />
        <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-orange-500" />
        <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-orange-500" />

        <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">/ already installed?</p>
        <h3 className="text-white font-bold text-xl mb-4">Explore the live intelligence dashboard</h3>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/" className="bg-orange-500 hover:bg-orange-400 text-black font-semibold px-5 py-2.5 text-sm transition-colors">
            View Signal Feed →
          </Link>
          <Link href="/patterns" className="border border-neutral-500/30 text-neutral-300 hover:text-white hover:border-neutral-500/60 font-semibold px-5 py-2.5 text-sm transition-colors">
            Browse Patterns
          </Link>
          <Link href="/simulate" className="border border-neutral-500/30 text-neutral-300 hover:text-white hover:border-neutral-500/60 font-semibold px-5 py-2.5 text-sm transition-colors">
            Try Simulator
          </Link>
        </div>
      </div>

    </div>
  );
}
