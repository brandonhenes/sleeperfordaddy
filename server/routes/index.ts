import { Router } from "express";
import syncRoutes from "./sync.js";
import overviewRoutes from "./overview.js";
import portfolioRoutes from "./portfolio.js";
import marketRoutes from "./market.js";
import actionRoutes from "./action.js";
import dashboardRoutes from "./dashboard.js";
import adminRoutes from "./admin.js";
import playerRoutes from "./player.js";
import arbitrageRoutes from "./arbitrage.js";
import rosterGradesRoutes from "./roster-grades.js";
import powerRankingsRoutes from "./power-rankings.js";
import marketSignalsRoutes from "./market-signals.js";
import tradeCalculatorRoutes from "./trade-calculator.js";
import tradeFinderRoutes from "./trade-finder.js";
import opponentRoutes from "./opponents.js";
import picksRoutes from "./picks.js";
import leagueHistoryRoutes from "./league-history.js";
import injuryTrackerRoutes from "./injury-tracker.js";
import waiverWireRoutes from "./waiver-wire.js";
import notificationsRoutes from "./notifications.js";
import tradeHistoryRoutes from "./trade-history.js";
import settingsRoutes from "./settings.js";
import tradeIntelligenceRoutes from "./trade-intelligence.js";
import leagueRoutes from "./league.js";

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
router.use(playerRoutes);
router.use(arbitrageRoutes);
router.use(rosterGradesRoutes);
router.use(powerRankingsRoutes);
router.use(marketSignalsRoutes);
router.use(tradeCalculatorRoutes);
router.use(tradeFinderRoutes);
router.use(opponentRoutes);
router.use(picksRoutes);
router.use(leagueHistoryRoutes);
router.use(injuryTrackerRoutes);
router.use(waiverWireRoutes);
router.use(notificationsRoutes);
router.use(tradeHistoryRoutes);
router.use(settingsRoutes);
router.use(leagueRoutes);
router.use("/api/trade-intelligence", tradeIntelligenceRoutes);

export default router;
