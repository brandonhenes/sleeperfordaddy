import type { TradeAssetInput } from "@shared/types";

export interface TradeCalculatorRouteState {
  username: string | null;
  leagueId: string | null;
  opponentRosterId: number | null;
  send: TradeAssetInput[];
  receive: TradeAssetInput[];
  sendLabels: string[];
  receiveLabels: string[];
}

function paramsFrom(input: string | URLSearchParams): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

function parseRosterId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseAssets(value: string | null): TradeAssetInput[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    return candidates.filter((asset): asset is TradeAssetInput => {
      if (!asset || typeof asset !== "object") return false;
      const candidate = asset as Partial<TradeAssetInput>;
      if (candidate.type === "player") return typeof candidate.player_id === "string" && candidate.player_id.length > 0;
      if (candidate.type === "pick") return Boolean(candidate.pick_season && candidate.pick_round);
      return false;
    });
  } catch {
    return [];
  }
}

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    return candidates.filter((label): label is string => typeof label === "string");
  } catch {
    return [];
  }
}

export function parseTradeCalculatorQuery(input: string | URLSearchParams): TradeCalculatorRouteState {
  const params = paramsFrom(input);
  return {
    username: params.get("username") || null,
    leagueId: params.get("league") || null,
    opponentRosterId: parseRosterId(params.get("opponent") ?? params.get("opponentRosterId")),
    send: parseAssets(params.get("send")),
    receive: parseAssets(params.get("receive")),
    sendLabels: parseLabels(params.get("sendLabels")),
    receiveLabels: parseLabels(params.get("receiveLabels")),
  };
}

export function buildTradeCalculatorUrl(state: {
  username?: string | null;
  leagueId?: string | null;
  opponentRosterId?: number | null;
  send?: TradeAssetInput[];
  receive?: TradeAssetInput[];
  sendLabels?: string[];
  receiveLabels?: string[];
}): string {
  const params = new URLSearchParams();
  if (state.username) params.set("username", state.username);
  if (state.leagueId) params.set("league", state.leagueId);
  if (state.opponentRosterId != null) params.set("opponent", String(state.opponentRosterId));
  if (state.send && state.send.length > 0) params.set("send", JSON.stringify(state.send));
  if (state.receive && state.receive.length > 0) params.set("receive", JSON.stringify(state.receive));
  if (state.sendLabels && state.sendLabels.length > 0) params.set("sendLabels", JSON.stringify(state.sendLabels));
  if (state.receiveLabels && state.receiveLabels.length > 0) params.set("receiveLabels", JSON.stringify(state.receiveLabels));
  const query = params.toString();
  return query ? `/trade-calculator?${query}` : "/trade-calculator";
}
