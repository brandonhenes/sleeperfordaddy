import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";
import type { SourceWeights } from "./edge-score.js";
import { getCompositeValues } from "./composite-values.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import { resolvePlayer } from "./player-resolver.js";
import { scoreAgreement } from "../lib/score-agreement.js";

export interface PlayerSummary {
  player_id: string | null;
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
  pffRank?: number | null;
  pffGrade2025?: number | null;
  pffWaa2025?: number | null;
  dolittleScore?: number | null;
  dolittleGames?: number | null;
  dolittleConfidence?: "HIGH" | "MED" | "LOW" | null;
  consensusAdp?: string | null;
  consensusAdpRank?: number | null;
  nflTeam?: string | null;
  nflPick?: number | null;
}

export interface RecInfo {
  direction: string;
  fc_at_rec: number | null;
  rationale: string | null;
  rec_date: string;
}

export interface TradeComp {
  trade_id: string;
  league_name: string;
  date: string;
  gave: string[];
  received: string[];
}

export interface PlayerDetail {
  summary: PlayerSummary;
  valueHistory: ValuePoint[];
  ownership: OwnershipEntry[];
  exposure: ExposureInfo;
  mentions: Mention[];
  prospect: ProspectInfo | null;
  recommendation: RecInfo | null;
  recent_trades: TradeComp[];
}

export interface ComparablePlayer {
  player_name: string;
  position: string;
  team: string | null;
  age: number | null;
  edge_score: number;
}

export async function getPlayerDetail(
  playerName: string,
  username: string,
  weights?: SourceWeights
): Promise<PlayerDetail | null> {
  const normalizedInput = playerName.trim();
  if (!normalizedInput) return null;

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
  const pm = await resolvePlayer(normalizedInput);
  const resolvedName = pm?.full_name ?? normalizedInput;

  const [summaryRows, historyRows, ownershipRows, mentionRows, prospectRows, recRows] =
    await Promise.all([
      // Summary from latest FC snapshot
      db.execute(sql`
        SELECT player_name, position, team,
               dynasty_value::int, trend_30day::int, overall_rank::int
        FROM fantasycalc_daily
        WHERE (
          (
            ${pm?.player_id ?? null}::text IS NOT NULL
            AND sleeper_id = ${pm?.player_id ?? null}
          )
          OR LOWER(player_name) = LOWER(${resolvedName})
        )
          AND snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        LIMIT 1
      `),

      // Value history (last 90 days)
      db.execute(sql`
        SELECT snapshot_date AS date, dynasty_value::int AS value
        FROM fantasycalc_daily
        WHERE (
          (
            ${pm?.player_id ?? null}::text IS NOT NULL
            AND sleeper_id = ${pm?.player_id ?? null}
          )
          OR LOWER(player_name) = LOWER(${resolvedName})
        )
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
        WHERE LOWER(player_name) = LOWER(${resolvedName})
        ORDER BY mention_date DESC
        LIMIT 10
      `),

      // Prospect profile
      db.execute(sql`
        SELECT school, tier, consensus_comp, key_strengths,
               draft_capital, notes
        FROM prospect_profiles
        WHERE LOWER(player_name) = LOWER(${resolvedName})
        LIMIT 1
      `),

      // Recommendation
      db.execute(sql`
        SELECT direction, fc_at_rec, rationale, rec_date
        FROM recommendations
        WHERE LOWER(player_name) = LOWER(${resolvedName})
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
    const compMap = await getCompositeValues([pm.player_id], mode, weights);
    const comp = compMap.get(pm.player_id);
    if (comp) {
      edgeScore = comp.edge_score;
      fcScore = comp.fc_score;
      ktcScore = comp.ktc_score;
      dpScore = comp.dp_score;
      sourcesAvailable = comp.sources_available;
    }
  }

  const position = pm?.position ?? fcSummary?.position ?? null;
  const age = pm?.age ?? null;
  const ageCurve = getAgeCurveStatus(position ?? "", age);

  const ownedLeagues = ownershipRows as unknown as OwnershipEntry[];

  const summary: PlayerSummary = {
    player_id: pm?.player_id ?? null,
    player_name: pm?.full_name ?? fcSummary?.player_name ?? normalizedInput,
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

  // ─── Recent Trades ───
  let recentTrades: TradeComp[] = [];
  if (pm?.player_id) {
    const tradeRows = await db.execute(sql`
      SELECT ta.trade_id, ta.created_at_ms, l.name AS league_name
      FROM trade_assets ta
      JOIN leagues l ON ta.league_id = l.league_id
      WHERE ta.asset_type = 'player' AND ta.asset_key = ${pm.player_id}
      GROUP BY ta.trade_id, ta.created_at_ms, l.name
      ORDER BY ta.created_at_ms DESC
      LIMIT 10
    `);
    type TR = { trade_id: string; created_at_ms: number; league_name: string };
    const tradeIds = (tradeRows as unknown as TR[]);
    if (tradeIds.length > 0) {
      const idFrags = tradeIds.map((t) => sql`${t.trade_id}`);
      const allAssets = await db.execute(sql`
        SELECT
          ta.trade_id,
          ta.roster_id,
          ta.asset_type,
          ta.asset_key,
          CASE
            WHEN ta.asset_type = 'player' AND pm.full_name IS NOT NULL
              THEN pm.full_name || ' (' || COALESCE(pm.position, '') || ')'
            WHEN ta.asset_type = 'pick'
              THEN COALESCE(ta.asset_name, ta.asset_key)
            ELSE COALESCE(ta.asset_name, ta.asset_key)
          END AS label
        FROM trade_assets ta
        LEFT JOIN players_master pm
          ON ta.asset_type = 'player' AND ta.asset_key = pm.player_id
        WHERE ta.trade_id IN (${sql.join(idFrags, sql`, `)})
          AND ta.direction = 'gave'
      `);
      type AR = {
        trade_id: string;
        roster_id: number;
        asset_type: string;
        asset_key: string;
        label: string;
      };
      const assetMap = new Map<string, { gave: string[]; received: string[] }>();

      // Find which roster_id had the target player in each trade
      const playerRoster = new Map<string, number>();
      for (const a of allAssets as unknown as AR[]) {
        if (a.asset_type === "player" && a.asset_key === pm.player_id) {
          playerRoster.set(a.trade_id, a.roster_id);
        }
      }

      for (const a of allAssets as unknown as AR[]) {
        const rid = playerRoster.get(a.trade_id);
        if (rid == null) continue;
        const entry = assetMap.get(a.trade_id) ?? { gave: [], received: [] };
        if (a.roster_id === rid) {
          entry.gave.push(a.label);
        } else {
          entry.received.push(a.label);
        }
        assetMap.set(a.trade_id, entry);
      }

      recentTrades = tradeIds.map((t) => {
        const assets = assetMap.get(t.trade_id) ?? { gave: [], received: [] };
        const createdAt = Number(t.created_at_ms);
        const date = Number.isFinite(createdAt) && createdAt > 0
          ? new Date(createdAt).toISOString().slice(0, 10)
          : "";
        return {
          trade_id: t.trade_id,
          league_name: t.league_name,
          date,
          gave: assets.gave,
          received: assets.received,
        };
      });
    }
  }

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
    recent_trades: recentTrades,
  };
}

export async function getPlayerComparables(
  playerName: string,
  limit = 5,
  weights?: SourceWeights
): Promise<ComparablePlayer[]> {
  const target = await resolvePlayer(playerName);
  if (!target) return [];

  const candidateRows = await db.execute(sql`
    SELECT player_id, full_name, position, team, age
    FROM players_master
    WHERE position = ${target.position}
      AND player_id <> ${target.player_id}
  `);
  const candidates = candidateRows as unknown as Array<{
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    age: number | null;
  }>;
  if (candidates.length === 0) return [];

  const ids = [target.player_id, ...candidates.map((c) => c.player_id)];
  const compMap = await getCompositeValues(ids, "sf", weights);
  const targetEdge = compMap.get(target.player_id)?.edge_score ?? 0;
  if (targetEdge <= 0) return [];

  const max = Math.max(1, Math.min(limit, 20));
  return candidates
    .map((c) => ({
      player_name: c.full_name,
      position: c.position,
      team: c.team,
      age: c.age,
      edge_score: compMap.get(c.player_id)?.edge_score ?? 0,
    }))
    .filter((c) => c.edge_score > 0 && Math.abs(c.edge_score - targetEdge) <= 10)
    .sort((a, b) => Math.abs(a.edge_score - targetEdge) - Math.abs(b.edge_score - targetEdge) || b.edge_score - a.edge_score)
    .slice(0, max);
}
