import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";
import type { TradeAssetInput, TradeEvaluation } from "../../../shared/types";

interface EvaluateTradeInput {
  sideA: TradeAssetInput[];
  sideB: TradeAssetInput[];
  mode?: "sf" | "1qb";
}

export function useEvaluateTrade() {
  const weights = weightQueryParams();
  const suffix = weights ? `?${weights.slice(1)}` : "";
  return useMutation<TradeEvaluation, Error, EvaluateTradeInput>({
    mutationFn: (input) =>
      apiFetch(`/api/trade/evaluate${suffix}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
