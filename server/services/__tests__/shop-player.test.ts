import { describe, expect, it } from "vitest";
import type { CoreAsset, TradePackageAsset, TradePickBreakdown } from "../../../shared/types.js";
import type {
  OpportunityPackageValuation,
  OpportunityPackageValuationInput,
} from "../trade-opportunity-valuation.js";
import {
  createShopEvaluationBudget,
  evaluateShopPackageCandidates,
  scoreShopPackage,
  scorePackageForContext,
  selectShopCandidatesForEvaluation,
  shopPickToTradePackageAsset,
  shopPlayerAssetToTradePackageAsset,
  type PackageContext,
  type ShopPackageCandidate,
} from "../shop-player.js";

function coreAsset(overrides: Partial<CoreAsset> = {}): CoreAsset {
  return {
    player_id: "player-1",
    full_name: "Test Player",
    position: "WR",
    edge_score: 70,
    age: 24,
    age_curve: {
      age: 24,
      position: "WR",
      score: 100,
      zone: "Prime",
      color: "green",
      label: "Prime",
      prime_start: 24,
      prime_end: 28,
      dot_pct: 50,
    },
    fc_value: 6200,
    ktc_value: 6000,
    dp_value: 5900,
    fc_score: 71,
    ktc_score: 70,
    dp_score: 69,
    ppg: 14.2,
    sources_available: 3,
    source_agreement: "high",
    team: "MIN",
    status: "Active",
    availability: "active",
    league_points_total: null,
    league_points_ppg: null,
    league_points_weeks: null,
    league_points_season: null,
    ...overrides,
  };
}

function pickBreakdown(overrides: Partial<TradePickBreakdown> = {}): TradePickBreakdown {
  return {
    season: "2026",
    round: 1,
    pickSlot: 2,
    tier: "early",
    baseEdgeValue: 73,
    futureYearDiscount: 0,
    classStrengthModifier: 1,
    finalValue: 73,
    projectedProspect: null,
    prospectTier: null,
    pickLabel: "2026 1.02",
    ...overrides,
  };
}

function evaluated(asset: TradePackageAsset, contextValue: number): TradePackageAsset {
  return {
    ...asset,
    base_market_value: contextValue - 500,
    league_market_value: contextValue - 250,
    context_trade_value: contextValue,
    trade_power: contextValue,
    source_market_values: {
      fc: contextValue - 400,
      ktc: contextValue - 450,
      dp: null,
      edge_fallback: contextValue - 800,
    },
    adjustment_reasons: [
      {
        stage: "context_trade_value",
        label: "Trade context adjustment",
        reason: "Shared valuation helper applied context value.",
        amount: contextValue,
      },
    ],
  };
}

describe("Shop a Player valuation helpers", () => {
  it("maps player assets into shared valuation package assets", () => {
    const asset = shopPlayerAssetToTradePackageAsset(coreAsset());

    expect(asset).toMatchObject({
      asset_type: "player",
      player_id: "player-1",
      label: "Test Player",
      position: "WR",
      edge_score: 70,
      fc_score: 71,
      ktc_score: 70,
      dp_score: 69,
      ppg: 14.2,
    });
  });

  it("preserves exact-slot and tier pick metadata for shared valuation", () => {
    const exact = shopPickToTradePackageAsset({
      season: "2026",
      round: 1,
      roster_id: 3,
      original_owner_id: 8,
      pick_slot: 2,
      tier: "early",
      label: "2026 1.02",
      ktc_value: 7000,
      dp_value: 6900,
      edge_score: 73,
      ktc_score: 73,
      dp_score: 72,
      pick_breakdown: pickBreakdown(),
    });
    const tier = shopPickToTradePackageAsset({
      ...exact,
      season: "2026",
      round: 1,
      roster_id: 3,
      original_owner_id: 8,
      pick_slot: null,
      tier: "early",
      label: "2026 Early 1st",
      ktc_value: 6500,
      dp_value: 6400,
      edge_score: 69,
      ktc_score: 69,
      dp_score: 68,
      pick_breakdown: null,
    });

    expect(exact).toMatchObject({
      asset_type: "pick",
      pick_season: "2026",
      pick_round: 1,
      pick_tier: "early",
      pick_slot: 2,
      pick_original_owner_id: 8,
    });
    expect(tier).toMatchObject({
      asset_type: "pick",
      pick_tier: "early",
      pick_slot: null,
    });
  });

  it("uses shared opportunity valuation output and preserves Shop delta semantics", async () => {
    const calls: OpportunityPackageValuationInput[] = [];
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => {
      calls.push(input);
      return {
        sendAssets: input.send.map((asset) => evaluated(asset, 7_000)),
        receiveAssets: input.receive.map((asset) => evaluated(asset, 6_000)),
        sendEdge: 70,
        receiveEdge: 68,
        deltaEdge: -2,
        sendBaseMarketValue: 6_500,
        receiveBaseMarketValue: 5_500,
        sendLeagueMarketValue: 6_750,
        receiveLeagueMarketValue: 5_750,
        sendContextTradeValue: 7_000,
        receiveContextTradeValue: 6_000,
        delta: -1_000,
        fairness: "slight_edge",
        packagePenaltySend: 0,
        packagePenaltyReceive: 0,
        percentGap: 14.3,
        warnings: [
          {
            type: "missing_data",
            severity: "warning",
            side: "sideA",
            message: "Receive side used a documented fallback.",
          },
        ],
        valuationExplanations: [
          "Trade Calculator pipeline: base_market_value -> league_market_value -> context_trade_value.",
        ],
      };
    };

    const send = [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: "send-1" }))];
    const receive = [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: "receive-1" }))];
    const scored = await scoreShopPackage(
      send,
      receive,
      "league-1",
      "sf",
      undefined,
      "redraft",
      evaluatePackage,
      {
        fc: 15,
        ktc: 70,
        dp: 15,
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      leagueId: "league-1",
      mode: "sf",
      valueType: "redraft",
      weights: {
        fc: 15,
        ktc: 70,
        dp: 15,
      },
    });
    expect(scored.sendTotal).toBe(7_000);
    expect(scored.receiveTotal).toBe(6_000);
    expect(scored.delta).toBe(1_000);
    expect(scored.valuationEdge).toBe(-1_000);
    expect(scored.sendAssets[0].trade_power).toBe(7_000);
    expect(scored.sendAssets[0].trade_power).not.toBe(70);
    expect(scored.valuationWarnings[0].message).toContain("fallback");
    expect(scored.valuationExplanations[0]).toContain("base_market_value");
  });

  it("caches duplicate package valuation by league and package shape", async () => {
    const calls: OpportunityPackageValuationInput[] = [];
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => {
      calls.push(input);
      return {
        sendAssets: input.send.map((asset) => evaluated(asset, 7_000)),
        receiveAssets: input.receive.map((asset) => evaluated(asset, 6_500)),
        sendEdge: 70,
        receiveEdge: 65,
        deltaEdge: -5,
        sendBaseMarketValue: 6_500,
        receiveBaseMarketValue: 6_000,
        sendLeagueMarketValue: 6_750,
        receiveLeagueMarketValue: 6_250,
        sendContextTradeValue: 7_000,
        receiveContextTradeValue: 6_500,
        delta: -500,
        fairness: "fair",
        packagePenaltySend: 0,
        packagePenaltyReceive: 0,
        percentGap: 7.1,
        warnings: [],
        valuationExplanations: ["Shared valuation helper output."],
      };
    };
    const ctx = packageContext(evaluatePackage, createShopEvaluationBudget({ maxEvaluations: 10 }));
    const send = [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: "send-cache" }))];
    const receive = [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: "receive-cache" }))];

    await scorePackageForContext(ctx, send, receive);
    await scorePackageForContext(ctx, send, receive);

    expect(calls).toHaveLength(1);
    expect(ctx.evaluationBudget.evaluationsStarted).toBe(1);
    expect(ctx.evaluationBudget.cacheHits).toBe(1);
  });

  it("candidate caps limit expensive valuation calls", async () => {
    const calls: OpportunityPackageValuationInput[] = [];
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => {
      calls.push(input);
      return fairValuation(input);
    };
    const ctx = packageContext(evaluatePackage, createShopEvaluationBudget({ maxEvaluations: 10 }));
    const candidates = Array.from({ length: 8 }, (_, index) =>
      candidate(`receive-${index}`, 100 - index)
    );

    const evaluatedPackages = await evaluateShopPackageCandidates(ctx, candidates, 3);

    expect(evaluatedPackages).toHaveLength(3);
    expect(calls).toHaveLength(3);
    expect(selectShopCandidatesForEvaluation(candidates, 3).map((c) => c.receive[0].player_id)).toEqual([
      "receive-0",
      "receive-1",
      "receive-2",
    ]);
  });

  it("returns partial evaluated packages when the valuation budget is exhausted", async () => {
    const calls: OpportunityPackageValuationInput[] = [];
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => {
      calls.push(input);
      return fairValuation(input);
    };
    const budget = createShopEvaluationBudget({ maxEvaluations: 2 });
    const ctx = packageContext(evaluatePackage, budget);
    const candidates = Array.from({ length: 5 }, (_, index) =>
      candidate(`budget-${index}`, 100 - index)
    );

    const evaluatedPackages = await evaluateShopPackageCandidates(ctx, candidates, 5);

    expect(evaluatedPackages).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(budget.partialResults).toBe(true);
    expect([...budget.warnings][0]).toContain("valuation cap");
  });

  it("preserves empty state when no evaluated candidate survives quality filters", async () => {
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => ({
      ...fairValuation(input),
      fairness: "lopsided",
    });
    const ctx = packageContext(evaluatePackage, createShopEvaluationBudget({ maxEvaluations: 10 }));
    const candidates = [candidate("lopsided-receive", 100)];

    const evaluatedPackages = await evaluateShopPackageCandidates(ctx, candidates, 3);

    expect(evaluatedPackages).toEqual([]);
  });

  it("rejects protected-core sell-for-picks packages that are only attractive because of massive overpay", async () => {
    const evaluatePackage = async (
      input: OpportunityPackageValuationInput
    ): Promise<OpportunityPackageValuation> => ({
      ...fairValuation(input),
      sendAssets: input.send.map((asset) => evaluated(asset, 11_342.7)),
      receiveAssets: input.receive.map((asset, index) => evaluated(asset, index === 0 ? 1_731 : 1_583)),
      sendContextTradeValue: 11_342.7,
      receiveContextTradeValue: 3_314,
      sendBaseMarketValue: 11_342.7,
      receiveBaseMarketValue: 3_314,
      sendLeagueMarketValue: 11_342.7,
      receiveLeagueMarketValue: 3_314,
      delta: -8_028.7,
      fairness: "lopsided",
      percentGap: 0.708,
    });
    const ctx = packageContext(evaluatePackage, createShopEvaluationBudget({ maxEvaluations: 10 }));
    const drakeMaye = shopPlayerAssetToTradePackageAsset(coreAsset({
      player_id: "drake-maye",
      full_name: "Drake Maye",
      position: "QB",
      edge_score: 98,
      age: 23,
    }));
    const fourthA = shopPickToTradePackageAsset({
      season: "2027",
      round: 4,
      roster_id: 3,
      original_owner_id: 8,
      pick_slot: null,
      tier: "mid",
      label: "2027 Mid 4th",
      ktc_value: 1_731,
      dp_value: 1_500,
      edge_score: 52,
      ktc_score: 52,
      dp_score: 44,
      pick_breakdown: pickBreakdown({
        season: "2027",
        round: 4,
        tier: "mid",
        baseEdgeValue: 52,
        finalValue: 52,
        pickLabel: "2027 Mid 4th",
      }),
    });
    const fourthB = shopPickToTradePackageAsset({
      season: "2028",
      round: 4,
      roster_id: 3,
      original_owner_id: 8,
      pick_slot: null,
      tier: "mid",
      label: "2028 Mid 4th",
      ktc_value: 1_583,
      dp_value: 1_400,
      edge_score: 44,
      ktc_score: 44,
      dp_score: 40,
      pick_breakdown: pickBreakdown({
        season: "2028",
        round: 4,
        tier: "mid",
        baseEdgeValue: 44,
        finalValue: 44,
        pickLabel: "2028 Mid 4th",
      }),
    });
    const candidates: ShopPackageCandidate[] = [{
      path: "sell_for_pieces",
      path_label: "Sell for Picks",
      send: [drakeMaye],
      receive: [fourthA, fourthB],
      why_you_do_it: "Cash out Drake Maye into multiple future darts",
      why_they_accept: "Consolidates pick surplus into a lineup upgrade.",
      cheap_score: 100,
      score_filter: "not_negative_lopsided",
    }];

    const evaluatedPackages = await evaluateShopPackageCandidates(ctx, candidates, 1);

    expect(evaluatedPackages).toEqual([]);
  });
});

function fairValuation(input: OpportunityPackageValuationInput): OpportunityPackageValuation {
  return {
    sendAssets: input.send.map((asset) => evaluated(asset, 7_000)),
    receiveAssets: input.receive.map((asset) => evaluated(asset, 6_500)),
    sendEdge: 70,
    receiveEdge: 65,
    deltaEdge: -5,
    sendBaseMarketValue: 6_500,
    receiveBaseMarketValue: 6_000,
    sendLeagueMarketValue: 6_750,
    receiveLeagueMarketValue: 6_250,
    sendContextTradeValue: 7_000,
    receiveContextTradeValue: 6_500,
    delta: -500,
    fairness: "fair",
    packagePenaltySend: 0,
    packagePenaltyReceive: 0,
    percentGap: 7.1,
    warnings: [],
    valuationExplanations: ["Shared valuation helper output."],
  };
}

function packageContext(
  evaluatePackage: (input: OpportunityPackageValuationInput) => Promise<OpportunityPackageValuation>,
  evaluationBudget = createShopEvaluationBudget({ maxEvaluations: 10 })
): PackageContext {
  const playerAsset = coreAsset({ player_id: "shop-player", full_name: "Shop Player", position: "QB", edge_score: 80 });
  return {
    leagueId: "league-1",
    mode: "sf",
    userRoster: {} as never,
    opp: {} as never,
    playerAsset,
    leagueMedians: { QB: 60, RB: 60, WR: 60, TE: 60 },
    ambition: 2,
    userPicks: [],
    oppPicks: [],
    valueType: "dynasty",
    valuationCache: new Map(),
    evaluationBudget,
    evaluatePackage,
  };
}

function candidate(playerId: string, cheapScore: number): ShopPackageCandidate {
  return {
    path: "even_swap",
    path_label: "Even Swap",
    send: [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: "send-player", full_name: "Send Player", position: "QB", edge_score: 80 }))],
    receive: [shopPlayerAssetToTradePackageAsset(coreAsset({ player_id: playerId, full_name: playerId, position: "WR", edge_score: 70 }))],
    why_you_do_it: "Test package.",
    why_they_accept: "Test fit.",
    cheap_score: cheapScore,
    score_filter: "not_lopsided",
  };
}
