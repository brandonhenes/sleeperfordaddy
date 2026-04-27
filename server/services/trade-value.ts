/**
 * Backward-compatible trade value wrapper.
 *
 * New trade-calculator logic lives in:
 * - market-value.ts
 * - league-market-adjustment.ts
 * - trade-context-value.ts
 *
 * Existing trade tools still call evaluateTradeValue(edgeScores), so this file
 * converts readable Edge Score into market value and delegates to the context
 * engine.
 */

import {
  edgeEquivalentFromMarketValue,
  marketValueFromEdge,
} from "./market-value.js";
import {
  calculateTradeContext,
  type TradeContextResult,
} from "./trade-context-value.js";

const TRADE_POWER_FLOOR = 45;
const LEGACY_PACKAGE_MULTIPLIERS = [1.0, 0.7, 0.45, 0.28, 0.18];

type TradeSide = "sideA" | "sideB" | "even";

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function legacyPackageMultiplier(index: number): number {
  return LEGACY_PACKAGE_MULTIPLIERS[
    Math.min(index, LEGACY_PACKAGE_MULTIPLIERS.length - 1)
  ];
}

export function tradePower(
  playerEdge: number,
  _bestInTrade: number = playerEdge,
  _bestOverall: number = 99
): number {
  if (playerEdge < TRADE_POWER_FLOOR) return 0;
  return marketValueFromEdge(playerEdge);
}

export function applyPackagePenalty(tradePowers: number[]): number {
  if (tradePowers.length === 0) return 0;
  if (tradePowers.length === 1) return roundTo(tradePowers[0], 1);

  const sorted = [...tradePowers].sort((a, b) => b - a);
  return roundTo(
    sorted.reduce(
      (total, value, index) => total + value * legacyPackageMultiplier(index),
      0
    ),
    1
  );
}

export function packagePenaltyPct(assetCount: number): number {
  if (assetCount <= 1) return 0;
  let retained = 0;
  for (let i = 0; i < assetCount; i++) {
    retained += legacyPackageMultiplier(i);
  }
  return Math.round((1 - retained / assetCount) * 100);
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
  winner: TradeSide;
  value_adjustment: number;
  value_adjustment_side: "sideA" | "sideB" | "none";
  percent_gap: number;
  best_asset_side: TradeSide;
  best_asset_edge: number;
  best_asset_market_value: number;
  consolidation_warning: string | null;
  needed_to_even: {
    side: "sideA" | "sideB" | "none";
    tradePowerGap: number;
    suggestedEdgeScore: number | null;
    marketValue: number | null;
    edgeEquivalent: number | null;
    label: string;
  };
}

export function evaluateTradeMarketValue(
  marketValuesA: number[],
  marketValuesB: number[]
): TradeContextResult {
  return calculateTradeContext(marketValuesA, marketValuesB);
}

export function evaluateTradeValue(
  edgesA: number[],
  edgesB: number[]
): TradeValueResult {
  const valuesA = edgesA.map((edge) => tradePower(edge));
  const valuesB = edgesB.map((edge) => tradePower(edge));
  const context = evaluateTradeMarketValue(valuesA, valuesB);

  return {
    sideA: {
      trade_powers: context.sideA.contextValues,
      total_tp: context.sideA.finalTotal,
      asset_count: edgesA.length,
      penalty_pct: context.sideA.packagePenaltyPct,
    },
    sideB: {
      trade_powers: context.sideB.contextValues,
      total_tp: context.sideB.finalTotal,
      asset_count: edgesB.length,
      penalty_pct: context.sideB.packagePenaltyPct,
    },
    delta_tp: context.delta,
    fairness: context.fairness,
    winner: context.winner,
    value_adjustment: context.valueAdjustment,
    value_adjustment_side: context.valueAdjustmentSide,
    percent_gap: context.percentGap,
    best_asset_side: context.bestAssetSide,
    best_asset_edge: edgeEquivalentFromMarketValue(context.bestAssetMarketValue),
    best_asset_market_value: context.bestAssetMarketValue,
    consolidation_warning: context.consolidationWarning,
    needed_to_even: {
      side: context.neededToEven.side,
      tradePowerGap: context.neededToEven.tradePowerGap,
      suggestedEdgeScore: context.neededToEven.suggestedEdgeScore,
      marketValue: context.neededToEven.marketValue,
      edgeEquivalent: context.neededToEven.edgeEquivalent,
      label: context.neededToEven.label,
    },
  };
}

export function quickFairness(
  totalA: number,
  totalB: number
): "fair" | "slight_edge" | "lopsided" {
  const maxTP = Math.max(totalA, totalB);
  const delta = Math.abs(totalA - totalB);
  const pctDiff = maxTP > 0 ? (delta / maxTP) * 100 : 0;
  if (pctDiff <= 8) return "fair";
  if (pctDiff <= 18) return "slight_edge";
  return "lopsided";
}
