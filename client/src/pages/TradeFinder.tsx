import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import { PageHeader } from "../components/ui";
import { useCurrentUsername } from "../hooks/use-current-user";
import { useLeagueSummaries } from "../hooks/use-league-summaries";
import { usePowerRankings } from "../hooks/use-power-rankings";
import {
  useTradeFinderPrewarm,
  useShopPlayer,
  useTradePartnerTargets,
  useTradeSuggestions,
} from "../hooks/use-trade-finder";
import { type AcquisitionDepth, useAcquisition } from "../hooks/use-acquisition";
import {
  useOpponentExploits,
  useOpponentProfiles,
  useRefreshOpponentProfiles,
} from "../hooks/use-opponent-profiles";
import { usePortfolio } from "../hooks/use-portfolio";
import { apiFetch } from "../lib/api";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { buildTradeFinderUrl, parseTradeFinderQuery } from "../lib/trade-finder-url";
import AcquisitionPanel, {
  type AcquisitionSearchResult,
  type SelectedAcquisitionTarget,
} from "./trade-finder/AcquisitionPanel";
import FindTradesPanel from "./trade-finder/FindTradesPanel";
import { type LeaguePicksResponse } from "./trade-finder/PickInventoryPanel";
import ScoutPanel, { scoreScoutProfiles } from "./trade-finder/ScoutPanel";
import ShopPlayerPanel, { type ShopPathFilter } from "./trade-finder/ShopPlayerPanel";
import type { TradeFinderConstraint, TradeFinderSearchDepth, TradeStrategyType } from "@shared/types";

export default function TradeFinder() {
  const { username } = useCurrentUsername();

  return (
    <AppShell requireSync>
      <PageHeader
        title="Trade Finder"
      />
      <TradeFinderReady username={username} />
    </AppShell>
  );
}

function TradeFinderReady({ username }: { username: string }) {
  const [initialRoute] = useState(() =>
    typeof window === "undefined"
      ? parseTradeFinderQuery("")
      : parseTradeFinderQuery(window.location.search)
  );
  const [selectedLeague, setSelectedLeague] = useState<string>(initialRoute.leagueId ?? "");
  const [mode, setMode] = useState<"find" | "acquire" | "shop" | "scout">(initialRoute.mode ?? "find");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<SelectedAcquisitionTarget | null>(null);
  const [acquisitionDepth, setAcquisitionDepth] = useState<AcquisitionDepth>("quick");
  const [selectedPlayer, setSelectedPlayer] = useState(initialRoute.mode === "shop" ? initialRoute.playerId ?? "" : "");
  const [shopAmbition, setShopAmbition] = useState(2);
  const [shopDepth, setShopDepth] = useState<"quick" | "full">("quick");
  const [showShopRedraft, setShowShopRedraft] = useState(false);
  const [shopPathFilter, setShopPathFilter] = useState<ShopPathFilter>(null);
  const [selectedScoutRosterId, setSelectedScoutRosterId] = useState<number | null>(
    initialRoute.mode === "find" || initialRoute.mode === "scout" ? initialRoute.opponentRosterId : null
  );
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(
    initialRoute.mode === "find" ? initialRoute.targetPlayerId : null
  );
  const [avoidTargetPlayerIds, setAvoidTargetPlayerIds] = useState<string[]>(
    initialRoute.mode === "find" ? initialRoute.avoidTargetPlayerIds : []
  );
  const [laneConstraints, setLaneConstraints] = useState<TradeFinderConstraint[]>(
    initialRoute.mode === "find" ? initialRoute.constraints : []
  );
  const [strategyFocus, setStrategyFocus] = useState<TradeStrategyType | null>(
    initialRoute.mode === "find" ? initialRoute.strategyFocus : null
  );
  const [searchDepth, setSearchDepth] = useState<TradeFinderSearchDepth>(
    initialRoute.mode === "find" ? initialRoute.searchDepth : "quick"
  );
  const [pendingScoutRosterId, setPendingScoutRosterId] = useState<number | null>(
    initialRoute.mode === "scout" ? initialRoute.opponentRosterId : null
  );
  const [scoutRouteWarning, setScoutRouteWarning] = useState<string | null>(
    initialRoute.invalidOpponentParam
      ? `${initialRoute.mode === "scout" ? "Scout" : "Trade Finder"} link has an invalid opponent id: ${initialRoute.invalidOpponentParam}.`
      : null
  );
  const scoutDetailRef = useRef<HTMLDivElement | null>(null);

  const { data: leagues, isLoading: leaguesLoading } = useLeagueSummaries(username, showShopRedraft);
  const tradeControls = {
    targetPlayerId: selectedScoutRosterId == null ? null : targetPlayerId,
    avoidTargetPlayerIds: selectedScoutRosterId == null ? [] : avoidTargetPlayerIds,
    constraints: laneConstraints,
    strategyFocus,
    searchDepth,
  };
  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    isFetching: suggestionsFetching,
    error: suggestionsError,
  } = useTradeSuggestions(
    mode === "find" ? username : "",
    mode === "find" ? selectedLeague : "",
    selectedScoutRosterId,
    tradeControls,
    mode === "find" && !!selectedLeague && selectedScoutRosterId != null
  );
  useTradeFinderPrewarm(
    mode === "find" ? username : "",
    mode === "find" ? selectedLeague : "",
    mode === "find" && !!selectedLeague
  );
  const partnerTargetsQuery = useTradePartnerTargets(
    mode === "find" ? username : "",
    mode === "find" ? selectedLeague : "",
    mode === "find" ? selectedScoutRosterId : null
  );
  const { data: portfolio } = usePortfolio(username);
  const shouldLoadRosterContext =
    (mode === "find" && !!selectedLeague && selectedScoutRosterId != null) ||
    (mode === "scout" && !!selectedLeague);
  const { data: rankingLeagues = [] } = usePowerRankings(shouldLoadRosterContext ? username : "", false);
  const selectedLeagueData = rankingLeagues.find((league) => league.league_id === selectedLeague);
  const classStrengthSuffix = classStrengthQueryParams();
  const leaguePicksQuery = useQuery<LeaguePicksResponse>({
    queryKey: ["league-picks", username, selectedLeague, classStrengthSuffix],
    queryFn: () =>
      apiFetch(
        `/api/picks/${encodeURIComponent(selectedLeague)}/${encodeURIComponent(username)}${classStrengthSuffix ? `?${classStrengthSuffix.slice(1)}` : ""}`
      ),
    enabled: mode === "find" && !!selectedLeague,
    staleTime: 60 * 1000,
  });
  const scoutProfilesQuery = useOpponentProfiles(
    mode === "find" || mode === "scout" ? username : "",
    mode === "find" || mode === "scout" ? selectedLeague : ""
  );
  const refreshProfilesMutation = useRefreshOpponentProfiles();
  const exploitAnglesQuery = useOpponentExploits(
    mode === "scout" ? username : "",
    mode === "scout" ? selectedLeague : "",
    mode === "scout" ? selectedScoutRosterId : null
  );

  const { data: targetResults = [] } = useQuery<AcquisitionSearchResult[]>({
    queryKey: ["acquire-search", targetSearch],
    enabled: mode === "acquire" && targetSearch.trim().length >= 2,
    queryFn: () => apiFetch(`/api/trade/assets?q=${encodeURIComponent(targetSearch.trim())}&limit=8`),
  });

  const { data: acquisitionData, isLoading: acquisitionLoading } = useAcquisition(username, selectedTarget, acquisitionDepth);
  const { data: shopResult, isLoading: shopLoading, error: shopError } = useShopPlayer(
    mode === "shop" ? username : "",
    mode === "shop" ? selectedPlayer : "",
    shopAmbition,
    showShopRedraft,
    shopDepth
  );
  const scoutProfilesWithScores = scoreScoutProfiles(
    scoutProfilesQuery.data?.profiles ?? [],
    selectedLeagueData
  );
  const selectedScoutProfile =
    scoutProfilesWithScores.find(({ profile }) => profile.rosterId === selectedScoutRosterId)?.profile ?? null;
  const filteredSuggestions = (suggestions ?? []).filter(
    (suggestion) =>
      selectedScoutRosterId == null || suggestion.partner.roster_id === selectedScoutRosterId
  );

  function applyFindRouteControls(routeState: ReturnType<typeof parseTradeFinderQuery>) {
    setTargetPlayerId(routeState.targetPlayerId);
    setAvoidTargetPlayerIds(routeState.avoidTargetPlayerIds);
    setLaneConstraints(routeState.constraints);
    setStrategyFocus(routeState.strategyFocus);
    setSearchDepth(routeState.searchDepth);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const routeState = parseTradeFinderQuery(window.location.search);

    if (routeState.leagueId) {
      setSelectedLeague(routeState.leagueId);
    }

    if (routeState.mode === "shop" && routeState.playerId) {
      setMode("shop");
      setSelectedPlayer(routeState.playerId);
      return;
    }

    if (routeState.mode === "scout") {
      setMode("scout");
      if (!routeState.leagueId) {
        setScoutRouteWarning("Scout link is missing a league. Select a league to continue.");
      }
      if (routeState.invalidOpponentParam) {
        setScoutRouteWarning(`Scout link has an invalid opponent id: ${routeState.invalidOpponentParam}.`);
      } else if (routeState.opponentRosterId != null) {
        setSelectedScoutRosterId(routeState.opponentRosterId);
        setPendingScoutRosterId(routeState.opponentRosterId);
      } else {
        setScoutRouteWarning("Scout link is missing an opponent. Select an opponent card below.");
      }
      return;
    }

    if (routeState.mode === "find") {
      setMode("find");
      if (routeState.invalidOpponentParam) {
        setScoutRouteWarning(`Trade Finder link has an invalid opponent id: ${routeState.invalidOpponentParam}.`);
      } else if (routeState.opponentRosterId != null) {
        setSelectedScoutRosterId(routeState.opponentRosterId);
      }
      applyFindRouteControls(routeState);
      return;
    }

    if (routeState.mode === "acquire") {
      setMode(routeState.mode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyRoute = () => {
      const routeState = parseTradeFinderQuery(window.location.search);
      if (routeState.leagueId) setSelectedLeague(routeState.leagueId);

      if (routeState.mode === "shop") {
        setMode("shop");
        setSelectedPlayer(routeState.playerId ?? "");
        return;
      }

      if (routeState.mode === "scout") {
        setMode("scout");
        setSelectedScoutRosterId(routeState.opponentRosterId);
        setPendingScoutRosterId(routeState.opponentRosterId);
        setScoutRouteWarning(routeState.invalidOpponentParam ? `Scout link has an invalid opponent id: ${routeState.invalidOpponentParam}.` : null);
        return;
      }

      if (routeState.mode === "find") {
        setMode("find");
        setSelectedScoutRosterId(routeState.opponentRosterId);
        setPendingScoutRosterId(null);
        setScoutRouteWarning(routeState.invalidOpponentParam ? `Trade Finder link has an invalid opponent id: ${routeState.invalidOpponentParam}.` : null);
        applyFindRouteControls(routeState);
        return;
      }

      if (routeState.mode === "acquire") {
        setMode("acquire");
      }
    };

    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, []);

  useEffect(() => {
    if (selectedLeague || !leagues || leagues.length === 0) return;
    if (typeof window !== "undefined") {
      const routeState = parseTradeFinderQuery(window.location.search);
      if (routeState.leagueId) return;
      const lastLeagueId = window.localStorage.getItem(`edge:trade-finder:last-league:${username}`);
      if (lastLeagueId && leagues.some((league) => league.league_id === lastLeagueId)) {
        setSelectedLeague(lastLeagueId);
        return;
      }
    }
    setSelectedLeague(leagues[0].league_id);
  }, [leagues, selectedLeague, username]);

  useEffect(() => {
    if (!selectedLeague || typeof window === "undefined") return;
    window.localStorage.setItem(`edge:trade-finder:last-league:${username}`, selectedLeague);
  }, [selectedLeague, username]);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "find" || !selectedLeague) return;
    window.history.replaceState(null, "", buildTradeFinderUrl(username, {
      mode: "find",
      leagueId: selectedLeague,
      opponentRosterId: selectedScoutRosterId,
      targetPlayerId: selectedScoutRosterId == null ? null : targetPlayerId,
      avoidTargetPlayerIds: selectedScoutRosterId == null ? [] : avoidTargetPlayerIds,
      constraints: laneConstraints,
      strategyFocus,
      searchDepth,
    }));
  }, [
    mode,
    selectedLeague,
    selectedScoutRosterId,
    targetPlayerId,
    avoidTargetPlayerIds,
    laneConstraints,
    strategyFocus,
    searchDepth,
    username,
  ]);

  useEffect(() => {
    if (mode !== "scout" || pendingScoutRosterId != null) return;
    setSelectedScoutRosterId(null);
    setScoutRouteWarning(null);
  }, [mode, pendingScoutRosterId, selectedLeague]);

  useEffect(() => {
    if (mode !== "scout") return;
    if (scoutProfilesWithScores.length === 0) {
      if (pendingScoutRosterId == null) setSelectedScoutRosterId(null);
      return;
    }
    if (
      pendingScoutRosterId != null &&
      !scoutProfilesWithScores.some(({ profile }) => profile.rosterId === pendingScoutRosterId)
    ) {
      setScoutRouteWarning(`Opponent roster ${pendingScoutRosterId} was not found in this league.`);
      setPendingScoutRosterId(null);
      setSelectedScoutRosterId(null);
      return;
    }
    if (
      selectedScoutRosterId == null ||
      !scoutProfilesWithScores.some(({ profile }) => profile.rosterId === selectedScoutRosterId)
    ) {
      if (scoutRouteWarning) return;
      setSelectedScoutRosterId(scoutProfilesWithScores[0].profile.rosterId);
      return;
    }
    if (pendingScoutRosterId === selectedScoutRosterId) {
      setPendingScoutRosterId(null);
      setScoutRouteWarning(null);
    }
  }, [mode, pendingScoutRosterId, scoutProfilesWithScores, scoutRouteWarning, selectedScoutRosterId]);

  useEffect(() => {
    if (mode !== "scout" || !selectedScoutProfile) return;
    const id = window.setTimeout(() => {
      scoutDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      scoutDetailRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [mode, selectedScoutProfile?.rosterId]);

  function openExploitLink(rosterId: number) {
    if (!selectedLeague || !username) {
      setScoutRouteWarning("Select a league before opening exploit angles.");
      return;
    }
    setMode("scout");
    setSelectedScoutRosterId(rosterId);
    setPendingScoutRosterId(null);
    setScoutRouteWarning(null);
    if (typeof window !== "undefined") {
      const url = buildTradeFinderUrl(username, {
        mode: "scout",
        leagueId: selectedLeague,
        opponentRosterId: rosterId,
      });
      window.history.pushState(null, "", url);
    }
  }

  function pushFindUrl(
    nextLeague: string,
    nextOpponentRosterId: number | null,
    resetControls = false
  ) {
    if (typeof window === "undefined" || !username) return;
    window.history.pushState(null, "", buildTradeFinderUrl(username, {
      mode: "find",
      leagueId: nextLeague,
      opponentRosterId: nextOpponentRosterId,
      targetPlayerId: resetControls || nextOpponentRosterId == null ? null : targetPlayerId,
      avoidTargetPlayerIds: resetControls || nextOpponentRosterId == null ? [] : avoidTargetPlayerIds,
      constraints: resetControls ? [] : laneConstraints,
      strategyFocus: resetControls ? null : strategyFocus,
      searchDepth: resetControls ? "quick" : searchDepth,
    }));
  }

  function selectFindLeague(nextLeague: string) {
    setSelectedLeague(nextLeague);
    setSelectedScoutRosterId(null);
    setTargetPlayerId(null);
    setAvoidTargetPlayerIds([]);
    setLaneConstraints([]);
    setStrategyFocus(null);
    setSearchDepth("quick");
    if (nextLeague) pushFindUrl(nextLeague, null, true);
  }

  function selectFindOpponent(nextOpponentRosterId: number | null) {
    setSelectedScoutRosterId(nextOpponentRosterId);
    setTargetPlayerId(null);
    setAvoidTargetPlayerIds([]);
    setLaneConstraints([]);
    setStrategyFocus(null);
    setSearchDepth("quick");
    if (selectedLeague) pushFindUrl(selectedLeague, nextOpponentRosterId, true);
  }

  function selectTradeMode(nextMode: "find" | "acquire" | "shop" | "scout") {
    setMode(nextMode);
    setSelectedTarget(null);
    setShopPathFilter(null);
    if (nextMode !== "shop") setSelectedPlayer("");
    if (nextMode !== "scout") setScoutRouteWarning(null);

    if (typeof window === "undefined") return;
    if (nextMode === "find") {
      window.history.pushState(null, "", buildTradeFinderUrl(username, {
        mode: "find",
        leagueId: selectedLeague,
        opponentRosterId: selectedScoutRosterId,
        targetPlayerId: selectedScoutRosterId == null ? null : targetPlayerId,
        avoidTargetPlayerIds: selectedScoutRosterId == null ? [] : avoidTargetPlayerIds,
        constraints: laneConstraints,
        strategyFocus,
        searchDepth,
      }));
      return;
    }
    if (nextMode === "scout") {
      window.history.pushState(null, "", buildTradeFinderUrl(username, {
        mode: "scout",
        leagueId: selectedLeague,
        opponentRosterId: selectedScoutRosterId,
      }));
      return;
    }
    window.history.pushState(null, "", buildTradeFinderUrl(username, {
      mode: nextMode,
      playerId: nextMode === "shop" ? selectedPlayer : null,
    }));
  }

  return (
    <>
      <FreshnessBar leagueId={selectedLeague || undefined} />

      <div className="trade-finder-tabs" style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16, marginTop: 8, flexWrap: "wrap" }}>
        {([
          { key: "find" as const, label: "Find" },
          { key: "acquire" as const, label: "Acquire" },
          { key: "shop" as const, label: "Shop" },
          { key: "scout" as const, label: "Scout" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => selectTradeMode(m.key)}
            className="trade-finder-tab"
            style={{ background: "transparent", border: "none", borderBottom: mode === m.key ? "2px solid var(--amber)" : "2px solid transparent", color: mode === m.key ? "var(--amber)" : "var(--text-muted)", padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3, transition: "color 0.15s, border-color 0.15s", fontFamily: "inherit", flex: "1 1 150px", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "find" && (
        <FindTradesPanel
          username={username}
          leagues={leagues}
          leaguesLoading={leaguesLoading}
          selectedLeague={selectedLeague}
          setSelectedLeague={selectFindLeague}
          selectedScoutProfile={selectedScoutProfile}
          opponentProfiles={scoutProfilesWithScores.map(({ profile }) => profile)}
          opponentProfilesLoading={scoutProfilesQuery.isLoading}
          selectedOpponentRosterId={selectedScoutRosterId}
          setSelectedOpponentRosterId={selectFindOpponent}
          targetPlayerId={targetPlayerId}
          setTargetPlayerId={setTargetPlayerId}
          avoidTargetPlayerIds={avoidTargetPlayerIds}
          setAvoidTargetPlayerIds={setAvoidTargetPlayerIds}
          laneConstraints={laneConstraints}
          setLaneConstraints={setLaneConstraints}
          strategyFocus={strategyFocus}
          setStrategyFocus={setStrategyFocus}
          searchDepth={searchDepth}
          setSearchDepth={setSearchDepth}
          partnerTargets={partnerTargetsQuery.data ?? []}
          partnerTargetsLoading={partnerTargetsQuery.isLoading}
          onClearScoutFilter={() => selectFindOpponent(null)}
          leaguePicksData={leaguePicksQuery.data}
          leaguePicksLoading={leaguePicksQuery.isLoading}
          suggestions={suggestions}
          filteredSuggestions={filteredSuggestions}
          suggestionsLoading={suggestionsLoading}
          suggestionsRefreshing={suggestionsFetching && !suggestionsLoading}
          suggestionsError={suggestionsError}
          selectedLeagueData={selectedLeagueData}
        />
      )}
      {mode === "acquire" && (
        <AcquisitionPanel
          username={username}
          targetSearch={targetSearch}
          setTargetSearch={setTargetSearch}
          selectedTarget={selectedTarget}
          setSelectedTarget={setSelectedTarget}
          acquisitionDepth={acquisitionDepth}
          setAcquisitionDepth={setAcquisitionDepth}
          targetResults={targetResults}
          acquisitionData={acquisitionData}
          acquisitionLoading={acquisitionLoading}
        />
      )}

      {mode === "shop" && (
        <ShopPlayerPanel
          username={username}
          portfolio={portfolio}
          selectedPlayer={selectedPlayer}
          setSelectedPlayer={setSelectedPlayer}
          shopAmbition={shopAmbition}
          setShopAmbition={setShopAmbition}
          shopDepth={shopDepth}
          setShopDepth={setShopDepth}
          showShopRedraft={showShopRedraft}
          onToggleRedraft={() => {
            setShopDepth("quick");
            setShowShopRedraft((current) => !current);
          }}
          shopPathFilter={shopPathFilter}
          setShopPathFilter={setShopPathFilter}
          shopLoading={shopLoading}
          shopError={shopError}
          shopResult={shopResult}
        />
      )}
      {mode === "scout" && (
        <ScoutPanel
          username={username}
          leagues={leagues}
          leaguesLoading={leaguesLoading}
          selectedLeague={selectedLeague}
          setSelectedLeague={setSelectedLeague}
          scoutRouteWarning={scoutRouteWarning}
          scoutProfilesWithScores={scoutProfilesWithScores}
          selectedScoutRosterId={selectedScoutRosterId}
          selectedScoutProfile={selectedScoutProfile}
          scoutProfilesData={scoutProfilesQuery.data}
          scoutProfilesLoading={scoutProfilesQuery.isLoading}
          scoutProfilesError={scoutProfilesQuery.error}
          onRefreshProfiles={() => {
            if (!selectedLeague) return;
            refreshProfilesMutation.mutate({ leagueId: selectedLeague, username });
          }}
          refreshProfilesPending={refreshProfilesMutation.isPending}
          exploitAngles={exploitAnglesQuery.data?.angles ?? []}
          exploitAnglesLoading={exploitAnglesQuery.isLoading}
          exploitAnglesError={exploitAnglesQuery.error}
          scoutDetailRef={scoutDetailRef}
          onOpenExploit={openExploitLink}
          onFindTrades={() => {
            setMode("find");
            setSelectedScoutRosterId(selectedScoutProfile?.rosterId ?? null);
          }}
          onCloseDetail={() => {
            setSelectedScoutRosterId(null);
            setScoutRouteWarning(null);
          }}
        />
      )}
    </>
  );
}


