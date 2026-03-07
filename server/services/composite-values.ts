import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { computeEdgeScores, type SourceWeights } from "./edge-score.js";

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

const GLOBAL_SCALE_TTL_MS = 10 * 60 * 1000;
const globalScaleCache = new Map<
  "sf" | "1qb",
  { value: GlobalScaleParams; expires: number }
>();
const globalScaleInFlight = new Map<"sf" | "1qb", Promise<GlobalScaleParams>>();

export function clearGlobalScaleCache() {
  globalScaleCache.clear();
  globalScaleInFlight.clear();
}

// ─── Helpers ───

function computeAgreement(scores: number[]): "high" | "medium" | "low" {
  if (scores.length <= 1) return "high";
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread < 5) return "high";
  if (spread <= 12) return "medium";
  return "low";
}

function normalizeAgreement(value: string | null | undefined): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
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
  mode: "sf" | "1qb"
): Promise<GlobalScaleParams> {
  const now = Date.now();
  const hit = globalScaleCache.get(mode);
  if (hit && hit.expires > now) return hit.value;

  const pending = globalScaleInFlight.get(mode);
  if (pending) return pending;

  const work = (async () => {
    const rows = mode === "sf"
    ? await db.execute(sql`
        SELECT
          percentile_cont(0.05) WITHIN GROUP (ORDER BY fc.dynasty_value)
            FILTER (WHERE fc.dynasty_value > 0)::real AS fc_floor,
          max(fc.dynasty_value) FILTER (WHERE fc.dynasty_value > 0)::real AS fc_max,
          percentile_cont(0.05) WITHIN GROUP (ORDER BY ktc.value_sf)
            FILTER (WHERE ktc.value_sf > 0)::real AS ktc_floor,
          max(ktc.value_sf) FILTER (WHERE ktc.value_sf > 0)::real AS ktc_max,
          percentile_cont(0.05) WITHIN GROUP (ORDER BY dp.value_2qb)
            FILTER (WHERE dp.value_2qb > 0)::real AS dp_floor,
          max(dp.value_2qb) FILTER (WHERE dp.value_2qb > 0)::real AS dp_max
        FROM players_master pm
        LEFT JOIN fantasycalc_daily fc
          ON fc.sleeper_id = pm.player_id
          AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
        LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
        WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
      `)
    : await db.execute(sql`
        SELECT
          percentile_cont(0.05) WITHIN GROUP (ORDER BY fc.dynasty_value)
            FILTER (WHERE fc.dynasty_value > 0)::real AS fc_floor,
          max(fc.dynasty_value) FILTER (WHERE fc.dynasty_value > 0)::real AS fc_max,
          percentile_cont(0.05) WITHIN GROUP (ORDER BY ktc.value_1qb)
            FILTER (WHERE ktc.value_1qb > 0)::real AS ktc_floor,
          max(ktc.value_1qb) FILTER (WHERE ktc.value_1qb > 0)::real AS ktc_max,
          percentile_cont(0.05) WITHIN GROUP (ORDER BY dp.value_1qb)
            FILTER (WHERE dp.value_1qb > 0)::real AS dp_floor,
          max(dp.value_1qb) FILTER (WHERE dp.value_1qb > 0)::real AS dp_max
        FROM players_master pm
        LEFT JOIN fantasycalc_daily fc
          ON fc.sleeper_id = pm.player_id
          AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        LEFT JOIN ktc_values ktc ON ktc.sleeper_id = pm.player_id
        LEFT JOIN dynastyprocess_values dp ON dp.sleeper_id = pm.player_id
        WHERE pm.position IN ('QB', 'RB', 'WR', 'TE')
      `);

    const r = (rows as unknown as {
      fc_floor: number | null;
      fc_max: number | null;
      ktc_floor: number | null;
      ktc_max: number | null;
      dp_floor: number | null;
      dp_max: number | null;
    }[])[0];

    const value = {
      fc: safeScale(r?.fc_floor ?? null, r?.fc_max ?? null),
      ktc: safeScale(r?.ktc_floor ?? null, r?.ktc_max ?? null),
      dp: safeScale(r?.dp_floor ?? null, r?.dp_max ?? null),
    };
    globalScaleCache.set(mode, { value, expires: Date.now() + GLOBAL_SCALE_TTL_MS });
    return value;
  })();

  globalScaleInFlight.set(mode, work);
  try {
    return await work;
  } finally {
    globalScaleInFlight.delete(mode);
  }
}

async function getSnapshotAsOfDate(): Promise<string | null> {
  try {
    const ready = await db.execute(sql`
      SELECT as_of_date::text AS as_of_date
      FROM score_snapshot_meta
      WHERE status = 'ready'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const asOf = (ready as unknown as { as_of_date: string }[])[0]?.as_of_date;
    return asOf ?? null;
  } catch {
    return null;
  }
}

async function readFromDailySnapshot(
  playerIds: string[],
  mode: "sf" | "1qb"
): Promise<Map<string, CompositeValue> | null> {
  const asOfDate = await getSnapshotAsOfDate();
  if (!asOfDate || playerIds.length === 0) return null;
  const globalScale = await getGlobalScaleParams(mode);
  const dpUsable = isDpScaleUsable(globalScale.dp);

  try {
    const idFragments = playerIds.map((id) => sql`${id}`);
    const inClause = sql.join(idFragments, sql`, `);

    const rows = await db.execute(sql`
      SELECT
        player_id AS sleeper_id,
        fc_value,
        ktc_value,
        dp_value,
        ROUND(edge_score::numeric, 1)::real AS edge_score,
        ROUND(fc_score::numeric, 1)::real AS fc_score,
        ROUND(ktc_score::numeric, 1)::real AS ktc_score,
        ROUND(dp_score::numeric, 1)::real AS dp_score,
        sources_used::int AS sources_used,
        source_agreement
      FROM player_scores_daily
      WHERE as_of_date = ${asOfDate}::date
        AND mode = ${mode}
        AND player_id IN (${inClause})
    `);

    type SnapshotRow = {
      sleeper_id: string;
      fc_value: number | null;
      ktc_value: number | null;
      dp_value: number | null;
      edge_score: number | null;
      fc_score: number | null;
      ktc_score: number | null;
      dp_score: number | null;
      sources_used: number | null;
      source_agreement: string | null;
    };
    const snapshotRows = rows as unknown as SnapshotRow[];
    if (snapshotRows.length === 0) return new Map();

    const out = new Map<string, CompositeValue>();
    for (const r of snapshotRows) {
      const fcScore = r.fc_score;
      const ktcScore = r.ktc_score;
      const dpScore = dpUsable ? r.dp_score : null;
      const srcScores = [fcScore, ktcScore, dpScore].filter(
        (s): s is number => s != null
      );
      const edgeScore = srcScores.length > 0
        ? Math.round((srcScores.reduce((sum, score) => sum + score, 0) / srcScores.length) * 10) / 10
        : 0;

      out.set(r.sleeper_id, {
        sleeper_id: r.sleeper_id,
        fc_value: r.fc_value,
        ktc_value: r.ktc_value,
        dp_value: dpUsable ? r.dp_value : null,
        edge_score: edgeScore,
        fc_score: fcScore,
        ktc_score: ktcScore,
        dp_score: dpScore,
        sources_available: srcScores.length,
        source_agreement: normalizeAgreement(computeAgreement(srcScores)),
      });
    }

    return out;
  } catch {
    return null;
  }
}

async function computeCompositeRuntime(
  playerIds: string[],
  mode: "sf" | "1qb",
  weights?: SourceWeights
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
      ON fc.sleeper_id = pm.player_id
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
  const globalScale = await getGlobalScaleParams(mode);
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

// ─── Main ───

export async function getCompositeValues(
  playerIds: string[],
  mode: "sf" | "1qb",
  weights?: SourceWeights
): Promise<Map<string, CompositeValue>> {
  if (playerIds.length === 0) return new Map();

  // Always compute fresh until a new snapshot is generated with full source coverage.
  // The player_scores_daily snapshot was written before the FC/DP pipeline fixes
  // and contains stale sources_used values. Re-enable snapshot reads after
  // running a fresh snapshot post-fix.
  // TODO: Re-enable snapshot reads:
  return computeCompositeRuntime(playerIds, mode, weights);

  /*
  const snapshotMap = await readFromDailySnapshot(playerIds, mode);
  if (snapshotMap && snapshotMap.size === playerIds.length) return snapshotMap;
  const final = snapshotMap ?? new Map<string, CompositeValue>();
  const missing = playerIds.filter((id) => !final.has(id));
  if (missing.length === 0) return final;
  const runtime = await computeCompositeRuntime(missing, mode);
  for (const [id, val] of runtime) final.set(id, val);
  return final;
  */
}
