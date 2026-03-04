import type { TradeAssetInput, TradeEvaluation } from "../../shared/types.js";

// ─── Main ───

export async function evaluateTrade(
  sideA: TradeAssetInput[],
  sideB: TradeAssetInput[],
  mode: "sf" | "1qb"
): Promise<TradeEvaluation> {
  // TODO: implement using getCompositeValues() and computeEdgeScores()
  return {
    sideA: { assets: [], total_edge: 0 },
    sideB: { assets: [], total_edge: 0 },
    delta: 0,
    fairness: "fair",
  };
}
