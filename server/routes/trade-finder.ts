import { Router } from "express";
import { findTrades } from "../services/trade-finder.js";
import { findAcquisitionPackages } from "../services/acquisition-finder.js";

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

/** GET /api/trade/acquire/:username/:playerId */
router.get("/api/trade/acquire/:username/:playerId", async (req, res) => {
  try {
    const { username, playerId } = req.params;
    if (!username || !playerId) {
      return res.status(400).json({ message: "username and playerId are required" });
    }
    const data = await findAcquisitionPackages(username, decodeURIComponent(playerId));
    res.json(data);
  } catch (err) {
    console.error("[acquisition-finder] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
