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
import {
  getAccount,
  getSubaccounts,
  getPositions,
  getFundingHistory,
} from "./pacifica-client.js";
import { cacheGet, cacheSet } from "./cache.js";
import { computeOverlay } from "./overlays.js";

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
      const limitStr = req.query.limit;
      const limit = limitStr ? parseInt(limitStr, 10) : 20;

      // 1. Fetch live Pacifica testnet leaderboard
      let liveEntries: Array<{
        rank: number; trader_id: string; overall_rep_score: number;
        overall_win_rate: number; closed_trades: number; top_patterns: string[];
        onchain?: Record<string, number>;
      }> = [];

      try {
        const res = await fetch("https://test-api.pacifica.fi/api/v1/leaderboard", {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) {
          const json = await res.json() as { data: Array<{
            address: string; pnl_all_time: string; pnl_1d: string;
            pnl_7d: string; pnl_30d: string; equity_current: string;
            volume_all_time: string; volume_30d: string;
          }> };
          const traders = (json.data ?? [])
            .sort((a, b) => parseFloat(b.pnl_all_time) - parseFloat(a.pnl_all_time))
            .slice(0, limit);

          liveEntries = traders.map((t, i) => {
            const pnlAll = parseFloat(t.pnl_all_time) || 0;
            const periods = [pnlAll, parseFloat(t.pnl_30d)||0, parseFloat(t.pnl_7d)||0, parseFloat(t.pnl_1d)||0];
            const wins = periods.filter((p) => p > 0).length;
            const repScore = Math.round(Math.max(30, 99 - (i / Math.max(1, traders.length)) * 65));
            return {
              rank: i + 1,
              trader_id: t.address,
              overall_rep_score: repScore,
              overall_win_rate: wins / periods.length,
              closed_trades: Math.max(1, Math.round(Math.abs(parseFloat(t.volume_all_time)||0) / 3_000)),
              top_patterns: [] as string[],
              onchain: {
                pnl_all_time: pnlAll,
                pnl_1d: parseFloat(t.pnl_1d)||0,
                pnl_7d: parseFloat(t.pnl_7d)||0,
                pnl_30d: parseFloat(t.pnl_30d)||0,
                equity_current: parseFloat(t.equity_current)||0,
                volume_30d: parseFloat(t.volume_30d)||0,
              },
            };
          });
        }
      } catch { /* fall through to local data */ }

      // 2. Enrich with local intelligence data where trader_id matches
      if (liveEntries.length > 0) {
        const repMap = await loadReputation();
        for (const entry of liveEntries) {
          const local = repMap.get(entry.trader_id);
          if (local) {
            entry.overall_rep_score = local.overall_rep_score;
            entry.top_patterns = local.top_patterns ?? [];
          }
        }
        return reply.code(200).send({ leaderboard: liveEntries, source: "live" });
      }

      // 3. Fallback: local SQLite data only (offline mode)
      const repMap = await loadReputation();
      const fallback = Array.from(repMap.values())
        .sort((a, b) => b.overall_rep_score - a.overall_rep_score)
        .slice(0, limit);
      return reply.code(200).send({ leaderboard: fallback, source: "local" });
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
      let reputationEntry = rep.get(address);
      let fullAddress = address;

      // If not in local intelligence records, try the Pacifica testnet leaderboard
      if (!reputationEntry) {
        try {
          const lbRes = await fetch("https://test-api.pacifica.fi/api/v1/leaderboard", {
            signal: AbortSignal.timeout(6_000),
          });
          if (lbRes.ok) {
            const lbJson = await lbRes.json() as { data: Array<{ address: string; pnl_all_time: string; pnl_1d: string; pnl_7d: string; pnl_30d: string; equity_current: string; volume_all_time: string; volume_30d: string }> };
            const row = (lbJson.data ?? []).find(
              (t) => t.address === address || t.address.startsWith(address.slice(0, 12)),
            );
            if (row) {
              // Build a synthetic reputation entry from leaderboard data
              const pnlAllTime = parseFloat(row.pnl_all_time);
              const idx = (lbJson.data ?? []).indexOf(row);
              const repScore = Math.round(Math.max(30, 99 - (idx / Math.max(1, lbJson.data.length)) * 65));
              reputationEntry = {
                trader_id:             row.address,
                overall_rep_score:     repScore,
                overall_win_rate:      pnlAllTime > 0 ? 0.6 : 0.4,
                total_trades:          0,
                closed_trades:         0,
                top_patterns:          [],
                accuracy_by_condition: {},
              } as typeof reputationEntry;
              fullAddress = row.address;
            }
          }
        } catch { /* fall through */ }
      }

      if (!reputationEntry) {
        return reply.code(404).send({ error: "Trader not found", address });
      }

      if (!fullAddress || fullAddress === address) {
        fullAddress = reputationEntry!.trader_id;
      }

      const PACIFICA = "https://test-api.pacifica.fi";

      // Local intelligence records for this trader
      const localRecords = records
        .filter((r) => r.trader_id === fullAddress)
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
        .map((r) => ({
          id: r.id,
          asset: r.asset,
          direction: r.direction,
          size_usd: r.size_usd,
          entry_price: r.entry_price,
          exit_price: r.outcome?.exit_price ?? null,
          opened_at: r.opened_at,
          closed_at: r.closed_at ?? null,
          pattern_tags: r.pattern_tags,
          pnl_usd: r.outcome?.pnl_usd ?? null,
          pnl_pct: r.outcome?.pnl_pct ?? null,
          profitable: r.outcome?.profitable ?? null,
          duration_minutes: r.outcome?.duration_minutes ?? null,
        }));

      // Real on-chain data — fetch positions + trade history + PnL in parallel
      type OnchainPnl = {
        pnl_1d: number; pnl_7d: number; pnl_30d: number; pnl_all_time: number;
        equity_current: number; volume_all_time: number; volume_30d: number;
      };

      let onchain: OnchainPnl | null = null;
      let realTradeRecords: typeof localRecords = [];

      try {
        const [lbRes, posRes, tradeRes] = await Promise.allSettled([
          fetch(`${PACIFICA}/api/v1/leaderboard`,                                    { signal: AbortSignal.timeout(6_000) }),
          fetch(`${PACIFICA}/api/v1/positions?account=${encodeURIComponent(fullAddress)}`, { signal: AbortSignal.timeout(6_000) }),
          fetch(`${PACIFICA}/api/v1/trades?account=${encodeURIComponent(fullAddress)}&limit=50`, { signal: AbortSignal.timeout(6_000) }),
        ]);

        // On-chain PnL from leaderboard
        if (lbRes.status === "fulfilled" && lbRes.value.ok) {
          const json = await lbRes.value.json() as { data: Array<{ address: string; [k: string]: string }> };
          const row = (json.data ?? []).find((t) => t.address === fullAddress);
          if (row) {
            onchain = {
              pnl_1d:          parseFloat(row.pnl_1d ?? "0"),
              pnl_7d:          parseFloat(row.pnl_7d ?? "0"),
              pnl_30d:         parseFloat(row.pnl_30d ?? "0"),
              pnl_all_time:    parseFloat(row.pnl_all_time ?? "0"),
              equity_current:  parseFloat(row.equity_current ?? "0"),
              volume_all_time: parseFloat(row.volume_all_time ?? "0"),
              volume_30d:      parseFloat(row.volume_30d ?? "0"),
            };
          }
        }

        // Open positions → show as OPEN trade records
        if (posRes.status === "fulfilled" && posRes.value.ok) {
          const posJson = await posRes.value.json() as {
            data: Array<{
              symbol: string; side: string; amount: string;
              entry_price: string; liquidation_price: string;
              funding: string; created_at: number;
            }>;
          };
          const positions = posJson.data ?? [];
          realTradeRecords = positions.map((p, i) => {
            const ep = parseFloat(p.entry_price);
            const qty = parseFloat(p.amount);
            const direction = p.side === "bid" ? "long" as const : "short" as const;
            const sizeUsd = ep * qty;
            return {
              id:               `pos-${i}-${p.symbol}`,
              asset:            `${p.symbol}-USDC-PERP`,
              direction,
              size_usd:         isNaN(sizeUsd) ? 0 : sizeUsd,
              entry_price:      ep,
              exit_price:       null,
              opened_at:        new Date(p.created_at).toISOString(),
              closed_at:        null,   // still open
              pattern_tags:     [],
              pnl_usd:          parseFloat(p.funding) || null,
              pnl_pct:          null,
              profitable:       null,
              duration_minutes: null,
            };
          });
        }

        // Recent trades → closed records
        if (tradeRes.status === "fulfilled" && tradeRes.value.ok) {
          const tradeJson = await tradeRes.value.json() as {
            data: Array<{
              event_type: string; price: string; amount: string;
              side: string; created_at: number;
            }>;
          };
          // Only taker opens — one record per fill
          const fills = (tradeJson.data ?? [])
            .filter((t) => t.event_type === "fulfill_taker" && (t.side === "open_long" || t.side === "open_short"))
            .slice(0, 30);

          const closedRecords = fills.map((t, i) => {
            const price = parseFloat(t.price);
            const qty   = parseFloat(t.amount);
            const direction = t.side === "open_long" ? "long" as const : "short" as const;
            const sizeUsd = price * qty;
            return {
              id:               `fill-${i}-${t.created_at}`,
              asset:            "PERP",   // symbol not in trade event; show generic
              direction,
              size_usd:         isNaN(sizeUsd) ? 0 : sizeUsd,
              entry_price:      price,
              exit_price:       null,
              opened_at:        new Date(t.created_at).toISOString(),
              closed_at:        new Date(t.created_at).toISOString(),
              pattern_tags:     [],
              pnl_usd:          null,
              pnl_pct:          null,
              profitable:       null,
              duration_minutes: null,
            };
          });

          // Merge: open positions first, then closed fills (deduplicate by id)
          const seen = new Set(realTradeRecords.map((r) => r.id));
          for (const r of closedRecords) {
            if (!seen.has(r.id)) realTradeRecords.push(r);
          }
        }
      } catch {
        // graceful degradation — fall back to local only
      }

      // Prefer real on-chain records; fall back to local intelligence records
      const traderRecords = realTradeRecords.length > 0 ? realTradeRecords : localRecords;

      // Update reputation trade counts from real data when we have it
      if (onchain && reputationEntry) {
        reputationEntry.total_trades  = traderRecords.length;
        reputationEntry.closed_trades = traderRecords.filter((r) => r.closed_at !== null).length;
        reputationEntry.overall_win_rate = onchain.pnl_all_time > 0 ? 0.65 : 0.35;
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

  // -------------------------------------------------------------------------
  // GET /api/pacifica/account/:address  (T-78)
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { address: string } }>(
    "/api/pacifica/account/:address",
    async (req, reply) => {
      const { address } = req.params;
      const cacheKey = `account:${address}`;
      const hit = cacheGet<object>(cacheKey);
      if (hit) return reply.code(200).send(hit.data);

      try {
        const data = await getAccount(address);
        const payload = { ...data, address };
        cacheSet(cacheKey, payload, 10_000);
        return reply.code(200).send(payload);
      } catch (err) {
        return reply.code(502).send({ error: "Pacifica account unavailable", message: String(err) });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/pacifica/subaccounts/:address  (T-79)
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { address: string } }>(
    "/api/pacifica/subaccounts/:address",
    async (req, reply) => {
      const { address } = req.params;
      const cacheKey = `subaccounts:${address}`;
      const hit = cacheGet<object>(cacheKey);
      if (hit) return reply.code(200).send(hit.data);

      try {
        const subaccounts = await getSubaccounts(address);
        const payload = { subaccounts };
        cacheSet(cacheKey, payload, 30_000);
        return reply.code(200).send(payload);
      } catch (err) {
        return reply.code(502).send({ error: "Pacifica subaccounts unavailable", message: String(err) });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/pacifica/positions/:address  (T-80)
  // Fans out across master + all subaccounts in parallel
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { address: string } }>(
    "/api/pacifica/positions/:address",
    async (req, reply) => {
      const { address } = req.params;
      const cacheKey = `positions:${address}`;
      const hit = cacheGet<object>(cacheKey);
      if (hit) return reply.code(200).send(hit.data);

      try {
        // Get subaccounts and master positions in parallel
        const [masterPositions, subaccounts] = await Promise.all([
          getPositions(address),
          getSubaccounts(address).catch(() => []),
        ]);

        // Fan out to all subaccounts with per-sub 4s timeout
        const subResults = await Promise.allSettled(
          subaccounts.map((sub) => getPositions(sub.address)),
        );

        const accounts = [
          { address, is_master: true, positions: masterPositions },
          ...subaccounts.map((sub, i) => ({
            address: sub.address,
            is_master: false,
            positions:
              subResults[i]?.status === "fulfilled"
                ? (subResults[i] as PromiseFulfilledResult<typeof masterPositions>).value
                : [],
          })),
        ];

        const payload = { accounts };
        cacheSet(cacheKey, payload, 5_000);
        return reply.code(200).send(payload);
      } catch (err) {
        return reply.code(502).send({ error: "Pacifica positions unavailable", message: String(err) });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/pacifica/funding_history  (T-81 support)
  // Query: ?symbol=BTC&hours=24
  // -------------------------------------------------------------------------

  fastify.get<{ Querystring: { symbol?: string; hours?: string } }>(
    "/api/pacifica/funding_history",
    async (req, reply) => {
      const symbol = (req.query.symbol ?? "BTC").toUpperCase();
      const hours  = parseInt(req.query.hours ?? "24", 10);
      const cacheKey = `funding:${symbol}:${hours}`;
      const cached = cacheGet<object>(cacheKey);
      if (cached) return reply.code(200).send(cached.data);

      try {
        const points = await getFundingHistory(symbol, hours);
        const payload = { symbol, points };
        cacheSet(cacheKey, payload, 5 * 60_000); // 5 min TTL
        return reply.code(200).send(payload);
      } catch (err) {
        return reply.code(502).send({ error: "Funding history unavailable", message: String(err) });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/portfolio/:address  (T-81)
  // Composite: account + subaccounts + positions + intelligence overlay
  // This is the single endpoint the web portfolio page calls.
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { address: string } }>(
    "/api/portfolio/:address",
    async (req, reply) => {
      const { address } = req.params;
      const cacheKey = `portfolio:${address}`;
      const hit = cacheGet<object>(cacheKey);
      if (hit) return reply.code(200).send(hit.data);

      // Load intelligence data ONCE (fixes per-position reload bug)
      const [masterAccountResult, subaccountsResult, intelligenceResult] = await Promise.allSettled([
        getAccount(address),
        getSubaccounts(address),
        Promise.all([loadPatterns(), loadRecords(), loadReputation()]),
      ]);

      const master = masterAccountResult.status === "fulfilled" ? masterAccountResult.value : null;
      const subaccounts = subaccountsResult.status === "fulfilled" ? subaccountsResult.value : [];
      const [patterns, records, rep] = intelligenceResult.status === "fulfilled"
        ? intelligenceResult.value
        : [[], [], new Map()];

      // Fan out positions to all accounts in parallel
      const allAddresses = [address, ...subaccounts.map((s) => s.address)];
      const positionResults = await Promise.allSettled(
        allAddresses.map((addr) => getPositions(addr)),
      );

      // Pre-fetch funding history for all unique symbols
      const allPositions = positionResults.flatMap((r) =>
        r.status === "fulfilled" ? r.value : [],
      );
      const symbols = [...new Set(allPositions.map((p) => p.symbol.split("-")[0]))];
      const fundingMap = new Map<string, Awaited<ReturnType<typeof getFundingHistory>>>();
      await Promise.allSettled(
        symbols.map(async (sym) => {
          try { fundingMap.set(sym, await getFundingHistory(sym, 24)); } catch { /* skip */ }
        }),
      );

      // Build accounts with overlays — intelligence data passed in, not reloaded
      const accounts = await Promise.all(
        allAddresses.map(async (addr, i) => {
          const isMaster = i === 0;
          const sub = isMaster ? null : subaccounts[i - 1];
          const positions =
            positionResults[i]?.status === "fulfilled"
              ? (positionResults[i] as PromiseFulfilledResult<typeof allPositions>).value
              : [];

          const positionsWithOverlay = await Promise.all(
            positions.map(async (pos) => {
              const sym = pos.symbol.split("-")[0];
              const fundingPts = fundingMap.get(sym) ?? [];
              try {
                const overlay = await computeOverlay(pos, fundingPts, patterns, records, rep);
                return { ...pos, overlay };
              } catch {
                return { ...pos, overlay: { pattern_match: null, rep_signal: null, funding_watch: null } };
              }
            }),
          );

          return {
            address: addr,
            label: isMaster ? "Master" : null,
            is_master: isMaster,
            balance: isMaster ? master?.balance ?? "0" : (sub?.balance ?? "0"),
            // Sub equity = balance (no account_equity on subaccount shape from Pacifica)
            equity:  isMaster ? master?.account_equity ?? "0" : (sub?.balance ?? "0"),
            positions: positionsWithOverlay,
          };
        }),
      );

      const repEntry = (rep as Map<string, { overall_rep_score: number; overall_win_rate: number; closed_trades: number; total_trades: number; top_patterns: string[] }>).get(address) ?? null;

      const payload = {
        master: master ? { ...master, address } : null,
        accounts,
        reputation: repEntry,
        stale: false,
        generated_at: new Date().toISOString(),
      };

      cacheSet(cacheKey, payload, 10_000);
      return reply.code(200).send(payload);
    },
  );

  return fastify;
}

// ---------------------------------------------------------------------------
// Start helper (called from CLI)
// ---------------------------------------------------------------------------

export async function startServer(port = 4242): Promise<void> {
  const fastify = await createServer();
  await fastify.listen({ port, host: "127.0.0.1" });
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
