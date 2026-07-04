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

  it("preserves deeper Sleeper scoring keys for KTC League projection scoring", () => {
    const context = buildLeagueMarketContext({
      scoringSettings: {
        rec: 0.5,
        bonus_rec_te: 1,
        bonus_fd_te: 0.5,
        bonus_rec_yd_100: 3,
        pass_td: 6,
        pass_int: -2,
      },
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX"],
      totalRosters: 12,
      fallbackMode: "sf",
    });

    expect(context.rawScoringSettings.rec).toBe(0.5);
    expect(context.rawScoringSettings.bonus_fd_te).toBe(0.5);
    expect(context.rawScoringSettings.bonus_rec_yd_100).toBe(3);
    expect(context.rawScoringSettings.pass_td).toBe(6);
    expect(context.rawScoringSettings.pass_int).toBe(-2);
  });

  it("values TE structural scarcity above WR in multi-flex KTC League formats", () => {
    const context = buildLeagueMarketContext({
      scoringSettings: { rec: 1, bonus_rec_te: 0.5 },
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX"],
      totalRosters: 12,
      fallbackMode: "sf",
    });

    const te = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "TE",
      context,
      model: "ktc_league",
    });
    const wr = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "WR",
      context,
      model: "ktc_league",
    });

    expect(te.lineupScarcityMultiplier).toBeGreaterThan(wr.lineupScarcityMultiplier ?? 0);
    expect(te.leagueMarketValue).toBeGreaterThan(wr.leagueMarketValue);
  });

  it("lets projected points and 2-3 year longevity drive KTC League value", () => {
    const context = buildLeagueMarketContext({
      scoringSettings: { rec: 1, bonus_rec_te: 0.5 },
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX"],
      totalRosters: 12,
      fallbackMode: "1qb",
    });

    const adjusted = applyLeagueMarketAdjustment({
      baseMarketValue: 5_000,
      edgeScore: 75,
      position: "TE",
      context,
      model: "ktc_league",
      projection: {
        projectedLeaguePpg: 17.5,
        projectedKtcBaselinePpg: 11.2,
        projectedLeaguePoints: 735,
        projectedKtcBaselinePoints: 470,
        recentLeaguePpg: 13.1,
        recentKtcBaselinePpg: 10.4,
        trajectoryLabel: "ascending",
        trajectoryScore: 0.42,
        trajectoryMultiplier: 1.05,
        projectionYears: 3,
        projectedGames: 44.4,
        availabilityRate: 0.87,
        longevityMultiplier: 1.05,
        source: "test projections",
      },
    });

    expect(adjusted.scoringMultiplier).toBeGreaterThan(1.1);
    expect(adjusted.leagueMarketValue).toBeGreaterThan(6_000);
    expect(adjusted.reasons.some((reason) => reason.includes("Projected points model"))).toBe(true);
    expect(adjusted.reasons.some((reason) => reason.includes("Trajectory spectrum is ascending"))).toBe(true);
    expect(adjusted.reasons.some((reason) => reason.includes("expected-value window"))).toBe(true);
  });

  it("does not cap KTC League values at the raw KTC max", () => {
    const context = buildLeagueMarketContext({
      scoringSettings: { rec: 1, bonus_rec_te: 1 },
      rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX"],
      totalRosters: 12,
      fallbackMode: "sf",
    });

    const adjusted = applyLeagueMarketAdjustment({
      baseMarketValue: 9_500,
      edgeScore: 95,
      position: "TE",
      context,
      model: "ktc_league",
      projection: {
        projectedLeaguePpg: 20,
        projectedKtcBaselinePpg: 11,
        projectedLeaguePoints: 800,
        projectedKtcBaselinePoints: 440,
        recentLeaguePpg: 18,
        recentKtcBaselinePpg: 10,
        trajectoryLabel: "ascending",
        trajectoryScore: 0.4,
        trajectoryMultiplier: 1.048,
        projectionYears: 3,
        projectedGames: 48,
        availabilityRate: 0.94,
        longevityMultiplier: 1.02,
        source: "test projections",
      },
    });

    expect(adjusted.leagueMarketValue).toBeGreaterThan(10_000);
  });
});
