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
import { clearGlobalScaleCache } from "../services/composite-values.js";
import { clearPowerRankingsCache } from "../services/power-rankings.js";
import {
  backfillFantasyCalcSleeperIds,
  backfillKtcSleeperIds,
} from "../services/source-coverage-backfill.js";
import { backfillPlayerAliases } from "../services/player-resolver.js";
import { matchFcSleeperIds } from "../services/sync-fc-match.js";

import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";

const router = Router();

/** GET /api/meta/freshness — per-source last-sync timestamps */
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
    res.json({
      fantasycalc: { last_synced: fc.last_synced, player_count: fc.player_count },
      ktc: { last_synced: ktc.last_synced, player_count: ktc.player_count },
      dynastyprocess: { last_synced: dp.last_synced, player_count: dp.player_count },
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
  try {
    const stats = await syncPlayerIdCrosswalk();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-crosswalk] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/match-fc */
router.post("/api/admin/match-fc", async (_req, res) => {
  try {
    const stats = await matchFcSleeperIds();
    res.json(stats);
  } catch (err) {
    console.error("[admin] FC match error:", err);
    res.status(500).json({ message: "FC match failed", error: String(err) });
  }
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
  try {
    const stats = await syncKtcValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-ktc] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-fp-elite — FP-Elite rankings (replaces DP) */
router.post("/api/admin/sync-fp-elite", async (_req, res) => {
  try {
    const stats = await syncFpEliteValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-fp-elite] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-ktc-redraft */
router.post("/api/admin/sync-ktc-redraft", async (_req, res) => {
  try {
    const stats = await syncKtcRedraftValues();
    clearGlobalScaleCache();
    clearPowerRankingsCache();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-ktc-redraft] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-fp-redraft */
router.post("/api/admin/sync-fp-redraft", async (_req, res) => {
  try {
    const stats = await syncFpRedraftValues();
    clearGlobalScaleCache();
    clearPowerRankingsCache();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-fp-redraft] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-sleeper-stats */
router.post("/api/admin/sync-sleeper-stats", async (req, res) => {
  try {
    const season = Number(req.query.season ?? 2025);
    const stats = await syncSleeperStats(season);
    clearGlobalScaleCache();
    clearPowerRankingsCache();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-sleeper-stats] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-dynastyprocess — Legacy DP sync (fallback) */
router.post("/api/admin/sync-dynastyprocess", async (_req, res) => {
  try {
    const stats = await syncDynastyProcessValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-dynastyprocess] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-fc-redraft */
router.post("/api/admin/sync-fc-redraft", async (_req, res) => {
  try {
    const stats = await syncFcRedraftValues();
    res.json(stats);
  } catch (err) {
    console.error("[admin/sync-fc-redraft] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/sync-values — Run all three syncs in sequence */
router.post("/api/admin/sync-values", async (_req, res) => {
  try {
    const crosswalk = await syncPlayerIdCrosswalk();
    const ktc = await syncKtcValues();
    const fp = await syncFpEliteValues();
    const fcBackfill = await backfillFantasyCalcSleeperIds();
    const ktcBackfill = await backfillKtcSleeperIds();
    res.json({ crosswalk, ktc, fp, fcBackfill, ktcBackfill });
  } catch (err) {
    console.error("[admin/sync-values] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

/** POST /api/admin/backfill-fc-ids â€” one-time source coverage backfill */
router.post("/api/admin/backfill-fc-ids", async (_req, res) => {
  try {
    const fc = await backfillFantasyCalcSleeperIds();
    const ktc = await backfillKtcSleeperIds();
    res.json({ ok: true, fc, ktc });
  } catch (err) {
    console.error("[admin/backfill-fc-ids] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Backfill failed" });
  }
});

/** POST /api/admin/backfill-player-aliases */
router.post("/api/admin/backfill-player-aliases", async (_req, res) => {
  try {
    const stats = await backfillPlayerAliases();
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[admin/backfill-player-aliases] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Alias backfill failed" });
  }
});

/** POST /api/admin/snapshot-scores — Snapshot Edge Scores for history tracking */
router.post("/api/admin/snapshot-scores", async (_req, res) => {
  try {
    const stats = await snapshotEdgeScores();
    res.json(stats);
  } catch (err) {
    console.error("[admin/snapshot-scores] Error:", err);
    res.status(500).json({ message: (err as Error).message ?? "Internal server error" });
  }
});

export default router;
