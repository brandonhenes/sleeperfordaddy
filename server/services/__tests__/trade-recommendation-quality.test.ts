import { describe, expect, it } from "vitest";
import {
  isUnrealisticEliteAcquisition,
  lacksAnchorWhenSellingElite,
  recommendationRejectReason,
} from "../trade-recommendation-quality.js";

function player(label: string, edge: number, contextValue = edge * 100) {
  return {
    asset_type: "player",
    label,
    position: "QB",
    edge_score: edge,
    context_trade_value: contextValue,
  };
}

function pick(label: string, round: number, edge: number, slot?: number, tier?: string) {
  return {
    asset_type: "pick",
    label,
    edge_score: edge,
    pick_round: round,
    pick_slot: slot ?? null,
    pick_tier: tier ?? null,
  };
}

describe("trade recommendation quality", () => {
  it("rejects selling an elite asset for late-pick junk without an anchor", () => {
    const input = {
      valueEdgeForUser: 0,
      sendAssets: [player("Drake Maye", 98, 11_300)],
      receiveAssets: [
        pick("2027 Mid 4th", 4, 52),
        pick("2028 Mid 4th", 4, 44),
      ],
    };

    expect(lacksAnchorWhenSellingElite(input)).toBe(true);
    expect(recommendationRejectReason(input)).toContain("elite asset");
  });

  it("allows elite tier-down packages when a real player anchor comes back", () => {
    const input = {
      valueEdgeForUser: 0,
      sendAssets: [player("Elite QB", 98, 11_300)],
      receiveAssets: [
        player("Lesser QB Anchor", 82, 6_400),
        pick("2027 Mid 1st", 1, 68),
      ],
    };

    expect(lacksAnchorWhenSellingElite(input)).toBe(false);
    expect(recommendationRejectReason(input)).toBeNull();
  });

  it("allows elite sales where the return anchor is a premium first", () => {
    const input = {
      valueEdgeForUser: 0,
      sendAssets: [player("Elite WR", 92, 9_500)],
      receiveAssets: [
        pick("2026 1.03", 1, 73, 3, "early"),
        player("Depth WR", 62, 2_800),
      ],
    };

    expect(lacksAnchorWhenSellingElite(input)).toBe(false);
    expect(recommendationRejectReason(input)).toBeNull();
  });

  it("rejects unrealistic elite acquisitions when the value edge is massive and acceptance is hard", () => {
    const input = {
      valueEdgeForUser: 14_367,
      acceptance: {
        probability: 5,
        accept_reasons: [],
        reject_reasons: ["Targeting their top starter. Hard to pry loose."],
      },
      sendAssets: [
        player("Courtland Sutton", 76, 3_500),
        pick("2027 Late 1st", 1, 84, undefined, "late"),
      ],
      receiveAssets: [player("Josh Allen", 99, 24_000)],
    };

    expect(isUnrealisticEliteAcquisition(input)).toBe(true);
    expect(recommendationRejectReason(input)).toContain("unrealistic elite acquisition");
  });

  it("does not reject elite acquisitions when acceptance is realistically strong", () => {
    const input = {
      valueEdgeForUser: 2_800,
      acceptance: {
        probability: 42,
        accept_reasons: ["They are rebuilding and get a premium return."],
        reject_reasons: [],
      },
      sendAssets: [
        player("Young QB", 90, 9_500),
        pick("2027 Early 1st", 1, 76, 3, "early"),
      ],
      receiveAssets: [player("Elite QB", 96, 12_000)],
    };

    expect(isUnrealisticEliteAcquisition(input)).toBe(false);
    expect(recommendationRejectReason(input)).toBeNull();
  });

  it("rejects protected young-core deals unless they are intentional win-now points buys", () => {
    const base = {
      valueEdgeForUser: -400,
      sendAssets: [player("Young Core QB", 86, 7_200)],
      receiveAssets: [player("Veteran RB", 78, 4_900)],
      healthWarnings: [
        { type: "warning" as const, rule: "young_core_protection", message: "Protected young core." },
      ],
    };

    expect(recommendationRejectReason(base)).toContain("protected young core");
    expect(recommendationRejectReason({
      ...base,
      receiveAssets: [
        player("Veteran RB 1", 88, 4_600),
        player("Veteran RB 2", 74, 2_100),
      ],
      healthWarnings: [
        ...base.healthWarnings,
        { type: "warning" as const, rule: "win_now_points_buy", message: "Adds projected points." },
      ],
    })).toBeNull();
  });
});
