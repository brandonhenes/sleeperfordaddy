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

// Constants

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Pos = (typeof POSITIONS)[number];

const MIN_STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };
const MIN_EDGE_SCORE = 42;
const FAIRNESS_BAND = 15;

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
  tradeablePicks: ScoredPick[];
}

// Helpers

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fairness(delta: number): "fair" | "slight_edge" | "lopsided" {
  const abs = Math.abs(delta);
  if (abs <= 5) return "fair";
  if (abs <= FAIRNESS_BAND) return "slight_edge";
  return "lopsided";
}

function assetFromPlayer(a: CoreAsset): TradePackageAsset {
  return {
    asset_type: "player",
    label: a.full_name,
    position: a.position,
    edge_score: a.edge_score,
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

function assetFromPick(p: ScoredPick): TradePackageAsset {
  return {
    asset_type: "pick",
    label: p.label,
    position: null,
    edge_score: p.edge_score,
    fc_score: null,
    ktc_score: p.ktc_score,
    dp_score: p.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: "high",
  };
}

function totalEdge(assets: TradePackageAsset[]): number {
  return assets.reduce((s, a) => s + a.edge_score, 0);
}

function roundTo(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
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
  medians: Record<Pos, number>
): RosterProfile {
  const byPos: Record<Pos, CoreAsset[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const a of roster.core_assets) {
    const pos = a.position as Pos;
    if (POSITIONS.includes(pos)) byPos[pos].push(a);
  }
  for (const pos of POSITIONS) {
    byPos[pos].sort((a, b) => b.edge_score - a.edge_score);
  }

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

  const tradeablePicks = (roster.draft_picks ?? [])
    .filter((p) => p.edge_score > 0)
    .sort((a, b) => b.edge_score - a.edge_score);

  return { roster, byPos, needs, surplus, needUrgency, tradeablePicks };
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

      const delta = oppGives.edge_score - userGives.edge_score;
      const f = fairness(delta);
      if (f === "lopsided") continue;

      const send = [assetFromPlayerWithScoring(userGives, scoring, usage, hasCustom)];
      const receive = [assetFromPlayerWithScoring(oppGives, scoring, usage, hasCustom)];

      packages.push({
        type: "balanced",
        label: "Balanced Swap",
        you_send: send,
        you_receive: receive,
        send_total: roundTo(totalEdge(send), 1),
        receive_total: roundTo(totalEdge(receive), 1),
        delta: roundTo(delta, 1),
        fairness: f,
        why_you_do_it: user.needs.includes(oppPos as Pos)
          ? `Fills your ${oppPos} need with their surplus`
          : `Upgrades ${oppPos} depth, trades ${userPos} surplus`,
        why_they_accept: opp.needs.includes(userPos as Pos)
          ? `Fills their ${userPos} need. ${ARCHETYPE_WANTS[opp.roster.archetype] ?? ""}`
          : `Upgrades their ${userPos}, trades ${oppPos} depth`,
        sweetener_hint: Math.abs(delta) > 3 && Math.abs(delta) <= 10
          ? `Add a late-round pick to ${delta > 0 ? "sweeten for them" : "balance for you"}`
          : null,
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
    const delta = totalEdge(receive) - totalEdge(send);
    const f = fairness(delta);
    if (f === "lopsided" && delta < -FAIRNESS_BAND) continue;

    packages.push({
      type: "consolidation",
      label: "2-for-1 Consolidation",
      you_send: send,
      you_receive: receive,
      send_total: roundTo(totalEdge(send), 1),
      receive_total: roundTo(totalEdge(receive), 1),
      delta: roundTo(delta, 1),
      fairness: f,
      why_you_do_it: `Consolidate depth into a ${oppPos} starter upgrade`,
      why_they_accept: `Gets ${[...usedPos].join(" + ")} help. They're a ${opp.roster.archetype} who wants ${ARCHETYPE_WANTS[opp.roster.archetype] ?? "flexibility"}.`,
      sweetener_hint: delta < -3
        ? "You may need to add a mid-round pick to get them to accept"
        : delta > 8
          ? "You're overpaying slightly. Try removing the weaker piece."
          : null,
    });
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
      const delta = totalEdge(receive) - totalEdge(send);
      const f = fairness(delta);
      if (f === "lopsided" && delta < -FAIRNESS_BAND) continue;

      const isDupe = packages.some(
        (p) =>
          p.you_receive[0]?.label === target.full_name &&
          p.type !== "picks_heavy"
      );
      if (isDupe && packages.length > 2) continue;

      packages.push({
        type: "picks_heavy",
        label: "Picks + Depth",
        you_send: send,
        you_receive: receive,
        send_total: roundTo(totalEdge(send), 1),
        receive_total: roundTo(totalEdge(receive), 1),
        delta: roundTo(delta, 1),
        fairness: f,
        why_you_do_it: `Acquire ${oppPos} starter using draft capital`,
        why_they_accept: `Gets future picks. They're a ${opp.roster.archetype} who wants ${ARCHETYPE_WANTS[opp.roster.archetype] ?? "draft capital"}.`,
        sweetener_hint:
          delta < -5
            ? "Consider upgrading the pick round or adding another asset"
            : null,
      });
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

  const typeOrder = { consolidation: 0, balanced: 1, picks_heavy: 2 };
  deduped.sort((a, b) => {
    const aDelta = a.delta;
    const bDelta = b.delta;
    return bDelta - aDelta || (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
  });

  return deduped.slice(0, 3);
}

// Main

export async function findTrades(
  username: string,
  leagueId: string
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
  const profiles = league.rosters.map((r) => buildProfile(r, medians));

  const userProfile = profiles.find((p) => p.roster.is_user);
  if (!userProfile) return [];

  const opponents = profiles.filter((p) => !p.roster.is_user);

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
    const packages = generatePackages(userProfile, opp, mode, leagueScoring, usageMap, hasCustomScoring);
    if (packages.length === 0) continue;

    suggestions.push({
      partner: {
        roster_id: opp.roster.roster_id,
        display_name: opp.roster.display_name,
        archetype: opp.roster.archetype,
        compatibility_score: score,
        compatibility_reason: reason,
      },
      packages,
    });
  }

  return suggestions;
}
