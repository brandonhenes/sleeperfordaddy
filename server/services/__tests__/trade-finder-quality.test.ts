import { describe, expect, it, vi } from "vitest";
import type {
  TradePackage,
  TradePackageAsset,
  TradePickBreakdown,
  TradeSuggestion,
} from "../../../shared/types.js";
import type { CoreAsset } from "../power-rankings.js";
import type {
  OpportunityPackageValuation,
  OpportunityPackageValuationInput,
} from "../trade-opportunity-valuation.js";

vi.mock("../trade-opportunity-valuation.js", () => ({
  evaluateOpportunityPackage: vi.fn(async (input: OpportunityPackageValuationInput) =>
    fakeValuation(input)
  ),
}));

import { evaluateOpportunityPackage } from "../trade-opportunity-valuation.js";
import {
  annotateTradeFinderPackage,
  applyDisplayedTradeDiversity,
  dedupeAndRankTradeFinderPackages,
  generateTradeFinderPackages,
  isMaterialPickOnlyTrade,
  isPickOnlyTradePackage,
  scoreTradeFinderPackage,
  shouldSurfaceTradeFinderPackage,
} from "../trade-finder.js";

const baselineScoring = {
  ppr: 1,
  te_premium: 0,
  carry_bonus: 0,
  pass_td: 4,
  pass_yd: 0.04,
  rush_yd: 0.1,
  rec_yd: 0.1,
};

function marketFromEdge(edge: number): number {
  return Math.round(edge * 100);
}

function player(label: string, position: string, edge: number, overrides: Partial<TradePackageAsset> = {}): TradePackageAsset {
  return {
    asset_type: "player",
    player_id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    position,
    edge_score: edge,
    base_market_value: marketFromEdge(edge),
    league_market_value: marketFromEdge(edge),
    context_trade_value: marketFromEdge(edge),
    trade_power: marketFromEdge(edge),
    fc_score: edge,
    ktc_score: edge,
    dp_score: edge,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
    ...overrides,
  };
}

function pickBreakdown(label: string, round: number, edge: number, slot: number | null = null): TradePickBreakdown {
  return {
    season: "2027",
    round,
    pickSlot: slot ?? round * 12,
    tier: round === 1 ? "mid" : round === 2 ? "mid" : "late",
    baseEdgeValue: edge,
    futureYearDiscount: 0,
    classStrengthModifier: 1,
    finalValue: edge,
    projectedProspect: null,
    prospectTier: null,
    pickLabel: label,
  };
}

function pick(label: string, edge: number, round: number, slot: number | null = null): TradePackageAsset {
  return {
    asset_type: "pick",
    player_id: null,
    label,
    position: null,
    edge_score: edge,
    base_market_value: marketFromEdge(edge),
    league_market_value: marketFromEdge(edge),
    context_trade_value: marketFromEdge(edge),
    trade_power: marketFromEdge(edge),
    fc_score: null,
    ktc_score: edge,
    dp_score: edge,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
    pick_season: "2027",
    pick_round: round,
    pick_tier: round === 1 ? "mid" : round === 2 ? "mid" : "late",
    pick_slot: slot,
    pick_breakdown: pickBreakdown(label, round, edge, slot),
  };
}

function packageFrom(
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  overrides: Partial<TradePackage> = {}
): TradePackage {
  const sendTotal = send.reduce((sum, asset) => sum + (asset.context_trade_value ?? 0), 0);
  const receiveTotal = receive.reduce((sum, asset) => sum + (asset.context_trade_value ?? 0), 0);
  const base: TradePackage = {
    type: receive.every((asset) => asset.asset_type === "pick") ? "picks_heavy" : "balanced",
    trade_type: receive.every((asset) => asset.asset_type === "pick") ? "pick-package" : "1-for-1",
    label: "Test Package",
    you_send: send,
    you_receive: receive,
    send_total: sendTotal,
    receive_total: receiveTotal,
    delta: receiveTotal - sendTotal,
    send_edge: send.reduce((sum, asset) => sum + asset.edge_score, 0),
    receive_edge: receive.reduce((sum, asset) => sum + asset.edge_score, 0),
    delta_edge:
      receive.reduce((sum, asset) => sum + asset.edge_score, 0) -
      send.reduce((sum, asset) => sum + asset.edge_score, 0),
    package_penalty_pct_send: 0,
    package_penalty_pct_receive: 0,
    send_base_market_value: sendTotal,
    receive_base_market_value: receiveTotal,
    send_league_market_value: sendTotal,
    receive_league_market_value: receiveTotal,
    send_context_trade_value: sendTotal,
    receive_context_trade_value: receiveTotal,
    valuation_edge: receiveTotal - sendTotal,
    valuation_percent_gap: Math.abs(receiveTotal - sendTotal) / Math.max(receiveTotal, sendTotal, 1),
    valuation_warnings: [],
    valuation_explanations: ["Shared valuation helper output."],
    fairness: "fair",
    why_you_do_it: "Test roster fit.",
    why_they_accept: "Test opponent fit.",
    sweetener_hint: null,
    acceptance: null,
    healthCheck: [],
  };
  return { ...base, ...overrides };
}

function fakeValuation(input: OpportunityPackageValuationInput): OpportunityPackageValuation {
  const enrich = (asset: TradePackageAsset) => ({
    ...asset,
    base_market_value: asset.context_trade_value ?? marketFromEdge(asset.edge_score),
    league_market_value: asset.context_trade_value ?? marketFromEdge(asset.edge_score),
    context_trade_value: asset.context_trade_value ?? marketFromEdge(asset.edge_score),
    trade_power: asset.context_trade_value ?? marketFromEdge(asset.edge_score),
  });
  const sendAssets = input.send.map(enrich);
  const receiveAssets = input.receive.map(enrich);
  const sendContextTradeValue = sendAssets.reduce((sum, asset) => sum + (asset.context_trade_value ?? 0), 0);
  const receiveContextTradeValue = receiveAssets.reduce((sum, asset) => sum + (asset.context_trade_value ?? 0), 0);

  return {
    sendAssets,
    receiveAssets,
    sendEdge: sendAssets.reduce((sum, asset) => sum + asset.edge_score, 0),
    receiveEdge: receiveAssets.reduce((sum, asset) => sum + asset.edge_score, 0),
    deltaEdge:
      receiveAssets.reduce((sum, asset) => sum + asset.edge_score, 0) -
      sendAssets.reduce((sum, asset) => sum + asset.edge_score, 0),
    sendBaseMarketValue: sendContextTradeValue,
    receiveBaseMarketValue: receiveContextTradeValue,
    sendLeagueMarketValue: sendContextTradeValue,
    receiveLeagueMarketValue: receiveContextTradeValue,
    sendContextTradeValue,
    receiveContextTradeValue,
    delta: receiveContextTradeValue - sendContextTradeValue,
    fairness: "fair",
    packagePenaltySend: 0,
    packagePenaltyReceive: 0,
    percentGap: Math.abs(receiveContextTradeValue - sendContextTradeValue) / Math.max(receiveContextTradeValue, sendContextTradeValue, 1),
    warnings: [],
    valuationExplanations: ["Trade Calculator pipeline: base_market_value -> league_market_value -> context_trade_value."],
  };
}

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
    fc_score: 70,
    ktc_score: 70,
    dp_score: 70,
    ppg: 12,
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

function scoredPick(label: string, edge: number, round: number, slot: number | null = null) {
  return {
    season: "2027",
    round,
    roster_id: 1,
    original_owner_id: 1,
    pick_slot: slot,
    tier: round === 1 ? "mid" : round === 2 ? "mid" : "late",
    label,
    ktc_value: edge * 100,
    dp_value: edge * 95,
    edge_score: edge,
    ktc_score: edge,
    dp_score: edge - 1,
    pick_breakdown: pickBreakdown(label, round, edge, slot),
  };
}

function profile(overrides: Record<string, unknown>) {
  return {
    roster: {
      roster_id: 1,
      owner_id: "owner",
      display_name: "Team",
      is_user: false,
      starters_value: 0,
      avg_starter_score: 0,
      power_pct: 0,
      draft_value: 0,
      draft_pct: 0,
      draft_picks: [],
      window_core_raw: 0,
      window_core_pct: 0,
      window_total_raw: 0,
      window_total_pct: 0,
      window_core_coverage_pct: 0,
      window_total_coverage_pct: 0,
      archetype: "Competitor",
      reasons: [],
      core_assets: [],
      avg_sources_available: 3,
      lineup: {} as never,
    },
    byPos: { QB: [], RB: [], WR: [], TE: [] },
    needs: [],
    surplus: { QB: [], RB: [], WR: [], TE: [] },
    needUrgency: { QB: 0, RB: 0, WR: 0, TE: 0 },
    tradeablePicks: [],
    topPlayerIdsByPos: { QB: "", RB: "", WR: "", TE: "" },
    ...overrides,
  };
}

describe("Find Trades generator quality", () => {
  it("caps pick-only opportunities when player-based opportunities exist", () => {
    const playerPackages = Array.from({ length: 8 }, (_, index) =>
      annotateTradeFinderPackage(
        packageFrom(
          [player(`Send WR ${index}`, "WR", 65)],
          [player(`Receive RB ${index}`, "RB", 66)]
        ),
        { userNeeds: ["RB"], opponentNeeds: ["WR"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
      )
    );
    const pickPackages = Array.from({ length: 5 }, (_, index) =>
      annotateTradeFinderPackage(
        packageFrom(
          [pick(`2027 Mid 2nd ${index}`, 42, 2), pick(`2027 Mid 3rd ${index}`, 28, 3)],
          [pick(`2027 1.${index + 5}`, 62 + index, 1, index + 5)]
        ),
        { userNeeds: ["RB"], opponentNeeds: ["WR"], userArchetype: "Competitor", opponentArchetype: "Rebuilder" }
      )
    );
    const suggestions: TradeSuggestion[] = [
      {
        partner: {
          roster_id: 1,
          display_name: "Partner",
          archetype: "Rebuilder",
          compatibility_score: 80,
          compatibility_reason: "Test",
          bias_flags: [],
          preferred_structure: "mixed",
          total_trades: 0,
          recent_trades: 0,
        },
        packages: [...playerPackages, ...pickPackages],
      },
    ];

    const filtered = applyDisplayedTradeDiversity(suggestions);
    const remaining = filtered.flatMap((suggestion) => suggestion.packages);

    expect(remaining.filter(isPickOnlyTradePackage)).toHaveLength(2);
    expect(remaining.filter((pkg) => !isPickOnlyTradePackage(pkg))).toHaveLength(8);
  });

  it("dedupes repeated pick-only shapes across partners", () => {
    const playerPkg = annotateTradeFinderPackage(
      packageFrom([player("Send WR", "WR", 65)], [player("Receive RB", "RB", 66)]),
      { userNeeds: ["RB"], opponentNeeds: ["WR"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const duplicatePickPackage = annotateTradeFinderPackage(
      packageFrom(
        [pick("2027 Mid 2nd", 42, 2), pick("2027 Mid 3rd", 28, 3)],
        [pick("2027 1.08", 62, 1, 8)]
      ),
      { userNeeds: [], opponentNeeds: [], userArchetype: "Competitor", opponentArchetype: "Rebuilder" }
    );
    const suggestions: TradeSuggestion[] = Array.from({ length: 5 }, (_, index) => ({
      partner: {
        roster_id: index + 1,
        display_name: `Partner ${index}`,
        archetype: "Rebuilder",
        compatibility_score: 70,
        compatibility_reason: "Test",
        bias_flags: [],
        preferred_structure: "mixed",
        total_trades: 0,
        recent_trades: 0,
      },
      packages: [playerPkg, duplicatePickPackage],
    }));

    const filtered = applyDisplayedTradeDiversity(suggestions);

    expect(filtered.flatMap((suggestion) => suggestion.packages).filter(isPickOnlyTradePackage)).toHaveLength(1);
  });

  it("generates player-based and player-plus-pick opportunities when valid player assets exist", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "User QB", position: "QB", edge_score: 72 });
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 69 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 70 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userQb, userRb] },
      byPos: { QB: [userQb], RB: [userRb], WR: [], TE: [] },
      needs: ["WR"],
      surplus: { QB: [userQb], RB: [userRb], WR: [], TE: [] },
      tradeablePicks: [scoredPick("2027 2.05", 42, 2, 17)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Rebuilder", core_assets: [oppWr] },
      byPos: { QB: [], RB: [], WR: [oppWr], TE: [] },
      needs: ["QB", "RB"],
      surplus: { QB: [], RB: [], WR: [oppWr], TE: [] },
      tradeablePicks: [scoredPick("2027 2.08", 39, 2, 20)],
    });

    const generated = await generateTradeFinderPackages(
      user as never,
      opp as never,
      "sf",
      "league-1",
      baselineScoring,
      new Map(),
      false,
      undefined,
      async (send, receive, leagueId, mode) =>
        scoreTradeFinderPackage(send, receive, leagueId, mode)
    );

    expect(generated.some((pkg) => !pkg.is_pick_only)).toBe(true);
    expect(generated.some((pkg) => packageContainsPlayerAndPick(pkg))).toBe(true);
    expect(generated.some((pkg) => pkg.addresses_my_need && pkg.you_receive.some((asset) => asset.position === "WR"))).toBe(true);
  });

  it("keeps need-based metadata consistent with package contents", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(annotated.addresses_my_need).toBe(true);
    expect(annotated.addresses_their_need).toBe(true);
    expect(annotated.you_receive.some((asset) => asset.position === "WR")).toBe(true);
    expect(annotated.you_send.some((asset) => asset.position === "QB")).toBe(true);
    expect(annotated.opportunity_type).toBe("need_based");
  });

  it("does not return empty when speculative valid packages exist", () => {
    const speculative = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 66)], [player("Receive RB", "RB", 66)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    const ranked = dedupeAndRankTradeFinderPackages([speculative], 4);

    expect(speculative.quality_tier).toBe("speculative");
    expect(shouldSurfaceTradeFinderPackage(speculative)).toBe(true);
    expect(ranked).toHaveLength(1);
  });

  it("prefers strong results over speculative results", () => {
    const strong = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const speculative = annotateTradeFinderPackage(
      packageFrom([player("Send QB Depth", "QB", 66)], [player("Receive RB Depth", "RB", 66)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    const ranked = dedupeAndRankTradeFinderPackages([speculative, strong], 2);

    expect(strong.quality_tier).toBe("strong");
    expect(speculative.quality_tier).toBe("speculative");
    expect(ranked.map((pkg) => pkg.quality_tier)).toEqual(["strong", "speculative"]);
  });

  it("uses low-confidence fallback only when better results are unavailable", () => {
    const strong = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const annotated = annotateTradeFinderPackage(
      packageFrom([player("Send WR", "WR", 65)], [player("Receive RB", "RB", 65)]),
      { userNeeds: ["TE"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(annotated.addresses_my_need).toBe(false);
    expect(annotated.addresses_their_need).toBe(false);
    expect(annotated.quality_tier).toBe("low_confidence");
    expect(dedupeAndRankTradeFinderPackages([strong, annotated], 4)).not.toContain(annotated);
    expect(dedupeAndRankTradeFinderPackages([annotated], 4)).toEqual([annotated]);
  });

  it("penalizes clear-need rejection reasons without hard-rejecting fair trades", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Send WR", "WR", 65)],
        [player("Receive RB", "RB", 65)],
        {
          acceptance: {
            probability: 35,
            label: "Unlikely",
            accept_reasons: ["Trade power is balanced"],
            reject_reasons: ["Does not address a clear need"],
          },
        }
      ),
      { userNeeds: ["TE"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(shouldSurfaceTradeFinderPackage(annotated)).toBe(true);
    expect(annotated.quality_tier).toBe("low_confidence");
    expect(annotated.ranking_components?.roster_fit).toBeLessThan(50);
  });

  it("treats lopsided but otherwise valid player packages as low-confidence fallback", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Send QB", "QB", 68)],
        [player("Receive WR", "WR", 78)],
        { fairness: "lopsided" }
      ),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(shouldSurfaceTradeFinderPackage(annotated)).toBe(true);
    expect(annotated.quality_tier).toBe("low_confidence");
    expect(dedupeAndRankTradeFinderPackages([annotated], 4)).toEqual([annotated]);
  });

  it("rejects superstar-for-junk packages", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Bench WR", "WR", 45), player("Bench RB", "RB", 44)],
        [player("Elite QB", "QB", 92)]
      ),
      { userNeeds: ["QB"], opponentNeeds: ["WR"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(shouldSurfaceTradeFinderPackage(annotated)).toBe(false);
    expect(annotated.risk_reason).toContain("elite");
  });

  it("allows only material pick-only swaps", () => {
    const weakSwap = packageFrom(
      [pick("2027 Mid 2nd", 42, 2), pick("2027 Mid 3rd", 28, 3)],
      [pick("2027 Late 2nd", 43, 2)]
    );
    const tierUp = packageFrom(
      [pick("2027 Mid 2nd", 42, 2), pick("2027 Mid 3rd", 28, 3)],
      [pick("2027 1.08", 62, 1, 8)]
    );

    expect(isMaterialPickOnlyTrade(weakSwap)).toBe(false);
    expect(isMaterialPickOnlyTrade(tierUp)).toBe(true);
  });

  it("allows a small pick-only fallback when no player-based opportunities exist", () => {
    const pickPackages = Array.from({ length: 5 }, (_, index) =>
      annotateTradeFinderPackage(
        packageFrom(
          [pick(`2027 Mid 2nd ${index}`, 42, 2), pick(`2027 Mid 3rd ${index}`, 28, 3)],
          [pick(`2027 1.${index + 5}`, 62 + index, 1, index + 5)]
        ),
        { userNeeds: [], opponentNeeds: [], userArchetype: "Competitor", opponentArchetype: "Rebuilder" }
      )
    );
    const suggestions: TradeSuggestion[] = [
      {
        partner: {
          roster_id: 1,
          display_name: "Partner",
          archetype: "Rebuilder",
          compatibility_score: 40,
          compatibility_reason: "Test",
          bias_flags: [],
          preferred_structure: "mixed",
          total_trades: 0,
          recent_trades: 0,
        },
        packages: pickPackages,
      },
    ];

    const displayed = applyDisplayedTradeDiversity(suggestions);
    const remaining = displayed.flatMap((suggestion) => suggestion.packages);

    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.length).toBeLessThanOrEqual(2);
    expect(remaining.every(isPickOnlyTradePackage)).toBe(true);
  });

  it("uses the shared opportunity valuation helper after generation", async () => {
    const send = [player("Send WR", "WR", 65)];
    const receive = [player("Receive RB", "RB", 66)];

    await scoreTradeFinderPackage(send, receive, "league-1", "sf", undefined, {
      fc: 10,
      ktc: 80,
      dp: 10,
    });

    expect(evaluateOpportunityPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        send,
        receive,
        leagueId: "league-1",
        mode: "sf",
        weights: {
          fc: 10,
          ktc: 80,
          dp: 10,
        },
      })
    );
  });

  it("keeps acceptance and valuation as separate ranking components", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(annotated.ranking_components?.valuation_edge).toEqual(expect.any(Number));
    expect(annotated.ranking_components?.acceptance_likelihood).toEqual(expect.any(Number));
    expect(annotated.ranking_components?.valuation_edge).not.toBe(annotated.ranking_components?.acceptance_likelihood);
  });

  it("preserves the empty/no-opportunity state only when no valid fallback packages exist", () => {
    const invalidPickSwap = annotateTradeFinderPackage(
      packageFrom(
        [pick("2027 Mid 2nd", 42, 2), pick("2027 Mid 3rd", 28, 3)],
        [pick("2027 Late 2nd", 43, 2)]
      ),
      { userNeeds: [], opponentNeeds: [], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const suggestions: TradeSuggestion[] = [
      {
        partner: {
          roster_id: 1,
          display_name: "Partner",
          archetype: "Competitor",
          compatibility_score: 40,
          compatibility_reason: "Test",
          bias_flags: [],
          preferred_structure: "mixed",
          total_trades: 0,
          recent_trades: 0,
        },
        packages: dedupeAndRankTradeFinderPackages([invalidPickSwap], 4),
      },
    ];

    expect(shouldSurfaceTradeFinderPackage(invalidPickSwap)).toBe(false);
    expect(applyDisplayedTradeDiversity(suggestions)).toEqual([]);
  });
});

function packageContainsPlayerAndPick(pkg: TradePackage): boolean {
  const assets = [...pkg.you_send, ...pkg.you_receive];
  return assets.some((asset) => asset.asset_type === "player") && assets.some((asset) => asset.asset_type === "pick");
}
