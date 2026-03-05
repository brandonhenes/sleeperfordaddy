import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { team_value_snapshots } from "../db/schema.js";
import { getCompositeValues } from "./composite-values.js";
import { classifyTeam, percentileRank } from "./archetypes.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

// ─── Helpers (mirrored from power-rankings.ts) ───

function countStarterSlots(pos: string[]): number {
  const bench = new Set(["BN", "IR", "TAXI"]);
  return pos.filter((p) => !bench.has(p)).length;
}

function detectSF(pos: string[]): boolean {
  if (pos.includes("SUPER_FLEX")) return true;
  return pos.filter((p) => p === "QB").length >= 2;
}

// ─── Main ───

/**
 * Capture one team_value_snapshot row per team per dynasty league.
 * Called at the end of each sync run.
 */
export async function captureTeamValueSnapshots(userId: string): Promise<void> {
  const dynastyLeagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (dynastyLeagueIds.length === 0) return;

  const idFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(idFrags, sql`, `);

  // Fetch all roster players with their positions
  const [rosterRows, ridRows, leagueRows] = await Promise.all([
    db.execute(sql`
      SELECT rp.league_id, rp.owner_id, rp.player_id, pm.position
      FROM roster_players rp
      JOIN players_master pm ON rp.player_id = pm.player_id
      WHERE rp.league_id IN (${inClause})
        AND pm.position IN ('QB', 'RB', 'WR', 'TE')
    `),
    db.execute(sql`
      SELECT league_id, owner_id, roster_id
      FROM rosters WHERE league_id IN (${inClause})
    `),
    db.execute(sql`
      SELECT league_id, raw_json FROM leagues
      WHERE league_id IN (${inClause})
    `),
  ]);

  type RR = { league_id: string; owner_id: string; player_id: string; position: string };
  type RID = { league_id: string; owner_id: string; roster_id: number };
  type LR = { league_id: string; raw_json: string | null };

  const rows = rosterRows as unknown as RR[];
  if (rows.length === 0) return;

  // Build roster_id map
  const ridMap = new Map<string, number>();
  for (const r of ridRows as unknown as RID[]) {
    ridMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  }

  // Parse league settings for starter slots + SF detection
  const leagueSettings = new Map<string, { sf: boolean; slots: number }>();
  for (const l of leagueRows as unknown as LR[]) {
    try {
      if (l.raw_json) {
        const parsed = JSON.parse(l.raw_json);
        const pos = parsed.roster_positions as string[] | undefined;
        if (pos) {
          leagueSettings.set(l.league_id, {
            sf: detectSF(pos),
            slots: countStarterSlots(pos),
          });
        }
      }
    } catch { /* skip */ }
  }

  // Get composite values for all players
  const allPlayerIds = [...new Set(rows.map((r) => r.player_id))];
  // Default to SF mode for consistent cross-league comparison
  const compMap = await getCompositeValues(allPlayerIds, "sf");

  // Group by league -> owner -> players
  const nested: Record<string, Record<string, string[]>> = {};
  for (const r of rows) {
    nested[r.league_id] ??= {};
    nested[r.league_id][r.owner_id] ??= [];
    nested[r.league_id][r.owner_id].push(r.player_id);
  }

  const today = new Date().toISOString().slice(0, 10);
  const snapshots: {
    league_id: string;
    roster_id: number;
    owner_id: string;
    snapshot_date: string;
    total_edge_score: number;
    starter_edge_score: number;
    draft_capital_edge: number;
    archetype: string;
  }[] = [];

  for (const [leagueId, teams] of Object.entries(nested)) {
    const { slots } = leagueSettings.get(leagueId) ?? { slots: 9 };
    const owners = Object.entries(teams);

    // Compute starter values for all teams in this league (needed for percentile ranking)
    const teamData = owners.map(([ownerId, playerIds]) => {
      const scores = playerIds
        .map((pid) => compMap.get(pid)?.edge_score ?? 0)
        .sort((a, b) => b - a);
      const totalEdge = scores.reduce((s, v) => s + v, 0);
      const starterEdge = scores.slice(0, slots).reduce((s, v) => s + v, 0);
      return { ownerId, totalEdge, starterEdge };
    });

    const allSV = teamData.map((t) => t.starterEdge);

    for (const t of teamData) {
      const rosterId = ridMap.get(`${leagueId}:${t.ownerId}`);
      if (rosterId == null) continue;

      const powerPct = percentileRank(allSV, t.starterEdge);
      const { archetype } = classifyTeam(powerPct, 50, 50);

      snapshots.push({
        league_id: leagueId,
        roster_id: rosterId,
        owner_id: t.ownerId,
        snapshot_date: today,
        total_edge_score: Math.round(t.totalEdge * 10) / 10,
        starter_edge_score: Math.round(t.starterEdge * 10) / 10,
        draft_capital_edge: 0,
        archetype,
      });
    }
  }

  if (snapshots.length === 0) return;

  // Batch upsert
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    await db
      .insert(team_value_snapshots)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          team_value_snapshots.league_id,
          team_value_snapshots.roster_id,
          team_value_snapshots.snapshot_date,
        ],
        set: {
          owner_id: sql`excluded.owner_id`,
          total_edge_score: sql`excluded.total_edge_score`,
          starter_edge_score: sql`excluded.starter_edge_score`,
          draft_capital_edge: sql`excluded.draft_capital_edge`,
          archetype: sql`excluded.archetype`,
        },
      });
  }

  console.log(`[sync] Captured team value snapshots for ${snapshots.length} teams`);
}
