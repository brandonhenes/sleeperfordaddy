import { Router } from "express";
import syncRoutes from "./sync.js";
import overviewRoutes from "./overview.js";
import portfolioRoutes from "./portfolio.js";
import marketRoutes from "./market.js";
import actionRoutes from "./action.js";
import dashboardRoutes from "./dashboard.js";
import adminRoutes from "./admin.js";

const router = Router();

// Health check
router.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Mount route files
router.use(syncRoutes);
router.use(overviewRoutes);
router.use(portfolioRoutes);
router.use(marketRoutes);
router.use(actionRoutes);
router.use(dashboardRoutes);
router.use(adminRoutes);

export default router;
