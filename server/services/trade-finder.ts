import type {
  TradeSuggestion,
  TradePackage,
  TradePackageAsset,
} from "../../shared/types.js";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  getPowerRankings,
  type RosterRanking,
  type CoreAsset,
} from "./power-rankings.js";
import type { ScoredPick } from "./draft-picks.js";
import {
  parseLeagueScoring,
  loadPlayerUsageStats,
  computeScoringDelta,
  computeAdjustedEdgeScore,
  estimateBaselineFPPG,
  isNonStandardScoring,
  type LeagueScoringSettings,
} from "./scoring-adjustment.js";
import { evaluateTradeValue } from "./trade-value.js";
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

// Constants

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];

const MIN_STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const MIN_EDGE_SCORE = 42;

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

function totalEdge(assets: TradePackageAsset[]): number {
  return assets.reduce((s, a) => s + a.edge_score, 0);
}

function roundTo(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
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
  fairness: "fair" | "slight_edge" | "lopsided";
};

function scorePackage(
  send: TradePackageAsset[],
  receive: TradePackageAsset[]
): PackageScore {
  const tv = evaluateTradeValue(
    receive.map((a) => a.edge_score),
    send.map((a) => a.edge_score)
  );

  return {
    sendAssets: send.map((asset, i) => ({
      ...asset,
      trade_power: tv.sideB.trade_powers[i] ?? 0,
    })),
    receiveAssets: receive.map((asset, i) => ({
      ...asset,
      trade_power: tv.sideA.trade_powers[i] ?? 0,
    })),
    sendTotal: tv.sideB.total_tp,
    receiveTotal: tv.sideA.total_tp,
    delta: tv.delta_tp,
    sendEdge: roundTo(totalEdge(send), 1),
    receiveEdge: roundTo(totalEdge(receive), 1),
    deltaEdge: roundTo(totalEdge(receive) - totalEdge(send), 1),
    packagePenaltySend: tv.sideB.penalty_pct,
    packagePenaltyReceive: tv.sideA.penalty_pct,
    fairness: tv.fairness,
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
    .filter((pkg) => {
      if (opp.behavior?.preferred_structure === "1-for-1") {
        return pkg.you_send.length === 1 && pkg.you_receive.length === 1;
      }
      return true;
    })
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

function generatePackages(
  user: RosterProfile,
  opp: RosterProfile,
  _mode: "sf" | "1qb",
  scoring: LeagueScoringSettings,
  usage: UsageStats,
  hasCustom: boolean
): TradePackage[] {
  const packages: TradePackage[] = [];

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
      const scored = scorePackage(send, receive);
      if (scored.fairness === "lopsided" || scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

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
    const scored = scorePackage(send, receive);
    if (scored.fairness === "lopsided" || scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

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
        const scored = scorePackage(send, receive);
        if (scored.fairness === "lopsided" || scored.sendTotal <= 0 || scored.receiveTotal <= 0) {
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
      const scored = scorePackage(send, receive);
      if (scored.fairness === "lopsided" || scored.sendTotal <= 0 || scored.receiveTotal <= 0) continue;

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
    for (const targetPick of opp.tradeablePicks.slice(0, 2)) {
      const sendPool = user.tradeablePicks.filter(
        (pick) =>
          pick.label !== targetPick.label &&
          (pick.pick_breakdown?.round ?? pick.round) <= 4
      );
      for (let i = 0; i < sendPool.length; i++) {
        for (let j = i + 1; j < Math.min(sendPool.length, i + 4); j++) {
          const offerA = sendPool[i];
          const offerB = sendPool[j];
          const firstRoundCount =
            ((offerA.pick_breakdown?.round ?? offerA.round) === 1 ? 1 : 0) +
            ((offerB.pick_breakdown?.round ?? offerB.round) === 1 ? 1 : 0);
          if (firstRoundCount > 1) continue;

          const send = [assetFromPick(offerA), assetFromPick(offerB)];
          const receive = [assetFromPick(targetPick)];
          const scored = scorePackage(send, receive);
          if (scored.fairness === "lopsided" || scored.sendTotal <= 0 || scored.receiveTotal <= 0) {
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
            fairness: scored.fairness,
            why_you_do_it: `Roll two picks into ${targetPick.label} and trade up the board`,
            why_they_accept: "Moves one premium pick for multiple future assets and flexibility.",
            sweetener_hint: scored.deltaEdge < -4 ? "Swap one pick down a tier if the price is too steep." : null,
            acceptance: null,
            healthCheck: [],
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  const deduped: TradePackage[] = [];
  for (const pkg of packages) {
    const key = `${pkg.type}:${pkg.you_receive.map((a) => a.label).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(pkg);
  }

  const typeOrder = { player_plus_pick: 0, picks_heavy: 1, balanced: 2, consolidation: 3 };
  const fairnessRank = { fair: 0, slight_edge: 1, lopsided: 2 };
  deduped.sort((a, b) => {
    return (
      (fairnessRank[a.fairness] ?? 9) - (fairnessRank[b.fairness] ?? 9) ||
      b.receive_total - a.receive_total ||
      b.delta - a.delta ||
      (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
    );
  });

  const selected: TradePackage[] = [];
  const pushPackage = (pkg: TradePackage) => {
    if (selected.some(
      (existing) =>
        existing.type === pkg.type &&
        existing.you_send.map((asset) => asset.label).join("|") === pkg.you_send.map((asset) => asset.label).join("|") &&
        existing.you_receive.map((asset) => asset.label).join("|") === pkg.you_receive.map((asset) => asset.label).join("|")
    )) {
      return;
    }
    selected.push(pkg);
  };

  const pickPackages = deduped.filter(packageContainsPick);
  const nonPickPackages = deduped.filter((pkg) => !packageContainsPick(pkg));
  const minimumPickPackages = Math.min(2, pickPackages.length);
  for (const pkg of pickPackages.slice(0, minimumPickPackages)) {
    pushPackage(pkg);
  }
  for (const pkg of [...nonPickPackages, ...pickPackages.slice(minimumPickPackages)]) {
    if (selected.length >= 4) break;
    pushPackage(pkg);
  }

  return selected.slice(0, 4);
}

// Main

export async function findTrades(
  username: string,
  leagueId: string,
  classStrengths?: ClassStrengthMap
): Promise<TradeSuggestion[]> {
  const allLeagues = await getPowerRankings(username);
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
  const healthScoreMap = new Map<string, number>();
  for (const roster of league.rosters) {
    for (const asset of roster.core_assets) {
      healthScoreMap.set(asset.player_id, asset.edge_score);
    }
  }
  const tradeHealthData = await loadTradeHealthPlayerInfo(
    [...healthScoreMap.keys()],
    healthScoreMap
  );

  const ranked = opponents
    .map((opp) => {
      const { score, reason } = scoreCompatibility(userProfile, opp);
      return { opp, score, reason };
    })
    .filter((r) => r.score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const suggestions: TradeSuggestion[] = [];

  for (const { opp, score, reason } of ranked) {
    const basePackages = generatePackages(userProfile, opp, mode, leagueScoring, usageMap, hasCustomScoring);
    const packages = applyAcceptanceAndBehavior(basePackages, userProfile, opp)
      .map((pkg) => ({
        ...pkg,
        healthCheck: tradeHealthCheck(
          pkg.you_send,
          pkg.you_receive,
          tradeHealthData,
          pkg.fairness
        ),
      }))
      .filter((pkg) => !pkg.healthCheck.some((warning) => warning.type === "block"));
    if (packages.length === 0) continue;

    suggestions.push({
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
    });
  }

  return suggestions;
}
