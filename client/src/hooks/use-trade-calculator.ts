import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { weightQueryParams } from "../lib/weights";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import type { TradeAssetInput, TradeEvaluation } from "../../../shared/types";

interface EvaluateTradeInput {
  sideA: TradeAssetInput[];
  sideB: TradeAssetInput[];
  mode?: "sf" | "1qb";
  leagueId?: string;
}

export function useEvaluateTrade() {
  const weights = weightQueryParams();
  const classStrengths = classStrengthQueryParams();
  const query = `${weights}${classStrengths}`;
  const suffix = query ? `?${query.slice(1)}` : "";
  return useMutation<TradeEvaluation, Error, EvaluateTradeInput>({
    mutationFn: (input) =>
      apiFetch(`/api/trade/evaluate${suffix}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
