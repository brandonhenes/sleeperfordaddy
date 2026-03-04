import { Router } from "express";
import { findTrades } from "../services/trade-finder.js";

const router = Router();

/** GET /api/trade/find/:username/:leagueId */
router.get("/api/trade/find/:username/:leagueId", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    if (!username || !leagueId) {
      return res.status(400).json({ message: "username and leagueId are required" });
    }
    const data = await findTrades(username, leagueId);
    res.json(data);
  } catch (err) {
    console.error("[trade-finder] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
