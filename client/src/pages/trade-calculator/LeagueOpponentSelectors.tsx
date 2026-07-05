import type { LeaguePowerRanking } from "@shared/types";
import type { OpponentContext } from "./types";

type LeagueOpponentSelectorsProps = {
  leagues: LeaguePowerRanking[];
  selectedLeague: string;
  onSelectedLeagueChange: (leagueId: string) => void;
  opponents: OpponentContext[];
  selectedOpponent: number | null;
  onSelectedOpponentChange: (rosterId: number | null) => void;
  isCompact: boolean;
};

export default function LeagueOpponentSelectors({
  leagues,
  selectedLeague,
  onSelectedLeagueChange,
  opponents,
  selectedOpponent,
  onSelectedOpponentChange,
  isCompact,
}: LeagueOpponentSelectorsProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 1fr", gap: 10 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>LEAGUE</div>
        <select
          value={selectedLeague}
          onChange={(e) => onSelectedLeagueChange(e.target.value)}
          style={{
            width: "100%",
            background: "var(--dark-base)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
            padding: "8px 10px",
            fontFamily: "inherit",
            fontSize: 13,
          }}
        >
          <option value="">No league selected (vacuum mode)</option>
          {leagues.map((league) => (
            <option key={league.league_id} value={league.league_id}>
              {league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` | ${league.scoring_label}` : ""})
            </option>
          ))}
        </select>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 }}>OPPONENT</div>
        <select
          value={selectedOpponent ?? ""}
          onChange={(e) => onSelectedOpponentChange(e.target.value ? Number(e.target.value) : null)}
          disabled={!selectedLeague || opponents.length === 0}
          style={{
            width: "100%",
            background: "var(--dark-base)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
            padding: "8px 10px",
            fontFamily: "inherit",
            fontSize: 13,
            opacity: !selectedLeague ? 0.6 : 1,
          }}
        >
          <option value="">{selectedLeague ? "Select opponent..." : "Select a league first"}</option>
          {opponents.map((opponent) => (
            <option key={opponent.roster_id} value={opponent.roster_id}>
              {opponent.display_name}{opponent.team_name ? ` (${opponent.team_name})` : ""} | {opponent.archetype}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
