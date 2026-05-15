import { describe, expect, it } from "vitest";
import {
  applyLeagueMarketAdjustment,
  buildLeagueMarketContext,
  detectSuperflexFromRosterPositions,
} from "../league-market-adjustment.js";

const usage = {
  receptions_pg: 6,
  carries_pg: 0,
  passing_tds_pg: 0,
  rushing_tds_pg: 0,
  receiving_tds_pg: 0.4,
  passing_yds_pg: 0,
  rushing_yds_pg: 0,
  receiving_yds_pg: 60,
};

describe("league market adjustment", () => {
  it("detects Superflex from roster_positions instead of selected fallback mode", () => {
    const context = buildLeagueMarketContext({
      scoringSettings: { rec: 1 },
      rosterPositions: ["QB", "RB", "WR", "TE", "SUPER_FLEX"],
      totalRosters: 12,
      fallbackMode: "1qb",
    });

    expect(detectSuperflexFromRosterPositions(context.rosterPositions)).toBe(true);
    expect(context.mode).toBe("sf");
    expect(context.warnings[0]).toContain("roster positions");

    const adjusted = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "QB",
      context,
    });

    expect(adjusted.lineupScarcityMultiplier).toBeGreaterThan(1);
    expect(adjusted.leagueMarketValue).toBeGreaterThan(5_000);
  });

  it("applies TE Premium only when scoring settings support it", () => {
    const normalContext = buildLeagueMarketContext({
      scoringSettings: { rec: 1, bonus_rec_te: 0 },
      rosterPositions: ["QB", "RB", "WR", "TE", "FLEX"],
      totalRosters: 12,
      fallbackMode: "1qb",
    });
    const tepContext = buildLeagueMarketContext({
      scoringSettings: { rec: 1, bonus_rec_te: 0.5 },
      rosterPositions: ["QB", "RB", "WR", "TE", "FLEX"],
      totalRosters: 12,
      fallbackMode: "1qb",
    });

    const normal = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "TE",
      usage,
      context: normalContext,
    });
    const tep = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "TE",
      usage,
      context: tepContext,
    });

    expect(normalContext.isTePremium).toBe(false);
    expect(tepContext.isTePremium).toBe(true);
    expect(tep.leagueMarketValue).toBeGreaterThan(normal.leagueMarketValue);
    expect(tep.reasons.some((reason) => reason.includes("TE Premium detected"))).toBe(true);
  });
});
