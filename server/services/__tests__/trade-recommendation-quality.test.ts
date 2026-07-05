import { describe, expect, it } from "vitest";
import {
  isExcessiveRecommendationOverpay,
  recommendationAcceptanceProbability,
  recommendationPercentGapFraction,
  recommendationRejectReason,
} from "../trade-recommendation-quality.js";

describe("trade recommendation quality guard", () => {
  it("normalizes percent gaps from fraction or percent form", () => {
    expect(recommendationPercentGapFraction(0.31)).toBe(0.31);
    expect(recommendationPercentGapFraction(31)).toBe(0.31);
  });

  it("rejects excessive user overpays across recommendation surfaces", () => {
    const input = {
      valueEdgeForUser: -5_956,
      percentGap: 0.58,
      fairness: "lopsided" as const,
    };

    expect(isExcessiveRecommendationOverpay(input)).toBe(true);
    expect(recommendationRejectReason(input)).toContain("excessive overpay");
  });

  it("caps acceptance when the only positive signal is user overpay", () => {
    const probability = recommendationAcceptanceProbability({
      valueEdgeForUser: -1_000,
      percentGap: 0.12,
      fairness: "slight_edge",
      acceptance: {
        probability: 90,
        accept_reasons: ["Massive overpay in their favor. They'll take this immediately."],
        reject_reasons: [],
      },
    });

    expect(probability).toBe(28);
  });

  it("protects young core warnings unless return is overwhelming", () => {
    expect(recommendationRejectReason({
      valueEdgeForUser: 0,
      percentGap: 0,
      fairness: "fair",
      healthWarnings: [
        {
          type: "warning",
          rule: "young_core_protection",
          message: "Young core warning.",
        },
      ],
    })).toContain("protected young core");

    expect(recommendationRejectReason({
      valueEdgeForUser: 1_800,
      percentGap: 0.18,
      fairness: "slight_edge",
      healthWarnings: [
        {
          type: "warning",
          rule: "young_core_protection",
          message: "Young core warning.",
        },
      ],
    })).toBeNull();
  });
});
