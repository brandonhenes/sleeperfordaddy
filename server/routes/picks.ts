import { Router } from "express";
import { getPowerRankings } from "../services/power-rankings.js";
import {
  getClassStrengthModifier,
  getRookieBoard,
  toPickValue,
} from "../services/pick-values.js";
import { parseClassStrengths } from "../lib/parse-class-strengths.js";

const router = Router();

/** GET /api/picks/rookies/:season */
router.get("/api/picks/rookies/:season", async (req, res) => {
  try {
    const season = req.params.season;
    if (!season) {
      return res.status(400).json({ message: "season is required" });
    }
    const classStrengths = parseClassStrengths(req);
    const rookies = await getRookieBoard(season);
    res.json({
      rookies,
      classStrength: getClassStrengthModifier(season, classStrengths),
      topProspects: rookies.slice(0, 5),
    });
  } catch (err) {
    console.error("[picks/rookies] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/picks/:leagueId/:username */
router.get("/api/picks/:leagueId/:username", async (req, res) => {
  try {
    const { leagueId, username } = req.params;
    if (!leagueId || !username) {
      return res.status(400).json({ message: "leagueId and username are required" });
    }

    const classStrengths = parseClassStrengths(req);
    const leagues = await getPowerRankings(username);
    const league = leagues.find((entry) => entry.league_id === leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const userRoster = league.rosters.find((entry) => entry.is_user);
    if (!userRoster) {
      return res.status(404).json({ message: "User roster not found" });
    }

    const picks = await Promise.all(
      (userRoster.draft_picks ?? []).map((pick) =>
        toPickValue(pick, {
          leagueSize: league.rosters.length,
          format: league.mode,
          classStrengths,
        })
      )
    );

    picks.sort((a, b) => {
      if (b.finalValue !== a.finalValue) return b.finalValue - a.finalValue;
      if (a.season !== b.season) return a.season.localeCompare(b.season);
      return a.round - b.round;
    });

    const picksByRound: Record<string, typeof picks> = {};
    for (const pick of picks) {
      const key = String(pick.round);
      if (!picksByRound[key]) picksByRound[key] = [];
      picksByRound[key].push(pick);
    }

    res.json({
      picks,
      totalPickValue: Math.round(picks.reduce((sum, pick) => sum + pick.finalValue, 0) * 10) / 10,
      picksByRound,
    });
  } catch (err) {
    console.error("[picks] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
