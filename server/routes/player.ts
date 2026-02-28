import { Router } from "express";
import { getPlayerDetail } from "../services/player.js";

const router = Router();

/** GET /api/player/:name?username=... */
router.get("/api/player/:name", async (req, res) => {
  try {
    const playerName = decodeURIComponent(req.params.name);
    const username = (req.query.username as string) || "";
    const data = await getPlayerDetail(playerName, username);
    if (!data) {
      return res.status(404).json({ message: "Player not found" });
    }
    res.json(data);
  } catch (err) {
    console.error("[player] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
