// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- Paper Trading Command
// ---------------------------------------------------------------------------
// Practice trading with real Pacifica mark prices, zero risk.
// State persists in ~/.pacifica/paper-state.json.
//
// Usage:
//   pacifica paper init [--balance <usdc>]
//   pacifica paper balance
//   pacifica paper buy <symbol> <size> [--leverage <n>] [--price <n>]
//   pacifica paper sell <symbol> <size> [--leverage <n>] [--price <n>]
//   pacifica paper close <symbol>
//   pacifica paper positions
//   pacifica paper history
//   pacifica paper reset
// ---------------------------------------------------------------------------

import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { randomUUID } from "crypto";
import { theme, formatPrice, formatPnl, formatPercent, formatAmount, formatTimestamp } from "../theme.js";
import { writeSuccess, writeError, classifyError } from "../../output/envelope.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = join(homedir(), ".pacifica");
const STATE_PATH = join(STATE_DIR, "paper-state.json");
const MARKETS_URL = "https://test-api.pacifica.fi/api/v1/markets";
const DEFAULT_BALANCE = 10_000;

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

interface PaperPosition {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;              // base asset amount
  entry_price: number;
  leverage: number;
  margin: number;            // USDC locked
  liquidation_price: number;
  unrealized_pnl: number;
  funding_accrued: number;
  opened_at: string;
}

interface PaperOrder {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  price: number;
  leverage: number;
  created_at: string;
}

interface PaperTrade {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entry_price: number;
  exit_price?: number;
  leverage: number;
  realized_pnl?: number;
  opened_at: string;
  closed_at?: string;
  status: "open" | "closed" | "liquidated";
}

interface PaperState {
  balance: number;
  equity: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
  history: PaperTrade[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function loadState(): PaperState {
  if (!existsSync(STATE_PATH)) {
    throw new Error(
      "No paper trading account found. Run `pacifica paper init` to create one.",
    );
  }
  try {
    const raw = readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw) as PaperState;
  } catch {
    throw new Error(
      `Failed to read paper state at ${STATE_PATH}. The file may be corrupted.`,
    );
  }
}

function saveState(s: PaperState): void {
  s.updated_at = new Date().toISOString();
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

function freshState(balance: number): PaperState {
  const now = new Date().toISOString();
  return {
    balance,
    equity: balance,
    positions: [],
    orders: [],
    history: [],
    created_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Mark price fetching
// ---------------------------------------------------------------------------

interface MarketEntry {
  symbol: string;
  markPrice?: string;
  mark_price?: string;
}

interface MarketsResponse {
  data?: MarketEntry[];
}

async function getMarkPrice(symbol: string): Promise<number> {
  const fullSym = symbol.includes("-") ? symbol : `${symbol}-USDC-PERP`;
  const res = await fetch(MARKETS_URL);
  if (!res.ok) {
    throw new Error(`Markets API responded with HTTP ${res.status}`);
  }
  const json = (await res.json()) as MarketsResponse;
  const markets = json?.data ?? [];
  const m = markets.find(
    (x) => x.symbol === fullSym || x.symbol.startsWith(symbol),
  );
  if (!m) {
    throw new Error(`Market ${symbol} not found on Pacifica testnet`);
  }
  const price = parseFloat(String(m.markPrice ?? m.mark_price ?? "0"));
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid mark price returned for ${symbol}: ${m.markPrice ?? m.mark_price}`);
  }
  return price;
}

// Fetch mark prices for multiple symbols in one API call.
async function getMarkPrices(symbols: string[]): Promise<Map<string, number>> {
  if (symbols.length === 0) return new Map();
  const res = await fetch(MARKETS_URL);
  if (!res.ok) {
    throw new Error(`Markets API responded with HTTP ${res.status}`);
  }
  const json = (await res.json()) as MarketsResponse;
  const markets = json?.data ?? [];
  const priceMap = new Map<string, number>();
  for (const sym of symbols) {
    const fullSym = sym.includes("-") ? sym : `${sym}-USDC-PERP`;
    const m = markets.find(
      (x) => x.symbol === fullSym || x.symbol.startsWith(sym),
    );
    if (m) {
      const price = parseFloat(String(m.markPrice ?? m.mark_price ?? "0"));
      if (Number.isFinite(price) && price > 0) {
        priceMap.set(sym, price);
      }
    }
  }
  return priceMap;
}

// ---------------------------------------------------------------------------
// Liquidation price math
// ---------------------------------------------------------------------------

function computeLiquidationPrice(
  side: "long" | "short",
  entryPrice: number,
  leverage: number,
): number {
  if (side === "long") {
    return entryPrice * (1 - (1 / leverage) * 0.9);
  }
  return entryPrice * (1 + (1 / leverage) * 0.9);
}

// ---------------------------------------------------------------------------
// Unrealized PnL
// ---------------------------------------------------------------------------

function computeUnrealizedPnl(pos: PaperPosition, markPrice: number): number {
  if (pos.side === "long") {
    return (markPrice - pos.entry_price) * pos.size;
  }
  return (pos.entry_price - markPrice) * pos.size;
}

// ---------------------------------------------------------------------------
// ANSI-safe column padding helpers
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function padR(s: string, w: number): string {
  const extra = w - stripAnsi(s).length;
  return extra > 0 ? s + " ".repeat(extra) : s;
}

// ---------------------------------------------------------------------------
// Subcommand: init
// ---------------------------------------------------------------------------

async function cmdInit(opts: { balance?: number }, jsonMode: boolean): Promise<void> {
  const balance = opts.balance ?? DEFAULT_BALANCE;

  if (!Number.isFinite(balance) || balance <= 0) {
    writeError(
      { ok: false, error: "validation", message: "Balance must be a positive number." },
      jsonMode,
    );
    return;
  }

  if (existsSync(STATE_PATH)) {
    const overwrite = await confirm({
      message: "A paper account already exists. Overwrite it?",
      default: false,
    });
    if (!overwrite) {
      console.log(theme.muted("Cancelled."));
      return;
    }
  }

  const state = freshState(balance);
  saveState(state);

  if (jsonMode) {
    writeSuccess({ balance, created_at: state.created_at }, jsonMode);
    return;
  }

  console.log();
  console.log(theme.success("  Paper account created"));
  console.log(theme.muted("  ─────────────────────────────────"));
  console.log(`  ${theme.label("Starting balance:")}  ${formatPrice(balance)} USDC`);
  console.log(`  ${theme.label("State file:")}        ${STATE_PATH}`);
  console.log();
  console.log(theme.muted("  Use `pacifica paper buy <symbol> <size>` to open your first trade."));
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: balance
// ---------------------------------------------------------------------------

async function cmdBalance(jsonMode: boolean): Promise<void> {
  const state = loadState();

  // Refresh unrealized PnL from mark prices
  let totalUnrealized = 0;
  if (state.positions.length > 0) {
    const symbols = [...new Set(state.positions.map((p) => p.symbol))];
    const prices = await getMarkPrices(symbols);
    for (const pos of state.positions) {
      const mark = prices.get(pos.symbol) ?? pos.entry_price;
      pos.unrealized_pnl = computeUnrealizedPnl(pos, mark);
      totalUnrealized += pos.unrealized_pnl;
    }
    state.equity = state.balance + totalUnrealized;
  } else {
    state.equity = state.balance;
  }
  saveState(state);

  if (jsonMode) {
    writeSuccess(
      {
        balance: state.balance,
        equity: state.equity,
        unrealized_pnl: totalUnrealized,
        open_positions: state.positions.length,
      },
      jsonMode,
    );
    return;
  }

  console.log();
  console.log(theme.header("Paper Account"));
  console.log(theme.muted("  ─────────────────────────────────"));
  console.log(`  ${theme.label("Balance:")}         ${formatPrice(state.balance)} USDC`);
  console.log(`  ${theme.label("Unrealized PnL:")}  ${formatPnl(totalUnrealized)}`);
  console.log(`  ${theme.label("Equity:")}          ${formatPrice(state.equity)} USDC`);
  console.log();

  if (state.positions.length === 0) {
    console.log(theme.muted("  No open positions."));
  } else {
    console.log(theme.header("Open Positions"));
    console.log(theme.muted("  ─────────────────────────────────"));
    const symbols = [...new Set(state.positions.map((p) => p.symbol))];
    const prices = await getMarkPrices(symbols);

    for (const pos of state.positions) {
      const mark = prices.get(pos.symbol) ?? pos.entry_price;
      const upnl = computeUnrealizedPnl(pos, mark);
      const sideLabel = pos.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");
      console.log(
        `  ${padR(pos.symbol, 18)} ${padR(sideLabel, 15)} ` +
        `Entry ${formatPrice(pos.entry_price)}  Mark ${formatPrice(mark)}  PnL ${formatPnl(upnl)}`,
      );
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: buy / sell
// ---------------------------------------------------------------------------

interface OpenTradeOpts {
  leverage?: number;
  price?: number;
  json?: boolean;
}

async function cmdOpenTrade(
  side: "long" | "short",
  rawSymbol: string,
  rawSize: string,
  opts: OpenTradeOpts,
): Promise<void> {
  const jsonMode = opts.json ?? false;
  const symbol = rawSymbol.toUpperCase();
  const size = parseFloat(rawSize);

  if (!Number.isFinite(size) || size <= 0) {
    writeError(
      { ok: false, error: "validation", message: "Size must be a positive number." },
      jsonMode,
    );
    return;
  }

  const leverage = opts.leverage ?? 1;
  if (!Number.isFinite(leverage) || leverage < 1) {
    writeError(
      { ok: false, error: "validation", message: "Leverage must be >= 1." },
      jsonMode,
    );
    return;
  }

  // Fetch mark price (or use --price for limit simulation)
  let entryPrice: number;
  if (opts.price !== undefined && Number.isFinite(opts.price) && opts.price > 0) {
    entryPrice = opts.price;
  } else {
    entryPrice = await getMarkPrice(symbol);
  }

  const notional = entryPrice * size;
  const margin = notional / leverage;
  const liqPrice = computeLiquidationPrice(side, entryPrice, leverage);

  const state = loadState();

  // Margin check
  if (margin > state.balance) {
    writeError(
      {
        ok: false,
        error: "validation",
        message: `Insufficient balance. Required margin: ${formatPrice(margin)}, available: ${formatPrice(state.balance)}.`,
      },
      jsonMode,
    );
    return;
  }

  const sideLabel = side === "long" ? "BUY (Long)" : "SELL (Short)";

  if (!jsonMode) {
    console.log();
    console.log(theme.header("Paper Order Summary"));
    console.log(theme.muted("  ─────────────────────────────────"));
    console.log(`  ${theme.label("Symbol:")}           ${symbol}`);
    console.log(`  ${theme.label("Side:")}             ${side === "long" ? theme.profit(sideLabel) : theme.loss(sideLabel)}`);
    console.log(`  ${theme.label("Size:")}             ${formatAmount(size)}`);
    console.log(`  ${theme.label("Entry price:")}      ${formatPrice(entryPrice)}`);
    console.log(`  ${theme.label("Notional:")}         ${formatPrice(notional)} USDC`);
    console.log(`  ${theme.label("Leverage:")}         ${leverage}x`);
    console.log(`  ${theme.label("Margin:")}           ${formatPrice(margin)} USDC`);
    console.log(`  ${theme.label("Liq price:")}        ${formatPrice(liqPrice)}`);
    console.log();

    const ok = await confirm({ message: "Open this paper trade?", default: true });
    if (!ok) {
      console.log(theme.muted("Cancelled."));
      return;
    }
  }

  const now = new Date().toISOString();
  const posId = randomUUID();

  const position: PaperPosition = {
    id: posId,
    symbol,
    side,
    size,
    entry_price: entryPrice,
    leverage,
    margin,
    liquidation_price: liqPrice,
    unrealized_pnl: 0,
    funding_accrued: 0,
    opened_at: now,
  };

  const tradeRecord: PaperTrade = {
    id: posId,
    symbol,
    side,
    size,
    entry_price: entryPrice,
    leverage,
    opened_at: now,
    status: "open",
  };

  state.balance -= margin;
  state.positions.push(position);
  state.history.push(tradeRecord);
  saveState(state);

  if (jsonMode) {
    writeSuccess({ position, balance_after: state.balance }, jsonMode);
    return;
  }

  console.log();
  console.log(theme.success("  Paper trade opened"));
  console.log(`  ${theme.label("Symbol:")}    ${symbol}`);
  console.log(`  ${theme.label("Side:")}      ${side === "long" ? theme.profit("LONG") : theme.loss("SHORT")}`);
  console.log(`  ${theme.label("Entry:")}     ${formatPrice(entryPrice)}`);
  console.log(`  ${theme.label("Margin:")}    ${formatPrice(margin)} USDC`);
  console.log(`  ${theme.label("Balance:")}   ${formatPrice(state.balance)} USDC remaining`);
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: close
// ---------------------------------------------------------------------------

async function cmdClose(rawSymbol: string, jsonMode: boolean): Promise<void> {
  const symbol = rawSymbol.toUpperCase();
  const state = loadState();

  const posIdx = state.positions.findIndex((p) => p.symbol === symbol);
  if (posIdx === -1) {
    writeError(
      { ok: false, error: "validation", message: `No open paper position for ${symbol}.` },
      jsonMode,
    );
    return;
  }

  const pos = state.positions[posIdx];
  const markPrice = await getMarkPrice(symbol);
  const sideMultiplier = pos.side === "long" ? 1 : -1;
  const realizedPnl = (markPrice - pos.entry_price) * pos.size * sideMultiplier;
  const returned = pos.margin + realizedPnl;
  const now = new Date().toISOString();

  if (!jsonMode) {
    const sideLabel = pos.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");
    console.log();
    console.log(theme.header("Close Paper Position"));
    console.log(theme.muted("  ─────────────────────────────────"));
    console.log(`  ${theme.label("Symbol:")}       ${symbol}`);
    console.log(`  ${theme.label("Side:")}         ${sideLabel}`);
    console.log(`  ${theme.label("Entry:")}        ${formatPrice(pos.entry_price)}`);
    console.log(`  ${theme.label("Exit:")}         ${formatPrice(markPrice)}`);
    console.log(`  ${theme.label("Size:")}         ${formatAmount(pos.size)}`);
    console.log(`  ${theme.label("Realized PnL:")} ${formatPnl(realizedPnl)}`);
    console.log(`  ${theme.label("Returned:")}     ${formatPrice(returned)} USDC`);
    console.log();

    const ok = await confirm({ message: "Close this paper position?", default: true });
    if (!ok) {
      console.log(theme.muted("Cancelled."));
      return;
    }
  }

  // Update history record
  const histIdx = state.history.findIndex((t) => t.id === pos.id);
  if (histIdx !== -1) {
    state.history[histIdx].exit_price = markPrice;
    state.history[histIdx].realized_pnl = realizedPnl;
    state.history[histIdx].closed_at = now;
    state.history[histIdx].status = "closed";
  }

  // Remove from positions, credit balance
  state.positions.splice(posIdx, 1);
  state.balance += returned;
  saveState(state);

  if (jsonMode) {
    writeSuccess({ symbol, realized_pnl: realizedPnl, balance_after: state.balance }, jsonMode);
    return;
  }

  console.log();
  console.log(theme.success("  Position closed"));
  console.log(
    `  PnL: ${formatPnl(realizedPnl)}  |  New balance: ${formatPrice(state.balance)} USDC`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: positions
// ---------------------------------------------------------------------------

async function cmdPositions(jsonMode: boolean): Promise<void> {
  const state = loadState();

  if (state.positions.length === 0) {
    if (jsonMode) {
      writeSuccess([], jsonMode);
    } else {
      console.log(theme.muted("\nNo open paper positions.\n"));
    }
    return;
  }

  const symbols = [...new Set(state.positions.map((p) => p.symbol))];
  const prices = await getMarkPrices(symbols);

  if (jsonMode) {
    const enriched = state.positions.map((pos) => {
      const mark = prices.get(pos.symbol) ?? pos.entry_price;
      return { ...pos, mark_price: mark, unrealized_pnl: computeUnrealizedPnl(pos, mark) };
    });
    writeSuccess(enriched, jsonMode);
    return;
  }

  console.log();
  console.log(theme.header("Paper Positions"));
  console.log(theme.muted("  ─────────────────────────────────────────────────────────────────────────────────"));

  // Header row
  console.log(
    theme.muted(
      "  " +
      padR("Symbol", 18) +
      padR("Side", 9) +
      padR("Size", 11) +
      padR("Entry", 14) +
      padR("Mark", 14) +
      padR("PnL", 20) +
      padR("Lev", 6) +
      "Liq Price",
    ),
  );

  let totalPnl = 0;

  for (const pos of state.positions) {
    const mark = prices.get(pos.symbol) ?? pos.entry_price;
    const upnl = computeUnrealizedPnl(pos, mark);
    const pnlPct = pos.margin !== 0 ? (upnl / pos.margin) * 100 : 0;
    totalPnl += upnl;

    const sideLabel = pos.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");
    const pnlDisplay = `${formatPnl(upnl)} ${formatPercent(pnlPct)}`;

    console.log(
      "  " +
      padR(pos.symbol, 18) +
      padR(sideLabel, 9) +
      padR(formatAmount(pos.size), 11) +
      padR(formatPrice(pos.entry_price), 14) +
      padR(formatPrice(mark), 14) +
      padR(pnlDisplay, 20) +
      padR(`${pos.leverage}x`, 6) +
      formatPrice(pos.liquidation_price),
    );
  }

  console.log();
  console.log(
    `  ${theme.muted(`${state.positions.length} position${state.positions.length !== 1 ? "s" : ""}`)}` +
    `  Total unrealized PnL: ${formatPnl(totalPnl)}`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: history
// ---------------------------------------------------------------------------

async function cmdHistory(jsonMode: boolean): Promise<void> {
  const state = loadState();
  const closed = state.history.filter((t) => t.status === "closed" || t.status === "liquidated");

  if (jsonMode) {
    const totalPnl = closed.reduce((acc, t) => acc + (t.realized_pnl ?? 0), 0);
    const wins = closed.filter((t) => (t.realized_pnl ?? 0) > 0).length;
    writeSuccess(
      {
        trades: closed,
        stats: {
          total_trades: closed.length,
          wins,
          losses: closed.length - wins,
          win_rate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
          total_pnl: totalPnl,
        },
      },
      jsonMode,
    );
    return;
  }

  console.log();
  console.log(theme.header("Paper Trade History"));
  console.log(theme.muted("  ─────────────────────────────────"));

  if (closed.length === 0) {
    console.log(theme.muted("  No closed trades yet."));
    console.log();
    return;
  }

  // Header
  console.log(
    theme.muted(
      "  " +
      padR("Symbol", 18) +
      padR("Side", 9) +
      padR("Size", 11) +
      padR("Entry", 14) +
      padR("Exit", 14) +
      padR("PnL", 16) +
      "Closed",
    ),
  );

  let totalPnl = 0;
  let wins = 0;

  for (const t of closed) {
    const pnl = t.realized_pnl ?? 0;
    totalPnl += pnl;
    if (pnl > 0) wins++;

    const sideLabel = t.side === "long" ? theme.profit("LONG") : theme.loss("SHORT");
    const exitDisplay = t.exit_price !== undefined ? formatPrice(t.exit_price) : theme.muted("—");
    const closedDisplay = t.closed_at ? formatTimestamp(t.closed_at) : theme.muted("—");

    console.log(
      "  " +
      padR(t.symbol, 18) +
      padR(sideLabel, 9) +
      padR(formatAmount(t.size), 11) +
      padR(formatPrice(t.entry_price), 14) +
      padR(exitDisplay, 14) +
      padR(formatPnl(pnl), 16) +
      closedDisplay,
    );
  }

  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

  console.log();
  console.log(theme.muted("  ─────────────────────────────────"));
  console.log(
    `  ${theme.label("Total trades:")}  ${closed.length}` +
    `  |  ${theme.label("Win rate:")}  ${winRate.toFixed(1)}%` +
    `  |  ${theme.label("Total PnL:")}  ${formatPnl(totalPnl)}`,
  );
  console.log();
}

// ---------------------------------------------------------------------------
// Subcommand: reset
// ---------------------------------------------------------------------------

async function cmdReset(jsonMode: boolean): Promise<void> {
  if (!existsSync(STATE_PATH)) {
    if (jsonMode) {
      writeSuccess({ reset: true, message: "No state file found." }, jsonMode);
    } else {
      console.log(theme.muted("No paper account found — nothing to reset."));
    }
    return;
  }

  if (!jsonMode) {
    const ok = await confirm({
      message: "This will delete your paper trading account and all history. Are you sure?",
      default: false,
    });
    if (!ok) {
      console.log(theme.muted("Cancelled."));
      return;
    }
  }

  unlinkSync(STATE_PATH);

  if (jsonMode) {
    writeSuccess({ reset: true }, jsonMode);
    return;
  }

  console.log();
  console.log(theme.success("  Paper account reset."));
  console.log(theme.muted(`  Run \`pacifica paper init\` to start fresh.`));
  console.log();
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------

function handleError(err: unknown, jsonMode: boolean): void {
  if (isUserCancellation(err)) {
    console.log(theme.muted("\nCancelled."));
    return;
  }
  writeError(classifyError(err), jsonMode);
}

function isUserCancellation(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (err instanceof Error && err.name === "ExitPromptError") return true;
  if (err instanceof Error && err.message.includes("User force closed")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createPaperCommand(): Command {
  const paper = new Command("paper")
    .description("Paper trading — practice with real prices, zero risk")
    .option("--json", "Output raw JSON");

  // -- init ------------------------------------------------------------------
  paper
    .command("init")
    .description("Create a paper trading account")
    .option("--balance <usdc>", "Starting USDC balance", parseFloat)
    .action(async (opts: { balance?: number }, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdInit(opts, jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- balance ---------------------------------------------------------------
  paper
    .command("balance")
    .description("Show paper account balance and open positions")
    .action(async (_opts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdBalance(jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- buy -------------------------------------------------------------------
  paper
    .command("buy <symbol> <size>")
    .description("Open a long (buy) paper position")
    .option("-l, --leverage <n>", "Leverage multiplier", parseFloat)
    .option("-p, --price <n>", "Use this price instead of mark price (limit simulation)", parseFloat)
    .action(async (symbol: string, size: string, opts: OpenTradeOpts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdOpenTrade("long", symbol, size, { ...opts, json: jsonMode });
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- sell ------------------------------------------------------------------
  paper
    .command("sell <symbol> <size>")
    .description("Open a short (sell) paper position")
    .option("-l, --leverage <n>", "Leverage multiplier", parseFloat)
    .option("-p, --price <n>", "Use this price instead of mark price (limit simulation)", parseFloat)
    .action(async (symbol: string, size: string, opts: OpenTradeOpts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdOpenTrade("short", symbol, size, { ...opts, json: jsonMode });
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- close -----------------------------------------------------------------
  paper
    .command("close <symbol>")
    .description("Close an open paper position at current mark price")
    .action(async (symbol: string, _opts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdClose(symbol, jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- positions -------------------------------------------------------------
  paper
    .command("positions")
    .description("List open paper positions with live mark prices")
    .action(async (_opts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdPositions(jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- history ---------------------------------------------------------------
  paper
    .command("history")
    .description("Show closed paper trades and performance stats")
    .action(async (_opts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdHistory(jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  // -- reset -----------------------------------------------------------------
  paper
    .command("reset")
    .description("Delete the paper trading account")
    .action(async (_opts, cmd) => {
      const jsonMode = (cmd.parent?.opts()?.json ?? false) as boolean;
      try {
        await cmdReset(jsonMode);
      } catch (err) {
        handleError(err, jsonMode);
      }
    });

  return paper;
}
