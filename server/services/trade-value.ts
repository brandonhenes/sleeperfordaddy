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
  packageDiscountIndicatorPct,
  retainedPackageMarketValue,
  type TradeContextResult,
} from "./trade-context-value.js";

const TRADE_POWER_FLOOR = 45;

type TradeSide = "sideA" | "sideB" | "even";

/**
 * Deprecated compatibility helper for older callers that only pass Edge Score.
 * New trade valuation should pass base/league market values through
 * trade-context-value.ts instead of treating Edge Score as trade value.
 */
export function tradePower(
  playerEdge: number,
  _bestInTrade: number = playerEdge,
  _bestOverall: number = 99
): number {
  if (playerEdge < TRADE_POWER_FLOOR) return 0;
  return marketValueFromEdge(playerEdge);
}

/**
 * Deprecated compatibility helper. Kept for old imports, but package math is
 * delegated to trade-context-value.ts so this file does not own multipliers.
 */
export function applyPackagePenalty(tradePowers: number[]): number {
  return retainedPackageMarketValue(tradePowers);
}

/**
 * Deprecated compatibility helper. Kept for old imports, but package math is
 * delegated to trade-context-value.ts so this file does not own multipliers.
 */
export function packagePenaltyPct(assetCount: number): number {
  return packageDiscountIndicatorPct(assetCount);
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
  return calculateTradeContext([totalA], [totalB]).fairness;
}
