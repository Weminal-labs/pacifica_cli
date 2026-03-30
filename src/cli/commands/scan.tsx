// ---------------------------------------------------------------------------
// Pacifica DEX CLI -- scan command
// ---------------------------------------------------------------------------
// Live market overview with real-time WebSocket data and REST fallback.
// Usage: pacifica scan [--testnet] [--json]
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { PacificaWebSocket } from "../../core/sdk/websocket.js";
import { createSigner } from "../../core/sdk/signer.js";
import { safeFloat } from "../../core/sdk/types.js";
import type { Market, WsPriceUpdate } from "../../core/sdk/types.js";
import { MarketTable } from "../components/MarketTable.js";
import { formatVolume } from "../theme.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scanCommand(options: { testnet?: boolean; json?: boolean }): Promise<void> {
  // Resolve network and create client.
  const { client, ws, network } = await buildClients(options);

  // Fetch initial market snapshot via REST.
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

  // --json: dump and exit.
  if (options.json) {
    console.log(JSON.stringify(markets, null, 2));
    client.destroy();
    return;
  }

  // Render the live Ink application.
  const { unmount, waitUntilExit } = render(
    <ScanApp
      initialMarkets={markets}
      client={client}
      ws={ws}
      network={network}
    />,
  );

  // Graceful shutdown on SIGINT.
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
  let signerConfig: ReturnType<typeof createSigner> | undefined;

  try {
    const config = await loadConfig();
    network = options.testnet ? "testnet" : config.network;
    if (config.private_key) {
      signerConfig = createSigner(config.private_key);
    }
  } catch {
    // No config file -- fall back to testnet defaults.
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

  // Keyboard input: q to quit, r to refresh.
  useInput((input) => {
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
      }).catch(() => {
        // Silently ignore manual refresh errors.
      });
    }
  });

  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | undefined;

    // WebSocket event handlers.
    const onPrices = (prices: WsPriceUpdate[]): void => {
      setMarkets((prev) => mergePriceUpdates(prev, prices));
      setLastUpdate(new Date());
    };

    const onConnected = (): void => {
      setConnected(true);
      setError(null);
    };

    const onDisconnected = (): void => {
      setConnected(false);
    };

    const onError = (err: Error): void => {
      setError(err.message);
    };

    ws.on("prices", onPrices);
    ws.on("connected", onConnected);
    ws.on("disconnected", onDisconnected);
    ws.on("error", onError);

    // Attempt WebSocket connection.
    ws.connect()
      .then(() => {
        ws.subscribePrices();
        setConnected(true);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(`WebSocket: ${message}`);

        // Fallback: poll REST every 3 seconds.
        pollingInterval = setInterval(() => {
          client.getMarkets().then((fresh) => {
            setMarkets(fresh);
            setLastUpdate(new Date());
          }).catch(() => {
            // Ignore polling errors to avoid noisy output.
          });
        }, 3000);
      });

    return () => {
      ws.removeListener("prices", onPrices);
      ws.removeListener("connected", onConnected);
      ws.removeListener("disconnected", onDisconnected);
      ws.removeListener("error", onError);

      if (pollingInterval !== undefined) {
        clearInterval(pollingInterval);
      }

      ws.disconnect();
    };
  }, []);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text bold color="cyan">Pacifica Markets</Text>
        <Text> </Text>
        <Text dimColor>({network})</Text>
        <Text> </Text>
        <Text color={connected ? "green" : "yellow"}>
          {connected ? "* Live" : "* Connecting..."}
        </Text>
        <Text dimColor> | Updated: {formatTime(lastUpdate)}</Text>
      </Box>

      {/* Summary */}
      <ScanSummary markets={markets} />

      {/* Market table */}
      <MarketTable markets={markets} />

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">! {error}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Press q to quit | r to refresh</Text>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ScanSummary
// ---------------------------------------------------------------------------

function ScanSummary({ markets }: { markets: Market[] }): React.ReactElement {
  const activeCount = markets.length;

  const totalVolume = markets.reduce((sum, m) => sum + m.volume24h, 0);

  // Top mover by absolute 24h change.
  let topMover: Market | undefined;
  let maxAbsChange = 0;
  for (const m of markets) {
    const abs = Math.abs(m.change24h);
    if (abs > maxAbsChange) {
      maxAbsChange = abs;
      topMover = m;
    }
  }

  // Hottest funding rate by absolute value.
  let hotFunding: Market | undefined;
  let maxAbsFunding = 0;
  for (const m of markets) {
    const abs = Math.abs(m.fundingRate);
    if (abs > maxAbsFunding) {
      maxAbsFunding = abs;
      hotFunding = m;
    }
  }

  const topMoverSign = topMover && topMover.change24h >= 0 ? "+" : "-";
  const topMoverText = topMover
    ? `${topMover.symbol} ${topMoverSign}${Math.abs(topMover.change24h).toFixed(2)}%`
    : "--";
  const topMoverColor = topMover && topMover.change24h >= 0 ? "green" : "red";

  const hotFundingSign = hotFunding && hotFunding.fundingRate >= 0 ? "+" : "-";
  const hotFundingText = hotFunding
    ? `${hotFunding.symbol} ${hotFundingSign}${Math.abs(hotFunding.fundingRate).toFixed(4)}%`
    : "--";
  const hotFundingColor = hotFunding && hotFunding.fundingRate >= 0 ? "green" : "red";

  return (
    <Box marginTop={1} gap={2}>
      <Text>
        <Text dimColor>Markets: </Text>
        <Text bold>{activeCount}</Text>
        <Text dimColor> active</Text>
      </Text>
      <Text>
        <Text dimColor>Volume: </Text>
        <Text bold>{formatVolume(totalVolume)}</Text>
      </Text>
      <Text>
        <Text dimColor>Top mover: </Text>
        <Text color={topMoverColor} bold>{topMoverText}</Text>
      </Text>
      <Text>
        <Text dimColor>Hot funding: </Text>
        <Text color={hotFundingColor} bold>{hotFundingText}</Text>
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge WebSocket price updates into the existing market array.
 * Returns a new array (immutable update). Unmatched updates are ignored.
 */
function mergePriceUpdates(markets: Market[], prices: WsPriceUpdate[]): Market[] {
  // Index updates by symbol for O(1) lookup.
  const updateMap = new Map<string, WsPriceUpdate>();
  for (const p of prices) {
    updateMap.set(p.symbol, p);
  }

  return markets.map((market) => {
    const update = updateMap.get(market.symbol);
    if (!update) return market;

    const mid = safeFloat(update.mid, market.price);
    const yesterday = safeFloat(update.yesterday_price, 0);
    const change24h = yesterday !== 0
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

/**
 * Format a Date to HH:MM:SS for the header timestamp.
 */
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
