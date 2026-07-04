import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluatedAsset, TradeEvaluation, TradePackageAsset } from "../../../shared/types.js";

const evaluateTradeMock = vi.hoisted(() => vi.fn());

vi.mock("../trade-calculator.js", () => ({
  evaluateTrade: evaluateTradeMock,
}));

import { evaluateOpportunityPackage } from "../trade-opportunity-valuation.js";

beforeEach(() => {
  evaluateTradeMock.mockReset();
});

function evaluated(label: string, value: number): EvaluatedAsset {
  return {
    asset_id: label,
    asset_key: label,
    asset_name: label,
    asset_type: "player",
    player_id: label,
    position: "WR",
    label,
    edge_score: 70,
    base_market_value: value,
    league_market_value: value,
    context_trade_value: value,
    market_value_source: "raw_sources",
    source_market_values: {
      fc: value,
      ktc: value,
      dp: null,
      edge_fallback: value,
    },
    trade_power: value,
    fc_score: 70,
    ktc_score: 70,
    dp_score: null,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    scoring_multiplier: null,
    lineup_scarcity_multiplier: null,
    ppg: null,
    source_agreement: "high",
  };
}

function tradeAsset(label: string, playerId: string): TradePackageAsset {
  return {
    asset_type: "player",
    player_id: playerId,
    label,
    position: "WR",
    edge_score: 70,
    trade_power: 0,
    fc_score: 70,
    ktc_score: 70,
    dp_score: null,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
  };
}

function evaluation(): TradeEvaluation {
  return {
    sideA: {
      assets: [evaluated("receive-player", 6_000)],
      total_edge: 70,
      total_base_market_value: 6_000,
      total_league_market_value: 6_000,
      total_context_trade_value: 6_000,
      total_adjusted_trade_value: 6_000,
      total_trade_power: 6_000,
      package_penalty_pct: 0,
      asset_count: 1,
    },
    sideB: {
      assets: [evaluated("send-player", 5_500)],
      total_edge: 70,
      total_base_market_value: 5_500,
      total_league_market_value: 5_500,
      total_context_trade_value: 5_500,
      total_adjusted_trade_value: 5_500,
      total_trade_power: 5_500,
      package_penalty_pct: 0,
      asset_count: 1,
    },
    delta: 500,
    delta_edge: 0,
    fairness: "fair",
    winner: "even",
    value_adjustment_side: "none",
    value_adjustment: 0,
    percent_gap: 8,
    best_asset_side: "sideA",
    best_asset_edge: 70,
    best_asset_market_value: 6_000,
    consolidation_warning: null,
    needed_to_even: {
      side: "none",
      tradePowerGap: 500,
      suggestedEdgeScore: null,
      marketValue: null,
      edgeEquivalent: null,
      label: "No meaningful sweetener needed.",
    },
    scoring_context_label: null,
    healthCheck: [],
  };
}

describe("shared opportunity valuation defaults", () => {
  it("uses KTC League as the default Shop and Find Trades valuation profile", async () => {
    evaluateTradeMock.mockResolvedValueOnce(evaluation());

    await evaluateOpportunityPackage({
      send: [tradeAsset("Send Player", "send-player")],
      receive: [tradeAsset("Receive Player", "receive-player")],
      leagueId: "league-1",
      mode: "sf",
      valueType: "dynasty",
    });

    expect(evaluateTradeMock).toHaveBeenCalledTimes(1);
    const call = evaluateTradeMock.mock.calls[0];
    expect(call).toHaveLength(8);
    expect(call[2]).toBe("sf");
    expect(call[3]).toBe("dynasty");
    expect(call[5]).toBe("league-1");
    expect(call[7]).toMatchObject({ valuationProfile: "ktc_league" });
  });

  it("allows callers to explicitly override the trade valuation profile", async () => {
    evaluateTradeMock.mockResolvedValueOnce(evaluation());

    await evaluateOpportunityPackage({
      send: [tradeAsset("Send Player", "send-player")],
      receive: [tradeAsset("Receive Player", "receive-player")],
      leagueId: "league-1",
      mode: "sf",
      valueType: "dynasty",
      valuationProfile: "composite",
    });

    expect(evaluateTradeMock).toHaveBeenCalledTimes(1);
    const call = evaluateTradeMock.mock.calls[0];
    expect(call[7]).toMatchObject({ valuationProfile: "composite" });
  });
});
