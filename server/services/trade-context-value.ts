import {
  edgeEquivalentFromMarketValue,
  MAX_MARKET_VALUE,
  marketValueFromEdge,
} from "./market-value.js";

type TradeSide = "sideA" | "sideB" | "even";

const FAIR_PERCENT_GAP = 8;
const SLIGHT_EDGE_PERCENT_GAP = 18;
const ADJUSTMENT_SLOT_MULTIPLIERS = [1.0, 0.7, 0.45, 0.28, 0.18];

export interface TradeContextAsset {
  id: string;
  value: number;
}

export interface NeededToEven {
  side: "sideA" | "sideB" | "none";
  marketValue: number | null;
  edgeEquivalent: number | null;
  tradePowerGap: number;
  suggestedEdgeScore: number | null;
  label: string;
}

export interface TradeContextResult {
  sideA: {
    baseTotal: number;
    adjustment: number;
    finalTotal: number;
    contextValues: number[];
    packagePenaltyPct: number;
    adjustmentExplanation: string | null;
  };
  sideB: {
    baseTotal: number;
    adjustment: number;
    finalTotal: number;
    contextValues: number[];
    packagePenaltyPct: number;
    adjustmentExplanation: string | null;
  };
  delta: number;
  winner: TradeSide;
  fairness: "fair" | "slight_edge" | "lopsided";
  valueAdjustmentSide: "sideA" | "sideB" | "none";
  valueAdjustment: number;
  percentGap: number;
  bestAssetSide: TradeSide;
  bestAssetMarketValue: number;
  consolidationWarning: string | null;
  neededToEven: NeededToEven;
  explanations: string[];
}

type KtcAdjustmentSide = "sideA" | "sideB" | "none";

export interface KtcTradeContextOptions {
  adjustmentMode?: "ktc" | "league";
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function adjustmentSlotMultiplier(index: number): number {
  return ADJUSTMENT_SLOT_MULTIPLIERS[
    Math.min(index, ADJUSTMENT_SLOT_MULTIPLIERS.length - 1)
  ];
}

export function retainedPackageMarketValue(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  return roundTo(
    sorted.reduce(
      (total, value, index) => total + value * adjustmentSlotMultiplier(index),
      0
    ),
    1
  );
}

export function packageDiscountIndicatorPct(assetCount: number): number {
  if (assetCount <= 1) return 0;
  let retained = 0;
  for (let i = 0; i < assetCount; i++) {
    retained += adjustmentSlotMultiplier(i);
  }
  return Math.round((1 - retained / assetCount) * 100);
}

export function rawAdjustmentForAsset(
  value: number,
  bestInTrade: number,
  maxOverall = MAX_MARKET_VALUE
): number {
  if (value <= 0) return 0;
  const globalShare = Math.min(value / maxOverall, 1.25);
  const tradeShare = value / Math.max(bestInTrade, 1);
  const base = 0.06;
  const globalStudFactor = 0.20 * Math.pow(globalShare, 2.4);
  const tradeDominanceFactor = 0.22 * Math.pow(tradeShare, 2.8);
  return value * (base + globalStudFactor + tradeDominanceFactor);
}

function ktcProcessValue(
  value: number,
  bestInTrade: number,
  maxOverall: number,
  nerfIndex: number
): number {
  let adjustment = (
    0.05 * Math.pow(value / maxOverall, 1.3) +
    0.05 * Math.pow(value / (1.05 * bestInTrade), 6) +
    0.1
  ) * value;
  if (nerfIndex > 0) {
    adjustment *= Math.max(0.6, 1 - 0.15 * nerfIndex);
  }
  if (adjustment < 0) {
    adjustment /= 4;
  }
  return adjustment;
}

function reverseKtcAdjustment(
  targetAdjustment: number,
  bestInTrade: number,
  maxOverall: number,
  nerfIndex: number
): number {
  if (targetAdjustment <= 0) return 0;

  const bestAdjustment = ktcProcessValue(bestInTrade, bestInTrade, maxOverall, -1);
  let searchMax = bestInTrade;
  if (bestAdjustment < targetAdjustment) {
    searchMax = Math.max((targetAdjustment / bestAdjustment) * bestInTrade * 0.8, bestInTrade);
  }

  let candidate = searchMax / 2;
  let delta = 1;
  let iterations = 0;
  let bestDelta = 1;
  let bestCandidate = -1;
  let previousCandidate = -1;

  for (; delta > 0.025 && iterations <= 10; iterations++) {
    const currentAdjustment = ktcProcessValue(candidate, searchMax, maxOverall, nerfIndex);
    delta = Math.abs(currentAdjustment - targetAdjustment) / targetAdjustment;
    delta = Math.min(delta, 1);

    if (delta > 0.025) {
      previousCandidate = candidate;
      const step = delta * candidate * 0.75;
      candidate += currentAdjustment <= targetAdjustment ? step : -step;
    }

    if (delta < bestDelta) {
      bestDelta = delta;
      bestCandidate = previousCandidate;
      if (bestCandidate > bestInTrade) {
        searchMax = bestCandidate;
      }
    }

    if (iterations === 10 && delta > 0.05) {
      let fallbackIterations = 0;
      for (candidate = Math.max(1, bestCandidate); delta > 0.025 && fallbackIterations <= 10; fallbackIterations++) {
        const currentAdjustment = ktcProcessValue(candidate, searchMax, maxOverall, nerfIndex);
        delta = Math.abs(currentAdjustment - targetAdjustment) / targetAdjustment;
        delta = Math.min(delta, 1);

        if (delta > 0.025) {
          previousCandidate = candidate;
          const step = delta * candidate * 0.25;
          candidate += currentAdjustment <= targetAdjustment ? step : -step;
        }

        if (delta < bestDelta) {
          bestDelta = delta;
          bestCandidate = previousCandidate;
          if (bestCandidate > bestInTrade) {
            searchMax = bestCandidate;
          }
        }
      }
      candidate = bestCandidate;
    }
  }

  return Math.round(candidate);
}

function ktcCheckEquality(sideA: number, sideB: number, variance: number): boolean {
  const a = Math.max(0, sideA);
  const b = Math.max(0, sideB);
  const total = a + b;
  if (total <= 0) return true;
  const percentGap = Math.min(100, (Math.abs(a - b) / total) * 100);
  return !(Math.round(percentGap * 10) / 10 > variance);
}

function ktcAdjustmentContributions(
  values: number[],
  bestInTrade: number,
  maxOverall: number
): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => b.value - a.value);

  const contributions = values.map(() => 0);
  let nerfIndex = -1;
  for (const { value, index } of indexed) {
    if (value < 0.5 * bestInTrade) {
      nerfIndex++;
    }
    contributions[index] = ktcProcessValue(value, bestInTrade, maxOverall, nerfIndex);
  }
  return contributions;
}

function ktcLeaguePackageAdjustmentMultiplier(
  sideAValues: number[],
  sideBValues: number[],
  adjustmentSide: KtcAdjustmentSide
): number {
  if (adjustmentSide === "none") return 1;

  const favoredValues = adjustmentSide === "sideA" ? sideAValues : sideBValues;
  const opposingValues = adjustmentSide === "sideA" ? sideBValues : sideAValues;

  if (favoredValues.length !== 1 || opposingValues.length < 2) {
    return 1;
  }

  const anchor = Math.max(...favoredValues, 0);
  const bestOpposingPiece = Math.max(...opposingValues, 0);
  if (anchor <= 0 || bestOpposingPiece <= 0) {
    return 1;
  }

  const anchorRatio = anchor / bestOpposingPiece;
  let multiplier = 1;

  if (anchor >= 15_500) {
    multiplier = 0.9;
  } else if (anchor >= 13_500) {
    multiplier = 0.65;
  } else if (anchor >= 11_500) {
    multiplier = 0.45;
  } else {
    multiplier = 0.25;
  }

  if (anchorRatio < 1.15) {
    multiplier *= 0.35;
  } else if (anchorRatio < 1.3) {
    multiplier *= 0.45;
  } else if (anchorRatio > 1.7) {
    multiplier *= 1.1;
  }

  if (opposingValues.length >= 3) {
    multiplier *= 0.85;
  }

  return roundTo(clamp(multiplier, 0.15, 0.95), 3);
}

function assetAdjustmentContributions(
  values: number[],
  bestInTrade: number
): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => b.value - a.value);

  const contributions = values.map(() => 0);
  for (let rank = 0; rank < indexed.length; rank++) {
    const { value, index } = indexed[rank];
    contributions[index] =
      rawAdjustmentForAsset(value, bestInTrade) * adjustmentSlotMultiplier(rank);
  }
  return contributions;
}

export function sideRawAdjustment(
  values: number[],
  bestInTrade: number
): number {
  return sum(assetAdjustmentContributions(values, bestInTrade));
}

function fairnessFromPercentGap(
  percentGap: number
): "fair" | "slight_edge" | "lopsided" {
  if (percentGap <= FAIR_PERCENT_GAP) return "fair";
  if (percentGap <= SLIGHT_EDGE_PERCENT_GAP) return "slight_edge";
  return "lopsided";
}

function bestAssetSide(valuesA: number[], valuesB: number[]): {
  side: TradeSide;
  value: number;
  sideABest: number;
  sideBBest: number;
} {
  const sideABest = Math.max(...valuesA, 0);
  const sideBBest = Math.max(...valuesB, 0);
  const value = Math.max(sideABest, sideBBest);
  if (sideABest === sideBBest) {
    return { side: "even", value, sideABest, sideBBest };
  }
  return {
    side: sideABest > sideBBest ? "sideA" : "sideB",
    value,
    sideABest,
    sideBBest,
  };
}

function allocateVisibleAdjustment(
  values: number[],
  bestInTrade: number,
  visibleAdjustment: number
): number[] {
  if (visibleAdjustment <= 0 || values.length === 0) return values;

  const contributions = assetAdjustmentContributions(values, bestInTrade);
  const totalContribution = sum(contributions);
  if (totalContribution <= 0) {
    const evenShare = visibleAdjustment / values.length;
    return values.map((value) => roundTo(value + evenShare, 1));
  }

  return values.map((value, index) =>
    roundTo(value + visibleAdjustment * (contributions[index] / totalContribution), 1)
  );
}

function packagePenaltyPct(values: number[]): number {
  return packageDiscountIndicatorPct(values.length);
}

function consolidationWarning(
  valuesA: number[],
  valuesB: number[],
  best: ReturnType<typeof bestAssetSide>
): string | null {
  if (best.side === "even") return null;
  const packageValues = best.side === "sideA" ? valuesB : valuesA;
  if (packageValues.length < 3) return null;

  const hasNearPeer = packageValues.some((value) => best.value - value <= 1500);
  if (packageValues.length >= 4 && !hasNearPeer) {
    return "Steep package discount applied: four or more lesser assets without a near-peer rarely equal one elite dynasty asset.";
  }
  return "Package discount applied: multiple lesser assets rarely equal one elite dynasty asset.";
}

function packageConsolidationBoost(
  valuesA: number[],
  valuesB: number[],
  best: ReturnType<typeof bestAssetSide>
): { side: "sideA" | "sideB" | "none"; amount: number } {
  if (best.side === "even") return { side: "none", amount: 0 };

  const bestSideValues = best.side === "sideA" ? valuesA : valuesB;
  const packageValues = best.side === "sideA" ? valuesB : valuesA;
  if (bestSideValues.length !== 1 || packageValues.length < 3) {
    return { side: "none", amount: 0 };
  }

  const hasNearPeer = packageValues.some((value) => best.value - value <= 1500);
  if (hasNearPeer) return { side: "none", amount: 0 };

  const bestShare = Math.min(best.value / MAX_MARKET_VALUE, 1);
  const packageRate = packageValues.length >= 4 ? 0.28 : 0.22;
  return {
    side: best.side,
    amount: roundTo(best.value * packageRate * Math.pow(bestShare, 1.2), 1),
  };
}

function labelMarketValue(marketValue: number): string {
  if (marketValue >= 8500) return "Needs an elite cornerstone asset.";
  if (marketValue >= 7000) return "Needs a premium starter-level asset.";
  if (marketValue >= 5000) return "Needs a strong starter or early 1st type asset.";
  if (marketValue >= 3000) return "Needs a mid/late 1st or useful starter type asset.";
  if (marketValue >= 1500) return "Needs a 2nd-round pick or depth starter type sweetener.";
  return "Needs a small throw-in.";
}

function sideNeedsLabel(side: "sideA" | "sideB", marketValue: number): string {
  const sideLabel = side === "sideA" ? "Side A" : "Side B";
  const base = labelMarketValue(marketValue);
  return `${sideLabel} ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
}

function sideAdjustmentExplanation(
  sideLabel: "Side A" | "Side B",
  assetCount: number,
  adjustment: number,
  packagePenalty: number
): string | null {
  if (assetCount === 0) return null;
  const parts: string[] = [];
  if (adjustment > 0) {
    parts.push(`${sideLabel} received a ${roundTo(adjustment, 1)} context premium for holding the stronger trade-side asset profile.`);
  }
  if (packagePenalty > 0) {
    parts.push(`${sideLabel} package discount indicator is ${packagePenalty}% because multi-asset packages retain less consolidation value than a single comparable asset.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function calculateTradeContextCore(
  sideAValues: number[],
  sideBValues: number[],
  includeNeededToEven: boolean
): TradeContextResult {
  const baseA = roundTo(sum(sideAValues), 1);
  const baseB = roundTo(sum(sideBValues), 1);
  const best = bestAssetSide(sideAValues, sideBValues);
  const bestInTrade = Math.max(best.value, 1);

  const adjA = roundTo(sideRawAdjustment(sideAValues, bestInTrade), 1);
  const adjB = roundTo(sideRawAdjustment(sideBValues, bestInTrade), 1);
  const packageBoost = packageConsolidationBoost(sideAValues, sideBValues, best);
  const boostedAdjA = roundTo(adjA + (packageBoost.side === "sideA" ? packageBoost.amount : 0), 1);
  const boostedAdjB = roundTo(adjB + (packageBoost.side === "sideB" ? packageBoost.amount : 0), 1);
  const baseMax = Math.max(baseA, baseB);
  const isNearPeerOneForOne =
    sideAValues.length === 1 &&
    sideBValues.length === 1 &&
    baseMax > 0 &&
    (Math.abs(baseA - baseB) / baseMax) * 100 <= FAIR_PERCENT_GAP;
  const visibleAdjustment = isNearPeerOneForOne
    ? 0
    : roundTo(Math.abs(boostedAdjA - boostedAdjB), 1);
  const valueAdjustmentSide: "sideA" | "sideB" | "none" =
    visibleAdjustment <= 0 ? "none" : boostedAdjA > boostedAdjB ? "sideA" : "sideB";

  const finalA = roundTo(baseA + (valueAdjustmentSide === "sideA" ? visibleAdjustment : 0), 1);
  const finalB = roundTo(baseB + (valueAdjustmentSide === "sideB" ? visibleAdjustment : 0), 1);
  const delta = roundTo(finalA - finalB, 1);
  const maxTotal = Math.max(finalA, finalB);
  const percentGap = roundTo(maxTotal > 0 ? (Math.abs(delta) / maxTotal) * 100 : 0, 1);
  const fairness = fairnessFromPercentGap(percentGap);
  const winner: TradeSide = fairness === "fair" ? "even" : delta > 0 ? "sideA" : "sideB";

  const contextValuesA = allocateVisibleAdjustment(
    sideAValues,
    bestInTrade,
    valueAdjustmentSide === "sideA" ? visibleAdjustment : 0
  );
  const contextValuesB = allocateVisibleAdjustment(
    sideBValues,
    bestInTrade,
    valueAdjustmentSide === "sideB" ? visibleAdjustment : 0
  );

  const neededToEven = includeNeededToEven
    ? findNeededToEven(sideAValues, sideBValues, winner, Math.abs(delta), percentGap)
    : {
        side: "none" as const,
        marketValue: null,
        edgeEquivalent: null,
        tradePowerGap: roundTo(Math.abs(delta), 1),
        suggestedEdgeScore: null,
        label: "No meaningful sweetener needed.",
      };
  const sideAPackagePenaltyPct = packagePenaltyPct(sideAValues);
  const sideBPackagePenaltyPct = packagePenaltyPct(sideBValues);
  const contextExplanations = [
    best.side !== "even"
      ? `Best asset is on ${best.side === "sideA" ? "Side A" : "Side B"} at ${Math.round(best.value)} league market value.`
      : "Best asset strength is even across both trade sides.",
    valueAdjustmentSide !== "none"
      ? `Context adjustment favors ${valueAdjustmentSide === "sideA" ? "Side A" : "Side B"} by ${visibleAdjustment.toFixed(1)}.`
      : "No visible context adjustment was needed after comparing asset concentration.",
  ];
  const warning = consolidationWarning(sideAValues, sideBValues, best);
  if (warning) contextExplanations.push(warning);

  return {
    sideA: {
      baseTotal: baseA,
      adjustment: valueAdjustmentSide === "sideA" ? visibleAdjustment : 0,
      finalTotal: finalA,
      contextValues: contextValuesA,
      packagePenaltyPct: sideAPackagePenaltyPct,
      adjustmentExplanation: sideAdjustmentExplanation(
        "Side A",
        sideAValues.length,
        valueAdjustmentSide === "sideA" ? visibleAdjustment : 0,
        sideAPackagePenaltyPct
      ),
    },
    sideB: {
      baseTotal: baseB,
      adjustment: valueAdjustmentSide === "sideB" ? visibleAdjustment : 0,
      finalTotal: finalB,
      contextValues: contextValuesB,
      packagePenaltyPct: sideBPackagePenaltyPct,
      adjustmentExplanation: sideAdjustmentExplanation(
        "Side B",
        sideBValues.length,
        valueAdjustmentSide === "sideB" ? visibleAdjustment : 0,
        sideBPackagePenaltyPct
      ),
    },
    delta,
    winner,
    fairness,
    valueAdjustmentSide,
    valueAdjustment: visibleAdjustment,
    percentGap,
    bestAssetSide: best.side,
    bestAssetMarketValue: Math.round(best.value),
    consolidationWarning: warning,
    neededToEven,
    explanations: contextExplanations,
  };
}

function findNeededToEven(
  originalSideA: number[],
  originalSideB: number[],
  winner: TradeSide,
  currentGap: number,
  percentGap: number
): NeededToEven {
  if (winner === "even" || percentGap <= FAIR_PERCENT_GAP) {
    return {
      side: "none",
      marketValue: null,
      edgeEquivalent: null,
      tradePowerGap: roundTo(currentGap, 1),
      suggestedEdgeScore: null,
      label: "No meaningful sweetener needed.",
    };
  }

  const losingSide = winner === "sideA" ? "sideB" : "sideA";
  for (let candidate = 250; candidate <= MAX_MARKET_VALUE; candidate += 250) {
    const sideA =
      losingSide === "sideA" ? [...originalSideA, candidate] : originalSideA;
    const sideB =
      losingSide === "sideB" ? [...originalSideB, candidate] : originalSideB;
    const result = calculateTradeContextCore(sideA, sideB, false);
    if (result.fairness === "fair") {
      const edgeEquivalent = edgeEquivalentFromMarketValue(candidate);
      return {
        side: losingSide,
        marketValue: candidate,
        edgeEquivalent,
        tradePowerGap: roundTo(currentGap, 1),
        suggestedEdgeScore: edgeEquivalent,
        label: sideNeedsLabel(losingSide, candidate),
      };
    }
  }

  return {
    side: losingSide,
    marketValue: MAX_MARKET_VALUE,
    edgeEquivalent: 99,
    tradePowerGap: roundTo(currentGap, 1),
    suggestedEdgeScore: 99,
    label: sideNeedsLabel(losingSide, MAX_MARKET_VALUE),
  };
}

export function calculateTradeContext(
  sideAValues: number[],
  sideBValues: number[]
): TradeContextResult {
  return calculateTradeContextCore(sideAValues, sideBValues, true);
}

export function calculateKtcTradeContext(
  sideAValues: number[],
  sideBValues: number[],
  options: KtcTradeContextOptions = {}
): TradeContextResult {
  const baseA = roundTo(sum(sideAValues), 1);
  const baseB = roundTo(sum(sideBValues), 1);
  const best = bestAssetSide(sideAValues, sideBValues);
  const bestInTrade = Math.max(best.value, 1);
  const maxOverall = MAX_MARKET_VALUE + 80;
  const defaultVariance = 5;

  const contributionsA = ktcAdjustmentContributions(sideAValues, bestInTrade, maxOverall);
  const contributionsB = ktcAdjustmentContributions(sideBValues, bestInTrade, maxOverall);
  const rawAdjA = sum(contributionsA);
  const rawAdjB = sum(contributionsB);
  const rawAdjDiff = Math.floor(Math.abs(rawAdjA - rawAdjB));
  const halfBestAdjustment = ktcProcessValue(0.5 * bestInTrade, bestInTrade, maxOverall, -1);

  let nerfCount = 0;
  let startedNerf = false;
  const weakerContributions = rawAdjA > rawAdjB
    ? [...contributionsB].sort((a, b) => b - a)
    : [...contributionsA].sort((a, b) => b - a);
  if (rawAdjDiff < halfBestAdjustment) {
    for (let i = 0; i < weakerContributions.length; i++) {
      if (weakerContributions[i] < rawAdjDiff && !startedNerf) {
        nerfCount = i + 1;
        startedNerf = true;
      }
    }
  }

  const rawAdjRateA = baseA > 0 ? rawAdjA / baseA : 0;
  const rawAdjRateB = baseB > 0 ? rawAdjB / baseB : 0;
  const valuesAreClose = ktcCheckEquality(baseA, baseB, defaultVariance);
  const adjustmentsAreClose = ktcCheckEquality(rawAdjA, rawAdjB, defaultVariance);

  const adjustmentState: {
    side: KtcAdjustmentSide;
    value: number;
    display: boolean;
  } = {
    side: "none",
    value: 0,
    display: true,
  };

  const applyAdjustment = (
    side: KtcAdjustmentSide,
    amount: number,
    display = true
  ) => {
    adjustmentState.side = side;
    adjustmentState.value = amount;
    adjustmentState.display = display;
  };

  const reverseDefault = () => reverseKtcAdjustment(rawAdjDiff, bestInTrade, maxOverall, nerfCount);
  const reverseRawDifference = () => reverseKtcAdjustment(
    Math.abs(rawAdjA - rawAdjB),
    bestInTrade,
    MAX_MARKET_VALUE + 99,
    nerfCount
  );

  if (valuesAreClose && adjustmentsAreClose) {
    if (rawAdjA > rawAdjB) {
      const equivalent = reverseDefault();
      const amount = baseB + equivalent - baseA;
      if (amount > 0) {
        applyAdjustment("sideA", amount);
      } else {
        applyAdjustment("sideB", -amount, false);
      }
    } else if (rawAdjB > rawAdjA) {
      const equivalent = reverseDefault();
      const amount = baseA + equivalent - baseB;
      if (amount > 0) {
        applyAdjustment("sideB", amount);
      } else {
        applyAdjustment("sideA", -amount, false);
      }
    }
  } else if (rawAdjRateA > rawAdjRateB) {
    if (rawAdjA > rawAdjB) {
      const equivalent = reverseDefault();
      const amount = baseB + equivalent - baseA;
      if (amount > 0) {
        applyAdjustment("sideA", amount);
      } else {
        applyAdjustment("sideB", Math.abs(amount), false);
      }
    } else {
      const losingSide = baseA < baseB ? "sideA" : baseB < baseA ? "sideB" : "none";
      const equivalent = reverseRawDifference();
      if (equivalent > 0 && losingSide !== "none") {
        if (losingSide === "sideB") {
          const amount = equivalent - (baseA - baseB);
          if (amount > 0) {
            applyAdjustment("sideB", amount);
          } else {
            applyAdjustment("sideB", amount, false);
          }
        } else {
          const amount = equivalent - (baseB - baseA);
          if (amount > 0) {
            if (amount > MAX_MARKET_VALUE) {
              applyAdjustment("sideA", 0, false);
            } else {
              applyAdjustment("sideB", amount);
            }
          } else {
            applyAdjustment("sideA", -amount);
          }
        }
      } else {
        adjustmentState.display = false;
      }
    }
  } else {
    if (rawAdjB > rawAdjA) {
      const equivalent = reverseDefault();
      const amount = baseA + equivalent - baseB;
      if (amount > 0) {
        applyAdjustment("sideB", amount);
      } else {
        applyAdjustment("sideA", Math.abs(amount), false);
      }
    } else {
      const losingSide = baseA < baseB ? "sideA" : baseB < baseA ? "sideB" : "none";
      const equivalent = reverseRawDifference();
      if (equivalent > 0 && losingSide !== "none") {
        if (losingSide === "sideA") {
          const amount = equivalent - (baseB - baseA);
          if (amount > 0) {
            applyAdjustment("sideA", amount);
          } else {
            applyAdjustment("sideA", amount, false);
          }
        } else {
          const amount = equivalent - (baseA - baseB);
          if (amount > 0) {
            if (amount > MAX_MARKET_VALUE) {
              applyAdjustment("sideB", 0, false);
            } else {
              applyAdjustment("sideA", amount);
            }
          } else {
            applyAdjustment("sideB", -amount);
          }
        }
      } else {
        adjustmentState.display = false;
      }
    }
  }

  if (adjustmentState.value !== 0 && Math.abs(adjustmentState.value / Math.max(baseA + baseB, 1)) < 0.033) {
    adjustmentState.display = false;
  }
  if (adjustmentState.value === 0) {
    adjustmentState.display = false;
  }

  const adjustmentSide = adjustmentState.side;
  const packageAdjustmentMultiplier = options.adjustmentMode === "league"
    ? ktcLeaguePackageAdjustmentMultiplier(sideAValues, sideBValues, adjustmentSide)
    : 1;
  const visibleAdjustment = roundTo(adjustmentState.value * packageAdjustmentMultiplier, 1);
  const finalA = roundTo(baseA + (adjustmentSide === "sideA" ? visibleAdjustment : 0), 1);
  const finalB = roundTo(baseB + (adjustmentSide === "sideB" ? visibleAdjustment : 0), 1);
  const delta = roundTo(finalA - finalB, 1);
  const maxTotal = Math.max(finalA, finalB);
  const percentGap = roundTo(maxTotal > 0 ? (Math.abs(delta) / maxTotal) * 100 : 0, 1);
  const fairness = fairnessFromPercentGap(percentGap);
  const winner: TradeSide = fairness === "fair" ? "even" : delta > 0 ? "sideA" : "sideB";

  const contextValuesA = allocateVisibleAdjustment(
    sideAValues,
    bestInTrade,
    adjustmentSide === "sideA" ? visibleAdjustment : 0
  );
  const contextValuesB = allocateVisibleAdjustment(
    sideBValues,
    bestInTrade,
    adjustmentSide === "sideB" ? visibleAdjustment : 0
  );

  const sideAPackagePenaltyPct = packagePenaltyPct(sideAValues);
  const sideBPackagePenaltyPct = packagePenaltyPct(sideBValues);
  const warning = consolidationWarning(sideAValues, sideBValues, best);
  const neededToEven = findNeededToEven(sideAValues, sideBValues, winner, Math.abs(delta), percentGap);
  const explanations = [
    best.side !== "even"
      ? `Best asset is on ${best.side === "sideA" ? "Side A" : "Side B"} at ${Math.round(best.value)} KTC value.`
      : "Best asset strength is even across both trade sides.",
    adjustmentSide !== "none" && visibleAdjustment !== 0
      ? `KTC-style package adjustment favors ${adjustmentSide === "sideA" ? "Side A" : "Side B"} by ${visibleAdjustment.toFixed(1)}${adjustmentState.display ? "." : " (below KTC's visible adjustment threshold)."}${packageAdjustmentMultiplier !== 1 ? ` KTC League moderated the raw package premium by x${packageAdjustmentMultiplier.toFixed(2)} because the anchor/package gap was not large enough for full consolidation value.` : ""}`
      : "No KTC-style package adjustment was needed after comparing asset concentration.",
  ];
  if (warning) explanations.push(warning);

  return {
    sideA: {
      baseTotal: baseA,
      adjustment: adjustmentSide === "sideA" ? visibleAdjustment : 0,
      finalTotal: finalA,
      contextValues: contextValuesA,
      packagePenaltyPct: sideAPackagePenaltyPct,
      adjustmentExplanation: sideAdjustmentExplanation(
        "Side A",
        sideAValues.length,
        adjustmentSide === "sideA" ? visibleAdjustment : 0,
        sideAPackagePenaltyPct
      ),
    },
    sideB: {
      baseTotal: baseB,
      adjustment: adjustmentSide === "sideB" ? visibleAdjustment : 0,
      finalTotal: finalB,
      contextValues: contextValuesB,
      packagePenaltyPct: sideBPackagePenaltyPct,
      adjustmentExplanation: sideAdjustmentExplanation(
        "Side B",
        sideBValues.length,
        adjustmentSide === "sideB" ? visibleAdjustment : 0,
        sideBPackagePenaltyPct
      ),
    },
    delta,
    winner,
    fairness,
    valueAdjustmentSide: visibleAdjustment === 0 ? "none" : adjustmentSide,
    valueAdjustment: visibleAdjustment,
    percentGap,
    bestAssetSide: best.side,
    bestAssetMarketValue: Math.round(best.value),
    consolidationWarning: warning,
    neededToEven,
    explanations,
  };
}

export function marketValueForLegacyEdge(edge: number): number {
  return marketValueFromEdge(edge);
}
