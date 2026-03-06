import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getPowerRankings } from "./power-rankings.js";
import { getProspects } from "./market.js";

export interface MockDraftSetup {
  league_id: string;
  league_name: string;
  league_mode: "sf" | "1qb";
  total_rosters: number;
  draft_rounds: number;
  scoring_label: string;
  teams: MockDraftTeam[];
  prospects: MockDraftProspect[];
}

export interface MockDraftTeam {
  roster_id: number;
  display_name: string;
  is_user: boolean;
  archetype: string;
  draft_position: number;
  needs: MockDraftNeed[];
}

export interface MockDraftNeed {
  position: string;
  urgency: number;
  grade: string;
}

export interface MockDraftProspect {
  player_name: string;
  position: string;
  school: string | null;
  tier: string;
  positional_rank: number;
  overall_rank: number;
  consensus_comp: string | null;
  age: number | null;
}

export interface MockDraftPick {
  pick_number: number;
  round: number;
  pick_in_round: number;
  roster_id: number;
  display_name: string;
  is_user: boolean;
  selected_player: string | null;
  selected_position: string | null;
  is_auto: boolean;
  reasoning: string | null;
}

function scoreFit(
  prospect: MockDraftProspect,
  team: MockDraftTeam,
  mode: "sf" | "1qb",
): number {
  let score = Math.max(0, 150 - prospect.overall_rank);
  const need = team.needs.find((n) => n.position === prospect.position);

  if (need) {
    score += need.urgency * 2;
    if (need.grade === "hole") score += 50;
    else if (need.grade === "weak") score += 25;
  }

  if (prospect.tier === "elite") score += 60;
  else if (prospect.tier === "day1") score += 30;
  else if (prospect.tier === "day2") score += 10;

  if (mode === "sf" && prospect.position === "QB") score += 20;

  if (team.archetype === "Rebuilder" || team.archetype === "Productive Struggle") {
    score += Math.max(0, 100 - prospect.overall_rank) * 0.5;
  }
  if (team.archetype.includes("Contender") || team.archetype === "Dynasty Juggernaut") {
    if (need && need.urgency > 50) score += 30;
  }

  return score;
}

function aiPick(
  available: MockDraftProspect[],
  team: MockDraftTeam,
  mode: "sf" | "1qb",
): { prospect: MockDraftProspect; reasoning: string } | null {
  if (available.length === 0) return null;
  const scored = available
    .map((p) => ({ prospect: p, score: scoreFit(p, team, mode) }))
    .sort((a, b) => b.score - a.score);
  const pick = scored[0];
  const need = team.needs.find((n) => n.position === pick.prospect.position);
  const reasoning =
    need && (need.grade === "hole" || need.grade === "weak")
      ? `Fills ${pick.prospect.position} need (${need.grade}). ${pick.prospect.tier.toUpperCase()} tier, ${pick.prospect.position}${pick.prospect.positional_rank}.`
      : `Best available talent. ${pick.prospect.tier.toUpperCase()} tier, ${pick.prospect.position}${pick.prospect.positional_rank}.`;
  return { prospect: pick.prospect, reasoning };
}

export async function getMockDraftSetup(
  username: string,
  leagueId: string,
): Promise<MockDraftSetup | null> {
  const allLeagues = await getPowerRankings(username);
  const league = allLeagues.find((l) => l.league_id === leagueId);
  if (!league) return null;

  type DORow = { roster_id: number; draft_position: number };
  const orderRows = (await db.execute(sql`
    SELECT d.roster_id, d.draft_position
    FROM league_draft_orders d
    WHERE d.league_id = ${leagueId} AND d.season = '2026'
    ORDER BY d.draft_position ASC
  `)) as unknown as DORow[];

  const teams: MockDraftTeam[] = league.rosters.map((roster) => {
    const orderEntry = orderRows.find((d) => d.roster_id === roster.roster_id);
    const draftPos = orderEntry?.draft_position ?? roster.roster_id;
    const posGrades = new Map<string, { worst: string; urgency: number }>();
    const gradeOrder = ["hole", "weak", "average", "strong", "elite"];
    const urgencyMap: Record<string, number> = {
      hole: 90,
      weak: 65,
      average: 35,
      strong: 15,
      elite: 5,
    };

    for (const sg of roster.lineup?.slot_grades ?? []) {
      if (!["QB", "RB", "WR", "TE"].includes(sg.slot_label)) continue;
      const existing = posGrades.get(sg.slot_label);
      if (!existing || gradeOrder.indexOf(sg.grade) < gradeOrder.indexOf(existing.worst)) {
        posGrades.set(sg.slot_label, {
          worst: sg.grade,
          urgency: urgencyMap[sg.grade] ?? 35,
        });
      }
    }

    const needs = [...posGrades.entries()]
      .map(([position, data]) => ({ position, urgency: data.urgency, grade: data.worst }))
      .sort((a, b) => b.urgency - a.urgency);

    return {
      roster_id: roster.roster_id,
      display_name: roster.display_name,
      is_user: roster.is_user,
      archetype: roster.archetype,
      draft_position: draftPos,
      needs,
    };
  });

  teams.sort((a, b) => a.draft_position - b.draft_position);

  const rawProspects = await getProspects();
  const tierOrder: Record<string, number> = { elite: 0, day1: 1, day2: 2, day3: 3, flier: 4 };
  const sorted = [...rawProspects].sort((a, b) => {
    const ta = tierOrder[(a.tier ?? "flier").toLowerCase()] ?? 4;
    const tb = tierOrder[(b.tier ?? "flier").toLowerCase()] ?? 4;
    if (ta !== tb) return ta - tb;
    return (a.fp_rank ?? a.fantasypros_rank ?? 999) - (b.fp_rank ?? b.fantasypros_rank ?? 999);
  });

  const prospects: MockDraftProspect[] = sorted.map((p, i) => ({
    player_name: p.player_name,
    position: p.position ?? "?",
    school: p.school,
    tier: (p.tier ?? "flier").toLowerCase(),
    positional_rank: p.fp_rank ?? p.fantasypros_rank ?? 99,
    overall_rank: i + 1,
    consensus_comp: p.consensus_comp ?? (p.all_comps?.[0]?.comp ?? null),
    age: p.age,
  }));

  const leagueRows = (await db.execute(sql`
    SELECT draft_rounds FROM leagues WHERE league_id = ${leagueId} LIMIT 1
  `)) as unknown as Array<{ draft_rounds: number | null }>;
  const draftRounds = leagueRows[0]?.draft_rounds ?? 4;

  return {
    league_id: leagueId,
    league_name: league.league_name,
    league_mode: league.mode,
    total_rosters: teams.length,
    draft_rounds: Math.min(draftRounds, 4),
    scoring_label: league.scoring_label ?? "",
    teams,
    prospects,
  };
}

export function simulatePick(
  setup: MockDraftSetup,
  pickNumber: number,
  alreadyPicked: string[],
): MockDraftPick | null {
  const totalPicks = setup.total_rosters * setup.draft_rounds;
  if (pickNumber > totalPicks) return null;
  const round = Math.ceil(pickNumber / setup.total_rosters);
  const pickInRound = ((pickNumber - 1) % setup.total_rosters) + 1;
  const team = setup.teams[(pickInRound - 1) % setup.teams.length];
  if (!team) return null;
  const available = setup.prospects.filter((p) => !alreadyPicked.includes(p.player_name));

  if (team.is_user) {
    return {
      pick_number: pickNumber,
      round,
      pick_in_round: pickInRound,
      roster_id: team.roster_id,
      display_name: team.display_name,
      is_user: true,
      selected_player: null,
      selected_position: null,
      is_auto: false,
      reasoning: null,
    };
  }

  const result = aiPick(available, team, setup.league_mode);
  if (!result) return null;
  return {
    pick_number: pickNumber,
    round,
    pick_in_round: pickInRound,
    roster_id: team.roster_id,
    display_name: team.display_name,
    is_user: false,
    selected_player: result.prospect.player_name,
    selected_position: result.prospect.position,
    is_auto: true,
    reasoning: result.reasoning,
  };
}
