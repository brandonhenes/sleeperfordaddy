import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { TradeAssetInput, TradeEvaluation } from "../../../shared/types";

interface EvaluateTradeInput {
  sideA: TradeAssetInput[];
  sideB: TradeAssetInput[];
  mode?: "sf" | "1qb";
}

export function useEvaluateTrade() {
  return useMutation<TradeEvaluation, Error, EvaluateTradeInput>({
    mutationFn: (input) =>
      apiFetch("/api/trade/evaluate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
