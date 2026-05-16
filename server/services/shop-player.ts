import { getPowerRankings, type LeaguePowerRanking, type RosterRanking, type CoreAsset } from "./power-rankings.js";
import type { ScoredPick } from "./draft-picks.js";
import type {
  ShopPlayerResult,
  ShopOpportunity,
  EvaluatedAsset,
  TradePackageAsset,
  TradeValuationWarning,
} from "../../shared/types.js";
import { buildLeagueBehaviors, estimateAcceptance, type ManagerBehavior } from "./manager-behavior.js";
import { loadTradeHealthPlayerInfo, tradeHealthCheck } from "./trade-calculator.js";
import { enrichScoredPick, type ClassStrengthMap } from "./pick-values.js";
import type { ValueType } from "./composite-values.js";
import {
  evaluateOpportunityPackage,
  opportunityValuationFields,
  type OpportunityPackageValuation,
  type OpportunityPackageValuationInput,
} from "./trade-opportunity-valuation.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

const ARCHETYPE_BUY_MOTIVATION: Record<string, { wants_vets: number; wants_youth: number; wants_picks: number }> = {
  "Dynasty Juggernaut": { wants_vets: 30, wants_youth: 60, wants_picks: 20 },
  "All-In Contender": { wants_vets: 90, wants_youth: 30, wants_picks: 10 },
  "Fragile Contender": { wants_vets: 70, wants_youth: 80, wants_picks: 20 },
  "Productive Struggle": { wants_vets: 20, wants_youth: 70, wants_picks: 90 },
  Rebuilder: { wants_vets: 10, wants_youth: 80, wants_picks: 95 },
  "Dead Zone": { wants_vets: 50, wants_youth: 60, wants_picks: 50 },
  Competitor: { wants_vets: 60, wants_youth: 50, wants_picks: 40 },
};

type EnrichedPick = ScoredPick & {
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
  evaluatePackage: EvaluateOpportunityPackageFn = evaluateOpportunityPackage
): Promise<ShopPackageScore> {
  const valuation = await evaluatePackage({
    send,
    receive,
    leagueId,
    mode,
    classStrengths,
    valueType,
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

interface PackageContext {
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
  valuationCache: Map<string, Promise<ShopPackageScore>>;
}

interface RawPackage {
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

async function scorePackageForContext(
  ctx: PackageContext,
  send: TradePackageAsset[],
  receive: TradePackageAsset[]
): Promise<ShopPackageScore> {
  const cacheKey = [
    ctx.leagueId,
    ctx.mode,
    ctx.valueType,
    send.map(assetCacheKey).join("+"),
    receive.map(assetCacheKey).join("+"),
  ].join("|");
  const cached = ctx.valuationCache.get(cacheKey);
  if (cached) return cached;

  const scorePromise = scoreShopPackage(
    send,
    receive,
    ctx.leagueId,
    ctx.mode,
    ctx.classStrengths,
    ctx.valueType
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

async function generatePackages(ctx: PackageContext): Promise<RawPackage[]> {
  const { userRoster, opp, playerAsset, leagueMedians, ambition, userPicks, oppPicks } = ctx;
  const packages: RawPackage[] = [];

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

  for (const candidate of returnCandidates.slice(0, 10)) {
    const scored = await scorePackageForContext(
      ctx,
      [shopPlayerAssetToTradePackageAsset(playerAsset)],
      [shopPlayerAssetToTradePackageAsset(candidate)]
    );
    if (scored.fairness === "lopsided") continue;
    const fillsUserNeed = userNeeds.includes(candidate.position);
    packages.push({
      path: "even_swap",
      path_label: "Even Swap",
      ...rawPackageValuationFields(scored),
      why_you_do_it: fillsUserNeed
        ? `Swap ${playerAsset.position} for ${candidate.position} help you actually need`
        : `Pivot ${playerAsset.position} value into ${candidate.position}`,
      why_they_accept: `Gets ${playerAsset.position} help while moving ${candidate.position} surplus`,
    });
  }

  for (const candidate of returnCandidates.filter((c) => c.edge_score < playerAsset.edge_score - 5).slice(0, 6)) {
    for (const pick of oppPicks.slice(0, 4)) {
      const scored = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset)],
        [shopPlayerAssetToTradePackageAsset(candidate), shopPickToTradePackageAsset(pick)]
      );
      if (scored.fairness === "lopsided") continue;
      packages.push({
        path: "they_add_pick",
        path_label: "Player + Pick Return",
        ...rawPackageValuationFields(scored),
        why_you_do_it: `Take back ${candidate.position} depth plus draft capital`,
        why_they_accept: `Upgrades to ${playerAsset.full_name} and pays the gap with a pick`,
      });
      break;
    }
  }

  const upgradeTargets = returnCandidates
    .filter((c) => c.edge_score > playerAsset.edge_score + 5)
    .slice(0, ambition >= 3 ? 10 : ambition >= 2 ? 6 : 3);

  for (const target of upgradeTargets) {
    for (const pick of userPicks.slice(0, 4)) {
      const scored = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset), shopPickToTradePackageAsset(pick)],
        [shopPlayerAssetToTradePackageAsset(target)]
      );
      if (scored.fairness === "lopsided") continue;
      packages.push({
        path: "you_upgrade",
        path_label: "Player + Pick Upgrade",
        ...rawPackageValuationFields(scored),
        why_you_do_it: `Package up for a clear ${target.position} upgrade in ${target.full_name}`,
        why_they_accept: `Gets current production plus a future pick`,
      });
      break;
    }

    if (ambition >= 2) {
      for (const depth of userDepth.slice(0, 3)) {
        const scored = await scorePackageForContext(
          ctx,
          [shopPlayerAssetToTradePackageAsset(playerAsset), shopPlayerAssetToTradePackageAsset(depth)],
          [shopPlayerAssetToTradePackageAsset(target)]
        );
        if (scored.fairness === "lopsided") continue;
        packages.push({
          path: "you_upgrade",
          path_label: "2-for-1 Upgrade",
          ...rawPackageValuationFields(scored),
          why_you_do_it: `Consolidate depth into a better weekly starter`,
          why_they_accept: `Turns one asset into two usable pieces`,
        });
        break;
      }
    }

    if (ambition >= 3 && userPicks.length > 0 && userDepth.length > 0) {
      const pick = userPicks[0];
      const depth = userDepth[0];
      const scored = await scorePackageForContext(
        ctx,
        [
          shopPlayerAssetToTradePackageAsset(playerAsset),
          shopPickToTradePackageAsset(pick),
          shopPlayerAssetToTradePackageAsset(depth),
        ],
        [shopPlayerAssetToTradePackageAsset(target)]
      );
      if (scored.delta >= 0) {
        packages.push({
          path: "you_upgrade",
          path_label: "3-for-1 Upgrade",
          ...rawPackageValuationFields(scored),
          why_you_do_it: `Reach for a stud by combining player, pick, and depth`,
          why_they_accept: `They cash out one star into multiple usable assets`,
        });
      }
    }
  }

  const youngPieces = returnCandidates.filter(
    (c) => (c.age ?? 30) <= 25 && c.edge_score >= 45 && c.edge_score < playerAsset.edge_score
  );

  for (let i = 0; i < Math.min(Math.max(youngPieces.length - 1, 0), 4); i++) {
    for (let j = i + 1; j < Math.min(youngPieces.length, i + 4); j++) {
      const p1 = youngPieces[i];
      const p2 = youngPieces[j];
      const scored = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset)],
        [shopPlayerAssetToTradePackageAsset(p1), shopPlayerAssetToTradePackageAsset(p2)]
      );
      if (scored.fairness === "lopsided" && scored.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Youth",
        ...rawPackageValuationFields(scored),
        why_you_do_it: `Turn one veteran slot into two younger assets`,
        why_they_accept: `Consolidates depth into a stronger starter`,
      });
      break;
    }
  }

  for (const candidate of returnCandidates.filter((c) => (c.age ?? 30) <= 25 && c.edge_score >= 45).slice(0, 4)) {
    for (const pick of oppPicks.slice(0, 3)) {
      const scored = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset)],
        [shopPlayerAssetToTradePackageAsset(candidate), shopPickToTradePackageAsset(pick)]
      );
      if (scored.fairness === "lopsided" && scored.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Youth + Pick",
        ...rawPackageValuationFields(scored),
        why_you_do_it: `Cash out into a young piece plus a future pick`,
        why_they_accept: `Buys immediate points with one outgoing package`,
      });
      break;
    }
  }

  if (oppPicks.length > 0) {
    for (const firstPick of oppPicks.slice(0, 4)) {
      const solo = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset)],
        [shopPickToTradePackageAsset(firstPick)]
      );
      if (solo.fairness !== "lopsided") {
        packages.push({
          path: "sell_for_pieces",
          path_label: "Sell for Picks",
          ...rawPackageValuationFields(solo),
          why_you_do_it: `Turn ${playerAsset.full_name} into direct draft capital`,
          why_they_accept: "Converts picks into a lineup starter right now.",
        });
        continue;
      }

      const secondPick = oppPicks.find((pick) => pick.label !== firstPick.label);
      if (!secondPick) continue;
      const duo = await scorePackageForContext(
        ctx,
        [shopPlayerAssetToTradePackageAsset(playerAsset)],
        [shopPickToTradePackageAsset(firstPick), shopPickToTradePackageAsset(secondPick)]
      );
      if (duo.fairness === "lopsided" && duo.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Picks",
        ...rawPackageValuationFields(duo),
        why_you_do_it: `Cash out ${playerAsset.full_name} into multiple future darts`,
        why_they_accept: "Consolidates pick surplus into a lineup upgrade.",
      });
    }
  }

  if (userPicks.length >= 2) {
    for (const target of returnCandidates.filter((candidate) => candidate.edge_score >= playerAsset.edge_score + 8).slice(0, 4)) {
      for (let i = 0; i < userPicks.length; i++) {
        for (let j = i + 1; j < Math.min(userPicks.length, i + 4); j++) {
          const offerA = userPicks[i];
          const offerB = userPicks[j];
          const firstRoundCount =
            ((offerA.pick_breakdown?.round ?? offerA.round) === 1 ? 1 : 0) +
            ((offerB.pick_breakdown?.round ?? offerB.round) === 1 ? 1 : 0);
          if (firstRoundCount > 1) continue;

          const scored = await scorePackageForContext(
            ctx,
            [shopPickToTradePackageAsset(offerA), shopPickToTradePackageAsset(offerB)],
            [shopPlayerAssetToTradePackageAsset(target)]
          );
          if (scored.fairness === "lopsided") continue;
          packages.push({
            path: "you_upgrade",
            path_label: "Pick Package Upgrade",
            ...rawPackageValuationFields(scored),
            why_you_do_it: `Buy ${target.full_name} with picks instead of a core player`,
            why_they_accept: "Gets multiple future assets for one veteran cornerstone.",
          });
        }
      }
    }
  }

  const unique = new Map<string, RawPackage>();
  for (const pkg of packages) {
    const key = `${pkg.path}|${pkg.you_send.map((a) => a.label).join("+")}|${pkg.you_receive.map((a) => a.label).join("+")}`;
    const existing = unique.get(key);
    if (!existing || pkg.sendTotal + pkg.receiveTotal > existing.sendTotal + existing.receiveTotal) {
      unique.set(key, pkg);
    }
  }

  return [...unique.values()];
}

export async function shopPlayer(
  username: string,
  playerId: string,
  ambition = 2,
  classStrengths?: ClassStrengthMap,
  valueType: ValueType = "dynasty"
): Promise<ShopPlayerResult | null> {
  const allLeagues = await getPowerRankings(username, valueType);
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
    const valuationCache = new Map<string, Promise<ShopPackageScore>>();
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

    for (const opp of opponents) {
      const motivation = scoreBuyerMotivation(opp, playerAsset, leagueMedians);
      if (motivation.score < 20) continue;

      const oppNeeds = computeNeeds(opp, leagueMedians);
      const topPlayerIdsByPos = computeTopPlayerIdsByPos(opp);
      const behavior: ManagerBehavior | null = behaviors.get(opp.roster_id) ?? null;
      const packages = await generatePackages({
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
        valuationCache,
      });

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
    opportunities: deduped.slice(0, 30),
  };
}
