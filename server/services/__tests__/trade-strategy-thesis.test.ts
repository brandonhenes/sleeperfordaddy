import { describe, expect, it } from "vitest";
import type { TradePackageAsset } from "../../../shared/types.js";
import { classifyTradeStrategy } from "../trade-strategy-thesis.js";

function player(
  label: string,
  position: string,
  edgeScore: number,
  contextTradeValue = edgeScore * 100,
  overrides: Partial<TradePackageAsset> = {}
): TradePackageAsset {
  return {
    asset_type: "player",
    player_id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    position,
    edge_score: edgeScore,
    context_trade_value: contextTradeValue,
    trade_power: contextTradeValue,
    fc_score: edgeScore,
    ktc_score: edgeScore,
    dp_score: edgeScore,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
    ...overrides,
  };
}

function pick(label: string, round: number, edgeScore: number, contextTradeValue = edgeScore * 100): TradePackageAsset {
  return {
    asset_type: "pick",
    player_id: null,
    label,
    position: null,
    edge_score: edgeScore,
    context_trade_value: contextTradeValue,
    trade_power: contextTradeValue,
    fc_score: null,
    ktc_score: edgeScore,
    dp_score: edgeScore,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
    pick_season: "2027",
    pick_round: round,
    pick_tier: round === 1 ? "mid" : "mid",
    pick_slot: null,
  };
}

describe("trade strategy thesis classifier", () => {
  it("rewards contender consolidation when roster spots turn into a better anchor", () => {
    const strategy = classifyTradeStrategy({
      sendAssets: [
        player("WR2", "WR", 73, 4_200),
        player("RB2", "RB", 68, 3_200),
      ],
      receiveAssets: [player("Elite WR", "WR", 88, 8_100)],
      userArchetype: "All-In Contender",
      opponentArchetype: "Rebuilder",
      valueEdgeForUser: 700,
      fairness: "fair",
      addressesTheirNeed: true,
      mode: "sf",
    });

    expect(strategy.strategy_type).toBe("consolidation");
    expect(strategy.strategy_fit).toMatch(/strong|reasonable/);
    expect(strategy.trade_thesis).toContain("Consolidation");
  });

  it("rewards rebuild tier-down only when a real anchor comes back", () => {
    const strategy = classifyTradeStrategy({
      sendAssets: [player("Elite QB", "QB", 92, 9_400)],
      receiveAssets: [
        player("Young WR", "WR", 78, 5_500),
        pick("2027 Mid 1st", 1, 78, 4_400),
        player("Upside Bench WR", "WR", 55, 1_400),
      ],
      userArchetype: "Rebuilder",
      opponentArchetype: "All-In Contender",
      valueEdgeForUser: 1_900,
      fairness: "slight_edge",
      addressesTheirNeed: true,
      mode: "sf",
    });

    expect(strategy.strategy_type).toBe("rebuild_sell");
    expect(strategy.strategy_score).toBeGreaterThanOrEqual(74);
    expect(strategy.strategy_warnings).toHaveLength(0);
  });

  it("penalizes elite tier-downs into throw-in volume", () => {
    const strategy = classifyTradeStrategy({
      sendAssets: [player("Elite QB", "QB", 96, 11_000)],
      receiveAssets: [
        player("Depth RB", "RB", 52, 1_200),
        pick("2027 Mid 4th", 4, 52, 1_200),
        pick("2028 Mid 4th", 4, 48, 1_100),
      ],
      userArchetype: "Rebuilder",
      opponentArchetype: "All-In Contender",
      valueEdgeForUser: -7_500,
      fairness: "lopsided",
      mode: "sf",
    });

    expect(strategy.strategy_type).toBe("rebuild_sell");
    expect(strategy.strategy_fit).toBe("bad");
    expect(strategy.strategy_warnings.join(" ")).toContain("anchor");
  });

  it("keeps non-material pick swaps low confidence", () => {
    const strategy = classifyTradeStrategy({
      sendAssets: [pick("2027 Mid 2nd", 2, 62), pick("2027 Mid 3rd", 3, 52)],
      receiveAssets: [pick("2027 Late 2nd", 2, 58)],
      userArchetype: "Competitor",
      valueEdgeForUser: -900,
      fairness: "slight_edge",
      pickOnlyMaterial: false,
    });

    expect(strategy.strategy_type).toBe("pick_arbitrage");
    expect(strategy.strategy_fit).toMatch(/thin|bad/);
    expect(strategy.strategy_warnings.join(" ")).toContain("Pick-only");
  });

  it("recognizes TE and SF positional arbitrage when league scarcity is present", () => {
    const strategy = classifyTradeStrategy({
      sendAssets: [player("Good WR", "WR", 78, 5_000)],
      receiveAssets: [
        player("Elite TE", "TE", 86, 6_400, {
          lineup_scarcity_multiplier: 1.12,
          league_rating: {
            rating: 91,
            grade: "A",
            raw_market_value: 5_800,
            league_market_value: 6_400,
            context_trade_value: 6_400,
            league_value_delta: 600,
            league_value_delta_pct: 18,
            scoring_fit: { score: 90, grade: "A", direction: "boost", reason: "TE premium" },
            lineup_scarcity: { score: 92, grade: "A", direction: "boost", reason: "Scarce TE lineup slots" },
            projection_value: { score: 90, grade: "A", direction: "boost", reason: "Projected edge" },
            age_window: { score: 80, grade: "B+", direction: "neutral", reason: "Prime window" },
            liquidity: { score: 85, grade: "A-", direction: "boost", reason: "Liquid" },
            risk: { score: 75, grade: "B", direction: "neutral", reason: "Normal risk" },
            tags: ["Scoring Winner"],
            summary: "TE premium winner.",
          },
        }),
      ],
      userArchetype: "Competitor",
      valueEdgeForUser: 1_400,
      fairness: "slight_edge",
      mode: "sf",
    });

    expect(strategy.strategy_type).toBe("position_arbitrage");
    expect(strategy.strategy_score).toBeGreaterThan(60);
  });
});
