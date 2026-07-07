import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { weightQueryParams } from "../lib/weights";
import type {
  ShopPlayerResult,
  TradeBoardLine,
  TradeBoardResponse,
  TradeFinderConstraint,
  TradeFinderSearchDepth,
  TradePartnerTarget,
  TradeStrategyType,
  TradeSuggestion,
} from "@shared/types";

const SHOP_PLAYER_REQUEST_TIMEOUT_MS = 30_000;
const TRADE_FINDER_REQUEST_TIMEOUT_MS = 60_000;
const TRADE_FINDER_STALE_MS = 15 * 60_000;
const TRADE_BOARD_STALE_MS = 15 * 60_000;
const SHOP_PLAYER_STALE_MS = 10 * 60_000;
const TRADE_FINDER_TIMEOUT_MESSAGE =
  "Trade Finder timed out while building package ideas. Retry after this league finishes loading.";

interface StoredTradeBoardLines {
  savedAt: number;
  data: TradeBoardLine[];
}

function tradeToolQueryParams(): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}`;
  return params ? `?${params.slice(1)}` : "";
}

function tradeToolQuerySuffix(): string {
  const params = `${classStrengthQueryParams()}${weightQueryParams()}`;
  return params ? `&${params.slice(1)}` : "";
}

function tradeBoardStorageKey(username: string, leagueParam: string, suffix: string): string {
  return `edge:trade-board:${username.toLowerCase()}:${leagueParam}:${suffix}`;
}

function readStoredTradeBoardLines(key: string): StoredTradeBoardLines | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredTradeBoardLines;
    return Array.isArray(parsed.data) && Number.isFinite(parsed.savedAt)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredTradeBoardLines(key: string, data: TradeBoardLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      data,
    } satisfies StoredTradeBoardLines));
  } catch {
    // Local cache is a convenience only.
  }
}

export interface TradeSuggestionControls {
  targetPlayerId?: string | null;
  avoidTargetPlayerIds?: string[];
  constraints?: TradeFinderConstraint[];
  strategyFocus?: TradeStrategyType | null;
  searchDepth?: TradeFinderSearchDepth;
}

function appendTradeSuggestionControls(
  base: string,
  opponentRosterId?: number | null,
  controls: TradeSuggestionControls = {}
): string {
  const params = new URLSearchParams(base.startsWith("?") ? base.slice(1) : base);
  if (opponentRosterId != null) params.set("opponentRosterId", String(opponentRosterId));
  if (controls.targetPlayerId) params.set("targetPlayerId", controls.targetPlayerId);
  const avoid = [...new Set(controls.avoidTargetPlayerIds ?? [])].filter(Boolean);
  if (avoid.length > 0) params.set("avoidTargetPlayerIds", avoid.join(","));
  const constraints = [...new Set(controls.constraints ?? [])].filter(Boolean);
  if (constraints.length > 0) params.set("constraints", constraints.join(","));
  if (controls.strategyFocus) params.set("strategy", controls.strategyFocus);
  if (controls.searchDepth === "deep") params.set("depth", "deep");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useTradeSuggestions(
  username: string,
  leagueId: string,
  opponentRosterId?: number | null,
  controls: TradeSuggestionControls = {},
  enabled = true
) {
  const suffix = appendTradeSuggestionControls(
    tradeToolQueryParams(),
    opponentRosterId,
    controls
  );
  return useQuery<TradeSuggestion[]>({
    queryKey: [
      "trade-finder",
      username,
      leagueId,
      opponentRosterId ?? "all",
      controls.targetPlayerId ?? "",
      [...new Set(controls.avoidTargetPlayerIds ?? [])].sort(),
      [...new Set(controls.constraints ?? [])].sort(),
      controls.strategyFocus ?? "",
      controls.searchDepth ?? "quick",
      suffix,
    ],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        TRADE_FINDER_REQUEST_TIMEOUT_MS
      );
      try {
        return await apiFetch(
          `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}${suffix}`,
          { signal: controller.signal }
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error(TRADE_FINDER_TIMEOUT_MESSAGE);
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    enabled: enabled && !!username && !!leagueId,
    staleTime: TRADE_FINDER_STALE_MS,
    gcTime: TRADE_FINDER_STALE_MS * 3,
    placeholderData: (previous) => previous,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      !String((error as Error).message ?? "").includes("timed out") &&
      failureCount < 1,
  });
}

export function useTradeFinderPrewarm(
  username: string,
  leagueId: string,
  enabled = true
) {
  const suffix = tradeToolQueryParams();
  return useQuery<{ ok: boolean }>({
    queryKey: ["trade-finder-prewarm", username, leagueId, suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}/prewarm${suffix}`
      ),
    enabled: enabled && !!username && !!leagueId,
    staleTime: TRADE_FINDER_STALE_MS,
    gcTime: TRADE_FINDER_STALE_MS * 3,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useTradePartnerTargets(
  username: string,
  leagueId: string,
  opponentRosterId?: number | null
) {
  const suffix = tradeToolQueryParams();
  const query =
    opponentRosterId != null
      ? `${suffix || "?"}${suffix ? "&" : ""}opponentRosterId=${encodeURIComponent(String(opponentRosterId))}`
      : suffix;
  return useQuery<TradePartnerTarget[]>({
    queryKey: ["trade-partner-targets", username, leagueId, opponentRosterId ?? "none", suffix],
    queryFn: () =>
      apiFetch(
        `/api/trade/find/${encodeURIComponent(username)}/${encodeURIComponent(leagueId)}/targets${query}`
      ),
    enabled: !!username && !!leagueId && opponentRosterId != null,
    staleTime: TRADE_FINDER_STALE_MS,
    gcTime: TRADE_FINDER_STALE_MS * 3,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useTradeBoardLines(username: string, leagueIds: string[]) {
  const suffix = tradeToolQueryParams();
  const normalizedLeagueIds = leagueIds.filter(Boolean).slice(0, 6);
  const leagueParam = normalizedLeagueIds.join(",");
  const storageKey = tradeBoardStorageKey(username, leagueParam, suffix);
  const query = [
    `leagueIds=${encodeURIComponent(leagueParam)}`,
    "cacheFirst=true",
    suffix ? suffix.slice(1) : "",
  ].filter(Boolean).join("&");

  return useQuery<TradeBoardResponse>({
    queryKey: ["trade-board-lines", username, normalizedLeagueIds, suffix],
    queryFn: async () => {
      const data = await apiFetch<TradeBoardResponse>(
        `/api/trade/board/${encodeURIComponent(username)}?${query}`
      );
      if (data.lines.length > 0) {
        writeStoredTradeBoardLines(storageKey, data.lines);
      }
      return data;
    },
    enabled: !!username && normalizedLeagueIds.length > 0,
    staleTime: TRADE_BOARD_STALE_MS,
    gcTime: TRADE_BOARD_STALE_MS * 3,
    initialData: () => {
      const stored = readStoredTradeBoardLines(storageKey);
      return stored
        ? {
            lines: stored.data,
            status: "ready" as const,
            cache_status: "local" as const,
            generated_at: new Date(stored.savedAt).toISOString(),
          }
        : undefined;
    },
    initialDataUpdatedAt: () => readStoredTradeBoardLines(storageKey)?.savedAt,
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.status === "building" ? 2_500 : false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useShopPlayer(
  username: string,
  playerId: string,
  ambition: number = 2,
  showRedraft = false,
  depth: "quick" | "full" = "quick"
) {
  const suffix = tradeToolQuerySuffix();
  return useQuery<ShopPlayerResult>({
    queryKey: ["shop-player", username, playerId, ambition, suffix, showRedraft, depth],
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        SHOP_PLAYER_REQUEST_TIMEOUT_MS
      );
      try {
        return await apiFetch(
          `/api/trade/shop/${encodeURIComponent(username)}/${encodeURIComponent(playerId)}?ambition=${ambition}&depth=${depth}${suffix}${showRedraft ? "&redraft=true" : ""}`,
          { signal: controller.signal }
        );
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error("Shop a Player timed out. Try a lower ambition level or retry in a moment.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    enabled: !!username && !!playerId,
    staleTime: SHOP_PLAYER_STALE_MS,
    gcTime: SHOP_PLAYER_STALE_MS * 3,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
