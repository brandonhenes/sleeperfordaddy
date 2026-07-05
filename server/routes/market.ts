import { Router } from "express";
import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  getRecommendations,
  getProspects,
  getSignals,
} from "../services/market.js";
import { getRookieDraftContext } from "../services/rookie-draft-context.js";
import { getMockDraftSetup } from "../services/mock-draft.js";
import { getActiveDrafts, getLiveDraftState } from "../services/live-draft.js";
import { getDraftHitRates } from "../services/draft-hit-rates.js";
import { computeRookieADP } from "../services/sync-league-drafts.js";
import type { BoardMovement, ValueMover, ValueSnapshot } from "../../shared/types.js";

const router = Router();

async function fetchValueMovers(): Promise<ValueMover[]> {
  const rows = await db.execute(sql`
    SELECT
      player_name AS player_id,
      player_name,
      position,
      team,
      fc_value_now,
      fc_delta_7d,
      fc_delta_14d,
      fc_delta_21d,
      fc_delta_28d,
      fc_trend_30d,
      ktc_value_now,
      dp_value_now
    FROM v_value_movers
    WHERE fc_value_now > 200
    ORDER BY ABS(COALESCE(fc_delta_7d, 0)) DESC
    LIMIT 100
  `);
  return rows as unknown as ValueMover[];
}

/** GET /api/market/recommendations — Buy/Sell/Hold recs */
router.get("/api/market/recommendations", async (_req, res) => {
  try {
    const data = await getRecommendations();
    res.json(data);
  } catch (err) {
    console.error("[market/recommendations] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market/prospects — Prospect board */
router.get("/api/market/prospects", async (_req, res) => {
  try {
    const data = await getProspects();
    res.json(data);
  } catch (err) {
    console.error("[market/prospects] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/market/value-movers — FC value risers/fallers from snapshot deltas */
router.get("/api/market/value-movers", async (_req, res) => {
  try {
    const rows = await fetchValueMovers();
    res.json(rows as unknown as BoardMovement[]);
  } catch (err) {
    console.error("[market/value-movers] Error:", err);
    res.status(500).json({ message: "Failed to fetch value movers" });
  }
});

/** GET /api/market/movers — backwards-compatible alias */
router.get("/api/market/movers", async (_req, res) => {
  try {
    const rows = await fetchValueMovers();
    res.json(rows as unknown as ValueSnapshot[]);
  } catch (err) {
    console.error("[market/movers] Error:", err);
    res.status(500).json({ message: "Failed to fetch value movers" });
  }
});

/** GET /api/market/signals — Add/drop signals */
router.get("/api/market/signals", async (_req, res) => {
  try {
    const data = await getSignals();
    res.json(data);
  } catch (err) {
    console.error("[market/signals] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/context/:username */
router.get("/api/rookie-draft/context/:username", async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ message: "username required" });
    const data = await getRookieDraftContext(username);
    res.json(data);
  } catch (err) {
    console.error("[rookie-draft] Context error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/mock-setup/:username/:leagueId */
router.get("/api/rookie-draft/mock-setup/:username/:leagueId", async (req, res) => {
  try {
    const { username, leagueId } = req.params;
    const data = await getMockDraftSetup(username, leagueId);
    if (!data) return res.status(404).json({ message: "League not found" });
    res.json(data);
  } catch (err) {
    console.error("[mock-draft] Setup error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/active-drafts/:username */
router.get("/api/rookie-draft/active-drafts/:username", async (req, res) => {
  try {
    const data = await getActiveDrafts(req.params.username);
    res.json(data);
  } catch (err) {
    console.error("[live-draft] Active drafts error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/live/:username/:draftId/:leagueId */
router.get("/api/rookie-draft/live/:username/:draftId/:leagueId", async (req, res) => {
  try {
    const { username, draftId, leagueId } = req.params;
    const data = await getLiveDraftState(username, draftId, leagueId);
    if (!data) return res.status(404).json({ message: "Draft not found" });
    res.json(data);
  } catch (err) {
    console.error("[live-draft] State error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/hit-rates */
router.get("/api/rookie-draft/hit-rates", async (_req, res) => {
  try {
    const data = await getDraftHitRates();
    res.json(data);
  } catch (err) {
    console.error("[hit-rates] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/adp/:season */
router.get("/api/rookie-draft/adp/:season", async (req, res) => {
  try {
    const data = await computeRookieADP(req.params.season);
    res.json(data);
  } catch (err) {
    console.error("[adp] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/board-movement/:playerName */
router.get("/api/rookie-draft/board-movement/:playerName", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT snapshot_date, fp_rank, tier
      FROM draft_board_snapshots
      WHERE LOWER(player_name) = LOWER(${decodeURIComponent(req.params.playerName)})
      ORDER BY snapshot_date ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[board-movement] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/value-tracker/:playerName */
router.get("/api/rookie-draft/value-tracker/:playerName", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.playerName);
    const pmRows = (await db.execute(sql`
      SELECT player_id FROM players_master WHERE LOWER(full_name) = LOWER(${name}) LIMIT 1
    `)) as unknown as Array<{ player_id: string }>;
    const playerId = pmRows[0]?.player_id;
    if (!playerId) return res.json([]);

    const rows = await db.execute(sql`
      SELECT snapshot_date, edge_score, fc_value, ktc_value, dp_value
      FROM player_value_snapshots
      WHERE player_id = ${playerId}
      ORDER BY snapshot_date ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[value-tracker] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/prospect-history/:playerName */
router.get("/api/rookie-draft/prospect-history/:playerName", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.playerName);
    const rows = await db.execute(sql`
      SELECT snapshot_date, dp_value_sf, dp_value_1qb, dp_ecr_sf, dp_ecr_1qb,
             fp_ecr_sf, fp_ecr_best, fp_ecr_worst, fp_ecr_sd
      FROM prospect_rankings_daily
      WHERE LOWER(player_name) = LOWER(${name})
      ORDER BY snapshot_date ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("[prospect-history] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

/** GET /api/rookie-draft/latest-rankings */
router.get("/api/rookie-draft/latest-rankings", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT r.player_name, r.position, r.dp_value_sf, r.dp_value_1qb,
             r.dp_ecr_sf, r.fp_ecr_sf, r.fp_ecr_best, r.fp_ecr_worst, r.fp_ecr_sd
      FROM prospect_rankings_daily r
      WHERE r.snapshot_date = (SELECT MAX(snapshot_date) FROM prospect_rankings_daily)
      ORDER BY r.dp_value_sf DESC NULLS LAST
    `);
    res.json(rows);
  } catch (err) {
    console.error("[latest-rankings] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
