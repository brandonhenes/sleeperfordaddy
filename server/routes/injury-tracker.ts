import { Router } from "express";
import { getInjuredPlayers, getBuyingWindows } from "../services/injury-tracker.js";

const router = Router();

/** GET /api/injuries/:username */
router.get("/api/injuries/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getInjuredPlayers(username);
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
    const data = await getBuyingWindows(username);
    res.json(data);
  } catch (err) {
    console.error("[injury-tracker] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
