import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { computeEdgeScores } from "./edge-score.js";

// ─── Types ───

export interface CompositeValue {
  sleeper_id: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
}

// ─── Helpers ───

function computeAgreement(scores: number[]): "high" | "medium" | "low" {
  if (scores.length <= 1) return "high";
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread < 5) return "high";
  if (spread <= 12) return "medium";
  return "low";
}

// ─── Main ───

export async function getCompositeValues(
  playerIds: string[],
  mode: "sf" | "1qb"
): Promise<Map<string, CompositeValue>> {
  const result = new Map<string, CompositeValue>();
  if (playerIds.length === 0) return result;

  const idFragments = playerIds.map((id) => sql`${id}`);
  const inClause = sql.join(idFragments, sql`, `);

  const rows = await db.execute(sql`
    SELECT
      pm.player_id AS sleeper_id,
      fc.dynasty_value AS fc_value,
      ktc.value_1qb AS ktc_1qb,
      ktc.value_sf AS ktc_sf,
      dp.value_1qb AS dp_1qb,
      dp.value_2qb AS dp_2qb
    FROM players_master pm
    LEFT JOIN fantasycalc_daily fc
      ON LOWER(pm.full_name) = LOWER(fc.player_name)
      AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
    LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
    LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
    WHERE pm.player_id IN (${inClause})
  `);

  type Row = {
    sleeper_id: string;
    fc_value: number | null;
    ktc_1qb: number | null;
    ktc_sf: number | null;
    dp_1qb: number | null;
    dp_2qb: number | null;
  };
  const rawRows = rows as unknown as Row[];

  // Build inputs for edge scoring
  const inputs = rawRows.map((r) => ({
    sleeper_id: r.sleeper_id,
    fc_value: r.fc_value ?? null,
    ktc_value: mode === "sf" ? (r.ktc_sf ?? null) : (r.ktc_1qb ?? null),
    dp_value: mode === "sf" ? (r.dp_2qb ?? null) : (r.dp_1qb ?? null),
  }));

  const edgeMap = computeEdgeScores(inputs);

  for (const inp of inputs) {
    const edge = edgeMap.get(inp.sleeper_id);
    const sourceScores = [edge?.fc_score, edge?.ktc_score, edge?.dp_score]
      .filter((s): s is number => s != null);

    result.set(inp.sleeper_id, {
      sleeper_id: inp.sleeper_id,
      fc_value: inp.fc_value,
      ktc_value: inp.ktc_value,
      dp_value: inp.dp_value,
      edge_score: edge?.score ?? 0,
      fc_score: edge?.fc_score ?? null,
      ktc_score: edge?.ktc_score ?? null,
      dp_score: edge?.dp_score ?? null,
      sources_available: edge?.sources_used ?? 0,
      source_agreement: computeAgreement(sourceScores),
    });
  }

  return result;
}
