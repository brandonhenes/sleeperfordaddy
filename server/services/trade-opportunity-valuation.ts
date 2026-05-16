import type {
  EvaluatedAsset,
  TradeAssetInput,
  TradeEvaluation,
  TradePackageAsset,
  TradeValuationWarning,
} from "../../shared/types.js";
import type { ValueType } from "./composite-values.js";
import type { SourceWeights } from "./edge-score.js";
import type { ClassStrengthMap } from "./pick-values.js";
import { evaluateTrade } from "./trade-calculator.js";

export interface OpportunityPackageValuationInput {
  send: TradePackageAsset[];
  receive: TradePackageAsset[];
  leagueId: string;
  mode: "sf" | "1qb";
  valueType?: ValueType;
  classStrengths?: ClassStrengthMap;
  weights?: SourceWeights;
}

export interface OpportunityPackageValuation {
  sendAssets: TradePackageAsset[];
  receiveAssets: TradePackageAsset[];
  sendEdge: number;
  receiveEdge: number;
  deltaEdge: number;
  sendBaseMarketValue: number;
  receiveBaseMarketValue: number;
  sendLeagueMarketValue: number;
  receiveLeagueMarketValue: number;
  sendContextTradeValue: number;
  receiveContextTradeValue: number;
  delta: number;
  fairness: "fair" | "slight_edge" | "lopsided";
  packagePenaltySend: number;
  packagePenaltyReceive: number;
  percentGap: number;
  warnings: TradeValuationWarning[];
  valuationExplanations: string[];
}

export interface OpportunityValuationMetadata {
  send_base_market_value: number;
  receive_base_market_value: number;
  send_league_market_value: number;
  receive_league_market_value: number;
  send_context_trade_value: number;
  receive_context_trade_value: number;
  valuation_edge: number;
  valuation_percent_gap: number;
  valuation_warnings: TradeValuationWarning[];
  valuation_explanations: string[];
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function tradePackageAssetToTradeInput(asset: TradePackageAsset): TradeAssetInput | null {
  if (asset.asset_type === "player") {
    return asset.player_id ? { type: "player", player_id: asset.player_id } : null;
  }

  const breakdown = asset.pick_breakdown;
  return {
    type: "pick",
    pick_season: asset.pick_season ?? breakdown?.season,
    pick_round: asset.pick_round ?? breakdown?.round,
    pick_tier: asset.pick_tier ?? breakdown?.tier,
    pick_slot: asset.pick_slot ?? null,
    pick_label: asset.label ?? breakdown?.pickLabel,
    pick_original_owner_id: asset.pick_original_owner_id ?? null,
  };
}

function mergeEvaluatedAsset(original: TradePackageAsset, evaluated: EvaluatedAsset | undefined): TradePackageAsset {
  if (!evaluated) {
    return {
      ...original,
      fallback_warnings: [
        ...(original.fallback_warnings ?? []),
        "Asset could not be evaluated by the shared valuation pipeline.",
      ],
    };
  }

  return {
    ...original,
    asset_id: evaluated.asset_id ?? original.asset_id,
    asset_key: evaluated.asset_key ?? original.asset_key,
    asset_name: evaluated.asset_name ?? original.asset_name,
    player_id: evaluated.player_id ?? original.player_id ?? null,
    position: evaluated.position ?? original.position,
    label: original.label || evaluated.label,
    edge_score: evaluated.edge_score,
    base_market_value: evaluated.base_market_value,
    league_market_value: evaluated.league_market_value,
    context_trade_value: evaluated.context_trade_value,
    market_value_source: evaluated.market_value_source,
    source_market_values: evaluated.source_market_values,
    trade_power: evaluated.context_trade_value ?? evaluated.trade_power,
    fc_score: evaluated.fc_score,
    ktc_score: evaluated.ktc_score,
    dp_score: evaluated.dp_score,
    league_adjusted_score: evaluated.league_adjusted_score,
    scoring_delta_ppg: evaluated.scoring_delta_ppg,
    scoring_multiplier: evaluated.scoring_multiplier,
    lineup_scarcity_multiplier: evaluated.lineup_scarcity_multiplier,
    ppg: evaluated.ppg,
    adjustment_reasons: evaluated.adjustment_reasons,
    fallback_warnings: evaluated.fallback_warnings,
    source_agreement: evaluated.source_agreement,
    pick_breakdown: evaluated.pick_breakdown ?? original.pick_breakdown ?? null,
  };
}

export function packageScoreFromTradeEvaluation(
  send: TradePackageAsset[],
  receive: TradePackageAsset[],
  evaluation: TradeEvaluation
): OpportunityPackageValuation {
  return {
    sendAssets: send.map((asset, index) => mergeEvaluatedAsset(asset, evaluation.sideB.assets[index])),
    receiveAssets: receive.map((asset, index) => mergeEvaluatedAsset(asset, evaluation.sideA.assets[index])),
    sendEdge: evaluation.sideB.total_edge,
    receiveEdge: evaluation.sideA.total_edge,
    deltaEdge: roundTo(evaluation.sideA.total_edge - evaluation.sideB.total_edge),
    sendBaseMarketValue: evaluation.sideB.total_base_market_value,
    receiveBaseMarketValue: evaluation.sideA.total_base_market_value,
    sendLeagueMarketValue: evaluation.sideB.total_league_market_value,
    receiveLeagueMarketValue: evaluation.sideA.total_league_market_value,
    sendContextTradeValue: evaluation.sideB.total_context_trade_value,
    receiveContextTradeValue: evaluation.sideA.total_context_trade_value,
    delta: evaluation.delta,
    fairness: evaluation.fairness,
    packagePenaltySend: evaluation.sideB.package_penalty_pct,
    packagePenaltyReceive: evaluation.sideA.package_penalty_pct,
    percentGap: evaluation.percent_gap,
    warnings: evaluation.warnings ?? [],
    valuationExplanations: evaluation.valuation_explanations ?? [],
  };
}

export function opportunityValuationFields(
  valuation: OpportunityPackageValuation
): OpportunityValuationMetadata {
  return {
    send_base_market_value: valuation.sendBaseMarketValue,
    receive_base_market_value: valuation.receiveBaseMarketValue,
    send_league_market_value: valuation.sendLeagueMarketValue,
    receive_league_market_value: valuation.receiveLeagueMarketValue,
    send_context_trade_value: valuation.sendContextTradeValue,
    receive_context_trade_value: valuation.receiveContextTradeValue,
    valuation_edge: valuation.delta,
    valuation_percent_gap: valuation.percentGap,
    valuation_warnings: valuation.warnings,
    valuation_explanations: valuation.valuationExplanations,
  };
}

export async function evaluateOpportunityPackage(
  input: OpportunityPackageValuationInput
): Promise<OpportunityPackageValuation> {
  const receiveInputs = input.receive.map(tradePackageAssetToTradeInput).filter((asset): asset is TradeAssetInput => !!asset);
  const sendInputs = input.send.map(tradePackageAssetToTradeInput).filter((asset): asset is TradeAssetInput => !!asset);
  const localWarnings: TradeValuationWarning[] = [];

  if (receiveInputs.length !== input.receive.length) {
    localWarnings.push({
      type: "missing_data",
      severity: "warning",
      side: "sideA",
      message: "One or more receive-side assets could not be resolved for valuation.",
    });
  }
  if (sendInputs.length !== input.send.length) {
    localWarnings.push({
      type: "missing_data",
      severity: "warning",
      side: "sideB",
      message: "One or more send-side assets could not be resolved for valuation.",
    });
  }

  const evaluation = await evaluateTrade(
    receiveInputs,
    sendInputs,
    input.mode,
    input.valueType ?? "dynasty",
    input.weights,
    input.leagueId,
    input.classStrengths
  );
  const scored = packageScoreFromTradeEvaluation(input.send, input.receive, evaluation);

  return {
    ...scored,
    warnings: [...localWarnings, ...scored.warnings],
  };
}
