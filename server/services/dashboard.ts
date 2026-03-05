import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getPowerRankings, type LeaguePowerRanking } from "./power-rankings.js";
import { getScoreMovers, type Mover } from "./snapshot-scores.js";

// ─── Types ───

export interface SlotGradeInfo {
  avg_score: number;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
}

export interface ActionFeedItem {
  type: "sell_high" | "buy_low" | "roster_move";
  title: string;
  player_name: string;
  position: string;
  edge_score: number;
  signal: string;
  leagues: string[];
}

export interface DashboardData {
  actions_feed: ActionFeedItem[];
  empire: {
    total_leagues: number;
    avg_starter_score: number;
    archetypes: { name: string; count: number }[];
    strongest_league: { name: string; avg_score: number };
    weakest_league: { name: string; avg_score: number };
  };
  roster_holes: Array<{
    league_name: string;
    league_id: string;
    slot_label: string;
    player_name: string;
    position: string;
    edge_score: number;
  }>;
  source_movers: {
    has_data: boolean;
    risers: Array<Mover & { leagues_owned: number }>;
    fallers: Array<Mover & { leagues_owned: number }>;
  };
  league_health: Array<{
    league_name: string;
    league_id: string;
    archetype: string;
    qb_grade: SlotGradeInfo;
    rb_grade: SlotGradeInfo;
    wr_grade: SlotGradeInfo;
    te_grade: SlotGradeInfo;
  }>;
  exposure: Array<{
    player_id: string;
    full_name: string;
    position: string;
    edge_score: number;
    leagues_owned: number;
    total_leagues: number;
    pct: number;
  }>;
  archetype_actions: Array<{
    archetype: string;
    strategy: string;
    leagues: Array<{ name: string; league_id: string; avg_score: number }>;
  }>;
}

// ─── Archetype Strategies ───

const STRATEGIES: Record<string, string> = {
  "Dynasty Juggernaut": "Maintain dominance. Don't overpay to improve marginal positions. Your depth is your edge.",
  "All-In Contender": "Win now. You've sold future capital for present strength. Maximize this window.",
  "Fragile Contender": "Aging core with current strength. Sell declining assets at peak value before the cliff.",
  "Productive Struggle": "Smart rebuild in progress. Hold young assets and draft capital. Don't panic-buy veterans.",
  "Rebuilder": "Full rebuild. Accumulate picks and young players. Trade any veteran with value for future assets.",
  "Dead Zone": "Stuck in the middle. Pick a direction: either sell vets for picks or buy young talent to compete. Staying here is the worst outcome.",
  "Competitor": "Solid middle of the pack. Look for small upgrades that push you into contention without mortgaging the future.",
};

function gradeFromAvg(avg: number): SlotGradeInfo["grade"] {
  if (avg >= 88) return "elite";
  if (avg >= 78) return "strong";
  if (avg >= 68) return "average";
  if (avg >= 55) return "weak";
  return "hole";
}

function emptyGrade(): SlotGradeInfo {
  return { avg_score: 0, grade: "hole" };
}

// ─── Main ───

export async function getDashboardData(username: string): Promise<DashboardData | null> {
  const rankings = await getPowerRankings(username);
  if (rankings.length === 0) return null;

  const totalLeagues = rankings.length;

  // Extract user roster from each league
  const userRosters = rankings.map((l) => ({
    league: l,
    roster: l.rosters.find((r) => r.is_user),
  })).filter((x): x is { league: LeaguePowerRanking; roster: NonNullable<typeof x.roster> } => x.roster != null);

  // ─── Empire Overview ───
  const avgScores = userRosters.map((x) => x.roster.avg_starter_score);
  const avgStarterScore = avgScores.length > 0
    ? Math.round((avgScores.reduce((a, v) => a + v, 0) / avgScores.length) * 10) / 10
    : 0;

  const archCounts = new Map<string, number>();
  for (const x of userRosters) {
    const a = x.roster.archetype;
    archCounts.set(a, (archCounts.get(a) ?? 0) + 1);
  }
  const archetypes = [...archCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  let strongest = { name: "—", avg_score: 0 };
  let weakest = { name: "—", avg_score: 999 };
  for (const x of userRosters) {
    if (x.roster.avg_starter_score > strongest.avg_score) {
      strongest = { name: x.league.league_name, avg_score: x.roster.avg_starter_score };
    }
    if (x.roster.avg_starter_score < weakest.avg_score) {
      weakest = { name: x.league.league_name, avg_score: x.roster.avg_starter_score };
    }
  }
  if (userRosters.length === 0) weakest = { name: "—", avg_score: 0 };

  // ─── Roster Holes ───
  const holes: DashboardData["roster_holes"] = [];
  for (const x of userRosters) {
    const starters = x.roster.lineup?.starters ?? [];
    for (const s of starters) {
      holes.push({
        league_name: x.league.league_name,
        league_id: x.league.league_id,
        slot_label: s.slot_label,
        player_name: s.full_name,
        position: s.position,
        edge_score: s.edge_score,
      });
    }
  }
  holes.sort((a, b) => a.edge_score - b.edge_score);
  const rosterHoles = holes.slice(0, 10);

  // ─── Source Movers ───
  // Collect all player IDs user owns across leagues
  const ownedPlayerIds = new Set<string>();
  const playerLeagueCount = new Map<string, number>();
  const playerInfo = new Map<string, { full_name: string; position: string; edge_score: number }>();
  for (const x of userRosters) {
    for (const a of x.roster.core_assets) {
      ownedPlayerIds.add(a.player_id);
      playerLeagueCount.set(a.player_id, (playerLeagueCount.get(a.player_id) ?? 0) + 1);
      if (!playerInfo.has(a.player_id) || a.edge_score > (playerInfo.get(a.player_id)!.edge_score)) {
        playerInfo.set(a.player_id, { full_name: a.full_name, position: a.position, edge_score: a.edge_score });
      }
    }
  }

  const moversRaw = await getScoreMovers([...ownedPlayerIds]);
  let sourceMovers: DashboardData["source_movers"];
  if (!moversRaw) {
    sourceMovers = { has_data: false, risers: [], fallers: [] };
  } else {
    sourceMovers = {
      has_data: true,
      risers: moversRaw.risers.map((m) => ({ ...m, leagues_owned: playerLeagueCount.get(m.player_id) ?? 0 })),
      fallers: moversRaw.fallers.map((m) => ({ ...m, leagues_owned: playerLeagueCount.get(m.player_id) ?? 0 })),
    };
  }

  // ─── League Health Heatmap ───
  const leagueHealth: DashboardData["league_health"] = [];
  for (const x of userRosters) {
    const grades = x.roster.lineup?.slot_grades ?? [];
    const gradeMap = new Map(grades.map((g) => [g.slot_label, g]));
    const qb = gradeMap.get("QB");
    const rb = gradeMap.get("RB");
    const wr = gradeMap.get("WR");
    const te = gradeMap.get("TE");
    leagueHealth.push({
      league_name: x.league.league_name,
      league_id: x.league.league_id,
      archetype: x.roster.archetype,
      qb_grade: qb ? { avg_score: qb.avg_score, grade: qb.grade } : emptyGrade(),
      rb_grade: rb ? { avg_score: rb.avg_score, grade: rb.grade } : emptyGrade(),
      wr_grade: wr ? { avg_score: wr.avg_score, grade: wr.grade } : emptyGrade(),
      te_grade: te ? { avg_score: te.avg_score, grade: te.grade } : emptyGrade(),
    });
  }
  // Sort by average of all 4 grades descending
  leagueHealth.sort((a, b) => {
    const avgA = (a.qb_grade.avg_score + a.rb_grade.avg_score + a.wr_grade.avg_score + a.te_grade.avg_score) / 4;
    const avgB = (b.qb_grade.avg_score + b.rb_grade.avg_score + b.wr_grade.avg_score + b.te_grade.avg_score) / 4;
    return avgB - avgA;
  });

  // ─── Exposure Chart ───
  const exposure: DashboardData["exposure"] = [];
  for (const [pid, count] of playerLeagueCount) {
    const info = playerInfo.get(pid);
    if (!info) continue;
    exposure.push({
      player_id: pid,
      full_name: info.full_name,
      position: info.position,
      edge_score: info.edge_score,
      leagues_owned: count,
      total_leagues: totalLeagues,
      pct: Math.round((count / totalLeagues) * 100),
    });
  }
  exposure.sort((a, b) => b.leagues_owned - a.leagues_owned || b.edge_score - a.edge_score);
  const topExposure = exposure.slice(0, 20);

  // ─── Archetype Actions ───
  const archGroups = new Map<string, Array<{ name: string; league_id: string; avg_score: number }>>();
  for (const x of userRosters) {
    const a = x.roster.archetype;
    const list = archGroups.get(a) ?? [];
    list.push({ name: x.league.league_name, league_id: x.league.league_id, avg_score: x.roster.avg_starter_score });
    archGroups.set(a, list);
  }
  const archetypeActions: DashboardData["archetype_actions"] = [];
  for (const [archetype, leagues] of archGroups) {
    archetypeActions.push({
      archetype,
      strategy: STRATEGIES[archetype] ?? "Evaluate your position and adjust strategy accordingly.",
      leagues: leagues.sort((a, b) => b.avg_score - a.avg_score),
    });
  }
  archetypeActions.sort((a, b) => b.leagues.length - a.leagues.length);

  // ─── Actions Feed ───
  const actionsFeed: ActionFeedItem[] = [];

  // Sell High: high-exposure players with declining trend or source disagreement
  if (sourceMovers.has_data && sourceMovers.fallers.length > 0) {
    const best = sourceMovers.fallers.find(
      (m) => m.leagues_owned >= 2 && m.current_score >= 50
    ) ?? sourceMovers.fallers[0];
    if (best) {
      const leagues = exposure
        .filter((e) => e.player_id === best.player_id)
        .length > 0
        ? exposure.filter((e) => e.player_id === best.player_id).map((e) => `${e.leagues_owned} leagues`)
        : [`${best.leagues_owned} leagues`];
      actionsFeed.push({
        type: "sell_high",
        title: "Sell High",
        player_name: best.full_name,
        position: best.position,
        edge_score: best.current_score,
        signal: `Edge score dropped ${Math.abs(best.change)} pts. Owned in ${best.leagues_owned} league${best.leagues_owned > 1 ? "s" : ""}.`,
        leagues,
      });
    }
  }

  // Buy Low: rising players user owns in few leagues
  if (sourceMovers.has_data && sourceMovers.risers.length > 0) {
    const best = sourceMovers.risers.find(
      (m) => m.leagues_owned <= Math.ceil(totalLeagues * 0.33) && m.current_score >= 60
    ) ?? sourceMovers.risers[0];
    if (best) {
      actionsFeed.push({
        type: "buy_low",
        title: "Buy Low",
        player_name: best.full_name,
        position: best.position,
        edge_score: best.current_score,
        signal: `Edge score rose ${best.change} pts. Only in ${best.leagues_owned}/${totalLeagues} leagues.`,
        leagues: [`${best.leagues_owned}/${totalLeagues} leagues`],
      });
    }
  }

  // Roster Move: worst starter that could be upgraded
  if (rosterHoles.length > 0) {
    const worst = rosterHoles[0];
    actionsFeed.push({
      type: "roster_move",
      title: "Roster Move",
      player_name: worst.player_name,
      position: worst.position,
      edge_score: worst.edge_score,
      signal: `Weakest starter (${worst.slot_label}) in ${worst.league_name}. Look for upgrades.`,
      leagues: [worst.league_name],
    });
  }

  return {
    actions_feed: actionsFeed,
    empire: { total_leagues: totalLeagues, avg_starter_score: avgStarterScore, archetypes, strongest_league: strongest, weakest_league: weakest },
    roster_holes: rosterHoles,
    source_movers: sourceMovers,
    league_health: leagueHealth,
    exposure: topExposure,
    archetype_actions: archetypeActions,
  };
}

