import { Router } from "express";
import { getPowerRankings } from "../services/power-rankings.js";

const router = Router();

/** GET /api/power-rankings/:username */
router.get("/api/power-rankings/:username", async (req, res) => {
  const startedAt = Date.now();
  const mode = process.env.POWER_RANKINGS_DB_ONLY === "true" ? "db-only-enabled" : "legacy-only";
  try {
    const username = req.params.username;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getPowerRankings(username);
    const ms = Date.now() - startedAt;
    console.log(
      `[power-rankings] ok user=${username} mode=${mode} leagues=${data.length} ms=${ms}`
    );
    res.json(data);
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.error(`[power-rankings] fail mode=${mode} ms=${ms}`);
    console.error("[power-rankings] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
