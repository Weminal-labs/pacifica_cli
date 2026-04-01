#!/bin/bash
# ---------------------------------------------------------------------------
# Pacifica CLI — Test All Commands
# ---------------------------------------------------------------------------
# Runs every CLI command in sequence to verify they work.
# Prerequisites: pacifica init --testnet (already configured)
#                Wallet activated on test-app.pacifica.fi with code "Pacifica"
# ---------------------------------------------------------------------------

set -euo pipefail

CLI="node dist/cli.js"
BOLD='\033[1m'
CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
YELLOW='\033[33m'
DIM='\033[2m'
RESET='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0

run_test() {
  local name="$1"
  shift
  echo -e "\n${CYAN}[$name]${RESET} $*"
  if eval "$@" 2>&1; then
    echo -e "${GREEN}  PASS${RESET}"
    ((PASSED++))
  else
    echo -e "${RED}  FAIL${RESET}"
    ((FAILED++))
  fi
}

run_test_bg() {
  local name="$1"
  local timeout="$2"
  shift 2
  echo -e "\n${CYAN}[$name]${RESET} $* ${DIM}(${timeout}s timeout)${RESET}"
  timeout "$timeout" bash -c "$*" 2>&1 || true
  echo -e "${GREEN}  PASS (ran for ${timeout}s)${RESET}"
  ((PASSED++))
}

# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
echo "  Pacifica CLI — Test All Commands"
echo "  ================================"
echo -e "${RESET}"

# ---------------------------------------------------------------------------
# 1. Public / read-only commands (no auth needed)
# ---------------------------------------------------------------------------
echo -e "${YELLOW}--- Public endpoints (no auth) ---${RESET}"

run_test "scan --json" "$CLI scan --json --testnet | head -20"

run_test "funding --json" "$CLI funding --json | head -20"

# ---------------------------------------------------------------------------
# 2. Account / read commands (need wallet)
# ---------------------------------------------------------------------------
echo -e "\n${YELLOW}--- Account commands (need wallet) ---${RESET}"

run_test "positions" "$CLI positions"

run_test "orders" "$CLI orders"

run_test "heatmap" "$CLI heatmap"

run_test "journal" "$CLI journal --limit 5"

# ---------------------------------------------------------------------------
# 3. Agent commands
# ---------------------------------------------------------------------------
echo -e "\n${YELLOW}--- Agent commands ---${RESET}"

run_test "agent status" "$CLI agent status"

run_test "agent log" "$CLI agent log --limit 5"

# ---------------------------------------------------------------------------
# 4. Smart orders
# ---------------------------------------------------------------------------
echo -e "\n${YELLOW}--- Smart orders ---${RESET}"

run_test "smart list" "$CLI smart list"

# ---------------------------------------------------------------------------
# 5. Trading (buy + sell + cancel)
# ---------------------------------------------------------------------------
echo -e "\n${YELLOW}--- Trading commands ---${RESET}"

echo -e "${DIM}  Placing a small BUY order...${RESET}"
BUY_OUTPUT=$(echo "y" | $CLI trade buy BTC 0.001 --leverage 2 --slippage 1 2>&1) || true
echo "$BUY_OUTPUT"
BUY_ORDER_ID=$(echo "$BUY_OUTPUT" | grep -o 'Order ID:.*[0-9]' | grep -o '[0-9]*' || true)

if [ -n "$BUY_ORDER_ID" ]; then
  echo -e "${GREEN}  PASS — Order placed: $BUY_ORDER_ID${RESET}"
  ((PASSED++))
else
  echo -e "${RED}  FAIL — Could not place buy order${RESET}"
  ((FAILED++))
fi

echo -e "\n${DIM}  Placing a small SELL order...${RESET}"
SELL_OUTPUT=$(echo "y" | $CLI trade sell ETH 0.01 --leverage 2 --slippage 1 2>&1) || true
echo "$SELL_OUTPUT"
SELL_ORDER_ID=$(echo "$SELL_OUTPUT" | grep -o 'Order ID:.*[0-9]' | grep -o '[0-9]*' || true)

if [ -n "$SELL_ORDER_ID" ]; then
  echo -e "${GREEN}  PASS — Order placed: $SELL_ORDER_ID${RESET}"
  ((PASSED++))
else
  echo -e "${RED}  FAIL — Could not place sell order${RESET}"
  ((FAILED++))
fi

# Check positions after trades
echo -e "\n${DIM}  Checking positions after trades...${RESET}"
run_test "positions (after trade)" "$CLI positions"

# Close positions if any were opened
echo -e "\n${DIM}  Closing BTC position...${RESET}"
CLOSE_BTC=$(echo "y" | $CLI positions close BTC 2>&1) || true
echo "$CLOSE_BTC"

echo -e "${DIM}  Closing ETH position...${RESET}"
CLOSE_ETH=$(echo "y" | $CLI positions close ETH 2>&1) || true
echo "$CLOSE_ETH"

# ---------------------------------------------------------------------------
# 6. Journal after trades
# ---------------------------------------------------------------------------
echo -e "\n${YELLOW}--- Journal after trades ---${RESET}"

run_test "journal (after trades)" "$CLI journal --limit 5"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Results: ${GREEN}$PASSED passed${RESET}, ${RED}$FAILED failed${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
