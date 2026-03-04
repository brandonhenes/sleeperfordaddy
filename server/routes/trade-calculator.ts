import { Router } from "express";
import { evaluateTrade } from "../services/trade-calculator.js";
import type { TradeAssetInput } from "../../shared/types.js";

const router = Router();

/** POST /api/trade/evaluate */
router.post("/api/trade/evaluate", async (req, res) => {
  try {
    const { sideA, sideB, mode } = req.body as {
      sideA: TradeAssetInput[];
      sideB: TradeAssetInput[];
      mode?: "sf" | "1qb";
    };
    if (!sideA?.length || !sideB?.length) {
      return res.status(400).json({ message: "sideA and sideB are required" });
    }
    const data = await evaluateTrade(sideA, sideB, mode ?? "sf");
    res.json(data);
  } catch (err) {
    console.error("[trade-calculator] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
