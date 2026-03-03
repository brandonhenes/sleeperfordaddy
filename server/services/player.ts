import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

export interface PlayerSummary {
  player_name: string;
  position: string | null;
  team: string | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
}

export interface ValuePoint {
  date: string;
  value: number;
}

export interface OwnershipEntry {
  league_name: string;
  league_id: string;
}

export interface Mention {
  mention_date: string;
  source: string | null;
  article_title: string | null;
  sentiment: string | null;
  key_quote: string | null;
}

export interface ProspectInfo {
  school: string | null;
  tier: string | null;
  consensus_comp: string | null;
  key_strengths: string[] | null;
  draft_capital: string | null;
  notes: string | null;
}

export interface RecInfo {
  direction: string;
  fc_at_rec: number | null;
  rationale: string | null;
  rec_date: string;
}

export interface PlayerDetail {
  summary: PlayerSummary;
  valueHistory: ValuePoint[];
  ownership: OwnershipEntry[];
  mentions: Mention[];
  prospect: ProspectInfo | null;
  recommendation: RecInfo | null;
}

export async function getPlayerDetail(
  playerName: string,
  username: string
): Promise<PlayerDetail | null> {
  // Resolve user_id
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  const dynastyLeagueIds = userId
    ? await getDynastyLeagueIdsForUserLatestSeason(userId)
    : [];
  const leagueIdFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const dynastyInClause = sql.join(leagueIdFrags, sql`, `);

  const [summaryRows, historyRows, ownershipRows, mentionRows, prospectRows, recRows] =
    await Promise.all([
      // Summary from latest FC snapshot
      db.execute(sql`
        SELECT player_name, position, team,
               dynasty_value::int, trend_30day::int, overall_rank::int
        FROM fantasycalc_daily
        WHERE LOWER(player_name) = LOWER(${playerName})
          AND snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        LIMIT 1
      `),

      // Value history (last 90 days)
      db.execute(sql`
        SELECT snapshot_date AS date, dynasty_value::int AS value
        FROM fantasycalc_daily
        WHERE LOWER(player_name) = LOWER(${playerName})
          AND snapshot_date >= (SELECT MAX(snapshot_date) FROM fantasycalc_daily) - INTERVAL '90 days'
        ORDER BY snapshot_date ASC
      `),

      // Ownership: leagues where user owns this player (current season)
      userId && dynastyLeagueIds.length > 0
        ? db.execute(sql`
            SELECT l.name AS league_name, l.league_id
            FROM roster_players rp
            JOIN leagues l ON rp.league_id = l.league_id
            WHERE rp.owner_id = ${userId}
              AND rp.league_id IN (${dynastyInClause})
              AND rp.player_id IN (
                SELECT pm.player_id FROM players_master pm
                WHERE LOWER(pm.full_name) = LOWER(${playerName})
              )
            ORDER BY l.name
          `)
        : Promise.resolve([]),

      // Mentions
      db.execute(sql`
        SELECT mention_date, source, article_title, sentiment, key_quote
        FROM player_mentions
        WHERE LOWER(player_name) = LOWER(${playerName})
        ORDER BY mention_date DESC
        LIMIT 10
      `),

      // Prospect profile
      db.execute(sql`
        SELECT school, tier, consensus_comp, key_strengths,
               draft_capital, notes
        FROM prospect_profiles
        WHERE LOWER(player_name) = LOWER(${playerName})
        LIMIT 1
      `),

      // Recommendation
      db.execute(sql`
        SELECT direction, fc_at_rec, rationale, rec_date
        FROM recommendations
        WHERE LOWER(player_name) = LOWER(${playerName})
        ORDER BY rec_date DESC
        LIMIT 1
      `),
    ]);

  const summary = (summaryRows as unknown as PlayerSummary[])[0];
  if (!summary) return null;

  const prospect = (prospectRows as unknown as ProspectInfo[])[0] ?? null;
  const recommendation = (recRows as unknown as RecInfo[])[0] ?? null;

  return {
    summary,
    valueHistory: historyRows as unknown as ValuePoint[],
    ownership: ownershipRows as unknown as OwnershipEntry[],
    mentions: mentionRows as unknown as Mention[],
    prospect,
    recommendation,
  };
}
