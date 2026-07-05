import type {
  CoreAsset,
  RosterRanking,
  ScoredPick,
  TradeSuggestion,
  TradePackage,
  TradePackageAsset,
  TradePackageQualityLabel,
  TradePackageQualityTier,
  TradePackageRankingComponents,
  TradeOpportunityType,
  TradeValuationWarning,
} from "../../shared/types.js";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getPowerRankings } from "./power-rankings.js";
import { sourceWeightsKey, type SourceWeights } from "./edge-score.js";
import {
  parseLeagueScoring,
  loadPlayerUsageStats,
  computeScoringDelta,
  computeAdjustedEdgeScore,
  estimateBaselineFPPG,
  isNonStandardScoring,
  type LeagueScoringSettings,
} from "./scoring-adjustment.js";
import {
  buildLeagueBehaviors,
  buildAcceptReason,
  estimateAcceptance,
  type ManagerBehavior,
} from "./manager-behavior.js";
import {
  loadTradeHealthPlayerInfo,
  tradeHealthCheck,
} from "./trade-calculator.js";
import {
  enrichScoredPick,
  type ClassStrengthMap,
} from "./pick-values.js";
import { evaluateOpportunityPackage } from "./trade-opportunity-valuation.js";
import {
  MAJOR_RECOMMENDATION_EDGE,
  isExcessiveRecommendationOverpay,
  isOverpayDrivenAcceptance,
  recommendationAcceptanceProbability,
  recommendationPercentGapFraction,
  recommendationRejectReason,
} from "./trade-recommendation-quality.js";
import {
  applyTradeStrategyMetadata,
  classifyTradeStrategy,
} from "./trade-strategy-thesis.js";

// Constants

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];

const MIN_STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const MIN_EDGE_SCORE = 42;
const ANCHOR_EDGE_SCORE = 62;
const ELITE_EDGE_SCORE = 85;
const MAJOR_VALUATION_EDGE = MAJOR_RECOMMENDATION_EDGE;
const TRADE_FINDER_MAX_EVALUATIONS_PER_OPPONENT = 10;
const TRADE_FINDER_MAX_OPPONENTS = 4;

const ARCHETYPE_WANTS: Record<string, string> = {
  "Dynasty Juggernaut": "depth maintenance",
  "All-In Contender": "win-now upgrades",
  "Fragile Contender": "young replacements for aging stars",
  "Productive Struggle": "young assets and draft picks",
  Rebuilder: "draft picks and prospects",
  "Dead Zone": "either direction, picks or win-now pieces",
  Competitor: "small upgrades to push into contention",
};

// Types

interface RosterProfile {
  roster: RosterRanking;
  byPos: Record<Pos, CoreAsset[]>;
  needs: Pos[];
  surplus: Record<Pos, CoreAsset[]>;
  needUrgency: Record<Pos, number>;
  tradeablePicks: EnrichedPick[];
  topPlayerIdsByPos: Record<Pos, string>;
  behavior?: ManagerBehavior;
}

type EnrichedPick = ScoredPick & {
  pick_breakdown: TradePackageAsset["pick_breakdown"];
};

// Helpers

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assetFromPlayer(a: CoreAsset): TradePackageAsset {
  return {
    player_id: a.player_id,
    asset_type: "player",
    label: a.full_name,
    position: a.position,
    edge_score: a.edge_score,
    trade_power: 0,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: a.source_agreement,
  };
}

type UsageStats = Awaited<ReturnType<typeof loadPlayerUsageStats>>;

function assetFromPlayerWithScoring(
  a: CoreAsset,
  scoring: LeagueScoringSettings,
  usage: UsageStats,
  hasCustom: boolean
): TradePackageAsset {
  const base = assetFromPlayer(a);
  if (!hasCustom) return base;
  const u = usage.get(a.player_id);
  if (!u) return base;
  const { delta_ppg } = computeScoringDelta(u, a.position, scoring);
  const baselineFPPG = estimateBaselineFPPG(u, a.position);
  base.league_adjusted_score = computeAdjustedEdgeScore(a.edge_score, delta_ppg, baselineFPPG);
  base.scoring_delta_ppg = delta_ppg;
  return base;
}

function assetFromPick(p: EnrichedPick): TradePackageAsset {
  return {
    player_id: null,
    asset_type: "pick",
    pick_season: p.pick_breakdown?.season ?? p.season,
    pick_round: p.pick_breakdown?.round ?? p.round,
    pick_tier: p.pick_breakdown?.tier ?? p.tier,
    pick_slot: p.pick_slot ?? null,
    pick_original_owner_id: p.original_owner_id ?? null,
    label: p.label,
    position: null,
    edge_score: p.edge_score,
    trade_power: 0,
    fc_score: null,
    ktc_score: p.ktc_score,
    dp_score: p.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
    pick_breakdown: p.pick_breakdown ?? null,
  };
}

function tradeTypeForPackage(
  type: TradePackage["type"]
): TradePackage["trade_type"] {
  if (type === "balanced") return "1-for-1";
  if (type === "consolidation") return "2-for-1";
  if (type === "player_plus_pick") return "player-plus-pick";
  return "pick-package";
}

function packageContainsPick(pkg: Pick<TradePackage, "you_send" | "you_receive">): boolean {
  return (
    pkg.you_send.some((asset) => asset.asset_type === "pick") ||
    pkg.you_receive.some((asset) => asset.asset_type === "pick")
  );
}

export function isPickOnlyTradePackage(pkg: Pick<TradePackage, "you_send" | "you_receive">): boolean {
  const assets = [...pkg.you_send, ...pkg.you_receive];
  return assets.length > 0 && assets.every((asset) => asset.asset_type === "pick");
}

function packageContainsPlayer(pkg: Pick<TradePackage, "you_send" | "you_receive">): boolean {
  return (
    pkg.you_send.some((asset) => asset.asset_type === "player") ||
    pkg.you_receive.some((asset) => asset.asset_type === "player")
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assetMarketValue(asset: TradePackageAsset): number {
  return (
    asset.context_trade_value ??
    asset.league_market_value ??
    asset.base_market_value ??
    asset.trade_power ??
    asset.edge_score * 100
  );
}

function assetRound(asset: TradePackageAsset): number | null {
  return asset.pick_breakdown?.round ?? asset.pick_round ?? null;
}

function pickQualityKey(asset: TradePackageAsset): string {
  const round = assetRound(asset) ?? "?";
  const slot = asset.pick_breakdown?.pickSlot ?? asset.pick_slot ?? null;
  const tier = asset.pick_breakdown?.tier ?? asset.pick_tier ?? "?";
  const season = asset.pick_breakdown?.season ?? asset.pick_season ?? "?";
  return `${season}:r${round}:s${slot ?? tier}`;
}

function assetShapeKey(asset: TradePackageAsset): string {
  if (asset.asset_type === "pick") return `pick:${pickQualityKey(asset)}`;
  return `player:${asset.player_id ?? normalizeLabel(asset.label)}`;
}

function packageShapeKey(pkg: Pick<TradePackage, "you_send" | "you_receive" | "opportunity_type">): string {
  const send = pkg.you_send.map(assetShapeKey).sort().join("+");
  const receive = pkg.you_receive.map(assetShapeKey).sort().join("+");
  return `${pkg.opportunity_type ?? "unknown"}:${send}->${receive}`;
}

function classStrengthsKey(classStrengths?: ClassStrengthMap): string {
  if (!classStrengths) return "default";
  return Object.entries(classStrengths)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, strength]) => `${season}:${strength}`)
    .join(",");
}

function packageEvaluationCacheKey(
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  leagueId: string,
  mode: "sf" | "1qb",
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights
): string {
  const sendKey = send.map(assetShapeKey).sort().join("+");
  const receiveKey = receive.map(assetShapeKey).sort().join("+");
  return [
    leagueId,
    mode,
    sourceWeightsKey(weights),
    classStrengthsKey(classStrengths),
    sendKey,
    receiveKey,
  ].join("|");
}

function pickOnlyShapeKey(pkg: Pick<TradePackage, "you_send" | "you_receive">): string {
  const send = pkg.you_send.map(pickQualityKey).sort().join("+");
  const receive = pkg.you_receive.map(pickQualityKey).sort().join("+");
  return `${send}->${receive}`;
}

function bestAsset(assets: TradePackageAsset[]): TradePackageAsset | null {
  if (assets.length === 0) return null;
  return [...assets].sort((a, b) => assetMarketValue(b) - assetMarketValue(a))[0];
}

function bestEdge(assets: TradePackageAsset[]): number {
  return Math.max(0, ...assets.map((asset) => asset.edge_score));
}

function hasEliteAsset(assets: TradePackageAsset[]): boolean {
  return assets.some(
    (asset) => asset.edge_score >= ELITE_EDGE_SCORE || assetMarketValue(asset) >= 8_500
  );
}

function isPremiumPick(asset: TradePackageAsset): boolean {
  if (asset.asset_type !== "pick") return false;
  const round = assetRound(asset);
  const slot = asset.pick_breakdown?.pickSlot ?? asset.pick_slot ?? null;
  return round === 1 || asset.edge_score >= 58 || (round === 2 && (slot == null || slot <= 18));
}

function isAnchorAsset(asset: TradePackageAsset): boolean {
  if (asset.asset_type === "pick") return isPremiumPick(asset);
  return asset.edge_score >= ANCHOR_EDGE_SCORE || assetMarketValue(asset) >= 2_500;
}

function hasAnchorAsset(assets: TradePackageAsset[]): boolean {
  return assets.some(isAnchorAsset);
}

function hasUsefulReturn(pkg: Pick<TradePackage, "you_receive">): boolean {
  return pkg.you_receive.some(
    (asset) => asset.edge_score >= 55 || assetMarketValue(asset) >= 1_500 || isPremiumPick(asset)
  );
}

function positionsIn(assets: TradePackageAsset[]): Pos[] {
  const positions = new Set<Pos>();
  for (const asset of assets) {
    const pos = asset.position as Pos | null;
    if (pos && POSITIONS.includes(pos)) positions.add(pos);
  }
  return [...positions];
}

function assetsAddressNeeds(assets: TradePackageAsset[], needs: readonly string[]): boolean {
  const needSet = new Set(needs);
  return positionsIn(assets).some((pos) => needSet.has(pos));
}

function wantsFutureAssets(archetype: string): boolean {
  return (
    archetype === "Rebuilder" ||
    archetype === "Productive Struggle" ||
    archetype === "Dead Zone"
  );
}

function isAgingOrFragilePlayer(asset: CoreAsset): boolean {
  if (asset.age_curve.score < 72) return true;
  if (asset.position === "RB" && (asset.age ?? 0) >= 27) return true;
  if ((asset.position === "WR" || asset.position === "TE") && (asset.age ?? 0) >= 29) return true;
  if (asset.position === "QB" && (asset.age ?? 0) >= 34) return true;
  return asset.availability !== "active";
}

function packageHasPickReturn(pkg: Pick<TradePackage, "you_receive">): boolean {
  return pkg.you_receive.some((asset) => asset.asset_type === "pick");
}

function packageHasPickSend(pkg: Pick<TradePackage, "you_send">): boolean {
  return pkg.you_send.some((asset) => asset.asset_type === "pick");
}

export function isMaterialPickOnlyTrade(pkg: Pick<TradePackage, "you_send" | "you_receive" | "delta" | "valuation_percent_gap">): boolean {
  if (!isPickOnlyTradePackage(pkg)) return false;

  const bestSent = bestAsset(pkg.you_send);
  const bestReceived = bestAsset(pkg.you_receive);
  if (!bestSent || !bestReceived) return false;

  const receivedRound = assetRound(bestReceived);
  const sentRounds = pkg.you_send.map(assetRound).filter((round): round is number => round != null);
  const receivedValue = assetMarketValue(bestReceived);
  const bestSentValue = assetMarketValue(bestSent);
  const totalSentValue = pkg.you_send.reduce((sum, asset) => sum + assetMarketValue(asset), 0);
  const totalReceivedValue = pkg.you_receive.reduce((sum, asset) => sum + assetMarketValue(asset), 0);

  const tierUp =
    receivedValue >= bestSentValue + 850 ||
    bestReceived.edge_score >= bestSent.edge_score + 8 ||
    (receivedRound === 1 && !sentRounds.includes(1) && receivedValue >= bestSentValue + 350);
  const weakPicksToPremium =
    pkg.you_send.length >= 2 &&
    bestReceived.asset_type === "pick" &&
    isPremiumPick(bestReceived) &&
    bestSent.edge_score < bestReceived.edge_score;
  const moveDownForLiquidity =
    pkg.you_send.length === 1 &&
    pkg.you_receive.length >= 2 &&
    totalReceivedValue >= totalSentValue + 1_000;

  return tierUp || weakPicksToPremium || moveDownForLiquidity;
}

function majorValuationEdge(pkg: Pick<TradePackage, "delta" | "valuation_edge" | "valuation_percent_gap">): boolean {
  const edge = Math.abs(pkg.valuation_edge ?? pkg.delta);
  return edge >= MAJOR_VALUATION_EDGE || recommendationPercentGapFraction(pkg.valuation_percent_gap) > 0.24;
}

function valuationEdgeForUser(pkg: Pick<TradePackage, "delta" | "valuation_edge">): number {
  return pkg.valuation_edge ?? pkg.delta;
}

function hasInvalidAssetData(pkg: Pick<TradePackage, "you_send" | "you_receive" | "send_total" | "receive_total">): boolean {
  if (pkg.you_send.length === 0 || pkg.you_receive.length === 0) return true;
  if (pkg.send_total <= 0 || pkg.receive_total <= 0) return true;
  const assets = [...pkg.you_send, ...pkg.you_receive];
  return assets.some(
    (asset) =>
      !asset.label ||
      asset.edge_score == null ||
      Number.isNaN(asset.edge_score) ||
      !["player", "pick"].includes(asset.asset_type)
  );
}

function anchorRuleViolation(pkg: Pick<TradePackage, "you_send" | "you_receive">): string | null {
  const sendElite = hasEliteAsset(pkg.you_send);
  const receiveElite = hasEliteAsset(pkg.you_receive);
  const sendAnchor = hasAnchorAsset(pkg.you_send);
  const receiveAnchor = hasAnchorAsset(pkg.you_receive);
  const sendBestEdge = bestEdge(pkg.you_send);
  const receiveBestEdge = bestEdge(pkg.you_receive);

  if (receiveElite && pkg.you_send.length > 1 && !sendAnchor) {
    return "Rejecting superstar-for-junk volume.";
  }
  if (receiveElite && sendBestEdge < receiveBestEdge - 20 && pkg.you_send.length >= 2) {
    return "Package lacks a real anchor for an elite target.";
  }
  if (sendElite && pkg.you_receive.length > 1 && !receiveAnchor) {
    return "Do not sell an elite asset without a meaningful anchor coming back.";
  }
  if (pkg.you_receive.length > 1 && packageContainsPlayer(pkg) && !receiveAnchor) {
    return "Multi-asset return has no useful anchor.";
  }

  return null;
}

function hardRejectReason(pkg: TradePackage): string | null {
  if (hasInvalidAssetData(pkg)) return "Invalid or missing asset data.";
  const recommendationReject = recommendationRejectReason({
    valueEdgeForUser: valuationEdgeForUser(pkg),
    percentGap: pkg.valuation_percent_gap,
    fairness: pkg.fairness,
    acceptance: pkg.acceptance,
    sendAssets: pkg.you_send,
    receiveAssets: pkg.you_receive,
    healthWarnings: pkg.healthCheck,
  });
  if (recommendationReject) return recommendationReject;
  if (isPickOnlyTradePackage(pkg) && !isMaterialPickOnlyTrade(pkg)) {
    return "Pick swap is not a meaningful tier-up or liquidity move.";
  }
  const anchorViolation = anchorRuleViolation(pkg);
  if (anchorViolation) return anchorViolation;
  if (!hasUsefulReturn(pkg)) return "Return lacks a useful fantasy asset.";
  return null;
}

function qualityReason(pkg: TradePackage): string {
  const rejectReason = hardRejectReason(pkg);
  if (rejectReason) return rejectReason;
  if (!pkg.addresses_my_need && !pkg.addresses_their_need) {
    return "Low-confidence starting point because it is value-driven more than need-driven.";
  }
  return "Package has a useful anchor and a clear strategic purpose.";
}

function opportunityTypeForPackage(pkg: TradePackage): TradeOpportunityType {
  const sendPlayers = pkg.you_send.filter((asset) => asset.asset_type === "player").length;
  const receivePlayers = pkg.you_receive.filter((asset) => asset.asset_type === "player").length;
  const sendPicks = pkg.you_send.length - sendPlayers;
  const receivePicks = pkg.you_receive.length - receivePlayers;

  if (isPickOnlyTradePackage(pkg)) return "pick_swap";
  if (pkg.addresses_my_need && pkg.addresses_their_need) return "need_based";
  if (pkg.type === "consolidation" || (pkg.you_send.length > 1 && pkg.you_receive.length === 1)) {
    return "consolidate";
  }
  if (pkg.you_send.length === 1 && pkg.you_receive.length > 1 && hasAnchorAsset(pkg.you_receive)) {
    return "deconsolidate";
  }
  if (sendPlayers > 0 && sendPicks > 0 && receivePlayers > 0) return "player_plus_pick";
  if (sendPlayers > 0 && receivePlayers > 0 && receivePicks > 0) return "sell_player";
  if (sendPicks > 0 || receivePicks > 0) return "pick_sweetener";
  return "buy_target";
}

function qualityScore(pkg: TradePackage): number {
  let score = 50;
  if (pkg.has_anchor_asset) score += 18;
  if (pkg.addresses_my_need) score += 14;
  if (pkg.addresses_their_need) score += 14;
  if ((pkg.strategy_score ?? 0) >= 74) score += 8;
  if (pkg.strategy_fit === "thin") score -= 8;
  if (pkg.strategy_fit === "bad") score -= 24;
  if ((pkg.strategy_warnings?.length ?? 0) > 0) score -= Math.min(14, (pkg.strategy_warnings?.length ?? 0) * 5);
  if (!pkg.addresses_my_need && !pkg.addresses_their_need) {
    score -= majorValuationEdge(pkg) ? 10 : 24;
  }
  if (isPickOnlyTradePackage(pkg)) score -= 25;
  if (isPickOnlyTradePackage(pkg) && isMaterialPickOnlyTrade(pkg)) score += 15;
  if (pkg.you_send.length >= 3 && bestEdge(pkg.you_send) < 58) score -= 20;
  if (pkg.you_receive.length >= 2 && !hasAnchorAsset(pkg.you_receive)) score -= 28;
  if (anchorRuleViolation(pkg)) score -= 40;
  if (pkg.fairness === "lopsided") score -= 22;
  if (pkg.fairness === "lopsided" && valuationEdgeForUser(pkg) < 0) score -= 12;
  if (valuationEdgeForUser(pkg) < -MAJOR_VALUATION_EDGE) score -= 18;
  if (isExcessiveRecommendationOverpay({
    valueEdgeForUser: valuationEdgeForUser(pkg),
    percentGap: pkg.valuation_percent_gap,
    fairness: pkg.fairness,
    acceptance: pkg.acceptance,
  })) score -= 45;
  if (isOverpayDrivenAcceptance({
    valueEdgeForUser: valuationEdgeForUser(pkg),
    percentGap: pkg.valuation_percent_gap,
    fairness: pkg.fairness,
    acceptance: pkg.acceptance,
  })) score -= 16;
  if (pkg.acceptance?.reject_reasons.some((reason) => reason.includes("Does not address a clear need"))) {
    score -= majorValuationEdge(pkg) ? 6 : 14;
  }
  if (pkg.acceptance) {
    if (pkg.acceptance.probability < 25) score -= 18;
    else if (pkg.acceptance.probability < 40) score -= 10;
  }
  return clamp(score, 0, 100);
}

function qualityLabel(score: number): TradePackageQualityLabel {
  if (score >= 78) return "premium";
  if (score >= 58) return "solid";
  if (score >= 40) return "speculative";
  return "poor";
}

function qualityTier(pkg: TradePackage, quality: number): TradePackageQualityTier {
  const pickOnly = isPickOnlyTradePackage(pkg);
  if (pkg.fairness === "lopsided") return "low_confidence";
  if (pkg.strategy_fit === "bad") return "low_confidence";
  const needFit = Boolean(pkg.addresses_my_need && pkg.addresses_their_need);
  const partialFit = Boolean(pkg.addresses_my_need || pkg.addresses_their_need);
  const acceptanceOkay = !pkg.acceptance || pkg.acceptance.probability >= 40;
  const valuationOkay =
    pkg.fairness === "fair" ||
    (pkg.fairness === "slight_edge" && (pkg.valuation_edge ?? pkg.delta) >= -500);
  const strategyOkay = (pkg.strategy_score ?? 50) >= 56;
  const strategyStrong = (pkg.strategy_score ?? 0) >= 72;

  if (!pickOnly && (needFit || strategyStrong) && quality >= 72 && acceptanceOkay && valuationOkay) {
    return "strong";
  }
  if (!pickOnly && (partialFit || majorValuationEdge(pkg) || strategyOkay) && quality >= 42) {
    return "speculative";
  }
  return "low_confidence";
}

function rankingComponents(pkg: TradePackage, quality: number): TradePackageRankingComponents {
  const edge = valuationEdgeForUser(pkg);
  const valuationEdge = clamp(55 + (edge / 1_500) * 16, 5, 95);
  const noClearNeed = !pkg.addresses_my_need && !pkg.addresses_their_need;
  const rosterFit = pkg.addresses_my_need
    ? 90
    : noClearNeed
      ? majorValuationEdge(pkg) ? 45 : 28
      : packageHasPickReturn(pkg)
      ? 58
      : hasAnchorAsset(pkg.you_receive)
        ? 62
        : 20;
  const opponentNeed = pkg.addresses_their_need
    ? 90
    : noClearNeed
      ? majorValuationEdge(pkg) ? 45 : 28
      : packageHasPickSend(pkg)
      ? 58
      : 20;
  const acceptance = pkg.acceptance
    ? recommendationAcceptanceProbability({
        valueEdgeForUser: edge,
        percentGap: pkg.valuation_percent_gap,
        fairness: pkg.fairness,
        acceptance: pkg.acceptance,
      })
    : (pkg.addresses_their_need ? 62 : 42);
  const liquidity = isPickOnlyTradePackage(pkg)
    ? 56
    : packageContainsPick(pkg)
      ? 72
      : 48;
  const risk = anchorRuleViolation(pkg)
    ? 12
    : isExcessiveRecommendationOverpay({
        valueEdgeForUser: edge,
        percentGap: pkg.valuation_percent_gap,
        fairness: pkg.fairness,
        acceptance: pkg.acceptance,
      })
      ? 5
    : pkg.fairness === "lopsided"
      ? 35
      : 76;
  const diversity = pkg.opportunity_type === "pick_swap" ? 20 : 70;
  const strategyFit = pkg.strategy_score ?? 45;
  const total =
    valuationEdge * 0.22 +
    strategyFit * 0.22 +
    rosterFit * 0.1 +
    opponentNeed * 0.1 +
    acceptance * 0.12 +
    quality * 0.14 +
    liquidity * 0.05 +
    risk * 0.04 +
    diversity * 0.01;

  return {
    valuation_edge: Math.round(valuationEdge),
    roster_fit: Math.round(rosterFit),
    opponent_need: Math.round(opponentNeed),
    acceptance_likelihood: Math.round(acceptance),
    package_quality: Math.round(quality),
    strategy_fit: Math.round(strategyFit),
    liquidity: Math.round(liquidity),
    risk: Math.round(risk),
    diversity: Math.round(diversity),
    total: Math.round(total),
  };
}

export interface TradeFinderQualityContext {
  userNeeds: readonly string[];
  opponentNeeds: readonly string[];
  userArchetype: string;
  opponentArchetype: string;
  mode?: "sf" | "1qb";
  managerSignals?: string[];
}

export function annotateTradeFinderPackage(
  pkg: TradePackage,
  context: TradeFinderQualityContext
): TradePackage {
  const pickOnly = isPickOnlyTradePackage(pkg);
  const addressesMyNeed =
    assetsAddressNeeds(pkg.you_receive, context.userNeeds) ||
    (packageHasPickReturn(pkg) && wantsFutureAssets(context.userArchetype)) ||
    (pickOnly && isMaterialPickOnlyTrade(pkg));
  const addressesTheirNeed =
    assetsAddressNeeds(pkg.you_send, context.opponentNeeds) ||
    (packageHasPickSend(pkg) && wantsFutureAssets(context.opponentArchetype));
  const hasAnchor = hasAnchorAsset(pkg.you_receive);
  const provisional: TradePackage = {
    ...pkg,
    is_pick_only: pickOnly,
    has_anchor_asset: hasAnchor,
    addresses_my_need: addressesMyNeed,
    addresses_their_need: addressesTheirNeed,
  };
  const opportunityType = opportunityTypeForPackage(provisional);
  const withType: TradePackage = {
    ...provisional,
    opportunity_type: opportunityType,
    roster_fit_reason: addressesMyNeed
      ? "Return matches your roster need or strategic build direction."
      : "Return is value-driven rather than a direct roster need.",
    opponent_need_reason: addressesTheirNeed
      ? "Outgoing package matches their roster need or rebuild direction."
      : "Opponent fit is weaker because the package does not solve a clear need.",
    risk_reason: qualityReason(provisional),
  };
  const strategy = classifyTradeStrategy({
    sendAssets: withType.you_send,
    receiveAssets: withType.you_receive,
    userArchetype: context.userArchetype,
    opponentArchetype: context.opponentArchetype,
    valueEdgeForUser: valuationEdgeForUser(withType),
    percentGap: withType.valuation_percent_gap,
    fairness: withType.fairness,
    addressesMyNeed,
    addressesTheirNeed,
    acceptanceProbability: withType.acceptance?.probability,
    managerSignals: context.managerSignals,
    healthWarnings: withType.healthCheck,
    mode: context.mode,
    pickOnlyMaterial: pickOnly ? isMaterialPickOnlyTrade(withType) : false,
  });

  return withQualityMetadata(applyTradeStrategyMetadata(withType, strategy));
}

export function shouldSurfaceTradeFinderPackage(pkg: TradePackage): boolean {
  return hardRejectReason(pkg) == null;
}

function withQualityMetadata(pkg: TradePackage): TradePackage {
  const quality = qualityScore(pkg);
  const withComponents = {
    ...pkg,
    package_quality_label: qualityLabel(quality),
    quality_tier: qualityTier(pkg, quality),
    ranking_components: rankingComponents(pkg, quality),
  };
  return withComponents;
}

export function dedupeAndRankTradeFinderPackages(
  packages: TradePackage[],
  maxPackages = 4
): TradePackage[] {
  const seen = new Set<string>();
  const typeCounts = new Map<TradeOpportunityType, number>();
  const validPackages = packages.filter(shouldSurfaceTradeFinderPackage);
  const hasMultiAssetPlayerPackage = validPackages.some(
    (pkg) => !isPickOnlyTradePackage(pkg) && pkg.you_send.length + pkg.you_receive.length > 2
  );
  const betterThanLow = validPackages.filter((pkg) => pkg.quality_tier !== "low_confidence");
  const pool = betterThanLow.length > 0
    ? betterThanLow
    : validPackages.filter((pkg) => pkg.quality_tier === "low_confidence");
  const effectiveMaxPackages = betterThanLow.length > 0
    ? maxPackages
    : Math.min(maxPackages, 2);
  const tierRank: Record<TradePackageQualityTier, number> = {
    strong: 3,
    speculative: 2,
    low_confidence: 1,
  };
  const shapeRank = (pkg: TradePackage): number => {
    if (isPickOnlyTradePackage(pkg)) return -3;
    if (pkg.you_send.length + pkg.you_receive.length > 2) return 3;
    if (pkg.trade_type === "1-for-1") return -1;
    return 1;
  };
  const sorted = [...pool].sort(
    (a, b) =>
      tierRank[b.quality_tier ?? "low_confidence"] - tierRank[a.quality_tier ?? "low_confidence"] ||
      shapeRank(b) - shapeRank(a) ||
      (b.ranking_components?.total ?? 0) - (a.ranking_components?.total ?? 0) ||
      (b.receive_total - b.send_total) - (a.receive_total - a.send_total)
  );
  const selected: TradePackage[] = [];

  for (const pkg of sorted) {
    if (selected.length >= effectiveMaxPackages) break;
    const key = packageShapeKey(pkg);
    if (seen.has(key)) continue;
    const type = pkg.opportunity_type ?? "buy_target";
    const typeCount = typeCounts.get(type) ?? 0;
    if (typeCount >= 2 && selected.length < effectiveMaxPackages - 1) continue;
    if (isPickOnlyTradePackage(pkg) && selected.some(isPickOnlyTradePackage)) continue;
    if (
      hasMultiAssetPlayerPackage &&
      pkg.trade_type === "1-for-1" &&
      selected.some((selectedPkg) => selectedPkg.trade_type === "1-for-1")
    ) {
      continue;
    }

    seen.add(key);
    typeCounts.set(type, typeCount + 1);
    selected.push(pkg);
  }

  if (selected.length < effectiveMaxPackages) {
    for (const pkg of sorted) {
      if (selected.length >= effectiveMaxPackages) break;
      const key = packageShapeKey(pkg);
      if (seen.has(key)) continue;
      if (
        hasMultiAssetPlayerPackage &&
        pkg.trade_type === "1-for-1" &&
        selected.some((selectedPkg) => selectedPkg.trade_type === "1-for-1")
      ) {
        continue;
      }
      seen.add(key);
      selected.push(pkg);
    }
  }

  return selected;
}

export function applyDisplayedTradeDiversity(
  suggestions: TradeSuggestion[]
): TradeSuggestion[] {
  const pickEntries: Array<{ suggestionIndex: number; packageIndex: number; pkg: TradePackage; rank: number }> = [];
  let playerBasedCount = 0;

  suggestions.forEach((suggestion, suggestionIndex) => {
    suggestion.packages.forEach((pkg, packageIndex) => {
      if (isPickOnlyTradePackage(pkg)) {
        pickEntries.push({
          suggestionIndex,
          packageIndex,
          pkg,
          rank: pkg.ranking_components?.total ?? 0,
        });
      } else {
        playerBasedCount += 1;
      }
    });
  });

  if (pickEntries.length === 0) {
    return suggestions.filter((suggestion) => suggestion.packages.length > 0);
  }

  const allowedPickOnly = playerBasedCount > 0
    ? 0
    : Math.min(1, pickEntries.length);
  const keepPickEntries = new Set<string>();
  const seenPickShapes = new Set<string>();
  for (const entry of [...pickEntries].sort((a, b) => b.rank - a.rank)) {
    if (keepPickEntries.size >= allowedPickOnly) break;
    const shape = pickOnlyShapeKey(entry.pkg);
    if (seenPickShapes.has(shape)) continue;
    seenPickShapes.add(shape);
    keepPickEntries.add(`${entry.suggestionIndex}:${entry.packageIndex}`);
  }

  return suggestions
    .map((suggestion, suggestionIndex) => ({
      ...suggestion,
      packages: suggestion.packages.filter((pkg, packageIndex) => {
        if (!isPickOnlyTradePackage(pkg)) return true;
        return keepPickEntries.has(`${suggestionIndex}:${packageIndex}`);
      }),
    }))
    .filter((suggestion) => suggestion.packages.length > 0);
}

type PackageScore = {
  sendAssets: TradePackageAsset[];
  receiveAssets: TradePackageAsset[];
  sendTotal: number;
  receiveTotal: number;
  delta: number;
  sendEdge: number;
  receiveEdge: number;
  deltaEdge: number;
  packagePenaltySend: number;
  packagePenaltyReceive: number;
  sendBaseMarketValue: number;
  receiveBaseMarketValue: number;
  sendLeagueMarketValue: number;
  receiveLeagueMarketValue: number;
  sendContextTradeValue: number;
  receiveContextTradeValue: number;
  percentGap: number;
  valuationWarnings: TradeValuationWarning[];
  valuationExplanations: string[];
  fairness: "fair" | "slight_edge" | "lopsided";
};

export async function scoreTradeFinderPackage(
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  leagueId: string,
  mode: "sf" | "1qb",
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights
): Promise<PackageScore> {
  const valuation = await evaluateOpportunityPackage({
    send,
    receive,
    leagueId,
    mode,
    classStrengths,
    weights,
  });

  return {
    sendAssets: valuation.sendAssets,
    receiveAssets: valuation.receiveAssets,
    sendTotal: valuation.sendContextTradeValue,
    receiveTotal: valuation.receiveContextTradeValue,
    delta: valuation.delta,
    sendEdge: valuation.sendEdge,
    receiveEdge: valuation.receiveEdge,
    deltaEdge: valuation.deltaEdge,
    packagePenaltySend: valuation.packagePenaltySend,
    packagePenaltyReceive: valuation.packagePenaltyReceive,
    sendBaseMarketValue: valuation.sendBaseMarketValue,
    receiveBaseMarketValue: valuation.receiveBaseMarketValue,
    sendLeagueMarketValue: valuation.sendLeagueMarketValue,
    receiveLeagueMarketValue: valuation.receiveLeagueMarketValue,
    sendContextTradeValue: valuation.sendContextTradeValue,
    receiveContextTradeValue: valuation.receiveContextTradeValue,
    percentGap: valuation.percentGap,
    valuationWarnings: valuation.warnings,
    valuationExplanations: valuation.valuationExplanations,
    fairness: valuation.fairness,
  };
}

type TradeFinderPackageScorer = typeof scoreTradeFinderPackage;

function valuationFields(scored: PackageScore): Pick<
  TradePackage,
  | "send_base_market_value"
  | "receive_base_market_value"
  | "send_league_market_value"
  | "receive_league_market_value"
  | "send_context_trade_value"
  | "receive_context_trade_value"
  | "valuation_edge"
  | "valuation_percent_gap"
  | "valuation_warnings"
  | "valuation_explanations"
> {
  return {
    send_base_market_value: scored.sendBaseMarketValue,
    receive_base_market_value: scored.receiveBaseMarketValue,
    send_league_market_value: scored.sendLeagueMarketValue,
    receive_league_market_value: scored.receiveLeagueMarketValue,
    send_context_trade_value: scored.sendContextTradeValue,
    receive_context_trade_value: scored.receiveContextTradeValue,
    valuation_edge: scored.delta,
    valuation_percent_gap: scored.percentGap,
    valuation_warnings: scored.valuationWarnings,
    valuation_explanations: scored.valuationExplanations,
  };
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

function resolvePlayerIdByLabel(
  asset: TradePackageAsset,
  roster: RosterProfile
): string | null {
  if (asset.asset_type !== "player") return null;
  const target = normalizeLabel(asset.label);
  const found = roster.roster.core_assets.find(
    (p) =>
      normalizeLabel(p.full_name) === target &&
      (!asset.position || p.position === asset.position)
  );
  return found?.player_id ?? null;
}

function applyAcceptanceAndBehavior(
  packages: TradePackage[],
  user: RosterProfile,
  opp: RosterProfile
): TradePackage[] {
  return packages
    .map((pkg) => {
      const sendAssets = pkg.you_send.map((a) => ({
        player_id: resolvePlayerIdByLabel(a, user),
        position: a.position,
        label: a.label,
      }));
      const receiveAssets = pkg.you_receive.map((a) => ({
        player_id: resolvePlayerIdByLabel(a, opp),
        position: a.position,
        label: a.label,
      }));

      const acceptance = estimateAcceptance({
        fairness: pkg.fairness,
        delta: -pkg.delta,
        sendAssets,
        receiveAssets,
        sendEdges: pkg.you_send.map((asset) => asset.edge_score),
        receiveEdges: pkg.you_receive.map((asset) => asset.edge_score),
        opponent: {
          archetype: opp.roster.archetype,
          needs: opp.needs,
          top_player_ids_by_pos: opp.topPlayerIdsByPos,
          behavior: opp.behavior ?? null,
        },
      });

      return {
        ...pkg,
        acceptance,
        why_they_accept: buildAcceptReason(acceptance, pkg.why_they_accept),
      };
    });
}

// Profile Building

function computeLeagueMedians(rosters: RosterRanking[]): Record<Pos, number> {
  const byPos: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const r of rosters) {
    const counts: Partial<Record<Pos, number>> = {};
    for (const a of r.core_assets) {
      const pos = a.position as Pos;
      if (!POSITIONS.includes(pos)) continue;
      counts[pos] = (counts[pos] ?? 0) + 1;
      if ((counts[pos] ?? 0) <= (MIN_STARTERS[pos] ?? 1) + 1) {
        byPos[pos].push(a.edge_score);
      }
    }
  }
  const result: Partial<Record<Pos, number>> = {};
  for (const pos of POSITIONS) result[pos] = median(byPos[pos]);
  return result as Record<Pos, number>;
}

function buildProfile(
  roster: RosterRanking,
  medians: Record<Pos, number>,
  tradeablePicksOverride: EnrichedPick[] = []
): RosterProfile {
  const byPos: Record<Pos, CoreAsset[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const a of roster.core_assets) {
    const pos = a.position as Pos;
    if (POSITIONS.includes(pos)) byPos[pos].push(a);
  }
  for (const pos of POSITIONS) {
    byPos[pos].sort((a, b) => b.edge_score - a.edge_score);
  }

  const topPlayerIdsByPos: Record<Pos, string> = {
    QB: byPos.QB[0]?.player_id ?? "",
    RB: byPos.RB[0]?.player_id ?? "",
    WR: byPos.WR[0]?.player_id ?? "",
    TE: byPos.TE[0]?.player_id ?? "",
  };

  const needs: Pos[] = [];
  const surplus: Record<Pos, CoreAsset[]> = { QB: [], RB: [], WR: [], TE: [] };
  const needUrgency: Record<Pos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

  for (const pos of POSITIONS) {
    const min = MIN_STARTERS[pos];
    const aboveMedian = byPos[pos].filter((a) => a.edge_score > medians[pos]);

    if (aboveMedian.length < min) {
      needs.push(pos);
      const gap = min - aboveMedian.length;
      const bestScore = byPos[pos][0]?.edge_score ?? 0;
      const medianGap = Math.max(0, medians[pos] - bestScore);
      needUrgency[pos] = Math.min(100, gap * 30 + medianGap);
    }

    if (aboveMedian.length > min) {
      surplus[pos] = aboveMedian.slice(min);
    }
  }

  const tradeablePicks = tradeablePicksOverride
    .filter((p) => p.edge_score > 0)
    .sort((a, b) => b.edge_score - a.edge_score);

  return {
    roster,
    byPos,
    needs,
    surplus,
    needUrgency,
    tradeablePicks,
    topPlayerIdsByPos,
  };
}

// Compatibility Scoring

function scoreCompatibility(
  user: RosterProfile,
  opp: RosterProfile
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  for (const pos of POSITIONS) {
    const userHasSurplus = user.surplus[pos].length > 0;
    const oppNeedsIt = opp.needs.includes(pos);
    const oppHasSurplus = opp.surplus[pos].length > 0;
    const userNeedsIt = user.needs.includes(pos);

    if (userHasSurplus && oppNeedsIt) {
      score += 25 + (opp.needUrgency[pos] ?? 0) * 0.2;
      reasons.push(`They need ${pos}, you have surplus`);
    }
    if (oppHasSurplus && userNeedsIt) {
      score += 25 + (user.needUrgency[pos] ?? 0) * 0.2;
      reasons.push(`You need ${pos}, they have surplus`);
    }
  }

  const userArch = user.roster.archetype;
  const oppArch = opp.roster.archetype;
  if (
    (userArch.includes("Contender") && oppArch === "Rebuilder") ||
    (userArch === "Rebuilder" && oppArch.includes("Contender"))
  ) {
    score += 15;
    reasons.push("Contender/Rebuilder alignment");
  }

  if (user.tradeablePicks.length > 3 && opp.needs.length > 0) {
    score += 5;
  }
  if (opp.tradeablePicks.length > 3 && user.needs.length > 0) {
    score += 5;
  }

  const reason =
    reasons.length > 0
      ? reasons.slice(0, 3).join(". ") + "."
      : "Limited overlap in needs and surplus.";

  return { score: Math.min(100, Math.round(score)), reason };
}

// Package Generation

export async function generateTradeFinderPackages(
  user: RosterProfile,
  opp: RosterProfile,
  mode: "sf" | "1qb",
  leagueId: string,
  scoring: LeagueScoringSettings,
  usage: UsageStats,
  hasCustom: boolean,
  classStrengths?: ClassStrengthMap,
  scorePackage: TradeFinderPackageScorer = scoreTradeFinderPackage
): Promise<TradePackage[]> {
  const packages: TradePackage[] = [];
  let packageEvaluationsStarted = 0;
  const scorePackageWithBudget = async (
    send: TradePackageAsset[],
    receive: TradePackageAsset[]
  ): Promise<PackageScore | null> => {
    if (packageEvaluationsStarted >= TRADE_FINDER_MAX_EVALUATIONS_PER_OPPONENT) {
      return null;
    }
    packageEvaluationsStarted += 1;
    return scorePackage(send, receive, leagueId, mode, classStrengths);
  };
  type StrategicPackageInput = {
    type: TradePackage["type"];
    label: string;
    send: TradePackageAsset[];
    receive: TradePackageAsset[];
    why_you_do_it: string;
    why_they_accept: string;
    sweetener_hint?: string | null;
  };
  const addStrategicPackage = async (input: StrategicPackageInput): Promise<boolean> => {
    const scored = await scorePackageWithBudget(input.send, input.receive);
    if (!scored) return false;
    if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) return false;
    packages.push({
      type: input.type,
      trade_type: tradeTypeForPackage(input.type),
      label: input.label,
      you_send: scored.sendAssets,
      you_receive: scored.receiveAssets,
      send_total: scored.sendTotal,
      receive_total: scored.receiveTotal,
      delta: scored.delta,
      send_edge: scored.sendEdge,
      receive_edge: scored.receiveEdge,
      delta_edge: scored.deltaEdge,
      package_penalty_pct_send: scored.packagePenaltySend,
      package_penalty_pct_receive: scored.packagePenaltyReceive,
      ...valuationFields(scored),
      fairness: scored.fairness,
      why_you_do_it: input.why_you_do_it,
      why_they_accept: input.why_they_accept,
      sweetener_hint: input.sweetener_hint ?? null,
      acceptance: null,
      healthCheck: [],
    });
    return true;
  };
  const userTopIds = new Set(Object.values(user.topPlayerIdsByPos).filter(Boolean));
  const userPlayers = [...user.roster.core_assets]
    .filter((asset) => POSITIONS.includes(asset.position as Pos) && asset.edge_score >= MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_score - a.edge_score);
  const oppPlayers = [...opp.roster.core_assets]
    .filter((asset) => POSITIONS.includes(asset.position as Pos) && asset.edge_score >= MIN_EDGE_SCORE)
    .sort((a, b) => b.edge_score - a.edge_score);
  const userDepth = userPlayers
    .filter((asset) => {
      const pos = asset.position as Pos;
      return (
        asset.edge_score <= 82 &&
        (!userTopIds.has(asset.player_id) || user.surplus[pos].some((surplus) => surplus.player_id === asset.player_id))
      );
    })
    .slice(0, 10);
  const oppTargets = oppPlayers
    .filter((asset) => asset.edge_score >= 60)
    .slice(0, 10);
  const userPicks = user.tradeablePicks
    .filter((pick) => pick.edge_score >= 18)
    .slice(0, 6);
  const oppPicks = opp.tradeablePicks
    .filter((pick) => pick.edge_score >= 18)
    .slice(0, 6);
  const userWindow = user.roster.archetype;
  const userIsContender =
    userWindow.includes("Contender") ||
    userWindow.includes("Juggernaut") ||
    userWindow === "Competitor";
  const userWantsFuture = wantsFutureAssets(userWindow);

  let consolidationGenerated = 0;
  for (const target of oppTargets.filter((asset) => asset.edge_score >= 68)) {
    if (consolidationGenerated >= 6) break;
    for (let i = 0; i < userDepth.length && consolidationGenerated < 6; i++) {
      for (let j = i + 1; j < Math.min(userDepth.length, i + 5) && consolidationGenerated < 6; j++) {
        const first = userDepth[i];
        const second = userDepth[j];
        if (target.edge_score < Math.max(first.edge_score, second.edge_score) + 4) continue;
        const sendEdge = first.edge_score + second.edge_score;
        if (sendEdge < target.edge_score * 1.15 || sendEdge > target.edge_score * 2.1) continue;
        const sentPositions = [first.position, second.position].join(" + ");
        const added = await addStrategicPackage({
          type: "consolidation",
          label: "2-for-1 Consolidation",
          send: [
            assetFromPlayerWithScoring(first, scoring, usage, hasCustom),
            assetFromPlayerWithScoring(second, scoring, usage, hasCustom),
          ],
          receive: [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)],
          why_you_do_it: `Turn two usable roster spots into a better weekly ${target.position} asset`,
          why_they_accept: `Gets ${sentPositions} depth for one asset. ${ARCHETYPE_WANTS[opp.roster.archetype] ?? "Flexibility matters for them."}`,
          sweetener_hint: "Consolidation is worth paying a small premium when the target actually starts for you.",
        });
        if (added) consolidationGenerated += 1;
      }
    }
  }

  let playerPickGenerated = 0;
  for (const target of oppTargets.filter((asset) => asset.edge_score >= 64)) {
    if (playerPickGenerated >= 8) break;
    const candidates = userDepth.filter(
      (asset) =>
        asset.player_id !== target.player_id &&
        asset.edge_score >= 50 &&
        asset.edge_score <= target.edge_score - 4
    );
    for (const userPlayer of candidates.slice(0, 5)) {
      if (playerPickGenerated >= 8) break;
      const neededPick = userPicks.find((pick) => userPlayer.edge_score + pick.edge_score >= target.edge_score * 0.9);
      if (!neededPick) continue;
      const added = await addStrategicPackage({
        type: "player_plus_pick",
        label: "Player + Pick Upgrade",
        send: [
          assetFromPlayerWithScoring(userPlayer, scoring, usage, hasCustom),
          assetFromPick(neededPick),
        ],
        receive: [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)],
        why_you_do_it: `Use ${userPlayer.position} value plus a pick to climb into a stronger ${target.position}`,
        why_they_accept: opp.needs.includes(userPlayer.position as Pos)
          ? `Fills their ${userPlayer.position} need and adds draft capital.`
          : `Turns one player into a player-plus-pick return.`,
        sweetener_hint: "This is the default dynasty upgrade shape: useful player plus pick for the better anchor.",
      });
      if (added) playerPickGenerated += 1;
    }
  }

  let rosterSpotGenerated = 0;
  if (userPicks.length > 0) {
    for (const target of oppTargets.filter((asset) => asset.edge_score >= 75)) {
      if (rosterSpotGenerated >= 4) break;
      const depthPair = userDepth
        .filter((asset) => asset.edge_score <= target.edge_score - 8)
        .slice(0, 2);
      const pick = userPicks[0];
      if (depthPair.length < 2 || !pick) continue;
      const added = await addStrategicPackage({
        type: "consolidation",
        label: "3-for-1 Roster-Spot Upgrade",
        send: [
          assetFromPlayerWithScoring(depthPair[0], scoring, usage, hasCustom),
          assetFromPlayerWithScoring(depthPair[1], scoring, usage, hasCustom),
          assetFromPick(pick),
        ],
        receive: [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)],
        why_you_do_it: `Convert bench value and a pick into one asset that matters in your lineup`,
        why_they_accept: `Gets two playable pieces plus draft capital for one premium player.`,
        sweetener_hint: "Roster-spot arbitrage only works if the one asset is meaningfully better than every piece you send.",
      });
      if (added) rosterSpotGenerated += 1;
    }
  }

  let tierDownGenerated = 0;
  if (userWantsFuture || userWindow === "Dead Zone") {
    const sellAnchors = userPlayers.filter((asset) => asset.edge_score >= 75).slice(0, 5);
    for (const outgoing of sellAnchors) {
      if (tierDownGenerated >= 5) break;
      const anchor = oppPlayers.find(
        (asset) =>
          asset.player_id !== outgoing.player_id &&
          asset.edge_score >= 60 &&
          asset.edge_score <= outgoing.edge_score - 4 &&
          asset.edge_score >= outgoing.edge_score - 20
      );
      const pick = oppPicks.find((candidate) => candidate.edge_score >= 28);
      if (!anchor || !pick) continue;
      const added = await addStrategicPackage({
        type: "player_plus_pick",
        label: "Tier Down",
        send: [assetFromPlayerWithScoring(outgoing, scoring, usage, hasCustom)],
        receive: [
          assetFromPlayerWithScoring(anchor, scoring, usage, hasCustom),
          assetFromPick(pick),
        ],
        why_you_do_it: `Tier down from ${outgoing.full_name} into an anchor plus liquid draft capital`,
        why_they_accept: `Consolidates a player-plus-pick package into the better single asset.`,
        sweetener_hint: "Tier-down only works if the return includes a real anchor, not just volume.",
      });
      if (added) tierDownGenerated += 1;
    }
  }

  let rentalGenerated = 0;
  if (userIsContender && userPicks.length > 0) {
    const rentalTargets = oppTargets.filter(
      (asset) =>
        asset.edge_score >= 66 &&
        ((asset.position === "RB" && (asset.age ?? 0) >= 27) ||
          ((asset.position === "WR" || asset.position === "TE") && (asset.age ?? 0) >= 29))
    );
    for (const target of rentalTargets.slice(0, 4)) {
      if (rentalGenerated >= 4) break;
      const depth = userDepth.find((asset) => asset.edge_score >= 45 && asset.edge_score <= target.edge_score - 6);
      const pick = userPicks[0];
      if (!depth || !pick) continue;
      const added = await addStrategicPackage({
        type: "player_plus_pick",
        label: "Win-Now Rental",
        send: [
          assetFromPlayerWithScoring(depth, scoring, usage, hasCustom),
          assetFromPick(pick),
        ],
        receive: [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)],
        why_you_do_it: `Buy discounted veteran production for a title push`,
        why_they_accept: `Moves an older producer for a younger/depth piece plus draft capital.`,
        sweetener_hint: "Only worth it if this player actually raises your weekly lineup ceiling.",
      });
      if (added) rentalGenerated += 1;
    }
  }

  for (const userPos of POSITIONS) {
    if (user.surplus[userPos].length === 0) continue;
    for (const oppPos of POSITIONS) {
      if (userPos === oppPos) continue;
      if (opp.surplus[oppPos].length === 0) continue;

      const userGives = user.surplus[userPos][0];
      const oppGives = opp.surplus[oppPos][0];
      if (userGives.edge_score < MIN_EDGE_SCORE || oppGives.edge_score < MIN_EDGE_SCORE) {
        continue;
      }

      const send = [assetFromPlayerWithScoring(userGives, scoring, usage, hasCustom)];
      const receive = [assetFromPlayerWithScoring(oppGives, scoring, usage, hasCustom)];
      const scored = await scorePackageWithBudget(send, receive);
      if (!scored) continue;
      if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

      packages.push({
        type: "balanced",
        trade_type: tradeTypeForPackage("balanced"),
        label: "Balanced Swap",
        you_send: scored.sendAssets,
        you_receive: scored.receiveAssets,
        send_total: scored.sendTotal,
        receive_total: scored.receiveTotal,
        delta: scored.delta,
        send_edge: scored.sendEdge,
        receive_edge: scored.receiveEdge,
        delta_edge: scored.deltaEdge,
        package_penalty_pct_send: scored.packagePenaltySend,
        package_penalty_pct_receive: scored.packagePenaltyReceive,
        ...valuationFields(scored),
        fairness: scored.fairness,
        why_you_do_it: user.needs.includes(oppPos as Pos)
          ? `Fills your ${oppPos} need with their surplus`
          : `Upgrades ${oppPos} depth, trades ${userPos} surplus`,
        why_they_accept: opp.needs.includes(userPos as Pos)
          ? `Fills their ${userPos} need. ${ARCHETYPE_WANTS[opp.roster.archetype] ?? ""}`
          : `Upgrades their ${userPos}, trades ${oppPos} depth`,
        sweetener_hint: Math.abs(scored.deltaEdge) > 3 && Math.abs(scored.deltaEdge) <= 10
          ? `Add a late-round pick to ${scored.deltaEdge > 0 ? "sweeten for them" : "balance for you"}`
          : null,
        acceptance: null,
        healthCheck: [],
      });
    }
  }

  for (const oppPos of POSITIONS) {
    if (opp.surplus[oppPos].length === 0) continue;
    if (!user.needs.includes(oppPos as Pos)) continue;

    const target = opp.surplus[oppPos][0];
    if (target.edge_score < 55) continue;

    const sendAssets: CoreAsset[] = [];
    const usedPos = new Set<string>();

    for (const pos of POSITIONS) {
      if (pos === oppPos) continue;
      if (usedPos.size >= 2) break;
      const oppNeedsThis = opp.needs.includes(pos as Pos);
      const available = user.surplus[pos].length > 0
        ? user.surplus[pos]
        : oppNeedsThis
          ? user.byPos[pos].filter((a) => a.edge_score >= MIN_EDGE_SCORE)
          : [];
      if (available.length === 0) continue;

      const pick = available.find((a) => !sendAssets.some((s) => s.player_id === a.player_id));
      if (pick && !usedPos.has(pos)) {
        sendAssets.push(pick);
        usedPos.add(pos);
      }
    }

    if (sendAssets.length < 2) continue;

    const send = sendAssets.map((a) => assetFromPlayerWithScoring(a, scoring, usage, hasCustom));
    const receive = [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)];
    const scored = await scorePackageWithBudget(send, receive);
    if (!scored) continue;
    if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

    packages.push({
      type: "consolidation",
      trade_type: tradeTypeForPackage("consolidation"),
      label: "2-for-1 Consolidation",
      you_send: scored.sendAssets,
      you_receive: scored.receiveAssets,
      send_total: scored.sendTotal,
      receive_total: scored.receiveTotal,
      delta: scored.delta,
      send_edge: scored.sendEdge,
      receive_edge: scored.receiveEdge,
      delta_edge: scored.deltaEdge,
      package_penalty_pct_send: scored.packagePenaltySend,
      package_penalty_pct_receive: scored.packagePenaltyReceive,
      ...valuationFields(scored),
      fairness: scored.fairness,
      why_you_do_it: `Consolidate depth into a ${oppPos} starter upgrade`,
      why_they_accept: `Gets ${[...usedPos].join(" + ")} help. They're a ${opp.roster.archetype} who wants ${ARCHETYPE_WANTS[opp.roster.archetype] ?? "flexibility"}.`,
      sweetener_hint: scored.deltaEdge < -3
        ? "You may need to add a mid-round pick to get them to accept"
        : scored.deltaEdge > 8
          ? "You're overpaying slightly. Try removing the weaker piece."
          : null,
      acceptance: null,
      healthCheck: [],
    });
  }

  for (const oppPos of POSITIONS) {
    if (opp.surplus[oppPos].length === 0) continue;
    if (!user.needs.includes(oppPos as Pos)) continue;

    const target = opp.surplus[oppPos][0];
    if (!target || target.edge_score < 55) continue;

    for (const userPos of POSITIONS) {
      if (userPos === oppPos) continue;
      if (user.surplus[userPos].length === 0) continue;
      if (!opp.needs.includes(userPos as Pos)) continue;

      const userPlayer = user.surplus[userPos][0];
      if (!userPlayer || userPlayer.edge_score < 45) continue;

      for (const pick of user.tradeablePicks.slice(0, 3)) {
        if (pick.edge_score <= 0) continue;

        const send = [
          assetFromPlayerWithScoring(userPlayer, scoring, usage, hasCustom),
          assetFromPick(pick),
        ];
        const receive = [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)];
        const scored = await scorePackageWithBudget(send, receive);
        if (!scored) continue;
        if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) {
          continue;
        }

        packages.push({
          type: "player_plus_pick",
          trade_type: tradeTypeForPackage("player_plus_pick"),
          label: "Player + Pick",
          you_send: scored.sendAssets,
          you_receive: scored.receiveAssets,
          send_total: scored.sendTotal,
          receive_total: scored.receiveTotal,
          delta: scored.delta,
          send_edge: scored.sendEdge,
          receive_edge: scored.receiveEdge,
          delta_edge: scored.deltaEdge,
          package_penalty_pct_send: scored.packagePenaltySend,
          package_penalty_pct_receive: scored.packagePenaltyReceive,
          ...valuationFields(scored),
          fairness: scored.fairness,
          why_you_do_it: `${userPos} surplus plus draft capital lands a real ${oppPos} upgrade`,
          why_they_accept: `Gets ${userPos} help plus a future pick for their ${oppPos} surplus.`,
          sweetener_hint: scored.deltaEdge < -5 ? "Try downgrading the pick tier if the cost feels steep." : null,
          acceptance: null,
          healthCheck: [],
        });
        break;
      }
    }
  }

  for (const userPos of POSITIONS) {
    const sellCandidates = user.surplus[userPos].filter(
      (asset) => asset.edge_score >= ANCHOR_EDGE_SCORE
    );
    if (sellCandidates.length === 0) continue;

    for (const oppPos of POSITIONS) {
      if (opp.surplus[oppPos].length === 0) continue;

      const outgoing = sellCandidates.find(
        (asset) =>
          opp.needs.includes(userPos as Pos) ||
          isAgingOrFragilePlayer(asset) ||
          asset.edge_score >= (opp.surplus[oppPos][0]?.edge_score ?? 0) + 8
      );
      if (!outgoing) continue;

      const anchor = opp.surplus[oppPos].find(
        (asset) =>
          asset.player_id !== outgoing.player_id &&
          asset.edge_score >= 55 &&
          asset.edge_score <= outgoing.edge_score - 3 &&
          asset.edge_score >= outgoing.edge_score - 18
      );
      const pick = opp.tradeablePicks.find((candidate) => candidate.edge_score >= 18);
      if (!anchor || !pick) continue;
      if (!user.needs.includes(oppPos as Pos) && !isAgingOrFragilePlayer(outgoing)) {
        continue;
      }

      const send = [assetFromPlayerWithScoring(outgoing, scoring, usage, hasCustom)];
      const receive = [
        assetFromPlayerWithScoring(anchor, scoring, usage, hasCustom),
        assetFromPick(pick),
      ];
      const scored = await scorePackageWithBudget(send, receive);
      if (!scored) continue;
      if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) {
        continue;
      }

      packages.push({
        type: "player_plus_pick",
        trade_type: tradeTypeForPackage("player_plus_pick"),
        label: isAgingOrFragilePlayer(outgoing) ? "Sell for Youth" : "Player + Pick Return",
        you_send: scored.sendAssets,
        you_receive: scored.receiveAssets,
        send_total: scored.sendTotal,
        receive_total: scored.receiveTotal,
        delta: scored.delta,
        send_edge: scored.sendEdge,
        receive_edge: scored.receiveEdge,
        delta_edge: scored.deltaEdge,
        package_penalty_pct_send: scored.packagePenaltySend,
        package_penalty_pct_receive: scored.packagePenaltyReceive,
        ...valuationFields(scored),
        fairness: scored.fairness,
        why_you_do_it: isAgingOrFragilePlayer(outgoing)
          ? `Move an aging or availability-risk ${userPos} for a younger ${oppPos} anchor plus pick liquidity`
          : `Turn ${userPos} surplus into a ${oppPos} anchor plus draft liquidity`,
        why_they_accept: opp.needs.includes(userPos as Pos)
          ? `Fills their ${userPos} need while they pay with ${oppPos} surplus and a pick.`
          : `Consolidates a player-plus-pick package into the better single player.`,
        sweetener_hint: scored.deltaEdge < -5
          ? "Ask for a smaller pick if this return is too ambitious."
          : null,
        acceptance: null,
        healthCheck: [],
      });
    }
  }

  if (user.tradeablePicks.length > 0) {
    for (const oppPos of POSITIONS) {
      if (!user.needs.includes(oppPos as Pos)) continue;
      if (opp.surplus[oppPos].length === 0) continue;

      const target = opp.surplus[oppPos][0];
      if (target.edge_score < 50) continue;

      const bestPick = user.tradeablePicks[0];
      if (!bestPick) continue;

      const send: TradePackageAsset[] = [assetFromPick(bestPick)];
      let sendVal = bestPick.edge_score;

      const gap = target.edge_score - sendVal;
      if (gap > 5) {
        const secondPick = user.tradeablePicks[1];
        if (secondPick && secondPick.edge_score + sendVal >= target.edge_score * 0.7) {
          send.push(assetFromPick(secondPick));
          sendVal += secondPick.edge_score;
        } else {
          for (const pos of POSITIONS) {
            if (pos === oppPos) continue;
            const depth = user.byPos[pos]?.filter(
              (a) => a.edge_score >= 40 && a.edge_score <= gap + 5
            );
            if (depth && depth.length > 0) {
              send.push(assetFromPlayerWithScoring(depth[0], scoring, usage, hasCustom));
              sendVal += depth[0].edge_score;
              break;
            }
          }
        }
      }

      const receive = [assetFromPlayerWithScoring(target, scoring, usage, hasCustom)];
      const scored = await scorePackageWithBudget(send, receive);
      if (!scored) continue;
      if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

      const isDupe = packages.some(
        (p) =>
          p.you_receive[0]?.label === target.full_name &&
          p.type !== "picks_heavy"
      );
      if (isDupe && packages.length > 2) continue;

      packages.push({
        type: "picks_heavy",
        trade_type: tradeTypeForPackage("picks_heavy"),
        label: "Picks + Depth",
        you_send: scored.sendAssets,
        you_receive: scored.receiveAssets,
        send_total: scored.sendTotal,
        receive_total: scored.receiveTotal,
        delta: scored.delta,
        send_edge: scored.sendEdge,
        receive_edge: scored.receiveEdge,
        delta_edge: scored.deltaEdge,
        package_penalty_pct_send: scored.packagePenaltySend,
        package_penalty_pct_receive: scored.packagePenaltyReceive,
        ...valuationFields(scored),
        fairness: scored.fairness,
        why_you_do_it: `Acquire ${oppPos} starter using draft capital`,
        why_they_accept: `Gets future picks. They're a ${opp.roster.archetype} who wants ${ARCHETYPE_WANTS[opp.roster.archetype] ?? "draft capital"}.`,
        sweetener_hint: scored.deltaEdge < -5
          ? "Consider upgrading the pick round or adding another asset"
          : null,
        acceptance: null,
        healthCheck: [],
      });
    }
  }

  if (user.tradeablePicks.length >= 2 && opp.tradeablePicks.length > 0) {
    let pickOnlyGenerated = 0;
    const premiumTargetPicks = opp.tradeablePicks
      .filter((targetPick) => isPremiumPick(assetFromPick(targetPick)))
      .slice(0, 1);

    for (const targetPick of premiumTargetPicks) {
      const sendPool = user.tradeablePicks.filter(
        (pick) =>
          pick.label !== targetPick.label &&
          (pick.pick_breakdown?.round ?? pick.round) <= 4
      ).slice(0, 8);
      for (let i = 0; i < sendPool.length && pickOnlyGenerated < 1; i++) {
        for (let j = i + 1; j < Math.min(sendPool.length, i + 4); j++) {
          const offerA = sendPool[i];
          const offerB = sendPool[j];
          const firstRoundCount =
            ((offerA.pick_breakdown?.round ?? offerA.round) === 1 ? 1 : 0) +
            ((offerB.pick_breakdown?.round ?? offerB.round) === 1 ? 1 : 0);
          if (firstRoundCount > 1) continue;

          const send = [assetFromPick(offerA), assetFromPick(offerB)];
          const receive = [assetFromPick(targetPick)];
          if (
            !isMaterialPickOnlyTrade({
              you_send: send,
              you_receive: receive,
              delta: receive[0].edge_score - offerA.edge_score - offerB.edge_score,
              valuation_percent_gap: 0,
            })
          ) {
            continue;
          }

          const scored = await scorePackageWithBudget(send, receive);
          if (!scored) continue;
          if (scored.sendTotal <= 0 || scored.receiveTotal <= 0) {
            continue;
          }
          if (
            !isMaterialPickOnlyTrade({
              you_send: scored.sendAssets,
              you_receive: scored.receiveAssets,
              delta: scored.delta,
              valuation_percent_gap: scored.percentGap,
            })
          ) {
            continue;
          }

          packages.push({
            type: "picks_heavy",
            trade_type: tradeTypeForPackage("picks_heavy"),
            label: "Pick Upgrade",
            you_send: scored.sendAssets,
            you_receive: scored.receiveAssets,
            send_total: scored.sendTotal,
            receive_total: scored.receiveTotal,
            delta: scored.delta,
            send_edge: scored.sendEdge,
            receive_edge: scored.receiveEdge,
            delta_edge: scored.deltaEdge,
            package_penalty_pct_send: scored.packagePenaltySend,
            package_penalty_pct_receive: scored.packagePenaltyReceive,
            ...valuationFields(scored),
            fairness: scored.fairness,
            why_you_do_it: `Roll two picks into ${targetPick.label} and trade up the board`,
            why_they_accept: "Moves one premium pick for multiple future assets and flexibility.",
            sweetener_hint: scored.deltaEdge < -4 ? "Swap one pick down a tier if the price is too steep." : null,
            acceptance: null,
            healthCheck: [],
          });
          pickOnlyGenerated += 1;
          break;
        }
      }
    }
  }

  const context: TradeFinderQualityContext = {
    userNeeds: user.needs,
    opponentNeeds: opp.needs,
    userArchetype: user.roster.archetype,
    opponentArchetype: opp.roster.archetype,
    mode,
  };
  const qualified = packages
    .map((pkg) => annotateTradeFinderPackage(pkg, context))
    .filter(shouldSurfaceTradeFinderPackage);

  return dedupeAndRankTradeFinderPackages(qualified, 4);
}

// Main

export async function findTrades(
  username: string,
  leagueId: string,
  classStrengths?: ClassStrengthMap,
  weights?: SourceWeights
): Promise<TradeSuggestion[]> {
  const allLeagues = await getPowerRankings(username, "dynasty", weights, undefined, {
    leagueIds: [leagueId],
    forceDbOnly: true,
  });
  const league = allLeagues.find((l) => l.league_id === leagueId);
  if (!league || league.rosters.length < 2) return [];

  const leagueRow = await db.execute(sql`
    SELECT scoring_settings FROM leagues WHERE league_id = ${leagueId} LIMIT 1
  `);
  const leagueScoring = parseLeagueScoring(
    (leagueRow as unknown as { scoring_settings: Record<string, unknown> | null }[])[0]?.scoring_settings ?? null
  );
  const hasCustomScoring = isNonStandardScoring(leagueScoring);
  let usageMap: UsageStats = new Map();
  if (hasCustomScoring) {
    const allPlayerIds = league.rosters.flatMap((r) => r.core_assets.map((a) => a.player_id));
    usageMap = await loadPlayerUsageStats([...new Set(allPlayerIds)]);
  }

  const mode = league.mode;
  const medians = computeLeagueMedians(league.rosters);
  const enrichedPickMap = new Map<number, EnrichedPick[]>();
  for (const roster of league.rosters) {
    const picks = await Promise.all(
      (roster.draft_picks ?? []).map((pick) =>
        enrichScoredPick(pick, {
          leagueSize: league.rosters.length,
          format: league.mode,
          classStrengths,
        })
      )
    );
    enrichedPickMap.set(roster.roster_id, picks);
  }

  const profiles = league.rosters.map((r) =>
    buildProfile(r, medians, enrichedPickMap.get(r.roster_id) ?? [])
  );
  const behaviors = await buildLeagueBehaviors(leagueId);
  for (const profile of profiles) {
    profile.behavior = behaviors.get(profile.roster.roster_id);
  }

  const userProfile = profiles.find((p) => p.roster.is_user);
  if (!userProfile) return [];

  const opponents = profiles.filter((p) => !p.roster.is_user);

  const ranked = opponents
    .map((opp) => {
      const { score, reason } = scoreCompatibility(userProfile, opp);
      return { opp, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TRADE_FINDER_MAX_OPPONENTS);

  const packageScoreCache = new Map<string, Promise<PackageScore>>();
  const scoreTradeFinderPackageCached: TradeFinderPackageScorer = (
    send,
    receive,
    packageLeagueId,
    packageMode,
    packageClassStrengths
  ) => {
    const cacheKey = packageEvaluationCacheKey(
      send,
      receive,
      packageLeagueId,
      packageMode,
      packageClassStrengths,
      weights
    );
    const cached = packageScoreCache.get(cacheKey);
    if (cached) return cached;
    const work = scoreTradeFinderPackage(
      send,
      receive,
      packageLeagueId,
      packageMode,
      packageClassStrengths,
      weights
    );
    packageScoreCache.set(cacheKey, work);
    return work;
  };

  const suggestions = (await Promise.all(ranked.map(async ({ opp, score, reason }): Promise<TradeSuggestion | null> => {
    const basePackages = await generateTradeFinderPackages(
      userProfile,
      opp,
      mode,
      leagueId,
      leagueScoring,
      usageMap,
      hasCustomScoring,
      classStrengths,
      scoreTradeFinderPackageCached
    );
    if (basePackages.length === 0) return null;
    const packageHealthScores = new Map<string, number>();
    for (const pkg of basePackages) {
      for (const asset of [...pkg.you_send, ...pkg.you_receive]) {
        if (asset.asset_type === "player" && asset.player_id) {
          packageHealthScores.set(asset.player_id, asset.edge_score);
        }
      }
    }
    const tradeHealthData = await loadTradeHealthPlayerInfo(
      [...packageHealthScores.keys()],
      packageHealthScores
    );
    const qualityContext: TradeFinderQualityContext = {
      userNeeds: userProfile.needs,
      opponentNeeds: opp.needs,
      userArchetype: userProfile.roster.archetype,
      opponentArchetype: opp.roster.archetype,
      mode,
      managerSignals: [
        ...(opp.behavior?.bias_flags ?? []),
        opp.behavior?.preferred_structure ?? "",
      ].filter(Boolean),
    };
    const evaluatedPackages = applyAcceptanceAndBehavior(basePackages, userProfile, opp)
      .map((pkg) => ({
        ...pkg,
        acceptance_reason:
          pkg.acceptance?.accept_reasons[0] ??
          pkg.acceptance?.reject_reasons[0] ??
          pkg.acceptance_reason,
      }))
      .map((pkg) => ({
        ...pkg,
        healthCheck: tradeHealthCheck(
          pkg.you_send,
          pkg.you_receive,
          tradeHealthData,
          pkg.fairness
        ),
      }))
      .filter((pkg) => !pkg.healthCheck.some((warning) => warning.type === "block"))
      .map((pkg) => annotateTradeFinderPackage(pkg, qualityContext))
      .filter(shouldSurfaceTradeFinderPackage);
    const packages = dedupeAndRankTradeFinderPackages(evaluatedPackages, 4);
    if (packages.length === 0) return null;

    return {
      partner: {
        roster_id: opp.roster.roster_id,
        display_name: opp.roster.display_name,
        archetype: opp.roster.archetype,
        compatibility_score: score,
        compatibility_reason: reason,
        bias_flags: opp.behavior?.bias_flags ?? [],
        preferred_structure: opp.behavior?.preferred_structure ?? "mixed",
        total_trades: opp.behavior?.total_trades ?? 0,
        recent_trades: opp.behavior?.recent_trades ?? 0,
      },
      packages,
    };
  }))).filter((suggestion): suggestion is TradeSuggestion => suggestion != null);

  return applyDisplayedTradeDiversity(suggestions);
}
