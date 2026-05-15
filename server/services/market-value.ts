import type { GlobalScaleParams } from "./composite-values.js";
import {
  normalizeSourceWeights,
  type SourceWeights,
} from "./edge-score.js";

export const MAX_MARKET_VALUE = 10_000;

export interface SourceMarketInput {
  edgeScore: number;
  fcValue: number | null;
  ktcValue: number | null;
  dpValue: number | null;
}

export type MarketValueSource = "raw_sources" | "edge_fallback";

export interface SourceMarketValues {
  fc: number | null;
  ktc: number | null;
  dp: number | null;
  edge_fallback: number;
}

export interface MarketValueResult {
  marketValue: number;
  marketValueSource: MarketValueSource;
  sourceMarketValues: SourceMarketValues;
  fallbackWarnings: string[];
  calculationReasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function marketValueFromEdge(edge: number): number {
  const normalized = clamp((edge - 39) / 60, 0, 1);
  return Math.round(MAX_MARKET_VALUE * Math.pow(normalized, 2.45));
}

function marketValueFromRawSource(
  value: number | null,
  scale: { floor: number; max: number } | undefined
): number | null {
  if (value == null || value <= 0 || !scale || scale.max <= 0) return null;

  // FantasyCalc/KTC/DP are already market-value-like sources. Normalize only
  // enough to make sources comparable inside our 0-10k calculator currency.
  return roundTo(clamp((value / scale.max) * MAX_MARKET_VALUE, 0, MAX_MARKET_VALUE));
}

export function calculateMarketValueFromSources(
  input: SourceMarketInput,
  scale: GlobalScaleParams,
  weights?: SourceWeights
): MarketValueResult {
  const effectiveWeights = normalizeSourceWeights(weights);
  const sourceValues: Array<{ value: number; weight: number }> = [];
  const edgeFallback = marketValueFromEdge(input.edgeScore);
  const fallbackWarnings: string[] = [];
  const calculationReasons: string[] = [];

  const fc = marketValueFromRawSource(input.fcValue, scale.fc);
  if (fc != null) sourceValues.push({ value: fc, weight: effectiveWeights.fc });
  else if (input.fcValue != null && input.fcValue > 0) {
    fallbackWarnings.push("FantasyCalc source was present but could not be normalized.");
  }

  const ktc = marketValueFromRawSource(input.ktcValue, scale.ktc);
  if (ktc != null) sourceValues.push({ value: ktc, weight: effectiveWeights.ktc });
  else if (input.ktcValue != null && input.ktcValue > 0) {
    fallbackWarnings.push("KeepTradeCut source was present but could not be normalized.");
  }

  const dpScaleUsable = scale.dp.max >= 100;
  const dp = dpScaleUsable
    ? marketValueFromRawSource(input.dpValue, scale.dp)
    : null;
  if (dp != null) sourceValues.push({ value: dp, weight: effectiveWeights.dp });
  else if (input.dpValue != null && input.dpValue > 0) {
    fallbackWarnings.push(
      dpScaleUsable
        ? "DynastyProcess source was present but could not be normalized."
        : "DynastyProcess source scale looked rank-like, so it was excluded from base market value."
    );
  }

  const sourceMarketValues: SourceMarketValues = {
    fc,
    ktc,
    dp,
    edge_fallback: edgeFallback,
  };

  if (sourceValues.length === 0) {
    fallbackWarnings.push("No usable raw market sources were available; Edge fallback was used.");
    return {
      marketValue: edgeFallback,
      marketValueSource: "edge_fallback",
      sourceMarketValues,
      fallbackWarnings,
      calculationReasons: ["Base market value used Edge fallback because no usable raw source values were available."],
    };
  }

  const totalWeight = sourceValues.reduce((sum, source) => sum + source.weight, 0);
  if (totalWeight <= 0) {
    calculationReasons.push("Base market value used an equal average because all configured source weights were zero.");
    return {
      marketValue: Math.round(
        sourceValues.reduce((sum, source) => sum + source.value, 0) /
          sourceValues.length
      ),
      marketValueSource: "raw_sources",
      sourceMarketValues,
      fallbackWarnings,
      calculationReasons,
    };
  }

  calculationReasons.push(
    `Base market value blended ${sourceValues.length} normalized market source${sourceValues.length === 1 ? "" : "s"}.`
  );
  return {
    marketValue: Math.round(
      sourceValues.reduce((sum, source) => sum + source.value * source.weight, 0) /
        totalWeight
    ),
    marketValueSource: "raw_sources",
    sourceMarketValues,
    fallbackWarnings,
    calculationReasons,
  };
}

export function marketValueFromSources(
  input: SourceMarketInput,
  scale: GlobalScaleParams,
  weights?: SourceWeights
): number {
  return calculateMarketValueFromSources(input, scale, weights).marketValue;
}

export function edgeEquivalentFromMarketValue(marketValue: number): number {
  if (marketValue <= 0) return 0;
  const normalized = Math.pow(clamp(marketValue / MAX_MARKET_VALUE, 0, 1), 1 / 2.45);
  return roundTo(39 + normalized * 60, 1);
}
