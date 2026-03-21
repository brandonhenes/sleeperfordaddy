import { Router } from "express";
import { getRosterGrades } from "../services/roster-grades.js";

const router = Router();

/** GET /api/roster-grades?username=... */
router.get("/api/roster-grades", async (req, res) => {
  try {
    const username = (req.query.username as string) || "";
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const valueType = req.query.redraft === "true" ? "redraft" as const : "dynasty" as const;
    const data = await getRosterGrades(username, valueType);
    res.json(data);
  } catch (err) {
    console.error("[roster-grades] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
