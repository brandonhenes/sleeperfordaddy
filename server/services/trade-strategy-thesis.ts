import type {
  EvaluatedAsset,
  TradeHealthWarning,
  TradePackageAsset,
  TradeStrategyFit,
  TradeStrategyType,
} from "../../shared/types.js";

type StrategyAsset = TradePackageAsset | EvaluatedAsset;

export interface TradeStrategyMetadata {
  strategy_type: TradeStrategyType;
  strategy_label: string;
  strategy_fit: TradeStrategyFit;
  strategy_score: number;
  trade_thesis: string;
  strategy_warnings: string[];
}

export interface TradeStrategyInput {
  sendAssets: StrategyAsset[];
  receiveAssets: StrategyAsset[];
  userArchetype?: string | null;
  opponentArchetype?: string | null;
  valueEdgeForUser?: number | null;
  percentGap?: number | null;
  fairness?: "fair" | "slight_edge" | "lopsided" | null;
  addressesMyNeed?: boolean | null;
  addressesTheirNeed?: boolean | null;
  acceptanceProbability?: number | null;
  managerSignals?: string[] | null;
  healthWarnings?: TradeHealthWarning[] | null;
  mode?: "sf" | "1qb" | null;
  pickOnlyMaterial?: boolean | null;
}

const STRATEGY_LABELS: Record<TradeStrategyType, string> = {
  consolidation: "Consolidation",
  tier_down: "Tier Down",
  buy_low: "Buy Low",
  sell_high: "Sell High",
  win_now_buy: "Win-Now Buy",
  rebuild_sell: "Rebuild Sell",
  productive_struggle: "Productive Struggle",
  pick_arbitrage: "Pick Arbitrage",
  position_arbitrage: "Position Arbitrage",
  roster_fit_trade: "Roster-Fit Trade",
  roster_spot_arbitrage: "Roster-Spot Arbitrage",
  manager_exploit: "Manager Exploit",
  liquidity_upgrade: "Liquidity Upgrade",
  market_value: "Market Value",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function assetType(asset: StrategyAsset): "player" | "pick" {
  if (asset.asset_type === "player" || asset.asset_type === "pick") return asset.asset_type;
  return asset.position == null ? "pick" : "player";
}

function assetValue(asset: StrategyAsset): number {
  return (
    asset.context_trade_value ??
    asset.league_market_value ??
    asset.base_market_value ??
    asset.trade_power ??
    asset.edge_score * 100
  );
}

function assetRound(asset: StrategyAsset): number | null {
  if (assetType(asset) !== "pick") return null;
  return asset.pick_breakdown?.round ?? ("pick_round" in asset ? asset.pick_round ?? null : null);
}

function pickSlot(asset: StrategyAsset): number | null {
  if (assetType(asset) !== "pick") return null;
  return asset.pick_breakdown?.pickSlot ?? ("pick_slot" in asset ? asset.pick_slot ?? null : null);
}

function bestAsset(assets: StrategyAsset[]): StrategyAsset | null {
  return [...assets].sort((a, b) => assetValue(b) - assetValue(a))[0] ?? null;
}

function totalValue(assets: StrategyAsset[]): number {
  return assets.reduce((sum, asset) => sum + assetValue(asset), 0);
}

function countType(assets: StrategyAsset[], type: "player" | "pick"): number {
  return assets.filter((asset) => assetType(asset) === type).length;
}

function projectedPpg(asset: StrategyAsset): number {
  const ppg = asset.ppg;
  return ppg != null && Number.isFinite(ppg) ? Math.max(0, ppg) : 0;
}

function projectedPpgTotal(assets: StrategyAsset[]): number {
  return assets.reduce((sum, asset) => sum + projectedPpg(asset), 0);
}

function isCurrentProducer(asset: StrategyAsset): boolean {
  if (assetType(asset) !== "player") return false;
  if (!["RB", "WR", "TE"].includes(asset.position ?? "")) return false;
  return projectedPpg(asset) >= 7 || asset.edge_score >= 72;
}

function isWinNowPointsBuy(input: TradeStrategyInput): boolean {
  const window = rosterWindow(input.userArchetype);
  if (window !== "contend") return false;
  if (input.sendAssets.length !== 1 || input.receiveAssets.length < 2) return false;
  if (countType(input.receiveAssets, "player") < 2) return false;
  if (input.fairness === "lopsided") return false;
  const producerCount = input.receiveAssets.filter(isCurrentProducer).length;
  const ppgGain = projectedPpgTotal(input.receiveAssets) - projectedPpgTotal(input.sendAssets);
  return producerCount >= 2 && (ppgGain >= 6 || (projectedPpgTotal(input.receiveAssets) >= 24 && ppgGain >= 4));
}

function isPremiumPick(asset: StrategyAsset): boolean {
  if (assetType(asset) !== "pick") return false;
  const round = assetRound(asset);
  const slot = pickSlot(asset);
  return round === 1 || (round === 2 && (slot == null || slot <= 18));
}

function isEliteAsset(asset: StrategyAsset): boolean {
  if (assetType(asset) === "pick") return isPremiumPick(asset) && assetValue(asset) >= 4_000;
  return asset.edge_score >= 85 || assetValue(asset) >= 8_000;
}

function isAnchorAsset(asset: StrategyAsset): boolean {
  if (assetType(asset) === "pick") return isPremiumPick(asset);
  return asset.edge_score >= 68 || assetValue(asset) >= 3_000;
}

function hasAnchorAsset(assets: StrategyAsset[]): boolean {
  return assets.some(isAnchorAsset);
}

function sideLiquidity(assets: StrategyAsset[], mode?: "sf" | "1qb" | null): number {
  if (assets.length === 0) return 0;
  const scores = assets.map((asset) => {
    if (assetType(asset) === "pick") {
      if (isPremiumPick(asset)) return 90;
      const round = assetRound(asset);
      if (round === 2) return 72;
      return 45;
    }
    if (asset.position === "QB" && mode === "sf" && asset.edge_score >= 75) return 92;
    if (asset.position === "WR" && asset.edge_score >= 75) return 88;
    if (asset.position === "TE" && asset.edge_score >= 82) return 86;
    if (asset.position === "RB" && asset.edge_score >= 82) return 68;
    if (asset.edge_score >= 75) return 74;
    if (asset.edge_score >= 60) return 52;
    return 34;
  });
  return Math.max(...scores);
}

function rosterWindow(archetype?: string | null): "contend" | "rebuild" | "dead_zone" | "neutral" {
  if (!archetype) return "neutral";
  if (archetype === "Rebuilder" || archetype === "Productive Struggle") return "rebuild";
  if (archetype === "Dead Zone") return "dead_zone";
  if (
    archetype.includes("Contender") ||
    archetype.includes("Juggernaut") ||
    archetype === "Competitor"
  ) {
    return "contend";
  }
  return "neutral";
}

function isPositionArbitrage(input: TradeStrategyInput): boolean {
  return input.receiveAssets.some((asset) => {
    if (assetType(asset) !== "player") return false;
    if (input.mode === "sf" && asset.position === "QB" && asset.edge_score >= 70) return true;
    if (asset.position === "TE") {
      const scarce =
        (asset.lineup_scarcity_multiplier ?? 1) > 1.05 ||
        (asset.league_rating?.league_value_delta_pct ?? 0) > 8;
      return asset.edge_score >= 75 && scarce;
    }
    return false;
  });
}

function classifyStrategy(input: TradeStrategyInput): TradeStrategyType {
  const sendPlayers = countType(input.sendAssets, "player");
  const receivePlayers = countType(input.receiveAssets, "player");
  const sendPicks = countType(input.sendAssets, "pick");
  const receivePicks = countType(input.receiveAssets, "pick");
  const pickOnly = sendPlayers === 0 && receivePlayers === 0;
  const window = rosterWindow(input.userArchetype);
  const managerSignals = input.managerSignals ?? [];

  if (pickOnly) return "pick_arbitrage";
  if (input.sendAssets.length >= 2 && input.receiveAssets.length === 1) {
    return input.sendAssets.length >= 3 ? "roster_spot_arbitrage" : "consolidation";
  }
  if (input.sendAssets.length === 1 && input.receiveAssets.length >= 2) {
    if (isWinNowPointsBuy(input)) return "win_now_buy";
    if (window === "rebuild") {
      return input.userArchetype === "Productive Struggle" ? "productive_struggle" : "rebuild_sell";
    }
    return "tier_down";
  }
  if (isPositionArbitrage(input)) return "position_arbitrage";
  if (sendPicks > 0 && receivePlayers > 0 && window === "contend") return "win_now_buy";
  if (sendPlayers > 0 && receivePicks > 0 && window === "rebuild") return "rebuild_sell";
  if (sendPlayers > 0 && receivePicks > 0) return "liquidity_upgrade";
  if (managerSignals.length > 0 && input.addressesTheirNeed && (input.acceptanceProbability ?? 0) >= 45) {
    return "manager_exploit";
  }
  if (input.addressesMyNeed && input.addressesTheirNeed) return "roster_fit_trade";
  if (sideLiquidity(input.receiveAssets, input.mode) > sideLiquidity(input.sendAssets, input.mode) + 12) {
    return "liquidity_upgrade";
  }
  return "market_value";
}

function fitLabel(score: number): TradeStrategyFit {
  if (score >= 74) return "strong";
  if (score >= 56) return "reasonable";
  if (score >= 38) return "thin";
  return "bad";
}

function scoreStrategy(input: TradeStrategyInput, strategy: TradeStrategyType): number {
  const sendBest = bestAsset(input.sendAssets);
  const receiveBest = bestAsset(input.receiveAssets);
  const valueEdge = input.valueEdgeForUser ?? totalValue(input.receiveAssets) - totalValue(input.sendAssets);
  const window = rosterWindow(input.userArchetype);
  const receiveHasAnchor = hasAnchorAsset(input.receiveAssets);
  const receiveHasElite = input.receiveAssets.some(isEliteAsset);
  const sendHasElite = input.sendAssets.some(isEliteAsset);
  const liquidityDelta = sideLiquidity(input.receiveAssets, input.mode) - sideLiquidity(input.sendAssets, input.mode);
  const pickOnly = countType(input.sendAssets, "player") === 0 && countType(input.receiveAssets, "player") === 0;
  const projectedPointsGain = projectedPpgTotal(input.receiveAssets) - projectedPpgTotal(input.sendAssets);
  const receiveCurrentProducers = input.receiveAssets.filter(isCurrentProducer).length;
  let score = 45;

  switch (strategy) {
    case "consolidation":
    case "roster_spot_arbitrage":
      score += window === "contend" ? 18 : window === "dead_zone" ? 10 : window === "rebuild" ? -8 : 6;
      score += input.receiveAssets.length === 1 && countType(input.receiveAssets, "player") === 1 ? 10 : 0;
      score += receiveBest && sendBest && receiveBest.edge_score >= sendBest.edge_score + 5 ? 14 : 0;
      score += input.sendAssets.length >= 2 && input.sendAssets.length <= 4 ? 8 : -10;
      score += receiveHasAnchor ? 12 : -22;
      break;
    case "tier_down":
    case "rebuild_sell":
    case "productive_struggle":
      score += window === "rebuild" ? 20 : window === "dead_zone" ? 12 : window === "contend" ? -12 : 2;
      score += receiveHasAnchor ? 18 : -30;
      score += countType(input.receiveAssets, "pick") > 0 ? 8 : 0;
      score += input.receiveAssets.length >= 2 && input.receiveAssets.length <= 4 ? 8 : -8;
      score += sendHasElite && !receiveHasAnchor ? -20 : 0;
      break;
    case "win_now_buy":
      score += window === "contend" ? 22 : window === "rebuild" ? -18 : 4;
      score += receiveHasAnchor ? 10 : -14;
      score += countType(input.sendAssets, "pick") > 0 ? 8 : 0;
      score += receiveCurrentProducers >= 2 ? 14 : 0;
      score += projectedPointsGain >= 8 ? 12 : projectedPointsGain >= 4 ? 6 : 0;
      break;
    case "pick_arbitrage":
      score += input.pickOnlyMaterial ? 18 : -18;
      score += window === "rebuild" || window === "dead_zone" ? 8 : 0;
      score += input.receiveAssets.some(isPremiumPick) ? 10 : -8;
      break;
    case "position_arbitrage":
      score += 18;
      score += receiveHasAnchor ? 8 : 0;
      score += input.mode === "sf" && input.receiveAssets.some((asset) => asset.position === "QB") ? 8 : 0;
      break;
    case "manager_exploit":
      score += input.addressesTheirNeed ? 16 : 0;
      score += (input.acceptanceProbability ?? 0) >= 55 ? 10 : 0;
      score += receiveHasAnchor ? 6 : -8;
      break;
    case "liquidity_upgrade":
      score += liquidityDelta > 12 ? 18 : -8;
      score += countType(input.receiveAssets, "pick") > 0 ? 8 : 0;
      score += receiveHasAnchor ? 6 : 0;
      break;
    case "roster_fit_trade":
      score += input.addressesMyNeed && input.addressesTheirNeed ? 18 : 0;
      score += receiveHasAnchor ? 8 : 0;
      break;
    case "buy_low":
      score += receiveHasAnchor ? 8 : 0;
      score += valueEdge >= -800 ? 10 : -8;
      break;
    case "sell_high":
      score += window === "rebuild" || window === "dead_zone" ? 12 : 0;
      score += countType(input.receiveAssets, "pick") > 0 ? 10 : 0;
      score += receiveHasAnchor ? 10 : -18;
      break;
    case "market_value":
      score -= 8;
      break;
  }

  if (input.addressesTheirNeed) score += 6;
  if (input.addressesMyNeed) score += 4;
  if ((input.acceptanceProbability ?? 0) >= 60) score += 6;
  if (valueEdge >= 1_500) score += 12;
  else if (valueEdge >= 500) score += 6;
  else if (valueEdge <= -2_500) score -= 28;
  else if (valueEdge <= -1_000) score -= (strategy === "consolidation" && window === "contend") || (strategy === "win_now_buy" && projectedPointsGain >= 6) ? 8 : 16;
  else if (valueEdge <= -500) score -= 6;
  if (input.fairness === "lopsided" && valueEdge < 0) score -= 16;
  if (pickOnly && !input.pickOnlyMaterial) score -= 16;
  if (receiveHasElite && input.sendAssets.length > 1 && !input.sendAssets.some(isAnchorAsset)) score -= 28;

  return clamp(Math.round(score), 0, 100);
}

function valuePhrase(valueEdge: number): string {
  const abs = Math.round(Math.abs(valueEdge));
  if (abs < 350) return "The valuation is close enough that shape and acceptance matter most.";
  if (valueEdge > 0) return `KTC League gives you about ${abs} TP of value edge.`;
  return `You pay about ${abs} TP for the shape.`;
}

function sideLabel(assets: StrategyAsset[]): string {
  if (assets.length === 0) return "nothing";
  if (assets.length === 1) return assets[0].label;
  const best = bestAsset(assets);
  if (!best) return `${assets.length} assets`;
  return `${best.label} plus ${assets.length - 1} piece${assets.length === 2 ? "" : "s"}`;
}

function buildThesis(
  input: TradeStrategyInput,
  strategy: TradeStrategyType,
  score: number
): string {
  const label = STRATEGY_LABELS[strategy];
  const window = input.userArchetype ?? "this roster";
  const valueEdge = input.valueEdgeForUser ?? totalValue(input.receiveAssets) - totalValue(input.sendAssets);
  const fit = fitLabel(score);
  const send = sideLabel(input.sendAssets);
  const receive = sideLabel(input.receiveAssets);
  const value = valuePhrase(valueEdge);

  switch (strategy) {
    case "consolidation":
    case "roster_spot_arbitrage":
      return `${label}: turn ${input.sendAssets.length} assets led by ${send} into ${receive}. Fit is ${fit} for ${window} because it converts roster spots into a better weekly asset. ${value}`;
    case "tier_down":
    case "rebuild_sell":
    case "productive_struggle":
      return `${label}: move ${send} for ${receive}. Fit is ${fit} for ${window} because it trades one hammer for multiple liquid shots. ${value}`;
    case "win_now_buy":
      {
        const pointsGain = projectedPpgTotal(input.receiveAssets) - projectedPpgTotal(input.sendAssets);
        const pointsText = pointsGain > 0
          ? ` It adds about ${Math.round(pointsGain * 10) / 10} projected league PPG.`
          : "";
        return `${label}: spend ${send} to add ${receive}. Fit is ${fit} for ${window} when the added starter production meaningfully raises title odds.${pointsText} ${value}`;
      }
    case "pick_arbitrage":
      return `${label}: exchange draft capital from ${send} into ${receive}. Fit is ${fit}; this should only surface when it improves pick quality, liquidity, or timing. ${value}`;
    case "position_arbitrage":
      return `${label}: use this league format to turn ${send} into scarcer ${receive}. Fit is ${fit} when SF QB or premium TE scarcity is real. ${value}`;
    case "manager_exploit":
      return `${label}: shape ${send} for ${receive} around what this manager appears willing to buy. Fit is ${fit}; acceptance signal matters, but value still has to hold. ${value}`;
    case "liquidity_upgrade":
      return `${label}: turn ${send} into more liquid ${receive}. Fit is ${fit} when you can flip the return more easily than the asset you send. ${value}`;
    case "buy_low":
      return `${label}: buy temporary fear on ${receive} with ${send}. Fit is ${fit} only if the long-term value beats the short-term risk. ${value}`;
    case "sell_high":
      return `${label}: cash out ${send} into ${receive}. Fit is ${fit} when market emotion is paying you for fragile or peak-year production. ${value}`;
    case "roster_fit_trade":
      return `${label}: trade ${send} for ${receive} because both teams solve a real need. Fit is ${fit}, but value and liquidity still drive the recommendation. ${value}`;
    case "market_value":
      return `${label}: trade ${send} for ${receive}. Fit is ${fit}; this needs a stronger dynasty reason before it should rank highly. ${value}`;
  }
}

function strategyWarnings(input: TradeStrategyInput, strategy: TradeStrategyType, score: number): string[] {
  const warnings: string[] = [];
  const receiveHasAnchor = hasAnchorAsset(input.receiveAssets);
  const sendHasElite = input.sendAssets.some(isEliteAsset);
  const receiveBest = bestAsset(input.receiveAssets);
  const valueEdge = input.valueEdgeForUser ?? totalValue(input.receiveAssets) - totalValue(input.sendAssets);

  if ((strategy === "tier_down" || strategy === "rebuild_sell" || strategy === "productive_struggle") && !receiveHasAnchor) {
    warnings.push("Tier-down return lacks a real anchor asset.");
  }
  if (sendHasElite && input.receiveAssets.length > 1 && !receiveHasAnchor) {
    warnings.push("Do not sell an elite asset for throw-in volume.");
  }
  if (
    (strategy === "consolidation" || strategy === "roster_spot_arbitrage") &&
    input.sendAssets.length >= 3 &&
    (!receiveBest || receiveBest.edge_score < 72)
  ) {
    warnings.push("Quantity is doing too much work without a strong starter coming back.");
  }
  if (strategy === "pick_arbitrage" && !input.pickOnlyMaterial) {
    warnings.push("Pick-only idea is low confidence unless it is a real tier-up or liquidity move.");
  }
  if (valueEdge <= -2_500) {
    warnings.push("The strategy premium is too large unless this is a title-window overpay you would make intentionally.");
  }
  if (score < 38) {
    warnings.push("This is mostly calculator value without a strong dynasty thesis.");
  }

  return warnings;
}

export function classifyTradeStrategy(input: TradeStrategyInput): TradeStrategyMetadata {
  const strategy = classifyStrategy(input);
  const score = scoreStrategy(input, strategy);
  return {
    strategy_type: strategy,
    strategy_label: STRATEGY_LABELS[strategy],
    strategy_fit: fitLabel(score),
    strategy_score: score,
    trade_thesis: buildThesis(input, strategy, score),
    strategy_warnings: strategyWarnings(input, strategy, score),
  };
}

export function applyTradeStrategyMetadata<T extends object>(
  target: T,
  metadata: TradeStrategyMetadata
): T & TradeStrategyMetadata {
  return {
    ...target,
    strategy_type: metadata.strategy_type,
    strategy_label: metadata.strategy_label,
    strategy_fit: metadata.strategy_fit,
    strategy_score: metadata.strategy_score,
    trade_thesis: metadata.trade_thesis,
    strategy_warnings: metadata.strategy_warnings,
  };
}
