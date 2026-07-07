import type { TradeHealthWarning } from "../../shared/types.js";

export const MAJOR_RECOMMENDATION_EDGE = 1_500;
export const EXCESSIVE_RECOMMENDATION_OVERPAY = 2_500;
export const EXCESSIVE_RECOMMENDATION_OVERPAY_GAP = 0.22;
const OVERPAY_ACCEPTANCE_CAP = 28;
const ELITE_ASSET_EDGE = 90;
const ELITE_ASSET_TRADE_VALUE = 9_000;
const MIN_ELITE_RETURN_ANCHOR_EDGE = 72;
const MIN_ELITE_RETURN_ANCHOR_VALUE = 4_500;
const UNREALISTIC_ELITE_ACQUISITION_EDGE = 2_500;
const UNREALISTIC_ELITE_ACQUISITION_ACCEPTANCE_CAP = 15;

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

type AssetLike = {
  asset_type?: unknown;
  position?: unknown;
  edge_score?: unknown;
  context_trade_value?: unknown;
  trade_power?: unknown;
  league_market_value?: unknown;
  base_market_value?: unknown;
  pick_round?: unknown;
  pick_slot?: unknown;
  pick_tier?: unknown;
  pick_breakdown?: {
    round?: unknown;
    pickSlot?: unknown;
    tier?: unknown;
  } | null;
};

function asAsset(value: unknown): AssetLike {
  return value && typeof value === "object" ? value as AssetLike : {};
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assetEdge(asset: unknown): number {
  return numeric(asAsset(asset).edge_score);
}

function assetTradeValue(asset: unknown): number {
  const a = asAsset(asset);
  return Math.max(
    numeric(a.context_trade_value),
    numeric(a.trade_power),
    numeric(a.league_market_value),
    numeric(a.base_market_value)
  );
}

function isPlayerAsset(asset: unknown): boolean {
  const a = asAsset(asset);
  return a.asset_type === "player" || typeof a.position === "string";
}

function isPickAsset(asset: unknown): boolean {
  return asAsset(asset).asset_type === "pick";
}

function pickRound(asset: unknown): number | null {
  const a = asAsset(asset);
  const round = numeric(a.pick_round ?? a.pick_breakdown?.round);
  return round > 0 ? round : null;
}

function pickSlot(asset: unknown): number | null {
  const a = asAsset(asset);
  const slot = numeric(a.pick_slot ?? a.pick_breakdown?.pickSlot);
  return slot > 0 ? slot : null;
}

function pickTier(asset: unknown): string {
  const a = asAsset(asset);
  return String(a.pick_tier ?? a.pick_breakdown?.tier ?? "").toLowerCase();
}

function isEliteAsset(asset: unknown): boolean {
  return isPlayerAsset(asset) &&
    (assetEdge(asset) >= ELITE_ASSET_EDGE || assetTradeValue(asset) >= ELITE_ASSET_TRADE_VALUE);
}

function isPremiumFirst(asset: unknown): boolean {
  if (!isPickAsset(asset)) return false;
  if (pickRound(asset) !== 1) return false;
  const slot = pickSlot(asset);
  return assetEdge(asset) >= 65 || (slot != null && slot <= 8) || pickTier(asset) === "early";
}

function isMeaningfulEliteReturnAnchor(asset: unknown): boolean {
  if (isPremiumFirst(asset)) return true;
  if (!isPlayerAsset(asset)) return false;
  return assetEdge(asset) >= MIN_ELITE_RETURN_ANCHOR_EDGE ||
    assetTradeValue(asset) >= MIN_ELITE_RETURN_ANCHOR_VALUE;
}

export function lacksAnchorWhenSellingElite(input: RecommendationQualityInput): boolean {
  const sendAssets = input.sendAssets ?? [];
  const receiveAssets = input.receiveAssets ?? [];
  if (!sendAssets.some(isEliteAsset)) return false;
  return !receiveAssets.some(isMeaningfulEliteReturnAnchor);
}

export function isUnrealisticEliteAcquisition(input: RecommendationQualityInput): boolean {
  const receiveAssets = input.receiveAssets ?? [];
  if (!receiveAssets.some(isEliteAsset)) return false;
  if (input.valueEdgeForUser < UNREALISTIC_ELITE_ACQUISITION_EDGE) return false;
  if (!input.acceptance) return false;
  return (input.acceptance?.probability ?? 0) <= UNREALISTIC_ELITE_ACQUISITION_ACCEPTANCE_CAP;
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
  if (lacksAnchorWhenSellingElite(input)) {
    return "Rejecting elite asset sale without a real return anchor.";
  }

  if (isUnrealisticEliteAcquisition(input)) {
    return "Rejecting unrealistic elite acquisition; the value gap is too large for the acceptance signal.";
  }

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
