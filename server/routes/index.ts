import { Router } from "express";
import syncRoutes from "./sync.js";
import overviewRoutes from "./overview.js";

const router = Router();

// Health check
router.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Mount route files
router.use(syncRoutes);
router.use(overviewRoutes);

export default router;
