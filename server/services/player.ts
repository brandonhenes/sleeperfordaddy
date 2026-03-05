import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";
import { getCompositeValues } from "./composite-values.js";
import { computeEdgeScores } from "./edge-score.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";

export interface PlayerSummary {
  player_name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  dynasty_value: number | null;
  trend_30day: number | null;
  overall_rank: number | null;
  edge_score: number;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
  age_curve: AgeCurveStatus;
}

export interface ValuePoint {
  date: string;
  value: number;
}

export interface OwnershipEntry {
  league_name: string;
  league_id: string;
}

export interface ExposureInfo {
  owned_leagues: number;
  total_leagues: number;
  exposure_pct: number;
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
  exposure: ExposureInfo;
  mentions: Mention[];
  prospect: ProspectInfo | null;
  recommendation: RecInfo | null;
}

function scoreAgreement(scores: (number | null)[]): "high" | "medium" | "low" {
  const v = scores.filter((s): s is number => s != null);
  if (v.length <= 1) return "high";
  const spread = Math.max(...v) - Math.min(...v);
  return spread < 5 ? "high" : spread <= 12 ? "medium" : "low";
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
  const dynastyInClause = dynastyLeagueIds.length > 0
    ? sql.join(leagueIdFrags, sql`, `)
    : sql`''`;

  // Resolve player_id from players_master
  const pmRows = await db.execute(sql`
    SELECT player_id, full_name, position, age
    FROM players_master
    WHERE LOWER(full_name) = LOWER(${playerName})
      AND position IN ('QB', 'RB', 'WR', 'TE')
    LIMIT 1
  `);
  const pm = (pmRows as unknown as { player_id: string; full_name: string; position: string; age: number | null }[])[0];

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

      // Ownership: leagues where user owns this player
      userId && dynastyLeagueIds.length > 0 && pm
        ? db.execute(sql`
            SELECT l.name AS league_name, l.league_id
            FROM roster_players rp
            JOIN leagues l ON rp.league_id = l.league_id
            WHERE rp.owner_id = ${userId}
              AND rp.league_id IN (${dynastyInClause})
              AND rp.player_id = ${pm.player_id}
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

  type FCRow = { player_name: string; position: string | null; team: string | null; dynasty_value: number | null; trend_30day: number | null; overall_rank: number | null };
  const fcSummary = (summaryRows as unknown as FCRow[])[0];
  if (!fcSummary && !pm) return null;

  // Compute edge scores if we have a player_id
  let edgeScore = 0;
  let fcScore: number | null = null;
  let ktcScore: number | null = null;
  let dpScore: number | null = null;
  let sourcesAvailable = 0;

  if (pm) {
    const mode: "sf" | "1qb" = "sf"; // default to SF for player detail
    const compMap = await getCompositeValues([pm.player_id], mode);
    const comp = compMap.get(pm.player_id);
    if (comp) {
      const inputs = [{ sleeper_id: pm.player_id, fc_value: comp.fc_value, ktc_value: comp.ktc_value, dp_value: comp.dp_value }];
      const edgeMap = computeEdgeScores(inputs);
      const e = edgeMap.get(pm.player_id);
      if (e) {
        edgeScore = e.score;
        fcScore = e.fc_score;
        ktcScore = e.ktc_score;
        dpScore = e.dp_score;
        sourcesAvailable = e.sources_used;
      }
    }
  }

  const position = pm?.position ?? fcSummary?.position ?? null;
  const age = pm?.age ?? null;
  const ageCurve = getAgeCurveStatus(position ?? "", age);

  const ownedLeagues = ownershipRows as unknown as OwnershipEntry[];

  const summary: PlayerSummary = {
    player_name: pm?.full_name ?? fcSummary?.player_name ?? playerName,
    position,
    team: fcSummary?.team ?? null,
    age,
    dynasty_value: fcSummary?.dynasty_value ?? null,
    trend_30day: fcSummary?.trend_30day ?? null,
    overall_rank: fcSummary?.overall_rank ?? null,
    edge_score: edgeScore,
    fc_score: fcScore,
    ktc_score: ktcScore,
    dp_score: dpScore,
    sources_available: sourcesAvailable,
    source_agreement: scoreAgreement([fcScore, ktcScore, dpScore]),
    age_curve: ageCurve,
  };

  const prospect = (prospectRows as unknown as ProspectInfo[])[0] ?? null;
  const recommendation = (recRows as unknown as RecInfo[])[0] ?? null;

  return {
    summary,
    valueHistory: historyRows as unknown as ValuePoint[],
    ownership: ownedLeagues,
    exposure: {
      owned_leagues: ownedLeagues.length,
      total_leagues: dynastyLeagueIds.length,
      exposure_pct: dynastyLeagueIds.length > 0 ? Math.round((ownedLeagues.length / dynastyLeagueIds.length) * 100) : 0,
    },
    mentions: mentionRows as unknown as Mention[],
    prospect,
    recommendation,
  };
}
