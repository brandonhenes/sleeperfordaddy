import { db } from "../db/connection.js";
import { sql } from "drizzle-orm";
import type { EvaluatedAsset, TradeAssetInput, TradeEvaluation } from "../../shared/types.js";
import type { SourceWeights } from "./edge-score.js";
import { getCompositeValues, getGlobalScaleParams } from "./composite-values.js";
import { computeEdgeScores } from "./edge-score.js";
import { evaluateTradeValue } from "./trade-value.js";
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

type RawEval = {
  player_id: string | null;
  position: string | null;
  label: string;
  fc_value: number | null;
  ktc_value: number | null;
  dp_value: number | null;
};

async function evaluateAssets(
  assets: TradeAssetInput[],
  mode: "sf" | "1qb"
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

  const names = new Map<string, { full_name: string; position: string }>();
  for (const r of nameRows as unknown as { player_id: string; full_name: string; position: string }[]) {
    names.set(r.player_id, { full_name: r.full_name, position: r.position });
  }

  return assets.map((asset) => {
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
    const roundName = ROUND_NAMES[pick.round] ?? `R${pick.round}`;
    const tierLabel = pick.tier.charAt(0).toUpperCase() + pick.tier.slice(1);
    const label = `${pick.season} ${tierLabel} ${roundName}`;

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
      label,
      fc_value: null,
      ktc_value: ktcValue,
      dp_value: dpValue,
    };
  });
}

function toEvaluatedAsset(raw: RawEval, edge: { score: number; fc_score: number | null; ktc_score: number | null; dp_score: number | null }): EvaluatedAsset {
  return {
    player_id: raw.player_id,
    position: raw.position,
    label: raw.label,
    edge_score: edge.score,
    trade_power: 0,
    fc_score: edge.fc_score,
    ktc_score: edge.ktc_score,
    dp_score: edge.dp_score,
    league_adjusted_score: null,
    scoring_delta_ppg: null,
    source_agreement: agreementFromScores([edge.fc_score, edge.ktc_score, edge.dp_score]),
  };
}

export async function evaluateTrade(
  sideA: TradeAssetInput[],
  sideB: TradeAssetInput[],
  mode: "sf" | "1qb",
  weights?: SourceWeights,
  leagueId?: string
): Promise<TradeEvaluation> {
  const [rawA, rawB, globalScale] = await Promise.all([
    evaluateAssets(sideA, mode),
    evaluateAssets(sideB, mode),
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
