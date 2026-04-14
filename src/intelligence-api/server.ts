// ---------------------------------------------------------------------------
// Pacifica Intelligence API Server
// ---------------------------------------------------------------------------
// Fastify REST API exposing the M11 intelligence layer to web clients.
// Port: 4242, CORS: localhost:3000
// ---------------------------------------------------------------------------

import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "../core/config/loader.js";
import {
  loadRecords,
  loadPatterns,
  loadReputation,
} from "../core/intelligence/store.js";
import { fetchSocialContext } from "../core/intelligence/social.js";
import { scoreConfidence } from "../core/intelligence/engine.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function createServer() {
  const fastify = Fastify({ logger: false });

  await fastify.register(cors, {
    origin: ["http://localhost:3000", "http://localhost:4242"],
    methods: ["GET"],
  });

  // -------------------------------------------------------------------------
  // GET /health
  // -------------------------------------------------------------------------

  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // -------------------------------------------------------------------------
  // GET /api/intelligence/feed
  // -------------------------------------------------------------------------

  fastify.get("/api/intelligence/feed", async (_req, reply) => {
    const [records, patterns, rep] = await Promise.all([
      loadRecords(),
      loadPatterns(),
      loadReputation(),
    ]);

    // Active (verified) patterns
    const active_patterns = patterns.filter((p) => p.verified);

    // Whale activity: records with large_orders_count >= 3, sorted desc, limit 20
    const whale_activity = records
      .filter((r) => r.market_context.large_orders_count >= 3)
      .sort(
        (a, b) =>
          new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime(),
      )
      .slice(0, 20)
      .map((r) => ({
        asset: r.asset,
        direction: r.direction,
        size_usd: r.size_usd,
        large_orders_count: r.market_context.large_orders_count,
        opened_at: r.opened_at,
      }));

    // High rep signals: open records where rep_score > 70
    const high_rep_signals = records
      .filter((r) => {
        if (r.closed_at !== undefined) return false;
        const trader = rep.get(r.trader_id);
        return trader !== undefined && trader.overall_rep_score > 70;
      })
      .map((r) => {
        const trader = rep.get(r.trader_id)!;
        return {
          asset: r.asset,
          direction: r.direction,
          size_usd: r.size_usd,
          rep_score: trader.overall_rep_score,
          opened_at: r.opened_at,
        };
      });

    const market_overview = {
      total_records: records.length,
      verified_patterns: patterns.length,
      total_traders: rep.size,
    };

    return reply.code(200).send({
      active_patterns,
      whale_activity,
      high_rep_signals,
      market_overview,
      generated_at: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/intelligence/snapshot/:market
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { market: string } }>(
    "/api/intelligence/snapshot/:market",
    async (req, reply) => {
      const { market } = req.params;
      const [records, patterns] = await Promise.all([
        loadRecords(),
        loadPatterns(),
      ]);

      // Most recent record for this market
      const marketRecords = records
        .filter((r) => r.asset.toLowerCase().includes(market.toLowerCase()))
        .sort(
          (a, b) =>
            new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime(),
        );

      const latest = marketRecords[0];

      const current_conditions = latest
        ? {
            funding_rate: latest.market_context.funding_rate,
            open_interest_usd: latest.market_context.open_interest_usd,
            buy_pressure: latest.market_context.buy_pressure,
            momentum_signal: latest.market_context.momentum_signal,
            large_orders_count: latest.market_context.large_orders_count,
            mark_price: latest.market_context.mark_price,
          }
        : {
            funding_rate: -0.0003,
            open_interest_usd: 120_000_000,
            buy_pressure: 0.62,
            momentum_signal: "bullish",
            large_orders_count: 2,
            mark_price: 0,
          };

      // Matching patterns: simple heuristic — patterns whose primary_assets include the market
      const matching_patterns = patterns.filter(
        (p) =>
          p.verified &&
          p.primary_assets.some((a) =>
            a.toLowerCase().includes(market.toLowerCase()),
          ),
      );

      // Best pattern match: highest win_rate
      const best_pattern_match =
        matching_patterns.length > 0
          ? matching_patterns.reduce((best, p) =>
              p.win_rate > best.win_rate ? p : best,
            )
          : null;

      const agent_summary = best_pattern_match
        ? `${market.toUpperCase()} matches pattern "${best_pattern_match.name}" with ${(best_pattern_match.win_rate * 100).toFixed(1)}% win rate across ${best_pattern_match.sample_size} trades. Current conditions ${current_conditions.momentum_signal}.`
        : `${market.toUpperCase()} has no strongly matching verified patterns in current conditions. ${marketRecords.length} records in history.`;

      return reply.code(200).send({
        market,
        current_conditions,
        matching_patterns,
        best_pattern_match,
        agent_summary,
        generated_at: new Date().toISOString(),
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/intelligence/patterns
  // -------------------------------------------------------------------------

  fastify.get<{
    Querystring: { sort?: string; min_win_rate?: string };
  }>("/api/intelligence/patterns", async (req, reply) => {
    let patterns = await loadPatterns();

    const { sort, min_win_rate } = req.query;

    // Filter by min_win_rate
    if (min_win_rate !== undefined) {
      const minRate = parseFloat(min_win_rate);
      if (!isNaN(minRate)) {
        patterns = patterns.filter((p) => p.win_rate >= minRate);
      }
    }

    // Sort
    if (sort === "sample_size") {
      patterns.sort((a, b) => b.sample_size - a.sample_size);
    } else {
      // Default: win_rate desc
      patterns.sort((a, b) => b.win_rate - a.win_rate);
    }

    return reply.code(200).send(patterns);
  });

  // -------------------------------------------------------------------------
  // GET /api/intelligence/patterns/:id
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { id: string } }>(
    "/api/intelligence/patterns/:id",
    async (req, reply) => {
      const patterns = await loadPatterns();
      const pattern = patterns.find((p) => p.id === req.params.id);

      if (!pattern) {
        return reply
          .code(404)
          .send({ error: "Pattern not found", id: req.params.id });
      }

      return reply.code(200).send(pattern);
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/intelligence/social/:asset
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { asset: string } }>(
    "/api/intelligence/social/:asset",
    async (req, reply) => {
      const { asset } = req.params;
      const ticker = asset.toUpperCase().split("-")[0] ?? asset.toUpperCase();

      let elfaKey: string | undefined;
      try {
        const cfg = await loadConfig();
        elfaKey = cfg.elfa?.api_key;
        const cacheTtl = cfg.elfa?.cache_ttl_minutes;

        if (!elfaKey) {
          return reply.code(503).send({
            error: "Elfa not configured",
            message: "Add elfa.api_key to ~/.pacifica.yaml to enable social intelligence",
          });
        }

        const social = await fetchSocialContext(ticker, elfaKey, cacheTtl);
        if (!social) {
          return reply.code(502).send({ error: "Failed to fetch social context from Elfa" });
        }

        // Optionally enrich with pattern confidence scores
        const patterns = await loadPatterns();
        const confirmed_signals = patterns
          .filter((p) => p.verified)
          .map((p) => {
            const { confidence, reason } = scoreConfidence(p, social);
            return { pattern_name: p.name, pattern_id: p.id, win_rate: p.win_rate, confidence, reason };
          });

        const ORDER = ["high", "medium", "low", "unconfirmed"] as const;
        confirmed_signals.sort(
          (a, b) => ORDER.indexOf(a.confidence as typeof ORDER[number]) - ORDER.indexOf(b.confidence as typeof ORDER[number]),
        );

        return reply.code(200).send({
          asset: ticker,
          social,
          confirmed_signals,
          best_signal: confirmed_signals[0] ?? null,
          generated_at: new Date().toISOString(),
        });
      } catch (err) {
        return reply.code(500).send({
          error: "Internal error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/intelligence/reputation
  // -------------------------------------------------------------------------

  fastify.get<{ Querystring: { limit?: string } }>(
    "/api/intelligence/reputation",
    async (req, reply) => {
      const rep = await loadReputation();

      let entries = Array.from(rep.values()).sort(
        (a, b) => b.overall_rep_score - a.overall_rep_score,
      );

      const limitStr = req.query.limit;
      if (limitStr !== undefined) {
        const limit = parseInt(limitStr, 10);
        if (!isNaN(limit) && limit > 0) {
          entries = entries.slice(0, limit);
        }
      }

      // Return full trader_id — truncation happens in the UI
      const leaderboard = entries.map((e) => ({ ...e }));

      return reply.code(200).send({ leaderboard });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/real/leaderboard — live Pacifica testnet leaderboard
  // -------------------------------------------------------------------------

  fastify.get<{ Querystring: { limit?: string; network?: string } }>(
    "/api/real/leaderboard",
    async (req, reply) => {
      const network = req.query.network ?? "testnet";
      const baseUrl = network === "mainnet"
        ? "https://api.pacifica.fi"
        : "https://test-api.pacifica.fi";

      const limitStr = req.query.limit;
      const limit = limitStr ? parseInt(limitStr, 10) : 20;

      try {
        const res = await fetch(`${baseUrl}/api/v1/leaderboard`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`Leaderboard API ${res.status}`);
        const json = await res.json() as { success: boolean; data: unknown[] };
        const traders = (json.data ?? []) as Array<{
          address: string;
          pnl_all_time: string;
          pnl_1d: string;
          pnl_7d: string;
          pnl_30d: string;
          equity_current: string;
          volume_all_time: string;
          volume_30d: string;
        }>;

        // Sort by all-time PnL descending
        const sorted = [...traders].sort(
          (a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time),
        );

        const entries = sorted.slice(0, limit).map((t, i) => {
          const pnlAllTime = parseFloat(t.pnl_all_time);
          const pnl1d     = parseFloat(t.pnl_1d);
          const pnl7d     = parseFloat(t.pnl_7d);
          const pnl30d    = parseFloat(t.pnl_30d);

          // Rep score: 99 for top rank, decays by position, clamped to 30 minimum
          const repScore = Math.round(Math.max(30, 99 - (i / Math.max(1, sorted.length)) * 65));

          // Win rate: fraction of measurable periods that are profitable
          const periods = [pnlAllTime, pnl30d, pnl7d, pnl1d].filter((p) => !isNaN(p));
          const positive = periods.filter((p) => p > 0).length;
          const winRate  = periods.length > 0 ? positive / periods.length : 0.5;

          // Trade count: approximate from all-time volume / $3k avg trade
          const volumeAllTime = Math.abs(parseFloat(t.volume_all_time) || 0);
          const approxTrades  = Math.max(1, Math.round(volumeAllTime / 3_000));

          return {
            rank: i + 1,
            trader_id: t.address,
            overall_rep_score: repScore,
            overall_win_rate: winRate,
            closed_trades: approxTrades,
            top_patterns: [] as string[],
          };
        });

        return reply.code(200).send({ leaderboard: entries, source: "live", network });
      } catch (err) {
        return reply.code(502).send({
          error: "Pacifica leaderboard unavailable",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/real/markets — live Pacifica testnet market data
  // -------------------------------------------------------------------------

  fastify.get<{ Querystring: { network?: string; sort?: string; limit?: string } }>(
    "/api/real/markets",
    async (req, reply) => {
      const network = req.query.network ?? "testnet";
      const baseUrl = network === "mainnet"
        ? "https://api.pacifica.fi"
        : "https://test-api.pacifica.fi";
      const sort  = req.query.sort ?? "open_interest";
      const limitStr = req.query.limit;
      const limit = limitStr ? parseInt(limitStr, 10) : 30;

      try {
        const [infoRes, pricesRes] = await Promise.all([
          fetch(`${baseUrl}/api/v1/info`,        { signal: AbortSignal.timeout(8_000) }),
          fetch(`${baseUrl}/api/v1/info/prices`, { signal: AbortSignal.timeout(8_000) }),
        ]);
        if (!infoRes.ok || !pricesRes.ok) throw new Error("Pacifica market API error");

        const infoJson   = await infoRes.json()   as { data: unknown[] };
        const pricesJson = await pricesRes.json() as { data: unknown[] };

        const infos  = (infoJson.data   ?? []) as Array<{ symbol: string; funding_rate: string; max_leverage: number }>;
        const prices = (pricesJson.data ?? []) as Array<{
          symbol: string; mark: string; funding: string; next_funding: string;
          open_interest: string; volume_24h: string; yesterday_price: string;
        }>;

        const priceMap = new Map(prices.map((p) => [p.symbol, p]));

        const markets = infos
          .map((info) => {
            const p = priceMap.get(info.symbol);
            if (!p) return null;
            const mark     = parseFloat(p.mark     || "0");
            const oi       = parseFloat(p.open_interest || "0");
            const vol24h   = parseFloat(p.volume_24h   || "0");
            const funding  = parseFloat(p.funding      || info.funding_rate || "0");
            const yesterday = parseFloat(p.yesterday_price || "-1");
            const pct24h   = yesterday > 0 ? (mark - yesterday) / yesterday : 0;
            return {
              symbol: info.symbol,
              mark_price: mark,
              funding_rate: funding,
              next_funding_rate: parseFloat(p.next_funding || "0"),
              open_interest_usd: oi * mark, // OI in contracts → USD
              volume_24h_usd: vol24h * mark,
              price_change_24h_pct: pct24h,
              max_leverage: info.max_leverage,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null && m.mark_price > 0);

        // Sort
        if (sort === "volume")   markets.sort((a, b) => b.volume_24h_usd   - a.volume_24h_usd);
        else if (sort === "funding") markets.sort((a, b) => Math.abs(b.funding_rate) - Math.abs(a.funding_rate));
        else                    markets.sort((a, b) => b.open_interest_usd - a.open_interest_usd); // default

        return reply.code(200).send({
          markets: markets.slice(0, limit),
          total: markets.length,
          source: "live",
          network,
          generated_at: new Date().toISOString(),
        });
      } catch (err) {
        return reply.code(502).send({
          error: "Pacifica markets API unavailable",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/intelligence/trader/:address
  // Returns reputation + all trade records for a specific trader wallet.
  // Also fetches real on-chain PnL from the Pacifica testnet leaderboard.
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { address: string } }>(
    "/api/intelligence/trader/:address",
    async (req, reply) => {
      const { address } = req.params;

      const [records, rep] = await Promise.all([
        loadRecords(),
        loadReputation(),
      ]);

      // Match by full address or by prefix (for truncated links)
      const reputationEntry = rep.get(address)
        ?? Array.from(rep.values()).find((e) => e.trader_id.startsWith(address));

      if (!reputationEntry) {
        return reply.code(404).send({ error: "Trader not found", address });
      }

      const fullAddress = reputationEntry.trader_id;

      // All intelligence records for this trader
      const traderRecords = records
        .filter((r) => r.trader_id === fullAddress)
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        .map((r) => ({
          id: r.id,
          asset: r.asset,
          direction: r.direction,
          size_usd: r.size_usd,
          entry_price: r.entry_price,
          exit_price: r.exit_price ?? null,
          opened_at: r.opened_at,
          closed_at: r.closed_at ?? null,
          pattern_tags: r.pattern_tags,
          pnl_usd: r.outcome?.pnl_usd ?? null,
          pnl_pct: r.outcome?.pnl_pct ?? null,
          profitable: r.outcome?.profitable ?? null,
          duration_minutes: r.outcome?.duration_minutes ?? null,
        }));

      // Real on-chain PnL from Pacifica testnet leaderboard
      let onchain: {
        pnl_1d: number; pnl_7d: number; pnl_30d: number; pnl_all_time: number;
        equity_current: number; volume_all_time: number; volume_30d: number;
      } | null = null;

      try {
        const lb = await fetch("https://test-api.pacifica.fi/api/v1/leaderboard", {
          signal: AbortSignal.timeout(6_000),
        });
        if (lb.ok) {
          const json = await lb.json() as { data: Array<{ address: string; [k: string]: string }> };
          const row = (json.data ?? []).find(
            (t) => t.address === fullAddress || t.address.startsWith(address.slice(0, 12)),
          );
          if (row) {
            onchain = {
              pnl_1d:         parseFloat(row.pnl_1d ?? "0"),
              pnl_7d:         parseFloat(row.pnl_7d ?? "0"),
              pnl_30d:        parseFloat(row.pnl_30d ?? "0"),
              pnl_all_time:   parseFloat(row.pnl_all_time ?? "0"),
              equity_current: parseFloat(row.equity_current ?? "0"),
              volume_all_time:parseFloat(row.volume_all_time ?? "0"),
              volume_30d:     parseFloat(row.volume_30d ?? "0"),
            };
          }
        }
      } catch {
        // onchain stays null — graceful degradation
      }

      return reply.code(200).send({
        address: fullAddress,
        reputation: reputationEntry,
        trade_records: traderRecords,
        onchain_pnl: onchain,
        generated_at: new Date().toISOString(),
      });
    },
  );

  return fastify;
}

// ---------------------------------------------------------------------------
// Start helper (called from CLI)
// ---------------------------------------------------------------------------

export async function startServer(port = 4242): Promise<void> {
  const fastify = await createServer();
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`Pacifica Intelligence API running on http://localhost:${port}`);
}

// ---------------------------------------------------------------------------
// Entrypoint — run directly: node dist/intelligence-api.js
// Only auto-starts when this file is the process entrypoint, not when imported.
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("intelligence-api.js") ||
    process.argv[1].endsWith("intelligence-api/server.js"));

if (isMain) {
  startServer().catch((err) => {
    console.error("Failed to start intelligence API:", err);
    process.exit(1);
  });
}
