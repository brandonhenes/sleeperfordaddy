import { Router } from "express";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeagueDetail } from "../services/league-detail.js";
import { getLeagueSummaries } from "../services/league-summaries.js";

const router = Router();

router.get("/api/leagues/:username/summary", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const scope = req.query.redraft === "true" ? "redraft" as const : "dynasty" as const;
    const data = await getLeagueSummaries(username, scope);
    res.json(data);
  } catch (err) {
    console.error("[league-summary] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/league/:leagueId?username=... — League detail page data */
router.get("/api/league/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    // Resolve username → userId
    const userRows = await db.execute(sql`
      SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
    `);
    const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
    if (!userId) {
      return res.status(404).json({ message: "User not found" });
    }

    const data = await getLeagueDetail(leagueId, userId);
    if (!data) {
      return res.status(404).json({ message: "League not found" });
    }
    res.json(data);
  } catch (err) {
    console.error("[league-detail] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
