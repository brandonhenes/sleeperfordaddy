import { Router } from "express";
import { recomputeTags } from "../services/admin.js";

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

export default router;
