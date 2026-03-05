import { Router } from "express";
import { getNotifications } from "../services/notifications.js";

const router = Router();

router.get("/api/notifications/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ message: "username is required" });
    const data = await getNotifications(username);
    res.json(data);
  } catch (err) {
    console.error("[notifications] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
