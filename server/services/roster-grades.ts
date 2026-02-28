import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface PositionGrade {
  grade: string;
  starter_value: number;
  depth: number;
  flags: string[];
}

export interface LeagueGrades {
  league_id: string;
  league_name: string;
  total_rosters: number;
  grades: Record<string, PositionGrade>;
  overall_grade: string;
}

export interface RosterGradesResult {
  leagues: LeagueGrades[];
}

// Starter slots per position
const STARTER_SLOTS: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1 };
const POSITIONS = ["QB", "RB", "WR", "TE"];
const WEIGHTS: Record<string, number> = { QB: 0.2, RB: 0.3, WR: 0.3, TE: 0.2 };

function letterGrade(percentile: number): string {
  if (percentile >= 0.8) return "A";
  if (percentile >= 0.6) return "B";
  if (percentile >= 0.4) return "C";
  if (percentile >= 0.2) return "D";
  return "F";
}

function gradeToNum(g: string): number {
  return { A: 4, B: 3, C: 2, D: 1, F: 0 }[g] ?? 0;
}

function numToGrade(n: number): string {
  if (n >= 3.5) return "A";
  if (n >= 2.5) return "B";
  if (n >= 1.5) return "C";
  if (n >= 0.5) return "D";
  return "F";
}

function computeFlags(players: { value: number }[], pos: string, grade: string): string[] {
  const flags: string[] = [];
  const highValue = players.filter((p) => p.value >= 2000);
  const lowValue = players.filter((p) => p.value < 500);
  const slots = STARTER_SLOTS[pos] ?? 1;

  if (highValue.length >= slots + 3) flags.push("HOARDING");
  if (highValue.length <= 1 && players.length > 0) flags.push("ONE_DEEP");
  if (lowValue.length >= 3) flags.push("DEAD_WEIGHT");
  if (grade === "A" && players.length >= slots + 3) flags.push("SURPLUS");

  return flags;
}

// ─── Main Query ───

export async function getRosterGrades(username: string): Promise<RosterGradesResult> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return { leagues: [] };

  // Get user's current-season leagues only
  const leagueRows = await db.execute(sql`
    SELECT DISTINCT rp.league_id, l.name AS league_name, l.total_rosters
    FROM roster_players rp
    JOIN leagues l ON rp.league_id = l.league_id
    WHERE rp.owner_id = ${userId}
      AND l.season = (SELECT MAX(season) FROM leagues)
    ORDER BY l.name
  `);
  const leagues = leagueRows as unknown as {
    league_id: string;
    league_name: string;
    total_rosters: number;
  }[];

  if (leagues.length === 0) return { leagues: [] };

  // Build league_id IN clause dynamically
  const leagueIdFragments = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(leagueIdFragments, sql`, `);

  // Get ALL roster data for all teams in user's leagues
  const rosterRows = await db.execute(sql`
    SELECT
      rp.league_id,
      rp.owner_id,
      pm.position,
      COALESCE(fc.dynasty_value, 0)::int AS dynasty_value
    FROM roster_players rp
    JOIN players_master pm ON rp.player_id = pm.player_id
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pm.full_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    WHERE rp.league_id IN (${inClause})
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);

  type RosterRow = {
    league_id: string;
    owner_id: string;
    position: string;
    dynasty_value: number;
  };
  const rows = rosterRows as unknown as RosterRow[];

  // Group: league -> team -> position -> values[]
  const nested: Record<string, Record<string, Record<string, number[]>>> = {};
  for (const r of rows) {
    nested[r.league_id] ??= {};
    nested[r.league_id][r.owner_id] ??= {};
    nested[r.league_id][r.owner_id][r.position] ??= [];
    nested[r.league_id][r.owner_id][r.position].push(r.dynasty_value);
  }

  // Compute grades per league
  const result: LeagueGrades[] = [];

  for (const league of leagues) {
    const lid = league.league_id;
    const leagueTeams = nested[lid] ?? {};

    // For each position, compute starter_value for every team
    const posStarterValues: Record<string, Record<string, number>> = {};
    for (const pos of POSITIONS) {
      posStarterValues[pos] = {};
      for (const [teamId, positions] of Object.entries(leagueTeams)) {
        const vals = (positions[pos] ?? []).sort((a, b) => b - a);
        const slots = STARTER_SLOTS[pos];
        posStarterValues[pos][teamId] = vals.slice(0, slots).reduce((s, v) => s + v, 0);
      }
    }

    // Grade user's team by percentile rank
    const grades: Record<string, PositionGrade> = {};
    for (const pos of POSITIONS) {
      const allValues = Object.values(posStarterValues[pos]);
      const userValue = posStarterValues[pos][userId] ?? 0;
      const below = allValues.filter((v) => v < userValue).length;
      const equal = allValues.filter((v) => v === userValue).length;
      const percentile = allValues.length > 1
        ? (below + (equal - 1) / 2) / (allValues.length - 1)
        : 0.5;
      const grade = letterGrade(percentile);
      const userPlayers = (leagueTeams[userId]?.[pos] ?? []).sort((a, b) => b - a);
      const flags = computeFlags(
        userPlayers.map((v) => ({ value: v })),
        pos,
        grade
      );

      grades[pos] = {
        grade,
        starter_value: userValue,
        depth: userPlayers.length,
        flags,
      };
    }

    // Overall weighted grade
    let weightedSum = 0;
    for (const pos of POSITIONS) {
      weightedSum += gradeToNum(grades[pos].grade) * (WEIGHTS[pos] ?? 0);
    }

    result.push({
      league_id: lid,
      league_name: league.league_name,
      total_rosters: league.total_rosters ?? Object.keys(leagueTeams).length,
      grades,
      overall_grade: numToGrade(weightedSum),
    });
  }

  // Sort by overall grade descending
  result.sort((a, b) => gradeToNum(b.overall_grade) - gradeToNum(a.overall_grade));

  return { leagues: result };
}
