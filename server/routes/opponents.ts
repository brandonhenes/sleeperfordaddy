import { Router } from "express";
import type { LeaguePowerRanking, OpponentProfile } from "@shared/types";
import { getLeagueUsers } from "../sleeper/leagues.js";
import { getLeagueRosters } from "../sleeper/rosters.js";
import { getPowerRankings } from "../services/power-rankings.js";
import {
  getExploitAngles,
  getStoredProfiles,
  profileLeagueOpponents,
} from "../services/opponent-profiler.js";

const router = Router();
const queuedProfileRefreshes = new Map<string, { leagueId: string; username: string }>();
let profileRefreshQueueRunning = false;

function fallbackProfilesFromLeague(league: LeaguePowerRanking, myRosterId: number | null): OpponentProfile[] {
  const now = new Date().toISOString();
  const season = String(new Date().getFullYear());
  return league.rosters
    .filter((roster) => roster.roster_id !== myRosterId)
    .map((roster) => ({
      leagueId: league.league_id,
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      displayName: roster.display_name || `Roster ${roster.roster_id}`,
      season,
      totalTrades: 0,
      totalWaiverMoves: 0,
      activityLevel: "inactive",
      positionsAcquired: {},
      positionsSold: {},
      waiverTargets: {},
      avgAgeAcquired: null,
      avgAgeSold: null,
      ageBias: "neutral",
      picksAcquired: 0,
      picksSold: 0,
      pickTendency: "neutral",
      recentTrades: [],
      tradePartners: {},
      profiledAt: now,
      seasonsAnalyzed: 0,
      isStale: true,
    }));
}

function fallbackProfile(
  league: LeaguePowerRanking,
  rosterId: number,
  ownerId: string | null,
  displayName: string
): OpponentProfile {
  const now = new Date().toISOString();
  return {
    leagueId: league.league_id,
    rosterId,
    ownerId,
    displayName: displayName || `Roster ${rosterId}`,
    season: String(new Date().getFullYear()),
    totalTrades: 0,
    totalWaiverMoves: 0,
    activityLevel: "inactive",
    positionsAcquired: {},
    positionsSold: {},
    waiverTargets: {},
    avgAgeAcquired: null,
    avgAgeSold: null,
    ageBias: "neutral",
    picksAcquired: 0,
    picksSold: 0,
    pickTendency: "neutral",
    recentTrades: [],
    tradePartners: {},
    profiledAt: now,
    seasonsAnalyzed: 0,
    isStale: true,
  };
}

async function completeFallbackProfilesFromLiveRosters(
  league: LeaguePowerRanking,
  myRosterId: number | null
): Promise<OpponentProfile[]> {
  const profileByRosterId = new Map<number, OpponentProfile>(
    fallbackProfilesFromLeague(league, myRosterId).map((profile) => [profile.rosterId, profile])
  );

  try {
    const [rosters, users] = await Promise.all([
      getLeagueRosters(league.league_id),
      getLeagueUsers(league.league_id),
    ]);
    const userById = new Map(users.map((user) => [user.user_id, user]));
    for (const roster of rosters) {
      if (roster.roster_id === myRosterId || profileByRosterId.has(roster.roster_id)) continue;
      const user = roster.owner_id ? userById.get(roster.owner_id) : undefined;
      const teamNameRaw = user?.metadata?.team_name;
      const teamName = typeof teamNameRaw === "string" ? teamNameRaw.trim() : "";
      const displayName = teamName || user?.display_name?.trim() || `Roster ${roster.roster_id}`;
      profileByRosterId.set(
        roster.roster_id,
        fallbackProfile(league, roster.roster_id, roster.owner_id, displayName)
      );
    }
  } catch (err) {
    console.warn("[opponents] Failed to complete live roster fallback:", err);
  }

  return [...profileByRosterId.values()].sort((a, b) => a.rosterId - b.rosterId);
}

async function drainProfileRefreshQueue(): Promise<void> {
  if (profileRefreshQueueRunning) return;
  profileRefreshQueueRunning = true;
  try {
    while (queuedProfileRefreshes.size > 0) {
      const [key, job] = queuedProfileRefreshes.entries().next().value as [string, { leagueId: string; username: string }];
      queuedProfileRefreshes.delete(key);
      try {
        await profileLeagueOpponents(job.leagueId, job.username);
      } catch (err) {
        console.error("[opponents] Background profile refresh failed:", err);
      }
    }
  } finally {
    profileRefreshQueueRunning = false;
  }
}

function queueProfileRefresh(leagueId: string, username: string): void {
  const key = `${leagueId}:${username.toLowerCase()}`;
  if (!queuedProfileRefreshes.has(key)) {
    queuedProfileRefreshes.set(key, { leagueId, username });
  }
  void drainProfileRefreshQueue();
}

function withCurrentRosterIdentity(
  profiles: OpponentProfile[],
  league: LeaguePowerRanking
): OpponentProfile[] {
  const liveNameByRosterId = new Map(
    league.rosters.map((roster) => [roster.roster_id, roster.display_name])
  );

  return profiles.map((profile) => {
    const liveName = liveNameByRosterId.get(profile.rosterId)?.trim();
    if (!liveName || liveName === profile.displayName) return profile;
    return { ...profile, displayName: liveName };
  });
}

router.post("/api/opponents/:leagueId/refresh", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const username = String(req.body?.username ?? "").trim();
    if (!leagueId || !username) {
      return res.status(400).json({ message: "leagueId and username are required" });
    }

    const rankings = await getPowerRankings(username);
    const league = rankings.find((entry) => entry.league_id === leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const myRosterId = league.rosters.find((roster) => roster.is_user)?.roster_id ?? null;
    const profiles = withCurrentRosterIdentity(
      await profileLeagueOpponents(leagueId, username),
      league
    );

    res.status(202).json({
      profiles,
      myRosterId,
      leagueName: league.league_name,
      lastProfiled: profiles[0]?.profiledAt ?? null,
      isStale: false,
    });
  } catch (err) {
    console.error("[opponents-refresh] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/api/opponents/:leagueId/:rosterId/exploits", async (req, res) => {
  try {
    const { leagueId, rosterId } = req.params;
    const username = String(req.query.username ?? "").trim();
    if (!leagueId || !rosterId || !username) {
      return res.status(400).json({ message: "leagueId, rosterId, and username are required" });
    }

    const rankings = await getPowerRankings(username);
    const league = rankings.find((entry) => entry.league_id === leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const myRosterId = league.rosters.find((roster) => roster.is_user)?.roster_id ?? null;
    if (myRosterId == null) {
      return res.status(404).json({ message: "User roster not found" });
    }

    const angles = await getExploitAngles(
      leagueId,
      Number(rosterId),
      myRosterId,
      username
    );
    res.json({ angles, myRosterId });
  } catch (err) {
    console.error("[opponent-exploits] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/api/opponents/:leagueId/:username", async (req, res) => {
  try {
    const { leagueId, username } = req.params;
    if (!leagueId || !username) {
      return res.status(400).json({ message: "leagueId and username are required" });
    }

    const rankings = await getPowerRankings(username);
    const league = rankings.find((entry) => entry.league_id === leagueId);
    if (!league) {
      return res.status(404).json({ message: "League not found" });
    }

    const myRosterId = league.rosters.find((roster) => roster.is_user)?.roster_id ?? null;
    const fallbackProfiles = await completeFallbackProfilesFromLiveRosters(league, myRosterId);
    const storedProfiles = await getStoredProfiles(leagueId);
    const hasStoredProfiles = storedProfiles.length > 0;
    const liveProfileCount = fallbackProfiles.length;
    if (
      !hasStoredProfiles ||
      storedProfiles.length < liveProfileCount ||
      storedProfiles.some((profile) => profile.isStale)
    ) {
      queueProfileRefresh(leagueId, username);
    }

    const profileByRosterId = new Map<number, OpponentProfile>(
      fallbackProfiles.map((profile) => [profile.rosterId, profile])
    );
    for (const profile of storedProfiles) {
      if (profile.rosterId !== myRosterId && profileByRosterId.has(profile.rosterId)) {
        profileByRosterId.set(profile.rosterId, profile);
      }
    }

    const filtered = withCurrentRosterIdentity(
      [...profileByRosterId.values()],
      league
    );
    res.json({
      profiles: filtered,
      myRosterId,
      leagueName: league.league_name,
      lastProfiled: filtered[0]?.profiledAt ?? null,
      isStale: filtered[0]?.isStale ?? true,
    });
  } catch (err) {
    console.error("[opponents] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
