import { getPowerRankings } from "./power-rankings.js";
import type {
  CoreAsset,
  ShopPlayerResult,
  ShopOpportunity,
  EvaluatedAsset,
  LeaguePowerRanking,
  RosterRanking,
  ScoredPick,
  TradePackageAsset,
  TradeValuationWarning,
} from "../../shared/types.js";
import { buildLeagueBehaviors, estimateAcceptance, type ManagerBehavior } from "./manager-behavior.js";
import { loadTradeHealthPlayerInfo, tradeHealthCheck } from "./trade-calculator.js";
import { enrichScoredPick, type ClassStrengthMap } from "./pick-values.js";
import { sourceWeightsKey, type SourceWeights } from "./edge-score.js";
import type { ValueType } from "./composite-values.js";
import {
  evaluateOpportunityPackage,
  opportunityValuationFields,
  type OpportunityPackageValuation,
  type OpportunityPackageValuationInput,
} from "./trade-opportunity-valuation.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const SHOP_REQUEST_TIMEOUT_MS = 18_000;
const SHOP_MAX_EVALUATIONS_PER_REQUEST = 180;
const SHOP_MAX_EVALUATIONS_PER_LEAGUE = 24;
const SHOP_MAX_EVALUATIONS_PER_OPPONENT = 4;
const SHOP_MAX_CANDIDATES_PER_OPPONENT = 24;
const SHOP_MAX_OPPONENTS_PER_LEAGUE = 8;
const SHOP_EVALUATION_CONCURRENCY = 4;

const ARCHETYPE_BUY_MOTIVATION: Record<string, { wants_vets: number; wants_youth: number; wants_picks: number }> = {
  "Dynasty Juggernaut": { wants_vets: 30, wants_youth: 60, wants_picks: 20 },
  "All-In Contender": { wants_vets: 90, wants_youth: 30, wants_picks: 10 },
  "Fragile Contender": { wants_vets: 70, wants_youth: 80, wants_picks: 20 },
  "Productive Struggle": { wants_vets: 20, wants_youth: 70, wants_picks: 90 },
  Rebuilder: { wants_vets: 10, wants_youth: 80, wants_picks: 95 },
  "Dead Zone": { wants_vets: 50, wants_youth: 60, wants_picks: 50 },
  Competitor: { wants_vets: 60, wants_youth: 50, wants_picks: 40 },
};

export type EnrichedPick = ScoredPick & {
  pick_breakdown: EvaluatedAsset["pick_breakdown"];
};

type EvaluateOpportunityPackageFn = (
  input: OpportunityPackageValuationInput
) => Promise<OpportunityPackageValuation>;

export function shopPlayerAssetToTradePackageAsset(a: CoreAsset): TradePackageAsset {
  return {
    asset_type: "player",
    player_id: a.player_id,
    position: a.position,
    label: a.full_name,
    edge_score: a.edge_score,
    trade_power: 0,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    ppg: a.ppg ?? null,
    source_agreement: a.source_agreement,
  };
}

export function shopPickToTradePackageAsset(p: EnrichedPick): TradePackageAsset {
  return {
    asset_type: "pick",
    player_id: null,
    pick_season: p.pick_breakdown?.season ?? p.season,
    pick_round: p.pick_breakdown?.round ?? p.round,
    pick_tier: p.pick_breakdown?.tier ?? p.tier,
    pick_slot: p.pick_slot ?? null,
    pick_original_owner_id: p.original_owner_id ?? null,
    position: null,
    label: p.label,
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

function tradePackageAssetToEvaluatedAsset(asset: TradePackageAsset): EvaluatedAsset {
  return {
    asset_id: asset.asset_id,
    asset_key: asset.asset_key,
    asset_name: asset.asset_name,
    asset_type: asset.asset_type,
    player_id: asset.player_id ?? null,
    position: asset.position,
    label: asset.label,
    edge_score: asset.edge_score,
    base_market_value: asset.base_market_value,
    league_market_value: asset.league_market_value,
    context_trade_value: asset.context_trade_value,
    market_value_source: asset.market_value_source,
    source_market_values: asset.source_market_values,
    trade_power: asset.trade_power,
    fc_score: asset.fc_score,
    ktc_score: asset.ktc_score,
    dp_score: asset.dp_score,
    league_adjusted_score: asset.league_adjusted_score,
    scoring_delta_ppg: asset.scoring_delta_ppg,
    scoring_multiplier: asset.scoring_multiplier,
    lineup_scarcity_multiplier: asset.lineup_scarcity_multiplier,
    ppg: asset.ppg,
    adjustment_reasons: asset.adjustment_reasons,
    fallback_warnings: asset.fallback_warnings,
    source_agreement: asset.source_agreement,
    pick_breakdown: asset.pick_breakdown ?? null,
  };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scoreBuyerMotivation(
  opp: RosterRanking,
  player: CoreAsset,
  leagueMedians: Record<string, number>
): { score: number; reason: string } {
  const prefs = ARCHETYPE_BUY_MOTIVATION[opp.archetype] ?? ARCHETYPE_BUY_MOTIVATION.Competitor;
  const posPlayers = opp.core_assets
    .filter((a) => a.position === player.position)
    .sort((a, b) => b.edge_score - a.edge_score);
  const aboveMedian = posPlayers.filter((p) => p.edge_score > (leagueMedians[player.position] ?? 60));
  const isNeed = aboveMedian.length < (MIN_STARTERS[player.position] ?? 1);
  const needBonus = isNeed ? 30 : 0;

  const isYoung = (player.age ?? 25) <= 25;
  const isVet = (player.age ?? 25) >= 28;
  let ageFit = 50;
  if (isYoung) ageFit = prefs.wants_youth;
  if (isVet) ageFit = prefs.wants_vets;

  const score = Math.min(100, Math.round((ageFit + needBonus) * (player.edge_score / 80)));
  const reasons: string[] = [];
  if (isNeed) reasons.push(`${player.position} is a need`);
  if (isYoung && prefs.wants_youth >= 70) reasons.push("values young assets");
  if (isVet && prefs.wants_vets >= 70) reasons.push("wants win-now pieces");
  reasons.push(opp.archetype);

  return { score, reason: reasons.join(", ") };
}

export interface ShopPackageScore {
  sendAssets: EvaluatedAsset[];
  receiveAssets: EvaluatedAsset[];
  sendTotal: number;
  receiveTotal: number;
  delta: number;
  valuationEdge: number;
  fairness: ShopOpportunity["fairness"];
  sendBaseMarketValue: number;
  receiveBaseMarketValue: number;
  sendLeagueMarketValue: number;
  receiveLeagueMarketValue: number;
  sendContextTradeValue: number;
  receiveContextTradeValue: number;
  percentGap: number;
  valuationWarnings: TradeValuationWarning[];
  valuationExplanations: string[];
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function scoreShopPackage(
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  leagueId: string,
  mode: "sf" | "1qb",
  classStrengths?: ClassStrengthMap,
  valueType: ValueType = "dynasty",
  evaluatePackage: EvaluateOpportunityPackageFn = evaluateOpportunityPackage,
  weights?: SourceWeights
): Promise<ShopPackageScore> {
  const valuation = await evaluatePackage({
    send,
    receive,
    leagueId,
    mode,
    classStrengths,
    valueType,
    weights,
  });
  const metadata = opportunityValuationFields(valuation);
  const delta = roundTo(valuation.sendContextTradeValue - valuation.receiveContextTradeValue);

  return {
    sendAssets: valuation.sendAssets.map(tradePackageAssetToEvaluatedAsset),
    receiveAssets: valuation.receiveAssets.map(tradePackageAssetToEvaluatedAsset),
    sendTotal: valuation.sendContextTradeValue,
    receiveTotal: valuation.receiveContextTradeValue,
    delta,
    valuationEdge: metadata.valuation_edge,
    fairness: valuation.fairness,
    sendBaseMarketValue: metadata.send_base_market_value,
    receiveBaseMarketValue: metadata.receive_base_market_value,
    sendLeagueMarketValue: metadata.send_league_market_value,
    receiveLeagueMarketValue: metadata.receive_league_market_value,
    sendContextTradeValue: metadata.send_context_trade_value,
    receiveContextTradeValue: metadata.receive_context_trade_value,
    percentGap: metadata.valuation_percent_gap,
    valuationWarnings: metadata.valuation_warnings,
    valuationExplanations: metadata.valuation_explanations,
  };
}

function computeNeeds(roster: RosterRanking, leagueMedians: Record<string, number>): string[] {
  const needs: string[] = [];
  for (const pos of POSITIONS) {
    const posPlayers = roster.core_assets
      .filter((a) => a.position === pos)
      .sort((a, b) => b.edge_score - a.edge_score);
    const aboveMedian = posPlayers.filter((p) => p.edge_score > (leagueMedians[pos] ?? 60));
    if (aboveMedian.length < (MIN_STARTERS[pos] ?? 1)) needs.push(pos);
  }
  return needs;
}

function computeTopPlayerIdsByPos(roster: RosterRanking): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pos of POSITIONS) {
    const top = roster.core_assets
      .filter((a) => a.position === pos)
      .sort((a, b) => b.edge_score - a.edge_score)[0];
    if (top) out[pos] = top.player_id;
  }
  return out;
}

export interface PackageContext {
  leagueId: string;
  mode: "sf" | "1qb";
  userRoster: RosterRanking;
  opp: RosterRanking;
  playerAsset: CoreAsset;
  leagueMedians: Record<string, number>;
  ambition: number;
  userPicks: EnrichedPick[];
  oppPicks: EnrichedPick[];
  classStrengths?: ClassStrengthMap;
  valueType: ValueType;
  weights?: SourceWeights;
  valuationCache: Map<string, Promise<ShopPackageScore>>;
  evaluationBudget: ShopEvaluationBudget;
  evaluatePackage?: EvaluateOpportunityPackageFn;
}

export interface RawPackage {
  path: ShopOpportunity["path"];
  path_label: string;
  you_send: EvaluatedAsset[];
  you_receive: EvaluatedAsset[];
  sendTotal: number;
  receiveTotal: number;
  delta: number;
  valuationEdge: number;
  sendBaseMarketValue: number;
  receiveBaseMarketValue: number;
  sendLeagueMarketValue: number;
  receiveLeagueMarketValue: number;
  sendContextTradeValue: number;
  receiveContextTradeValue: number;
  percentGap: number;
  valuationWarnings: TradeValuationWarning[];
  valuationExplanations: string[];
  fairness: ShopOpportunity["fairness"];
  why_you_do_it: string;
  why_they_accept: string;
}

export type CandidateScoreFilter = "not_lopsided" | "not_negative_lopsided" | "delta_nonnegative";

export interface ShopPackageCandidate {
  path: ShopOpportunity["path"];
  path_label: string;
  send: TradePackageAsset[];
  receive: TradePackageAsset[];
  why_you_do_it: string;
  why_they_accept: string;
  cheap_score: number;
  score_filter: CandidateScoreFilter;
}

interface ShopEvaluationBudgetOptions {
  maxEvaluations?: number;
  perLeagueCap?: number;
  timeoutMs?: number;
  now?: number;
}

export interface ShopEvaluationBudget {
  maxEvaluations: number;
  perLeagueCap: number;
  deadlineMs: number;
  evaluationsStarted: number;
  cacheHits: number;
  timedOut: boolean;
  partialResults: boolean;
  warnings: Set<string>;
  leagueEvaluations: Map<string, number>;
}

export function createShopEvaluationBudget(
  options: ShopEvaluationBudgetOptions = {}
): ShopEvaluationBudget {
  const now = options.now ?? Date.now();
  return {
    maxEvaluations: options.maxEvaluations ?? SHOP_MAX_EVALUATIONS_PER_REQUEST,
    perLeagueCap: options.perLeagueCap ?? SHOP_MAX_EVALUATIONS_PER_LEAGUE,
    deadlineMs: now + (options.timeoutMs ?? SHOP_REQUEST_TIMEOUT_MS),
    evaluationsStarted: 0,
    cacheHits: 0,
    timedOut: false,
    partialResults: false,
    warnings: new Set<string>(),
    leagueEvaluations: new Map<string, number>(),
  };
}

function rawPackageValuationFields(scored: ShopPackageScore): Pick<
  RawPackage,
  | "you_send"
  | "you_receive"
  | "sendTotal"
  | "receiveTotal"
  | "delta"
  | "valuationEdge"
  | "sendBaseMarketValue"
  | "receiveBaseMarketValue"
  | "sendLeagueMarketValue"
  | "receiveLeagueMarketValue"
  | "sendContextTradeValue"
  | "receiveContextTradeValue"
  | "percentGap"
  | "valuationWarnings"
  | "valuationExplanations"
  | "fairness"
> {
  return {
    you_send: scored.sendAssets,
    you_receive: scored.receiveAssets,
    sendTotal: scored.sendTotal,
    receiveTotal: scored.receiveTotal,
    delta: scored.delta,
    valuationEdge: scored.valuationEdge,
    sendBaseMarketValue: scored.sendBaseMarketValue,
    receiveBaseMarketValue: scored.receiveBaseMarketValue,
    sendLeagueMarketValue: scored.sendLeagueMarketValue,
    receiveLeagueMarketValue: scored.receiveLeagueMarketValue,
    sendContextTradeValue: scored.sendContextTradeValue,
    receiveContextTradeValue: scored.receiveContextTradeValue,
    percentGap: scored.percentGap,
    valuationWarnings: scored.valuationWarnings,
    valuationExplanations: scored.valuationExplanations,
    fairness: scored.fairness,
  };
}

function markShopPartial(budget: ShopEvaluationBudget, warning: string) {
  budget.partialResults = true;
  budget.warnings.add(warning);
}

function shopBudgetTimedOut(budget: ShopEvaluationBudget): boolean {
  if (Date.now() <= budget.deadlineMs) return false;
  budget.timedOut = true;
  markShopPartial(budget, "Shop a Player reached its time budget and returned the best evaluated results so far.");
  return true;
}

function shopRequestEvaluationCapReached(budget: ShopEvaluationBudget): boolean {
  return budget.evaluationsStarted >= budget.maxEvaluations;
}

function shopLeagueEvaluationCapReached(budget: ShopEvaluationBudget, leagueId: string): boolean {
  return (budget.leagueEvaluations.get(leagueId) ?? 0) >= budget.perLeagueCap;
}

function claimShopEvaluation(budget: ShopEvaluationBudget, leagueId: string): boolean {
  if (shopBudgetTimedOut(budget)) return false;
  if (shopRequestEvaluationCapReached(budget)) {
    markShopPartial(budget, `Shop a Player reached the ${budget.maxEvaluations} package valuation cap.`);
    return false;
  }

  if (shopLeagueEvaluationCapReached(budget, leagueId)) {
    markShopPartial(budget, `League package valuation cap reached for league ${leagueId}.`);
    return false;
  }

  const leagueCount = budget.leagueEvaluations.get(leagueId) ?? 0;
  budget.evaluationsStarted += 1;
  budget.leagueEvaluations.set(leagueId, leagueCount + 1);
  return true;
}

export async function scorePackageForContext(
  ctx: PackageContext,
  send: TradePackageAsset[],
  receive: TradePackageAsset[]
): Promise<ShopPackageScore> {
  const cacheKey = [
    ctx.leagueId,
    ctx.mode,
    ctx.valueType,
    sourceWeightsKey(ctx.weights),
    send.map(assetCacheKey).sort().join("+"),
    receive.map(assetCacheKey).sort().join("+"),
  ].join("|");
  const cached = ctx.valuationCache.get(cacheKey);
  if (cached) {
    ctx.evaluationBudget.cacheHits += 1;
    return cached;
  }

  if (!claimShopEvaluation(ctx.evaluationBudget, ctx.leagueId)) {
    throw new Error("SHOP_EVALUATION_BUDGET_EXHAUSTED");
  }

  const scorePromise = scoreShopPackage(
    send,
    receive,
    ctx.leagueId,
    ctx.mode,
    ctx.classStrengths,
    ctx.valueType,
    ctx.evaluatePackage,
    ctx.weights
  ).catch((error) => {
    ctx.valuationCache.delete(cacheKey);
    throw error;
  });
  ctx.valuationCache.set(cacheKey, scorePromise);
  return scorePromise;
}

function assetCacheKey(asset: TradePackageAsset): string {
  if (asset.asset_type === "player") {
    return `player:${asset.player_id ?? asset.label}`;
  }
  return [
    "pick",
    asset.pick_season ?? asset.pick_breakdown?.season ?? "",
    asset.pick_round ?? asset.pick_breakdown?.round ?? "",
    asset.pick_tier ?? asset.pick_breakdown?.tier ?? "",
    asset.pick_slot ?? "tier",
    asset.pick_original_owner_id ?? "",
    asset.label,
  ].join(":");
}

function roughAssetValue(asset: TradePackageAsset): number {
  return asset.context_trade_value ?? asset.league_market_value ?? asset.base_market_value ?? asset.edge_score * 100;
}

function candidateKey(candidate: ShopPackageCandidate): string {
  return [
    candidate.path,
    candidate.send.map(assetCacheKey).sort().join("+"),
    candidate.receive.map(assetCacheKey).sort().join("+"),
  ].join("|");
}

function scoreCheapCandidate(
  ctx: PackageContext,
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  path: ShopOpportunity["path"],
  userNeeds: string[],
  oppNeeds: string[]
): number {
  const sendValue = send.reduce((sum, asset) => sum + roughAssetValue(asset), 0);
  const receiveValue = receive.reduce((sum, asset) => sum + roughAssetValue(asset), 0);
  const valueGapPct = Math.abs(sendValue - receiveValue) / Math.max(sendValue, receiveValue, 1);
  const valueFit = Math.max(0, 100 - valueGapPct * 140);
  const fillsOpponentNeed = send.some((asset) => asset.position && oppNeeds.includes(asset.position));
  const fillsUserNeed = receive.some((asset) => asset.position && userNeeds.includes(asset.position));
  const pathBoost =
    path === "even_swap" ? 8 :
    path === "they_add_pick" ? 10 :
    path === "you_upgrade" ? (ctx.ambition >= 2 ? 12 : 4) :
    6;

  return Math.round(
    valueFit +
    (fillsOpponentNeed ? 18 : 0) +
    (fillsUserNeed ? 14 : 0) +
    pathBoost -
    Math.max(0, send.length - 2) * 5 -
    Math.max(0, receive.length - 2) * 4
  );
}

function makeCandidate(
  ctx: PackageContext,
  userNeeds: string[],
  oppNeeds: string[],
  candidate: Omit<ShopPackageCandidate, "cheap_score">
): ShopPackageCandidate {
  return {
    ...candidate,
    cheap_score: scoreCheapCandidate(ctx, candidate.send, candidate.receive, candidate.path, userNeeds, oppNeeds),
  };
}

function scorePassesCandidateFilter(
  candidate: ShopPackageCandidate,
  scored: ShopPackageScore
): boolean {
  if (candidate.score_filter === "not_lopsided") return scored.fairness !== "lopsided";
  if (candidate.score_filter === "delta_nonnegative") return scored.delta >= 0;
  return !(scored.fairness === "lopsided" && scored.delta < 0);
}

export function selectShopCandidatesForEvaluation(
  candidates: ShopPackageCandidate[],
  maxCandidates = SHOP_MAX_CANDIDATES_PER_OPPONENT
): ShopPackageCandidate[] {
  const unique = new Map<string, ShopPackageCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = unique.get(key);
    if (!existing || candidate.cheap_score > existing.cheap_score) {
      unique.set(key, candidate);
    }
  }

  return [...unique.values()]
    .sort((a, b) => b.cheap_score - a.cheap_score)
    .slice(0, maxCandidates);
}

export function buildShopPackageCandidates(ctx: PackageContext): ShopPackageCandidate[] {
  const { userRoster, opp, playerAsset, leagueMedians, ambition, userPicks, oppPicks } = ctx;
  const candidates: ShopPackageCandidate[] = [];

  const oppSurplus: CoreAsset[] = [];
  for (const pos of POSITIONS) {
    const posPlayers = opp.core_assets
      .filter((a) => a.position === pos)
      .sort((a, b) => b.edge_score - a.edge_score);
    const aboveMedian = posPlayers.filter((p) => p.edge_score > (leagueMedians[pos] ?? 60));
    if (aboveMedian.length > (MIN_STARTERS[pos] ?? 1)) {
      oppSurplus.push(...aboveMedian.slice(MIN_STARTERS[pos] ?? 1));
    }
  }

  const userNeeds = computeNeeds(userRoster, leagueMedians);
  const userDepth = userRoster.core_assets
    .filter((a) => a.player_id !== playerAsset.player_id && a.edge_score >= 40 && a.edge_score < 70)
    .sort((a, b) => b.edge_score - a.edge_score);
  const returnCandidates = opp.core_assets
    .filter((a) => POSITIONS.includes(a.position) && a.edge_score >= 42)
    .sort((a, b) => b.edge_score - a.edge_score);
  const oppNeeds = computeNeeds(opp, leagueMedians);
  const playerSend = shopPlayerAssetToTradePackageAsset(playerAsset);

  for (const candidate of returnCandidates.slice(0, 10)) {
    const fillsUserNeed = userNeeds.includes(candidate.position);
    candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
      path: "even_swap",
      path_label: "Even Swap",
      send: [playerSend],
      receive: [shopPlayerAssetToTradePackageAsset(candidate)],
      why_you_do_it: fillsUserNeed
        ? `Swap ${playerAsset.position} for ${candidate.position} help you actually need`
        : `Pivot ${playerAsset.position} value into ${candidate.position}`,
      why_they_accept: `Gets ${playerAsset.position} help while moving ${candidate.position} surplus`,
      score_filter: "not_lopsided",
    }));
  }

  for (const candidate of returnCandidates.filter((c) => c.edge_score < playerAsset.edge_score - 5).slice(0, 6)) {
    for (const pick of oppPicks.slice(0, 4)) {
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "they_add_pick",
        path_label: "Player + Pick Return",
        send: [playerSend],
        receive: [shopPlayerAssetToTradePackageAsset(candidate), shopPickToTradePackageAsset(pick)],
        why_you_do_it: `Take back ${candidate.position} depth plus draft capital`,
        why_they_accept: `Upgrades to ${playerAsset.full_name} and pays the gap with a pick`,
        score_filter: "not_lopsided",
      }));
    }
  }

  const upgradeTargets = returnCandidates
    .filter((c) => c.edge_score > playerAsset.edge_score + 5)
    .slice(0, ambition >= 3 ? 10 : ambition >= 2 ? 6 : 3);

  for (const target of upgradeTargets) {
    for (const pick of userPicks.slice(0, 4)) {
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "you_upgrade",
        path_label: "Player + Pick Upgrade",
        send: [playerSend, shopPickToTradePackageAsset(pick)],
        receive: [shopPlayerAssetToTradePackageAsset(target)],
        why_you_do_it: `Package up for a clear ${target.position} upgrade in ${target.full_name}`,
        why_they_accept: `Gets current production plus a future pick`,
        score_filter: "not_lopsided",
      }));
    }

    if (ambition >= 2) {
      for (const depth of userDepth.slice(0, 3)) {
        candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
          path: "you_upgrade",
          path_label: "2-for-1 Upgrade",
          send: [playerSend, shopPlayerAssetToTradePackageAsset(depth)],
          receive: [shopPlayerAssetToTradePackageAsset(target)],
          why_you_do_it: `Consolidate depth into a better weekly starter`,
          why_they_accept: `Turns one asset into two usable pieces`,
          score_filter: "not_lopsided",
        }));
      }
    }

    if (ambition >= 3 && userPicks.length > 0 && userDepth.length > 0) {
      const pick = userPicks[0];
      const depth = userDepth[0];
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "you_upgrade",
        path_label: "3-for-1 Upgrade",
        send: [
          playerSend,
          shopPickToTradePackageAsset(pick),
          shopPlayerAssetToTradePackageAsset(depth),
        ],
        receive: [shopPlayerAssetToTradePackageAsset(target)],
        why_you_do_it: `Reach for a stud by combining player, pick, and depth`,
        why_they_accept: `They cash out one star into multiple usable assets`,
        score_filter: "delta_nonnegative",
      }));
    }
  }

  const youngPieces = returnCandidates.filter(
    (c) => (c.age ?? 30) <= 25 && c.edge_score >= 45 && c.edge_score < playerAsset.edge_score
  );

  for (let i = 0; i < Math.min(Math.max(youngPieces.length - 1, 0), 4); i++) {
    for (let j = i + 1; j < Math.min(youngPieces.length, i + 4); j++) {
      const p1 = youngPieces[i];
      const p2 = youngPieces[j];
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "sell_for_pieces",
        path_label: "Sell for Youth",
        send: [playerSend],
        receive: [shopPlayerAssetToTradePackageAsset(p1), shopPlayerAssetToTradePackageAsset(p2)],
        why_you_do_it: `Turn one veteran slot into two younger assets`,
        why_they_accept: `Consolidates depth into a stronger starter`,
        score_filter: "not_negative_lopsided",
      }));
    }
  }

  for (const candidate of returnCandidates.filter((c) => (c.age ?? 30) <= 25 && c.edge_score >= 45).slice(0, 4)) {
    for (const pick of oppPicks.slice(0, 3)) {
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "sell_for_pieces",
        path_label: "Sell for Youth + Pick",
        send: [playerSend],
        receive: [shopPlayerAssetToTradePackageAsset(candidate), shopPickToTradePackageAsset(pick)],
        why_you_do_it: `Cash out into a young piece plus a future pick`,
        why_they_accept: `Buys immediate points with one outgoing package`,
        score_filter: "not_negative_lopsided",
      }));
    }
  }

  if (oppPicks.length > 0) {
    for (const firstPick of oppPicks.slice(0, 4)) {
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "sell_for_pieces",
        path_label: "Sell for Picks",
        send: [playerSend],
        receive: [shopPickToTradePackageAsset(firstPick)],
        why_you_do_it: `Turn ${playerAsset.full_name} into direct draft capital`,
        why_they_accept: "Converts picks into a lineup starter right now.",
        score_filter: "not_lopsided",
      }));

      const secondPick = oppPicks.find((pick) => pick.label !== firstPick.label);
      if (!secondPick) continue;
      candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
        path: "sell_for_pieces",
        path_label: "Sell for Picks",
        send: [playerSend],
        receive: [shopPickToTradePackageAsset(firstPick), shopPickToTradePackageAsset(secondPick)],
        why_you_do_it: `Cash out ${playerAsset.full_name} into multiple future darts`,
        why_they_accept: "Consolidates pick surplus into a lineup upgrade.",
        score_filter: "not_negative_lopsided",
      }));
    }
  }

  if (userPicks.length >= 2) {
    for (const target of returnCandidates.filter((candidate) => candidate.edge_score >= playerAsset.edge_score + 8).slice(0, 4)) {
      const pickPool = userPicks.slice(0, 8);
      for (let i = 0; i < pickPool.length; i++) {
        for (let j = i + 1; j < Math.min(pickPool.length, i + 4); j++) {
          const offerA = pickPool[i];
          const offerB = pickPool[j];
          const firstRoundCount =
            ((offerA.pick_breakdown?.round ?? offerA.round) === 1 ? 1 : 0) +
            ((offerB.pick_breakdown?.round ?? offerB.round) === 1 ? 1 : 0);
          if (firstRoundCount > 1) continue;

          candidates.push(makeCandidate(ctx, userNeeds, oppNeeds, {
            path: "you_upgrade",
            path_label: "Pick Package Upgrade",
            send: [shopPickToTradePackageAsset(offerA), shopPickToTradePackageAsset(offerB)],
            receive: [shopPlayerAssetToTradePackageAsset(target)],
            why_you_do_it: `Buy ${target.full_name} with picks instead of a core player`,
            why_they_accept: "Gets multiple future assets for one veteran cornerstone.",
            score_filter: "not_lopsided",
          }));
        }
      }
    }
  }

  return selectShopCandidatesForEvaluation(candidates);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function runNext() {
    while (index < items.length) {
      const item = items[index++];
      const result = await worker(item);
      if (result) results.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
}

export async function evaluateShopPackageCandidates(
  ctx: PackageContext,
  candidates: ShopPackageCandidate[],
  maxEvaluations = SHOP_MAX_EVALUATIONS_PER_OPPONENT
): Promise<RawPackage[]> {
  const selected = selectShopCandidatesForEvaluation(candidates, maxEvaluations);
  return mapWithConcurrency(selected, SHOP_EVALUATION_CONCURRENCY, async (candidate) => {
    try {
      const scored = await scorePackageForContext(ctx, candidate.send, candidate.receive);
      if (!scorePassesCandidateFilter(candidate, scored)) return null;
      return {
        path: candidate.path,
        path_label: candidate.path_label,
        ...rawPackageValuationFields(scored),
        why_you_do_it: candidate.why_you_do_it,
        why_they_accept: candidate.why_they_accept,
      };
    } catch (error) {
      if ((error as Error).message === "SHOP_EVALUATION_BUDGET_EXHAUSTED") return null;
      throw error;
    }
  });
}

export async function generatePackages(ctx: PackageContext): Promise<RawPackage[]> {
  const candidates = buildShopPackageCandidates(ctx);
  return evaluateShopPackageCandidates(ctx, candidates);
}

export async function shopPlayer(
  username: string,
  playerId: string,
  ambition = 2,
  classStrengths?: ClassStrengthMap,
  valueType: ValueType = "dynasty",
  weights?: SourceWeights
): Promise<ShopPlayerResult | null> {
  const allLeagues = await getPowerRankings(username, valueType, weights);
  if (allLeagues.length === 0) return null;

  const leaguesWithPlayer: Array<{
    league: LeaguePowerRanking;
    userRoster: RosterRanking;
    playerAsset: CoreAsset;
  }> = [];

  for (const league of allLeagues) {
    const userRoster = league.rosters.find((r) => r.is_user);
    if (!userRoster) continue;
    const playerAsset = userRoster.core_assets.find((a) => a.player_id === playerId);
    if (!playerAsset) continue;
    leaguesWithPlayer.push({ league, userRoster, playerAsset });
  }

  if (leaguesWithPlayer.length === 0) return null;

  const clampedAmbition = Math.max(1, Math.min(3, ambition));
  const firstAsset = leaguesWithPlayer[0].playerAsset;
  const allOpportunities: ShopOpportunity[] = [];
  const evaluationBudget = createShopEvaluationBudget();
  const valuationCache = new Map<string, Promise<ShopPackageScore>>();
  const evaluationStats = {
    leagues_scanned: allLeagues.length,
    leagues_with_player: leaguesWithPlayer.length,
    leagues_completed: 0,
    opponents_considered: 0,
    opponents_evaluated: 0,
    candidates_generated: 0,
  };
  const healthScoreMap = new Map<string, number>();
  for (const { league } of leaguesWithPlayer) {
    for (const roster of league.rosters) {
      for (const asset of roster.core_assets) {
        healthScoreMap.set(asset.player_id, asset.edge_score);
      }
    }
  }
  const tradeHealthData = await loadTradeHealthPlayerInfo(
    [...healthScoreMap.keys()],
    healthScoreMap
  );
  const pickMap = new Map<string, EnrichedPick[]>();

  for (const { league, userRoster, playerAsset } of leaguesWithPlayer) {
    if (shopBudgetTimedOut(evaluationBudget)) break;
    if (shopRequestEvaluationCapReached(evaluationBudget)) break;
    const leagueMedians: Record<string, number> = {};
    for (const pos of POSITIONS) {
      const allScores: number[] = [];
      for (const roster of league.rosters) {
        const top = roster.core_assets
          .filter((a) => a.position === pos)
          .sort((a, b) => b.edge_score - a.edge_score)
          .slice(0, (MIN_STARTERS[pos] ?? 1) + 1);
        allScores.push(...top.map((a) => a.edge_score));
      }
      leagueMedians[pos] = median(allScores);
    }

    const behaviors = await buildLeagueBehaviors(league.league_id);
    const opponents = league.rosters.filter((r) => !r.is_user);
    const getLeaguePicks = async (roster: RosterRanking) => {
      const cacheKey = `${league.league_id}:${roster.roster_id}`;
      if (pickMap.has(cacheKey)) return pickMap.get(cacheKey) ?? [];
      const picks = await Promise.all(
        (roster.draft_picks ?? []).map((pick) =>
          enrichScoredPick(pick, {
            leagueSize: league.rosters.length,
            format: league.mode,
            classStrengths,
          })
        )
      );
      picks.sort((a, b) => b.edge_score - a.edge_score);
      pickMap.set(cacheKey, picks);
      return picks;
    };

    const rankedOpponents = opponents
      .map((opp) => ({
        opp,
        motivation: scoreBuyerMotivation(opp, playerAsset, leagueMedians),
      }))
      .filter(({ motivation }) => motivation.score >= 20)
      .sort((a, b) => b.motivation.score - a.motivation.score);
    evaluationStats.opponents_considered += rankedOpponents.length;
    if (rankedOpponents.length > SHOP_MAX_OPPONENTS_PER_LEAGUE) {
      markShopPartial(
        evaluationBudget,
        `Shop a Player evaluated the top ${SHOP_MAX_OPPONENTS_PER_LEAGUE} buyers in ${league.league_name}.`
      );
    }

    for (const { opp, motivation } of rankedOpponents.slice(0, SHOP_MAX_OPPONENTS_PER_LEAGUE)) {
      if (shopBudgetTimedOut(evaluationBudget)) break;
      if (shopRequestEvaluationCapReached(evaluationBudget)) break;
      if (shopLeagueEvaluationCapReached(evaluationBudget, league.league_id)) break;
      const oppNeeds = computeNeeds(opp, leagueMedians);
      const topPlayerIdsByPos = computeTopPlayerIdsByPos(opp);
      const behavior: ManagerBehavior | null = behaviors.get(opp.roster_id) ?? null;
      const ctx: PackageContext = {
        leagueId: league.league_id,
        mode: league.mode,
        userRoster,
        opp,
        playerAsset,
        leagueMedians,
        ambition: clampedAmbition,
        userPicks: await getLeaguePicks(userRoster),
        oppPicks: await getLeaguePicks(opp),
        classStrengths,
        valueType,
        weights,
        valuationCache,
        evaluationBudget,
      };
      const candidates = buildShopPackageCandidates(ctx);
      evaluationStats.candidates_generated += candidates.length;
      const packages = await evaluateShopPackageCandidates(
        ctx,
        candidates,
        SHOP_MAX_EVALUATIONS_PER_OPPONENT
      );
      evaluationStats.opponents_evaluated += 1;

      for (const pkg of packages) {
        const acceptance = estimateAcceptance({
          fairness: pkg.fairness,
          delta: pkg.delta,
          sendAssets: pkg.you_send,
          receiveAssets: pkg.you_receive,
          sendEdges: pkg.you_send.map((a) => a.edge_score),
          receiveEdges: pkg.you_receive.map((a) => a.edge_score),
          opponent: {
            archetype: opp.archetype,
            needs: oppNeeds,
            top_player_ids_by_pos: topPlayerIdsByPos,
            behavior,
          },
        });

        const acceptanceScore = acceptance?.probability ?? 0;
        const fillsNeed = pkg.you_send.some((a) => a.position && oppNeeds.includes(a.position));
        const healthCheck = tradeHealthCheck(
          pkg.you_send,
          pkg.you_receive,
          tradeHealthData,
          pkg.fairness
        );
        if (healthCheck.some((warning) => warning.type === "block")) {
          continue;
        }
        const score = Math.round(
          motivation.score * 0.2 +
          acceptanceScore * 0.4 +
          (pkg.fairness === "fair" ? 30 : pkg.fairness === "slight_edge" ? 15 : 0) * 0.2 +
          (fillsNeed ? 20 : 0) * 0.2
        );

        allOpportunities.push({
          league_id: league.league_id,
          league_name: league.league_name,
          league_mode: league.mode,
          your_archetype: userRoster.archetype,
          opportunity_score: score,
          path: pkg.path,
          path_label: pkg.path_label,
          you_send: pkg.you_send,
          you_receive: pkg.you_receive,
          from_team: opp.display_name,
          from_archetype: opp.archetype,
          buyer_motivation: motivation.reason,
          motivation_score: motivation.score,
          send_total_tp: pkg.sendTotal,
          receive_total_tp: pkg.receiveTotal,
          delta_tp: pkg.delta,
          send_base_market_value: pkg.sendBaseMarketValue,
          receive_base_market_value: pkg.receiveBaseMarketValue,
          send_league_market_value: pkg.sendLeagueMarketValue,
          receive_league_market_value: pkg.receiveLeagueMarketValue,
          send_context_trade_value: pkg.sendContextTradeValue,
          receive_context_trade_value: pkg.receiveContextTradeValue,
          valuation_edge: pkg.valuationEdge,
          valuation_percent_gap: pkg.percentGap,
          valuation_warnings: pkg.valuationWarnings,
          valuation_explanations: pkg.valuationExplanations,
          fairness: pkg.fairness,
          why_you_do_it: pkg.why_you_do_it,
          why_they_accept: pkg.why_they_accept,
          acceptance: acceptance ?? {
            probability: 0,
            label: "Hard",
            accept_reasons: [],
            reject_reasons: ["No acceptance signal available"],
          },
          healthCheck,
        });
      }
    }

    evaluationStats.leagues_completed += 1;
  }

  const grouped = new Map<string, ShopOpportunity[]>();
  for (const opp of allOpportunities) {
    const key = `${opp.league_id}|${opp.from_team}|${opp.path}`;
    const list = grouped.get(key) ?? [];
    list.push(opp);
    grouped.set(key, list);
  }

  const deduped: ShopOpportunity[] = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => b.opportunity_score - a.opportunity_score);
    deduped.push(...list.slice(0, 2));
  }

  deduped.sort((a, b) => b.opportunity_score - a.opportunity_score);

  return {
    player_id: playerId,
    player_name: firstAsset.full_name,
    position: firstAsset.position,
    edge_score: firstAsset.edge_score,
    leagues_owned: leaguesWithPlayer.length,
    partial_results: evaluationBudget.partialResults,
    warnings: [...evaluationBudget.warnings],
    evaluation_stats: {
      ...evaluationStats,
      candidates_evaluated: evaluationBudget.evaluationsStarted,
      valuation_cache_hits: evaluationBudget.cacheHits,
      evaluation_cap: evaluationBudget.maxEvaluations,
      timed_out: evaluationBudget.timedOut,
    },
    opportunities: deduped.slice(0, 30),
  };
}
