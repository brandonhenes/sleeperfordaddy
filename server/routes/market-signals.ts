import { Router } from "express";
import {
  getMarketSignals,
  getUserOwnedPlayerIds,
  summarizeSignals,
} from "../services/market-signals.js";

const router = Router();

/** GET /api/market-signals?username=henes35 */
router.get("/api/market-signals", async (req, res) => {
  try {
    const username = req.query.username as string | undefined;
    let playerIds: string[] | undefined;

    if (username) {
      playerIds = await getUserOwnedPlayerIds(username);
      if (playerIds.length === 0) {
        return res.json([]);
      }
    }

    const signals = await getMarketSignals(playerIds);
    res.json(signals);
  } catch (err) {
    console.error("[market-signals] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market-signals/summary */
router.get("/api/market-signals/summary", async (_req, res) => {
  try {
    const signals = await getMarketSignals();
    res.json(summarizeSignals(signals));
  } catch (err) {
    console.error("[market-signals/summary] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/newsletter/signals?limit=5 */
router.get("/api/newsletter/signals", async (req, res) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit as string, 10) || 5);
    const signals = await getMarketSignals();

    const buys = signals
      .filter((s) => s.action === "BUY")
      .slice(0, limit)
      .map((s) => ({
        name: s.full_name,
        position: s.position,
        edge_score: s.edge_score,
        signal: s.signal,
        reason: s.reason,
      }));

    const sells = signals
      .filter((s) => s.action === "SELL")
      .slice(0, limit)
      .map((s) => ({
        name: s.full_name,
        position: s.position,
        edge_score: s.edge_score,
        signal: s.signal,
        reason: s.reason,
      }));

    const consensus = signals.filter(
      (s) => s.signal === "CONSENSUS_LOCK"
    ).length;

    res.json({
      date: new Date().toISOString().slice(0, 10),
      top_buys: buys,
      top_sells: sells,
      consensus_count: consensus,
    });
  } catch (err) {
    console.error("[newsletter/signals] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
