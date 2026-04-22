import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

export type SyncSource =
  | "crosswalk"
  | "ktc"
  | "ktc-redraft"
  | "fp-elite"
  | "fp-redraft"
  | "fc-redraft"
  | "fc-match"
  | "dynastyprocess"
  | "sleeper-stats"
  | "snapshot-scores"
  | "backfill-fc"
  | "backfill-ktc"
  | "backfill-aliases";

export interface TrackedSyncResult<T> {
  source: string;
  status: "success" | "failed";
  stats?: T;
  error?: string;
  duration_ms: number;
  attempts: number;
  run_id: string;
}

interface TrackOpts {
  retry?: boolean;
  retryDelayMs?: number;
  rowsFromStats?: (stats: unknown) => number | null;
}

// Heuristic: pull a row count out of common sync stats shapes so the row is
// queryable without parsing the JSONB.
function defaultRowsFromStats(stats: unknown): number | null {
  if (!stats || typeof stats !== "object") return null;
  const s = stats as Record<string, unknown>;
  const keys = [
    "matched",
    "matched_to_sleeper",
    "total_scraped",
    "total_rows",
    "total_fc_rows",
    "updated",
    "count",
  ];
  for (const k of keys) {
    if (typeof s[k] === "number") return s[k] as number;
  }
  return null;
}

export async function runTrackedSync<T>(
  source: SyncSource | string,
  fn: () => Promise<T>,
  opts: TrackOpts = {}
): Promise<TrackedSyncResult<T>> {
  const { retry = true, retryDelayMs = 30_000, rowsFromStats = defaultRowsFromStats } = opts;
  const startedAt = Date.now();

  const insertResult = await db.execute(sql`
    INSERT INTO sync_runs (source, status) VALUES (${source}, 'running')
    RETURNING id
  `);
  const runId = (insertResult as unknown as { id: string }[])[0]?.id;
  if (!runId) throw new Error("Failed to create sync_runs row");

  const maxAttempts = retry ? 2 : 1;
  let attempt = 1;
  let lastError: unknown;

  while (attempt <= maxAttempts) {
    try {
      const stats = await fn();
      const duration = Date.now() - startedAt;
      const rowCount = rowsFromStats(stats);
      await db.execute(sql`
        UPDATE sync_runs
        SET finished_at = NOW(),
            status = 'success',
            attempt = ${attempt},
            duration_ms = ${duration},
            rows_processed = ${rowCount},
            stats = ${JSON.stringify(stats)}::jsonb,
            error_message = NULL
        WHERE id = ${runId}
      `);
      if (attempt > 1) {
        console.log(`[sync:${source}] Succeeded on retry (attempt ${attempt})`);
      }
      return {
        source,
        status: "success",
        stats,
        duration_ms: duration,
        attempts: attempt,
        run_id: runId,
      };
    } catch (err) {
      lastError = err;
      const errMsg = (err as Error)?.message ?? String(err);
      console.error(`[sync:${source}] Attempt ${attempt}/${maxAttempts} failed:`, errMsg);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      attempt++;
    }
  }

  const duration = Date.now() - startedAt;
  const errorMsg = (lastError as Error)?.message ?? String(lastError);
  await db.execute(sql`
    UPDATE sync_runs
    SET finished_at = NOW(),
        status = 'failed',
        attempt = ${attempt - 1},
        duration_ms = ${duration},
        error_message = ${errorMsg}
    WHERE id = ${runId}
  `);
  return {
    source,
    status: "failed",
    error: errorMsg,
    duration_ms: duration,
    attempts: attempt - 1,
    run_id: runId,
  };
}

export interface SourceHealth {
  source: string;
  last_run_at: string | null;
  last_status: "success" | "failed" | "running" | null;
  last_error: string | null;
  last_duration_ms: number | null;
  consecutive_failures: number;
}

export async function getSourceHealth(sources: string[]): Promise<Record<string, SourceHealth>> {
  if (sources.length === 0) return {};

  const sourceList = sql.join(sources.map((s) => sql`${s}`), sql`, `);
  let latest: unknown;
  try {
    latest = await db.execute(sql`
      SELECT DISTINCT ON (source)
        source, started_at::text AS started_at, status, error_message, duration_ms
      FROM sync_runs
      WHERE source IN (${sourceList})
      ORDER BY source, started_at DESC
    `);
  } catch (err) {
    // sync_runs table missing (migration not applied) — fail soft so freshness
    // endpoint still returns the legacy per-source timestamps.
    console.warn("[sync-tracker] getSourceHealth skipped:", (err as Error).message);
    const empty: Record<string, SourceHealth> = {};
    for (const s of sources) {
      empty[s] = {
        source: s,
        last_run_at: null,
        last_status: null,
        last_error: null,
        last_duration_ms: null,
        consecutive_failures: 0,
      };
    }
    return empty;
  }
  const latestRows = latest as unknown as {
    source: string;
    started_at: string;
    status: "success" | "failed" | "running";
    error_message: string | null;
    duration_ms: number | null;
  }[];
  const latestBySource = new Map(latestRows.map((r) => [r.source, r]));

  // Count consecutive failures per source (from most recent, until a success).
  const failStreaks = await db.execute(sql`
    WITH ordered AS (
      SELECT source, status, started_at,
        ROW_NUMBER() OVER (PARTITION BY source ORDER BY started_at DESC) AS rn
      FROM sync_runs
      WHERE source IN (${sourceList})
    ),
    first_success AS (
      SELECT source, MIN(rn) AS first_ok_rn FROM ordered WHERE status = 'success' GROUP BY source
    )
    SELECT o.source, COUNT(*)::int AS fails
    FROM ordered o
    LEFT JOIN first_success fs ON fs.source = o.source
    WHERE o.status = 'failed' AND (fs.first_ok_rn IS NULL OR o.rn < fs.first_ok_rn)
    GROUP BY o.source
  `);
  const streakBySource = new Map(
    (failStreaks as unknown as { source: string; fails: number }[]).map((r) => [r.source, r.fails])
  );

  const out: Record<string, SourceHealth> = {};
  for (const source of sources) {
    const last = latestBySource.get(source);
    out[source] = {
      source,
      last_run_at: last?.started_at ?? null,
      last_status: last?.status ?? null,
      last_error: last?.error_message ?? null,
      last_duration_ms: last?.duration_ms ?? null,
      consecutive_failures: streakBySource.get(source) ?? 0,
    };
  }
  return out;
}
