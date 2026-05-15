import { Router } from "express";
import { evaluateTrade, searchTradeAssets } from "../services/trade-calculator.js";
import { parseWeights } from "../lib/parse-weights.js";
import { parseClassStrengths } from "../lib/parse-class-strengths.js";
import { buildLeagueBehaviors, type OpponentContext } from "../services/manager-behavior.js";
import { getPowerRankings } from "../services/power-rankings.js";
import { validateTradeAssets } from "../services/trade-asset-validation.js";
import type { TradeAssetInput } from "../../shared/types.js";

const router = Router();

/** GET /api/trade/assets?q=... */
router.get("/api/trade/assets", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit ?? 20);
    const data = await searchTradeAssets(q, limit);
    res.json(data);
  } catch (err) {
    console.error("[trade-calculator] Search error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/trade/evaluate */
router.post("/api/trade/evaluate", async (req, res) => {
  try {
    const { sideA, sideB, mode, leagueId } = req.body as {
      sideA: TradeAssetInput[];
      sideB: TradeAssetInput[];
      mode?: "sf" | "1qb";
      leagueId?: string;
    };
    if (!sideA?.length || !sideB?.length) {
      return res.status(400).json({
        message: "sideA and sideB are required",
        warnings: validateTradeAssets(sideA ?? [], sideB ?? []),
      });
    }
    const weights = parseWeights(req);
    const classStrengths = parseClassStrengths(req);
    const valueType = req.query.redraft === "true" ? "redraft" as const : "dynasty" as const;
    const data = await evaluateTrade(
      sideA,
      sideB,
      mode ?? "sf",
      valueType,
      weights,
      leagueId,
      classStrengths
    );
    res.json(data);
  } catch (err) {
    console.error("[trade-calculator] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/trade/opponent-context/:username/:leagueId */
router.get("/api/trade/opponent-context/:username/:leagueId", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    if (!username || !leagueId) return res.status(400).json({ message: "username and leagueId required" });

    const valueType = req.query.redraft === "true" ? "redraft" as const : "dynasty" as const;
    const allLeagues = await getPowerRankings(username, valueType);
    const league = allLeagues.find((l) => l.league_id === leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });

    const behaviors = await buildLeagueBehaviors(leagueId);
    const POSITIONS = ["QB", "RB", "WR", "TE"];
    const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

    const medians: Record<string, number> = {};
    for (const pos of POSITIONS) {
      const scores: number[] = [];
      for (const r of league.rosters) {
        const top = r.core_assets
          .filter((a) => a.position === pos)
          .sort((a, b) => b.edge_score - a.edge_score)
          .slice(0, (MIN_STARTERS[pos] ?? 1) + 1);
        scores.push(...top.map((a) => a.edge_score));
      }
      scores.sort((a, b) => a - b);
      const mid = Math.floor(scores.length / 2);
      medians[pos] = scores.length > 0
        ? (scores.length % 2 !== 0 ? scores[mid] : ((scores[mid - 1] ?? 0) + (scores[mid] ?? 0)) / 2)
        : 0;
    }

    const opponents: OpponentContext[] = [];
    for (const r of league.rosters) {
      if (r.is_user) continue;

      const needs: string[] = [];
      const surplus: string[] = [];
      const topByPos: Record<string, string> = {};

      for (const pos of POSITIONS) {
        const posPlayers = r.core_assets
          .filter((a) => a.position === pos)
          .sort((a, b) => b.edge_score - a.edge_score);
        if (posPlayers[0]) topByPos[pos] = posPlayers[0].player_id;
        const aboveMedian = posPlayers.filter((p) => p.edge_score > (medians[pos] ?? 60));
        if (aboveMedian.length < (MIN_STARTERS[pos] ?? 1)) needs.push(pos);
        if (aboveMedian.length > (MIN_STARTERS[pos] ?? 1) + 1) surplus.push(pos);
      }

      opponents.push({
        roster_id: r.roster_id,
        display_name: r.display_name,
        team_name: null,
        archetype: r.archetype,
        needs,
        surplus,
        top_player_ids_by_pos: topByPos,
        behavior: behaviors.get(r.roster_id) ?? null,
      });
    }

    res.json({ league_id: leagueId, opponents });
  } catch (err) {
    console.error("[opponent-context] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
