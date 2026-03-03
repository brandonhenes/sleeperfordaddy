import { Router } from "express";
import { getFreeAgentGaps } from "../services/arbitrage.js";

const router = Router();

/** GET /api/arbitrage/free-agents?username=... */
router.get("/api/arbitrage/free-agents", async (req, res) => {
  try {
    const username = (req.query.username as string) || "";
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getFreeAgentGaps(username);
    res.json(data);
  } catch (err) {
    console.error("[arbitrage] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/arbitrage/:username */
router.get("/api/arbitrage/:username", async (req, res) => {
  try {
    const username = (req.params.username as string) || "";
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getFreeAgentGaps(username);
    res.json(data);
  } catch (err) {
    console.error("[arbitrage] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
