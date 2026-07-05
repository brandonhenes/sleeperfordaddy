import type { TradeHealthWarning } from "../../shared/types.js";

export const MAJOR_RECOMMENDATION_EDGE = 1_500;
export const EXCESSIVE_RECOMMENDATION_OVERPAY = 2_500;
export const EXCESSIVE_RECOMMENDATION_OVERPAY_GAP = 0.22;
const OVERPAY_ACCEPTANCE_CAP = 28;

type AcceptanceLike = {
  probability: number;
  accept_reasons: string[];
  reject_reasons?: string[];
} | null | undefined;

export interface RecommendationQualityInput {
  valueEdgeForUser: number;
  percentGap?: number | null;
  fairness?: "fair" | "slight_edge" | "lopsided";
  acceptance?: AcceptanceLike;
  sendAssets?: readonly unknown[];
  receiveAssets?: readonly unknown[];
  healthWarnings?: readonly TradeHealthWarning[];
}

export function recommendationPercentGapFraction(percentGap?: number | null): number {
  const gap = percentGap ?? 0;
  return gap > 1 ? gap / 100 : gap;
}

export function isExcessiveRecommendationOverpay(input: RecommendationQualityInput): boolean {
  const edge = input.valueEdgeForUser;
  if (edge >= 0) return false;
  return edge <= -EXCESSIVE_RECOMMENDATION_OVERPAY ||
    (edge <= -MAJOR_RECOMMENDATION_EDGE &&
      recommendationPercentGapFraction(input.percentGap) >= EXCESSIVE_RECOMMENDATION_OVERPAY_GAP);
}

export function isOverpayDrivenAcceptance(input: RecommendationQualityInput): boolean {
  if (input.valueEdgeForUser >= 0 || !input.acceptance) return false;
  return input.acceptance.accept_reasons.some((reason) => /overpay|better end|take this immediately/i.test(reason));
}

export function recommendationAcceptanceProbability(input: RecommendationQualityInput): number {
  const probability = input.acceptance?.probability ?? 0;
  return isOverpayDrivenAcceptance(input)
    ? Math.min(probability, OVERPAY_ACCEPTANCE_CAP)
    : probability;
}

export function recommendationRejectReason(input: RecommendationQualityInput): string | null {
  if (isExcessiveRecommendationOverpay(input)) {
    return "Rejecting excessive overpay; acceptance is not useful if you are donating too much value.";
  }

  const protectsYoungCore = input.healthWarnings?.some(
    (warning) => warning.rule === "young_core_protection"
  );
  if (protectsYoungCore && input.valueEdgeForUser < MAJOR_RECOMMENDATION_EDGE) {
    return "Rejecting protected young core trade without an overwhelming return.";
  }

  return null;
}
