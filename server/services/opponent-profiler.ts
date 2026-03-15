import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { opponent_profiles } from "../db/schema.js";
import { getLeague, getLeagueUsers } from "../sleeper/leagues.js";
import { getLeagueRosters } from "../sleeper/rosters.js";
import { getLeagueTransactions } from "../sleeper/transactions.js";
import { getPowerRankings } from "./power-rankings.js";
import type {
  ExploitAngle,
  OpponentProfile,
  RecentTrade,
  SleeperLeague,
  SleeperRoster,
  SleeperTransaction,
} from "../../shared/types.js";

type PlayerMeta = {
  player_id: string;
  full_name: string | null;
  position: string | null;
  age: number | null;
};

type ProfileAccumulator = {
  leagueId: string;
  rosterId: number;
  ownerId: string | null;
  displayName: string;
  season: string;
  totalTrades: number;
  totalWaiverMoves: number;
  positionsAcquired: Map<string, number>;
  positionsSold: Map<string, number>;
  waiverTargets: Map<string, number>;
  agesAcquired: number[];
  agesSold: number[];
  picksAcquired: number;
  picksSold: number;
  recentTrades: RecentTrade[];
  tradePartners: Map<string, number>;
  seasons: Set<string>;
};

const PROFILE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePosition(position: string | null | undefined): string | null {
  const value = String(position ?? "").toUpperCase();
  if (POSITION_ORDER.includes(value as (typeof POSITION_ORDER)[number])) {
    return value;
  }
  return null;
}

function incrementCount(map: Map<string, number>, key: string | null | undefined, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function activityLevelFrom(totalTrades: number): OpponentProfile["activityLevel"] {
  if (totalTrades >= 15) return "hyperactive";
  if (totalTrades >= 8) return "active";
  if (totalTrades >= 3) return "moderate";
  if (totalTrades >= 1) return "passive";
  return "inactive";
}

function ageBiasFrom(avgAgeAcquired: number | null, avgAgeSold: number | null): OpponentProfile["ageBias"] {
  if (avgAgeAcquired == null || avgAgeSold == null) return "neutral";
  const delta = avgAgeSold - avgAgeAcquired;
  if (delta > 2) return "youth_chaser";
  if (delta > 0.5) return "leans_young";
  if (delta < -2) return "win_now_buyer";
  if (delta < -0.5) return "leans_vet";
  return "neutral";
}

function pickTendencyFrom(picksAcquired: number, picksSold: number): OpponentProfile["pickTendency"] {
  const net = picksAcquired - picksSold;
  if (net >= 3) return "hoarder";
  if (net >= 1) return "accumulator";
  if (net <= -3) return "spender";
  if (net <= -1) return "seller";
  return "neutral";
}

function parseJsonRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, raw]) => [
      key,
      Number(raw ?? 0) || 0,
    ])
  );
}

function parseRecentTrades(value: unknown): RecentTrade[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = entry as Partial<RecentTrade>;
      if (!item || typeof item !== "object") return null;
      return {
        transactionId: String(item.transactionId ?? ""),
        season: String(item.season ?? ""),
        date: String(item.date ?? ""),
        partnerRosterId:
          item.partnerRosterId == null ? null : Number(item.partnerRosterId),
        partnerDisplayName:
          item.partnerDisplayName == null ? null : String(item.partnerDisplayName),
        acquired: Array.isArray(item.acquired)
          ? item.acquired.map((asset) => String(asset))
          : [],
        sold: Array.isArray(item.sold)
          ? item.sold.map((asset) => String(asset))
          : [],
      };
    })
    .filter((item): item is RecentTrade => !!item && !!item.transactionId);
}

function coerceProfile(row: typeof opponent_profiles.$inferSelect, isStale: boolean): OpponentProfile {
  return {
    leagueId: row.league_id,
    rosterId: row.roster_id,
    ownerId: row.owner_id,
    displayName: row.display_name ?? `Roster ${row.roster_id}`,
    season: row.season,
    totalTrades: row.total_trades ?? 0,
    totalWaiverMoves: row.total_waiver_moves ?? 0,
    activityLevel: (row.activity_level as OpponentProfile["activityLevel"]) ?? "inactive",
    positionsAcquired: parseJsonRecord(row.positions_acquired),
    positionsSold: parseJsonRecord(row.positions_sold),
    waiverTargets: parseJsonRecord(row.waiver_targets),
    avgAgeAcquired: row.avg_age_acquired ?? null,
    avgAgeSold: row.avg_age_sold ?? null,
    ageBias: (row.age_bias as OpponentProfile["ageBias"]) ?? "neutral",
    picksAcquired: row.picks_acquired ?? 0,
    picksSold: row.picks_sold ?? 0,
    pickTendency: (row.pick_tendency as OpponentProfile["pickTendency"]) ?? "neutral",
    recentTrades: parseRecentTrades(row.recent_trades),
    tradePartners: parseJsonRecord(row.trade_partners),
    profiledAt:
      row.profiled_at instanceof Date
        ? row.profiled_at.toISOString()
        : row.profiled_at
          ? String(row.profiled_at)
          : new Date(0).toISOString(),
    seasonsAnalyzed: row.seasons_analyzed ?? 1,
    isStale,
  };
}

async function getLeagueChain(leagueId: string, maxLeagues = 3): Promise<SleeperLeague[]> {
  const chain: SleeperLeague[] = [];
  let currentLeagueId: string | null = leagueId;

  while (currentLeagueId && chain.length < maxLeagues) {
    const league = await getLeague(currentLeagueId);
    if (!league) break;
    chain.push(league);
    currentLeagueId = league.previous_league_id ?? null;
  }

  return chain;
}

async function loadPlayerMeta(playerIds: string[]): Promise<Map<string, PlayerMeta>> {
  const uniqueIds = [...new Set(playerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db.execute(sql`
    SELECT player_id, full_name, position, age
    FROM players_master
    WHERE player_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const map = new Map<string, PlayerMeta>();
  for (const row of rows as unknown as PlayerMeta[]) {
    map.set(row.player_id, row);
  }
  return map;
}

function buildPickLabel(season: string, round: number): string {
  const suffix =
    round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
  return `${season} ${suffix}`;
}

function topPositionLabel(counts: Record<string, number>, fallback: string): string {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? fallback;
}

function getTendencyStrength(profile: OpponentProfile): number {
  const acquired = Object.values(profile.positionsAcquired);
  const sold = Object.values(profile.positionsSold);
  const acquiredSpread = acquired.length > 0 ? Math.max(...acquired) - Math.min(...acquired) : 0;
  const soldSpread = sold.length > 0 ? Math.max(...sold) - Math.min(...sold) : 0;
  const ageWeight =
    profile.ageBias === "youth_chaser" || profile.ageBias === "win_now_buyer"
      ? 30
      : profile.ageBias === "leans_young" || profile.ageBias === "leans_vet"
        ? 15
        : 0;
  const pickWeight =
    profile.pickTendency === "hoarder" || profile.pickTendency === "spender"
      ? 20
      : profile.pickTendency === "accumulator" || profile.pickTendency === "seller"
        ? 10
        : 0;
  return Math.min(100, acquiredSpread * 8 + soldSpread * 6 + ageWeight + pickWeight);
}

function getRosterGapScore(slotGrades: Array<{ grade: string }> | undefined): number {
  if (!slotGrades || slotGrades.length === 0) return 0;
  let score = 0;
  for (const grade of slotGrades) {
    if (grade.grade === "hole") score += 22;
    else if (grade.grade === "weak") score += 12;
    else if (grade.grade === "average") score += 4;
  }
  return Math.min(100, score);
}

export async function profileLeagueOpponents(
  leagueId: string,
  username: string
): Promise<OpponentProfile[]> {
  const chain = await getLeagueChain(leagueId, 3);
  const currentLeague = chain[0];
  if (!currentLeague) return [];

  const [currentRosters, currentUsers] = await Promise.all([
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);

  const displayNameByOwner = new Map<string, string>();
  for (const user of currentUsers) {
    if (!user.user_id) continue;
    displayNameByOwner.set(user.user_id, user.display_name || user.user_id);
  }

  const currentRosterByOwner = new Map<string, number>();
  const currentOwnerByRoster = new Map<number, string>();
  const accumulators = new Map<string, ProfileAccumulator>();
  for (const roster of currentRosters) {
    if (!roster.owner_id) continue;
    currentRosterByOwner.set(roster.owner_id, roster.roster_id);
    currentOwnerByRoster.set(roster.roster_id, roster.owner_id);
    accumulators.set(roster.owner_id, {
      leagueId,
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      displayName:
        displayNameByOwner.get(roster.owner_id) ?? `Roster ${roster.roster_id}`,
      season: currentLeague.season,
      totalTrades: 0,
      totalWaiverMoves: 0,
      positionsAcquired: new Map(),
      positionsSold: new Map(),
      waiverTargets: new Map(),
      agesAcquired: [],
      agesSold: [],
      picksAcquired: 0,
      picksSold: 0,
      recentTrades: [],
      tradePartners: new Map(),
      seasons: new Set([currentLeague.season]),
    });
  }

  const allPlayerIds = new Set<string>();
  const historicalContexts: Array<{
    league: SleeperLeague;
    rosters: SleeperRoster[];
    ownerByRoster: Map<number, string>;
  }> = [];

  for (const league of chain) {
    const rosters = await getLeagueRosters(league.league_id);
    const ownerByRoster = new Map<number, string>();
    for (const roster of rosters) {
      if (!roster.owner_id) continue;
      ownerByRoster.set(roster.roster_id, roster.owner_id);
      const accumulator = accumulators.get(roster.owner_id);
      if (accumulator) accumulator.seasons.add(league.season);
    }
    historicalContexts.push({ league, rosters, ownerByRoster });

    for (let week = 0; week <= 18; week += 1) {
      const transactions = await getLeagueTransactions(league.league_id, week);
      for (const tx of transactions) {
        for (const playerId of Object.keys(tx.adds ?? {})) allPlayerIds.add(playerId);
        for (const playerId of Object.keys(tx.drops ?? {})) allPlayerIds.add(playerId);
      }
      await sleep(100);
    }
  }

  const playerMeta = await loadPlayerMeta([...allPlayerIds]);

  for (const context of historicalContexts) {
    const { league, ownerByRoster } = context;

    for (let week = 0; week <= 18; week += 1) {
      const transactions = await getLeagueTransactions(league.league_id, week);

      for (const tx of transactions) {
        if (tx.status !== "complete") continue;

        const txDate = new Date(tx.status_updated || tx.created || Date.now()).toISOString();
        const rosterIds = Array.isArray(tx.roster_ids) ? tx.roster_ids : [];

        if (tx.type === "trade") {
          for (const historicalRosterId of rosterIds) {
            const ownerId = ownerByRoster.get(historicalRosterId);
            if (!ownerId) continue;
            const accumulator = accumulators.get(ownerId);
            if (!accumulator) continue;

            accumulator.totalTrades += 1;

            const partnerRosterIds = rosterIds
              .filter((rosterId) => rosterId !== historicalRosterId)
              .map((partnerHistoricalRosterId) => {
                const partnerOwnerId = ownerByRoster.get(partnerHistoricalRosterId);
                return partnerOwnerId
                  ? String(
                      currentRosterByOwner.get(partnerOwnerId) ??
                        partnerHistoricalRosterId
                    )
                  : String(partnerHistoricalRosterId);
              });

            for (const partnerRosterId of partnerRosterIds) {
              incrementCount(accumulator.tradePartners, partnerRosterId);
            }

            const acquired: string[] = [];
            const sold: string[] = [];

            for (const [playerId, receivingRosterId] of Object.entries(tx.adds ?? {})) {
              if (Number(receivingRosterId) !== historicalRosterId) continue;
              const meta = playerMeta.get(playerId);
              const position = normalizePosition(meta?.position);
              incrementCount(accumulator.positionsAcquired, position);
              if (meta?.age != null) accumulator.agesAcquired.push(meta.age);
              acquired.push(meta?.full_name ?? `Player ${playerId}`);
            }

            for (const [playerId, sendingRosterId] of Object.entries(tx.drops ?? {})) {
              if (Number(sendingRosterId) !== historicalRosterId) continue;
              const meta = playerMeta.get(playerId);
              const position = normalizePosition(meta?.position);
              incrementCount(accumulator.positionsSold, position);
              if (meta?.age != null) accumulator.agesSold.push(meta.age);
              sold.push(meta?.full_name ?? `Player ${playerId}`);
            }

            for (const pick of tx.draft_picks ?? []) {
              if (pick.owner_id === historicalRosterId) {
                accumulator.picksAcquired += 1;
                acquired.push(buildPickLabel(pick.season, pick.round));
              }
              if (pick.previous_owner_id === historicalRosterId) {
                accumulator.picksSold += 1;
                sold.push(buildPickLabel(pick.season, pick.round));
              }
            }

            if (acquired.length > 0 || sold.length > 0) {
              const primaryPartnerRosterId = partnerRosterIds[0]
                ? Number(partnerRosterIds[0])
                : null;
              const primaryPartnerOwnerId = primaryPartnerRosterId != null
                ? currentOwnerByRoster.get(primaryPartnerRosterId) ?? null
                : null;
              accumulator.recentTrades.push({
                transactionId: tx.transaction_id,
                season: league.season,
                date: txDate,
                partnerRosterId: primaryPartnerRosterId,
                partnerDisplayName: primaryPartnerOwnerId
                  ? displayNameByOwner.get(primaryPartnerOwnerId) ?? null
                  : null,
                acquired,
                sold,
              });
            }
          }
          continue;
        }

        if (tx.type !== "waiver" && tx.type !== "free_agent") continue;

        const touchedOwners = new Set<string>();
        for (const historicalRosterId of rosterIds) {
          const ownerId = ownerByRoster.get(historicalRosterId);
          if (!ownerId || touchedOwners.has(ownerId)) continue;
          const accumulator = accumulators.get(ownerId);
          if (!accumulator) continue;
          accumulator.totalWaiverMoves += 1;
          touchedOwners.add(ownerId);
        }

        for (const [playerId, receivingRosterId] of Object.entries(tx.adds ?? {})) {
          const ownerId = ownerByRoster.get(Number(receivingRosterId));
          if (!ownerId) continue;
          const accumulator = accumulators.get(ownerId);
          if (!accumulator) continue;
          const meta = playerMeta.get(playerId);
          const position = normalizePosition(meta?.position);
          incrementCount(accumulator.waiverTargets, position);
        }
      }

      await sleep(100);
    }
  }

  const rows = [...accumulators.values()].map((accumulator) => {
    const avgAgeAcquired = average(accumulator.agesAcquired);
    const avgAgeSold = average(accumulator.agesSold);
    return {
      league_id: accumulator.leagueId,
      roster_id: accumulator.rosterId,
      owner_id: accumulator.ownerId,
      display_name: accumulator.displayName,
      season: accumulator.season,
      total_trades: accumulator.totalTrades,
      total_waiver_moves: accumulator.totalWaiverMoves,
      activity_level: activityLevelFrom(accumulator.totalTrades),
      positions_acquired: toRecord(accumulator.positionsAcquired),
      positions_sold: toRecord(accumulator.positionsSold),
      waiver_targets: toRecord(accumulator.waiverTargets),
      avg_age_acquired: avgAgeAcquired,
      avg_age_sold: avgAgeSold,
      age_bias: ageBiasFrom(avgAgeAcquired, avgAgeSold),
      picks_acquired: accumulator.picksAcquired,
      picks_sold: accumulator.picksSold,
      pick_tendency: pickTendencyFrom(
        accumulator.picksAcquired,
        accumulator.picksSold
      ),
      recent_trades: accumulator.recentTrades
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
      trade_partners: toRecord(accumulator.tradePartners),
      seasons_analyzed: accumulator.seasons.size,
    };
  });

  await db
    .delete(opponent_profiles)
    .where(
      and(
        eq(opponent_profiles.league_id, leagueId),
        eq(opponent_profiles.season, currentLeague.season)
      )
    );

  if (rows.length > 0) {
    await db.insert(opponent_profiles).values(rows);
  }

  const stored = await getStoredProfiles(leagueId);
  const powerRankings = await getPowerRankings(username);
  const league = powerRankings.find((entry) => entry.league_id === leagueId);
  const myRosterId = league?.rosters.find((roster) => roster.is_user)?.roster_id ?? null;

  return stored.filter((profile) => profile.rosterId !== myRosterId);
}

export async function getStoredProfiles(leagueId: string): Promise<OpponentProfile[]> {
  const rows = await db
    .select()
    .from(opponent_profiles)
    .where(eq(opponent_profiles.league_id, leagueId))
    .orderBy(desc(opponent_profiles.profiled_at));

  const latestProfiledAt = rows[0]?.profiled_at
    ? new Date(rows[0].profiled_at as unknown as string | Date).getTime()
    : 0;
  const isStale =
    latestProfiledAt > 0 ? Date.now() - latestProfiledAt > PROFILE_STALE_MS : true;

  return rows.map((row) => coerceProfile(row, isStale));
}

export async function getExploitAngles(
  leagueId: string,
  opponentRosterId: number,
  myRosterId: number,
  username: string
): Promise<ExploitAngle[]> {
  const [profiles, powerRankings] = await Promise.all([
    getStoredProfiles(leagueId),
    getPowerRankings(username),
  ]);
  const profile = profiles.find((entry) => entry.rosterId === opponentRosterId);
  const league = powerRankings.find((entry) => entry.league_id === leagueId);
  const myRoster = league?.rosters.find((roster) => roster.roster_id === myRosterId);
  const oppRoster = league?.rosters.find((roster) => roster.roster_id === opponentRosterId);

  if (!profile || !league || !myRoster || !oppRoster) return [];

  const myPlayers = [...myRoster.core_assets].sort((a, b) => b.edge_score - a.edge_score);
  const oppPlayers = [...oppRoster.core_assets].sort((a, b) => b.edge_score - a.edge_score);
  const myPicks = [...(myRoster.draft_picks ?? [])].sort((a, b) => b.edge_score - a.edge_score);
  const oppPicks = [...(oppRoster.draft_picks ?? [])].sort((a, b) => b.edge_score - a.edge_score);

  const topAcquiredPos = topPositionLabel(profile.positionsAcquired, "WR");
  const topSoldPos = topPositionLabel(profile.positionsSold, "RB");
  const tendencyStrength = getTendencyStrength(profile);
  const rosterGapScore = getRosterGapScore(oppRoster.lineup?.slot_grades);
  const confidence: ExploitAngle["confidence"] =
    tendencyStrength + rosterGapScore >= 120
      ? "high"
      : tendencyStrength + rosterGapScore >= 70
        ? "medium"
        : "low";

  const myByPos = Object.fromEntries(
    POSITION_ORDER.map((position) => [
      position,
      myPlayers.filter((player) => player.position === position),
    ])
  ) as Record<(typeof POSITION_ORDER)[number], typeof myPlayers>;
  const oppByPos = Object.fromEntries(
    POSITION_ORDER.map((position) => [
      position,
      oppPlayers.filter((player) => player.position === position),
    ])
  ) as Record<(typeof POSITION_ORDER)[number], typeof oppPlayers>;

  const angles: ExploitAngle[] = [];

  if ((profile.positionsAcquired[topAcquiredPos] ?? 0) >= 3) {
    const myBait = myByPos[topAcquiredPos as (typeof POSITION_ORDER)[number]]?.[1]
      ?? myByPos[topAcquiredPos as (typeof POSITION_ORDER)[number]]?.[0];
    const theirReturn = oppByPos[topSoldPos as (typeof POSITION_ORDER)[number]]?.[0]
      ?? oppPlayers.find((player) => player.position !== topAcquiredPos);
    if (myBait && theirReturn) {
      angles.push({
        strategy: `Feed the ${topAcquiredPos} addiction`,
        offer: `Give: ${myBait.full_name} | Get: ${theirReturn.full_name}`,
        reasoning: `${profile.displayName} has historically acquired ${profile.positionsAcquired[topAcquiredPos] ?? 0} ${topAcquiredPos}s and frequently parts with ${topSoldPos}.`,
        tendencyExploited: `${topAcquiredPos} preference`,
        confidence,
      });
    }
  }

  if (profile.ageBias === "youth_chaser" || profile.ageBias === "leans_young") {
    const youngBait = myPlayers.find((player) => (player.age ?? 99) <= 25 && player.edge_score >= 50);
    const veteranTarget = oppPlayers.find((player) => (player.age ?? 0) >= 27 && player.edge_score >= 50);
    if (youngBait && veteranTarget) {
      angles.push({
        strategy: "Sell them youth, buy their points",
        offer: `Give: ${youngBait.full_name} | Get: ${veteranTarget.full_name}`,
        reasoning: `${profile.displayName} skews young on trades. Their average acquired age is ${profile.avgAgeAcquired ?? "n/a"} while they sell older players at ${profile.avgAgeSold ?? "n/a"}.`,
        tendencyExploited: profile.ageBias.replace(/_/g, " "),
        confidence,
      });
    }
  }

  if (profile.ageBias === "win_now_buyer" || profile.ageBias === "leans_vet") {
    const veteranSell = myPlayers.find((player) => (player.age ?? 0) >= 27 && player.edge_score >= 45);
    const youngTarget = oppPlayers.find((player) => (player.age ?? 99) <= 25 && player.edge_score >= 45);
    if (veteranSell && youngTarget) {
      angles.push({
        strategy: "Cash out veterans into youth",
        offer: `Give: ${veteranSell.full_name} | Get: ${youngTarget.full_name}`,
        reasoning: `${profile.displayName} buys older production. That lets you redirect one of your veterans into a younger asset while they chase points.`,
        tendencyExploited: profile.ageBias.replace(/_/g, " "),
        confidence,
      });
    }
  }

  if (profile.pickTendency === "hoarder" || profile.pickTendency === "accumulator") {
    const expendablePick = myPicks[0];
    const depthTarget = oppPlayers.find((player) => player.edge_score >= 45 && player.edge_score <= 65);
    if (expendablePick && depthTarget) {
      angles.push({
        strategy: "Use picks on the pick hoarder",
        offer: `Give: ${expendablePick.label} | Get: ${depthTarget.full_name}`,
        reasoning: `${profile.displayName} has a ${profile.pickTendency.replace(/_/g, " ")} profile with ${profile.picksAcquired} picks acquired against ${profile.picksSold} sold.`,
        tendencyExploited: profile.pickTendency.replace(/_/g, " "),
        confidence,
      });
    }
  }

  if ((profile.positionsSold[topSoldPos] ?? 0) >= 2) {
    const target = oppByPos[topSoldPos as (typeof POSITION_ORDER)[number]]?.[0];
    const sendBack = myPlayers.find((player) => player.position !== topSoldPos && player.edge_score >= 45);
    if (target && sendBack) {
      angles.push({
        strategy: `Target the ${topSoldPos} sell tendency`,
        offer: `Give: ${sendBack.full_name} | Get: ${target.full_name}`,
        reasoning: `${profile.displayName} has repeatedly moved ${topSoldPos}s in completed deals, which suggests a softer hold on that position.`,
        tendencyExploited: `${topSoldPos} sell tendency`,
        confidence,
      });
    }
  }

  if ((profile.tradePartners[String(myRosterId)] ?? 0) >= 2 && oppPicks[0]) {
    angles.push({
      strategy: "Lean into the existing trade relationship",
      offer: `Give: ${myPlayers[0]?.full_name ?? "one of your starters"} | Get: ${oppPicks[0].label}`,
      reasoning: `${profile.displayName} has already traded with your roster ${profile.tradePartners[String(myRosterId)]} times. Familiar trade partners are easier to reopen.`,
      tendencyExploited: "trade partner familiarity",
      confidence,
    });
  }

  return angles.slice(0, 5);
}
