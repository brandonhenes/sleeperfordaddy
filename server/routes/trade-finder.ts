import { Router } from "express";
import {
  findTradeBoardLines,
  findTrades,
  getTradeBoardCacheSnapshot,
  getTradePartnerTargets,
  precomputeTradeBoardLines,
  prewarmTradeFinderLeague,
} from "../services/trade-finder.js";
import { findAcquisitionPackages } from "../services/acquisition-finder.js";
import { SHOP_QUICK_PLAYER_OPTIONS, shopPlayer } from "../services/shop-player.js";
import { parseClassStrengths } from "../lib/parse-class-strengths.js";
import { parseWeights } from "../lib/parse-weights.js";
import type { TradeFinderConstraint, TradeFinderSearchDepth, TradeStrategyType, TradeSuggestion } from "../../shared/types.js";

const router = Router();

function optionalPositiveInteger(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = String(raw).trim();
  return trimmed || undefined;
}

function optionalStringList(value: unknown): string[] {
  const raw = optionalString(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function optionalSearchDepth(value: unknown): TradeFinderSearchDepth {
  return optionalString(value) === "deep" ? "deep" : "quick";
}

const TRADE_FINDER_CONSTRAINTS = new Set<TradeFinderConstraint>([
  "cheaper",
  "no_firsts",
  "only_qb_tier_down",
  "no_aging_rbs",
  "more_realistic",
  "more_picks_back",
  "no_qbs",
  "no_picks",
  "same_position_return",
  "win_now_only",
]);

const TRADE_FINDER_STRATEGIES = new Set<TradeStrategyType>([
  "consolidation",
  "tier_down",
  "buy_low",
  "sell_high",
  "win_now_buy",
  "rebuild_sell",
  "productive_struggle",
  "pick_arbitrage",
  "position_arbitrage",
  "roster_fit_trade",
  "roster_spot_arbitrage",
  "manager_exploit",
  "liquidity_upgrade",
  "market_value",
]);

function optionalStrategy(value: unknown): TradeStrategyType | undefined {
  const raw = optionalString(value);
  return raw && TRADE_FINDER_STRATEGIES.has(raw as TradeStrategyType)
    ? raw as TradeStrategyType
    : undefined;
}

/** GET /api/trade/board/:username?leagueIds=... */
router.get("/api/trade/board/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const leagueIds = String(req.query.leagueIds ?? "")
      .split(",")
      .map((leagueId) => leagueId.trim())
      .filter(Boolean);
    if (leagueIds.length === 0) {
      return res.status(400).json({ message: "leagueIds query parameter is required" });
    }
    const classStrengths = parseClassStrengths(req);
    const weights = parseWeights(req);
    const cacheFirst = req.query.cacheFirst === "true";
    if (cacheFirst) {
      const snapshot = getTradeBoardCacheSnapshot(username, leagueIds, classStrengths, weights, true);
      if (snapshot) {
        if (snapshot.stale) {
          void precomputeTradeBoardLines(username, leagueIds, classStrengths, weights).catch((error: unknown) => {
            console.error("[trade-board] Background refresh failed:", error);
          });
        }
        return res.json({
          lines: snapshot.data,
          status: "ready",
          cache_status: snapshot.stale ? "stale" : "fresh",
          generated_at: new Date(snapshot.generatedAt).toISOString(),
        });
      }

      void precomputeTradeBoardLines(username, leagueIds, classStrengths, weights).catch((error: unknown) => {
        console.error("[trade-board] Background cache miss build failed:", error);
      });
      return res.json({
        lines: [],
        status: "building",
        cache_status: "miss",
        generated_at: null,
      });
    }

    const data = await findTradeBoardLines(username, leagueIds, classStrengths, weights);
    res.json(data);
  } catch (err) {
    console.error("[trade-board] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/find/:username/:leagueId/prewarm */
router.get("/api/trade/find/:username/:leagueId/prewarm", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    if (!username || !leagueId) {
      return res.status(400).json({ message: "username and leagueId are required" });
    }
    const weights = parseWeights(req);
    await prewarmTradeFinderLeague(username, leagueId, weights);
    res.json({ ok: true });
  } catch (err) {
    console.error("[trade-finder-prewarm] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/find/:username/:leagueId */
router.get("/api/trade/find/:username/:leagueId", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    if (!username || !leagueId) {
      return res.status(400).json({ message: "username and leagueId are required" });
    }
    const classStrengths = parseClassStrengths(req);
    const weights = parseWeights(req);
    const opponentRosterId = optionalPositiveInteger(
      req.query.opponentRosterId ?? req.query.opponent
    );
    const targetPlayerId = optionalString(req.query.targetPlayerId ?? req.query.target);
    const avoidTargetPlayerIds = optionalStringList(req.query.avoidTargetPlayerIds ?? req.query.avoid);
    const constraints = optionalStringList(req.query.constraints).filter((constraint): constraint is TradeFinderConstraint =>
      TRADE_FINDER_CONSTRAINTS.has(constraint as TradeFinderConstraint)
    );
    const strategyFocus = optionalStrategy(req.query.strategy);
    const searchDepth = optionalSearchDepth(req.query.depth);
    const isDeep = searchDepth === "deep";
    const finderOptions = opponentRosterId != null
      ? {
          cacheNamespace: "partner",
          opponentRosterId,
          targetPlayerId,
          avoidTargetPlayerIds,
          constraints,
          strategyFocus,
          searchDepth,
          maxOpponents: 1,
          maxEvaluationsPerOpponent: targetPlayerId
            ? (isDeep ? 24 : 12)
            : (isDeep ? 22 : 16),
          maxPackagesPerPartner: isDeep ? 6 : 5,
        }
      : {
          strategyFocus,
          searchDepth,
          constraints,
          maxOpponents: 5,
          maxEvaluationsPerOpponent: 14,
          maxPackagesPerPartner: isDeep ? 5 : 4,
        };
    let data = await findTrades(username, leagueId, classStrengths, weights, finderOptions);
    if (data.length === 0 && opponentRosterId == null && !isDeep) {
      data = await findTrades(username, leagueId, classStrengths, weights, {
        ...finderOptions,
        cacheNamespace: "empty-fallback",
        searchDepth: "deep",
        maxOpponents: 5,
        maxEvaluationsPerOpponent: 14,
        maxPackagesPerPartner: 5,
      });
    }
    res.json(data);
  } catch (err) {
    console.error("[trade-finder] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/find/:username/:leagueId/targets?opponentRosterId=... */
router.get("/api/trade/find/:username/:leagueId/targets", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    const opponentRosterId = optionalPositiveInteger(req.query.opponentRosterId ?? req.query.opponent);
    if (!username || !leagueId || opponentRosterId == null) {
      return res.status(400).json({ message: "username, leagueId, and opponentRosterId are required" });
    }
    const weights = parseWeights(req);
    const data = await getTradePartnerTargets(username, leagueId, opponentRosterId, weights);
    res.json(data);
  } catch (err) {
    console.error("[trade-finder-targets] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/acquire/:username/:playerId */
router.get("/api/trade/acquire/:username/:playerId", async (req, res) => {
  try {
    const { username, playerId } = req.params;
    if (!username || !playerId) {
      return res.status(400).json({ message: "username and playerId are required" });
    }
    const classStrengths = parseClassStrengths(req);
    const weights = parseWeights(req);
    const limit = optionalPositiveInteger(req.query.limit);
    const data = await findAcquisitionPackages(
      username,
      decodeURIComponent(playerId),
      classStrengths,
      weights,
      { maxOpportunities: limit }
    );
    res.json(data);
  } catch (err) {
    console.error("[acquisition-finder] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/shop/:username/:playerId */
router.get("/api/trade/shop/:username/:playerId", async (req, res) => {
  try {
    const { username, playerId } = req.params;
    if (!username || !playerId) {
      return res.status(400).json({ message: "username and playerId are required" });
    }
    const ambition = Number(req.query.ambition ?? 2);
    const classStrengths = parseClassStrengths(req);
    const weights = parseWeights(req);
    const valueType = req.query.redraft === "true" ? "redraft" as const : "dynasty" as const;
    const depth = optionalString(req.query.depth) === "full" ? "full" : "quick";
    const data = await shopPlayer(
      username,
      playerId,
      ambition,
      classStrengths,
      valueType,
      weights,
      depth === "full"
        ? { cacheNamespace: "full" }
        : SHOP_QUICK_PLAYER_OPTIONS
    );
    if (!data) {
      return res.status(404).json({ message: "Player not found in any league" });
    }
    res.json(data);
  } catch (err) {
    console.error("[shop-player] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
