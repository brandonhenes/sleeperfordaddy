import { Router } from "express";
import { getDashboard } from "../services/dashboard.js";

const router = Router();

/** GET /api/dashboard?username=... — Combined dashboard payload */
router.get("/api/dashboard", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getDashboard(username);
    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(data);
  } catch (err) {
    console.error("[dashboard] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
