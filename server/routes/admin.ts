import { Router } from "express";
import { recomputeTags } from "../services/admin.js";
import { syncPlayerIdCrosswalk } from "../services/sync-crosswalk.js";
import { syncKtcValues } from "../services/sync-ktc.js";
import { syncDynastyProcessValues } from "../services/sync-dynastyprocess.js";

const router = Router();

/** POST /api/admin/recompute-tags?username=... */
router.post("/api/admin/recompute-tags", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const result = await recomputeTags(username);
    res.json(result);
  } catch (err) {
    console.error("[admin/recompute-tags] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/admin/sync-crosswalk */
router.post("/api/admin/sync-crosswalk", async (_req, res) => {
  try {
    const stats = await syncPlayerIdCrosswalk();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-crosswalk] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/admin/sync-ktc */
router.post("/api/admin/sync-ktc", async (_req, res) => {
  try {
    const stats = await syncKtcValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-ktc] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/admin/sync-dynastyprocess */
router.post("/api/admin/sync-dynastyprocess", async (_req, res) => {
  try {
    const stats = await syncDynastyProcessValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-dynastyprocess] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** POST /api/admin/sync-values — Run all three syncs in sequence */
router.post("/api/admin/sync-values", async (_req, res) => {
  try {
    const crosswalk = await syncPlayerIdCrosswalk();
    const ktc = await syncKtcValues();
    const dp = await syncDynastyProcessValues();
    res.json({ crosswalk, ktc, dp });
  } catch (err) {
    console.error("[admin/sync-values] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
