import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { computeEdgeScores, sourceWeightsKey, type SourceWeights } from "./edge-score.js";

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

interface Scale {
  floor: number;
  max: number;
}

export interface GlobalScaleParams {
  fc: Scale;
  ktc: Scale;
  dp: Scale;
}

export type ValueType = "dynasty" | "redraft";

const GLOBAL_SCALE_TTL_MS = 10 * 60 * 1000;
const globalScaleCache = new Map<
  `${"sf" | "1qb"}:${ValueType}`,
  { value: GlobalScaleParams; expires: number }
>();
const globalScaleInFlight = new Map<
  `${"sf" | "1qb"}:${ValueType}`,
  Promise<GlobalScaleParams>
>();

export function clearGlobalScaleCache() {
  globalScaleCache.clear();
  globalScaleInFlight.clear();
}

// ─── Composite Universe Cache ───
// Caches composite values for the full QB/RB/WR/TE universe, keyed by
// (mode, valueType, weightsKey). Every getCompositeValues call is a slice.

const COMPOSITE_TTL_MS = 10 * 60 * 1000;
type UniverseKey = string; // `${mode}:${valueType}:${weightsKey}`
const universeCache = new Map<
  UniverseKey,
  { value: Map<string, CompositeValue>; expires: number }
>();
const universeInFlight = new Map<UniverseKey, Promise<Map<string, CompositeValue>>>();

function buildUniverseKey(mode: "sf" | "1qb", valueType: ValueType, weights?: SourceWeights): UniverseKey {
  return `${mode}:${valueType}:${sourceWeightsKey(weights)}`;
}

export function clearCompositeCache() {
  universeCache.clear();
  universeInFlight.clear();
}

// ─── Helpers ───

function computeAgreement(scores: number[]): "high" | "medium" | "low" {
  if (scores.length <= 1) return "high";
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread < 5) return "high";
  if (spread <= 12) return "medium";
  return "low";
}

function safeScale(floor: number | null, max: number | null): Scale {
  const m = max ?? 0;
  if (m <= 0) return { floor: 1, max: 2 };

  const f = floor != null && floor > 0 ? floor : 1;
  if (m <= f) return { floor: f, max: f + 1 };
  return { floor: f, max: m };
}

function isDpScaleUsable(scale: Scale): boolean {
  // DynastyProcess player values should be trade-value scale, not tiny rank-like numbers.
  return scale.max >= 100;
}

/**
 * Fetch global scale parameters from all QB/RB/WR/TE players.
 * This prevents score inflation when caller passes small subsets.
 */
export async function getGlobalScaleParams(
  mode: "sf" | "1qb",
  valueType: ValueType = "dynasty"
): Promise<GlobalScaleParams> {
  const cacheKey = `${mode}:${valueType}` as const;
  const now = Date.now();
  const hit = globalScaleCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.value;

  const pending = globalScaleInFlight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
    const fcColumn = valueType === "redraft"
      ? sql.raw("redraft_value")
      : sql.raw("dynasty_value");
    const [fcRows, marketRows] = await Promise.all([
      db.execute(sql`
        SELECT
          percentile_cont(0.05) WITHIN GROUP (ORDER BY ${fcColumn})
            FILTER (WHERE ${fcColumn} > 0)::real AS fc_floor,
          max(${fcColumn}) FILTER (WHERE ${fcColumn} > 0)::real AS fc_max
        FROM fantasycalc_daily
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
          AND is_pick = false
      `),
      mode === "sf"
        ? db.execute(sql`
            SELECT
              percentile_cont(0.05) WITHIN GROUP (ORDER BY ${valueType === "redraft" ? sql.raw("ktc.redraft_sf") : sql.raw("ktc.value_sf")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("ktc.redraft_sf") : sql.raw("ktc.value_sf")} > 0)::real AS ktc_floor,
              max(${valueType === "redraft" ? sql.raw("ktc.redraft_sf") : sql.raw("ktc.value_sf")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("ktc.redraft_sf") : sql.raw("ktc.value_sf")} > 0)::real AS ktc_max,
              percentile_cont(0.05) WITHIN GROUP (ORDER BY ${valueType === "redraft" ? sql.raw("dp.redraft_2qb") : sql.raw("dp.value_2qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("dp.redraft_2qb") : sql.raw("dp.value_2qb")} > 0)::real AS dp_floor,
              max(${valueType === "redraft" ? sql.raw("dp.redraft_2qb") : sql.raw("dp.value_2qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("dp.redraft_2qb") : sql.raw("dp.value_2qb")} > 0)::real AS dp_max
            FROM players_master pm
            LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
            LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
            WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
          `)
        : db.execute(sql`
            SELECT
              percentile_cont(0.05) WITHIN GROUP (ORDER BY ${valueType === "redraft" ? sql.raw("ktc.redraft_1qb") : sql.raw("ktc.value_1qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("ktc.redraft_1qb") : sql.raw("ktc.value_1qb")} > 0)::real AS ktc_floor,
              max(${valueType === "redraft" ? sql.raw("ktc.redraft_1qb") : sql.raw("ktc.value_1qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("ktc.redraft_1qb") : sql.raw("ktc.value_1qb")} > 0)::real AS ktc_max,
              percentile_cont(0.05) WITHIN GROUP (ORDER BY ${valueType === "redraft" ? sql.raw("dp.redraft_1qb") : sql.raw("dp.value_1qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("dp.redraft_1qb") : sql.raw("dp.value_1qb")} > 0)::real AS dp_floor,
              max(${valueType === "redraft" ? sql.raw("dp.redraft_1qb") : sql.raw("dp.value_1qb")})
                FILTER (WHERE ${valueType === "redraft" ? sql.raw("dp.redraft_1qb") : sql.raw("dp.value_1qb")} > 0)::real AS dp_max
            FROM players_master pm
            LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
            LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
            WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
          `),
    ]);

    const fc = (fcRows as unknown as {
      fc_floor: number | null;
      fc_max: number | null;
    }[])[0];
    const r = (marketRows as unknown as {
      fc_floor: number | null;
      fc_max: number | null;
      ktc_floor: number | null;
      ktc_max: number | null;
      dp_floor: number | null;
      dp_max: number | null;
    }[])[0];

    const value = {
      fc: safeScale(fc?.fc_floor ?? null, fc?.fc_max ?? null),
      ktc: safeScale(r?.ktc_floor ?? null, r?.ktc_max ?? null),
      dp: safeScale(r?.dp_floor ?? null, r?.dp_max ?? null),
    };
    globalScaleCache.set(cacheKey, { value, expires: Date.now() + GLOBAL_SCALE_TTL_MS });
    return value;
  })();

  globalScaleInFlight.set(cacheKey, work);
  try {
    return await work;
  } finally {
    globalScaleInFlight.delete(cacheKey);
  }
}

async function computeCompositeRuntime(
  playerIds: string[],
  mode: "sf" | "1qb",
  valueType: ValueType,
  weights?: SourceWeights
): Promise<Map<string, CompositeValue>> {
  const result = new Map<string, CompositeValue>();
  if (playerIds.length === 0) return result;

  const idFragments = playerIds.map((id) => sql`${id}`);
  const inClause = sql.join(idFragments, sql`, `);

  const fcColumn = valueType === "redraft" ? sql.raw("redraft_value") : sql.raw("dynasty_value");
  const ktc1qbColumn = valueType === "redraft" ? sql.raw("ktc.redraft_1qb") : sql.raw("ktc.value_1qb");
  const ktcSfColumn = valueType === "redraft" ? sql.raw("ktc.redraft_sf") : sql.raw("ktc.value_sf");
  const dp1qbColumn = valueType === "redraft" ? sql.raw("dp.redraft_1qb") : sql.raw("dp.value_1qb");
  const dp2qbColumn = valueType === "redraft" ? sql.raw("dp.redraft_2qb") : sql.raw("dp.value_2qb");

  const rows = await db.execute(sql`
    WITH latest_fc AS (
      SELECT player_name, sleeper_id, ${fcColumn} AS source_value
      FROM fantasycalc_daily
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        AND is_pick = false
    )
    SELECT
      pm.player_id AS sleeper_id,
      fc.source_value AS fc_value,
      ${ktc1qbColumn} AS ktc_1qb,
      ${ktcSfColumn} AS ktc_sf,
      ${dp1qbColumn} AS dp_1qb,
      ${dp2qbColumn} AS dp_2qb
    FROM players_master pm
    LEFT JOIN LATERAL (
      SELECT lf.source_value
      FROM latest_fc lf
      WHERE
        lf.sleeper_id = pm.player_id
        OR (
          (lf.sleeper_id IS NULL OR lf.sleeper_id = '')
          AND (
            LOWER(REGEXP_REPLACE(lf.player_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
              = LOWER(REGEXP_REPLACE(pm.full_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
            OR EXISTS (
              SELECT 1
              FROM player_aliases pa
              WHERE pa.player_id = pm.player_id
                AND LOWER(REGEXP_REPLACE(pa.alias, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
                  = LOWER(REGEXP_REPLACE(lf.player_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
            )
          )
        )
      ORDER BY
        CASE
          WHEN lf.sleeper_id = pm.player_id THEN 0
          WHEN LOWER(REGEXP_REPLACE(lf.player_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'))
             = LOWER(REGEXP_REPLACE(pm.full_name, '\\s+(Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i')) THEN 1
          ELSE 2
        END,
        lf.source_value DESC NULLS LAST
      LIMIT 1
    ) fc ON true
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
  const globalScale = await getGlobalScaleParams(mode, valueType);
  // If DP max is tiny, crosswalk coverage is bad and DP is on an incompatible scale.
  // Disable DP contribution to avoid inflated edge scores from low-value artifacts.
  const dpUsable = isDpScaleUsable(globalScale.dp);

  // Build inputs for edge scoring
  const inputs = rawRows.map((r) => ({
    sleeper_id: r.sleeper_id,
    fc_value: r.fc_value ?? null,
    ktc_value: mode === "sf" ? (r.ktc_sf ?? null) : (r.ktc_1qb ?? null),
    dp_value: dpUsable ? (mode === "sf" ? (r.dp_2qb ?? null) : (r.dp_1qb ?? null)) : null,
  }));

  const edgeMap = computeEdgeScores(
    inputs,
    dpUsable ? globalScale : { fc: globalScale.fc, ktc: globalScale.ktc },
    weights
  );

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

async function loadCompositeUniverse(
  mode: "sf" | "1qb",
  valueType: ValueType,
  weights?: SourceWeights
): Promise<Map<string, CompositeValue>> {
  const key = buildUniverseKey(mode, valueType, weights);
  const now = Date.now();
  const hit = universeCache.get(key);
  if (hit && hit.expires > now) return hit.value;

  const pending = universeInFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const rows = await db.execute(sql`
      SELECT player_id FROM players_master
      WHERE position IN ('QB', 'RB', 'WR', 'TE')
    `);
    const allIds = (rows as unknown as { player_id: string }[]).map((r) => r.player_id);
    const universe = await computeCompositeRuntime(allIds, mode, valueType, weights);
    universeCache.set(key, { value: universe, expires: Date.now() + COMPOSITE_TTL_MS });
    return universe;
  })();

  universeInFlight.set(key, work);
  try {
    return await work;
  } finally {
    universeInFlight.delete(key);
  }
}

// ─── Main ───

export async function getCompositeValues(
  playerIds: string[],
  mode: "sf" | "1qb",
  valueTypeOrWeights?: ValueType | SourceWeights,
  maybeWeights?: SourceWeights
): Promise<Map<string, CompositeValue>> {
  if (playerIds.length === 0) return new Map();
  const valueType = typeof valueTypeOrWeights === "string" ? valueTypeOrWeights : "dynasty";
  const weights = typeof valueTypeOrWeights === "string" ? maybeWeights : valueTypeOrWeights;

  const universe = await loadCompositeUniverse(mode, valueType, weights);

  const out = new Map<string, CompositeValue>();
  const missing: string[] = [];
  for (const id of playerIds) {
    const hit = universe.get(id);
    if (hit) out.set(id, hit);
    else missing.push(id);
  }

  // Fallback for IDs outside the QB/RB/WR/TE universe (picks, DEF, K, etc.)
  if (missing.length > 0) {
    const runtime = await computeCompositeRuntime(missing, mode, valueType, weights);
    for (const [id, val] of runtime) out.set(id, val);
  }

  return out;
}
