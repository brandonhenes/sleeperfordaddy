import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import type { SourceWeights } from "./edge-score.js";

export interface WaiverPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
  age: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  source_agreement: "high" | "medium" | "low";
  age_curve: AgeCurveStatus;
  hidden_gem: boolean;
}

function scoreAgreement(scores: (number | null)[]): "high" | "medium" | "low" {
  const v = scores.filter((s): s is number => s != null);
  if (v.length <= 1) return "high";
  const spread = Math.max(...v) - Math.min(...v);
  return spread < 5 ? "high" : spread <= 12 ? "medium" : "low";
}

export async function getWaiverWire(leagueId: string, weights?: SourceWeights): Promise<WaiverPlayer[]> {
  // Get all player IDs rostered in this league
  const rosteredRows = await db.execute(sql`
    SELECT DISTINCT rp.player_id
    FROM roster_players rp
    WHERE rp.league_id = ${leagueId}
  `);
  const rosteredIds = new Set(
    (rosteredRows as unknown as { player_id: string }[]).map((r) => r.player_id)
  );

  // Get all NFL-rostered skill players NOT on any roster in this league
  const freeRows = await db.execute(sql`
    SELECT pm.player_id, pm.full_name, pm.position, pm.team, pm.age
    FROM players_master pm
    WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
      AND pm.team IS NOT NULL
      AND pm.player_id NOT IN (
        SELECT rp.player_id FROM roster_players rp WHERE rp.league_id = ${leagueId}
      )
    ORDER BY pm.full_name
  `);

  type PR = { player_id: string; full_name: string; position: string; team: string; age: number | null };
  const players = freeRows as unknown as PR[];
  if (players.length === 0) return [];

  // Detect SF mode from league settings
  const leagueRow = await db.execute(sql`
    SELECT raw_json FROM leagues WHERE league_id = ${leagueId} LIMIT 1
  `);
  let mode: "sf" | "1qb" = "sf";
  try {
    const raw = (leagueRow as unknown as { raw_json: string | null }[])[0]?.raw_json;
    if (raw) {
      const parsed = JSON.parse(raw);
      const pos = parsed.roster_positions as string[] | undefined;
      if (pos && !pos.includes("SUPER_FLEX") && pos.filter((p: string) => p === "QB").length < 2) {
        mode = "1qb";
      }
    }
  } catch { /* default sf */ }

  const playerIds = players.map((p) => p.player_id);
  const compMap = await getCompositeValues(playerIds, mode, weights);

  const results: WaiverPlayer[] = [];
  for (const p of players) {
    const comp = compMap.get(p.player_id);
    if (!comp || comp.edge_score <= 0) continue;

    const ageCurve = getAgeCurveStatus(p.position, p.age);

    // Hidden gem: DP score significantly higher than KTC score (model loves, market doesn't)
    const hiddenGem =
      comp.dp_score != null &&
      comp.ktc_score != null &&
      comp.dp_score - comp.ktc_score >= 10;

    results.push({
      player_id: p.player_id,
      full_name: p.full_name,
      position: p.position,
      team: p.team,
      age: p.age,
      edge_score: comp.edge_score,
      fc_score: comp.fc_score ?? null,
      ktc_score: comp.ktc_score ?? null,
      dp_score: comp.dp_score ?? null,
      source_agreement: comp.source_agreement ?? scoreAgreement([comp.fc_score ?? null, comp.ktc_score ?? null, comp.dp_score ?? null]),
      age_curve: ageCurve,
      hidden_gem: hiddenGem,
    });
  }

  results.sort((a, b) => b.edge_score - a.edge_score);
  return results.slice(0, 50);
}
