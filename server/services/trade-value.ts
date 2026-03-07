/**
 * Trade Value Engine
 *
 * Implements an exponential curve so elite assets carry disproportionate
 * trade power. Package deals get penalized so depth cannot fully replicate
 * a true difference-maker.
 */

const TRADE_POWER_FLOOR = 45;
const PACKAGE_MULTIPLIERS = [1.0, 0.85, 0.72, 0.60, 0.50];
const SCARCITY_WEIGHT = 0.15;
const SCARCITY_EXPONENT = 4;
const CONTEXT_WEIGHT = 0.10;
const CONTEXT_EXPONENT = 1.5;
const DEPTH_WEIGHT = 0.07;
const DEPTH_EXPONENT = 1.3;
const BASE_FLOOR = 0.10;

function normalize(edge: number): number {
  return Math.max(0, (edge - 39) / 60);
}

export function tradePower(
  playerEdge: number,
  bestInTrade: number,
  bestOverall: number = 99
): number {
  if (playerEdge < TRADE_POWER_FLOOR) return 0;

  const p = normalize(playerEdge);
  const t = normalize(Math.max(bestInTrade, playerEdge));
  const v = normalize(bestOverall);

  if (p <= 0 || v <= 0) return 0;

  const base = BASE_FLOOR;
  const scarcity = SCARCITY_WEIGHT * Math.pow(p / v, SCARCITY_EXPONENT);
  const context = CONTEXT_WEIGHT * Math.pow(p / Math.max(t, 0.01), CONTEXT_EXPONENT);
  const vAdj = v + 0.15;
  const depth = DEPTH_WEIGHT * Math.pow(p / vAdj, DEPTH_EXPONENT);
  const multiplier = base + scarcity + context + depth;

  return Math.round(playerEdge * multiplier * 10) / 10;
}

export function applyPackagePenalty(tradePowers: number[]): number {
  if (tradePowers.length === 0) return 0;
  if (tradePowers.length === 1) return Math.round(tradePowers[0] * 10) / 10;

  const sorted = [...tradePowers].sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const mult = PACKAGE_MULTIPLIERS[Math.min(i, PACKAGE_MULTIPLIERS.length - 1)];
    total += sorted[i] * mult;
  }
  return Math.round(total * 10) / 10;
}

export function packagePenaltyPct(assetCount: number): number {
  if (assetCount <= 1) return 0;
  const raw = PACKAGE_MULTIPLIERS.slice(0, Math.min(assetCount, PACKAGE_MULTIPLIERS.length));
  const avgRetained = raw.reduce((s, m) => s + m, 0) / raw.length;
  return Math.round((1 - avgRetained) * 100);
}

export interface TradeValueResult {
  sideA: {
    trade_powers: number[];
    total_tp: number;
    asset_count: number;
    penalty_pct: number;
  };
  sideB: {
    trade_powers: number[];
    total_tp: number;
    asset_count: number;
    penalty_pct: number;
  };
  delta_tp: number;
  fairness: "fair" | "slight_edge" | "lopsided";
}

export function evaluateTradeValue(
  edgesA: number[],
  edgesB: number[]
): TradeValueResult {
  const bestInTrade = Math.max(...edgesA, ...edgesB, TRADE_POWER_FLOOR);
  const tpA = edgesA.map((e) => tradePower(e, bestInTrade));
  const tpB = edgesB.map((e) => tradePower(e, bestInTrade));
  const totalA = applyPackagePenalty(tpA);
  const totalB = applyPackagePenalty(tpB);
  const delta = Math.round((totalA - totalB) * 10) / 10;

  const maxTP = Math.max(totalA, totalB);
  const pctDiff = maxTP > 0 ? (Math.abs(delta) / maxTP) * 100 : 0;

  let fairness: "fair" | "slight_edge" | "lopsided";
  if (pctDiff <= 10) fairness = "fair";
  else if (pctDiff <= 22) fairness = "slight_edge";
  else fairness = "lopsided";

  return {
    sideA: {
      trade_powers: tpA,
      total_tp: totalA,
      asset_count: edgesA.length,
      penalty_pct: packagePenaltyPct(edgesA.length),
    },
    sideB: {
      trade_powers: tpB,
      total_tp: totalB,
      asset_count: edgesB.length,
      penalty_pct: packagePenaltyPct(edgesB.length),
    },
    delta_tp: delta,
    fairness,
  };
}

export function quickFairness(
  totalA: number,
  totalB: number
): "fair" | "slight_edge" | "lopsided" {
  const maxTP = Math.max(totalA, totalB);
  const delta = Math.abs(totalA - totalB);
  const pctDiff = maxTP > 0 ? (delta / maxTP) * 100 : 0;
  if (pctDiff <= 10) return "fair";
  if (pctDiff <= 22) return "slight_edge";
  return "lopsided";
}
