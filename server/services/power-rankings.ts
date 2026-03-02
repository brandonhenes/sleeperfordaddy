import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { getLeague } from "../sleeper/leagues.js";
import { getAgeCurveStatus, type AgeCurveStatus } from "./age-curves.js";
import { classifyTeam, percentileRank } from "./archetypes.js";
import { getCompositeValues } from "./composite-values.js";
import { computeEdgeScores } from "./edge-score.js";
import {
  getLeagueDraftPicks, estimatePickTiers, scoreDraftPicks,
  type ScoredPick, type DraftPick,
} from "./draft-picks.js";

// ─── Types ───

export interface CoreAsset {
  player_id: string;
  full_name: string;
  position: string;
  edge_score: number;
  age: number | null;
  age_curve: AgeCurveStatus;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  fc_score: number | null;
  ktc_score: number | null;
  dp_score: number | null;
  sources_available: number;
  source_agreement: "high" | "medium" | "low";
}

export interface RosterRanking {
  roster_id: number;
  owner_id: string | null;
  display_name: string;
  is_user: boolean;
  starters_value: number;
  avg_starter_score: number;
  power_pct: number;
  draft_value: number;
  draft_pct: number;
  draft_picks: ScoredPick[];
  window_core_raw: number;
  window_core_pct: number;
  window_total_raw: number;
  window_total_pct: number;
  window_core_coverage_pct: number;
  window_total_coverage_pct: number;
  archetype: string;
  reasons: string[];
  core_assets: CoreAsset[];
  avg_sources_available: number;
}

export interface LeaguePowerRanking {
  league_id: string;
  league_name: string;
  mode: "sf" | "1qb";
  draft_data_available: boolean;
  rosters: RosterRanking[];
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

function scoreAgreement(scores: (number | null)[]): "high" | "medium" | "low" {
  const v = scores.filter((s): s is number => s != null);
  if (v.length <= 1) return "high";
  const spread = Math.max(...v) - Math.min(...v);
  return spread < 5 ? "high" : spread <= 12 ? "medium" : "low";
}

// ─── Main ───

export async function getPowerRankings(username: string): Promise<LeaguePowerRanking[]> {
  const userRows = await db.execute(sql`
    SELECT user_id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `);
  const userId = (userRows as unknown as { user_id: string }[])[0]?.user_id;
  if (!userId) return [];

  const leagueRows = await db.execute(sql`
    SELECT l.league_id, l.name AS league_name, l.total_rosters
    FROM user_leagues ul JOIN leagues l ON ul.league_id = l.league_id
    WHERE ul.user_id = ${userId}
      AND l.season = (SELECT MAX(season) FROM leagues)
    ORDER BY l.name ASC
  `);
  type League = { league_id: string; league_name: string; total_rosters: number };
  const leagues = leagueRows as unknown as League[];
  if (leagues.length === 0) return [];

  const idFrags = leagues.map((l) => sql`${l.league_id}`);
  const inClause = sql.join(idFrags, sql`, `);

  const rosterRows = await db.execute(sql`
    SELECT rp.league_id, rp.owner_id, rp.player_id, pm.full_name, pm.position, pm.age
    FROM roster_players rp JOIN players_master pm ON rp.player_id = pm.player_id
    WHERE rp.league_id IN (${inClause}) AND pm.position IN ('QB','RB','WR','TE')
  `);
  type RR = { league_id: string; owner_id: string; player_id: string; full_name: string; position: string; age: number | null };
  const rows = rosterRows as unknown as RR[];

  const [ridRows, nmRows] = await Promise.all([
    db.execute(sql`SELECT league_id, owner_id, roster_id FROM rosters WHERE league_id IN (${inClause})`),
    db.execute(sql`SELECT league_id, user_id, display_name FROM league_users WHERE league_id IN (${inClause})`),
  ]);
  const ridMap = new Map<string, number>();
  for (const r of ridRows as unknown as { league_id: string; owner_id: string; roster_id: number }[])
    ridMap.set(`${r.league_id}:${r.owner_id}`, r.roster_id);
  const nmMap = new Map<string, string>();
  for (const r of nmRows as unknown as { league_id: string; user_id: string; display_name: string | null }[])
    nmMap.set(`${r.league_id}:${r.user_id}`, r.display_name ?? r.user_id);

  const nested: Record<string, Record<string, RR[]>> = {};
  for (const r of rows) { nested[r.league_id] ??= {}; nested[r.league_id][r.owner_id] ??= []; nested[r.league_id][r.owner_id].push(r); }

  // Fetch league settings AND draft picks in parallel (spec rule #3)
  const settingsMap = new Map<string, { sf: boolean; slots: number }>();
  const dpMap = new Map<string, DraftPick[]>();
  await Promise.all(leagues.map(async (l) => {
    try {
      const [detail, picks] = await Promise.all([getLeague(l.league_id), getLeagueDraftPicks(l.league_id)]);
      if (detail?.roster_positions) settingsMap.set(l.league_id, { sf: detectSF(detail.roster_positions), slots: countStarterSlots(detail.roster_positions) });
      dpMap.set(l.league_id, picks);
    } catch { /* fallback */ }
  }));

  const results: LeaguePowerRanking[] = [];

  for (const league of leagues) {
    const lid = league.league_id;
    const teams = nested[lid] ?? {};
    const { sf, slots } = settingsMap.get(lid) ?? { sf: false, slots: 9 };
    const mode = sf ? "sf" : "1qb";
    const owners = Object.entries(teams);

    // Step 1: Player composite values
    const playerIds = [...new Set(owners.flatMap(([, ps]) => ps.map((p) => p.player_id)))];
    const compMap = await getCompositeValues(playerIds, mode);

    // Step 2: Initial power for tier estimation
    const initSV = owners.map(([oid, ps]) => {
      const s = ps.map((p) => compMap.get(p.player_id)?.edge_score ?? 0).sort((a, b) => b - a);
      return { oid, sv: s.slice(0, slots).reduce((a, v) => a + v, 0) };
    });
    const allInit = initSV.map((r) => r.sv);
    const rPower = new Map<number, number>();
    for (const r of initSV) rPower.set(ridMap.get(`${lid}:${r.oid}`) ?? 0, percentileRank(allInit, r.sv));

    // Step 3: Draft picks — tiers, values, combined scoring
    const tiered = estimatePickTiers(dpMap.get(lid) ?? [], rPower);
    const valued = await scoreDraftPicks(tiered, mode);

    const pInputs = [...compMap.values()].map((c) => ({
      sleeper_id: c.sleeper_id, fc_value: c.fc_value, ktc_value: c.ktc_value, dp_value: c.dp_value,
    }));
    const pkInputs = valued.map((p) => ({
      sleeper_id: `pick_${p.season}_${p.round}_${p.original_owner_id}`,
      fc_value: null as number | null, ktc_value: p.ktc_value, dp_value: p.dp_value,
    }));
    const combined = computeEdgeScores([...pInputs, ...pkInputs]);

    for (const [id, cv] of compMap) {
      const e = combined.get(id);
      if (e) { cv.edge_score = e.score; cv.fc_score = e.fc_score; cv.ktc_score = e.ktc_score; cv.dp_score = e.dp_score; cv.sources_available = e.sources_used; cv.source_agreement = scoreAgreement([e.fc_score, e.ktc_score, e.dp_score]); }
    }
    for (const p of valued) {
      const e = combined.get(`pick_${p.season}_${p.round}_${p.original_owner_id}`);
      if (e) { p.edge_score = e.score; p.ktc_score = e.ktc_score; p.dp_score = e.dp_score; }
    }

    // Group picks by owner roster_id
    const picksByRid = new Map<number, ScoredPick[]>();
    for (const p of valued) { const a = picksByRid.get(p.roster_id) ?? []; a.push(p); picksByRid.set(p.roster_id, a); }

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
      const coreAssets: CoreAsset[] = wc.map((p) => ({
        player_id: p.player_id, full_name: p.full_name, position: p.position,
        edge_score: p.es, age: p.age, age_curve: p.ac,
        fc_value: p.cv?.fc_value ?? null, ktc_value: p.cv?.ktc_value ?? null, dp_value: p.cv?.dp_value ?? null,
        fc_score: p.cv?.fc_score ?? null, ktc_score: p.cv?.ktc_score ?? null, dp_score: p.cv?.dp_score ?? null,
        sources_available: p.cv?.sources_available ?? 0, source_agreement: p.cv?.source_agreement ?? "high",
      }));
      const srcAvg = wc.length > 0 ? Math.round((wc.reduce((s, p) => s + (p.cv?.sources_available ?? 0), 0) / wc.length) * 10) / 10 : 0;
      const rid = ridMap.get(`${lid}:${oid}`) ?? 0;
      const rPicks = (picksByRid.get(rid) ?? []).sort((a, b) => b.edge_score - a.edge_score);
      const dv = rPicks.reduce((s, p) => s + p.edge_score, 0);
      return { oid, sv, avgSS, wcr, wtr, coreCov: core.length > 0 ? (core.filter((p) => p.es > 0).length / coreN) * 100 : 0,
        totCov: wc.length > 0 ? (wc.filter((p) => p.es > 0).length / wc.length) * 100 : 0,
        coreAssets, srcAvg, dv, rPicks };
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
      return {
        roster_id: ridMap.get(`${lid}:${r.oid}`) ?? 0,
        owner_id: r.oid, display_name: nmMap.get(`${lid}:${r.oid}`) ?? r.oid,
        is_user: r.oid === userId,
        starters_value: r.sv, avg_starter_score: r.avgSS,
        power_pct: Math.round(pp * 10) / 10,
        draft_value: r.dv, draft_pct: Math.round(dp * 10) / 10, draft_picks: r.rPicks,
        window_core_raw: Math.round(r.wcr * 10) / 10, window_core_pct: Math.round(wcp * 10) / 10,
        window_total_raw: Math.round(r.wtr * 10) / 10, window_total_pct: Math.round(wtp * 10) / 10,
        window_core_coverage_pct: Math.round(r.coreCov), window_total_coverage_pct: Math.round(r.totCov),
        archetype, reasons, core_assets: r.coreAssets, avg_sources_available: r.srcAvg,
      };
    });

    rosters.sort((a, b) => b.power_pct - a.power_pct);
    results.push({ league_id: lid, league_name: league.league_name, mode, draft_data_available: (dpMap.get(lid) ?? []).length > 0, rosters });
  }

  results.sort((a, b) => a.league_name.localeCompare(b.league_name));
  return results;
}
