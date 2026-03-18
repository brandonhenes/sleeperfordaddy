import { Router } from "express";
import { getDashboardData, type DashboardData } from "../services/dashboard.js";
import type { LeagueScope } from "../services/dynasty-leagues.js";

const router = Router();

// Simple in-memory cache (5 minutes)
const cache = new Map<string, { data: DashboardData; ts: number }>();
const TTL = 5 * 60 * 1000;

/** GET /api/dashboard/:username — New redesigned dashboard */
router.get("/api/dashboard/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const scope: LeagueScope = req.query.leagueScope === "redraft" ? "redraft" : "dynasty";
    const key = `${username.toLowerCase()}:${scope}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < TTL) {
      return res.json(cached.data);
    }
    const data = await getDashboardData(username, scope);
    if (!data) {
      return res.status(404).json({ message: `No ${scope} leagues found for this user` });
    }
    cache.set(key, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.error("[dashboard] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
