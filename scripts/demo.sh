#!/bin/bash
# ---------------------------------------------------------------------------
# Pacifica CLI Demo Script
# ---------------------------------------------------------------------------
# Run through each feature for the hackathon demo.
# Prerequisites: pacifica init --testnet (already configured)
# ---------------------------------------------------------------------------

set -e

BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
DIM='\033[2m'
RESET='\033[0m'

pause() {
  echo ""
  echo -e "${DIM}Press Enter to continue...${RESET}"
  read -r
}

section() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

# ---------------------------------------------------------------------------

clear
section "🚀 Pacifica CLI — Agent-Native Trading Terminal"
echo "  An MCP-powered CLI for Pacifica perpetual DEX"
echo "  Built for The Synthesis Hackathon"
pause

# ---------------------------------------------------------------------------

section "1️⃣  Initialization — 60-Second Onboarding"
echo -e "  ${DIM}pacifica init --testnet${RESET}"
echo ""
echo "  The init wizard walks through:"
echo "    • Network selection (testnet/mainnet)"
echo "    • Wallet private key import"
echo "    • Connection verification (REST + WebSocket)"
echo "    • Trading defaults (leverage, slippage, TP/SL)"
echo "    • Agent guardrails (daily limits, max order size)"
pause

# ---------------------------------------------------------------------------

section "2️⃣  Market Scanner — Live Prices"
echo -e "  ${DIM}Running: pacifica scan${RESET}"
echo ""
pacifica scan &
SCAN_PID=$!
sleep 5
kill $SCAN_PID 2>/dev/null || true
wait $SCAN_PID 2>/dev/null || true
pause

# ---------------------------------------------------------------------------

section "3️⃣  Trading — Place Orders"
echo -e "  ${DIM}pacifica trade buy SOL 1 --leverage 5 --tp 200 --sl 150${RESET}"
echo -e "  ${DIM}pacifica trade sell ETH 0.1 --type limit --price 4000${RESET}"
echo ""
echo "  Features:"
echo "    • Market and limit orders"
echo "    • Built-in TP/SL"
echo "    • Leverage override"
echo "    • Confirmation prompt"
pause

# ---------------------------------------------------------------------------

section "4️⃣  Position Management"
echo -e "  ${DIM}Running: pacifica positions${RESET}"
echo ""
pacifica positions 2>/dev/null || echo "  (No positions currently open)"
pause

echo -e "  ${DIM}Running: pacifica orders${RESET}"
echo ""
pacifica orders 2>/dev/null || echo "  (No open orders)"
pause

# ---------------------------------------------------------------------------

section "5️⃣  Risk Heatmap — Visual Risk Assessment"
echo -e "  ${DIM}Running: pacifica heatmap${RESET}"
echo ""
pacifica heatmap 2>/dev/null || echo "  (No positions to show)"
pause

# ---------------------------------------------------------------------------

section "6️⃣  Funding Rate Arbitrage Scanner"
echo -e "  ${DIM}Running: pacifica funding${RESET}"
echo ""
pacifica funding 2>/dev/null || echo "  (Fetching rates...)"
pause

echo -e "  ${DIM}Running: pacifica funding-arb${RESET}"
echo ""
pacifica funding-arb 2>/dev/null || echo "  (Comparing across exchanges...)"
pause

# ---------------------------------------------------------------------------

section "7️⃣  Smart Orders — Trailing Stop"
echo -e "  ${DIM}pacifica smart trailing BTC --distance 2${RESET}"
echo ""
echo "  Features:"
echo "    • Background polling (5s interval)"
echo "    • Tracks price extremes"
echo "    • Auto-closes position on trigger"
echo "    • State persisted to disk"
echo "    • Resumes on restart"
pause

# ---------------------------------------------------------------------------

section "8️⃣  Agent Guardrails — Safety First"
echo -e "  ${DIM}Running: pacifica agent status${RESET}"
echo ""
pacifica agent status 2>/dev/null || echo "  (Agent status)"
pause

# ---------------------------------------------------------------------------

section "9️⃣  PnL Journal — Trade History"
echo -e "  ${DIM}Running: pacifica journal${RESET}"
echo ""
pacifica journal 2>/dev/null || echo "  (No journal entries yet)"
pause

# ---------------------------------------------------------------------------

section "🤖 MCP Server — The Differentiator"
echo ""
echo "  15 tools exposed to AI agents via MCP:"
echo ""
echo "  ${GREEN}Read (8):${RESET}"
echo "    get_markets, get_ticker, get_orderbook,"
echo "    get_positions, get_account, get_orders,"
echo "    agent_status, agent_log"
echo ""
echo "  ${GREEN}Funding (3):${RESET}"
echo "    funding_rates, funding_arb_scan, funding_history"
echo ""
echo "  ${GREEN}Write (4):${RESET}"
echo "    place_order, cancel_order, close_position, set_tpsl"
echo ""
echo "  Every write tool passes through guardrails:"
echo "    ✓ Agent enabled check"
echo "    ✓ Action allowlist/blocklist"
echo "    ✓ Order size limit"
echo "    ✓ Leverage limit"
echo "    ✓ Daily spending cap"
echo "    ✓ Confirmation threshold"
echo ""
echo "  ${GREEN}Claude Code Skills (5):${RESET}"
echo "    /scan, /trade, /status, /funding, /risk"
pause

# ---------------------------------------------------------------------------

section "✅ Demo Complete"
echo ""
echo "  Pacifica CLI features:"
echo "    • 11 CLI commands"
echo "    • 15 MCP tools for AI agents"
echo "    • 6-step guardrail safety chain"
echo "    • Cross-exchange funding arb scanner"
echo "    • Smart order management (trailing stops)"
echo "    • Risk heatmap visualization"
echo "    • PnL journal with trade history"
echo "    • 5 Claude Code slash commands"
echo ""
echo -e "  ${BOLD}Built with Claude Code for The Synthesis Hackathon${RESET}"
echo ""
