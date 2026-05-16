import { describe, expect, it } from "vitest";
import type { EvaluatedAsset, TradeEvaluation, TradePackageAsset } from "../../../shared/types.js";
import {
  packageScoreFromTradeEvaluation,
  tradePackageAssetToTradeInput,
} from "../trade-opportunity-valuation.js";

function asset(label: string, edge: number, context: number): EvaluatedAsset {
  return {
    player_id: label.toLowerCase().replace(/\s+/g, "-"),
    position: "WR",
    label,
    edge_score: edge,
    base_market_value: context - 500,
    league_market_value: context - 250,
    context_trade_value: context,
    source_market_values: {
      fc: context - 400,
      ktc: context - 600,
      dp: null,
      edge_fallback: context - 800,
    },
    trade_power: context,
    fc_score: 80,
    ktc_score: 78,
    dp_score: null,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
  };
}

function evaluation(): TradeEvaluation {
  return {
    sideA: {
      assets: [asset("Receive Stud", 82, 6_000)],
      total_edge: 82,
      total_base_market_value: 5_500,
      total_league_market_value: 5_750,
      total_context_trade_value: 6_000,
      total_adjusted_trade_value: 6_000,
      total_trade_power: 6_000,
      package_penalty_pct: 0,
      asset_count: 1,
      adjustment_explanation: "Elite asset premium",
    },
    sideB: {
      assets: [asset("Send Piece A", 70, 2_300), asset("Send Piece B", 68, 2_100)],
      total_edge: 138,
      total_base_market_value: 3_900,
      total_league_market_value: 4_100,
      total_context_trade_value: 4_400,
      total_adjusted_trade_value: 4_400,
      total_trade_power: 4_400,
      package_penalty_pct: 12,
      asset_count: 2,
      adjustment_explanation: "Package discount",
    },
    delta: 1_600,
    delta_edge: -56,
    fairness: "slight_edge",
    winner: "sideA",
    value_adjustment_side: "sideA",
    value_adjustment: 250,
    percent_gap: 26.7,
    best_asset_side: "sideA",
    best_asset_edge: 82,
    best_asset_market_value: 6_000,
    consolidation_warning: "Package discount applies to the multi-asset side.",
    needed_to_even: {
      side: "sideB",
      tradePowerGap: 1_600,
      suggestedEdgeScore: 73,
      marketValue: 1_600,
      edgeEquivalent: 73,
      label: "Add value",
    },
    scoring_context_label: null,
    healthCheck: [],
    valuation_explanations: ["base_market_value -> league_market_value -> context_trade_value"],
    warnings: [
      {
        type: "missing_data",
        severity: "warning",
        side: "sideB",
        message: "One source was missing.",
      },
    ],
  };
}

describe("trade opportunity valuation helpers", () => {
  it("maps exact-slot and tier picks without creating another pick system", () => {
    const exact: TradePackageAsset = {
      asset_type: "pick",
      label: "2026 1.02",
      position: null,
      edge_score: 70,
      trade_power: 0,
      fc_score: null,
      ktc_score: 70,
      dp_score: null,
      league_adjusted_score: null,
      scoring_delta_ppg: null,
      source_agreement: "high",
      pick_season: "2026",
      pick_round: 1,
      pick_tier: "early",
      pick_slot: 2,
    };
    const tier: TradePackageAsset = { ...exact, label: "2026 Early 1st", pick_slot: null };

    expect(tradePackageAssetToTradeInput(exact)).toMatchObject({
      type: "pick",
      pick_season: "2026",
      pick_round: 1,
      pick_tier: "early",
      pick_slot: 2,
    });
    expect(tradePackageAssetToTradeInput(tier)).toMatchObject({
      type: "pick",
      pick_tier: "early",
      pick_slot: null,
    });
  });

  it("uses context trade value from the shared evaluation instead of Edge Score trade power", () => {
    const send: TradePackageAsset[] = [
      { asset_type: "player", label: "Send Piece A", player_id: "a", position: "WR", edge_score: 70, trade_power: 0, fc_score: 70, ktc_score: 70, dp_score: null, league_adjusted_score: null, scoring_delta_ppg: null, source_agreement: "high" },
      { asset_type: "player", label: "Send Piece B", player_id: "b", position: "WR", edge_score: 68, trade_power: 0, fc_score: 68, ktc_score: 68, dp_score: null, league_adjusted_score: null, scoring_delta_ppg: null, source_agreement: "high" },
    ];
    const receive: TradePackageAsset[] = [
      { asset_type: "player", label: "Receive Stud", player_id: "c", position: "WR", edge_score: 82, trade_power: 0, fc_score: 82, ktc_score: 82, dp_score: null, league_adjusted_score: null, scoring_delta_ppg: null, source_agreement: "high" },
    ];

    const scored = packageScoreFromTradeEvaluation(send, receive, evaluation());

    expect(scored.sendContextTradeValue).toBe(4_400);
    expect(scored.receiveContextTradeValue).toBe(6_000);
    expect(scored.delta).toBe(1_600);
    expect(scored.sendAssets[0].trade_power).toBe(2_300);
    expect(scored.sendAssets[0].trade_power).not.toBe(70);
    expect(scored.packagePenaltySend).toBe(12);
    expect(scored.receiveAssets[0].source_market_values?.fc).toBe(5_600);
    expect(scored.warnings.some((warning) => warning.type === "missing_data")).toBe(true);
  });
});
