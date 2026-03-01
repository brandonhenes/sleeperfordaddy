import { Router } from "express";
import { getPowerRankings } from "../services/power-rankings.js";

const router = Router();

/** GET /api/power-rankings/:username */
router.get("/api/power-rankings/:username", async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getPowerRankings(username);
    res.json(data);
  } catch (err) {
    console.error("[power-rankings] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
