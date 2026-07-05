import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague, getLeagueUsers, getUserLeagues } from "../sleeper/leagues.js";
import { getLeagueRosters } from "../sleeper/rosters.js";
import { getAgeCurveStatus } from "./age-curves.js";
import { classifyTeam, percentileRank } from "./archetypes.js";
import { getCompositeValues } from "./composite-values.js";
import {
  computeEdgeScores,
  sourceWeightsKey,
  type SourceWeights,
} from "./edge-score.js";
import {
  buildDraftPickInventory, getLeagueDraftPicks, getRookieDraftOrder, estimatePickTiers, scoreDraftPicks,
  type DraftPick, type TieredPick,
} from "./draft-picks.js";
import { optimizeLineup } from "./lineup-optimizer.js";
import { enrichScoredPick } from "./pick-values.js";
import { getLeagueIdsForUserLatestSeason, type LeagueScope } from "./dynasty-leagues.js";
import { parseLeagueScoring, scoringLabel } from "./scoring-adjustment.js";
import { computeLeaguePPG } from "./league-ppg.js";
import type { ValueType } from "./composite-values.js";
import { getPlayerAvailability } from "../../shared/player-availability.js";
import type {
  CoreAsset,
  LeaguePowerRanking,
  RosterRanking,
  ScoredPick,
} from "../../shared/types.js";
import { scorePlayersForLeague } from "./league-scoring.js";
import { scoreAgreement } from "../lib/score-agreement.js";

const LEAGUE_SCORING_SEASON = 2025;

const prCache = new Map<string, { data: LeaguePowerRanking[]; expires: number }>();
const PR_TTL_MS = 5 * 60 * 1000;
const PR_DB_ONLY = process.env.POWER_RANKINGS_DB_ONLY === "true";

interface PowerRankingsOptions {
  leagueIds?: string[];
  forceDbOnly?: boolean;
}

export function clearPowerRankingsCache(username?: string) {
  if (username) {
    const prefix = `${username.toLowerCase()}:`;
    for (const key of prCache.keys()) {
      if (key.startsWith(prefix)) prCache.delete(key);
    }
  } else {
    prCache.clear();
  }
}

// ─── Helpers ───

function countStarterSlots(pos: string[]): number {
  const bench = new Set(["BN", "IR", "TAXI"]);
  return pos.filter((p) => !bench.has(p)).length;
}

function detectSF(pos: string[]): boolean {
  if (pos.includes("SUPER_FLEX")) return true;
  return pos.filter((p) => p === "QB").length >= 2;
}

function computeWindowRaw(players: { value: number; age_score: number }[]): number {
  const valid = players.filter((p) => p.value > 0);
  const denom = valid.reduce((s, p) => s + p.value, 0);
  if (denom === 0) return 0;
  return valid.reduce((s, p) => s + p.value * p.age_score, 0) / denom;
}

// ─── Main ───

export async function getPowerRankings(
  username: string,
  scopeOrValueType: LeagueScope | ValueType = "dynasty",
  valueTypeOrWeights?: ValueType | SourceWeights,
  maybeWeights?: SourceWeights,
  options: PowerRankingsOptions = {}
): Promise<LeaguePowerRanking[]> {
  const scope: LeagueScope = scopeOrValueType === "redraft" ? "dynasty" : scopeOrValueType;
  const valueType: ValueType = scopeOrValueType === "redraft"
    ? "redraft"
    : typeof valueTypeOrWeights === "string"
      ? valueTypeOrWeights
      : "dynasty";
  const weights = typeof valueTypeOrWeights === "string" ? maybeWeights : valueTypeOrWeights;
  const leagueFilter = options.leagueIds?.filter(Boolean).sort() ?? [];
  const cacheKey = `${username.toLowerCase()}:${valueType}:${sourceWeightsKey(weights)}:${leagueFilter.length > 0 ? leagueFilter.join(",") : "all"}`;
  const now = Date.now();
  const hit = prCache.get(cacheKey);
  if (hit && hit.expires > now) {
    return hit.data;
  }

  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  let leagueIds: string[];
  if (leagueFilter.length > 0) {
    const leagueIdFrags = leagueFilter.map((id) => sql`${id}`);
    const leagueInClause = sql.join(leagueIdFrags, sql`, `);
    const rows = await db.execute(sql`
      SELECT l.league_id
      FROM user_leagues ul
      JOIN leagues l ON ul.league_id = l.league_id
      WHERE ul.user_id = ${userId}
        AND l.league_id IN (${leagueInClause})
    `);
    const requested = new Set(leagueFilter);
    leagueIds = (rows as unknown as { league_id: string }[])
      .map((row) => row.league_id)
      .filter((leagueId) => requested.has(leagueId));
  } else {
    leagueIds = await getLeagueIdsForUserLatestSeason(userId, scope);
  }
  if (leagueIds.length === 0) return [];

  if (PR_DB_ONLY || options.forceDbOnly) {
    try {
      const dbOnly = await getPowerRankingsDbOnly(username, userId, leagueIds, valueType, weights);
      prCache.set(cacheKey, { data: dbOnly, expires: Date.now() + PR_TTL_MS });
      return dbOnly;
    } catch (err) {
      console.error("[power-rankings] DB-only path failed, falling back to legacy path", err);
      if (options.forceDbOnly) {
        return [];
      }
    }
  }

  const leagueIdFrags = leagueIds.map((id) => sql`${id}`);
  const leagueInClause = sql.join(leagueIdFrags, sql`, `);

  const leagueRows = await db.execute(sql`
    SELECT l.league_id, l.name AS league_name, l.total_rosters
    FROM leagues l
    WHERE l.league_id IN (${leagueInClause})
    ORDER BY l.name ASC
  `);
  type League = { league_id: string; league_name: string; total_rosters: number };
  const leagues = leagueRows as unknown as League[];
  if (leagues.length === 0) return [];

  const idFrags = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(idFrags, sql`, `);

  const rosterRows = await db.execute(sql`
    SELECT rp.league_id, rp.owner_id, rp.player_id, pm.full_name, pm.position, pm.age, pm.team, pm.status,
      EXISTS (
        SELECT 1 FROM fantasycalc_daily fc
        WHERE fc.sleeper_id = rp.player_id
          AND fc.snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
          AND fc.is_pick = false
          AND UPPER(fc.team) IN ('FA', 'FREE AGENT')
      ) OR EXISTS (
        SELECT 1 FROM dynastyprocess_values dp
        WHERE dp.sleeper_id = rp.player_id
          AND dp.is_pick = false
          AND UPPER(dp.team) IN ('FA', 'FREE AGENT')
      ) AS external_flags_fa
    FROM roster_players rp JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${inClause}) AND pm.position IN ('QB','RB','WR','TE')
  `);
  type RR = { league_id: string; owner_id: string; player_id: string; full_name: string; position: string; age: number | null; team: string | null; status: string | null; external_flags_fa: boolean };
  const rows = rosterRows as unknown as RR[];

  const [ridRows, nmRows] = await Promise.all([
    db.execute(sql`SELECT league_id, owner_id, roster_id FROM rosters WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, user_id, display_name, team_name FROM league_users WHERE league_id IN (${inClause})`),
  ]);
  const ridMap = new Map<string, number>();
  for (const r of ridRows as unknown as { league_id: string; owner_id: string; roster_id: number }[])
    ridMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  const nmMap = new Map<string, { display_name: string | null; team_name: string | null }>();
  for (const r of nmRows as unknown as { league_id: string; user_id: string; display_name: string | null; team_name: string | null }[]) {
    nmMap.set(`${r.league_id}:${r.user_id}`, {
      display_name: r.display_name,
      team_name: r.team_name,
    });
  }

  const nested: Record<string, Record<string, RR[]>> = {};
  for (const r of rows) { nested[r.league_id] ??= {}; nested[r.league_id][r.owner_id] ??= []; nested[r.league_id][r.owner_id].push(r); }

  const DEFAULT_POS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN", "BN", "BN"];

  const renewalMap = new Map<string, string[]>();
  try {
    const year = new Date().getFullYear();
    const [thisSeason, nextSeason] = await Promise.all([
      getUserLeagues(userId, year),
      getUserLeagues(userId, year + 1),
    ]);
    for (const lg of [...thisSeason, ...nextSeason]) {
      const prev = lg.previous_league_id;
      if (!prev) continue;
      const arr = renewalMap.get(prev) ?? [];
      if (!arr.includes(lg.league_id)) arr.push(lg.league_id);
      renewalMap.set(prev, arr);
    }
  } catch {
    // Non-fatal: if lookup fails, we still try the current league only.
  }

  // Fetch league settings, draft picks, and draft order
  const settingsMap = new Map<
    string,
    {
      sf: boolean;
      slots: number;
      rosterPositions: string[];
      scoring: Record<string, unknown> | null;
    }
  >();
  const dpMap = new Map<string, DraftPick[]>();
  const draftOrderMap = new Map<string, Map<number, number>>(); // league_id → roster_id → position
  await Promise.all(leagues.map(async (l) => {
    try {
      const ownerIdsInLeague = Object.keys(nested[l.league_id] ?? {});
      const needsNames = ownerIdsInLeague.some((oid) => !nmMap.has(`${l.league_id}:${oid}`));
      const needsRosterIds = ownerIdsInLeague.some((oid) => !ridMap.has(`${l.league_id}:${oid}`));

      const [detail, draftOrder, usersFallback, rostersFallback] = await Promise.all([
        getLeague(l.league_id),
        getRookieDraftOrder(l.league_id, renewalMap.get(l.league_id) ?? []),
        needsNames ? getLeagueUsers(l.league_id) : Promise.resolve([]),
        needsRosterIds ? getLeagueRosters(l.league_id) : Promise.resolve([]),
      ]);

      if (usersFallback.length > 0) {
        for (const u of usersFallback) {
          const teamNameRaw = (u.metadata ?? {})["team_name"];
          const teamName =
            typeof teamNameRaw === "string" && teamNameRaw.trim().length > 0
              ? teamNameRaw.trim()
              : null;
          nmMap.set(`${l.league_id}:${u.user_id}`, {
            display_name: u.display_name ?? null,
            team_name: teamName,
          });
        }
      }
      if (rostersFallback.length > 0) {
        for (const r of rostersFallback) {
          if (!r.owner_id) continue;
          ridMap.set(`${l.league_id}:${r.owner_id}`, r.roster_id);
        }
      }

      if (detail?.roster_positions) settingsMap.set(l.league_id, {
        sf: detectSF(detail.roster_positions),
        slots: countStarterSlots(detail.roster_positions),
        rosterPositions: detail.roster_positions,
        scoring: (detail.scoring_settings as Record<string, unknown> | null) ?? null,
      });
      if (draftOrder) draftOrderMap.set(l.league_id, draftOrder);
      const totalRosters = detail?.total_rosters ?? l.total_rosters;
      const draftRounds = Number(detail?.settings?.draft_rounds) || 4;
      const picks = await getLeagueDraftPicks(l.league_id, totalRosters, draftRounds);
      dpMap.set(l.league_id, picks);
    } catch { /* fallback */ }
  }));

  const results: LeaguePowerRanking[] = [];

  for (const league of leagues) {
    const lid = league.league_id;
    const teams = nested[lid] ?? {};
    const { sf, slots, rosterPositions, scoring } = settingsMap.get(lid) ?? {
      sf: false,
      slots: 9,
      rosterPositions: DEFAULT_POS,
      scoring: null,
    };
    const mode = sf ? "sf" : "1qb";
    const owners = Object.entries(teams);

    // Step 1: Player composite values
    const playerIds = [...new Set(owners.flatMap(([, ps]) => ps.map((p) => p.player_id)))];
    const compMap = await getCompositeValues(playerIds, mode, valueType, weights);
    const leagueScoring = parseLeagueScoring(scoring);
    const ppgMap = valueType === "redraft"
      ? await computeLeaguePPG(playerIds, leagueScoring)
      : new Map<string, { ppg: number }>();

    // Raw fantasy points in THIS league's scoring_settings, from 2025 weekly stats
    const rawScoring = (scoring ?? {}) as Record<string, number>;
    const idPosMap = new Map<string, string>();
    for (const [, ps] of owners) for (const p of ps) idPosMap.set(p.player_id, p.position);
    const leaguePointsMap = Object.keys(rawScoring).length > 0
      ? await scorePlayersForLeague(
          [...idPosMap.entries()].map(([sleeper_id, position]) => ({ sleeper_id, position })),
          rawScoring,
          LEAGUE_SCORING_SEASON
        )
      : new Map();

    // Step 2: Initial power for tier estimation
    const initSV = owners.map(([oid, ps]) => {
      const s = ps.map((p) => compMap.get(p.player_id)?.edge_score ?? 0).sort((a, b) => b - a);
      return { oid, sv: s.slice(0, slots).reduce((a, v) => a + v, 0) };
    });
    const allInit = initSV.map((r) => r.sv);
    const rPower = new Map<number, number>();
    for (const r of initSV) rPower.set(ridMap.get(`${lid}:${r.oid}`) ?? 0, percentileRank(allInit, r.sv));

    // Step 3: Draft picks - tiers, values, combined scoring
    const rosterDraftOrder = draftOrderMap.get(lid);

    const tiered = estimatePickTiers(dpMap.get(lid) ?? [], rPower, rosterDraftOrder);
    const valued = await scoreDraftPicks(tiered, mode);

    const pInputs = [...compMap.values()].map((c) => ({
      sleeper_id: c.sleeper_id, fc_value: c.fc_value, ktc_value: c.ktc_value, dp_value: c.dp_value,
    }));
    const pkInputs = valued.map((p) => ({
      sleeper_id: `pick_${p.season}_${p.round}_${p.original_owner_id}`,
      fc_value: null as number | null, ktc_value: p.ktc_value, dp_value: p.dp_value,
    }));
    const combined = computeEdgeScores([...pInputs, ...pkInputs], undefined, weights);

    for (const [id, cv] of compMap) {
      const e = combined.get(id);
      if (e) { cv.edge_score = e.score; cv.fc_score = e.fc_score; cv.ktc_score = e.ktc_score; cv.dp_score = e.dp_score; cv.sources_available = e.sources_used; cv.source_agreement = scoreAgreement([e.fc_score, e.ktc_score, e.dp_score]); }
    }
    for (const p of valued) {
      const e = combined.get(`pick_${p.season}_${p.round}_${p.original_owner_id}`);
      if (e) { p.edge_score = e.score; p.ktc_score = e.ktc_score; p.dp_score = e.dp_score; }
    }
    const enrichedValued = await Promise.all(
      valued.map((pick) =>
        enrichScoredPick(pick, {
          leagueSize: league.total_rosters,
          format: mode,
        })
      )
    );

    // Group picks by owner roster_id, filter out zero-value picks
    const picksByRid = new Map<number, ScoredPick[]>();
    for (const p of enrichedValued) {
      const a = picksByRid.get(p.roster_id) ?? []; a.push(p); picksByRid.set(p.roster_id, a);
    }

    // Step 4: Build roster data
    const rosterData = owners.map(([oid, players]) => {
      const wv = players.map((p) => ({ ...p, es: compMap.get(p.player_id)?.edge_score ?? 0, cv: compMap.get(p.player_id) }));
      const sorted = [...wv].sort((a, b) => b.es - a.es);
      const starters = sorted.slice(0, slots);
      const sv = starters.reduce((s, p) => s + p.es, 0);
      const avgSS = starters.length > 0 ? Math.round((sv / starters.length) * 10) / 10 : 0;
      const wc = sorted.map((p) => ({ ...p, ac: getAgeCurveStatus(p.position, p.age) }));
      const coreN = Math.min(12, slots + 3);
      const core = wc.slice(0, coreN);
      const wcr = computeWindowRaw(core.map((p) => ({ value: p.es, age_score: p.ac.score })));
      const wtr = computeWindowRaw(wc.map((p) => ({ value: p.es, age_score: p.ac.score })));
      const coreAssets: CoreAsset[] = wc.map((p) => {
        const lp = leaguePointsMap.get(p.player_id);
        return {
          player_id: p.player_id, full_name: p.full_name, position: p.position,
          edge_score: p.es, age: p.age, age_curve: p.ac,
          fc_value: p.cv?.fc_value ?? null, ktc_value: p.cv?.ktc_value ?? null, dp_value: p.cv?.dp_value ?? null,
          fc_score: p.cv?.fc_score ?? null, ktc_score: p.cv?.ktc_score ?? null, dp_score: p.cv?.dp_score ?? null,
          ppg: ppgMap.get(p.player_id)?.ppg ?? null,
          sources_available: p.cv?.sources_available ?? 0, source_agreement: p.cv?.source_agreement ?? "high",
          team: p.team, status: p.status,
          availability: getPlayerAvailability({
            status: p.status, team: p.team, sources_available: p.cv?.sources_available ?? 0,
            external_flags_fa: p.external_flags_fa,
          }),
          league_points_total: lp?.total_points ?? null,
          league_points_ppg: lp?.per_game_points ?? null,
          league_points_weeks: lp?.weeks_scored ?? null,
          league_points_season: lp ? LEAGUE_SCORING_SEASON : null,
        };
      });
      const srcAvg = wc.length > 0 ? Math.round((wc.reduce((s, p) => s + (p.cv?.sources_available ?? 0), 0) / wc.length) * 10) / 10 : 0;
      const rid = ridMap.get(`${lid}:${oid}`) ?? 0;
      const rPicks = (picksByRid.get(rid) ?? []).sort((a, b) => b.edge_score - a.edge_score);
      const dv = rPicks.reduce((s, p) => s + p.edge_score, 0);
      const lineup = optimizeLineup(coreAssets, rosterPositions);
      return { oid, sv, avgSS, wcr, wtr, coreCov: core.length > 0 ? (core.filter((p) => p.es > 0).length / coreN) * 100 : 0,
        totCov: wc.length > 0 ? (wc.filter((p) => p.es > 0).length / wc.length) * 100 : 0,
        coreAssets, srcAvg, dv, rPicks, lineup };
    });

    const allSV = rosterData.map((r) => r.sv);
    const allDV = rosterData.map((r) => r.dv);
    const allWCR = rosterData.map((r) => r.wcr);
    const allWTR = rosterData.map((r) => r.wtr);

    const rosters: RosterRanking[] = rosterData.map((r) => {
      const pp = percentileRank(allSV, r.sv);
      const dp = percentileRank(allDV, r.dv);
      const wcp = percentileRank(allWCR, r.wcr);
      const wtp = percentileRank(allWTR, r.wtr);
      const { archetype, reasons } = classifyTeam(pp, dp, wcp);
      const nameRow = nmMap.get(`${lid}:${r.oid}`);
      const readableName =
        nameRow?.team_name?.trim()
        || nameRow?.display_name?.trim()
        || (ridMap.get(`${lid}:${r.oid}`) ? `Roster ${ridMap.get(`${lid}:${r.oid}`)}` : null)
        || r.oid;
      return {
        roster_id: ridMap.get(`${lid}:${r.oid}`) ?? 0,
        owner_id: r.oid, display_name: readableName,
        is_user: r.oid === userId,
        starters_value: r.sv, avg_starter_score: r.avgSS,
        power_pct: Math.round(pp * 10) / 10,
        draft_value: r.dv, draft_pct: Math.round(dp * 10) / 10, draft_picks: r.rPicks,
        window_core_raw: Math.round(r.wcr * 10) / 10, window_core_pct: Math.round(wcp * 10) / 10,
        window_total_raw: Math.round(r.wtr * 10) / 10, window_total_pct: Math.round(wtp * 10) / 10,
        window_core_coverage_pct: Math.round(r.coreCov), window_total_coverage_pct: Math.round(r.totCov),
        archetype, reasons, core_assets: r.coreAssets, avg_sources_available: r.srcAvg,
        lineup: r.lineup,
      };
    });

    rosters.sort((a, b) => b.power_pct - a.power_pct);
    results.push({ league_id: lid, league_name: league.league_name, mode, draft_data_available: (dpMap.get(lid) ?? []).length > 0, scoring_label: "", rosters });
  }

  results.sort((a, b) => a.league_name.localeCompare(b.league_name));
  prCache.set(cacheKey, { data: results, expires: Date.now() + PR_TTL_MS });
  return results;
}

const ROUND_NAMES: Record<number, string> = {
  1: "1st", 2: "2nd", 3: "3rd", 4: "4th",
};

async function loadPickValueLookups(mode: "sf" | "1qb") {
  const [ktcRows, dpRows] = await Promise.all([
    db.execute(sql`
      SELECT player_name, pick_season, pick_round, pick_tier,
             value_1qb, value_sf
      FROM ktc_values WHERE is_pick = true
    `),
    db.execute(sql`
      SELECT player_name, value_1qb, value_2qb
      FROM dynastyprocess_values WHERE is_pick = true
    `),
  ]);

  type KtcPickRow = {
    player_name: string;
    pick_season: number | null;
    pick_round: number | null;
    pick_tier: string | null;
    value_1qb: number;
    value_sf: number;
  };
  type DpPickRow = {
    player_name: string;
    value_1qb: number;
    value_2qb: number;
  };

  const ktcMap = new Map<string, number>();
  for (const r of ktcRows as unknown as KtcPickRow[]) {
    const val = mode === "sf" ? r.value_sf : r.value_1qb;
    if (r.pick_season != null && r.pick_round != null) {
      const tier = (r.pick_tier ?? "").toLowerCase();
      ktcMap.set(`${r.pick_season}|${tier}|${r.pick_round}`, val);
      const genKey = `${r.pick_season}||${r.pick_round}`;
      if (!ktcMap.has(genKey)) {
        ktcMap.set(genKey, val);
      }
    }
  }

  const dpMap = new Map<string, number>();
  for (const r of dpRows as unknown as DpPickRow[]) {
    const val = mode === "sf" ? r.value_2qb : r.value_1qb;
    dpMap.set(r.player_name.toLowerCase().trim(), val);
  }

  return { ktcMap, dpMap };
}

function scoreTieredPicksFromLookups(
  tieredPicks: TieredPick[],
  mode: "sf" | "1qb",
  lookups: { ktcMap: Map<string, number>; dpMap: Map<string, number> }
): ScoredPick[] {
  const { ktcMap, dpMap } = lookups;
  return tieredPicks.map((p) => {
    const ktcValue =
      ktcMap.get(`${p.season}|${p.tier}|${p.round}`) ??
      ktcMap.get(`${p.season}||${p.round}`) ??
      null;

    const roundName = ROUND_NAMES[p.round] ?? `R${p.round}`;
    const tierLabel = p.tier.charAt(0).toUpperCase() + p.tier.slice(1);
    const dpValue =
      dpMap.get(`${p.season} ${tierLabel} ${roundName}`.toLowerCase()) ??
      dpMap.get(`${p.season} ${roundName}`.toLowerCase()) ??
      null;

    return {
      ...p,
      ktc_value: ktcValue,
      dp_value: dpValue,
      edge_score: 0,
      ktc_score: null,
      dp_score: null,
    };
  });
}

function buildDraftPicksFromDB(
  totalRosters: number,
  draftRounds: number,
  tradedPicks: { season: string; round: number; roster_id: number; owner_id: number; previous_owner_id?: number }[],
  completedDraftSeasons: Set<string> = new Set()
): DraftPick[] {
  return buildDraftPickInventory(
    totalRosters,
    draftRounds,
    tradedPicks.map((pick) => ({
      season: pick.season,
      round: pick.round,
      roster_id: pick.roster_id,
      owner_id: pick.owner_id,
      previous_owner_id: pick.previous_owner_id ?? pick.roster_id,
    })),
    { completedDraftSeasons }
  );
}

async function loadCompletedDraftSeasonsByLeague(
  leagueIds: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (leagueIds.length === 0) return result;

  const leagueIdFrags = leagueIds.map((id) => sql`${id}`);
  const inClause = sql.join(leagueIdFrags, sql`, `);

  try {
    const tableCheck = await db.execute(sql`
      SELECT to_regclass('public.league_draft_results')::text AS table_name
    `);
    const exists = (tableCheck as unknown as Array<{ table_name: string | null }>)[0]?.table_name != null;
    if (!exists) return result;

    const rows = await db.execute(sql`
      SELECT league_id, season
      FROM league_draft_results
      WHERE league_id IN (${inClause})
      GROUP BY league_id, season
    `);

    for (const row of rows as unknown as Array<{ league_id: string; season: string }>) {
      const seasons = result.get(row.league_id) ?? new Set<string>();
      seasons.add(String(row.season));
      result.set(row.league_id, seasons);
    }
  } catch {
    return result;
  }

  return result;
}

async function getPowerRankingsDbOnly(
  _username: string,
  userId: string,
  leagueIds: string[],
  valueType: ValueType = "dynasty",
  weights?: SourceWeights
): Promise<LeaguePowerRanking[]> {
  const leagueIdFrags = leagueIds.map((id) => sql`${id}`);
  const leagueInClause = sql.join(leagueIdFrags, sql`, `);

  const leagueRows = await db.execute(sql`
    SELECT league_id, name AS league_name, total_rosters,
           roster_positions, draft_rounds, scoring_settings
    FROM leagues
    WHERE league_id IN (${leagueInClause})
    ORDER BY name ASC
  `);
  type LeagueRow = {
    league_id: string;
    league_name: string;
    total_rosters: number;
    roster_positions: string[] | null;
    draft_rounds: number | null;
    scoring_settings: Record<string, unknown> | null;
  };
  const leagues = leagueRows as unknown as LeagueRow[];
  if (leagues.length === 0) return [];

  const idFrags = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(idFrags, sql`, `);

  const [rosterPlayerRows, ridRows, nmRows, tradedPickRows, draftOrderRows, completedDraftSeasonsByLeague] = await Promise.all([
    db.execute(sql`
      SELECT rp.league_id, rp.owner_id, rp.player_id, pm.full_name, pm.position, pm.age
      FROM roster_players rp
      JOIN players_master pm ON rp.player_id = pm.player_id
      WHERE rp.league_id IN (${inClause}) AND pm.position IN ('QB','RB','WR','TE')
    `),
    db.execute(sql`SELECT league_id, owner_id, roster_id FROM rosters WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, user_id, display_name, team_name FROM league_users WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, season, round, roster_id, owner_id FROM league_traded_picks WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, season, roster_id, draft_position FROM league_draft_orders WHERE league_id IN (${inClause})`),
    loadCompletedDraftSeasonsByLeague(leagueIds),
  ]);

  type RR = { league_id: string; owner_id: string; player_id: string; full_name: string; position: string; age: number | null; team: string | null; status: string | null; external_flags_fa: boolean };
  const rows = rosterPlayerRows as unknown as RR[];

  const ridMap = new Map<string, number>();
  for (const r of ridRows as unknown as { league_id: string; owner_id: string; roster_id: number }[]) {
    ridMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  }

  const nmMap = new Map<string, { display_name: string | null; team_name: string | null }>();
  for (const r of nmRows as unknown as { league_id: string; user_id: string; display_name: string | null; team_name: string | null }[]) {
    nmMap.set(`${r.league_id}:${r.user_id}`, { display_name: r.display_name, team_name: r.team_name });
  }

  type TPRow = { league_id: string; season: string; round: number; roster_id: number; owner_id: number };
  const tradedPicksByLeague = new Map<string, TPRow[]>();
  for (const tp of tradedPickRows as unknown as TPRow[]) {
    const arr = tradedPicksByLeague.get(tp.league_id) ?? [];
    arr.push(tp);
    tradedPicksByLeague.set(tp.league_id, arr);
  }

  type DORow = { league_id: string; season: string; roster_id: number; draft_position: number };
  const draftOrdersByLeague = new Map<string, Map<number, number>>();
  for (const d of draftOrderRows as unknown as DORow[]) {
    let m = draftOrdersByLeague.get(d.league_id);
    if (!m) {
      m = new Map();
      draftOrdersByLeague.set(d.league_id, m);
    }
    m.set(d.roster_id, d.draft_position);
  }

  const nested: Record<string, Record<string, RR[]>> = {};
  for (const r of rows) {
    nested[r.league_id] ??= {};
    nested[r.league_id][r.owner_id] ??= [];
    nested[r.league_id][r.owner_id].push(r);
  }

  const DEFAULT_POS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN", "BN", "BN", "BN"];
  const modePlayerIds = new Map<"sf" | "1qb", Set<string>>();
  const leagueContexts = leagues.map((league) => {
    const lid = league.league_id;
    const teams = nested[lid] ?? {};
    const rosterPositions: string[] = league.roster_positions ?? DEFAULT_POS;
    const sf = detectSF(rosterPositions);
    const slots = countStarterSlots(rosterPositions);
    const mode: "sf" | "1qb" = sf ? "sf" : "1qb";
    const owners = Object.entries(teams);
    const totalRosters = league.total_rosters ?? 12;
    const draftRounds = league.draft_rounds ?? 4;
    const picks = buildDraftPicksFromDB(
      totalRosters,
      draftRounds,
      tradedPicksByLeague.get(lid) ?? [],
      completedDraftSeasonsByLeague.get(lid) ?? new Set()
    );
    const playerIds = [
      ...new Set(owners.flatMap(([, ps]) => ps.map((p) => p.player_id))),
    ];
    const bucket = modePlayerIds.get(mode) ?? new Set<string>();
    for (const pid of playerIds) bucket.add(pid);
    modePlayerIds.set(mode, bucket);
    return { league, lid, teams, rosterPositions, slots, mode, owners, picks, playerIds };
  });

  const baseCompByMode = new Map<"sf" | "1qb", Map<string, any>>();
  const pickLookupsByMode = new Map<
    "sf" | "1qb",
    { ktcMap: Map<string, number>; dpMap: Map<string, number> }
  >();
  await Promise.all(
    [...modePlayerIds.entries()].map(async ([mode, ids]) => {
        const [comp, pickLookups] = await Promise.all([
        getCompositeValues([...ids], mode, valueType, weights),
        // loadPickValueLookups stays dynasty-based for picks
        loadPickValueLookups(mode),
      ]);
      baseCompByMode.set(mode, comp as Map<string, any>);
      pickLookupsByMode.set(mode, pickLookups);
    })
  );

  const results: LeaguePowerRanking[] = [];

  for (const ctx of leagueContexts) {
    const { league, lid, rosterPositions, slots, mode, owners, picks, playerIds } = ctx;
    const leagueScoring = parseLeagueScoring(league.scoring_settings as Record<string, unknown> | null);
    const sLabel = scoringLabel(leagueScoring);
    const baseComp = baseCompByMode.get(mode) ?? new Map<string, any>();
    const compMap = new Map<string, any>();
    for (const pid of playerIds) {
      const cv = baseComp.get(pid);
      if (cv) compMap.set(pid, { ...cv });
    }
    const ppgMap = valueType === "redraft"
      ? await computeLeaguePPG(playerIds, leagueScoring)
      : new Map<string, { ppg: number }>();

    // Raw fantasy points in THIS league's scoring_settings, from 2025 weekly stats
    const rawScoring = (league.scoring_settings ?? {}) as Record<string, number>;
    const idPosMap = new Map<string, string>();
    for (const [, ps] of owners) for (const p of ps) idPosMap.set(p.player_id, p.position);
    const leaguePointsMap = Object.keys(rawScoring).length > 0
      ? await scorePlayersForLeague(
          [...idPosMap.entries()].map(([sleeper_id, position]) => ({ sleeper_id, position })),
          rawScoring,
          LEAGUE_SCORING_SEASON
        )
      : new Map();

    const initSV = owners.map(([oid, ps]) => {
      const s = ps.map((p) => compMap.get(p.player_id)?.edge_score ?? 0).sort((a, b) => b - a);
      return { oid, sv: s.slice(0, slots).reduce((a, v) => a + v, 0) };
    });
    const allInit = initSV.map((r) => r.sv);
    const rPower = new Map<number, number>();
    for (const r of initSV) rPower.set(ridMap.get(`${lid}:${r.oid}`) ?? 0, percentileRank(allInit, r.sv));

    const rosterDraftOrder = draftOrdersByLeague.get(lid);
    const tiered = estimatePickTiers(picks, rPower, rosterDraftOrder);
    const pickLookups = pickLookupsByMode.get(mode) ?? { ktcMap: new Map(), dpMap: new Map() };
    const valued = scoreTieredPicksFromLookups(tiered, mode, pickLookups);

    const pInputs = [...compMap.values()].map((c) => ({
      sleeper_id: c.sleeper_id, fc_value: c.fc_value, ktc_value: c.ktc_value, dp_value: c.dp_value,
    }));
    const pkInputs = valued.map((p) => ({
      sleeper_id: `pick_${p.season}_${p.round}_${p.original_owner_id}`,
      fc_value: null as number | null, ktc_value: p.ktc_value, dp_value: p.dp_value,
    }));
    const combined = computeEdgeScores([...pInputs, ...pkInputs], undefined, weights);

    for (const [id, cv] of compMap) {
      const e = combined.get(id);
      if (e) {
        cv.edge_score = e.score;
        cv.fc_score = e.fc_score;
        cv.ktc_score = e.ktc_score;
        cv.dp_score = e.dp_score;
        cv.sources_available = e.sources_used;
        cv.source_agreement = scoreAgreement([e.fc_score, e.ktc_score, e.dp_score]);
      }
    }
    for (const p of valued) {
      const e = combined.get(`pick_${p.season}_${p.round}_${p.original_owner_id}`);
      if (e) {
        p.edge_score = e.score;
        p.ktc_score = e.ktc_score;
        p.dp_score = e.dp_score;
      }
    }
    const enrichedValued = await Promise.all(
      valued.map((pick) =>
        enrichScoredPick(pick, {
          leagueSize: league.total_rosters,
          format: mode,
        })
      )
    );

    const picksByRid = new Map<number, ScoredPick[]>();
    for (const p of enrichedValued) {
      if (p.edge_score <= 0) continue;
      const a = picksByRid.get(p.roster_id) ?? [];
      a.push(p);
      picksByRid.set(p.roster_id, a);
    }

    const rosterData = owners.map(([oid, players]) => {
      const wv = players.map((p) => ({ ...p, es: compMap.get(p.player_id)?.edge_score ?? 0, cv: compMap.get(p.player_id) }));
      const sorted = [...wv].sort((a, b) => b.es - a.es);
      const starters = sorted.slice(0, slots);
      const sv = starters.reduce((s, p) => s + p.es, 0);
      const avgSS = starters.length > 0 ? Math.round((sv / starters.length) * 10) / 10 : 0;
      const wc = sorted.map((p) => ({ ...p, ac: getAgeCurveStatus(p.position, p.age) }));
      const coreN = Math.min(12, slots + 3);
      const core = wc.slice(0, coreN);
      const wcr = computeWindowRaw(core.map((p) => ({ value: p.es, age_score: p.ac.score })));
      const wtr = computeWindowRaw(wc.map((p) => ({ value: p.es, age_score: p.ac.score })));
      const coreAssets: CoreAsset[] = wc.map((p) => {
        const lp = leaguePointsMap.get(p.player_id);
        return {
          player_id: p.player_id, full_name: p.full_name, position: p.position,
          edge_score: p.es, age: p.age, age_curve: p.ac,
          fc_value: p.cv?.fc_value ?? null, ktc_value: p.cv?.ktc_value ?? null, dp_value: p.cv?.dp_value ?? null,
          fc_score: p.cv?.fc_score ?? null, ktc_score: p.cv?.ktc_score ?? null, dp_score: p.cv?.dp_score ?? null,
          ppg: ppgMap.get(p.player_id)?.ppg ?? null,
          sources_available: p.cv?.sources_available ?? 0, source_agreement: p.cv?.source_agreement ?? "high",
          team: p.team, status: p.status,
          availability: getPlayerAvailability({
            status: p.status, team: p.team, sources_available: p.cv?.sources_available ?? 0,
            external_flags_fa: p.external_flags_fa,
          }),
          league_points_total: lp?.total_points ?? null,
          league_points_ppg: lp?.per_game_points ?? null,
          league_points_weeks: lp?.weeks_scored ?? null,
          league_points_season: lp ? LEAGUE_SCORING_SEASON : null,
        };
      });
      const srcAvg = wc.length > 0 ? Math.round((wc.reduce((s, p) => s + (p.cv?.sources_available ?? 0), 0) / wc.length) * 10) / 10 : 0;
      const rid = ridMap.get(`${lid}:${oid}`) ?? 0;
      const rPicks = (picksByRid.get(rid) ?? []).sort((a, b) => b.edge_score - a.edge_score);
      const dv = rPicks.reduce((s, p) => s + p.edge_score, 0);
      const lineup = optimizeLineup(coreAssets, rosterPositions);
      return {
        oid, sv, avgSS, wcr, wtr,
        coreCov: core.length > 0 ? (core.filter((p) => p.es > 0).length / coreN) * 100 : 0,
        totCov: wc.length > 0 ? (wc.filter((p) => p.es > 0).length / wc.length) * 100 : 0,
        coreAssets, srcAvg, dv, rPicks, lineup,
      };
    });

    const allSV = rosterData.map((r) => r.sv);
    const allDV = rosterData.map((r) => r.dv);
    const allWCR = rosterData.map((r) => r.wcr);
    const allWTR = rosterData.map((r) => r.wtr);

    const rosters: RosterRanking[] = rosterData.map((r) => {
      const pp = percentileRank(allSV, r.sv);
      const dp = percentileRank(allDV, r.dv);
      const wcp = percentileRank(allWCR, r.wcr);
      const wtp = percentileRank(allWTR, r.wtr);
      const { archetype, reasons } = classifyTeam(pp, dp, wcp);
      const nameRow = nmMap.get(`${lid}:${r.oid}`);
      const readableName =
        nameRow?.team_name?.trim()
        || nameRow?.display_name?.trim()
        || (ridMap.get(`${lid}:${r.oid}`) ? `Roster ${ridMap.get(`${lid}:${r.oid}`)}` : null)
        || r.oid;
      return {
        roster_id: ridMap.get(`${lid}:${r.oid}`) ?? 0,
        owner_id: r.oid,
        display_name: readableName,
        is_user: r.oid === userId,
        starters_value: r.sv,
        avg_starter_score: r.avgSS,
        power_pct: Math.round(pp * 10) / 10,
        draft_value: r.dv,
        draft_pct: Math.round(dp * 10) / 10,
        draft_picks: r.rPicks,
        window_core_raw: Math.round(r.wcr * 10) / 10,
        window_core_pct: Math.round(wcp * 10) / 10,
        window_total_raw: Math.round(r.wtr * 10) / 10,
        window_total_pct: Math.round(wtp * 10) / 10,
        window_core_coverage_pct: Math.round(r.coreCov),
        window_total_coverage_pct: Math.round(r.totCov),
        archetype,
        reasons,
        core_assets: r.coreAssets,
        avg_sources_available: r.srcAvg,
        lineup: r.lineup,
      };
    });

    rosters.sort((a, b) => b.power_pct - a.power_pct);
    results.push({
      league_id: lid,
      league_name: league.league_name,
      mode,
      draft_data_available: picks.length > 0,
      scoring_label: sLabel,
      rosters,
    });
  }

  results.sort((a, b) => a.league_name.localeCompare(b.league_name));
  return results;
}
