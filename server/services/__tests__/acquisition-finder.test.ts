import { describe, expect, it } from "vitest";
import type { AcquisitionOffer, TradePackageAsset } from "../../../shared/types.js";
import type {
  OpportunityPackageValuation,
  OpportunityPackageValuationInput,
} from "../trade-opportunity-valuation.js";
import { valueAcquisitionOfferWithKtcLeague } from "../acquisition-finder.js";

function asset(label: string, playerId: string, edgeScore: number): TradePackageAsset {
  return {
    asset_type: "player",
    player_id: playerId,
    label,
    position: "WR",
    edge_score: edgeScore,
    trade_power: 0,
    fc_score: edgeScore,
    ktc_score: edgeScore,
    dp_score: null,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
  };
}

function offer(): AcquisitionOffer {
  return {
    type: "balanced",
    label: "WR-for-WR Swap",
    acceptance_likelihood: 50,
    you_send: [asset("Send Player", "send-player", 71)],
    you_receive: [asset("Target Player", "target-player", 74)],
    send_total: 71,
    receive_total: 74,
    delta: 3,
    fairness: "fair",
    sweetener_hint: null,
    their_perspective: {
      lineup_before: [],
      lineup_after: [],
      positions_upgraded: [],
      positions_downgraded: [],
      net_starter_value_change: 0,
      archetype_analysis: "Test perspective.",
      needs_addressed: [],
      needs_still_open: [],
      verdict: "might_accept",
      verdict_reason: "Test verdict.",
    },
  };
}

function valuation(input: OpportunityPackageValuationInput): OpportunityPackageValuation {
  return {
    sendAssets: input.send.map((a) => ({
      ...a,
      trade_power: 6_200,
      context_trade_value: 6_200,
      league_market_value: 6_000,
      base_market_value: 5_900,
    })),
    receiveAssets: input.receive.map((a) => ({
      ...a,
      trade_power: 6_900,
      context_trade_value: 6_900,
      league_market_value: 6_850,
      base_market_value: 6_400,
    })),
    sendEdge: 71,
    receiveEdge: 74,
    deltaEdge: 3,
    sendBaseMarketValue: 5_900,
    receiveBaseMarketValue: 6_400,
    sendLeagueMarketValue: 6_000,
    receiveLeagueMarketValue: 6_850,
    sendContextTradeValue: 6_200,
    receiveContextTradeValue: 6_900,
    delta: 700,
    fairness: "fair",
    packagePenaltySend: 0,
    packagePenaltyReceive: 0,
    percentGap: 10.1,
    warnings: [],
    valuationExplanations: ["Shared valuation helper output."],
  };
}

describe("acquisition finder valuation bridge", () => {
  it("re-prices generated acquisition offers with shared KTC League valuation output", async () => {
    const calls: OpportunityPackageValuationInput[] = [];
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => {
      calls.push(input);
      return valuation(input);
    };

    const valued = await valueAcquisitionOfferWithKtcLeague(
      offer(),
      "league-1",
      "sf",
      undefined,
      evaluatePackage
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      leagueId: "league-1",
      mode: "sf",
      valueType: "dynasty",
    });
    expect(valued.send_total).toBe(6_200);
    expect(valued.receive_total).toBe(6_900);
    expect(valued.delta).toBe(700);
    expect(valued.valuation_edge).toBe(700);
    expect(valued.you_send[0].context_trade_value).toBe(6_200);
    expect(valued.you_receive[0].context_trade_value).toBe(6_900);
    expect(valued.send_total).not.toBe(71);
  });
});
