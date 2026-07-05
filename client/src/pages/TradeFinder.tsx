import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AppShell from "../components/AppShell";
import FreshnessBar from "../components/FreshnessBar";
import OpponentCard from "../components/OpponentCard";
import OpponentDetail from "../components/OpponentDetail";
import SyncGate from "../components/SyncGate";
import { useCurrentUsername } from "../hooks/use-current-user";
import { usePowerRankings, type LeaguePowerRanking } from "../hooks/use-power-rankings";
import { useTradeSuggestions, useShopPlayer } from "../hooks/use-trade-finder";
import { useAcquisition } from "../hooks/use-acquisition";
import {
  useOpponentExploits,
  useOpponentProfiles,
  useRefreshOpponentProfiles,
} from "../hooks/use-opponent-profiles";
import { usePortfolio } from "../hooks/use-portfolio";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { classStrengthQueryParams } from "../lib/pick-strengths";
import { buildTradeFinderUrl, parseTradeFinderQuery } from "../lib/trade-finder-url";
import AcquisitionPanel, {
  type AcquisitionSearchResult,
  type SelectedAcquisitionTarget,
} from "./trade-finder/AcquisitionPanel";
import PartnerCard from "./trade-finder/PartnerCard";
import PickInventoryPanel, { type LeaguePicksResponse } from "./trade-finder/PickInventoryPanel";
import ShopPlayerPanel, { type ShopPathFilter } from "./trade-finder/ShopPlayerPanel";
import type { OpponentProfile } from "@shared/types";

function getActivityWeight(level: OpponentProfile["activityLevel"]): number {
  if (level === "hyperactive") return 100;
  if (level === "active") return 80;
  if (level === "moderate") return 50;
  if (level === "passive") return 20;
  return 0;
}

function getTendencyStrength(profile: OpponentProfile): number {
  const acquired = Object.values(profile.positionsAcquired);
  const sold = Object.values(profile.positionsSold);
  const acquiredSpread = acquired.length > 0 ? Math.max(...acquired) - Math.min(...acquired) : 0;
  const soldSpread = sold.length > 0 ? Math.max(...sold) - Math.min(...sold) : 0;
  const ageWeight =
    profile.ageBias === "youth_chaser" || profile.ageBias === "win_now_buyer"
      ? 30
      : profile.ageBias === "leans_young" || profile.ageBias === "leans_vet"
        ? 15
        : 0;
  const pickWeight =
    profile.pickTendency === "hoarder" || profile.pickTendency === "spender"
      ? 20
      : profile.pickTendency === "accumulator" || profile.pickTendency === "seller"
        ? 10
        : 0;
  return Math.min(100, acquiredSpread * 8 + soldSpread * 6 + ageWeight + pickWeight);
}

function getRosterGapScore(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const roster = league?.rosters.find((entry) => entry.roster_id === profile.rosterId);
  const slotGrades = roster?.lineup?.slot_grades ?? [];
  let score = 0;
  for (const grade of slotGrades) {
    if (grade.grade === "hole") score += 22;
    else if (grade.grade === "weak") score += 12;
    else if (grade.grade === "average") score += 4;
  }
  return Math.min(100, score);
}

function getExploitability(profile: OpponentProfile, league: LeaguePowerRanking | undefined): number {
  const activityWeight = getActivityWeight(profile.activityLevel);
  const tendencyStrength = getTendencyStrength(profile);
  const rosterGapScore = getRosterGapScore(profile, league);
  return Math.round(
    activityWeight * 0.4 + tendencyStrength * 0.3 + rosterGapScore * 0.3
  );
}

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
  const scoutProfilesWithScores = (scoutProfilesQuery.data?.profiles ?? [])
    .map((profile) => ({
      profile,
      exploitability: getExploitability(profile, selectedLeagueData),
    }))
    .sort((a, b) => b.exploitability - a.exploitability);
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
        <>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Select League</label>
            {leaguesLoading ? (
              <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}><span className="animate-pulse">Loading leagues...</span></div>
            ) : (
              <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
                <option value="">Choose a league...</option>
                {leagues?.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` · ${league.scoring_label}` : ""})</option>)}
              </select>
            )}
          </div>

          {selectedScoutProfile && (
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                Filtering trade suggestions to <span style={{ color: "var(--amber)", fontWeight: 700 }}>{selectedScoutProfile.displayName}</span> from Scout Opponents.
              </div>
              <button
                type="button"
                onClick={() => setSelectedScoutRosterId(null)}
                style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Clear Filter
              </button>
            </div>
          )}

          {selectedLeague && (
            <PickInventoryPanel
              data={leaguePicksQuery.data}
              isLoading={leaguePicksQuery.isLoading}
            />
          )}

          {!selectedLeague && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a league above to find trade opportunities</div>}
          {selectedLeague && suggestionsLoading && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><div style={{ color: "var(--amber)", fontSize: 14 }}><span className="animate-pulse">Analyzing rosters and building package variants...</span></div></div>}
          {selectedLeague && suggestionsError && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--red)", fontSize: 13 }}>Failed to load trade suggestions. Try again later.</div>}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No strong fits found for this league</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No valid speculative packages survived the quality checks. Try the Trade Calculator for custom scenarios.</p>
              <Link href="/trade-calculator" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "linear-gradient(135deg, var(--amber), var(--amber-dark))", color: "var(--dark-base)", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open Trade Calculator</Link>
            </div>
          )}

          {selectedLeague && !suggestionsLoading && suggestions && suggestions.length > 0 && filteredSuggestions.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No suggested packages for this opponent</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Try clearing the scout filter or open the Trade Calculator for a custom build.</p>
            </div>
          )}

          {selectedLeague && !suggestionsLoading && suggestions && filteredSuggestions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{filteredSuggestions.length} partner{filteredSuggestions.length !== 1 ? "s" : ""} found</span>
              </div>
              {filteredSuggestions.map((suggestion, i) => <PartnerCard key={`${suggestion.partner.roster_id}-${i}`} suggestion={suggestion} />)}
            </div>
          )}
        </>
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
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Select League</label>
                {leaguesLoading ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}><span className="animate-pulse">Loading leagues...</span></div>
                ) : (
                  <select value={selectedLeague} onChange={(e) => setSelectedLeague(e.target.value)} style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}>
                    <option value="">Choose a league...</option>
                    {leagues?.map((league) => <option key={league.league_id} value={league.league_id}>{league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` | ${league.scoring_label}` : ""})</option>)}
                  </select>
                )}
              </div>

              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedLeague) return;
                    refreshProfilesMutation.mutate({ leagueId: selectedLeague, username });
                  }}
                  disabled={!selectedLeague || refreshProfilesMutation.isPending}
                  style={{
                    border: "1px solid rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.14)",
                    color: "var(--amber)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: !selectedLeague || refreshProfilesMutation.isPending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: !selectedLeague ? 0.6 : 1,
                  }}
                >
                  {refreshProfilesMutation.isPending ? "Refreshing..." : "Refresh Profiles"}
                </button>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Last profiled: {formatDateTime(scoutProfilesQuery.data?.lastProfiled ?? null)}
                  </span>
                  {scoutProfilesQuery.data?.isStale && (
                    <span style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800 }}>
                      Stale data
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {scoutRouteWarning && (
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, color: "var(--amber)", fontSize: 12, lineHeight: 1.5 }}>
              {scoutRouteWarning}
            </div>
          )}

          {!selectedLeague && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Select a league above to scout opponent tendencies.
            </div>
          )}

          {selectedLeague && scoutProfilesQuery.isLoading && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
              <span className="animate-pulse" style={{ color: "var(--amber)", fontSize: 14 }}>
                Building opponent profiles...
              </span>
            </div>
          )}

          {selectedLeague && scoutProfilesQuery.error && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "24px 20px", marginTop: 16, color: "var(--red)", fontSize: 13 }}>
              {(scoutProfilesQuery.error as Error).message || "Failed to load opponent profiles."}
            </div>
          )}

          {selectedLeague && !scoutProfilesQuery.isLoading && !scoutProfilesQuery.error && scoutProfilesWithScores.length === 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No opponent profiles are available yet. Refresh profiles to build the first pass from Sleeper history.
            </div>
          )}

          {selectedLeague && scoutProfilesWithScores.length > 0 && (
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {scoutProfilesWithScores.map(({ profile, exploitability }) => (
                  <OpponentCard
                    key={profile.rosterId}
                    profile={profile}
                    exploitability={exploitability}
                    selected={profile.rosterId === selectedScoutRosterId}
                    onExploit={() => openExploitLink(profile.rosterId)}
                  />
                ))}
              </div>

              {selectedScoutProfile && (
                <div ref={scoutDetailRef} tabIndex={-1} style={{ outline: "none" }}>
                  {exploitAnglesQuery.error && (
                    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 12, color: "var(--red)", fontSize: 12, lineHeight: 1.5 }}>
                      {(exploitAnglesQuery.error as Error).message || "Failed to load exploit angles."}
                    </div>
                  )}
                  <OpponentDetail
                    profile={selectedScoutProfile}
                    angles={exploitAnglesQuery.data?.angles ?? []}
                    isLoading={exploitAnglesQuery.isLoading}
                    onFindTrades={() => {
                      setMode("find");
                      setSelectedScoutRosterId(selectedScoutProfile.rosterId);
                    }}
                    onClose={() => {
                      setSelectedScoutRosterId(null);
                      setScoutRouteWarning(null);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}


