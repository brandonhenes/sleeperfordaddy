import { Router } from "express";
import { getOverviewWithGroups } from "../services/overview.js";

const router = Router();

/** GET /api/overview?username=xxx — Get profile dashboard data */
router.get("/api/overview", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const data = await getOverviewWithGroups(username);
    if (!data) {
      return res.status(404).json({ message: "User not found in database. Try syncing first." });
    }
    res.json({ ...data.overview, league_groups: data.league_groups });
  } catch (err) {
    console.error("[overview] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
