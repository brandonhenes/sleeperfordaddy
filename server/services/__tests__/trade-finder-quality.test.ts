import { describe, expect, it, vi } from "vitest";
import type {
  CoreAsset,
  TradePackage,
  TradePackageAsset,
  TradePickBreakdown,
  TradeSuggestion,
} from "../../../shared/types.js";
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
  isRealisticTradeFinderPackage,
  isMaterialPickOnlyTrade,
  isPickOnlyTradePackage,
  isTradeBoardCandidatePackage,
  rankTradeFinderOpponents,
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

function byPosFromAssets(assets: CoreAsset[]) {
  return {
    QB: assets.filter((asset) => asset.position === "QB"),
    RB: assets.filter((asset) => asset.position === "RB"),
    WR: assets.filter((asset) => asset.position === "WR"),
    TE: assets.filter((asset) => asset.position === "TE"),
  };
}

describe("Find Trades generator quality", () => {
  it("removes pick-only opportunities when player-based opportunities exist", () => {
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

    expect(remaining.filter(isPickOnlyTradePackage)).toHaveLength(0);
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

    expect(filtered.flatMap((suggestion) => suggestion.packages).filter(isPickOnlyTradePackage)).toHaveLength(0);
  });

  it("generates player-based and player-plus-pick opportunities when valid player assets exist", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "User QB", position: "QB", edge_score: 72 });
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 69 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 88 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userQb, userRb] },
      byPos: { QB: [userQb], RB: [userRb], WR: [], TE: [] },
      needs: ["WR"],
      surplus: { QB: [userQb], RB: [userRb], WR: [], TE: [] },
      tradeablePicks: [scoredPick("2027 3.05", 15, 3, 29)],
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

  it("caps expensive shared valuation calls while generating strategic package shapes", async () => {
    const positions = ["QB", "RB", "WR", "TE"] as const;
    const userAssets = Array.from({ length: 14 }, (_, index) =>
      coreAsset({
        player_id: `user-${index}`,
        full_name: `User ${index}`,
        position: positions[index % positions.length],
        edge_score: 82 - index,
      })
    );
    const oppAssets = Array.from({ length: 14 }, (_, index) =>
      coreAsset({
        player_id: `opp-${index}`,
        full_name: `Opponent ${index}`,
        position: positions[(index + 1) % positions.length],
        edge_score: 88 - index,
      })
    );
    const user = profile({
      roster: {
        ...profile({}).roster,
        is_user: true,
        archetype: "All-In Contender",
        core_assets: userAssets,
      },
      byPos: byPosFromAssets(userAssets),
      needs: ["WR", "TE"],
      surplus: byPosFromAssets(userAssets),
      tradeablePicks: [
        scoredPick("2027 Mid 1st", 62, 1, 8),
        scoredPick("2027 Mid 2nd", 42, 2, 20),
        scoredPick("2027 Mid 3rd", 28, 3, 32),
      ],
    });
    const opp = profile({
      roster: {
        ...profile({}).roster,
        roster_id: 2,
        display_name: "Opponent",
        archetype: "Rebuilder",
        core_assets: oppAssets,
      },
      byPos: byPosFromAssets(oppAssets),
      needs: ["QB", "RB"],
      surplus: byPosFromAssets(oppAssets),
      tradeablePicks: [
        scoredPick("2027 Early 1st", 72, 1, 2),
        scoredPick("2027 Early 2nd", 48, 2, 14),
      ],
    });
    let calls = 0;

    const generated = await generateTradeFinderPackages(
      user as never,
      opp as never,
      "sf",
      "league-1",
      baselineScoring,
      new Map(),
      false,
      undefined,
      async (send, receive) => {
        calls += 1;
        const sendTotal = send.length * 3_000;
        const receiveTotal = sendTotal + 250;
        const enrich = (asset: TradePackageAsset, value: number) => ({
          ...asset,
          base_market_value: value,
          league_market_value: value,
          context_trade_value: value,
          trade_power: value,
        });
        const sendValue = sendTotal / Math.max(send.length, 1);
        const receiveValue = receiveTotal / Math.max(receive.length, 1);
        return {
          sendAssets: send.map((asset) => enrich(asset, sendValue)),
          receiveAssets: receive.map((asset) => enrich(asset, receiveValue)),
          sendTotal,
          receiveTotal,
          delta: receiveTotal - sendTotal,
          sendEdge: send.reduce((sum, asset) => sum + asset.edge_score, 0),
          receiveEdge: receive.reduce((sum, asset) => sum + asset.edge_score, 0),
          deltaEdge:
            receive.reduce((sum, asset) => sum + asset.edge_score, 0) -
            send.reduce((sum, asset) => sum + asset.edge_score, 0),
          packagePenaltySend: 0,
          packagePenaltyReceive: 0,
          sendBaseMarketValue: sendTotal,
          receiveBaseMarketValue: receiveTotal,
          sendLeagueMarketValue: sendTotal,
          receiveLeagueMarketValue: receiveTotal,
          sendContextTradeValue: sendTotal,
          receiveContextTradeValue: receiveTotal,
          percentGap: 0.04,
          valuationWarnings: [],
          valuationExplanations: ["Fake shared valuation output."],
          fairness: "fair" as const,
        };
      }
    );

    expect(calls).toBeLessThanOrEqual(14);
    expect(generated.some((pkg) => pkg.you_send.length + pkg.you_receive.length > 2)).toBe(true);
  });

  it("targets a selected partner before package generation", () => {
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const user = profile({
      roster: { ...profile({}).roster, roster_id: 1, is_user: true, display_name: "Me", core_assets: [userWr] },
      byPos: byPosFromAssets([userWr]),
      surplus: { QB: [], RB: [], WR: [userWr], TE: [] },
    });
    const goodFit = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Best Fit", core_assets: [] },
      needs: ["WR"],
      needUrgency: { QB: 0, RB: 0, WR: 100, TE: 0 },
    });
    const selectedPartner = profile({
      roster: { ...profile({}).roster, roster_id: 3, display_name: "Selected Partner", core_assets: [] },
      needs: [],
    });

    const ranked = rankTradeFinderOpponents(
      user as never,
      [goodFit as never, selectedPartner as never],
      { opponentRosterId: 3 }
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0].opp.roster.roster_id).toBe(3);
  });

  it("builds QB tier-down packages with a lesser QB anchor before other positions", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "Elite User QB", position: "QB", edge_score: 92 });
    const oppQb = coreAsset({ player_id: "opp-qb", full_name: "Lesser Opp QB", position: "QB", edge_score: 78 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Higher Opp WR", position: "WR", edge_score: 82 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Rebuilder", core_assets: [userQb] },
      byPos: byPosFromAssets([userQb]),
      surplus: { QB: [userQb], RB: [], WR: [], TE: [] },
      tradeablePicks: [],
    });
    const opp = profile({
      roster: {
        ...profile({}).roster,
        roster_id: 2,
        display_name: "Opponent",
        archetype: "All-In Contender",
        core_assets: [oppWr, oppQb],
      },
      byPos: byPosFromAssets([oppWr, oppQb]),
      needs: ["QB"],
      surplus: { QB: [oppQb], RB: [], WR: [oppWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
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
    const qbTierDown = generated.find(
      (pkg) =>
        pkg.label === "QB Tier Down" &&
        pkg.you_send.some((asset) => asset.player_id === "user-qb")
    );

    expect(qbTierDown).toBeDefined();
    expect(qbTierDown?.you_receive.some((asset) => asset.position === "QB")).toBe(true);
    expect(qbTierDown?.you_receive.some((asset) => asset.position === "WR")).toBe(false);
  });

  it("targets a selected player when partner-specific target mode is used", async () => {
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 72 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 69 });
    const eliteWr = coreAsset({ player_id: "elite-wr", full_name: "Elite WR", position: "WR", edge_score: 88 });
    const targetTe = coreAsset({ player_id: "target-te", full_name: "Target TE", position: "TE", edge_score: 78 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userRb, userWr] },
      byPos: byPosFromAssets([userRb, userWr]),
      needs: ["TE"],
      surplus: { QB: [], RB: [userRb], WR: [userWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Rebuilder", core_assets: [eliteWr, targetTe] },
      byPos: byPosFromAssets([eliteWr, targetTe]),
      needs: ["RB", "WR"],
      surplus: { QB: [], RB: [], WR: [eliteWr], TE: [targetTe] },
      tradeablePicks: [scoredPick("2027 Mid 3rd", 28, 3, 30)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { targetPlayerId: "target-te", maxEvaluationsPerOpponent: 24 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) => pkg.you_receive.some((asset) => asset.player_id === "target-te"))).toBe(true);
  });

  it("avoids already surfaced receive targets when asking for different lanes", async () => {
    const userAssets = [
      coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 72 }),
      coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 }),
      coreAsset({ player_id: "user-te", full_name: "User TE", position: "TE", edge_score: 68 }),
    ];
    const avoidedTarget = coreAsset({ player_id: "avoid-wr", full_name: "Avoid WR", position: "WR", edge_score: 88 });
    const freshTarget = coreAsset({ player_id: "fresh-te", full_name: "Fresh TE", position: "TE", edge_score: 80 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: userAssets },
      byPos: byPosFromAssets(userAssets),
      needs: ["WR", "TE"],
      surplus: byPosFromAssets(userAssets),
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Rebuilder", core_assets: [avoidedTarget, freshTarget] },
      byPos: byPosFromAssets([avoidedTarget, freshTarget]),
      needs: ["RB", "WR"],
      surplus: { QB: [], RB: [], WR: [avoidedTarget], TE: [freshTarget] },
      tradeablePicks: [scoredPick("2027 Mid 3rd", 28, 3, 30)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { avoidTargetPlayerIds: ["avoid-wr"], maxEvaluationsPerOpponent: 24 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) => !pkg.you_receive.some((asset) => asset.player_id === "avoid-wr"))).toBe(true);
  });

  it("honors no-firsts steering by removing packages that send a first", async () => {
    const userAssets = [
      coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 73 }),
      coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 }),
    ];
    const target = coreAsset({ player_id: "target-wr", full_name: "Target WR", position: "WR", edge_score: 82 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: userAssets },
      byPos: byPosFromAssets(userAssets),
      needs: ["WR"],
      surplus: byPosFromAssets(userAssets),
      tradeablePicks: [
        scoredPick("2027 Mid 1st", 62, 1, 8),
        scoredPick("2027 Mid 2nd", 42, 2, 18),
      ],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Rebuilder", core_assets: [target] },
      byPos: byPosFromAssets([target]),
      needs: ["RB"],
      surplus: { QB: [], RB: [], WR: [target], TE: [] },
      tradeablePicks: [],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { constraints: ["no_firsts"], maxEvaluationsPerOpponent: 24 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) => !pkg.you_send.some((asset) => asset.asset_type === "pick" && asset.pick_round === 1))).toBe(true);
  });

  it("only returns QB tier-down shapes when that steering chip is active", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "Elite User QB", position: "QB", edge_score: 92 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const oppQb = coreAsset({ player_id: "opp-qb", full_name: "Lesser Opp QB", position: "QB", edge_score: 78 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 82 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Rebuilder", core_assets: [userQb, userWr] },
      byPos: byPosFromAssets([userQb, userWr]),
      surplus: { QB: [userQb], RB: [], WR: [userWr], TE: [] },
      tradeablePicks: [],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "All-In Contender", core_assets: [oppWr, oppQb] },
      byPos: byPosFromAssets([oppWr, oppQb]),
      needs: ["QB"],
      surplus: { QB: [oppQb], RB: [], WR: [oppWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { constraints: ["only_qb_tier_down"], maxEvaluationsPerOpponent: 24 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) =>
      pkg.you_send.some((asset) => asset.position === "QB") &&
      pkg.you_receive.some((asset) => asset.position === "QB") &&
      pkg.you_receive.length > 1
    )).toBe(true);
  });

  it("removes QB-involved packages when no-QB steering is active", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "User QB", position: "QB", edge_score: 88 });
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 74 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const oppQb = coreAsset({ player_id: "opp-qb", full_name: "Opp QB", position: "QB", edge_score: 86 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 78 });
    const oppTe = coreAsset({ player_id: "opp-te", full_name: "Opp TE", position: "TE", edge_score: 76 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userQb, userRb, userWr] },
      byPos: byPosFromAssets([userQb, userRb, userWr]),
      needs: ["WR", "TE"],
      surplus: { QB: [userQb], RB: [userRb], WR: [userWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Competitor", core_assets: [oppQb, oppWr, oppTe] },
      byPos: byPosFromAssets([oppQb, oppWr, oppTe]),
      needs: ["RB"],
      surplus: { QB: [oppQb], RB: [], WR: [oppWr], TE: [oppTe] },
      tradeablePicks: [],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { constraints: ["no_qbs"], maxEvaluationsPerOpponent: 32 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) =>
      [...pkg.you_send, ...pkg.you_receive].every((asset) => asset.position !== "QB")
    )).toBe(true);
  });

  it("removes pick-involved packages when no-picks steering is active", async () => {
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 78 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 72 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 82 });
    const oppTe = coreAsset({ player_id: "opp-te", full_name: "Opp TE", position: "TE", edge_score: 76 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userRb, userWr] },
      byPos: byPosFromAssets([userRb, userWr]),
      needs: ["WR", "TE"],
      surplus: { QB: [], RB: [userRb], WR: [userWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Competitor", core_assets: [oppWr, oppTe] },
      byPos: byPosFromAssets([oppWr, oppTe]),
      needs: ["RB"],
      surplus: { QB: [], RB: [], WR: [oppWr], TE: [oppTe] },
      tradeablePicks: [scoredPick("2027 Mid 3rd", 28, 3, 30)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { constraints: ["no_picks"], maxEvaluationsPerOpponent: 32 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) =>
      [...pkg.you_send, ...pkg.you_receive].every((asset) => asset.asset_type !== "pick")
    )).toBe(true);
  });

  it("requires a same-position player back when same-position steering is active", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "Elite User QB", position: "QB", edge_score: 92 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const oppQb = coreAsset({ player_id: "opp-qb", full_name: "Lesser Opp QB", position: "QB", edge_score: 78 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 82 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Rebuilder", core_assets: [userQb, userWr] },
      byPos: byPosFromAssets([userQb, userWr]),
      surplus: { QB: [userQb], RB: [], WR: [userWr], TE: [] },
      tradeablePicks: [],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "All-In Contender", core_assets: [oppWr, oppQb] },
      byPos: byPosFromAssets([oppWr, oppQb]),
      needs: ["QB"],
      surplus: { QB: [oppQb], RB: [], WR: [oppWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { constraints: ["same_position_return"], strategyFocus: "tier_down", maxEvaluationsPerOpponent: 32 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) => {
      const sentPositions = new Set(pkg.you_send.filter((asset) => asset.asset_type === "player").map((asset) => asset.position));
      return pkg.you_receive.some((asset) => asset.asset_type === "player" && sentPositions.has(asset.position));
    })).toBe(true);
  });

  it("can focus generation on tier-down strategy lanes", async () => {
    const userQb = coreAsset({ player_id: "user-qb", full_name: "Elite User QB", position: "QB", edge_score: 92 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const oppQb = coreAsset({ player_id: "opp-qb", full_name: "Lesser Opp QB", position: "QB", edge_score: 78 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 82 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Rebuilder", core_assets: [userQb, userWr] },
      byPos: byPosFromAssets([userQb, userWr]),
      surplus: { QB: [userQb], RB: [], WR: [userWr], TE: [] },
      tradeablePicks: [],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "All-In Contender", core_assets: [oppWr, oppQb] },
      byPos: byPosFromAssets([oppWr, oppQb]),
      needs: ["QB"],
      surplus: { QB: [oppQb], RB: [], WR: [oppWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { strategyFocus: "tier_down", maxEvaluationsPerOpponent: 32 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) =>
      ["tier_down", "rebuild_sell", "productive_struggle"].includes(pkg.strategy_type ?? "") &&
      pkg.you_send.length === 1 &&
      pkg.you_receive.length >= 2
    )).toBe(true);
  });

  it("keeps valid packages available when pure-value strategy focus is active", async () => {
    const userRb = coreAsset({ player_id: "user-rb", full_name: "User RB", position: "RB", edge_score: 74 });
    const userWr = coreAsset({ player_id: "user-wr", full_name: "User WR", position: "WR", edge_score: 70 });
    const oppWr = coreAsset({ player_id: "opp-wr", full_name: "Opp WR", position: "WR", edge_score: 82 });
    const oppTe = coreAsset({ player_id: "opp-te", full_name: "Opp TE", position: "TE", edge_score: 76 });
    const user = profile({
      roster: { ...profile({}).roster, is_user: true, archetype: "Competitor", core_assets: [userRb, userWr] },
      byPos: byPosFromAssets([userRb, userWr]),
      needs: ["WR", "TE"],
      surplus: { QB: [], RB: [userRb], WR: [userWr], TE: [] },
      tradeablePicks: [scoredPick("2027 Mid 2nd", 42, 2, 18)],
    });
    const opp = profile({
      roster: { ...profile({}).roster, roster_id: 2, display_name: "Opponent", archetype: "Competitor", core_assets: [oppWr, oppTe] },
      byPos: byPosFromAssets([oppWr, oppTe]),
      needs: ["RB"],
      surplus: { QB: [], RB: [], WR: [oppWr], TE: [oppTe] },
      tradeablePicks: [],
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
        scoreTradeFinderPackage(send, receive, leagueId, mode),
      { strategyFocus: "market_value", maxEvaluationsPerOpponent: 32 }
    );

    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((pkg) => pkg.ranking_components?.valuation_edge != null)).toBe(true);
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

  it("limits extra 1-for-1 swaps when multi-asset strategy packages exist", () => {
    const oneForOneA = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const oneForOneB = annotateTradeFinderPackage(
      packageFrom([player("Send RB", "RB", 68)], [player("Receive TE", "TE", 68)]),
      { userNeeds: ["TE"], opponentNeeds: ["RB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const consolidation = annotateTradeFinderPackage(
      packageFrom(
        [
          player("Useful WR", "WR", 70, { context_trade_value: 3_500, trade_power: 3_500 }),
          player("Useful RB", "RB", 66, { context_trade_value: 3_100, trade_power: 3_100 }),
        ],
        [player("Anchor TE", "TE", 84)],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
      {
        userNeeds: ["TE"],
        opponentNeeds: ["WR", "RB"],
        userArchetype: "All-In Contender",
        opponentArchetype: "Rebuilder",
      }
    );

    const ranked = dedupeAndRankTradeFinderPackages([oneForOneA, oneForOneB, consolidation], 4);

    expect(ranked).toContain(consolidation);
    expect(ranked.filter((pkg) => pkg.trade_type === "1-for-1")).toHaveLength(1);
  });

  it("diversifies receive-side player targets instead of filling a card with one player", () => {
    const eliteWr = player("Elite WR", "WR", 86, { context_trade_value: 12_000, trade_power: 12_000 });
    const targetRb = player("Target RB", "RB", 78, { context_trade_value: 9_000, trade_power: 9_000 });
    const targetTe = player("Target TE", "TE", 76, { context_trade_value: 8_800, trade_power: 8_800 });
    const repeatedElitePackages = [
      packageFrom(
        [
          player("Send RB", "RB", 72, { context_trade_value: 5_000, trade_power: 5_000 }),
          player("Send WR Depth A", "WR", 66, { context_trade_value: 4_000, trade_power: 4_000 }),
        ],
        [eliteWr],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
      packageFrom(
        [
          player("Send WR", "WR", 70, { context_trade_value: 5_000, trade_power: 5_000 }),
          player("Send RB Depth", "RB", 66, { context_trade_value: 4_000, trade_power: 4_000 }),
        ],
        [eliteWr],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
      packageFrom(
        [
          player("Send TE", "TE", 68, { context_trade_value: 4_800, trade_power: 4_800 }),
          player("Send WR Depth B", "WR", 65, { context_trade_value: 3_800, trade_power: 3_800 }),
        ],
        [eliteWr],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
    ];
    const otherTargets = [
      packageFrom(
        [
          player("Send WR 2", "WR", 70, { context_trade_value: 4_700, trade_power: 4_700 }),
          player("Send TE Depth", "TE", 64, { context_trade_value: 3_100, trade_power: 3_100 }),
        ],
        [targetRb],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
      packageFrom(
        [
          player("Send RB 2", "RB", 69, { context_trade_value: 4_500, trade_power: 4_500 }),
          player("Send WR Depth", "WR", 64, { context_trade_value: 3_000, trade_power: 3_000 }),
        ],
        [targetTe],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
    ];
    const annotated = [...repeatedElitePackages, ...otherTargets].map((pkg) =>
      annotateTradeFinderPackage(pkg, {
        userNeeds: ["WR", "RB", "TE"],
        opponentNeeds: ["RB", "WR", "TE"],
        userArchetype: "Competitor",
        opponentArchetype: "Rebuilder",
      })
    );

    const ranked = dedupeAndRankTradeFinderPackages(annotated, 4);
    const receivePlayerIds = ranked
      .map((pkg) => pkg.you_receive.find((asset) => asset.asset_type === "player")?.player_id)
      .filter(Boolean);
    const uniqueReceivePlayerIds = new Set(receivePlayerIds);

    expect(ranked).toHaveLength(3);
    expect(uniqueReceivePlayerIds.size).toBeGreaterThanOrEqual(3);
    expect(receivePlayerIds.filter((id) => id === eliteWr.player_id)).toHaveLength(1);
  });

  it("does not fill partner-specific suggestions with one receive player when alternatives exist", () => {
    const preferredWr = player("Preferred WR", "WR", 86, { context_trade_value: 12_000, trade_power: 12_000 });
    const alternateRb = player("Alternate RB", "RB", 82, { context_trade_value: 10_000, trade_power: 10_000 });
    const packages = [
      packageFrom(
        [
          player("Send RB A", "RB", 72, { context_trade_value: 5_000, trade_power: 5_000 }),
          player("Send WR A", "WR", 66, { context_trade_value: 4_000, trade_power: 4_000 }),
        ],
        [preferredWr],
        { type: "consolidation", trade_type: "2-for-1", label: "2-for-1 Consolidation" }
      ),
      packageFrom(
        [
          player("Send RB B", "RB", 71, { context_trade_value: 4_900, trade_power: 4_900 }),
          player("Send WR B", "WR", 65, { context_trade_value: 3_900, trade_power: 3_900 }),
        ],
        [preferredWr],
        { type: "consolidation", trade_type: "2-for-1", label: "Player + Pick Upgrade" }
      ),
      packageFrom(
        [
          player("Send RB C", "RB", 70, { context_trade_value: 4_800, trade_power: 4_800 }),
          player("Send WR C", "WR", 64, { context_trade_value: 3_800, trade_power: 3_800 }),
        ],
        [preferredWr],
        { type: "consolidation", trade_type: "2-for-1", label: "3-for-1 Roster-Spot Upgrade" }
      ),
      packageFrom(
        [
          player("Send TE A", "TE", 70, { context_trade_value: 5_500, trade_power: 5_500 }),
          pick("2027 Late 3rd", 45, 3),
        ],
        [alternateRb],
        { type: "consolidation", trade_type: "2-for-1", label: "Player + Pick" }
      ),
    ].map((pkg) =>
      annotateTradeFinderPackage(pkg, {
        userNeeds: ["WR", "RB"],
        opponentNeeds: ["RB", "WR", "TE"],
        userArchetype: "Competitor",
        opponentArchetype: "Rebuilder",
      })
    );

    const ranked = dedupeAndRankTradeFinderPackages(packages, 3);
    const receivePlayerIds = ranked
      .map((pkg) => pkg.you_receive.find((asset) => asset.asset_type === "player")?.player_id)
      .filter(Boolean);

    expect(ranked).toHaveLength(3);
    expect(new Set(receivePlayerIds).size).toBe(2);
    expect(receivePlayerIds).toContain(alternateRb.player_id);
    expect(receivePlayerIds.filter((id) => id === preferredWr.player_id)).toHaveLength(2);
  });

  it("uses low-confidence packages only when no better fallback exists", () => {
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
    const mixed = dedupeAndRankTradeFinderPackages([strong, annotated], 4);
    expect(mixed).toEqual([strong]);
    expect(dedupeAndRankTradeFinderPackages([annotated], 4)).toEqual([annotated]);
  });

  it("excludes low-confidence packages from more-realistic steering", () => {
    const lowConfidence = annotateTradeFinderPackage(
      packageFrom([player("Send WR", "WR", 65)], [player("Receive RB", "RB", 65)]),
      { userNeeds: ["TE"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const realistic = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(lowConfidence.quality_tier).toBe("low_confidence");
    expect(lowConfidence.package_quality_label).toBe("poor");
    expect(isRealisticTradeFinderPackage(lowConfidence)).toBe(false);
    expect(isRealisticTradeFinderPackage(realistic)).toBe(true);
  });

  it("keeps front-page board candidates aligned with realistic default lanes", () => {
    const lowConfidence = annotateTradeFinderPackage(
      packageFrom([player("Send WR", "WR", 65)], [player("Receive RB", "RB", 65)]),
      { userNeeds: ["TE"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );
    const realistic = annotateTradeFinderPackage(
      packageFrom([player("Send QB", "QB", 68)], [player("Receive WR", "WR", 68)]),
      { userNeeds: ["WR"], opponentNeeds: ["QB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(isTradeBoardCandidatePackage(lowConfidence)).toBe(false);
    expect(isTradeBoardCandidatePackage(realistic)).toBe(true);
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

  it("rejects excessive overpays even when they fit needs and look easy to accept", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Christian McCaffrey", "RB", 84), player("Kyle Pitts", "TE", 83)],
        [player("A.J. Brown", "WR", 84)],
        {
          fairness: "lopsided",
          acceptance: {
            probability: 90,
            label: "Likely",
            accept_reasons: ["Massive overpay in their favor. They'll take this immediately."],
            reject_reasons: ["Juggernauts rarely need to trade"],
          },
          why_you_do_it: "Consolidate depth into a WR starter upgrade",
          why_they_accept: "Massive overpay in their favor.",
        }
      ),
      { userNeeds: ["WR"], opponentNeeds: ["RB", "TE"], userArchetype: "Competitor", opponentArchetype: "Dynasty Juggernaut" }
    );

    expect(annotated.addresses_my_need).toBe(true);
    expect(annotated.addresses_their_need).toBe(true);
    expect(annotated.quality_tier).toBe("low_confidence");
    expect(annotated.package_quality_label).toBe("poor");
    expect(annotated.ranking_components?.acceptance_likelihood).toBeLessThanOrEqual(28);
    expect(annotated.risk_reason).toContain("excessive overpay");
    expect(shouldSurfaceTradeFinderPackage(annotated)).toBe(false);
    expect(dedupeAndRankTradeFinderPackages([annotated], 4)).toEqual([]);
  });

  it("downgrades acceptance when the only accept signal is your overpay", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Send RB", "RB", 70)],
        [player("Receive WR", "WR", 60)],
        {
          fairness: "lopsided",
          acceptance: {
            probability: 90,
            label: "Likely",
            accept_reasons: ["Massive overpay in their favor. They'll take this immediately."],
            reject_reasons: [],
          },
        }
      ),
      { userNeeds: ["WR"], opponentNeeds: ["RB"], userArchetype: "Competitor", opponentArchetype: "Competitor" }
    );

    expect(shouldSurfaceTradeFinderPackage(annotated)).toBe(true);
    expect(annotated.package_quality_label).toBe("poor");
    expect(annotated.quality_tier).toBe("low_confidence");
    expect(annotated.ranking_components?.acceptance_likelihood).toBeLessThanOrEqual(28);
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

  it("adds strategy thesis metadata to ranked Find Trades packages", () => {
    const annotated = annotateTradeFinderPackage(
      packageFrom(
        [player("Useful WR", "WR", 70), player("Useful RB", "RB", 66)],
        [player("Anchor TE", "TE", 84)]
      ),
      {
        userNeeds: ["TE"],
        opponentNeeds: ["WR", "RB"],
        userArchetype: "All-In Contender",
        opponentArchetype: "Rebuilder",
        mode: "sf",
      }
    );

    expect(annotated.strategy_type).toBe("consolidation");
    expect(annotated.trade_thesis).toContain("Consolidation");
    expect(annotated.ranking_components?.strategy_fit).toEqual(expect.any(Number));
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
