import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { SLEEPER_BASE_URL } from "../../shared/constants.js";

const SEASONS = [2021, 2022, 2023, 2024, 2025];
const BATCH_SIZE = 250;
const FETCH_DELAY_MS = 1_000;

const STAT_COLUMNS = [
  "pass_att",
  "pass_cmp",
  "pass_yd",
  "pass_td",
  "pass_int",
  "pass_2pt",
  "pass_fd",
  "pass_sack",
  "pass_cmp_40p",
  "pass_td_40p",
  "pass_td_50p",
  "pass_inc",
  "rush_att",
  "rush_yd",
  "rush_td",
  "rush_2pt",
  "rush_fd",
  "rush_40p",
  "rush_td_40p",
  "rush_td_50p",
  "rec",
  "rec_yd",
  "rec_td",
  "rec_2pt",
  "rec_fd",
  "rec_0_4",
  "rec_5_9",
  "rec_10_19",
  "rec_20_29",
  "rec_30_39",
  "rec_40p",
  "rec_td_40p",
  "rec_td_50p",
  "fum",
  "fum_lost",
  "bonus_rush_yd_100",
  "bonus_rush_yd_200",
  "bonus_rec_yd_100",
  "bonus_rec_yd_200",
  "bonus_pass_yd_300",
  "bonus_pass_yd_400",
  "bonus_pass_cmp_25",
  "bonus_rush_att_20",
  "bonus_rush_rec_yd_100",
  "bonus_rush_rec_yd_200",
  "bonus_fd_rb",
  "bonus_fd_wr",
  "bonus_fd_te",
  "bonus_fd_qb",
] as const;

type StatColumn = (typeof STAT_COLUMNS)[number];

interface PlayerMetaRow {
  player_id: string;
  position: string | null;
  team: string | null;
}

type SleeperStatPayload = Record<string, number | string | null | undefined>;

type InsertRow = {
  player_id: string;
  season: number;
  games_played: number;
  position: string | null;
  team: string | null;
} & Record<StatColumn, number>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function loadPlayerMeta(): Promise<Map<string, PlayerMetaRow>> {
  const rows = await db.execute(sql`
    SELECT player_id, position, team
    FROM players_master
  `);

  const map = new Map<string, PlayerMetaRow>();
  for (const row of rows as unknown as PlayerMetaRow[]) {
    map.set(row.player_id, row);
  }
  return map;
}

async function fetchSeasonStats(
  season: number
): Promise<Record<string, SleeperStatPayload>> {
  const response = await fetch(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}`);
  if (!response.ok) {
    throw new Error(`Sleeper stats fetch failed for ${season}: HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, SleeperStatPayload>;
}

function buildInsertRows(
  season: number,
  payload: Record<string, SleeperStatPayload>,
  metaMap: Map<string, PlayerMetaRow>
): InsertRow[] {
  const rows: InsertRow[] = [];

  for (const [playerId, stats] of Object.entries(payload)) {
    const meta = metaMap.get(playerId);
    const row = {
      player_id: playerId,
      season,
      games_played: Math.round(toNumber(stats.gp)),
      position: toText(stats.position) ?? meta?.position ?? null,
      team: toText(stats.team) ?? meta?.team ?? null,
      ...Object.fromEntries(
        STAT_COLUMNS.map((column) => [column, toNumber(stats[column])])
      ),
    } as InsertRow;

    rows.push(row);
  }

  return rows;
}

async function upsertRows(rows: InsertRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = batch.map(
      (row) => sql`(
        ${row.player_id},
        ${row.season},
        ${row.games_played},
        ${row.pass_att},
        ${row.pass_cmp},
        ${row.pass_yd},
        ${row.pass_td},
        ${row.pass_int},
        ${row.pass_2pt},
        ${row.pass_fd},
        ${row.pass_sack},
        ${row.pass_cmp_40p},
        ${row.pass_td_40p},
        ${row.pass_td_50p},
        ${row.pass_inc},
        ${row.rush_att},
        ${row.rush_yd},
        ${row.rush_td},
        ${row.rush_2pt},
        ${row.rush_fd},
        ${row.rush_40p},
        ${row.rush_td_40p},
        ${row.rush_td_50p},
        ${row.rec},
        ${row.rec_yd},
        ${row.rec_td},
        ${row.rec_2pt},
        ${row.rec_fd},
        ${row.rec_0_4},
        ${row.rec_5_9},
        ${row.rec_10_19},
        ${row.rec_20_29},
        ${row.rec_30_39},
        ${row.rec_40p},
        ${row.rec_td_40p},
        ${row.rec_td_50p},
        ${row.fum},
        ${row.fum_lost},
        ${row.bonus_rush_yd_100},
        ${row.bonus_rush_yd_200},
        ${row.bonus_rec_yd_100},
        ${row.bonus_rec_yd_200},
        ${row.bonus_pass_yd_300},
        ${row.bonus_pass_yd_400},
        ${row.bonus_pass_cmp_25},
        ${row.bonus_rush_att_20},
        ${row.bonus_rush_rec_yd_100},
        ${row.bonus_rush_rec_yd_200},
        ${row.bonus_fd_rb},
        ${row.bonus_fd_wr},
        ${row.bonus_fd_te},
        ${row.bonus_fd_qb},
        ${row.position},
        ${row.team}
      )`
    );

    await db.execute(sql`
      INSERT INTO player_season_stats (
        player_id,
        season,
        games_played,
        pass_att,
        pass_cmp,
        pass_yd,
        pass_td,
        pass_int,
        pass_2pt,
        pass_fd,
        pass_sack,
        pass_cmp_40p,
        pass_td_40p,
        pass_td_50p,
        pass_inc,
        rush_att,
        rush_yd,
        rush_td,
        rush_2pt,
        rush_fd,
        rush_40p,
        rush_td_40p,
        rush_td_50p,
        rec,
        rec_yd,
        rec_td,
        rec_2pt,
        rec_fd,
        rec_0_4,
        rec_5_9,
        rec_10_19,
        rec_20_29,
        rec_30_39,
        rec_40p,
        rec_td_40p,
        rec_td_50p,
        fum,
        fum_lost,
        bonus_rush_yd_100,
        bonus_rush_yd_200,
        bonus_rec_yd_100,
        bonus_rec_yd_200,
        bonus_pass_yd_300,
        bonus_pass_yd_400,
        bonus_pass_cmp_25,
        bonus_rush_att_20,
        bonus_rush_rec_yd_100,
        bonus_rush_rec_yd_200,
        bonus_fd_rb,
        bonus_fd_wr,
        bonus_fd_te,
        bonus_fd_qb,
        position,
        team
      )
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (player_id, season) DO UPDATE SET
        games_played = EXCLUDED.games_played,
        pass_att = EXCLUDED.pass_att,
        pass_cmp = EXCLUDED.pass_cmp,
        pass_yd = EXCLUDED.pass_yd,
        pass_td = EXCLUDED.pass_td,
        pass_int = EXCLUDED.pass_int,
        pass_2pt = EXCLUDED.pass_2pt,
        pass_fd = EXCLUDED.pass_fd,
        pass_sack = EXCLUDED.pass_sack,
        pass_cmp_40p = EXCLUDED.pass_cmp_40p,
        pass_td_40p = EXCLUDED.pass_td_40p,
        pass_td_50p = EXCLUDED.pass_td_50p,
        pass_inc = EXCLUDED.pass_inc,
        rush_att = EXCLUDED.rush_att,
        rush_yd = EXCLUDED.rush_yd,
        rush_td = EXCLUDED.rush_td,
        rush_2pt = EXCLUDED.rush_2pt,
        rush_fd = EXCLUDED.rush_fd,
        rush_40p = EXCLUDED.rush_40p,
        rush_td_40p = EXCLUDED.rush_td_40p,
        rush_td_50p = EXCLUDED.rush_td_50p,
        rec = EXCLUDED.rec,
        rec_yd = EXCLUDED.rec_yd,
        rec_td = EXCLUDED.rec_td,
        rec_2pt = EXCLUDED.rec_2pt,
        rec_fd = EXCLUDED.rec_fd,
        rec_0_4 = EXCLUDED.rec_0_4,
        rec_5_9 = EXCLUDED.rec_5_9,
        rec_10_19 = EXCLUDED.rec_10_19,
        rec_20_29 = EXCLUDED.rec_20_29,
        rec_30_39 = EXCLUDED.rec_30_39,
        rec_40p = EXCLUDED.rec_40p,
        rec_td_40p = EXCLUDED.rec_td_40p,
        rec_td_50p = EXCLUDED.rec_td_50p,
        fum = EXCLUDED.fum,
        fum_lost = EXCLUDED.fum_lost,
        bonus_rush_yd_100 = EXCLUDED.bonus_rush_yd_100,
        bonus_rush_yd_200 = EXCLUDED.bonus_rush_yd_200,
        bonus_rec_yd_100 = EXCLUDED.bonus_rec_yd_100,
        bonus_rec_yd_200 = EXCLUDED.bonus_rec_yd_200,
        bonus_pass_yd_300 = EXCLUDED.bonus_pass_yd_300,
        bonus_pass_yd_400 = EXCLUDED.bonus_pass_yd_400,
        bonus_pass_cmp_25 = EXCLUDED.bonus_pass_cmp_25,
        bonus_rush_att_20 = EXCLUDED.bonus_rush_att_20,
        bonus_rush_rec_yd_100 = EXCLUDED.bonus_rush_rec_yd_100,
        bonus_rush_rec_yd_200 = EXCLUDED.bonus_rush_rec_yd_200,
        bonus_fd_rb = EXCLUDED.bonus_fd_rb,
        bonus_fd_wr = EXCLUDED.bonus_fd_wr,
        bonus_fd_te = EXCLUDED.bonus_fd_te,
        bonus_fd_qb = EXCLUDED.bonus_fd_qb,
        position = EXCLUDED.position,
        team = EXCLUDED.team
    `);
  }
}

async function main(): Promise<void> {
  const metaMap = await loadPlayerMeta();

  for (let i = 0; i < SEASONS.length; i += 1) {
    const season = SEASONS[i];
    console.log(`[player-stats] Fetching ${season}`);
    const payload = await fetchSeasonStats(season);
    const rows = buildInsertRows(season, payload, metaMap);
    await upsertRows(rows);
    console.log(`[player-stats] Upserted ${rows.length} rows for ${season}`);

    if (i < SEASONS.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }
  }

  console.log("[player-stats] Backfill complete");
}

main().catch((error) => {
  console.error("[player-stats] Fatal error:", error);
  process.exit(1);
});
