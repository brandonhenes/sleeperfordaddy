import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { DEFAULT_SOURCE_WEIGHTS } from "../services/edge-score.js";
import type { UserSettings } from "../../shared/types.js";

const router = Router();

async function resolveSettingsKey(usernameOrUserId: string): Promise<string> {
  const rows = await db.execute(sql`
    SELECT user_id
    FROM users
    WHERE user_id = ${usernameOrUserId}
       OR LOWER(username) = LOWER(${usernameOrUserId})
    LIMIT 1
  `);
  return (rows as unknown as Array<{ user_id: string }>)[0]?.user_id ?? usernameOrUserId.toLowerCase();
}

router.get("/api/settings/:username", async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username ?? "").trim();
    if (!username) return res.status(400).json({ message: "username is required" });

    const userKey = await resolveSettingsKey(username);
    const rows = await db.execute(sql`
      SELECT
        fc_weight::float8 AS fc_weight,
        ktc_weight::float8 AS ktc_weight,
        dp_weight::float8 AS dp_weight
      FROM user_settings
      WHERE user_id = ${userKey}
      LIMIT 1
    `);

    const row = (rows as unknown as UserSettings[])[0];

    res.json(row ?? {
      fc_weight: DEFAULT_SOURCE_WEIGHTS.fc,
      ktc_weight: DEFAULT_SOURCE_WEIGHTS.ktc,
      dp_weight: DEFAULT_SOURCE_WEIGHTS.dp,
    });
  } catch (err) {
    console.error("[settings/get] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/api/settings/:username", async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.username ?? "").trim();
    if (!username) return res.status(400).json({ message: "username is required" });

    const fc = Number(req.body?.fc_weight);
    const ktc = Number(req.body?.ktc_weight);
    const dp = Number(req.body?.dp_weight);

    if (![fc, ktc, dp].every((value) => Number.isFinite(value) && value >= 0) || fc + ktc + dp <= 0) {
      return res.status(400).json({ message: "Valid source weights are required" });
    }

    const userKey = await resolveSettingsKey(username);
    await db.execute(sql`
      INSERT INTO user_settings (user_id, fc_weight, ktc_weight, dp_weight, updated_at)
      VALUES (${userKey}, ${fc}, ${ktc}, ${dp}, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET fc_weight = EXCLUDED.fc_weight,
          ktc_weight = EXCLUDED.ktc_weight,
          dp_weight = EXCLUDED.dp_weight,
          updated_at = NOW()
    `);

    res.json({
      fc_weight: fc,
      ktc_weight: ktc,
      dp_weight: dp,
    });
  } catch (err) {
    console.error("[settings/put] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
