import { Router } from "express";
import { recomputeTags } from "../services/admin.js";
import { syncPlayerIdCrosswalk } from "../services/sync-crosswalk.js";
import { syncKtcValues } from "../services/sync-ktc.js";
import { syncDynastyProcessValues } from "../services/sync-dynastyprocess.js";
import { syncFpEliteValues } from "../services/sync-fp-elite.js";
import { syncFcRedraftValues } from "../services/sync-fc-redraft.js";
import { snapshotEdgeScores } from "../services/snapshot-scores.js";
import { syncKtcRedraftValues } from "../services/sync-ktc-redraft.js";
import { syncFpRedraftValues } from "../services/sync-fp-redraft.js";
import { syncSleeperStats } from "../services/sync-sleeper-stats.js";
import {
  backfillFantasyCalcSleeperIds,
  backfillKtcSleeperIds,
} from "../services/source-coverage-backfill.js";
import { backfillPlayerAliases } from "../services/player-resolver.js";
import { matchFcSleeperIds } from "../services/sync-fc-match.js";
import { runTrackedSync, getSourceHealth } from "../services/sync-tracker.js";
import { bustAllCaches } from "../services/cache-bus.js";
import { forceSyncPlayers } from "../services/sync-players.js";

import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const router = Router();

const STALE_HOURS: Record<string, number> = {
  fantasycalc: 48,
  ktc: 36,
  dynastyprocess: 36,
};

function isStale(lastSynced: string | null, hours: number): boolean {
  if (!lastSynced) return true;
  return Date.now() - new Date(lastSynced).getTime() > hours * 3600 * 1000;
}

/** GET /api/meta/freshness — per-source last-sync timestamps + run health */
router.get("/api/meta/freshness", async (_req, res) => {
  try {
    const [[fc], [ktc], [dp]] = await Promise.all([
      db.execute(sql`SELECT MAX(snapshot_date)::text AS last_synced, COUNT(*)::int AS player_count FROM fantasycalc_daily WHERE is_pick = false`),
      db.execute(sql`SELECT MAX(scraped_at)::text AS last_synced, COUNT(*)::int AS player_count FROM ktc_values WHERE is_pick = false`),
      db.execute(sql`SELECT MAX(synced_at)::text AS last_synced, COUNT(*)::int AS player_count FROM dynastyprocess_values WHERE is_pick = false`),
    ]) as unknown as [
      [{ last_synced: string | null; player_count: number }],
      [{ last_synced: string | null; player_count: number }],
      [{ last_synced: string | null; player_count: number }],
    ];

    const health = await getSourceHealth(["ktc", "fp-elite", "dynastyprocess", "fc-redraft", "crosswalk"]);

    const sources = {
      fantasycalc: {
        last_synced: fc.last_synced,
        player_count: fc.player_count,
        stale: isStale(fc.last_synced, STALE_HOURS.fantasycalc),
        last_run: null,
      },
      ktc: {
        last_synced: ktc.last_synced,
        player_count: ktc.player_count,
        stale: isStale(ktc.last_synced, STALE_HOURS.ktc),
        last_run: health.ktc ?? null,
      },
      dynastyprocess: {
        last_synced: dp.last_synced,
        player_count: dp.player_count,
        stale: isStale(dp.last_synced, STALE_HOURS.dynastyprocess),
        last_run: health.dynastyprocess ?? null,
      },
    };

    const issues: string[] = [];
    for (const [name, src] of Object.entries(sources)) {
      if (src.stale) issues.push(`${name}: stale (last ${src.last_synced ?? "never"})`);
      if (src.last_run?.last_status === "failed") {
        issues.push(`${name}: last sync failed (${src.last_run.consecutive_failures} consecutive)`);
      }
    }

    res.json({
      ...sources,
      healthy: issues.length === 0,
      issues,
    });
  } catch (err) {
    console.error("[meta/freshness] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/recompute-tags?username=... */
router.post("/api/admin/recompute-tags", async (req, res) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ message: "username is required" });
    }
    const result = await recomputeTags(username);
    res.json(result);
  } catch (err) {
    console.error("[admin/recompute-tags] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-crosswalk */
router.post("/api/admin/sync-crosswalk", async (_req, res) => {
  const result = await runTrackedSync("crosswalk", () => syncPlayerIdCrosswalk());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/match-fc */
router.post("/api/admin/match-fc", async (_req, res) => {
  const result = await runTrackedSync("fc-match", () => matchFcSleeperIds());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

router.get("/api/admin/roster-health/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const result = await db.execute(sql`
      SELECT
        COUNT(DISTINCT player_id)::int AS total_players,
        COUNT(DISTINCT owner_id)::int AS total_owners,
        MAX(updated_at)::text AS last_updated
      FROM roster_players
      WHERE league_id = ${leagueId}
    `);
    const row = (result as unknown as {
      total_players: number;
      total_owners: number;
      last_updated: string | null;
    }[])[0];
    res.json({
      league_id: leagueId,
      rostered_players: row?.total_players ?? 0,
      unique_owners: row?.total_owners ?? 0,
      last_updated: row?.last_updated ?? null,
      healthy: (row?.total_players ?? 0) >= 50,
    });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

/** POST /api/admin/sync-ktc */
router.post("/api/admin/sync-ktc", async (_req, res) => {
  const result = await runTrackedSync("ktc", () => syncKtcValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-fp-elite — FP-Elite rankings (replaces DP) */
router.post("/api/admin/sync-fp-elite", async (_req, res) => {
  const result = await runTrackedSync("fp-elite", () => syncFpEliteValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-ktc-redraft */
router.post("/api/admin/sync-ktc-redraft", async (_req, res) => {
  const result = await runTrackedSync("ktc-redraft", () => syncKtcRedraftValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-fp-redraft */
router.post("/api/admin/sync-fp-redraft", async (_req, res) => {
  const result = await runTrackedSync("fp-redraft", () => syncFpRedraftValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-sleeper-stats */
router.post("/api/admin/sync-sleeper-stats", async (req, res) => {
  const season = Number(req.query.season ?? 2025);
  const result = await runTrackedSync("sleeper-stats", () => syncSleeperStats(season));
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-dynastyprocess — Legacy DP sync (fallback) */
router.post("/api/admin/sync-dynastyprocess", async (_req, res) => {
  const result = await runTrackedSync("dynastyprocess", () => syncDynastyProcessValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-fc-redraft */
router.post("/api/admin/sync-fc-redraft", async (_req, res) => {
  const result = await runTrackedSync("fc-redraft", () => syncFcRedraftValues());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/sync-values — Run all syncs in sequence, partial failures OK */
router.post("/api/admin/sync-values", async (_req, res) => {
  const crosswalk = await runTrackedSync("crosswalk", () => syncPlayerIdCrosswalk());
  const ktc = await runTrackedSync("ktc", () => syncKtcValues());
  const fp = await runTrackedSync("fp-elite", () => syncFpEliteValues());
  const fcBackfill = await runTrackedSync("backfill-fc", () => backfillFantasyCalcSleeperIds());
  const ktcBackfill = await runTrackedSync("backfill-ktc", () => backfillKtcSleeperIds());

  const results = { crosswalk, ktc, fp, fcBackfill, ktcBackfill };
  const failures = Object.entries(results)
    .filter(([, r]) => r.status === "failed")
    .map(([k]) => k);
  const succeeded = Object.values(results).filter((r) => r.status === "success").length;

  if (succeeded > 0) await bustAllCaches();

  res.json({
    ...results,
    summary: {
      total: 5,
      succeeded,
      failed: failures.length,
      failed_sources: failures,
    },
  });
});

/** POST /api/admin/backfill-fc-ids - one-time source coverage backfill */
router.post("/api/admin/backfill-fc-ids", async (_req, res) => {
  const fc = await runTrackedSync("backfill-fc", () => backfillFantasyCalcSleeperIds());
  const ktc = await runTrackedSync("backfill-ktc", () => backfillKtcSleeperIds());
  const allOk = fc.status === "success" && ktc.status === "success";
  if (fc.status === "success" || ktc.status === "success") await bustAllCaches();
  res.status(allOk ? 200 : 500).json({ ok: allOk, fc, ktc });
});

/** POST /api/admin/backfill-player-aliases */
router.post("/api/admin/backfill-player-aliases", async (_req, res) => {
  const result = await runTrackedSync("backfill-aliases", () => backfillPlayerAliases());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json({
    ok: result.status === "success",
    ...result,
  });
});

/** POST /api/admin/sync-players — Force resync of player universe from Sleeper (team/status/injury) */
router.post("/api/admin/sync-players", async (_req, res) => {
  const result = await runTrackedSync("sleeper-players", () => forceSyncPlayers());
  if (result.status === "success") await bustAllCaches();
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** POST /api/admin/snapshot-scores — Snapshot Edge Scores for history tracking */
router.post("/api/admin/snapshot-scores", async (_req, res) => {
  const result = await runTrackedSync("snapshot-scores", () => snapshotEdgeScores());
  res.status(result.status === "failed" ? 500 : 200).json(result);
});

/** GET /api/admin/sync-runs — recent run history */
router.get("/api/admin/sync-runs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
    const source = req.query.source ? String(req.query.source) : null;
    const rows = await db.execute(
      source
        ? sql`
          SELECT id, source, started_at::text, finished_at::text, status,
                 rows_processed, error_message, attempt, duration_ms, stats
          FROM sync_runs
          WHERE source = ${source}
          ORDER BY started_at DESC
          LIMIT ${limit}
        `
        : sql`
          SELECT id, source, started_at::text, finished_at::text, status,
                 rows_processed, error_message, attempt, duration_ms, stats
          FROM sync_runs
          ORDER BY started_at DESC
          LIMIT ${limit}
        `
    );
    res.json({ runs: rows });
  } catch (err) {
    console.error("[admin/sync-runs] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

export default router;
