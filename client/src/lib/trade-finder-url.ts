import type { TradeFinderConstraint, TradeFinderSearchDepth, TradeStrategyType } from "@shared/types";

export type TradeFinderMode = "find" | "acquire" | "shop" | "scout";

export interface TradeFinderRouteState {
  mode: TradeFinderMode | null;
  leagueId: string | null;
  playerId: string | null;
  opponentRosterId: number | null;
  targetPlayerId: string | null;
  avoidTargetPlayerIds: string[];
  constraints: TradeFinderConstraint[];
  strategyFocus: TradeStrategyType | null;
  searchDepth: TradeFinderSearchDepth;
  invalidOpponentParam: string | null;
}

const MODES = new Set<TradeFinderMode>(["find", "acquire", "shop", "scout"]);
const CONSTRAINTS = new Set<TradeFinderConstraint>([
  "cheaper",
  "no_firsts",
  "only_qb_tier_down",
  "no_aging_rbs",
  "more_realistic",
  "more_picks_back",
  "no_qbs",
  "win_now_only",
]);
const STRATEGIES = new Set<TradeStrategyType>([
  "consolidation",
  "tier_down",
  "buy_low",
  "sell_high",
  "win_now_buy",
  "rebuild_sell",
  "productive_struggle",
  "pick_arbitrage",
  "position_arbitrage",
  "roster_fit_trade",
  "roster_spot_arbitrage",
  "manager_exploit",
  "liquidity_upgrade",
  "market_value",
]);

function paramsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

function parseMode(value: string | null): TradeFinderMode | null {
  if (!value) return null;
  return MODES.has(value as TradeFinderMode) ? (value as TradeFinderMode) : null;
}

function parseRosterId(value: string | null): { id: number | null; invalid: string | null } {
  if (!value) return { id: null, invalid: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { id: null, invalid: value };
  }
  return { id: parsed, invalid: null };
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseConstraints(value: string | null): TradeFinderConstraint[] {
  return parseList(value).filter((entry): entry is TradeFinderConstraint =>
    CONSTRAINTS.has(entry as TradeFinderConstraint)
  );
}

function parseStrategy(value: string | null): TradeStrategyType | null {
  if (!value) return null;
  return STRATEGIES.has(value as TradeStrategyType) ? (value as TradeStrategyType) : null;
}

function parseDepth(value: string | null): TradeFinderSearchDepth {
  return value === "deep" ? "deep" : "quick";
}

export function parseTradeFinderQuery(input: string | URLSearchParams): TradeFinderRouteState {
  const params = paramsFrom(input);
  const rosterParam = params.get("opponent") ?? params.get("opponentRosterId") ?? params.get("rosterId");
  const roster = parseRosterId(rosterParam);

  return {
    mode: parseMode(params.get("mode")),
    leagueId: params.get("league") || null,
    playerId: params.get("player") || null,
    opponentRosterId: roster.id,
    targetPlayerId: params.get("target") || params.get("targetPlayerId") || null,
    avoidTargetPlayerIds: parseList(params.get("avoid") ?? params.get("avoidTargetPlayerIds")),
    constraints: parseConstraints(params.get("constraints")),
    strategyFocus: parseStrategy(params.get("strategy")),
    searchDepth: parseDepth(params.get("depth")),
    invalidOpponentParam: roster.invalid,
  };
}

export function buildTradeFinderUrl(
  username: string,
  state: {
    mode?: TradeFinderMode | null;
    leagueId?: string | null;
    playerId?: string | null;
    opponentRosterId?: number | null;
    targetPlayerId?: string | null;
    avoidTargetPlayerIds?: string[] | null;
    constraints?: TradeFinderConstraint[] | null;
    strategyFocus?: TradeStrategyType | null;
    searchDepth?: TradeFinderSearchDepth | null;
  }
): string {
  const params = new URLSearchParams();
  if (state.mode) params.set("mode", state.mode);
  if (state.leagueId) params.set("league", state.leagueId);
  if (state.playerId) params.set("player", state.playerId);
  if (state.opponentRosterId != null) params.set("opponent", String(state.opponentRosterId));
  if (state.targetPlayerId) params.set("target", state.targetPlayerId);
  const avoid = [...new Set(state.avoidTargetPlayerIds ?? [])].filter(Boolean);
  if (avoid.length > 0) params.set("avoid", avoid.join(","));
  const constraints = [...new Set(state.constraints ?? [])].filter(Boolean);
  if (constraints.length > 0) params.set("constraints", constraints.join(","));
  if (state.strategyFocus) params.set("strategy", state.strategyFocus);
  if (state.searchDepth === "deep") params.set("depth", "deep");

  const query = params.toString();
  const base = `/trade-finder/${encodeURIComponent(username)}`;
  return query ? `${base}?${query}` : base;
}
