import { db } from "../connection.js";
import { players_master } from "../schema.js";

export async function bulkUpsertPlayers(
  players: Array<{
    player_id: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
    position: string | null;
    team: string | null;
    status: string | null;
    age: number | null;
    years_exp: number | null;
    injury_status: string | null;
    injury_body_part: string | null;
    injury_start_date: string | null;
    injury_notes: string | null;
  }>
) {
  // Insert in batches of 500 to avoid overwhelming the DB
  const BATCH_SIZE = 500;

  for (let i = 0; i < players.length; i += BATCH_SIZE) {
    const batch = players.slice(i, i + BATCH_SIZE);
    await db
      .insert(players_master)
      .values(
        batch.map((p) => ({
          ...p,
          updated_at: Date.now(),
        }))
      )
      .onConflictDoUpdate({
        target: players_master.player_id,
        set: {
          full_name: players_master.full_name,
          first_name: players_master.first_name,
          last_name: players_master.last_name,
          position: players_master.position,
          team: players_master.team,
          status: players_master.status,
          age: players_master.age,
          years_exp: players_master.years_exp,
          injury_status: players_master.injury_status,
          injury_body_part: players_master.injury_body_part,
          injury_start_date: players_master.injury_start_date,
          injury_notes: players_master.injury_notes,
          updated_at: Date.now(),
        },
      });
  }
}
