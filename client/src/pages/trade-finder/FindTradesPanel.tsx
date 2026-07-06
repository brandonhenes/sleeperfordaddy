import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import type {
  LeagueSummary,
  OpponentProfile,
  TradeFinderConstraint,
  TradeFinderSearchDepth,
  TradePartnerTarget,
  TradeSuggestion,
  TradeStrategyType,
} from "@shared/types";
import PartnerCard from "./PartnerCard";
import PickInventoryPanel, { type LeaguePicksResponse } from "./PickInventoryPanel";

interface FindTradesPanelProps {
  username: string;
  leagues: LeagueSummary[] | undefined;
  leaguesLoading: boolean;
  selectedLeague: string;
  setSelectedLeague: (value: string) => void;
  selectedScoutProfile: OpponentProfile | null;
  opponentProfiles: OpponentProfile[];
  opponentProfilesLoading: boolean;
  selectedOpponentRosterId: number | null;
  setSelectedOpponentRosterId: (value: number | null) => void;
  targetPlayerId: string | null;
  setTargetPlayerId: Dispatch<SetStateAction<string | null>>;
  avoidTargetPlayerIds: string[];
  setAvoidTargetPlayerIds: Dispatch<SetStateAction<string[]>>;
  laneConstraints: TradeFinderConstraint[];
  setLaneConstraints: Dispatch<SetStateAction<TradeFinderConstraint[]>>;
  strategyFocus: TradeStrategyType | null;
  setStrategyFocus: Dispatch<SetStateAction<TradeStrategyType | null>>;
  searchDepth: TradeFinderSearchDepth;
  setSearchDepth: Dispatch<SetStateAction<TradeFinderSearchDepth>>;
  partnerTargets: TradePartnerTarget[];
  partnerTargetsLoading: boolean;
  onClearScoutFilter: () => void;
  leaguePicksData: LeaguePicksResponse | undefined;
  leaguePicksLoading: boolean;
  suggestions: TradeSuggestion[] | undefined;
  filteredSuggestions: TradeSuggestion[];
  suggestionsLoading: boolean;
  suggestionsRefreshing: boolean;
  suggestionsError: unknown;
}

export default function FindTradesPanel({
  username,
  leagues,
  leaguesLoading,
  selectedLeague,
  setSelectedLeague,
  selectedScoutProfile,
  opponentProfiles,
  opponentProfilesLoading,
  selectedOpponentRosterId,
  setSelectedOpponentRosterId,
  targetPlayerId,
  setTargetPlayerId,
  avoidTargetPlayerIds,
  setAvoidTargetPlayerIds,
  laneConstraints,
  setLaneConstraints,
  strategyFocus,
  setStrategyFocus,
  searchDepth,
  setSearchDepth,
  partnerTargets,
  partnerTargetsLoading,
  onClearScoutFilter,
  leaguePicksData,
  leaguePicksLoading,
  suggestions,
  filteredSuggestions,
  suggestionsLoading,
  suggestionsRefreshing,
  suggestionsError,
}: FindTradesPanelProps) {
  const hasSteeringControls =
    Boolean(targetPlayerId) ||
    avoidTargetPlayerIds.length > 0 ||
    laneConstraints.length > 0 ||
    Boolean(strategyFocus) ||
    searchDepth === "deep";
  const suggestionPartnerOptions =
    suggestions?.map((suggestion) => ({
      rosterId: suggestion.partner.roster_id,
      displayName: suggestion.partner.display_name,
      meta: suggestion.partner.archetype,
    })) ?? [];
  const partnerOptions = [
    ...opponentProfiles.map((profile) => ({
      rosterId: profile.rosterId,
      displayName: profile.displayName,
      meta: `${profile.activityLevel} · ${profile.totalTrades} trades`,
    })),
    ...suggestionPartnerOptions.filter(
      (partner) => !opponentProfiles.some((profile) => profile.rosterId === partner.rosterId)
    ),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const livePartnerOptionMap = new Map<number, { rosterId: number; displayName: string; meta: string }>();
  for (const partner of partnerOptions) {
    livePartnerOptionMap.set(partner.rosterId, partner);
  }
  for (const suggestion of suggestions ?? []) {
    const existing = livePartnerOptionMap.get(suggestion.partner.roster_id);
    livePartnerOptionMap.set(suggestion.partner.roster_id, {
      rosterId: suggestion.partner.roster_id,
      displayName: suggestion.partner.display_name,
      meta: existing?.meta
        ? `${suggestion.partner.archetype} · ${existing.meta.replace(/Â·/g, "·")}`
        : suggestion.partner.archetype,
    });
  }
  const livePartnerOptions = [...livePartnerOptionMap.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const selectedPartnerLabel =
    filteredSuggestions[0]?.partner.display_name ??
    livePartnerOptions.find((partner) => partner.rosterId === selectedOpponentRosterId)?.displayName ??
    selectedScoutProfile?.displayName ??
    (selectedOpponentRosterId != null ? `Roster ${selectedOpponentRosterId}` : "");

  return (
    <>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
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

      {selectedLeague && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Trade Partner</label>
          <select
            value={selectedOpponentRosterId ?? ""}
            onChange={(e) => setSelectedOpponentRosterId(e.target.value ? Number(e.target.value) : null)}
            style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}
          >
            <option value="">All partners</option>
            {livePartnerOptions.map((partner) => (
              <option key={partner.rosterId} value={partner.rosterId}>
                {partner.displayName}{partner.meta ? ` (${partner.meta})` : ""}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {selectedOpponentRosterId == null
              ? "Searches the best roster-fit partners in this league."
              : "Targets this partner first and builds package shapes around both teams' needs."}
            {opponentProfilesLoading && livePartnerOptions.length === 0 ? " Loading partner profiles..." : ""}
          </div>
        </div>
      )}

      {selectedOpponentRosterId != null && (
        <div style={{ background: "rgba(61,139,253,0.1)", border: "1px solid rgba(61,139,253,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Targeting trade suggestions to <span style={{ color: "var(--amber)", fontWeight: 700 }}>{selectedPartnerLabel}</span>.
            {suggestionsRefreshing ? <span style={{ color: "#93c5fd" }}> Refreshing lanes...</span> : null}
          </div>
          <button
            type="button"
            onClick={onClearScoutFilter}
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Back to All Partners
          </button>
        </div>
      )}

      {selectedLeague && (
        <PickInventoryPanel
          data={leaguePicksData}
          isLoading={leaguePicksLoading}
        />
      )}

      {!selectedLeague && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a league above to find trade opportunities</div>}
      {selectedLeague && suggestionsLoading && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><div style={{ color: "var(--amber)", fontSize: 14 }}><span className="animate-pulse">Analyzing rosters and building package variants...</span></div></div>}
      {selectedLeague && suggestionsError && (!suggestions || suggestions.length === 0) && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--red)", fontSize: 13 }}>Failed to load trade suggestions. Try again later.</div>}
      {selectedLeague && suggestionsError && suggestions && suggestions.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 12px", marginTop: 12, color: "var(--red)", fontSize: 12 }}>
          Could not refresh deeper lanes. Showing the last usable results.
        </div>
      )}

      {selectedLeague && !suggestionsLoading && suggestions && suggestions.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{hasSteeringControls ? "No lanes matched those controls" : selectedOpponentRosterId == null ? "No strong fits found for this league" : "No strong fits found for this partner"}</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{hasSteeringControls ? "Clear the target or steering chips to widen the search." : "No valid speculative packages survived the quality checks. Try another partner or use the Trade Calculator for custom scenarios."}</p>
          {hasSteeringControls && (
            <button
              type="button"
              onClick={() => {
                setTargetPlayerId(null);
                setAvoidTargetPlayerIds([]);
                setLaneConstraints([]);
                setStrategyFocus(null);
                setSearchDepth("quick");
              }}
              style={{ display: "inline-block", marginTop: 12, marginRight: 8, padding: "8px 16px", background: "var(--dark-base)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
            >
              Clear Steering
            </button>
          )}
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
          {filteredSuggestions.map((suggestion, i) => (
            <PartnerCard
              key={`${suggestion.partner.roster_id}-${i}`}
              suggestion={suggestion}
              username={username}
              leagueId={selectedLeague}
              steering={selectedOpponentRosterId === suggestion.partner.roster_id ? {
                targetPlayerId,
                setTargetPlayerId,
                avoidTargetPlayerIds,
                setAvoidTargetPlayerIds,
                laneConstraints,
                setLaneConstraints,
                strategyFocus,
                setStrategyFocus,
                searchDepth,
                setSearchDepth,
                partnerTargets,
                partnerTargetsLoading,
                leagueId: selectedLeague,
                opponentRosterId: selectedOpponentRosterId,
              } : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
