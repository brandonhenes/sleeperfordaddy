import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import SyncGate from "../components/SyncGate";
import { useCurrentUsername } from "../hooks/use-current-user";
import { usePowerRankings } from "../hooks/use-power-rankings";
import { useTradeSuggestions, useShopPlayer } from "../hooks/use-trade-finder";
import { useAcquisition } from "../hooks/use-acquisition";
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

export default function TradeFinder() {
  const { username } = useCurrentUsername();

  return (
    <AppShell>
      <div style={{ padding: "28px 0 8px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Trade Finder</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Suggested trades and acquisition plans based on roster composition, archetypes, and draft capital
        </p>
      </div>
      <SyncGate username={username}>
        <TradeFinderReady username={username} />
      </SyncGate>
    </AppShell>
  );
}

function TradeFinderReady({ username }: { username: string }) {
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [mode, setMode] = useState<"find" | "acquire" | "shop" | "scout">("find");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<SelectedAcquisitionTarget | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [shopAmbition, setShopAmbition] = useState(2);
  const [showShopRedraft, setShowShopRedraft] = useState(false);
  const [shopPathFilter, setShopPathFilter] = useState<ShopPathFilter>(null);
  const [selectedScoutRosterId, setSelectedScoutRosterId] = useState<number | null>(null);
  const [pendingScoutRosterId, setPendingScoutRosterId] = useState<number | null>(null);
  const [scoutRouteWarning, setScoutRouteWarning] = useState<string | null>(null);
  const scoutDetailRef = useRef<HTMLDivElement | null>(null);

  const { data: leagues, isLoading: leaguesLoading } = usePowerRankings(username, showShopRedraft);
  const { data: suggestions, isLoading: suggestionsLoading, error: suggestionsError } = useTradeSuggestions(username, selectedLeague);
  const { data: portfolio } = usePortfolio(username);
  const selectedLeagueData = leagues?.find((league) => league.league_id === selectedLeague);
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
    mode === "scout" ? username : "",
    mode === "scout" ? selectedLeague : ""
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

  const { data: acquisitionData, isLoading: acquisitionLoading } = useAcquisition(username, selectedTarget);
  const { data: shopResult, isLoading: shopLoading, error: shopError } = useShopPlayer(
    mode === "shop" ? username : "",
    mode === "shop" ? selectedPlayer : "",
    shopAmbition,
    showShopRedraft
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

    if (routeState.mode === "find" || routeState.mode === "acquire") {
      setMode(routeState.mode);
    }
  }, []);

  useEffect(() => {
    if (pendingScoutRosterId != null) return;
    setSelectedScoutRosterId(null);
    setScoutRouteWarning(null);
  }, [pendingScoutRosterId, selectedLeague]);

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

  return (
    <>
      <FreshnessBar leagueId={selectedLeague || undefined} />

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16, marginTop: 8, flexWrap: "wrap" }}>
        {([
          { key: "find" as const, label: "Find Trades" },
          { key: "acquire" as const, label: "What Would It Take?" },
          { key: "shop" as const, label: "Shop a Player" },
          { key: "scout" as const, label: "Scout Opponents" },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => { setMode(m.key); setSelectedTarget(null); setSelectedPlayer(""); setShopPathFilter(null); if (m.key !== "scout") setScoutRouteWarning(null); }}
            style={{ background: "transparent", border: "none", borderBottom: mode === m.key ? "2px solid var(--amber)" : "2px solid transparent", color: mode === m.key ? "var(--amber)" : "var(--text-muted)", padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3, transition: "color 0.15s, border-color 0.15s", fontFamily: "inherit", flex: "1 1 150px", minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "find" && (
        <FindTradesPanel
          leagues={leagues}
          leaguesLoading={leaguesLoading}
          selectedLeague={selectedLeague}
          setSelectedLeague={setSelectedLeague}
          selectedScoutProfile={selectedScoutProfile}
          onClearScoutFilter={() => setSelectedScoutRosterId(null)}
          leaguePicksData={leaguePicksQuery.data}
          leaguePicksLoading={leaguePicksQuery.isLoading}
          suggestions={suggestions}
          filteredSuggestions={filteredSuggestions}
          suggestionsLoading={suggestionsLoading}
          suggestionsError={suggestionsError}
        />
      )}
      {mode === "acquire" && (
        <AcquisitionPanel
          targetSearch={targetSearch}
          setTargetSearch={setTargetSearch}
          selectedTarget={selectedTarget}
          setSelectedTarget={setSelectedTarget}
          targetResults={targetResults}
          acquisitionData={acquisitionData}
          acquisitionLoading={acquisitionLoading}
        />
      )}

      {mode === "shop" && (
        <ShopPlayerPanel
          portfolio={portfolio}
          selectedPlayer={selectedPlayer}
          setSelectedPlayer={setSelectedPlayer}
          shopAmbition={shopAmbition}
          setShopAmbition={setShopAmbition}
          showShopRedraft={showShopRedraft}
          onToggleRedraft={() => setShowShopRedraft((current) => !current)}
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


