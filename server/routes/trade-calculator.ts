import { Router } from "express";
import { evaluateTrade, searchTradeAssets } from "../services/trade-calculator.js";
import { parseWeights } from "../lib/parse-weights.js";
import type { TradeAssetInput } from "../../shared/types.js";

const router = Router();

/** GET /api/trade/assets?q=... */
router.get("/api/trade/assets", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = Number(req.query.limit ?? 20);
    const data = await searchTradeAssets(q, limit);
    res.json(data);
  } catch (err) {
    console.error("[trade-calculator] Search error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/trade/evaluate */
router.post("/api/trade/evaluate", async (req, res) => {
  try {
    const { sideA, sideB, mode, leagueId } = req.body as {
      sideA: TradeAssetInput[];
      sideB: TradeAssetInput[];
      mode?: "sf" | "1qb";
      leagueId?: string;
    };
    if (!sideA?.length || !sideB?.length) {
      return res.status(400).json({ message: "sideA and sideB are required" });
    }
    const weights = parseWeights(req);
    const data = await evaluateTrade(sideA, sideB, mode ?? "sf", weights, leagueId);
    res.json(data);
  } catch (err) {
    console.error("[trade-calculator] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
