// ---------------------------------------------------------------------------
// Pacifica DEX CLI – Live Signal Monitor (Watch mode)
// ---------------------------------------------------------------------------
// `pacifica watch`
//
// Fullscreen Ink TUI showing — in one live-refreshing view:
//   - Active intelligence signals (pattern matches)
//   - Top funding rates by absolute APR
//   - Your open positions
//   - Arb bot status
//
// Press q to quit, r to force refresh. Auto-refreshes every 30s.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { loadConfig } from "../../core/config/loader.js";
import { PacificaClient } from "../../core/sdk/client.js";
import { createSignerFromConfig } from "../../core/sdk/signer.js";
import { loadPatterns } from "../../core/intelligence/store.js";
import { scanForActiveSignals } from "../../core/intelligence/engine.js";
import type { ActiveSignal } from "../../core/intelligence/engine.js";
import type { Market, Position } from "../../core/sdk/types.js";
import { Command } from "commander";

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

interface WatchData {
  signals: ActiveSignal[];
  markets: Market[];
  positions: Position[];
  positionError: string | null;
  updatedAt: string;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Fetch all data in parallel
// ---------------------------------------------------------------------------

async function fetchWatchData(client: PacificaClient): Promise<WatchData> {
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });

  try {
    const [patterns, markets] = await Promise.all([
      loadPatterns(),
      client.getMarkets(),
    ]);

    const [signalResult, posResult] = await Promise.allSettled([
      patterns.length > 0 ? scanForActiveSignals(client, patterns) : Promise.resolve([] as ActiveSignal[]),
      client.getPositions(),
    ]);

    const signals = signalResult.status === "fulfilled" ? signalResult.value : [];
    const positions = posResult.status === "fulfilled" ? posResult.value : [];
    const positionError = posResult.status === "rejected" ? "No wallet configured" : null;

    return {
      signals: signals.slice(0, 6),
      markets: markets
        .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
        .slice(0, 6),
      positions,
      positionError,
      updatedAt: now,
      loading: false,
      error: null,
    };
  } catch (err) {
    return {
      signals: [],
      markets: [],
      positions: [],
      positionError: null,
      updatedAt: now,
      loading: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

const PANEL_W = 42;

function Panel({
  title,
  children,
  width = PANEL_W,
}: {
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      width={width}
      marginRight={1}
    >
      <Box paddingX={1}>
        <Text bold color="cyan">{title}</Text>
      </Box>
      <Box paddingX={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Signal row
// ---------------------------------------------------------------------------

function SignalRow({ sig }: { sig: ActiveSignal }) {
  const base = sig.asset.replace("-USDC-PERP", "").replace("-USDC", "");
  const dir = sig.direction === "long" ? "LONG ↑" : "SHORT ↓";
  const dirColor = sig.direction === "long" ? "green" : "red";
  const wr = (sig.pattern.win_rate * 100).toFixed(0) + "%";
  const partial = sig.fullMatch ? "" : "~";
  const shortName = (partial + sig.pattern.name).slice(0, 22);

  return (
    <Box>
      <Text color={dirColor} bold>{dir.padEnd(8)}</Text>
      <Text color="white" bold>{base.padEnd(6)}</Text>
      <Text color="yellow">{wr.padEnd(5)}</Text>
      <Text color="gray">{shortName}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Funding row
// ---------------------------------------------------------------------------

function FundingRow({ market }: { market: Market }) {
  const base = market.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
  const apr = market.fundingRate * 3 * 365 * 100;
  const aprStr = (apr >= 0 ? "+" : "") + apr.toFixed(1) + "%";
  const aprColor = apr > 5 ? "green" : apr < -5 ? "red" : "gray";
  const side = market.fundingRate > 0 ? "← short earns" : "← long earns";

  return (
    <Box>
      <Text color="cyan">{base.padEnd(8)}</Text>
      <Text color={aprColor} bold>{aprStr.padEnd(10)}</Text>
      <Text color="gray">{side}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Position row
// ---------------------------------------------------------------------------

function PositionRow({ pos }: { pos: Position }) {
  const base = pos.symbol.replace("-USDC-PERP", "").replace("-USDC", "");
  const pnl = pos.unrealizedPnl;
  const pnlStr = (pnl >= 0 ? "+" : "") + "$" + Math.abs(pnl).toFixed(2);
  const pnlColor = pnl >= 0 ? "green" : "red";
  const sideStr = pos.side === "long" ? "LONG " : "SHORT";

  return (
    <Box>
      <Text color={pos.side === "long" ? "green" : "red"}>{sideStr} </Text>
      <Text color="white">{base.padEnd(6)}</Text>
      <Text color="gray">{String(pos.size).padEnd(8)}</Text>
      <Text color={pnlColor}>{pnlStr}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Watch app
// ---------------------------------------------------------------------------

const REFRESH_MS = 30_000;

function WatchApp({ client }: { client: PacificaClient }) {
  const { exit } = useApp();
  const [data, setData] = useState<WatchData>({
    signals: [], markets: [], positions: [], positionError: null,
    updatedAt: "—", loading: true, error: null,
  });

  const refresh = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true }));
    const fresh = await fetchWatchData(client);
    setData(fresh);
  }, [client]);

  // Initial load + auto-refresh
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useInput((input) => {
    if (input === "q" || input === "Q") {
      client.destroy();
      exit();
    }
    if (input === "r" || input === "R") {
      void refresh();
    }
  });

  const { signals, markets, positions, positionError, updatedAt, loading, error } = data;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">◆ Pacifica Watch</Text>
        <Text color="gray">  —  {loading ? "refreshing..." : `Updated ${updatedAt}`}</Text>
        <Text color="gray">  [q] quit  [r] refresh  (auto 30s)</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Row 1: Signals + Funding */}
      <Box flexDirection="row" marginBottom={1}>

        {/* Active Signals panel */}
        <Panel title="⚡ Active Signals">
          {signals.length === 0 ? (
            <Text color="gray">{loading ? "scanning..." : "No live signals right now"}</Text>
          ) : (
            signals.map((s) => <SignalRow key={s.asset + s.direction} sig={s} />)
          )}
        </Panel>

        {/* Funding Rates panel */}
        <Panel title="$ Funding Rates (APR)">
          {markets.length === 0 ? (
            <Text color="gray">{loading ? "fetching..." : "No market data"}</Text>
          ) : (
            markets.map((m) => <FundingRow key={m.symbol} market={m} />)
          )}
        </Panel>

      </Box>

      {/* Row 2: Your Positions */}
      <Box flexDirection="row">

        <Panel title="↗ Your Positions" width={PANEL_W * 2 + 1}>
          {positionError ? (
            <Text color="gray">{positionError}</Text>
          ) : positions.length === 0 ? (
            <Text color="gray">{loading ? "loading..." : "No open positions"}</Text>
          ) : (
            positions.map((p) => (
              <PositionRow key={p.symbol + p.side} pos={p} />
            ))
          )}
        </Panel>

      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createWatchCommand(): Command {
  return new Command("watch")
    .description("Live signal monitor: active signals, funding rates, positions (30s refresh)")
    .action(async () => {
      let client: PacificaClient | undefined;
      try {
        const config = await loadConfig();
        const signer = createSignerFromConfig(config);
        client = new PacificaClient({ network: config.network, signer });

        const { waitUntilExit } = render(
          <WatchApp client={client} />,
          { exitOnCtrlC: true },
        );

        await waitUntilExit();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\nError: ${message}\n`);
        process.exitCode = 1;
      } finally {
        client?.destroy();
      }
    });
}
