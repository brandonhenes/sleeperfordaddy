import type { Dispatch, SetStateAction } from "react";
import { Link } from "wouter";
import type { LeaguePowerRanking, OpponentProfile, TradeSuggestion } from "@shared/types";
import PartnerCard from "./PartnerCard";
import PickInventoryPanel, { type LeaguePicksResponse } from "./PickInventoryPanel";

interface FindTradesPanelProps {
  leagues: LeaguePowerRanking[] | undefined;
  leaguesLoading: boolean;
  selectedLeague: string;
  setSelectedLeague: Dispatch<SetStateAction<string>>;
  selectedScoutProfile: OpponentProfile | null;
  onClearScoutFilter: () => void;
  leaguePicksData: LeaguePicksResponse | undefined;
  leaguePicksLoading: boolean;
  suggestions: TradeSuggestion[] | undefined;
  filteredSuggestions: TradeSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: unknown;
}

export default function FindTradesPanel({
  leagues,
  leaguesLoading,
  selectedLeague,
  setSelectedLeague,
  selectedScoutProfile,
  onClearScoutFilter,
  leaguePicksData,
  leaguePicksLoading,
  suggestions,
  filteredSuggestions,
  suggestionsLoading,
  suggestionsError,
}: FindTradesPanelProps) {
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

      {selectedScoutProfile && (
        <div style={{ background: "rgba(61,139,253,0.1)", border: "1px solid rgba(61,139,253,0.25)", borderRadius: 10, padding: "12px 16px", marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Filtering trade suggestions to <span style={{ color: "var(--amber)", fontWeight: 700 }}>{selectedScoutProfile.displayName}</span> from Scout Opponents.
          </div>
          <button
            type="button"
            onClick={onClearScoutFilter}
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            Clear Filter
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
  );
}
