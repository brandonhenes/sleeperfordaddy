import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import type {
  LeagueSummary,
  LeaguePowerRanking,
  OpponentProfile,
  RosterRanking,
  TradeFinderConstraint,
  TradeFinderSearchDepth,
  TradePartnerTarget,
  TradeSuggestion,
  TradeStrategyType,
} from "@shared/types";
import PartnerCard, { shouldShowAsDefaultTradeLane } from "./PartnerCard";
import PickInventoryPanel, { type LeaguePicksResponse } from "./PickInventoryPanel";

const EMPTY_STATE_STRATEGIES: Array<{ value: TradeStrategyType; label: string }> = [
  { value: "consolidation", label: "Consolidate" },
  { value: "tier_down", label: "Tier down" },
  { value: "win_now_buy", label: "Win-now" },
  { value: "productive_struggle", label: "Productive struggle" },
  { value: "pick_arbitrage", label: "Pick arbitrage" },
  { value: "position_arbitrage", label: "Position edge" },
  { value: "roster_spot_arbitrage", label: "Roster spots" },
  { value: "liquidity_upgrade", label: "Liquidity" },
  { value: "market_value", label: "Pure value" },
];
const ROSTER_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

function cleanMetaText(value: string): string {
  return value.replace(/\u00c2\u00b7|\u00b7/g, "-");
}

function rosterWeakSpots(roster: RosterRanking): string {
  const weakSlots = (roster.lineup?.slot_grades ?? [])
    .filter((slot) => slot.grade === "hole" || slot.grade === "weak")
    .map((slot) => slot.slot_label)
    .slice(0, 3);
  return weakSlots.length > 0 ? weakSlots.join(", ") : "No obvious holes";
}

function RosterAssetLine({
  label,
  meta,
  score,
}: {
  label: string;
  meta?: string | null;
  score: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center", padding: "5px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--text)", fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {meta && <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 1 }}>{meta}</div>}
      </div>
      <span style={{ color: score >= 80 ? "var(--green)" : score >= 65 ? "var(--amber)" : "var(--text-muted)", fontSize: 11, fontWeight: 900 }}>{Math.round(score)}</span>
    </div>
  );
}

function RosterSnapshotCard({ label, roster }: { label: string; roster: RosterRanking | null }) {
  if (!roster) {
    return (
      <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
        <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 12 }}>Roster context is still loading.</div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", background: "var(--dark-base)", borderRadius: 10, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>{label}</div>
          <div style={{ marginTop: 3, color: "var(--text)", fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roster.display_name}</div>
        </div>
        <span style={{ color: "var(--amber)", fontSize: 11, fontWeight: 900 }}>{roster.archetype}</span>
      </div>
      <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
        <span style={{ fontWeight: 900 }}>Weak spots:</span> {rosterWeakSpots(roster)}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {ROSTER_POSITIONS.map((position) => {
          const assets = (roster.core_assets ?? [])
            .filter((asset) => asset.position === position)
            .sort((a, b) => b.edge_score - a.edge_score);
          if (assets.length === 0) return null;
          return (
            <div key={position} style={{ minWidth: 0 }}>
              <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 950, letterSpacing: 0.4, marginBottom: 2 }}>{position}</div>
              {assets.map((asset) => (
                <RosterAssetLine
                  key={asset.player_id}
                  label={asset.full_name}
                  meta={asset.age != null ? `Age ${asset.age}` : asset.team}
                  score={asset.edge_score}
                />
              ))}
            </div>
          );
        })}
        {(roster.draft_picks ?? []).length > 0 && (
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 950, letterSpacing: 0.4, marginBottom: 2 }}>PICKS</div>
            {[...(roster.draft_picks ?? [])]
              .sort((a, b) => b.edge_score - a.edge_score)
              .map((pick) => (
                <RosterAssetLine
                  key={`${pick.season}-${pick.round}-${pick.original_owner_id}-${pick.pick_slot ?? pick.tier}`}
                  label={pick.label}
                  meta={`${pick.tier} ${pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : `${pick.round}rd`}`}
                  score={pick.edge_score}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RosterSnapshotPanel({
  selectedLeagueData,
  selectedOpponentRosterId,
}: {
  selectedLeagueData?: LeaguePowerRanking;
  selectedOpponentRosterId: number | null;
}) {
  if (!selectedLeagueData || selectedOpponentRosterId == null) return null;
  const userRoster = selectedLeagueData.rosters.find((roster) => roster.is_user) ?? null;
  const partnerRoster = selectedLeagueData.rosters.find((roster) => roster.roster_id === selectedOpponentRosterId) ?? null;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 900, textTransform: "uppercase" }}>Full rosters</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>Both rosters are here so the lane makes sense before you open Calculator.</div>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 800 }}>
          {selectedLeagueData.league_name}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 10 }}>
        <RosterSnapshotCard label="You" roster={userRoster} />
        <RosterSnapshotCard label="Them" roster={partnerRoster} />
      </div>
    </div>
  );
}

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
  selectedLeagueData?: LeaguePowerRanking;
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
  selectedLeagueData,
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
  ].map((partner) => ({
    ...partner,
    meta: cleanMetaText(partner.meta),
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));

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
  const livePartnerOptions = [...livePartnerOptionMap.values()]
    .map((partner) => ({
      ...partner,
      meta: cleanMetaText(partner.meta),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const selectedPartnerLabel =
    filteredSuggestions[0]?.partner.display_name ??
    livePartnerOptions.find((partner) => partner.rosterId === selectedOpponentRosterId)?.displayName ??
    selectedScoutProfile?.displayName ??
    (selectedOpponentRosterId != null ? `Roster ${selectedOpponentRosterId}` : "");
  const emptyStateTargets = partnerTargets.slice(0, 0);
  const defaultLaneSuggestions = filteredSuggestions
    .map((suggestion) => ({
      ...suggestion,
      packages: suggestion.packages.filter(shouldShowAsDefaultTradeLane),
    }))
    .filter((suggestion) => suggestion.packages.length > 0);
  const fallbackLaneSuggestions = filteredSuggestions
    .map((suggestion) => ({
      ...suggestion,
      packages: suggestion.packages.filter((pkg) => !pkg.is_pick_only),
    }))
    .filter((suggestion) => suggestion.packages.length > 0);
  const showingLowConfidenceFallback =
    !hasSteeringControls &&
    filteredSuggestions.length > 0 &&
    defaultLaneSuggestions.length === 0 &&
    fallbackLaneSuggestions.length > 0;
  const displayedSuggestions = hasSteeringControls
    ? filteredSuggestions
    : defaultLaneSuggestions.length > 0
      ? defaultLaneSuggestions
      : fallbackLaneSuggestions;

  return (
    <>
      <div className={`find-selection-card${selectedOpponentRosterId != null ? " find-selection-card-context" : ""}`} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 8 }}>
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
        <div className={`find-selection-card${selectedOpponentRosterId != null ? " find-selection-card-context" : ""}`} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Trade Partner</label>
          <select
            value={selectedOpponentRosterId ?? ""}
            onChange={(e) => setSelectedOpponentRosterId(e.target.value ? Number(e.target.value) : null)}
            style={{ display: "block", width: "100%", marginTop: 8, padding: "10px 12px", background: "var(--dark-base)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, cursor: "pointer" }}
          >
            <option value="">Choose a partner...</option>
            {livePartnerOptions.map((partner) => (
              <option key={partner.rosterId} value={partner.rosterId}>
                {partner.displayName}{partner.meta ? ` (${cleanMetaText(partner.meta)})` : ""}
              </option>
            ))}
          </select>
          <div className="find-selection-help" style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {selectedOpponentRosterId == null
              ? "Pick one manager to generate 3-5 targeted trade lanes."
              : "Targets this partner first and builds package shapes around both teams' needs."}
            {opponentProfilesLoading && livePartnerOptions.length === 0 ? " Loading partner profiles..." : ""}
          </div>
        </div>
      )}

      {selectedOpponentRosterId != null && (
        <div className="find-target-banner" style={{ background: "rgba(61,139,253,0.1)", border: "1px solid rgba(61,139,253,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Targeting trade suggestions to <span style={{ color: "var(--amber)", fontWeight: 700 }}>{selectedPartnerLabel}</span>.
            {suggestionsRefreshing ? <span style={{ color: "#93c5fd" }}> Refreshing lanes...</span> : null}
          </div>
          <button
            type="button"
            onClick={onClearScoutFilter}
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Change Partner
          </button>
        </div>
      )}

      {selectedLeague && (
        <PickInventoryPanel
          data={leaguePicksData}
          isLoading={leaguePicksLoading}
          collapsed={selectedOpponentRosterId != null}
        />
      )}

      {selectedLeague && selectedOpponentRosterId != null && (
        <RosterSnapshotPanel
          selectedLeagueData={selectedLeagueData}
          selectedOpponentRosterId={selectedOpponentRosterId}
        />
      )}

      {!selectedLeague && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Select a league above to find trade opportunities</div>}
      {selectedLeague && selectedOpponentRosterId == null && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "32px 20px", marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 800 }}>Choose a trade partner</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px auto 0", maxWidth: 520, lineHeight: 1.5 }}>
            Trade Finder works best partner-first: pick a manager, choose a goal, then reassess the lanes if the first batch misses.
          </p>
        </div>
      )}
      {selectedLeague && selectedOpponentRosterId != null && suggestionsLoading && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}><div style={{ color: "var(--amber)", fontSize: 14 }}><span className="animate-pulse">Analyzing this partner and building package variants...</span></div></div>}
      {selectedLeague && selectedOpponentRosterId != null && suggestionsError && (!suggestions || suggestions.length === 0) && <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center", color: "var(--red)", fontSize: 13 }}>Failed to load trade suggestions. Try again later.</div>}
      {selectedLeague && selectedOpponentRosterId != null && suggestionsError && suggestions && suggestions.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 12px", marginTop: 12, color: "var(--red)", fontSize: 12 }}>
          Could not refresh deeper lanes. Showing the last usable results.
        </div>
      )}

      {selectedLeague && selectedOpponentRosterId != null && !suggestionsLoading && suggestions && suggestions.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{hasSteeringControls ? "No lanes matched those controls" : selectedOpponentRosterId == null ? "No strong fits found for this league" : "No strong fits found for this partner"}</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{hasSteeringControls ? "Clear the target or steering controls to widen the search." : "The obvious lanes were filtered out as unrealistic. Try a specific goal, target one of their players, or expand the search."}</p>

          <div style={{ marginTop: 16, border: "1px solid rgba(59,130,246,0.28)", background: "rgba(59,130,246,0.08)", borderRadius: 12, padding: 12, textAlign: "left", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 900, textTransform: "uppercase" }}>Try another angle</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>Keep this partner, but steer the generator.</div>
              </div>
              <button
                type="button"
                onClick={() => setSearchDepth("deep")}
                style={{ border: "1px solid rgba(59,130,246,0.45)", background: searchDepth === "deep" ? "rgba(59,130,246,0.22)" : "var(--dark-base)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
              >
                Expand search
              </button>
            </div>

            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>Goal</span>
              <select
                value={strategyFocus ?? ""}
                onChange={(event) => {
                  setStrategyFocus((event.target.value || null) as TradeStrategyType | null);
                  setSearchDepth("deep");
                }}
                style={{ width: "100%", minHeight: 38, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 800, fontFamily: "inherit" }}
              >
                <option value="">Any trade shape</option>
                {EMPTY_STATE_STRATEGIES.map((strategy) => (
                  <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
                ))}
              </select>
            </label>

            <div>
              <div style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", marginBottom: 6 }}>Target a player</div>
              {partnerTargetsLoading ? (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading their roster...</div>
              ) : partnerTargets.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                  <select
                    value={targetPlayerId ?? ""}
                    onChange={(event) => {
                      setTargetPlayerId(event.target.value || null);
                      setAvoidTargetPlayerIds([]);
                      setSearchDepth("deep");
                    }}
                    style={{ width: "100%", minHeight: 38, border: "1px solid var(--border)", background: "var(--dark-base)", color: "var(--text)", borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 800, fontFamily: "inherit" }}
                  >
                    <option value="">Choose from their roster...</option>
                    {partnerTargets.map((target) => (
                      <option key={target.player_id} value={target.player_id}>
                        {target.full_name} - {target.position} {Math.round(target.edge_score)}{target.age != null ? ` - Age ${target.age}` : ""}{target.tags[0] ? ` - ${target.tags[0]}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSearchDepth("deep")}
                    disabled={!targetPlayerId}
                    style={{ border: "1px solid rgba(59,130,246,0.45)", background: targetPlayerId ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.04)", color: targetPlayerId ? "var(--text)" : "var(--text-muted)", borderRadius: 8, padding: "9px 13px", fontSize: 11, fontWeight: 900, cursor: targetPlayerId ? "pointer" : "not-allowed", fontFamily: "inherit", minHeight: 38 }}
                  >
                    Go
                  </button>
                </div>
              ) : false ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 7 }}>
                  {emptyStateTargets.map((target) => {
                    const active = target.player_id === targetPlayerId;
                    return (
                      <button
                        key={target.player_id}
                        type="button"
                        onClick={() => {
                          setTargetPlayerId(active ? null : target.player_id);
                          setAvoidTargetPlayerIds([]);
                          setSearchDepth("deep");
                        }}
                        style={{ textAlign: "left", border: active ? "1px solid rgba(34,197,94,0.75)" : "1px solid var(--border)", background: active ? "rgba(34,197,94,0.13)" : "rgba(7,8,11,0.55)", color: "var(--text)", borderRadius: 9, padding: 9, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.full_name}</span>
                        <span style={{ display: "block", color: "var(--text-muted)", marginTop: 2 }}>{target.position} {Math.round(target.edge_score)}{target.tags[0] ? ` · ${target.tags[0]}` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>No targetable players loaded for this partner.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setLaneConstraints((current) => current.includes("more_realistic") ? current : [...current, "more_realistic"])}
                style={{ border: "1px solid var(--border)", background: laneConstraints.includes("more_realistic") ? "rgba(34,197,94,0.13)" : "var(--dark-base)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
              >
                Make it realistic
              </button>
              <button
                type="button"
                onClick={() => setLaneConstraints((current) => current.includes("no_picks") ? current : [...current, "no_picks"])}
                style={{ border: "1px solid var(--border)", background: laneConstraints.includes("no_picks") ? "rgba(34,197,94,0.13)" : "var(--dark-base)", color: "var(--text)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
              >
                No picks
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetPlayerId(null);
                  setAvoidTargetPlayerIds([]);
                  setLaneConstraints([]);
                  setStrategyFocus(null);
                  setSearchDepth("quick");
                }}
                style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "7px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
              >
                Clear
              </button>
            </div>
          </div>
          {hasSteeringControls && <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>Current controls are active. Clearing them will return to default lanes.</div>}
          <Link href="/trade-calculator" style={{ display: "inline-block", marginTop: 12, padding: "8px 16px", background: "linear-gradient(135deg, var(--amber), var(--amber-dark))", color: "var(--dark-base)", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open Trade Calculator</Link>
        </div>
      )}

      {selectedLeague && selectedOpponentRosterId != null && !suggestionsLoading && suggestions && suggestions.length > 0 && displayedSuggestions.length === 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "48px 24px", marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>No suggested packages for this opponent</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>Try clearing the scout filter or open the Trade Calculator for a custom build.</p>
        </div>
      )}

      {selectedLeague && selectedOpponentRosterId != null && !suggestionsLoading && suggestions && displayedSuggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {showingLowConfidenceFallback && (
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "10px 12px", marginBottom: 12, color: "var(--amber)", fontSize: 12, lineHeight: 1.45 }}>
              No strong lane survived. Showing low-confidence starting points so you can steer the search instead of starting over.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{displayedSuggestions.length} partner{displayedSuggestions.length !== 1 ? "s" : ""} found</span>
          </div>
          {displayedSuggestions.map((suggestion, i) => (
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
