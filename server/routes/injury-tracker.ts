import { Router } from "express";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getInjuredPlayers, getBuyingWindows } from "../services/injury-tracker.js";

const router = Router();

/** GET /api/injuries/:username */
router.get("/api/injuries/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const rows = await db.execute(sql`
      SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
    `);
    const userId = (rows as unknown as { user_id: string }[])[0]?.user_id;
    if (!userId) return res.json([]);
    const data = await getInjuredPlayers(userId);
    res.json(data);
  } catch (err) {
    console.error("[injury-tracker] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/injuries/:username/buying-windows */
router.get("/api/injuries/:username/buying-windows", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const rows = await db.execute(sql`
      SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
    `);
    const userId = (rows as unknown as { user_id: string }[])[0]?.user_id;
    if (!userId) return res.json([]);
    const data = await getBuyingWindows(userId);
    res.json(data);
  } catch (err) {
    console.error("[injury-tracker] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
