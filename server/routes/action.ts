import { Router } from "express";
import { getSellCandidates, getBuyOpportunities } from "../services/action.js";

const router = Router();

/** GET /api/action/sell-candidates?username=... */
router.get("/api/action/sell-candidates", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getSellCandidates(username);
    res.json(data);
  } catch (err) {
    console.error("[action/sell-candidates] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/action/buy-opportunities?username=... */
router.get("/api/action/buy-opportunities", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getBuyOpportunities(username);
    res.json(data);
  } catch (err) {
    console.error("[action/buy-opportunities] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
