import { Router } from "express";
import { getPortfolio } from "../services/portfolio.js";

const router = Router();

/** GET /api/portfolio?username=... — Player exposure + FC values */
router.get("/api/portfolio", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }

    const data = await getPortfolio(username);
    if (!data) {
      return res
        .status(404)
        .json({ message: "No portfolio data found for this user." });
    }

    res.json(data);
  } catch (err) {
    console.error("[portfolio] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
