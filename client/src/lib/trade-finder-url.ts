export type TradeFinderMode = "find" | "acquire" | "shop" | "scout";

export interface TradeFinderRouteState {
  mode: TradeFinderMode | null;
  leagueId: string | null;
  playerId: string | null;
  opponentRosterId: number | null;
  invalidOpponentParam: string | null;
}

const MODES = new Set<TradeFinderMode>(["find", "acquire", "shop", "scout"]);

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

export function parseTradeFinderQuery(input: string | URLSearchParams): TradeFinderRouteState {
  const params = paramsFrom(input);
  const rosterParam = params.get("opponent") ?? params.get("rosterId");
  const roster = parseRosterId(rosterParam);

  return {
    mode: parseMode(params.get("mode")),
    leagueId: params.get("league") || null,
    playerId: params.get("player") || null,
    opponentRosterId: roster.id,
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
  }
): string {
  const params = new URLSearchParams();
  if (state.mode) params.set("mode", state.mode);
  if (state.leagueId) params.set("league", state.leagueId);
  if (state.playerId) params.set("player", state.playerId);
  if (state.opponentRosterId != null) params.set("opponent", String(state.opponentRosterId));

  const query = params.toString();
  const base = `/trade-finder/${encodeURIComponent(username)}`;
  return query ? `${base}?${query}` : base;
}
