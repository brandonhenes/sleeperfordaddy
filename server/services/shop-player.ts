import { getPowerRankings, type LeaguePowerRanking, type RosterRanking, type CoreAsset } from "./power-rankings.js";
import type { ScoredPick } from "./draft-picks.js";
import type { ShopPlayerResult, ShopOpportunity, EvaluatedAsset } from "../../shared/types.js";
import { evaluateTradeValue } from "./trade-value.js";
import { buildLeagueBehaviors, estimateAcceptance, type ManagerBehavior } from "./manager-behavior.js";
import { loadTradeHealthPlayerInfo, tradeHealthCheck } from "./trade-calculator.js";
import { enrichScoredPick, type ClassStrengthMap } from "./pick-values.js";
import type { ValueType } from "./composite-values.js";

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

function toEval(a: CoreAsset): EvaluatedAsset {
  return {
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

function pickToEval(p: EnrichedPick): EvaluatedAsset {
  return {
    player_id: null,
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

function fillTradePower(assets: EvaluatedAsset[], tps: number[]): EvaluatedAsset[] {
  return assets.map((a, i) => ({ ...a, trade_power: tps[i] ?? 0 }));
}

function scorePackage(sendEdges: number[], receiveEdges: number[]) {
  const tv = evaluateTradeValue(sendEdges, receiveEdges);
  return {
    sendTPs: tv.sideA.trade_powers,
    receiveTPs: tv.sideB.trade_powers,
    sendTotal: tv.sideA.total_tp,
    receiveTotal: tv.sideB.total_tp,
    delta: tv.delta_tp,
    fairness: tv.fairness,
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
  userRoster: RosterRanking;
  opp: RosterRanking;
  playerAsset: CoreAsset;
  leagueMedians: Record<string, number>;
  ambition: number;
  userPicks: EnrichedPick[];
  oppPicks: EnrichedPick[];
}

interface RawPackage {
  path: ShopOpportunity["path"];
  path_label: string;
  you_send: EvaluatedAsset[];
  you_receive: EvaluatedAsset[];
  sendTotal: number;
  receiveTotal: number;
  delta: number;
  fairness: ShopOpportunity["fairness"];
  why_you_do_it: string;
  why_they_accept: string;
}

function generatePackages(ctx: PackageContext): RawPackage[] {
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
    const scored = scorePackage([playerAsset.edge_score], [candidate.edge_score]);
    if (scored.fairness === "lopsided") continue;
    const sendAssets = fillTradePower([toEval(playerAsset)], scored.sendTPs);
    const receiveAssets = fillTradePower([toEval(candidate)], scored.receiveTPs);
    const fillsUserNeed = userNeeds.includes(candidate.position);
    packages.push({
      path: "even_swap",
      path_label: "Even Swap",
      you_send: sendAssets,
      you_receive: receiveAssets,
      sendTotal: scored.sendTotal,
      receiveTotal: scored.receiveTotal,
      delta: scored.delta,
      fairness: scored.fairness,
      why_you_do_it: fillsUserNeed
        ? `Swap ${playerAsset.position} for ${candidate.position} help you actually need`
        : `Pivot ${playerAsset.position} value into ${candidate.position}`,
      why_they_accept: `Gets ${playerAsset.position} help while moving ${candidate.position} surplus`,
    });
  }

  for (const candidate of returnCandidates.filter((c) => c.edge_score < playerAsset.edge_score - 5).slice(0, 6)) {
    for (const pick of oppPicks.slice(0, 4)) {
      const scored = scorePackage([playerAsset.edge_score], [candidate.edge_score, pick.edge_score]);
      if (scored.fairness === "lopsided") continue;
      packages.push({
        path: "they_add_pick",
        path_label: "Player + Pick Return",
        you_send: fillTradePower([toEval(playerAsset)], scored.sendTPs),
        you_receive: fillTradePower([toEval(candidate), pickToEval(pick)], scored.receiveTPs),
        sendTotal: scored.sendTotal,
        receiveTotal: scored.receiveTotal,
        delta: scored.delta,
        fairness: scored.fairness,
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
      const scored = scorePackage([playerAsset.edge_score, pick.edge_score], [target.edge_score]);
      if (scored.fairness === "lopsided") continue;
      packages.push({
        path: "you_upgrade",
        path_label: "Player + Pick Upgrade",
        you_send: fillTradePower([toEval(playerAsset), pickToEval(pick)], scored.sendTPs),
        you_receive: fillTradePower([toEval(target)], scored.receiveTPs),
        sendTotal: scored.sendTotal,
        receiveTotal: scored.receiveTotal,
        delta: scored.delta,
        fairness: scored.fairness,
        why_you_do_it: `Package up for a clear ${target.position} upgrade in ${target.full_name}`,
        why_they_accept: `Gets current production plus a future pick`,
      });
      break;
    }

    if (ambition >= 2) {
      for (const depth of userDepth.slice(0, 3)) {
        const scored = scorePackage([playerAsset.edge_score, depth.edge_score], [target.edge_score]);
        if (scored.fairness === "lopsided") continue;
        packages.push({
          path: "you_upgrade",
          path_label: "2-for-1 Upgrade",
          you_send: fillTradePower([toEval(playerAsset), toEval(depth)], scored.sendTPs),
          you_receive: fillTradePower([toEval(target)], scored.receiveTPs),
          sendTotal: scored.sendTotal,
          receiveTotal: scored.receiveTotal,
          delta: scored.delta,
          fairness: scored.fairness,
          why_you_do_it: `Consolidate depth into a better weekly starter`,
          why_they_accept: `Turns one asset into two usable pieces`,
        });
        break;
      }
    }

    if (ambition >= 3 && userPicks.length > 0 && userDepth.length > 0) {
      const pick = userPicks[0];
      const depth = userDepth[0];
      const scored = scorePackage(
        [playerAsset.edge_score, pick.edge_score, depth.edge_score],
        [target.edge_score]
      );
      if (scored.delta >= 0) {
        packages.push({
          path: "you_upgrade",
          path_label: "3-for-1 Upgrade",
          you_send: fillTradePower([toEval(playerAsset), pickToEval(pick), toEval(depth)], scored.sendTPs),
          you_receive: fillTradePower([toEval(target)], scored.receiveTPs),
          sendTotal: scored.sendTotal,
          receiveTotal: scored.receiveTotal,
          delta: scored.delta,
          fairness: scored.fairness,
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
      const scored = scorePackage([playerAsset.edge_score], [p1.edge_score, p2.edge_score]);
      if (scored.fairness === "lopsided" && scored.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Youth",
        you_send: fillTradePower([toEval(playerAsset)], scored.sendTPs),
        you_receive: fillTradePower([toEval(p1), toEval(p2)], scored.receiveTPs),
        sendTotal: scored.sendTotal,
        receiveTotal: scored.receiveTotal,
        delta: scored.delta,
        fairness: scored.fairness,
        why_you_do_it: `Turn one veteran slot into two younger assets`,
        why_they_accept: `Consolidates depth into a stronger starter`,
      });
      break;
    }
  }

  for (const candidate of returnCandidates.filter((c) => (c.age ?? 30) <= 25 && c.edge_score >= 45).slice(0, 4)) {
    for (const pick of oppPicks.slice(0, 3)) {
      const scored = scorePackage([playerAsset.edge_score], [candidate.edge_score, pick.edge_score]);
      if (scored.fairness === "lopsided" && scored.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Youth + Pick",
        you_send: fillTradePower([toEval(playerAsset)], scored.sendTPs),
        you_receive: fillTradePower([toEval(candidate), pickToEval(pick)], scored.receiveTPs),
        sendTotal: scored.sendTotal,
        receiveTotal: scored.receiveTotal,
        delta: scored.delta,
        fairness: scored.fairness,
        why_you_do_it: `Cash out into a young piece plus a future pick`,
        why_they_accept: `Buys immediate points with one outgoing package`,
      });
      break;
    }
  }

  if (oppPicks.length > 0) {
    for (const firstPick of oppPicks.slice(0, 4)) {
      const solo = scorePackage([playerAsset.edge_score], [firstPick.edge_score]);
      if (solo.fairness !== "lopsided") {
        packages.push({
          path: "sell_for_pieces",
          path_label: "Sell for Picks",
          you_send: fillTradePower([toEval(playerAsset)], solo.sendTPs),
          you_receive: fillTradePower([pickToEval(firstPick)], solo.receiveTPs),
          sendTotal: solo.sendTotal,
          receiveTotal: solo.receiveTotal,
          delta: solo.delta,
          fairness: solo.fairness,
          why_you_do_it: `Turn ${playerAsset.full_name} into direct draft capital`,
          why_they_accept: "Converts picks into a lineup starter right now.",
        });
        continue;
      }

      const secondPick = oppPicks.find((pick) => pick.label !== firstPick.label);
      if (!secondPick) continue;
      const duo = scorePackage(
        [playerAsset.edge_score],
        [firstPick.edge_score, secondPick.edge_score]
      );
      if (duo.fairness === "lopsided" && duo.delta < 0) continue;
      packages.push({
        path: "sell_for_pieces",
        path_label: "Sell for Picks",
        you_send: fillTradePower([toEval(playerAsset)], duo.sendTPs),
        you_receive: fillTradePower([pickToEval(firstPick), pickToEval(secondPick)], duo.receiveTPs),
        sendTotal: duo.sendTotal,
        receiveTotal: duo.receiveTotal,
        delta: duo.delta,
        fairness: duo.fairness,
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

          const scored = scorePackage(
            [offerA.edge_score, offerB.edge_score],
            [target.edge_score]
          );
          if (scored.fairness === "lopsided") continue;
          packages.push({
            path: "you_upgrade",
            path_label: "Pick Package Upgrade",
            you_send: fillTradePower([pickToEval(offerA), pickToEval(offerB)], scored.sendTPs),
            you_receive: fillTradePower([toEval(target)], scored.receiveTPs),
            sendTotal: scored.sendTotal,
            receiveTotal: scored.receiveTotal,
            delta: scored.delta,
            fairness: scored.fairness,
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
      const packages = generatePackages({
        userRoster,
        opp,
        playerAsset,
        leagueMedians,
        ambition: clampedAmbition,
        userPicks: await getLeaguePicks(userRoster),
        oppPicks: await getLeaguePicks(opp),
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
