import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getCompositeValues } from "./composite-values.js";
import { getDynastyLeagueIdsForUserLatestSeason } from "./dynasty-leagues.js";

const ARBITRAGE_TTL_MS = 30_000;
const arbitrageCache = new Map<string, { data: ArbitrageGap[]; expires: number }>();
const arbitrageInFlight = new Map<string, Promise<ArbitrageGap[]>>();

export function clearArbitrageCache(username?: string) {
  if (username) {
    const key = username.toLowerCase();
    arbitrageCache.delete(key);
    arbitrageInFlight.delete(key);
    return;
  }
  arbitrageCache.clear();
  arbitrageInFlight.clear();
}

// ─── Types ───

export interface ArbitrageGap {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  edge_score: number;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  owned_leagues: { league_id: string; league_name: string }[];
  free_leagues: { league_id: string; league_name: string }[];
  owned_count: number;
  free_count: number;
}

// ─── Main ───

export async function getFreeAgentGaps(username: string): Promise<ArbitrageGap[]> {
  const cacheKey = username.toLowerCase();
  const now = Date.now();
  const hit = arbitrageCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.data;

  const pending = arbitrageInFlight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const dynastyLeagueIds = await getDynastyLeagueIdsForUserLatestSeason(userId);
  if (dynastyLeagueIds.length === 0) return [];
  const leagueIdFrags = dynastyLeagueIds.map((id) => sql`${id}`);
  const leagueInClause = sql.join(leagueIdFrags, sql`, `);

  const leagueRows = await db.execute(sql`
    SELECT
      l.league_id,
      l.name AS league_name,
      l.total_rosters,
      COUNT(DISTINCT rp.owner_id)::int AS synced_owners
    FROM leagues l
    LEFT JOIN roster_players rp ON rp.league_id = l.league_id
    WHERE l.league_id IN (${leagueInClause})
    GROUP BY l.league_id, l.name, l.total_rosters
  `);

  type LeagueRow = { league_id: string; league_name: string; total_rosters: number | null; synced_owners: number };
  const allLeagues = leagueRows as unknown as LeagueRow[];
  const myLeagues = allLeagues.filter(
    (l) => l.total_rosters == null || l.synced_owners >= l.total_rosters
  );
  if (myLeagues.length === 0) return [];

  const myLeagueFrags = myLeagues.map((l) => sql`${l.league_id}`);
  const myLeagueInClause = sql.join(myLeagueFrags, sql`, `);

  const rosterRows = await db.execute(sql`
    SELECT
      rp.player_id,
      rp.league_id,
      rp.owner_id,
      l.name AS league_name,
      pm.full_name,
      pm.position,
      pm.team
    FROM roster_players rp
    JOIN leagues l ON rp.league_id = l.league_id
    JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${myLeagueInClause})
      AND pm.position IN ('QB', 'RB', 'WR', 'TE')
  `);

  type RosterRow = {
    player_id: string;
    league_id: string;
    owner_id: string;
    league_name: string;
    full_name: string;
    position: string;
    team: string | null;
  };
  const allRows = rosterRows as unknown as RosterRow[];
  if (allRows.length === 0) return [];

  const leagueNameMap = new Map(myLeagues.map((l) => [l.league_id, l.league_name]));
  const playerInfo = new Map<string, { full_name: string; position: string; team: string | null }>();
  const rosteredAnywhere = new Set<string>();
  const ownedLeaguesByPlayer = new Map<string, { league_id: string; league_name: string }[]>();

  for (const r of allRows) {
    playerInfo.set(r.player_id, {
      full_name: r.full_name,
      position: r.position,
      team: r.team,
    });
    rosteredAnywhere.add(`${r.league_id}:${r.player_id}`);
    if (r.owner_id === userId) {
      const list = ownedLeaguesByPlayer.get(r.player_id) ?? [];
      list.push({ league_id: r.league_id, league_name: r.league_name });
      ownedLeaguesByPlayer.set(r.player_id, list);
    }
  }

  const candidateRows: Array<{
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
    owned_leagues: { league_id: string; league_name: string }[];
    free_leagues: { league_id: string; league_name: string }[];
  }> = [];

  for (const [playerId, ownedLeagues] of ownedLeaguesByPlayer) {
    if (ownedLeagues.length < 2) continue;
    const freeLeagues: { league_id: string; league_name: string }[] = [];
    for (const l of myLeagues) {
      if (!rosteredAnywhere.has(`${l.league_id}:${playerId}`)) {
        freeLeagues.push({
          league_id: l.league_id,
          league_name: leagueNameMap.get(l.league_id) ?? l.league_id,
        });
      }
    }
    if (freeLeagues.length === 0) continue;
    const info = playerInfo.get(playerId);
    if (!info) continue;
    candidateRows.push({
      player_id: playerId,
      full_name: info.full_name,
      position: info.position,
      team: info.team,
      owned_leagues: ownedLeagues,
      free_leagues: freeLeagues,
    });
  }

  if (candidateRows.length === 0) return [];

  // Edge Scores via composite values (SF default for cross-league)
  const playerIds = candidateRows.map((r) => r.player_id);
  const compMap = await getCompositeValues(playerIds, "sf");

  const gaps: ArbitrageGap[] = [];
  for (const r of candidateRows) {
    const comp = compMap.get(r.player_id);
    if (!comp || comp.edge_score <= 0 || comp.sources_available < 2) continue;

    const free = r.free_leagues ?? [];
    const owned = r.owned_leagues ?? [];
    gaps.push({
      player_id: r.player_id,
      full_name: r.full_name,
      position: r.position,
      team: r.team,
      edge_score: comp.edge_score,
      fc_value: comp.fc_value ?? null,
      ktc_value: comp.ktc_value ?? null,
      dp_value: comp.dp_value ?? null,
      owned_leagues: owned,
      free_leagues: free,
      owned_count: owned.length,
      free_count: free.length,
    });
  }

  return gaps.sort((a, b) => b.edge_score - a.edge_score);
  })();

  arbitrageInFlight.set(cacheKey, work);
  try {
    const data = await work;
    arbitrageCache.set(cacheKey, { data, expires: Date.now() + ARBITRAGE_TTL_MS });
    return data;
  } finally {
    arbitrageInFlight.delete(cacheKey);
  }
}
