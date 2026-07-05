import { Router } from "express";
import { findTradeBoardLines, findTrades } from "../services/trade-finder.js";
import { findAcquisitionPackages } from "../services/acquisition-finder.js";
import { shopPlayer } from "../services/shop-player.js";
import { parseClassStrengths } from "../lib/parse-class-strengths.js";
import { parseWeights } from "../lib/parse-weights.js";

const router = Router();

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
    const data = await findTradeBoardLines(username, leagueIds, classStrengths, weights);
    res.json(data);
  } catch (err) {
    console.error("[trade-board] Error:", err);
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
    const data = await findTrades(username, leagueId, classStrengths, weights);
    res.json(data);
  } catch (err) {
    console.error("[trade-finder] Error:", err);
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
    const data = await findAcquisitionPackages(
      username,
      decodeURIComponent(playerId),
      classStrengths,
      weights
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
    const data = await shopPlayer(username, playerId, ambition, classStrengths, valueType, weights);
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
