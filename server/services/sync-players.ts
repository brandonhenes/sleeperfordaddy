import { getAllPlayers } from "../sleeper/players.js";
import { bulkUpsertPlayers } from "../db/queries/players.js";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface PlayerSyncStats {
  total_players: number;
  team_changes: number;
  status_changes: number;
  new_players: number;
  duration_ms: number;
}

/**
 * Force-resync the full player universe from Sleeper's /players/nfl endpoint.
 * Unlike the main sync, this is not throttled and always fetches fresh data —
 * use when you need to pick up offseason FA/retirement updates immediately.
 */
export async function forceSyncPlayers(): Promise<PlayerSyncStats> {
  const t0 = Date.now();

  // Snapshot current state for diff
  const beforeRows = await db.execute(sql`
    SELECT player_id, team, status FROM players_master
  `);
  const before = new Map<string, { team: string | null; status: string | null }>();
  for (const r of beforeRows as unknown as { player_id: string; team: string | null; status: string | null }[]) {
    before.set(r.player_id, { team: r.team, status: r.status });
  }

  const playersData = await getAllPlayers();
  const playersList = Object.entries(playersData)
    .filter(([, p]) => p && typeof p === "object")
    .map(([playerId, p]) => {
      const raw = p as unknown as Record<string, unknown>;
      return {
        player_id: playerId,
        full_name: p.full_name ?? `${p.first_name} ${p.last_name}`,
        first_name: p.first_name,
        last_name: p.last_name,
        position: p.position,
        team: p.team,
        status: p.status ?? null,
        age: p.age ?? null,
        years_exp: null,
        injury_status: (typeof raw.injury_status === "string" ? raw.injury_status : null),
        injury_body_part: (typeof raw.injury_body_part === "string" ? raw.injury_body_part : null),
        injury_start_date: (typeof raw.injury_start_date === "string" ? raw.injury_start_date : null),
        injury_notes: (typeof raw.injury_notes === "string" ? raw.injury_notes : null),
      };
    });

  let teamChanges = 0;
  let statusChanges = 0;
  let newPlayers = 0;
  for (const p of playersList) {
    const prev = before.get(p.player_id);
    if (!prev) {
      newPlayers++;
      continue;
    }
    if ((prev.team ?? null) !== (p.team ?? null)) teamChanges++;
    if ((prev.status ?? null) !== (p.status ?? null)) statusChanges++;
  }

  await bulkUpsertPlayers(playersList);

  return {
    total_players: playersList.length,
    team_changes: teamChanges,
    status_changes: statusChanges,
    new_players: newPlayers,
    duration_ms: Date.now() - t0,
  };
}
