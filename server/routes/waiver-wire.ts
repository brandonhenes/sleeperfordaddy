import { Router } from "express";
import { getWaiverWire } from "../services/waiver-wire.js";
import { parseWeights } from "../lib/parse-weights.js";

const router = Router();

router.get("/api/waiver-wire/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    if (!leagueId) return res.status(400).json({ message: "leagueId is required" });
    const weights = parseWeights(req);
    const data = await getWaiverWire(leagueId, weights);
    res.json(data);
  } catch (err) {
    console.error("[waiver-wire] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
