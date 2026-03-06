import { Router } from "express";
import {
  getRecommendations,
  getProspects,
  getMovers,
  getSignals,
} from "../services/market.js";
import { getRookieDraftContext } from "../services/rookie-draft-context.js";

const router = Router();

/** GET /api/market/recommendations — Buy/Sell/Hold recs */
router.get("/api/market/recommendations", async (_req, res) => {
  try {
    const data = await getRecommendations();
    res.json(data);
  } catch (err) {
    console.error("[market/recommendations] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market/prospects — Prospect board */
router.get("/api/market/prospects", async (_req, res) => {
  try {
    const data = await getProspects();
    res.json(data);
  } catch (err) {
    console.error("[market/prospects] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market/movers?days=7 — FC value risers/fallers */
router.get("/api/market/movers", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const data = await getMovers(days);
    res.json(data);
  } catch (err) {
    console.error("[market/movers] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market/signals — Add/drop signals */
router.get("/api/market/signals", async (_req, res) => {
  try {
    const data = await getSignals();
    res.json(data);
  } catch (err) {
    console.error("[market/signals] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/context/:username */
router.get("/api/rookie-draft/context/:username", async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ message: "username required" });
    const data = await getRookieDraftContext(username);
    res.json(data);
  } catch (err) {
    console.error("[rookie-draft] Context error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
