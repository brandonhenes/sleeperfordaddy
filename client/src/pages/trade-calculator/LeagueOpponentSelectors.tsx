import { useEffect, useRef } from "react";
import type { LeaguePowerRanking } from "@shared/types";
import type { OpponentContext } from "./types";

const ARCHETYPE_COLORS: Record<string, string> = {
  "Dynasty Juggernaut": "#c084fc",
  "All-In Contender": "#f87171",
  "Fragile Contender": "#fb923c",
  Competitor: "#60a5fa",
  "Productive Struggle": "#2dd4bf",
  Rebuilder: "#4ade80",
  "Dead Zone": "#98a2b3",
};

function archetypeColor(archetype: string): string {
  return ARCHETYPE_COLORS[archetype] ?? "#98a2b3";
}

function needsLine(opponent: OpponentContext): string {
  if (opponent.needs.length === 0) return "No clear needs";
  return `Needs ${opponent.needs.slice(0, 3).join(" · ")}`;
}

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
}: LeagueOpponentSelectorsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll only the chip row — scrollIntoView would also drag the document.
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>(".opp-chip.active");
    if (!row || !active) return;
    const delta = active.getBoundingClientRect().left - row.getBoundingClientRect().left;
    const target = row.scrollLeft + delta - (row.clientWidth - active.clientWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [selectedOpponent, opponents.length]);

  return (
    <div className="tc-setup">
      <div>
        <label className="edge-field-label" htmlFor="tc-league">League</label>
        <select
          id="tc-league"
          className="tc-league-select"
          value={selectedLeague}
          onChange={(e) => onSelectedLeagueChange(e.target.value)}
        >
          <option value="">Any player, any pick (no league)</option>
          {leagues.map((league) => (
            <option key={league.league_id} value={league.league_id}>
              {league.league_name} ({league.mode.toUpperCase()}{league.scoring_label ? ` | ${league.scoring_label}` : ""})
            </option>
          ))}
        </select>
      </div>

      {selectedLeague && (
        <div>
          <span className="edge-field-label">
            Trade partner{opponents.length > 0 ? ` · ${opponents.length}` : ""}
          </span>
          {opponents.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "4px 0" }}>
              Loading opponents...
            </div>
          ) : (
            <div className="opp-row" role="listbox" aria-label="Trade partner" ref={rowRef}>
              {opponents.map((opponent) => {
                const active = opponent.roster_id === selectedOpponent;
                const color = archetypeColor(opponent.archetype);
                const initial = (opponent.display_name || "?").charAt(0).toUpperCase();
                return (
                  <button
                    key={opponent.roster_id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`opp-chip${active ? " active" : ""}`}
                    onClick={() => onSelectedOpponentChange(opponent.roster_id)}
                  >
                    <span className="opp-avatar" style={{ background: `${color}33`, color }}>
                      {initial}
                    </span>
                    <span className="opp-name">{opponent.display_name}</span>
                    <span className="opp-meta" style={{ color }}>{opponent.archetype}</span>
                    <span className="opp-needs">{needsLine(opponent)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
