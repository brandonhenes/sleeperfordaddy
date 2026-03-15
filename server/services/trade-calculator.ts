import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type {
  EvaluatedAsset,
  TradeAssetInput,
  TradeEvaluation,
  TradeHealthWarning,
} from "../../shared/types.js";
import type { SourceWeights } from "./edge-score.js";
import { getCompositeValues, getGlobalScaleParams } from "./composite-values.js";
import { computeEdgeScores } from "./edge-score.js";
import { evaluateTradeValue } from "./trade-value.js";
import { getAgeCurveStatus } from "./age-curves.js";
import {
  getTradePickBreakdown,
  type ClassStrengthMap,
} from "./pick-values.js";
import {
  parseLeagueScoring,
  loadPlayerUsageStats,
  computeScoringDelta,
  computeAdjustedEdgeScore,
  estimateBaselineFPPG,
} from "./scoring-adjustment.js";

const ROUND_NAMES: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
};

export interface TradeSearchAsset {
  type: "player";
  player_id: string;
  label: string;
  position: string;
  team: string | null;
}

function agreementFromScores(scores: Array<number | null>): "high" | "medium" | "low" {
  const valid = scores.filter((s): s is number => s != null);
  if (valid.length <= 1) return "high";
  const spread = Math.max(...valid) - Math.min(...valid);
  if (spread < 5) return "high";
  if (spread <= 12) return "medium";
  return "low";
}

function normalizePick(asset: TradeAssetInput): { season: string; round: number; tier: "early" | "mid" | "late" } {
  const year = String(new Date().getFullYear());
  const season = asset.pick_season ?? year;
  const round = Number(asset.pick_round ?? 1);
  const tier = (asset.pick_tier ?? "mid");
  return { season, round, tier };
}

async function loadPickValueMaps(mode: "sf" | "1qb"): Promise<{
  ktcMap: Map<string, number>;
  dpMap: Map<string, number>;
}> {
  const [ktcRows, dpRows] = await Promise.all([
    db.execute(sql`
      SELECT pick_season, pick_round, pick_tier, value_1qb, value_sf
      FROM ktc_values
      WHERE is_pick = true
    `),
    db.execute(sql`
      SELECT player_name, value_1qb, value_2qb
      FROM dynastyprocess_values
      WHERE is_pick = true
    `),
  ]);

  type KtcPickRow = {
    pick_season: number | null;
    pick_round: number | null;
    pick_tier: string | null;
    value_1qb: number | null;
    value_sf: number | null;
  };
  type DpPickRow = {
    player_name: string;
    value_1qb: number | null;
    value_2qb: number | null;
  };

  const ktcMap = new Map<string, number>();
  for (const r of ktcRows as unknown as KtcPickRow[]) {
    if (r.pick_season == null || r.pick_round == null) continue;
    const val = mode === "sf" ? r.value_sf : r.value_1qb;
    if (val == null || val <= 0) continue;
    const tier = (r.pick_tier ?? "").toLowerCase();
    ktcMap.set(`${r.pick_season}|${tier}|${r.pick_round}`, val);
    const generic = `${r.pick_season}||${r.pick_round}`;
    if (!ktcMap.has(generic)) ktcMap.set(generic, val);
  }

  const dpMap = new Map<string, number>();
  for (const r of dpRows as unknown as DpPickRow[]) {
    const val = mode === "sf" ? r.value_2qb : r.value_1qb;
    if (val == null || val <= 0) continue;
    dpMap.set(r.player_name.toLowerCase().trim(), val);
  }

  return { ktcMap, dpMap };
}

function interpolatePickValue(
  slot: number,
  round: number,
  season: string,
  pickMaps: { ktcMap: Map<string, number>; dpMap: Map<string, number> },
  leagueSize = 12
): { ktcValue: number | null; dpValue: number | null; label: string } {
  const tierBoundary1 = Math.ceil(leagueSize / 3);
  const tierBoundary2 = Math.ceil((leagueSize * 2) / 3);

  let primaryTier: "early" | "mid" | "late";
  let secondaryTier: "early" | "mid" | "late" | null = null;
  let blendFactor = 0;

  if (slot <= tierBoundary1) {
    primaryTier = "early";
    if (slot > 1) {
      secondaryTier = "mid";
      blendFactor = (slot - 1) / tierBoundary1;
    }
  } else if (slot <= tierBoundary2) {
    primaryTier = "mid";
    const midStart = tierBoundary1 + 1;
    const midEnd = tierBoundary2;
    const midRange = Math.max(1, midEnd - midStart);
    const midPos = slot - midStart;
    if (midPos < midRange / 2) {
      secondaryTier = "early";
      blendFactor = 0.15;
    } else {
      secondaryTier = "late";
      blendFactor = 0.15;
    }
  } else {
    primaryTier = "late";
    secondaryTier = "mid";
    const denominator = Math.max(1, leagueSize - tierBoundary2);
    blendFactor = Math.max(0, 1 - (slot - tierBoundary2) / denominator) * 0.3;
  }

  const roundName = ROUND_NAMES[round] ?? `R${round}`;
  const label = `${season} ${round}.${String(slot).padStart(2, "0")}`;
  const primaryKtc = pickMaps.ktcMap.get(`${season}|${primaryTier}|${round}`) ?? null;
  const secondaryKtc = secondaryTier
    ? pickMaps.ktcMap.get(`${season}|${secondaryTier}|${round}`) ?? null
    : null;

  let ktcValue: number | null = null;
  if (primaryKtc != null) {
    if (secondaryKtc != null && blendFactor > 0) {
      ktcValue = Math.round(primaryKtc * (1 - blendFactor) + secondaryKtc * blendFactor);
    } else {
      ktcValue = primaryKtc;
    }
  }

  const tierLabel = primaryTier.charAt(0).toUpperCase() + primaryTier.slice(1);
  const dpValue =
    pickMaps.dpMap.get(`${season} ${tierLabel} ${roundName}`.toLowerCase()) ??
    pickMaps.dpMap.get(`${season} ${roundName}`.toLowerCase()) ??
    null;

  return { ktcValue, dpValue, label };
}

type RawEval = {
  player_id: string | null;
  position: string | null;
  label: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
  direct_edge_score?: number | null;
  pick_breakdown?: EvaluatedAsset["pick_breakdown"];
};

export interface TradeHealthAssetInput {
  player_id?: string | null;
  position: string | null;
  label: string;
  edge_score: number;
}

export interface TradeHealthPlayerInfo {
  player_id: string;
  full_name: string | null;
  position: string | null;
  age: number | null;
  trend_30day: number | null;
  current_fc_value: number | null;
  historical_peak_fc_value: number | null;
  edge_score: number | null;
}

function formatPlayerName(asset: TradeHealthAssetInput, info?: TradeHealthPlayerInfo | null): string {
  const label = info?.full_name || asset.label || "This player";
  return label.replace(/\s+\([A-Z]{1,3}\)$/, "");
}

function tradeDirectionForPlayer(info: TradeHealthPlayerInfo): "increasing" | "stable" | "decreasing" {
  const zone = getAgeCurveStatus(info.position ?? "", info.age).zone;
  const trend = info.trend_30day ?? 0;
  if (zone === "Ascent" && trend > 0) return "increasing";
  if ((zone === "Decline" || zone === "Cliff") && trend <= 0) return "decreasing";
  return "stable";
}

export async function loadTradeHealthPlayerInfo(
  playerIds: string[],
  edgeScoreByPlayerId: Map<string, number> = new Map()
): Promise<Map<string, TradeHealthPlayerInfo>> {
  const uniqueIds = [...new Set(playerIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const [playerRows, latestFantasycalcRows, historicalRows] = await Promise.all([
    db.execute(sql`
      SELECT player_id, full_name, position, age
      FROM players_master
      WHERE player_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
    `),
    db.execute(sql`
      SELECT sleeper_id AS player_id, dynasty_value::float AS dynasty_value, trend_30day::float AS trend_30day
      FROM fantasycalc_daily
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM fantasycalc_daily)
        AND sleeper_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
    `),
    db.execute(sql`
      SELECT player_id, MAX(fc_value)::float AS peak_fc_value
      FROM player_value_snapshots
      WHERE player_id IN (${sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY player_id
    `),
  ]);

  const latestMap = new Map<string, { dynasty_value: number | null; trend_30day: number | null }>();
  for (const row of latestFantasycalcRows as unknown as Array<{
    player_id: string;
    dynasty_value: number | null;
    trend_30day: number | null;
  }>) {
    latestMap.set(row.player_id, {
      dynasty_value: row.dynasty_value ?? null,
      trend_30day: row.trend_30day ?? null,
    });
  }

  const historicalMap = new Map<string, number | null>();
  for (const row of historicalRows as unknown as Array<{
    player_id: string;
    peak_fc_value: number | null;
  }>) {
    historicalMap.set(row.player_id, row.peak_fc_value ?? null);
  }

  const infoMap = new Map<string, TradeHealthPlayerInfo>();
  for (const row of playerRows as unknown as Array<{
    player_id: string;
    full_name: string | null;
    position: string | null;
    age: number | null;
  }>) {
    const latest = latestMap.get(row.player_id);
    infoMap.set(row.player_id, {
      player_id: row.player_id,
      full_name: row.full_name ?? null,
      position: row.position ?? null,
      age: row.age ?? null,
      trend_30day: latest?.trend_30day ?? null,
      current_fc_value: latest?.dynasty_value ?? null,
      historical_peak_fc_value: historicalMap.get(row.player_id) ?? null,
      edge_score: edgeScoreByPlayerId.get(row.player_id) ?? null,
    });
  }

  return infoMap;
}

export function tradeHealthCheck(
  sideA: TradeHealthAssetInput[],
  sideB: TradeHealthAssetInput[],
  playersData: Map<string, TradeHealthPlayerInfo>,
  fairness?: TradeEvaluation["fairness"]
): TradeHealthWarning[] {
  const warnings: TradeHealthWarning[] = [];
  const seen = new Set<string>();

  const sideAPlayers = sideA
    .map((asset) => {
      const info = asset.player_id ? playersData.get(asset.player_id) : null;
      return info ? { asset, info } : null;
    })
    .filter((entry): entry is { asset: TradeHealthAssetInput; info: TradeHealthPlayerInfo } => !!entry);
  const sideBPlayers = sideB
    .map((asset) => {
      const info = asset.player_id ? playersData.get(asset.player_id) : null;
      return info ? { asset, info } : null;
    })
    .filter((entry): entry is { asset: TradeHealthAssetInput; info: TradeHealthPlayerInfo } => !!entry);

  const pushWarning = (warning: TradeHealthWarning) => {
    const key = `${warning.type}:${warning.rule}:${warning.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(warning);
  };

  const ascendingAssets = sideAPlayers.filter(({ info }) => getAgeCurveStatus(info.position ?? "", info.age).zone === "Ascent");
  const sideBDecliningOnly =
    sideBPlayers.length > 0 &&
    sideBPlayers.every(({ info }) => {
      const zone = getAgeCurveStatus(info.position ?? "", info.age).zone;
      return zone === "Decline" || zone === "Cliff";
    });
  if (ascendingAssets.length > 0 && sideBDecliningOnly) {
    const ascending = ascendingAssets[0];
    const veteran = sideBPlayers[0];
    pushWarning({
      type: "block",
      rule: "ascending_for_declining",
      message: `${formatPlayerName(ascending.asset, ascending.info)} is ${ascending.info.age ?? "young"} and ascending. ${formatPlayerName(veteran.asset, veteran.info)} is ${veteran.info.age ?? "older"} and declining. Do not trade ascending youth for declining veterans.`,
    });
  }

  for (const { asset, info } of sideBPlayers) {
    const currentValue = info.current_fc_value ?? null;
    const peakValue = info.historical_peak_fc_value ?? null;
    if (
      (info.age ?? 0) >= 27 &&
      currentValue != null &&
      peakValue != null &&
      peakValue > 0 &&
      currentValue >= peakValue * 0.9
    ) {
      pushWarning({
        type: "warning",
        rule: "career_year_sell_signal",
        message: `${formatPlayerName(asset, info)} is ${info.age} and at peak value. This is a sell window for them, not a buy signal for you.`,
      });
    }
  }

  const sideAIncreasingValue = sideAPlayers.reduce((sum, { asset, info }) => {
    return tradeDirectionForPlayer(info) === "increasing"
      ? sum + (asset.edge_score || info.edge_score || 0)
      : sum;
  }, 0);
  const sideBIncreasingValue = sideBPlayers.reduce((sum, { asset, info }) => {
    return tradeDirectionForPlayer(info) === "increasing"
      ? sum + (asset.edge_score || info.edge_score || 0)
      : sum;
  }, 0);
  if (sideAIncreasingValue > sideBIncreasingValue && sideAIncreasingValue > 0) {
    pushWarning({
      type: "warning",
      rule: "value_direction",
      message: "You are giving up more appreciating assets than you are acquiring.",
    });
  }

  for (const { asset, info } of sideAPlayers) {
    const position = (info.position ?? asset.position ?? "").toUpperCase();
    const age = info.age ?? null;
    const edgeScore = asset.edge_score || info.edge_score || 0;
    const protectedYoungCore =
      (position === "WR" && age != null && age < 24 && edgeScore >= 65) ||
      (position === "QB" && age != null && age < 26 && edgeScore >= 65) ||
      (age != null && age < 23 && edgeScore >= 55);
    if (!protectedYoungCore) continue;
    pushWarning({
      type: "warning",
      rule: "young_core_protection",
      message: `${formatPlayerName(asset, info)} is part of your young core. Only move them for an overwhelming return.`,
    });
  }

  const hasDynastyWarnings = warnings.some((warning) => warning.type === "warning");
  if (hasDynastyWarnings && (fairness === "fair" || fairness === "slight_edge")) {
    pushWarning({
      type: "warning",
      rule: "roster_fit_trap",
      message: "This trade looks fair by current value but has dynasty direction concerns.",
    });
  }

  return warnings;
}

async function evaluateAssets(
  assets: TradeAssetInput[],
  mode: "sf" | "1qb",
  leagueId?: string,
  classStrengths?: ClassStrengthMap
): Promise<RawEval[]> {
  if (assets.length === 0) return [];

  const playerIds = assets
    .filter((a): a is TradeAssetInput & { type: "player"; player_id: string } => a.type === "player" && !!a.player_id)
    .map((a) => a.player_id);

  const uniquePlayerIds = [...new Set(playerIds)];
  const [compMap, nameRows, pickMaps] = await Promise.all([
    getCompositeValues(uniquePlayerIds, mode),
    uniquePlayerIds.length > 0
      ? db.execute(sql`
          SELECT player_id, full_name, position
          FROM players_master
          WHERE player_id IN (${sql.join(uniquePlayerIds.map((id) => sql`${id}`), sql`, `)})
        `)
      : Promise.resolve([]),
    loadPickValueMaps(mode),
  ]);

  let leagueSize = 12;
  if (leagueId) {
    const leagueRows = await db.execute(sql`
      SELECT total_rosters FROM leagues WHERE league_id = ${leagueId} LIMIT 1
    `);
    const totalRosters = (leagueRows as unknown as Array<{ total_rosters: number | null }>)[0]?.total_rosters;
    if (totalRosters && totalRosters > 0) leagueSize = totalRosters;
  }

  const names = new Map<string, { full_name: string; position: string }>();
  for (const r of nameRows as unknown as { player_id: string; full_name: string; position: string }[]) {
    names.set(r.player_id, { full_name: r.full_name, position: r.position });
  }

  return Promise.all(assets.map(async (asset) => {
    if (asset.type === "player" && asset.player_id) {
      const comp = compMap.get(asset.player_id);
      const meta = names.get(asset.player_id);
      return {
        player_id: asset.player_id,
        position: meta?.position ?? null,
        label: meta ? `${meta.full_name} (${meta.position})` : `Player ${asset.player_id}`,
        fc_value: comp?.fc_value ?? null,
        ktc_value: comp?.ktc_value ?? null,
        dp_value: comp?.dp_value ?? null,
      };
    }

    const pick = normalizePick(asset);
    const pickBreakdown = await getTradePickBreakdown(
      {
        pick_season: pick.season,
        pick_round: pick.round,
        pick_tier: pick.tier,
        pick_slot: asset.pick_slot,
        pick_label: asset.pick_label,
        pick_original_owner_id: asset.pick_original_owner_id,
      },
      {
        leagueSize,
        format: mode,
        classStrengths,
      }
    );
    if (asset.pick_slot != null && asset.pick_slot > 0) {
      const interpolated = interpolatePickValue(
        asset.pick_slot,
        pick.round,
        pick.season,
        pickMaps
      );
      return {
        player_id: null,
        position: null,
        label: pickBreakdown.pickLabel ?? asset.pick_label ?? interpolated.label,
        fc_value: null,
        ktc_value: interpolated.ktcValue,
        dp_value: interpolated.dpValue,
        direct_edge_score: pickBreakdown.finalValue,
        pick_breakdown: pickBreakdown,
      };
    }

    const roundName = ROUND_NAMES[pick.round] ?? `R${pick.round}`;
    const tierLabel = pick.tier.charAt(0).toUpperCase() + pick.tier.slice(1);
    const label = asset.pick_label ?? `${pick.season} ${tierLabel} ${roundName}`;

    const ktcValue =
      pickMaps.ktcMap.get(`${pick.season}|${pick.tier}|${pick.round}`) ??
      pickMaps.ktcMap.get(`${pick.season}||${pick.round}`) ??
      null;
    const dpValue =
      pickMaps.dpMap.get(`${pick.season} ${tierLabel} ${roundName}`.toLowerCase()) ??
      pickMaps.dpMap.get(`${pick.season} ${roundName}`.toLowerCase()) ??
      null;

    return {
      player_id: null,
      position: null,
      label: pickBreakdown.pickLabel ?? label,
      fc_value: null,
      ktc_value: ktcValue,
      dp_value: dpValue,
      direct_edge_score: pickBreakdown.finalValue,
      pick_breakdown: pickBreakdown,
    };
  }));
}

function toEvaluatedAsset(raw: RawEval, edge: { score: number; fc_score: number | null; ktc_score: number | null; dp_score: number | null }): EvaluatedAsset {
  return {
    player_id: raw.player_id,
    position: raw.position,
    label: raw.label,
    edge_score: raw.direct_edge_score ?? edge.score,
    trade_power: 0,
    fc_score: edge.fc_score,
    ktc_score: edge.ktc_score,
    dp_score: edge.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: agreementFromScores([edge.fc_score, edge.ktc_score, edge.dp_score]),
    pick_breakdown: raw.pick_breakdown ?? null,
  };
}

export async function evaluateTrade(
  sideA: TradeAssetInput[],
  sideB: TradeAssetInput[],
  mode: "sf" | "1qb",
  weights?: SourceWeights,
  leagueId?: string,
  classStrengths?: ClassStrengthMap
): Promise<TradeEvaluation> {
  const [rawA, rawB, globalScale] = await Promise.all([
    evaluateAssets(sideA, mode, leagueId, classStrengths),
    evaluateAssets(sideB, mode, leagueId, classStrengths),
    getGlobalScaleParams(mode),
  ]);

  const allRaw = [...rawA, ...rawB];
  const inputs = allRaw.map((a, i) => ({
    sleeper_id: String(i),
    fc_value: a.fc_value,
    ktc_value: a.ktc_value,
    dp_value: a.dp_value,
  }));

  const edgeMap = computeEdgeScores(inputs, globalScale, weights);

  const evalA: EvaluatedAsset[] = rawA.map((a, i) =>
    toEvaluatedAsset(a, edgeMap.get(String(i)) ?? { score: 0, fc_score: null, ktc_score: null, dp_score: null })
  );
  const evalB: EvaluatedAsset[] = rawB.map((a, i) =>
    toEvaluatedAsset(
      a,
      edgeMap.get(String(rawA.length + i)) ?? { score: 0, fc_score: null, ktc_score: null, dp_score: null }
    )
  );

  if (leagueId) {
    const leagueRow = await db.execute(sql`
      SELECT scoring_settings FROM leagues WHERE league_id = ${leagueId} LIMIT 1
    `);
    const settings = parseLeagueScoring(
      (leagueRow as unknown as { scoring_settings: Record<string, unknown> | null }[])[0]?.scoring_settings ?? null
    );

    const allPlayerIds = [...new Set([...evalA, ...evalB].map((a) => a.player_id).filter((id): id is string => !!id))];
    const usageMap = await loadPlayerUsageStats(allPlayerIds);

    for (const asset of [...evalA, ...evalB]) {
      if (!asset.player_id || !asset.position) continue;
      const usage = usageMap.get(asset.player_id);
      if (!usage) continue;
      const { delta_ppg } = computeScoringDelta(usage, asset.position, settings);
      const baselineFPPG = estimateBaselineFPPG(usage, asset.position);
      asset.league_adjusted_score = computeAdjustedEdgeScore(asset.edge_score, delta_ppg, baselineFPPG);
      asset.scoring_delta_ppg = delta_ppg;
    }
  }

  const edgesA = evalA.map((a) => a.edge_score);
  const edgesB = evalB.map((a) => a.edge_score);
  const tvResult = evaluateTradeValue(edgesA, edgesB);

  for (let i = 0; i < evalA.length; i++) {
    evalA[i].trade_power = tvResult.sideA.trade_powers[i] ?? 0;
  }
  for (let i = 0; i < evalB.length; i++) {
    evalB[i].trade_power = tvResult.sideB.trade_powers[i] ?? 0;
  }

  const totalEdgeA = Math.round(evalA.reduce((s, a) => s + a.edge_score, 0) * 10) / 10;
  const totalEdgeB = Math.round(evalB.reduce((s, a) => s + a.edge_score, 0) * 10) / 10;
  const healthScoreMap = new Map<string, number>();
  for (const asset of [...evalA, ...evalB]) {
    if (asset.player_id) healthScoreMap.set(asset.player_id, asset.edge_score);
  }
  const tradeHealth = await loadTradeHealthPlayerInfo(
    [...healthScoreMap.keys()],
    healthScoreMap
  );
  const healthCheck = tradeHealthCheck(evalA, evalB, tradeHealth, tvResult.fairness);

  return {
    sideA: {
      assets: evalA,
      total_edge: totalEdgeA,
      total_trade_power: tvResult.sideA.total_tp,
      package_penalty_pct: tvResult.sideA.penalty_pct,
    },
    sideB: {
      assets: evalB,
      total_edge: totalEdgeB,
      total_trade_power: tvResult.sideB.total_tp,
      package_penalty_pct: tvResult.sideB.penalty_pct,
    },
    delta: tvResult.delta_tp,
    delta_edge: Math.round((totalEdgeA - totalEdgeB) * 10) / 10,
    fairness: tvResult.fairness,
    healthCheck,
  };
}

export async function searchTradeAssets(query: string, limit = 20): Promise<TradeSearchAsset[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await db.execute(sql`
    SELECT player_id, full_name, position, team
    FROM players_master
    WHERE position IN ('QB', 'RB', 'WR', 'TE')
      AND full_name ILIKE ${`%${q}%`}
    ORDER BY
      CASE
        WHEN LOWER(full_name) = LOWER(${q}) THEN 0
        WHEN LOWER(full_name) LIKE LOWER(${`${q}%`}) THEN 1
        ELSE 2
      END,
      full_name ASC
    LIMIT ${Math.max(1, Math.min(limit, 50))}
  `);

  return (rows as unknown as {
    player_id: string;
    full_name: string;
    position: string;
    team: string | null;
  }[]).map((r) => ({
    type: "player",
    player_id: r.player_id,
    label: `${r.full_name} (${r.position}${r.team ? ` - ${r.team}` : ""})`,
    position: r.position,
    team: r.team,
  }));
}
