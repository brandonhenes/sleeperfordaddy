import { describe, expect, it } from "vitest";
import type { EvaluatedAsset } from "../../../shared/types.js";
import { DEFAULT_SOURCE_WEIGHTS } from "../edge-score.js";
import { calculateKtcTradeContext, calculateTradeContext } from "../trade-context-value.js";
import {
  buildLeaguePlayerRating,
  buildValuationComparison,
  toKtcEvaluatedAsset,
  tradeHealthCheck,
  type RawEval,
} from "../trade-calculator.js";

function rawAsset(overrides: Partial<RawEval> = {}): RawEval {
  return {
    asset_id: "asset-1",
    asset_key: "player:asset-1",
    asset_name: "Test Player",
    asset_type: "player",
    player_id: "asset-1",
    position: "TE",
    label: "Test Player (TE)",
    fc_value: 9_400,
    ktc_value: 4_200,
    dp_value: 8_900,
    ...overrides,
  };
}

function evaluated(
  label: string,
  base: number,
  league: number,
  context: number
): EvaluatedAsset {
  return {
    asset_id: label,
    asset_key: label,
    asset_name: label,
    asset_type: "player",
    player_id: label,
    position: "TE",
    label,
    edge_score: 80,
    base_market_value: base,
    league_market_value: league,
    context_trade_value: context,
    market_value_source: "raw_sources",
    source_market_values: {
      fc: base + 1_000,
      ktc: base,
      dp: base + 2_000,
      edge_fallback: base - 500,
    },
    trade_power: context,
    fc_score: 90,
    ktc_score: 80,
    dp_score: 88,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    scoring_multiplier: null,
    lineup_scarcity_multiplier: null,
    ppg: null,
    source_agreement: "high",
  };
}

describe("Trade Calculator valuation profiles", () => {
  it("keeps the current composite source weights unchanged", () => {
    expect(DEFAULT_SOURCE_WEIGHTS).toEqual({
      fc: 35,
      ktc: 20,
      dp: 45,
    });
  });

  it("maps KTC profile assets from only the raw KeepTradeCut value", () => {
    const ktcAsset = toKtcEvaluatedAsset(rawAsset());

    expect(ktcAsset.base_market_value).toBe(4_200);
    expect(ktcAsset.league_market_value).toBe(4_200);
    expect(ktcAsset.context_trade_value).toBe(4_200);
    expect(ktcAsset.source_market_values).toMatchObject({
      fc: null,
      ktc: 4_200,
      dp: null,
    });
    expect(ktcAsset.fc_score).toBeNull();
    expect(ktcAsset.dp_score).toBeNull();
    expect(ktcAsset.adjustment_reasons?.[0]?.reason).toContain("only the KeepTradeCut");
  });

  it("does not substitute FC, DP, or pick-curve fallback when KTC value is missing", () => {
    const missingKtc = toKtcEvaluatedAsset(rawAsset({
      ktc_value: null,
      fc_value: 9_800,
      dp_value: 9_700,
      direct_edge_score: 99,
    }));

    expect(missingKtc.base_market_value).toBe(0);
    expect(missingKtc.trade_power).toBe(0);
    expect(missingKtc.source_market_values?.fc).toBeNull();
    expect(missingKtc.source_market_values?.dp).toBeNull();
    expect(missingKtc.fallback_warnings?.join(" ")).toContain("no usable KeepTradeCut value");
  });

  it("leaves raw KTC assets without league-specific ratings until league adjustment runs", () => {
    const ktcAsset = toKtcEvaluatedAsset(rawAsset());

    expect(ktcAsset.league_rating).toBeUndefined();
  });

  it("builds explainable league-specific player ratings from scoring and projection inputs", () => {
    const asset = evaluated("Brock Bowers", 8_151, 11_682, 11_684);
    asset.player_id = "11604";
    asset.position = "TE";
    asset.scoring_multiplier = 1.22;
    asset.lineup_scarcity_multiplier = 1.14;
    asset.scoring_delta_ppg = 5.8;
    asset.ppg = 20.1;

    const rating = buildLeaguePlayerRating(asset, {
      projectedLeaguePpg: 20.1,
      projectedKtcBaselinePpg: 13.8,
      projectedLeaguePoints: 870,
      projectedKtcBaselinePoints: 590,
      recentLeaguePpg: 16.5,
      recentKtcBaselinePpg: 12.2,
      trajectoryLabel: "ascending",
      trajectoryScore: 0.38,
      trajectoryMultiplier: 1.046,
      projectionYears: 3,
      projectedGames: 46,
      availabilityRate: 0.9,
      longevityMultiplier: 0.97,
      source: "test projections",
    });

    expect(rating).not.toBeNull();
    expect(rating?.rating).toBeGreaterThanOrEqual(95);
    expect(rating?.league_value_delta_pct).toBeCloseTo(43.3, 1);
    expect(rating?.scoring_fit.direction).toBe("boost");
    expect(rating?.lineup_scarcity.direction).toBe("boost");
    expect(rating?.age_window.reason).toContain("ascending");
    expect(rating?.tags).toEqual(expect.arrayContaining([
      "League Anchor",
      "Scoring Winner",
      "Hard To Replace",
      "Underpriced Here",
    ]));
  });

  it("downgrades young-for-old protection when the trade is a real win-now points buy", () => {
    const warnings = tradeHealthCheck(
      [{ player_id: "future-qb", position: "QB", label: "Future QB", edge_score: 86, ppg: 13.2 }],
      [
        { player_id: "veteran-rb-1", position: "RB", label: "Veteran RB 1", edge_score: 91, ppg: 19.5 },
        { player_id: "veteran-rb-2", position: "RB", label: "Veteran RB 2", edge_score: 75, ppg: 9.6 },
      ],
      new Map([
        ["future-qb", {
          player_id: "future-qb",
          full_name: "Future QB",
          position: "QB",
          age: 22,
          trend_30day: 3,
          current_fc_value: null,
          historical_peak_fc_value: null,
          edge_score: 86,
        }],
        ["veteran-rb-1", {
          player_id: "veteran-rb-1",
          full_name: "Veteran RB 1",
          position: "RB",
          age: 27,
          trend_30day: -2,
          current_fc_value: null,
          historical_peak_fc_value: null,
          edge_score: 91,
        }],
        ["veteran-rb-2", {
          player_id: "veteran-rb-2",
          full_name: "Veteran RB 2",
          position: "RB",
          age: 27,
          trend_30day: -2,
          current_fc_value: null,
          historical_peak_fc_value: null,
          edge_score: 75,
        }],
      ]),
      "slight_edge"
    );

    expect(warnings.find((warning) => warning.rule === "ascending_for_declining")?.type).toBe("warning");
    expect(warnings.some((warning) => warning.rule === "win_now_points_buy")).toBe(true);
    expect(warnings.some((warning) => warning.type === "block")).toBe(false);
  });

  it("still blocks young-for-old trades without a meaningful projected-points gain", () => {
    const warnings = tradeHealthCheck(
      [{ player_id: "future-qb", position: "QB", label: "Future QB", edge_score: 86, ppg: 14 }],
      [{ player_id: "veteran-rb", position: "RB", label: "Veteran RB", edge_score: 78, ppg: 15 }],
      new Map([
        ["future-qb", {
          player_id: "future-qb",
          full_name: "Future QB",
          position: "QB",
          age: 22,
          trend_30day: 3,
          current_fc_value: null,
          historical_peak_fc_value: null,
          edge_score: 86,
        }],
        ["veteran-rb", {
          player_id: "veteran-rb",
          full_name: "Veteran RB",
          position: "RB",
          age: 27,
          trend_30day: -2,
          current_fc_value: null,
          historical_peak_fc_value: null,
          edge_score: 78,
        }],
      ]),
      "slight_edge"
    );

    expect(warnings.find((warning) => warning.rule === "ascending_for_declining")?.type).toBe("block");
    expect(warnings.some((warning) => warning.rule === "win_now_points_buy")).toBe(false);
  });

  it("breaks a trade into current, raw KTC, league, and package context components", () => {
    const trey = evaluated("Trey McBride", 5_803, 6_784, 7_189);
    const earlyFirst = evaluated("2027 Early 1st", 4_808, 4_808, 4_808);
    const jonathanTaylor = evaluated("Jonathan Taylor", 10_061, 10_536, 10_536);
    const context = calculateTradeContext(
      [trey.league_market_value ?? 0],
      [earlyFirst.league_market_value ?? 0, jonathanTaylor.league_market_value ?? 0]
    );

    const comparison = buildValuationComparison({
      profile: "composite",
      evalA: [trey],
      evalB: [earlyFirst, jonathanTaylor],
      rawKtcValuesA: [5_803],
      rawKtcValuesB: [4_808, 10_061],
      context,
    });

    expect(comparison.raw_ktc).toMatchObject({
      profile: "raw_ktc",
      sideA_total: 5_803,
      sideB_total: 14_869,
      winner: "sideB",
    });
    expect(comparison.league_adjustment).toEqual({
      sideA_delta: 981,
      sideB_delta: 475,
    });
    expect(comparison.package_context_adjustment.sideA_delta).toBeGreaterThanOrEqual(0);
    expect(comparison.package_context_adjustment.sideB_delta).toBeGreaterThanOrEqual(0);
    expect(comparison.current.profile).toBe("composite");
  });

  it("uses the KTC-style package adjustment curve for KTC totals", () => {
    const ktc = calculateKtcTradeContext([9_999], [7_500, 5_616]);

    expect(ktc.sideA.baseTotal).toBe(9_999);
    expect(ktc.sideB.baseTotal).toBe(13_116);
    expect(ktc.valueAdjustmentSide).toBe("sideA");
    expect(ktc.valueAdjustment).toBe(4_233);
    expect(ktc.sideA.finalTotal).toBe(14_232);
    expect(ktc.sideB.finalTotal).toBe(13_116);
    expect(ktc.fairness).toBe("fair");
  });

  it("moderates one-anchor package premiums in KTC League mode", () => {
    const rawKtc = calculateKtcTradeContext([5_097, 5_227, 3_415], [8_933]);
    const league = calculateKtcTradeContext(
      [5_097, 5_227, 3_415],
      [8_933],
      { adjustmentMode: "league" }
    );

    expect(rawKtc.fairness).toBe("fair");
    expect(league.valueAdjustmentSide).toBe("sideB");
    expect(league.valueAdjustment).toBeLessThan(rawKtc.valueAdjustment * 0.3);
    expect(league.fairness).toBe("lopsided");
    expect(league.winner).toBe("sideA");
    expect(league.explanations.join(" ")).toContain("KTC League moderated");
  });

  it("does not treat near-peer superstar consolidation as fair in KTC League mode", () => {
    const hurtsBreeceSecondForCaleb = calculateKtcTradeContext(
      [9_943, 5_227, 3_415],
      [12_913],
      { adjustmentMode: "league" }
    );
    const lamarTaylorSecondForMaye = calculateKtcTradeContext(
      [12_427, 4_645, 3_415],
      [14_815],
      { adjustmentMode: "league" }
    );

    expect(hurtsBreeceSecondForCaleb.fairness).toBe("lopsided");
    expect(hurtsBreeceSecondForCaleb.winner).toBe("sideA");
    expect(lamarTaylorSecondForMaye.fairness).toBe("lopsided");
    expect(lamarTaylorSecondForMaye.winner).toBe("sideA");
  });

  it("still credits true elite-anchor packages in KTC League mode", () => {
    const rawKtc = calculateKtcTradeContext([12_913, 7_055], [16_057]);
    const league = calculateKtcTradeContext(
      [12_913, 7_055],
      [16_057],
      { adjustmentMode: "league" }
    );

    expect(league.valueAdjustmentSide).toBe("sideB");
    expect(league.valueAdjustment).toBeGreaterThan(0);
    expect(league.valueAdjustment).toBeLessThan(rawKtc.valueAdjustment);
    expect(league.fairness).toBe("fair");
  });

  it("keeps the composite context curve separate from the KTC package curve", () => {
    const valuesA = [9_999];
    const valuesB = [7_500, 5_616];

    const composite = calculateTradeContext(valuesA, valuesB);
    const ktc = calculateKtcTradeContext(valuesA, valuesB);

    expect(composite.sideA.finalTotal).not.toBe(ktc.sideA.finalTotal);
    expect(composite.valueAdjustment).toBeLessThan(ktc.valueAdjustment);
  });
});
