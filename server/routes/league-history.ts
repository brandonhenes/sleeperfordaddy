import { Router } from "express";
import { getLeagueHistory } from "../services/league-history.js";

const router = Router();

/** GET /api/history/:groupId */
router.get("/api/history/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }
    const data = await getLeagueHistory(groupId);
    res.json(data);
  } catch (err) {
    console.error("[league-history] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
