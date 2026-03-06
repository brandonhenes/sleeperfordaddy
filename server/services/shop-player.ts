import { getPowerRankings, type LeaguePowerRanking, type RosterRanking, type CoreAsset } from "./power-rankings.js";
import type { ShopPlayerResult, ShopOpportunity, EvaluatedAsset } from "../../shared/types.js";

// ─── Constants ───

/** How much each archetype values each asset type (players vs picks, win-now vs youth) */
const ARCHETYPE_BUY_MOTIVATION: Record<string, { wants_vets: number; wants_youth: number; wants_picks: number }> = {
  "Dynasty Juggernaut": { wants_vets: 30, wants_youth: 60, wants_picks: 20 },
  "All-In Contender":   { wants_vets: 90, wants_youth: 30, wants_picks: 10 },
  "Fragile Contender":  { wants_vets: 70, wants_youth: 80, wants_picks: 20 },
  "Productive Struggle": { wants_vets: 20, wants_youth: 70, wants_picks: 90 },
  "Rebuilder":          { wants_vets: 10, wants_youth: 80, wants_picks: 95 },
  "Dead Zone":          { wants_vets: 50, wants_youth: 60, wants_picks: 50 },
  "Competitor":         { wants_vets: 60, wants_youth: 50, wants_picks: 40 },
};

/** What each user archetype WANTS to receive back */
const ARCHETYPE_RECEIVE_PREF: Record<string, { prefer_youth: boolean; prefer_proven: boolean; prefer_picks: boolean }> = {
  "Dynasty Juggernaut": { prefer_youth: true, prefer_proven: false, prefer_picks: false },
  "All-In Contender":   { prefer_youth: false, prefer_proven: true, prefer_picks: false },
  "Fragile Contender":  { prefer_youth: true, prefer_proven: true, prefer_picks: false },
  "Productive Struggle": { prefer_youth: true, prefer_proven: false, prefer_picks: true },
  "Rebuilder":          { prefer_youth: true, prefer_proven: false, prefer_picks: true },
  "Dead Zone":          { prefer_youth: true, prefer_proven: true, prefer_picks: true },
  "Competitor":         { prefer_youth: false, prefer_proven: true, prefer_picks: false },
};

const POSITIONS = ["QB", "RB", "WR", "TE"];
const MIN_STARTERS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

// ─── Helpers ───

function toEvaluatedAsset(a: CoreAsset): EvaluatedAsset {
  return {
    player_id: a.player_id,
    position: a.position,
    label: a.full_name,
    edge_score: a.edge_score,
    fc_score: a.fc_score,
    ktc_score: a.ktc_score,
    dp_score: a.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: a.source_agreement,
  };
}

function tradeFairness(delta: number): "fair" | "slight_edge" | "lopsided" {
  const abs = Math.abs(delta);
  if (abs <= 4) return "fair";
  if (abs <= 10) return "slight_edge";
  return "lopsided";
}

function gradeLabel(avg: number): string {
  if (avg >= 88) return "elite";
  if (avg >= 78) return "strong";
  if (avg >= 68) return "average";
  if (avg >= 55) return "weak";
  return "hole";
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scoreBuyerMotivation(
  opponent: RosterRanking,
  player: CoreAsset,
  leagueMedians: Record<string, number>
): { score: number; reason: string } {
  const prefs = ARCHETYPE_BUY_MOTIVATION[opponent.archetype] ?? ARCHETYPE_BUY_MOTIVATION["Competitor"];

  const posPlayers = opponent.core_assets
    .filter((a) => a.position === player.position)
    .sort((a, b) => b.edge_score - a.edge_score);
  const aboveMedian = posPlayers.filter((p) => p.edge_score > (leagueMedians[player.position] ?? 60));
  const minNeeded = MIN_STARTERS[player.position] ?? 1;
  const isNeed = aboveMedian.length < minNeeded;
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
  reasons.push(opponent.archetype);

  return { score, reason: reasons.join(", ") };
}

function scoreSourceEdge(asset: CoreAsset): { score: number; description: string | null } {
  const expertScores = [asset.fc_score, asset.dp_score].filter((s): s is number => s != null);
  if (asset.ktc_score == null || expertScores.length === 0) {
    return { score: 50, description: null };
  }
  const expertAvg = expertScores.reduce((a, b) => a + b, 0) / expertScores.length;
  const diff = expertAvg - asset.ktc_score;

  if (diff <= 0) {
    return { score: Math.max(10, 50 + Math.round(diff * 2)), description: null };
  }

  const score = Math.min(100, 50 + Math.round(diff * 5));
  return {
    score,
    description: `${asset.full_name}: crowd at ${asset.ktc_score}, experts at ${Math.round(expertAvg)}`,
  };
}

function scoreWindowMatch(
  userArchetype: string,
  returnAsset: CoreAsset
): { score: number; description: string } {
  const prefs = ARCHETYPE_RECEIVE_PREF[userArchetype] ?? ARCHETYPE_RECEIVE_PREF["Competitor"];
  const isYoung = (returnAsset.age ?? 25) <= 25;
  const isProven = returnAsset.edge_score >= 70 && (returnAsset.age ?? 25) >= 26;

  let score = 50;
  const reasons: string[] = [];

  if (isYoung && prefs.prefer_youth) {
    score += 25;
    reasons.push(`Young ${returnAsset.position} fits your ${userArchetype.toLowerCase()} timeline`);
  }
  if (isProven && prefs.prefer_proven) {
    score += 25;
    reasons.push(`Proven producer at ${returnAsset.position} helps you compete now`);
  }
  if (!isYoung && !isProven) {
    reasons.push(`${returnAsset.position} depth piece`);
  }

  return { score: Math.min(100, score), description: reasons[0] ?? "Positional value" };
}

function computeRosterImpact(
  userRoster: RosterRanking,
  tradedAway: CoreAsset,
  received: CoreAsset
): ShopOpportunity["roster_impact"] {
  const grades = userRoster.lineup?.slot_grades ?? [];
  const gradeMap = new Map(grades.map((g) => [g.slot_label, g]));

  const tradedPos = tradedAway.position;
  const receivedPos = received.position;

  const tradedGrade = gradeMap.get(tradedPos);
  const receivedGrade = gradeMap.get(receivedPos);

  const gradeBefore = tradedGrade?.grade ?? "hole";
  let gradeAfter = gradeBefore;
  if (tradedGrade && tradedAway.edge_score >= tradedGrade.avg_score) {
    const tiers = ["elite", "strong", "average", "weak", "hole"];
    const idx = tiers.indexOf(gradeBefore);
    gradeAfter = tiers[Math.min(idx + 1, tiers.length - 1)];
  }

  const gainBefore = receivedGrade?.grade ?? "hole";
  let gainAfter = gainBefore;
  if (receivedGrade && received.edge_score > receivedGrade.avg_score) {
    const tiers = ["elite", "strong", "average", "weak", "hole"];
    const idx = tiers.indexOf(gainBefore);
    gainAfter = tiers[Math.max(idx - 1, 0)];
  } else if (!receivedGrade || receivedGrade.avg_score === 0) {
    gainAfter = gradeLabel(received.edge_score);
  }

  const parts: string[] = [];
  if (gradeBefore !== gradeAfter) {
    parts.push(`${tradedPos} ${gradeBefore}\u2192${gradeAfter}`);
  }
  if (gainBefore !== gainAfter) {
    parts.push(`${receivedPos} ${gainBefore}\u2192${gainAfter}`);
  }

  return {
    position_traded: tradedPos,
    grade_before: gradeBefore,
    grade_after: gradeAfter,
    position_gained: receivedPos,
    gain_grade_before: gainBefore,
    gain_grade_after: gainAfter,
    net_summary: parts.length > 0 ? parts.join(", ") : "Minimal roster impact",
  };
}

// ─── Main ───

export async function shopPlayer(
  username: string,
  playerId: string
): Promise<ShopPlayerResult | null> {
  const allLeagues = await getPowerRankings(username);
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

  const firstAsset = leaguesWithPlayer[0].playerAsset;
  const opportunities: ShopOpportunity[] = [];

  for (const { league, userRoster, playerAsset } of leaguesWithPlayer) {
    const medians: Record<string, number> = {};
    for (const pos of POSITIONS) {
      const allScores: number[] = [];
      for (const r of league.rosters) {
        const top = r.core_assets
          .filter((a) => a.position === pos)
          .sort((a, b) => b.edge_score - a.edge_score)
          .slice(0, (MIN_STARTERS[pos] ?? 1) + 1);
        allScores.push(...top.map((a) => a.edge_score));
      }
      medians[pos] = median(allScores);
    }

    const opponents = league.rosters.filter((r) => !r.is_user);

    for (const opp of opponents) {
      const motivation = scoreBuyerMotivation(opp, playerAsset, medians);
      if (motivation.score < 25) continue;

      const candidateReturns = opp.core_assets
        .filter((a) =>
          a.position !== playerAsset.position &&
          a.edge_score >= 45 &&
          POSITIONS.includes(a.position)
        )
        .sort((a, b) => b.edge_score - a.edge_score);

      if (candidateReturns.length === 0) continue;

      let bestReturn: CoreAsset | null = null;
      let bestComposite = -1;
      let bestSourceEdge = { score: 50, description: null as string | null };
      let bestWindowMatch = { score: 50, description: "Positional value" };
      let bestImpact: ShopOpportunity["roster_impact"] | null = null;

      for (const candidate of candidateReturns.slice(0, 8)) {
        const delta = playerAsset.edge_score - candidate.edge_score;
        if (Math.abs(delta) > 15) continue;

        const srcEdge = scoreSourceEdge(candidate);
        const winMatch = scoreWindowMatch(userRoster.archetype, candidate);
        const impact = computeRosterImpact(userRoster, playerAsset, candidate);

        let impactScore = 50;
        const tiers = ["hole", "weak", "average", "strong", "elite"];
        const gainJump = tiers.indexOf(impact.gain_grade_after) - tiers.indexOf(impact.gain_grade_before);
        const lossJump = tiers.indexOf(impact.grade_before) - tiers.indexOf(impact.grade_after);
        impactScore = Math.min(100, Math.max(0, 50 + (gainJump * 15) - (lossJump * 10)));

        const composite = (
          motivation.score * 0.25 +
          srcEdge.score * 0.20 +
          winMatch.score * 0.20 +
          impactScore * 0.25 +
          (delta > 0 && delta <= 6 ? 10 : 0)
        );

        if (composite > bestComposite) {
          bestComposite = composite;
          bestReturn = candidate;
          bestSourceEdge = srcEdge;
          bestWindowMatch = winMatch;
          bestImpact = impact;
        }
      }

      if (!bestReturn || !bestImpact) continue;

      const delta = playerAsset.edge_score - bestReturn.edge_score;

      opportunities.push({
        league_id: league.league_id,
        league_name: league.league_name,
        league_mode: league.mode,
        your_archetype: userRoster.archetype,
        opportunity_score: Math.round(bestComposite),

        you_send: toEvaluatedAsset(playerAsset),
        you_receive: [toEvaluatedAsset(bestReturn)],
        from_team: opp.display_name,
        from_archetype: opp.archetype,

        buyer_motivation: motivation.reason,
        motivation_score: motivation.score,

        source_edge: bestSourceEdge.description,
        source_edge_score: bestSourceEdge.score,

        window_match: bestWindowMatch.description,
        window_score: bestWindowMatch.score,

        roster_impact: bestImpact,

        fairness: tradeFairness(delta),
        delta,
      });
    }
  }

  // Layer 5: Cross-league arbitrage — keep best per league, rank by score
  const bestPerLeague = new Map<string, ShopOpportunity>();
  for (const opp of opportunities) {
    const existing = bestPerLeague.get(opp.league_id);
    if (!existing || opp.opportunity_score > existing.opportunity_score) {
      bestPerLeague.set(opp.league_id, opp);
    }
  }

  const ranked = [...bestPerLeague.values()]
    .sort((a, b) => b.opportunity_score - a.opportunity_score);

  return {
    player_id: playerId,
    player_name: firstAsset.full_name,
    position: firstAsset.position,
    edge_score: firstAsset.edge_score,
    leagues_owned: leaguesWithPlayer.length,
    opportunities: ranked,
  };
}
