import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

// ─── Types ───

export interface CompositeValue {
  sleeper_id: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  fc_norm: number | null;
  ktc_norm: number | null;
  dp_norm: number | null;
  composite_value: number;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
}

// ─── Helpers ───

function computeAgreement(values: number[]): "high" | "medium" | "low" {
  if (values.length <= 1) return "high";
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return "high";
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.15) return "high";
  if (cv <= 0.30) return "medium";
  return "low";
}

// ─── Main ───

export async function getCompositeValues(
  playerIds: string[],
  mode: "sf" | "1qb"
): Promise<Map<string, CompositeValue>> {
  const result = new Map<string, CompositeValue>();
  if (playerIds.length === 0) return result;

  // Build IN clause
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

  // Find max values for normalization
  let fcMax = 0, ktcMax = 0, dpMax = 0;
  for (const r of rawRows) {
    const fc = r.fc_value ?? 0;
    const ktc = mode === "sf" ? (r.ktc_sf ?? 0) : (r.ktc_1qb ?? 0);
    const dp = mode === "sf" ? (r.dp_2qb ?? 0) : (r.dp_1qb ?? 0);
    if (fc > fcMax) fcMax = fc;
    if (ktc > ktcMax) ktcMax = ktc;
    if (dp > dpMax) dpMax = dp;
  }

  for (const r of rawRows) {
    const fcRaw = r.fc_value ?? null;
    const ktcRaw = mode === "sf" ? (r.ktc_sf ?? null) : (r.ktc_1qb ?? null);
    const dpRaw = mode === "sf" ? (r.dp_2qb ?? null) : (r.dp_1qb ?? null);

    // Normalize to 0-10000
    const fcNorm = fcRaw != null && fcMax > 0 ? Math.round((fcRaw / fcMax) * 10000) : null;
    const ktcNorm = ktcRaw != null && ktcMax > 0 ? Math.round((ktcRaw / ktcMax) * 10000) : null;
    const dpNorm = dpRaw != null && dpMax > 0 ? Math.round((dpRaw / dpMax) * 10000) : null;

    const normValues = [fcNorm, ktcNorm, dpNorm].filter((v): v is number => v != null);
    const sourcesAvailable = normValues.length;
    const composite = sourcesAvailable > 0
      ? Math.round(normValues.reduce((s, v) => s + v, 0) / sourcesAvailable)
      : 0;

    result.set(r.sleeper_id, {
      sleeper_id: r.sleeper_id,
      fc_value: fcRaw,
      ktc_value: ktcRaw,
      dp_value: dpRaw,
      fc_norm: fcNorm,
      ktc_norm: ktcNorm,
      dp_norm: dpNorm,
      composite_value: composite,
      sources_available: sourcesAvailable,
      source_agreement: computeAgreement(normValues),
    });
  }

  return result;
}
