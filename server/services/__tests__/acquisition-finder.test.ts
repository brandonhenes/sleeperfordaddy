import { describe, expect, it } from "vitest";
import type { AcquisitionOffer, AcquisitionOpportunity, TradePackageAsset } from "../../../shared/types.js";
import type {
  OpportunityPackageValuation,
  OpportunityPackageValuationInput,
} from "../trade-opportunity-valuation.js";
import {
  buildAcquisitionSummary,
  filterAcquisitionRecommendationOffers,
  rankAcquisitionOpportunities,
  valueAcquisitionOfferWithKtcLeague,
} from "../acquisition-finder.js";

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

function opportunity(
  leagueId: string,
  difficultyScore: number,
  packages: AcquisitionOffer[]
): AcquisitionOpportunity {
  return {
    league_id: leagueId,
    league_name: `League ${leagueId}`,
    league_mode: "sf",
    owner: {
      roster_id: Number(leagueId.replace(/\D/g, "")) || 1,
      display_name: `Owner ${leagueId}`,
      archetype: "Competitor",
    },
    difficulty: {
      score: difficultyScore,
      label: difficultyScore >= 80 ? "near_impossible" : "hard",
      reasons: [],
      positional_importance: "Their TE1",
      replacement_gap: 10,
      archetype_resistance: "Test resistance",
    },
    packages,
    trade_history: [],
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
      evaluatePackage,
      {
        fc: 20,
        ktc: 60,
        dp: 20,
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      leagueId: "league-1",
      mode: "sf",
      valueType: "dynasty",
      weights: {
        fc: 20,
        ktc: 60,
        dp: 20,
      },
    });
    expect(valued.send_total).toBe(6_200);
    expect(valued.receive_total).toBe(6_900);
    expect(valued.delta).toBe(700);
    expect(valued.valuation_edge).toBe(700);
    expect(valued.you_send[0].context_trade_value).toBe(6_200);
    expect(valued.you_receive[0].context_trade_value).toBe(6_900);
    expect(valued.send_total).not.toBe(71);
    expect(valued.strategy_label).toBeTruthy();
    expect(valued.trade_thesis).toContain(valued.strategy_label ?? "");
  });

  it("filters excessive KTC League overpay recommendations after valuation", () => {
    const bad = {
      ...offer(),
      send_total: 10_000,
      receive_total: 5_500,
      delta: -4_500,
      valuation_edge: -4_500,
      valuation_percent_gap: 0.45,
      fairness: "lopsided" as const,
    };
    const good = {
      ...offer(),
      send_total: 6_200,
      receive_total: 6_900,
      delta: 700,
      valuation_edge: 700,
      valuation_percent_gap: 0.1,
      fairness: "fair" as const,
    };

    expect(filterAcquisitionRecommendationOffers([bad, good])).toEqual([good]);
  });

  it("does not surface owners with zero viable acquisition packages", () => {
    const empty = opportunity("empty", 60, []);
    const hardWithOffer = opportunity("hard", 70, [offer()]);
    const easyWithOffer = opportunity("easy", 68, [offer()]);

    expect(rankAcquisitionOpportunities([empty, hardWithOffer, easyWithOffer])).toEqual([
      easyWithOffer,
      hardWithOffer,
    ]);
  });

  it("summarizes the easiest viable acquisition path instead of zero-offer ownership", () => {
    const viable = rankAcquisitionOpportunities([
      opportunity("empty", 60, []),
      opportunity("easy", 68, [offer()]),
    ]);

    expect(buildAcquisitionSummary("Trey McBride", 2, viable)).toContain(
      "2 of your leagues"
    );
    expect(buildAcquisitionSummary("Trey McBride", 2, viable)).toContain(
      "1 leagues produced viable starting offers"
    );
    expect(buildAcquisitionSummary("Trey McBride", 2, viable)).toContain(
      "Owner easy"
    );
  });

  it("marks limited acquisition results as a best-of subset", () => {
    const viable = rankAcquisitionOpportunities([
      opportunity("one", 68, [offer()]),
      opportunity("two", 70, [offer()]),
    ]);

    expect(buildAcquisitionSummary("Trey McBride", 2, viable, 1)).toContain(
      "Showing the best 1 of 2 viable starting offers"
    );
  });
});
