import { sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { backfillLeagueMatchups } from "../services/matchup-backfill.js";

interface LeagueRow {
  league_id: string;
  season: number;
  previous_league_id: string | null;
}

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const filterSeason = getArg("season") ? Number(getArg("season")) : undefined;
const filterLeague = getArg("league");
const dryRun = args.includes("--dry-run");

async function loadTargetLeagueIds(): Promise<string[]> {
  if (filterLeague) return [filterLeague];

  const rowsRaw = filterSeason
    ? await db.execute(sql`
        SELECT league_id, season, previous_league_id
        FROM leagues
        WHERE season = ${filterSeason}
      `)
    : await db.execute(sql`
        SELECT league_id, season, previous_league_id
        FROM leagues
      `);

  const rows = rowsRaw as unknown as LeagueRow[];
  if (filterSeason) {
    return [...new Set(rows.map((row) => row.league_id))];
  }

  const referenced = new Set(
    rows
      .map((row) => row.previous_league_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  return rows
    .filter((row) => !referenced.has(row.league_id))
    .sort((left, right) => left.season - right.season)
    .map((row) => row.league_id);
}

async function main(): Promise<void> {
  const start = Date.now();
  const targetLeagueIds = await loadTargetLeagueIds();

  console.log(
    `[matchup-backfill] Starting${dryRun ? " (DRY RUN)" : ""}${filterSeason ? ` season=${filterSeason}` : ""}${filterLeague ? ` league=${filterLeague}` : ""}`
  );
  console.log(`[matchup-backfill] Targets: ${targetLeagueIds.length}`);

  let totalRows = 0;
  for (let i = 0; i < targetLeagueIds.length; i += 1) {
    const leagueId = targetLeagueIds[i];
    try {
      const rows = await backfillLeagueMatchups(leagueId, { dryRun });
      totalRows += rows;
    } catch (error) {
      console.error(`[matchup-backfill] Failed for ${leagueId}:`, error);
    }

    if ((i + 1) % 10 === 0 || i + 1 === targetLeagueIds.length) {
      console.log(
        `[matchup-backfill] ${i + 1}/${targetLeagueIds.length} targets | rows=${totalRows.toLocaleString()}`
      );
    }
  }

  const elapsedSeconds = Math.round((Date.now() - start) / 1000);
  console.log(
    `[matchup-backfill] Complete | rows=${totalRows.toLocaleString()} | ${elapsedSeconds}s`
  );
}

main().catch((error) => {
  console.error("[matchup-backfill] Fatal error:", error);
  process.exit(1);
});
