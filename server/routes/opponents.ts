import { Router } from "express";
import { getPowerRankings } from "../services/power-rankings.js";
import {
  getExploitAngles,
  getStoredProfiles,
  profileLeagueOpponents,
} from "../services/opponent-profiler.js";

const router = Router();

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
    const profiles = await profileLeagueOpponents(leagueId, username);

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
    let profiles = await getStoredProfiles(leagueId);
    if (profiles.length === 0) {
      profiles = await profileLeagueOpponents(leagueId, username);
    }

    const filtered = profiles.filter((profile) => profile.rosterId !== myRosterId);
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
