import { describe, expect, it } from "vitest";
import type { EvaluatedAsset } from "../../../shared/types.js";
import { DEFAULT_SOURCE_WEIGHTS } from "../edge-score.js";
import { calculateTradeContext } from "../trade-context-value.js";
import {
  buildValuationComparison,
  toKtcEvaluatedAsset,
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
});
