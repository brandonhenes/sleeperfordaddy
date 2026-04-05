import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { SLEEPER_BASE_URL } from "../../shared/constants.js";

interface LeagueRow {
  league_id: string;
  season: number;
  previous_league_id: string | null;
}

interface SleeperMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  players: string[] | null;
  starters: string[] | null;
  points: number | null;
  players_points: Record<string, number> | null;
}

interface InsertRow {
  league_id: string;
  season: number;
  week: number;
  roster_id: number;
  player_id: string;
  points: number;
  is_starter: boolean;
  opponent_roster_id: number | null;
  opponent_total: number | null;
  league_median: number | null;
  roster_total: number | null;
}

let callsThisMinute = 0;
let minuteStart = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  if (now - minuteStart >= 60_000) {
    callsThisMinute = 0;
    minuteStart = now;
  }

  if (callsThisMinute >= 900) {
    const wait = 60_000 - (now - minuteStart) + 500;
    console.log(`[matchup-backfill] Pausing ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    callsThisMinute = 0;
    minuteStart = Date.now();
  }

  callsThisMinute += 1;
  return fetch(url);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildRows(
  leagueId: string,
  season: number,
  week: number,
  matchups: SleeperMatchupEntry[]
): InsertRow[] {
  const matchupPairs = new Map<number, SleeperMatchupEntry[]>();
  for (const matchup of matchups) {
    if (matchup.matchup_id == null) continue;
    const pair = matchupPairs.get(matchup.matchup_id) ?? [];
    pair.push(matchup);
    matchupPairs.set(matchup.matchup_id, pair);
  }

  const leagueMedian = median(
    matchups.filter((matchup) => matchup.points != null).map((matchup) => matchup.points ?? 0)
  );

  const rows: InsertRow[] = [];
  for (const matchup of matchups) {
    const rosterTotal = matchup.points ?? 0;
    const starters = new Set(matchup.starters ?? []);
    const players = matchup.players ?? [];
    const playersPoints = matchup.players_points ?? {};

    let opponentRosterId: number | null = null;
    let opponentTotal: number | null = null;
    if (matchup.matchup_id != null) {
      const pair = matchupPairs.get(matchup.matchup_id) ?? [];
      const opponent = pair.find((entry) => entry.roster_id !== matchup.roster_id);
      if (opponent) {
        opponentRosterId = opponent.roster_id;
        opponentTotal = opponent.points ?? 0;
      }
    }

    for (const playerId of players) {
      rows.push({
        league_id: leagueId,
        season,
        week,
        roster_id: matchup.roster_id,
        player_id: playerId,
        points: playersPoints[playerId] ?? 0,
        is_starter: starters.has(playerId),
        opponent_roster_id: opponentRosterId,
        opponent_total: opponentTotal,
        league_median: leagueMedian,
        roster_total: rosterTotal,
      });
    }
  }

  return rows;
}

async function batchInsert(rows: InsertRow[], dryRun: boolean): Promise<number> {
  if (rows.length === 0) return 0;
  if (dryRun) return rows.length;

  let inserted = 0;
  const batchSize = 300;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map(
      (row) => sql`(
        ${row.league_id},
        ${row.season},
        ${row.week},
        ${row.roster_id},
        ${row.player_id},
        ${row.points},
        ${row.is_starter},
        ${row.opponent_roster_id},
        ${row.opponent_total},
        ${row.league_median},
        ${row.roster_total}
      )`
    );

    await db.execute(sql`
      INSERT INTO weekly_matchup_scores (
        league_id,
        season,
        week,
        roster_id,
        player_id,
        points,
        is_starter,
        opponent_roster_id,
        opponent_total,
        league_median,
        roster_total
      )
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT DO NOTHING
    `);

    inserted += batch.length;
  }

  return inserted;
}

async function getLeagueRows(): Promise<LeagueRow[]> {
  const rows = await db.execute(sql`
    SELECT league_id, season, previous_league_id
    FROM leagues
  `);
  return rows as unknown as LeagueRow[];
}

export async function getLeagueTimeline(leagueId: string): Promise<LeagueRow[]> {
  const rows = await getLeagueRows();
  const byId = new Map(rows.map((row) => [row.league_id, row]));
  const children = new Map<string, LeagueRow[]>();

  for (const row of rows) {
    if (!row.previous_league_id) continue;
    const bucket = children.get(row.previous_league_id) ?? [];
    bucket.push(row);
    children.set(row.previous_league_id, bucket);
  }

  let root = byId.get(leagueId) ?? null;
  while (root?.previous_league_id) {
    root = byId.get(root.previous_league_id) ?? root;
    if (root.previous_league_id == null) break;
  }

  if (!root) return [];

  const timeline: LeagueRow[] = [];
  const seen = new Set<string>();
  let current: LeagueRow | null = root;

  while (current && !seen.has(current.league_id)) {
    timeline.push(current);
    seen.add(current.league_id);
    const next: LeagueRow | undefined = (children.get(current.league_id) ?? [])
      .filter((row) => !seen.has(row.league_id))
      .sort((left, right) => left.season - right.season)[0];
    current = next ?? null;
  }

  return timeline.sort((left, right) => left.season - right.season);
}

async function backfillSingleLeagueSeason(
  leagueId: string,
  season: number,
  dryRun: boolean
): Promise<number> {
  const existingRows = await db.execute(sql`
    SELECT DISTINCT week
    FROM weekly_matchup_scores
    WHERE league_id = ${leagueId}
      AND season = ${season}
  `);
  const existingWeeks = new Set(
    (existingRows as unknown as Array<{ week: number }>).map((row) => row.week)
  );

  let inserted = 0;
  const maxWeek = season <= 2021 ? 17 : 18;

  for (let week = 1; week <= maxWeek; week += 1) {
    if (existingWeeks.has(week)) continue;

    const url = `${SLEEPER_BASE_URL}/league/${leagueId}/matchups/${week}`;
    const response = await rateLimitedFetch(url);

    if (response.status === 404) continue;

    if (response.status === 429) {
      console.warn(
        `[matchup-backfill] Rate limited on ${leagueId} week ${week}, waiting 60s`
      );
      await sleep(60_000);
      const retry = await rateLimitedFetch(url);
      if (!retry.ok) {
        console.error(
          `[matchup-backfill] Skipping ${leagueId} season=${season} week=${week} after retry failure`
        );
        continue;
      }
      const retryData = (await retry.json()) as SleeperMatchupEntry[];
      if (!retryData.length || retryData.every((entry) => !entry.points || entry.points === 0)) {
        continue;
      }
      inserted += await batchInsert(buildRows(leagueId, season, week, retryData), dryRun);
      continue;
    }

    if (!response.ok) {
      console.error(
        `[matchup-backfill] HTTP ${response.status} for ${leagueId} season=${season} week=${week}`
      );
      continue;
    }

    const data = (await response.json()) as SleeperMatchupEntry[];
    if (!data.length || data.every((entry) => !entry.points || entry.points === 0)) {
      continue;
    }

    inserted += await batchInsert(buildRows(leagueId, season, week, data), dryRun);
  }

  return inserted;
}

export async function backfillLeagueMatchups(
  leagueId: string,
  options: { dryRun?: boolean } = {}
): Promise<number> {
  const timeline = await getLeagueTimeline(leagueId);
  if (timeline.length === 0) return 0;

  let inserted = 0;
  for (const league of timeline) {
    inserted += await backfillSingleLeagueSeason(
      league.league_id,
      league.season,
      options.dryRun === true
    );
  }

  return inserted;
}
