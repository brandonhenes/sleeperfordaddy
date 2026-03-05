import type { TradeSuggestion, EvaluatedAsset } from "../../shared/types.js";
import { getPowerRankings, type RosterRanking, type CoreAsset } from "./power-rankings.js";

// ─── Types ───

interface PositionAnalysis {
  surplus: CoreAsset[];   // assets above league median at this position
  deficit: boolean;       // true if position is a need
}

interface RosterAnalysis {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  positions: Record<string, PositionAnalysis>;
  core_assets: CoreAsset[];
}

// ─── Helpers ───

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toEvaluatedAsset(a: CoreAsset): EvaluatedAsset {
  return {
    label: a.full_name,
    edge_score: a.edge_score,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    source_agreement: a.source_agreement,
  };
}

function tradeFairness(delta: number): "fair" | "slight_edge" | "lopsided" {
  const abs = Math.abs(delta);
  if (abs <= 4) return "fair";
  if (abs <= 10) return "slight_edge";
  return "lopsided";
}

const POSITIONS = ["QB", "RB", "WR", "TE"];

/** Minimum starter slots per position to consider a position "needed" */
const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

// ─── Analysis ───

function computeLeagueMedians(
  rosters: RosterRanking[]
): Record<string, number> {
  const byPos: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const r of rosters) {
    // Use starter-level assets (top N per position) for medians
    const posCounts: Record<string, number> = {};
    for (const a of r.core_assets) {
      if (!POSITIONS.includes(a.position)) continue;
      posCounts[a.position] = (posCounts[a.position] ?? 0) + 1;
      // Only count the first few meaningful assets per position
      if (posCounts[a.position] <= (MIN_STARTERS[a.position] ?? 1) + 1) {
        byPos[a.position].push(a.edge_score);
      }
    }
  }
  const result: Record<string, number> = {};
  for (const pos of POSITIONS) {
    result[pos] = median(byPos[pos]);
  }
  return result;
}

function analyzeRoster(
  roster: RosterRanking,
  medians: Record<string, number>
): RosterAnalysis {
  const positions: Record<string, PositionAnalysis> = {};

  for (const pos of POSITIONS) {
    const posPlayers = roster.core_assets
      .filter((a) => a.position === pos)
      .sort((a, b) => b.edge_score - a.edge_score);

    const aboveMedian = posPlayers.filter((p) => p.edge_score > medians[pos]);
    const minNeeded = MIN_STARTERS[pos] ?? 1;

    // Surplus: more above-median players than needed
    const surplus = aboveMedian.length > minNeeded
      ? aboveMedian.slice(minNeeded)
      : [];

    // Deficit: fewer above-median players than minimum starters
    const deficit = aboveMedian.length < minNeeded;

    positions[pos] = { surplus, deficit };
  }

  return {
    roster_id: roster.roster_id,
    owner_id: roster.owner_id,
    display_name: roster.display_name,
    is_user: roster.is_user,
    positions,
    core_assets: roster.core_assets,
  };
}

// ─── Main ───

export async function findTrades(
  username: string,
  leagueId: string
): Promise<TradeSuggestion[]> {
  const allLeagues = await getPowerRankings(username);
  const league = allLeagues.find((l) => l.league_id === leagueId);
  if (!league || league.rosters.length < 2) return [];

  const medians = computeLeagueMedians(league.rosters);
  const analyses = league.rosters.map((r) => analyzeRoster(r, medians));

  const userAnalysis = analyses.find((a) => a.is_user);
  if (!userAnalysis) return [];

  const opponents = analyses.filter((a) => !a.is_user);
  const suggestions: TradeSuggestion[] = [];

  // ─── 1-for-1 balanced swaps ───
  for (const opp of opponents) {
    // Find positions where user has surplus and opponent has deficit, and vice versa
    for (const userSurplusPos of POSITIONS) {
      if (!userAnalysis.positions[userSurplusPos]?.surplus.length) continue;

      for (const oppSurplusPos of POSITIONS) {
        if (userSurplusPos === oppSurplusPos) continue;
        if (!opp.positions[oppSurplusPos]?.surplus.length) continue;

        // Check mutual need: user needs oppSurplusPos, opp needs userSurplusPos
        const userNeedsOppPos = userAnalysis.positions[oppSurplusPos]?.deficit;
        const oppNeedsUserPos = opp.positions[userSurplusPos]?.deficit;

        if (!userNeedsOppPos && !oppNeedsUserPos) continue;

        // Pick best surplus asset from each side
        const userGives = userAnalysis.positions[userSurplusPos].surplus[0];
        const oppGives = opp.positions[oppSurplusPos].surplus[0];

        if (!userGives || !oppGives) continue;
        // Skip low-value assets
        if (userGives.edge_score < 45 || oppGives.edge_score < 45) continue;

        const delta = userGives.edge_score - oppGives.edge_score;
        const fairness = tradeFairness(delta);
        if (fairness === "lopsided") continue;

        const mutualBenefit =
          (userNeedsOppPos ? oppGives.edge_score : 0) +
          (oppNeedsUserPos ? userGives.edge_score : 0);

        suggestions.push({
          team_a: {
            roster_id: userAnalysis.roster_id,
            display_name: userAnalysis.display_name,
            gives: [toEvaluatedAsset(userGives)],
            reason: userNeedsOppPos
              ? `Fills ${oppSurplusPos} need, surplus at ${userSurplusPos}`
              : `Trades ${userSurplusPos} depth for ${oppSurplusPos} upgrade`,
          },
          team_b: {
            roster_id: opp.roster_id,
            display_name: opp.display_name,
            gives: [toEvaluatedAsset(oppGives)],
            reason: oppNeedsUserPos
              ? `Fills ${userSurplusPos} need, surplus at ${oppSurplusPos}`
              : `Trades ${oppSurplusPos} depth for ${userSurplusPos} upgrade`,
          },
          mutual_benefit_score: mutualBenefit,
          fairness,
        });
      }
    }
  }

  // ─── 2-for-1 consolidation trades ───
  // User sends 2 lower-value assets to fill opponent needs, gets 1 high-value asset back
  for (const opp of opponents) {
    for (const oppSurplusPos of POSITIONS) {
      if (!opp.positions[oppSurplusPos]?.surplus.length) continue;
      if (!userAnalysis.positions[oppSurplusPos]?.deficit) continue;

      const oppGives = opp.positions[oppSurplusPos].surplus[0];
      if (!oppGives || oppGives.edge_score < 50) continue;

      // Find 2 user surplus assets from different positions that opponent needs
      const userSurplusAssets: CoreAsset[] = [];
      const usedPositions = new Set<string>();

      for (const pos of POSITIONS) {
        if (pos === oppSurplusPos) continue;
        if (!opp.positions[pos]?.deficit) continue;
        const surplus = userAnalysis.positions[pos]?.surplus;
        if (!surplus?.length) continue;

        const asset = surplus[0];
        if (asset.edge_score < 42) continue;
        if (!usedPositions.has(pos)) {
          userSurplusAssets.push(asset);
          usedPositions.add(pos);
        }
        if (userSurplusAssets.length >= 2) break;
      }

      if (userSurplusAssets.length < 2) continue;

      const userTotal = userSurplusAssets.reduce((s, a) => s + a.edge_score, 0);
      const delta = userTotal - oppGives.edge_score;
      // 2-for-1 should give slight overpay from sender side
      if (Math.abs(delta) > 15) continue;

      const mutualBenefit = oppGives.edge_score + userTotal * 0.5;

      suggestions.push({
        team_a: {
          roster_id: userAnalysis.roster_id,
          display_name: userAnalysis.display_name,
          gives: userSurplusAssets.map(toEvaluatedAsset),
          reason: `Consolidates depth to upgrade ${oppSurplusPos}`,
        },
        team_b: {
          roster_id: opp.roster_id,
          display_name: opp.display_name,
          gives: [toEvaluatedAsset(oppGives)],
          reason: `Gets ${[...usedPositions].join("+")} help, trades ${oppSurplusPos} surplus`,
        },
        mutual_benefit_score: mutualBenefit,
        fairness: tradeFairness(delta),
      });
    }
  }

  // Sort by mutual benefit, return top 15
  suggestions.sort((a, b) => b.mutual_benefit_score - a.mutual_benefit_score);
  return suggestions.slice(0, 15);
}
