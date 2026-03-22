import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import {
  getPowerRankings,
  type CoreAsset,
  type LeaguePowerRanking,
  type RosterRanking,
} from "./power-rankings.js";
import { getScoreMovers, type Mover } from "./snapshot-scores.js";
import type { LeagueScope } from "./dynasty-leagues.js";
import { optimizeLineup } from "./lineup-optimizer.js";
import {
  computeEdgeScores,
  sourceWeightsKey,
  type SourceWeights,
} from "./edge-score.js";
import {
  computeScoringDelta,
  estimateBaselineFPPG,
  loadPlayerUsageStats,
  parseLeagueScoring,
} from "./scoring-adjustment.js";

const DASHBOARD_TTL_MS = 30_000;
const dashboardCache = new Map<string, { data: DashboardData | null; expires: number }>();
const dashboardInFlight = new Map<string, Promise<DashboardData | null>>();

export function clearDashboardCache(username?: string) {
  if (username) {
    const prefix = `${username.toLowerCase()}:`;
    for (const key of dashboardCache.keys()) {
      if (key.startsWith(prefix)) dashboardCache.delete(key);
    }
    for (const key of dashboardInFlight.keys()) {
      if (key.startsWith(prefix)) dashboardInFlight.delete(key);
    }
    return;
  }
  dashboardCache.clear();
  dashboardInFlight.clear();
}

// ─── Types ───

export interface SlotGradeInfo {
  avg_score: number;
  grade: "elite" | "strong" | "average" | "weak" | "hole";
}

export interface ActionFeedItem {
  type: "sell_high" | "buy_low" | "roster_move" | "exposure_alert";
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

function d1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Main ───

const DEFAULT_ROSTER_POSITIONS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
];

type DashboardUserRoster = {
  league: LeaguePowerRanking;
  roster: RosterRanking;
};

function blendRedraftScore(edgeScore: number, ppgScore: number): number {
  return d1(edgeScore * 0.45 + ppgScore * 0.55);
}

async function applyRedraftMultiSourcePpg(
  userRosters: DashboardUserRoster[]
): Promise<DashboardUserRoster[]> {
  if (userRosters.length === 0) return userRosters;

  const leagueIds = [...new Set(userRosters.map((x) => x.league.league_id))];
  const inClause = sql.join(leagueIds.map((id) => sql`${id}`), sql`, `);

  const leagueRows = await db.execute(sql`
    SELECT league_id, roster_positions, scoring_settings
    FROM leagues
    WHERE league_id IN (${inClause})
  `);

  type LeagueRow = {
    league_id: string;
    roster_positions: string[] | null;
    scoring_settings: Record<string, unknown> | null;
  };

  const leagueConfig = new Map<string, LeagueRow>();
  for (const row of leagueRows as unknown as LeagueRow[]) {
    leagueConfig.set(row.league_id, row);
  }

  const allPlayerIds = [
    ...new Set(
      userRosters.flatMap((x) =>
        x.roster.core_assets.map((asset) => asset.player_id)
      )
    ),
  ];
  const usageMap = await loadPlayerUsageStats(allPlayerIds);

  const ppgInputs: Array<{
    sleeper_id: string;
    fc_value: number | null;
    ktc_value: null;
    dp_value: null;
  }> = [];

  for (const x of userRosters) {
    const config = leagueConfig.get(x.league.league_id);
    const scoring = parseLeagueScoring(config?.scoring_settings ?? null);

    for (const asset of x.roster.core_assets) {
      const usage = usageMap.get(asset.player_id);
      if (!usage) continue;

      const { delta_ppg } = computeScoringDelta(usage, asset.position, scoring);
      const leaguePpg = estimateBaselineFPPG(usage, asset.position) + delta_ppg;
      if (leaguePpg <= 0) continue;

      ppgInputs.push({
        sleeper_id: `${x.league.league_id}:${asset.player_id}`,
        fc_value: leaguePpg,
        ktc_value: null,
        dp_value: null,
      });
    }
  }

  if (ppgInputs.length === 0) return userRosters;

  const ppgScoreMap = computeEdgeScores(ppgInputs);

  return userRosters.map((x) => {
    const config = leagueConfig.get(x.league.league_id);
    const rosterPositions = config?.roster_positions ?? DEFAULT_ROSTER_POSITIONS;

    const coreAssets: CoreAsset[] = x.roster.core_assets.map((asset) => {
      const ppgScore =
        ppgScoreMap.get(`${x.league.league_id}:${asset.player_id}`)?.fc_score ??
        null;

      if (ppgScore == null) return asset;

      return {
        ...asset,
        edge_score: blendRedraftScore(asset.edge_score, ppgScore),
      };
    });

    const lineup = optimizeLineup(coreAssets, rosterPositions);
    const avgStarterScore =
      lineup.starters.length > 0
        ? d1(
            lineup.starters.reduce(
              (sum, starter) => sum + starter.edge_score,
              0
            ) / lineup.starters.length
          )
        : 0;

    return {
      ...x,
      roster: {
        ...x.roster,
        core_assets: coreAssets,
        lineup,
        avg_starter_score: avgStarterScore,
      },
    };
  });
}

export async function getDashboardData(
  username: string,
  scope: LeagueScope = "dynasty",
  weights?: SourceWeights
): Promise<DashboardData | null> {
  const cacheKey = `${username.toLowerCase()}:${scope}:${sourceWeightsKey(weights)}`;
  const now = Date.now();
  const hit = dashboardCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.data;

  const pending = dashboardInFlight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
    const rankings = await getPowerRankings(username, scope, weights);
    if (rankings.length === 0) return null;

    const totalLeagues = rankings.length;

    // Extract user roster from each league
    const rawUserRosters = rankings
      .map((l) => ({
        league: l,
        roster: l.rosters.find((r) => r.is_user),
      }))
      .filter(
        (
          x
        ): x is { league: LeaguePowerRanking; roster: NonNullable<typeof x.roster> } =>
          x.roster != null
      );

    const userRosters =
      scope === "redraft"
        ? await applyRedraftMultiSourcePpg(rawUserRosters)
        : rawUserRosters;

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

  // ─── Actions Feed (Smart Money Signals) ───
  const actionsFeed: ActionFeedItem[] = [];

  // Collect all players with per-source scores across user rosters
  interface PortfolioPlayer {
    player_id: string;
    full_name: string;
    position: string;
    edge_score: number;
    fc_score: number | null;
    ktc_score: number | null;
    dp_score: number | null;
    source_agreement: "high" | "medium" | "low";
    leagues_owned: number;
    league_names: string[];
    // Derived: how much KTC diverges from expert consensus (FC + DP avg)
    ktc_vs_experts: number | null;
  }

  const portfolioMap = new Map<string, PortfolioPlayer>();
  for (const x of userRosters) {
    for (const a of x.roster.core_assets) {
      const existing = portfolioMap.get(a.player_id);
      if (existing) {
        existing.leagues_owned++;
        existing.league_names.push(x.league.league_name);
        // Keep the highest edge score across leagues
        if (a.edge_score > existing.edge_score) {
          existing.edge_score = a.edge_score;
          existing.fc_score = a.fc_score;
          existing.ktc_score = a.ktc_score;
          existing.dp_score = a.dp_score;
          existing.source_agreement = a.source_agreement;
        }
      } else {
        portfolioMap.set(a.player_id, {
          player_id: a.player_id,
          full_name: a.full_name,
          position: a.position,
          edge_score: a.edge_score,
          fc_score: a.fc_score,
          ktc_score: a.ktc_score,
          dp_score: a.dp_score,
          source_agreement: a.source_agreement,
          leagues_owned: 1,
          league_names: [x.league.league_name],
          ktc_vs_experts: null,
        });
      }
    }
  }

  // Calculate KTC vs expert consensus for each player
  for (const p of portfolioMap.values()) {
    const expertScores = [p.fc_score, p.dp_score].filter((s): s is number => s != null);
    if (p.ktc_score != null && expertScores.length > 0) {
      const expertAvg = expertScores.reduce((a, b) => a + b, 0) / expertScores.length;
      p.ktc_vs_experts = p.ktc_score - expertAvg; // positive = crowd overvalues, negative = crowd undervalues
    }
  }

  const allPlayers = [...portfolioMap.values()];

  // ── Sell High: crowd (KTC) significantly overvalues vs experts (FC/DP) ──
  // These are players where the hype exceeds the smart money. Sell into it.
  const sellCandidates = allPlayers
    .filter((p) =>
      p.ktc_vs_experts != null &&
      p.ktc_vs_experts >= 6 &&          // KTC at least 6 pts above expert avg
      p.edge_score >= 60 &&              // Worth something (not waiver fodder)
      p.source_agreement !== "high"      // Sources actually disagree
    )
    .sort((a, b) => (b.ktc_vs_experts ?? 0) - (a.ktc_vs_experts ?? 0));

  if (sellCandidates.length > 0) {
    const best = sellCandidates[0];
    actionsFeed.push({
      type: "sell_high",
      title: "Sell High",
      player_name: best.full_name,
      position: best.position,
      edge_score: best.edge_score,
      signal: `Crowd values at ${d1(best.ktc_score ?? 0)}, experts at ${d1(((best.fc_score ?? 0) + (best.dp_score ?? 0)) / [best.fc_score, best.dp_score].filter((s) => s != null).length)}. Sell into the hype.`,
      leagues: best.league_names.length > 1
        ? [`${best.leagues_owned} leagues`]
        : [best.league_names[0]],
    });
  }

  // ── Buy Low: experts (FC/DP) see value the crowd (KTC) doesn't ──
  // These are undervalued players you can acquire cheaply before the market corrects.
  const buyCandidates = allPlayers
    .filter((p) =>
      p.ktc_vs_experts != null &&
      p.ktc_vs_experts <= -6 &&          // KTC at least 6 pts below expert avg
      p.edge_score >= 60 &&              // Still rostered-caliber
      p.source_agreement !== "high"      // Sources actually disagree
    )
    .sort((a, b) => (a.ktc_vs_experts ?? 0) - (b.ktc_vs_experts ?? 0));

  if (buyCandidates.length > 0) {
    const best = buyCandidates[0];
    actionsFeed.push({
      type: "buy_low",
      title: "Buy Low",
      player_name: best.full_name,
      position: best.position,
      edge_score: best.edge_score,
      signal: `Experts at ${d1(((best.fc_score ?? 0) + (best.dp_score ?? 0)) / [best.fc_score, best.dp_score].filter((s) => s != null).length)}, crowd only at ${d1(best.ktc_score ?? 0)}. Market hasn't caught up.`,
      leagues: best.leagues_owned < totalLeagues
        ? [`${best.leagues_owned}/${totalLeagues} leagues`]
        : [`All ${totalLeagues} leagues`],
    });
  }

  // ── Roster Move: weakest starter in your weakest teams ──
  // Juggernauts don't need help. Target rebuilders, dead zone, and struggling teams.
  const WEAK_ARCHETYPES = new Set(["Rebuilder", "Dead Zone", "Productive Struggle", "Fragile Contender"]);
  const weakTeamHoles = holes.filter((h) => {
    // Find this league's archetype
    const lh = leagueHealth.find((l) => l.league_id === h.league_id);
    return lh && WEAK_ARCHETYPES.has(lh.archetype);
  });

  if (weakTeamHoles.length > 0) {
    const worst = weakTeamHoles[0]; // Already sorted by edge_score ascending
    const lh = leagueHealth.find((l) => l.league_id === worst.league_id);
    actionsFeed.push({
      type: "roster_move",
      title: "Roster Move",
      player_name: worst.player_name,
      position: worst.position,
      edge_score: worst.edge_score,
      signal: `Weakest starter (${worst.slot_label}) in ${worst.league_name}. ${lh?.archetype ?? "Needs"} upgrade.`,
      leagues: [worst.league_name],
    });
  }

  // ── Exposure Alert: high-concentration player with sources disagreeing ──
  const exposureThreshold = Math.max(2, Math.ceil(totalLeagues * 0.1)); // 10%+ of leagues
  const exposureAlerts = allPlayers
    .filter((p) => {
      if (p.leagues_owned < exposureThreshold || p.edge_score < 50) return false;
      const scores = [p.fc_score, p.ktc_score, p.dp_score].filter((s): s is number => s != null);
      if (scores.length < 2) return false;
      const spread = Math.max(...scores) - Math.min(...scores);
      return spread >= 10;
    })
    .sort((a, b) => b.leagues_owned - a.leagues_owned);

  if (exposureAlerts.length > 0 && actionsFeed.length < 3) {
    const alert = exposureAlerts[0];
    const scores = [alert.fc_score, alert.ktc_score, alert.dp_score].filter((s): s is number => s != null);
    const spread = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : 0;
    actionsFeed.push({
      type: "exposure_alert",
      title: "Exposure Alert",
      player_name: alert.full_name,
      position: alert.position,
      edge_score: alert.edge_score,
      signal: `Owned in ${alert.leagues_owned}/${totalLeagues} leagues with ${d1(spread)}pt source spread. Diversify risk.`,
      leagues: [`${alert.leagues_owned} leagues`],
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
  })();

  dashboardInFlight.set(cacheKey, work);
  try {
    const data = await work;
    dashboardCache.set(cacheKey, { data, expires: Date.now() + DASHBOARD_TTL_MS });
    return data;
  } finally {
    dashboardInFlight.delete(cacheKey);
  }
}

