import { Router } from "express";
import { getOverview, getLeagueGroupsForUser } from "../services/overview.js";

const router = Router();

/** GET /api/overview?username=xxx — Get profile dashboard data */
router.get("/api/overview", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const overview = await getOverview(username);
    if (!overview) {
      return res.status(404).json({ message: "User not found in database. Try syncing first." });
    }

    const groups = await getLeagueGroupsForUser(username);

    res.json({ ...overview, league_groups: groups });
  } catch (err) {
    console.error("[overview] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
