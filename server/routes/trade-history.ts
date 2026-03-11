import { Router } from "express";
import { getTradeHistory } from "../services/trade-history.js";

const router = Router();

router.get("/api/trade-history", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const data = await getTradeHistory(username);
    res.json(data);
  } catch (error) {
    console.error("[trade-history] Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
