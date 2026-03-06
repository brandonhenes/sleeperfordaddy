import { Router } from "express";
import { getPlayerComparables, getPlayerDetail } from "../services/player.js";
import { parseWeights } from "../lib/parse-weights.js";

const router = Router();

/** GET /api/player/:name?username=... */
router.get("/api/player/:name", async (req, res) => {
  try {
    const playerName = decodeURIComponent(req.params.name);
    const username = (req.query.username as string) || "";
    const weights = parseWeights(req);
    const data = await getPlayerDetail(playerName, username, weights);
    if (!data) {
      return res.status(404).json({ message: "Player not found" });
    }
    res.json(data);
  } catch (err) {
    console.error("[player] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/api/player/:name/comparables", async (req, res) => {
  try {
    const playerName = decodeURIComponent(req.params.name);
    const limit = Number(req.query.limit ?? 5);
    const weights = parseWeights(req);
    const data = await getPlayerComparables(playerName, limit, weights);
    res.json(data);
  } catch (err) {
    console.error("[player/comparables] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
