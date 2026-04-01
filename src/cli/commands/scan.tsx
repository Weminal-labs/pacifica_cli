// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- scan command
// ---------------------------------------------------------------------------
// Live market overview with real-time WebSocket data and REST fallback.
// DexScreener CLI-inspired terminal UI with bordered panels.
// Usage: pacifica scan [--testnet] [--json]
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { PacificaWebSocket } from "../../core/sdk/websocket.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import type { SignerConfig } from "../../core/sdk/signer.js";
import { safeFloat } from "../../core/sdk/types.js";
import type { Market, WsPriceUpdate } from "../../core/sdk/types.js";
import { MarketTable } from "../components/MarketTable.js";
import { formatVolume, formatFundingRate } from "../theme.js";

// ---------------------------------------------------------------------------
// Colors (matching DexScreener CLI palette)
// ---------------------------------------------------------------------------

const C = {
  border: "#3a3d4a",
  borderDim: "#2a2d3a",
  title: "#e5e7eb",
  label: "#6b7280",
  dim: "#4b5563",
  text: "#d1d5db",
  green: "#4ade80",
  greenBright: "#22c55e",
  red: "#f87171",
  redBright: "#ef4444",
  gold: "#fbbf24",
  cyan: "#67e8f9",
  white: "#f9fafb",
} as const;

// ---------------------------------------------------------------------------
// Unicode elements
// ---------------------------------------------------------------------------

const DOT = "\u25cf";        // ●
const DIAMOND = "\u25c6";    // ◆
const VLINE = "\u2502";      // │
const ARROW_UP = "\u25b2";   // ▲
const ARROW_DOWN = "\u25bc"; // ▼

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scanCommand(options: { testnet?: boolean; json?: boolean }): Promise<void> {
  const { client, ws, network } = await buildClients(options);

  let markets: Market[];
  try {
    markets = await client.getMarkets();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch markets: ${message}`);
    client.destroy();
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(markets, null, 2));
    client.destroy();
    return;
  }

  const { unmount, waitUntilExit } = render(
    <ScanApp
      initialMarkets={markets}
      client={client}
      ws={ws}
      network={network}
    />,
  );

  const onSigint = (): void => {
    ws.disconnect();
    client.destroy();
    unmount();
  };
  process.on("SIGINT", onSigint);

  await waitUntilExit();

  process.removeListener("SIGINT", onSigint);
  ws.disconnect();
  client.destroy();
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

interface ClientBundle {
  client: PacificaClient;
  ws: PacificaWebSocket;
  network: "testnet" | "mainnet";
}

async function buildClients(options: { testnet?: boolean }): Promise<ClientBundle> {
  let network: "testnet" | "mainnet" = "testnet";
  let signerConfig: SignerConfig | undefined;

  try {
    const config = await loadConfig();
    network = options.testnet ? "testnet" : config.network;
    if (config.private_key) {
      signerConfig = createSignerFromConfig(config);
    }
  } catch {
    network = "testnet";
  }

  if (options.testnet) {
    network = "testnet";
  }

  const client = new PacificaClient({
    network,
    signer: signerConfig,
  });

  const ws = new PacificaWebSocket({
    network,
    account: signerConfig?.publicKey,
  });

  return { client, ws, network };
}

// ---------------------------------------------------------------------------
// ScanApp -- top-level Ink component
// ---------------------------------------------------------------------------

interface ScanAppProps {
  initialMarkets: Market[];
  client: PacificaClient;
  ws: PacificaWebSocket;
  network: "testnet" | "mainnet";
}

function ScanApp({ initialMarkets, client, ws, network }: ScanAppProps): React.ReactElement {
  const { exit } = useApp();
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [termRows, setTermRows] = useState(process.stdout.rows || 24);

  useEffect(() => {
    const onResize = (): void => {
      setTermRows(process.stdout.rows || 24);
    };
    process.stdout.on("resize", onResize);
    return () => { process.stdout.removeListener("resize", onResize); };
  }, []);

  // Reserve: header(3) + summary panel(6) + scan title(1) + table header(2) + footer(3) + error(1) = 16
  const CHROME_ROWS = 16;
  const pageSize = Math.max(5, termRows - CHROME_ROWS);
  const sorted = [...markets].sort((a, b) => b.volume24h - a.volume24h);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleMarkets = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  useInput((input, key) => {
    if (input === "q") {
      ws.disconnect();
      client.destroy();
      exit();
    }
    if (input === "r") {
      client.getMarkets().then((fresh) => {
        setMarkets(fresh);
        setLastUpdate(new Date());
        setError(null);
      }).catch(() => {});
    }
    if (input === "j" || key.downArrow) {
      setPage((p) => Math.min(p + 1, totalPages - 1));
    }
    if (input === "k" || key.upArrow) {
      setPage((p) => Math.max(p - 1, 0));
    }
  });

  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | undefined;

    const onPrices = (prices: WsPriceUpdate[]): void => {
      setMarkets((prev) => mergePriceUpdates(prev, prices));
      setLastUpdate(new Date());
    };
    const onConnected = (): void => { setConnected(true); setError(null); };
    const onDisconnected = (): void => { setConnected(false); };
    const onError = (err: Error): void => { setError(err.message); };

    ws.on("prices", onPrices);
    ws.on("connected", onConnected);
    ws.on("disconnected", onDisconnected);
    ws.on("error", onError);

    ws.connect()
      .then(() => { ws.subscribePrices(); setConnected(true); })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(`WebSocket: ${message}`);
        pollingInterval = setInterval(() => {
          client.getMarkets().then((fresh) => {
            setMarkets(fresh);
            setLastUpdate(new Date());
          }).catch(() => {});
        }, 3000);
      });

    return () => {
      ws.removeListener("prices", onPrices);
      ws.removeListener("connected", onConnected);
      ws.removeListener("disconnected", onDisconnected);
      ws.removeListener("error", onError);
      if (pollingInterval !== undefined) clearInterval(pollingInterval);
      ws.disconnect();
    };
  }, []);

  return (
    <Box flexDirection="column">
      {/* ── Header Panel ── */}
      <HeaderPanel network={network} connected={connected} lastUpdate={lastUpdate} />

      {/* ── Performance Summary ── */}
      <SummaryPanel markets={markets} />

      {/* ── Scan Title ── */}
      <Box marginTop={1} gap={2}>
        <Text color={C.text} bold> {DIAMOND} Market Scanner</Text>
        <Text color={C.dim}>top={pageSize}</Text>
        <Text color={C.dim}>sorted=volume</Text>
        <Text color={C.dim}>markets={sorted.length}</Text>
      </Box>

      {/* ── Market Table ── */}
      <MarketTable markets={visibleMarkets} />

      {/* ── Error ── */}
      {error && (
        <Box marginTop={1}>
          <Text color={C.red}> ! {error}</Text>
        </Box>
      )}

      {/* ── Footer Status Bar ── */}
      <StatusFooter
        network={network}
        lastUpdate={lastUpdate}
        page={safePage + 1}
        totalPages={totalPages}
        totalMarkets={sorted.length}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// HeaderPanel -- bordered title box
// ---------------------------------------------------------------------------

function HeaderPanel({ network, connected, lastUpdate }: {
  network: string;
  connected: boolean;
  lastUpdate: Date;
}): React.ReactElement {
  const now = formatDateTime(lastUpdate);
  const statusColor = connected ? C.green : C.gold;
  const statusText = connected ? "Live" : "Connecting...";

  return (
    <Box
      flexDirection="column"
      borderStyle="bold"
      borderColor={C.border}
      paddingX={1}
    >
      <Text color={C.white} bold>PACIFICA DEX</Text>
      <Box gap={2}>
        <Text color={C.label}>Trading Terminal</Text>
        <Text color={C.border}>{DOT}</Text>
        <Text color={statusColor}>{DOT} {statusText}</Text>
        <Text color={C.border}>{DOT}</Text>
        <Text color={C.dim}>{now}</Text>
        <Text color={C.border}>{DOT}</Text>
        <Text color={C.label}>{network}</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SummaryPanel -- two-column performance overview
// ---------------------------------------------------------------------------

function SummaryPanel({ markets }: { markets: Market[] }): React.ReactElement {
  const activeCount = markets.length;
  const totalVolume = markets.reduce((sum, m) => sum + m.volume24h, 0);
  const totalOI = markets.reduce((sum, m) => sum + m.openInterest, 0);

  // Top mover by absolute 24h change
  let topMover: Market | undefined;
  let maxAbsChange = 0;
  for (const m of markets) {
    const abs = Math.abs(m.change24h);
    if (abs > maxAbsChange) { maxAbsChange = abs; topMover = m; }
  }

  // Hottest funding
  let hotFunding: Market | undefined;
  let maxAbsFunding = 0;
  for (const m of markets) {
    const abs = Math.abs(m.fundingRate);
    if (abs > maxAbsFunding) { maxAbsFunding = abs; hotFunding = m; }
  }

  // Gainers / losers count
  const gainers = markets.filter((m) => m.change24h > 0).length;
  const losers = markets.filter((m) => m.change24h < 0).length;

  const topMoverArrow = topMover && topMover.change24h >= 0 ? ARROW_UP : ARROW_DOWN;
  const topMoverColor = topMover && topMover.change24h >= 0 ? C.green : C.red;

  const hotFundingColor = hotFunding && hotFunding.fundingRate >= 0 ? C.green : C.red;

  return (
    <Box
      borderStyle="bold"
      borderColor={C.border}
      paddingX={1}
      marginTop={0}
    >
      {/* Left column */}
      <Box flexDirection="column" width="50%">
        <SummaryRow label="Markets" value={String(activeCount)} valueColor={C.cyan} />
        <SummaryRow label="Total 24h Vol" value={formatVolume(totalVolume)} valueColor={C.white} />
        <SummaryRow label="Total OI" value={formatVolume(totalOI)} valueColor={C.green} />
        <Box>
          <Text color={C.label}>{"Sentiment        "}</Text>
          <Text color={C.green}>{ARROW_UP} {gainers}</Text>
          <Text color={C.dim}> / </Text>
          <Text color={C.red}>{ARROW_DOWN} {losers}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box flexDirection="column" width={3} alignItems="center">
        <Text color={C.border}>{VLINE}</Text>
        <Text color={C.border}>{VLINE}</Text>
        <Text color={C.border}>{VLINE}</Text>
        <Text color={C.border}>{VLINE}</Text>
      </Box>

      {/* Right column */}
      <Box flexDirection="column" width="50%">
        <Box>
          <Text color={C.label}>{"Top Mover 24h    "}</Text>
          {topMover ? (
            <>
              <Text color={C.gold} bold>{topMover.symbol} </Text>
              <Text color={topMoverColor} bold>{topMoverArrow} {Math.abs(topMover.change24h).toFixed(2)}%</Text>
            </>
          ) : (
            <Text color={C.dim}>--</Text>
          )}
        </Box>
        <Box>
          <Text color={C.label}>{"Hot Funding      "}</Text>
          {hotFunding ? (
            <>
              <Text color={C.gold} bold>{hotFunding.symbol} </Text>
              <Text color={hotFundingColor} bold>{formatFundingRate(hotFunding.fundingRate)}</Text>
            </>
          ) : (
            <Text color={C.dim}>--</Text>
          )}
        </Box>
        <Box>
          <Text color={C.label}>{"Top Volume       "}</Text>
          {markets.length > 0 ? (
            <>
              <Text color={C.gold} bold>{markets.sort((a, b) => b.volume24h - a.volume24h)[0].symbol} </Text>
              <Text color={C.white} bold>{formatVolume(markets.sort((a, b) => b.volume24h - a.volume24h)[0].volume24h)}</Text>
            </>
          ) : (
            <Text color={C.dim}>--</Text>
          )}
        </Box>
        <Box>
          <Text color={C.label}>{"Top OI           "}</Text>
          {markets.length > 0 ? (
            <>
              <Text color={C.gold} bold>{markets.sort((a, b) => b.openInterest - a.openInterest)[0].symbol} </Text>
              <Text color={C.white} bold>{formatVolume(markets.sort((a, b) => b.openInterest - a.openInterest)[0].openInterest)}</Text>
            </>
          ) : (
            <Text color={C.dim}>--</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function SummaryRow({ label, value, valueColor }: {
  label: string;
  value: string;
  valueColor: string;
}): React.ReactElement {
  const padded = label.length < 17 ? label + " ".repeat(17 - label.length) : label;
  return (
    <Box>
      <Text color={C.label}>{padded}</Text>
      <Text color={valueColor} bold>{value}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// StatusFooter -- bottom status bar
// ---------------------------------------------------------------------------

function StatusFooter({ network, lastUpdate, page, totalPages, totalMarkets }: {
  network: string;
  lastUpdate: Date;
  page: number;
  totalPages: number;
  totalMarkets: number;
}): React.ReactElement {
  const time = formatTime(lastUpdate);

  return (
    <Box
      borderStyle="bold"
      borderColor={C.borderDim}
      paddingX={1}
      marginTop={1}
    >
      <Text color={C.green} bold>{DOT} {network.toUpperCase()}</Text>
      <Text color={C.border}> {VLINE} </Text>
      <Text color={C.dim}>{time}</Text>
      <Text color={C.border}> {VLINE} </Text>
      <Text color={C.label}>{totalMarkets} markets</Text>
      {totalPages > 1 && (
        <>
          <Text color={C.border}> {VLINE} </Text>
          <Text color={C.text}>pg {page}/{totalPages}</Text>
        </>
      )}
      <Text color={C.border}> {VLINE} </Text>
      <Text color={C.dim}>q quit</Text>
      <Text color={C.border}> {VLINE} </Text>
      <Text color={C.dim}>r refresh</Text>
      <Text color={C.border}> {VLINE} </Text>
      <Text color={C.dim}>j/k page</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergePriceUpdates(markets: Market[], prices: WsPriceUpdate[]): Market[] {
  const updateMap = new Map<string, WsPriceUpdate>();
  for (const p of prices) {
    updateMap.set(p.symbol, p);
  }

  return markets.map((market) => {
    const update = updateMap.get(market.symbol);
    if (!update) return market;

    const mid = safeFloat(update.mid, market.price);
    const yesterday = safeFloat(update.yesterday_price, 0);
    // API returns -1 for markets without yesterday data — treat as unavailable
    const change24h = yesterday > 0
      ? ((mid - yesterday) / yesterday) * 100
      : market.change24h;

    return {
      ...market,
      price: mid,
      markPrice: safeFloat(update.mark, market.markPrice),
      oraclePrice: safeFloat(update.oracle, market.oraclePrice),
      change24h,
      volume24h: safeFloat(update.volume_24h, market.volume24h),
      openInterest: safeFloat(update.open_interest, market.openInterest),
      fundingRate: safeFloat(update.funding, market.fundingRate),
      nextFundingRate: safeFloat(update.next_funding, market.nextFundingRate),
    };
  });
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d} ${formatTime(date)}`;
}
