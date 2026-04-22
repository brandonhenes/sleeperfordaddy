import { clearSleeperCache } from "../sleeper/client.js";
import { clearGlobalScaleCache, clearCompositeCache } from "./composite-values.js";
import { clearPowerRankingsCache } from "./power-rankings.js";
import { clearDynastyLeagueCache } from "./dynasty-leagues.js";
import { clearDashboardCache } from "./dashboard.js";
import { clearPortfolioCache } from "./portfolio.js";
import { clearOverviewCache } from "./overview.js";
import { clearArbitrageCache } from "./arbitrage.js";
import { clearActionCache } from "./action.js";
import { clearTradeIntelligenceCache } from "./trade-intelligence.js";

export interface CacheBustScope {
  /** Scope per-user caches to this username. Omit to clear all users. */
  username?: string;
  /** Scope the dynasty-leagues cache to this Sleeper user_id. Omit to clear all users. */
  userId?: string;
}

/**
 * Single source of truth for server-side cache invalidation.
 *
 * Call this after any mutation that could make cached data stale:
 *   - Sleeper sync (pass the user's `username` + `userId`)
 *   - Value source sync / pipeline (no args — blast everything)
 *   - Manual recompute endpoints
 *
 * Adding a new cache? Add one line below — every mutation path picks it up.
 */
export async function bustAllCaches(scope: CacheBustScope = {}): Promise<void> {
  const { username, userId } = scope;

  // Global caches (no per-user partition)
  clearSleeperCache();
  clearGlobalScaleCache();
  clearCompositeCache();
  try {
    await clearTradeIntelligenceCache();
  } catch (err) {
    console.error("[cache-bus] clearTradeIntelligenceCache failed:", err);
  }

  // Per-user caches — omitting username clears for all users.
  clearPowerRankingsCache(username);
  clearDashboardCache(username);
  clearPortfolioCache(username);
  clearOverviewCache(username);
  clearArbitrageCache(username);
  clearActionCache(username);

  // Keyed by Sleeper user_id, not username.
  clearDynastyLeagueCache(userId);
}
